/**
 * @file
 *
 * The `Convert #tag to tag note` item on a tag's context menu: in the editor, in the core Tags pane, and in the
 * menu `Tag Wrangler` builds for either.
 *
 * Adapted from the Promote item of `Unified Tag Links` (https://github.com/theboyroy05/Obsidian-Unified-Tag-Links),
 * `src/main.ts` (`addPromoteItem`, its `editor-menu` and `tag-wrangler:contextmenu` handlers). Copyright (c) 2026
 * Issac Roy. MIT License: Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software without restriction,
 * including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following
 * conditions: The above copyright notice and this permission notice shall be included in all copies or substantial
 * portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * Unlike the source, the editor item reads the tag from the metadata cache rather than a regular expression, so a
 * `#` inside code or a link is never offered, and the core Tags pane gets the item without `Tag Wrangler`.
 */

import type {
  App,
  Editor,
  TFile,
  View
} from 'obsidian';

import { ComponentEx } from '@mnaoumov/obsidian-lib/components/component-ex';
import { Menu } from 'obsidian';

/**
 * The core Tags pane's view type.
 */
export const TAG_PANE_VIEW_TYPE = 'tag';

/**
 * The event `Tag Wrangler` triggers on the workspace with the menu it builds for a tag.
 */
export const TAG_WRANGLER_MENU_EVENT = 'tag-wrangler:contextmenu';

declare module 'obsidian' {
  interface Workspace {
    /**
     * `Tag Wrangler` triggers this with the menu it builds for a tag in the Tags pane or a note.
     *
     * @param name - The event name.
     * @param callback - Receives the menu and the tag, without its `#`.
     * @param context - The callback's `this`.
     * @returns The event reference.
     */
    // eslint-disable-next-line @typescript-eslint/method-signature-style -- An overload merged into Obsidian's own `on` method overloads must be a method too.
    on(name: typeof TAG_WRANGLER_MENU_EVENT, callback: (menu: unknown, tag: unknown) => unknown, context?: unknown): EventRef;
  }
}

interface ConvertTagMenusComponentConstructorParams {
  readonly app: App;
  readonly openConversion: (tag: string) => void;
}

/**
 * The part of a core Tags pane row read here (`TagTreeItem` in `obsidian-typings`).
 */
interface TagPaneRow {
  readonly selfEl: HTMLElement;
  /**
   * The full tag, with its `#`.
   */
  readonly tag: string;
}

/**
 * The part of the core Tags pane view read here (`TagView` in `obsidian-typings`).
 */
interface TagPaneView extends View {
  readonly tagDoms?: Record<string, TagPaneRow>;
}

export class ConvertTagMenusComponent extends ComponentEx {
  private readonly app: App;
  private isTagWranglerMenuFresh = false;
  private readonly menusWithItem = new WeakSet<Menu>();
  private readonly openConversion: (tag: string) => void;
  private readonly tagPaneElements = new WeakSet<HTMLElement>();
  private tagWranglerMenuCount = 0;

  public constructor(params: ConvertTagMenusComponentConstructorParams) {
    super();
    this.app = params.app;
    this.openConversion = params.openConversion;
  }

  public override onload(): void {
    this.registerEvent(this.app.workspace.on('editor-menu', (menu, editor, info) => {
      const tag = info.file ? getTagAtCursor(this.app, editor, info.file) : null;
      if (tag) {
        this.addItem(menu, tag);
      }
    }));
    this.registerEvent(this.app.workspace.on(TAG_WRANGLER_MENU_EVENT, (menu: unknown, tag: unknown) => {
      this.tagWranglerMenuCount++;
      // Fresh until the current event dispatch ends, so a Tags pane listener running after this one sees it.
      this.isTagWranglerMenuFresh = true;
      window.setTimeout(() => {
        this.isTagWranglerMenuFresh = false;
      }, 0);
      if (menu instanceof Menu && typeof tag === 'string') {
        this.addItem(menu, tag);
      }
    }));
    this.app.workspace.onLayoutReady(() => {
      this.watchTagPanes();
    });
    this.registerEvent(this.app.workspace.on('layout-change', () => {
      this.watchTagPanes();
    }));
  }

  private addItem(menu: Menu, tag: string): void {
    const name = tag.replace(/^#/u, '');
    if (!name || this.menusWithItem.has(menu)) {
      return;
    }
    this.menusWithItem.add(menu);
    menu.addItem((item) =>
      item
        .setTitle(`Convert #${name} to tag note`)
        .setIcon('arrow-up-circle')
        .onClick(() => {
          this.openConversion(name);
        })
    );
  }

  private onTagPaneMenu($event: MouseEvent, view: TagPaneView): void {
    const target = $event.targetNode;
    const row = Object.values(view.tagDoms ?? {}).find((entry) => target !== null && entry.selfEl.contains(target));
    // `Tag Wrangler` builds its menu from a listener of the same event, before or after this one; when it did, the
    // Item goes into that menu instead.
    if (!row || this.isTagWranglerMenuFresh) {
      return;
    }
    $event.preventDefault();
    const countBefore = this.tagWranglerMenuCount;
    $event.win.setTimeout(() => {
      if (this.tagWranglerMenuCount !== countBefore) {
        return;
      }
      const menu = new Menu();
      this.addItem(menu, row.tag);
      menu.showAtMouseEvent($event);
    }, 0);
  }

  private watchTagPanes(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(TAG_PANE_VIEW_TYPE)) {
      const view = leaf.view as TagPaneView;
      if (this.tagPaneElements.has(view.containerEl)) {
        continue;
      }
      this.tagPaneElements.add(view.containerEl);
      this.registerDomEvent(view.containerEl, 'contextmenu', ($event) => {
        this.onTagPaneMenu($event, view);
      });
    }
  }
}

/**
 * The tag under the editor's caret, read from the metadata cache.
 *
 * @param app - The Obsidian app.
 * @param editor - The editor the menu was opened in.
 * @param file - The editor's file.
 * @returns The tag without its `#`, or `null` when the caret is not on a tag the cache still agrees with.
 */
export function getTagAtCursor(app: App, editor: Editor, file: TFile): null | string {
  const offset = editor.posToOffset(editor.getCursor());
  for (const tag of app.metadataCache.getFileCache(file)?.tags ?? []) {
    const { end, start } = tag.position;
    if (start.offset <= offset && offset <= end.offset && editor.getRange(editor.offsetToPos(start.offset), editor.offsetToPos(end.offset)) === tag.tag) {
      return tag.tag.slice(1);
    }
  }
  return null;
}
