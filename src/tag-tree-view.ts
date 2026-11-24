import type {
  TFile,
  WorkspaceLeaf
} from 'obsidian';

import { revealInFileExplorer } from '@mnaoumov/obsidian-lib/file-explorer';
import { setFrontmatter } from '@mnaoumov/obsidian-lib/frontmatter';
import { prompt } from '@mnaoumov/obsidian-lib/modals/prompt';
import { createFolderSafe } from '@mnaoumov/obsidian-lib/vault';
import { invokeAsyncSafely } from '@mnaoumov/typescript-lib/async';
import { noopAsync } from '@mnaoumov/typescript-lib/function';
import {
  ExtraButtonComponent,
  ItemView,
  Menu,
  normalizePath,
  Platform
} from 'obsidian';

import type { TagNotesApi } from '../api.d.ts';
import type { PluginSettings } from './plugin-settings.ts';

import { moveTag } from './tag-tree-drop.ts';

export const TAG_TREE_VIEW_TYPE = 'tag-notes-tree';
const CONTROL_CHARACTER = /\p{Cc}/u;

interface PendingBranch {
  readonly container: HTMLElement;
  readonly level: readonly TFile[];
  readonly parent: null | TFile;
  readonly tag: TFile;
}

interface TagDrag {
  readonly fromParent: null | TFile;
  readonly tag: TFile;
}

interface TagTreeViewConstructorParams {
  readonly api: TagNotesApi;
  readonly leaf: WorkspaceLeaf;
  readonly settings: () => PluginSettings;
  readonly showError: (error: unknown) => void;
  readonly showNotice: (message: string) => void;
}

export class TagTreeView extends ItemView {
  private readonly api: TagNotesApi;
  private readonly collapsed = new Set<TFile>();
  private drag: null | TagDrag = null;
  private dropTargetEl: HTMLElement | null = null;
  private filter = '';
  private resultsEl: HTMLElement | null = null;
  private selectedTag: null | TFile = null;
  private readonly settings: () => PluginSettings;
  private readonly showError: (error: unknown) => void;
  private readonly showNotice: (message: string) => void;
  private sortByCount = false;
  private treeEl: HTMLElement | null = null;

  public constructor(params: TagTreeViewConstructorParams) {
    super(params.leaf);
    this.api = params.api;
    this.settings = params.settings;
    this.showError = params.showError;
    this.showNotice = params.showNotice;
  }

  public override getDisplayText(): string {
    return 'Tag Notes';
  }

  public override getIcon(): string {
    return 'tags';
  }

  public override getViewType(): string {
    return TAG_TREE_VIEW_TYPE;
  }

  public override onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('tag-notes-view');
    const controls = this.contentEl.createDiv({ cls: 'tag-notes-controls' });
    const filter = controls.createEl('input', { attr: { 'aria-label': 'Filter Tag Notes', 'placeholder': 'Filter Tag Notes', 'type': 'search' } });
    filter.value = this.filter;
    this.registerDomEvent(filter, 'input', () => {
      this.filter = filter.value.trim().toLocaleLowerCase();
      this.refresh();
    });
    const sort = controls.createEl('select', { attr: { 'aria-label': 'Sort Tag Notes' } });
    sort.createEl('option', { text: 'Name', value: 'name' });
    sort.createEl('option', { text: 'Subtree count', value: 'count' });
    sort.value = this.sortByCount ? 'count' : 'name';
    this.registerDomEvent(sort, 'change', () => {
      this.sortByCount = sort.value === 'count';
      this.refresh();
    });
    new ExtraButtonComponent(controls).setIcon('chevrons-down-up').setTooltip('Collapse all').onClick(() => {
      this.setCollapsed(this.api.getTagNotes(), true);
    });
    new ExtraButtonComponent(controls).setIcon('chevrons-up-down').setTooltip('Expand all').onClick(() => {
      this.setCollapsed(this.api.getTagNotes(), false);
    });
    this.contentEl.createEl('p', { cls: 'tag-notes-legend', text: 'Counts: direct / including descendants' });
    const tree = this.contentEl.createDiv({ cls: 'tag-notes-tree' });
    this.treeEl = tree;
    // Rows stop propagation, so these see only drops on empty tree space: they make the dragged tag a root.
    this.registerDomEvent(tree, 'dragover', ($event) => {
      this.dragOver($event, tree);
    });
    this.registerDomEvent(tree, 'dragleave', ($event) => {
      if ($event.target === tree) {
        this.setDropTarget(null);
      }
    });
    this.registerDomEvent(tree, 'drop', ($event) => {
      this.dropOn(null, $event);
    });
    this.resultsEl = this.contentEl.createDiv({ cls: 'tag-notes-results' });
    this.refresh();
    return noopAsync();
  }

  public refresh(): void {
    const tree = this.treeEl;
    if (!tree || !this.resultsEl) {
      return;
    }
    tree.empty();
    const tags = this.api.getTagNotes();
    const visible = new Set<TFile>();
    for (const tag of tags) {
      if (!tag.path.toLocaleLowerCase().includes(this.filter)) {
        continue;
      }

      visible.add(tag);
      for (const ancestor of this.api.getAncestors(tag)) {
        visible.add(ancestor);
      }
    }
    const roots = tags.filter((tag) => this.api.getParents(tag).length === 0);
    // Iterative rendering supports deep hierarchies without using the JS call stack.
    const sortedRoots = this.sortTags(roots);
    const pending: PendingBranch[] = [...sortedRoots].reverse().map((tag) => ({ container: tree, level: sortedRoots, parent: null, tag }));
    for (let entry = pending.pop(); entry; entry = pending.pop()) {
      if (!visible.has(entry.tag)) {
        continue;
      }
      const children = this.sortTags(this.api.getChildren(entry.tag));
      const branch = entry.container.createDiv({ cls: 'tag-notes-branch' });
      const row = branch.createDiv({ cls: 'tag-notes-tree-row' });
      const isExpanded = this.filter !== '' || !this.collapsed.has(entry.tag);
      const { level, tag } = entry;
      if (children.length > 0) {
        const toggle = row.createEl('button', { attr: { 'aria-expanded': String(isExpanded), 'aria-label': `Toggle ${tag.basename}` }, cls: 'tag-notes-toggle', text: isExpanded ? '▾' : '▸' });
        toggle.addEventListener('click', (): void => {
          if (this.collapsed.has(tag)) {
            this.collapsed.delete(tag);
          } else {
            this.collapsed.add(tag);
          }
          this.refresh();
        });
      }
      const open = row.createEl('button', { attr: { title: tag.path }, cls: 'tag-notes-tag', text: tag.basename });
      open.addEventListener('click', (): void => {
        this.run(() => this.app.workspace.getLeaf(false).openFile(tag));
      });
      const counts = this.api.getCounts(tag);
      row.createSpan({ cls: 'tag-notes-counts', text: `${String(counts.direct)} / ${String(counts.withDescendants)}` });
      const list = row.createEl('button', { attr: { 'aria-label': `List notes tagged ${tag.basename} or descendants` }, cls: 'tag-notes-list', text: 'List notes' });
      list.addEventListener('click', (): void => {
        this.selectedTag = tag;
        this.renderResults();
      });
      row.addEventListener('contextmenu', ($event): void => {
        $event.preventDefault();
        this.showMenu(tag, level, $event);
      });
      this.registerDrag(row, { fromParent: entry.parent, tag });
      if (!isExpanded) {
        continue;
      }
      const container = branch.createDiv({ cls: 'tag-notes-children' });
      pending.push(...[...children].reverse().map((child) => ({ container, level: children, parent: tag, tag: child })));
    }
    if (!tree.childElementCount) {
      tree.createEl('p', { text: tags.length > 0 ? 'No matching tag notes.' : 'No tag notes yet. Link a note from your tags property or add a note to the tag folder.' });
    }
    this.renderResults();
  }

  private async createChild(parent: TFile): Promise<void> {
    const name = await prompt({ app: this.app, title: 'New child tag', valueValidator: (value) => this.validateName(value) });
    if (name === null) {
      return;
    }
    const folder = normalizePath(this.settings().tagFolderPath);
    if (folder !== '/') {
      await createFolderSafe(this.app, folder);
    }
    const path = normalizePath(`${folder}/${name.trim()}.md`);
    const link = this.app.fileManager.generateMarkdownLink(parent, path);
    const file = await this.app.vault.create(path, setFrontmatter('', { [this.settings().parentPropertyName]: [link] }));
    await this.app.workspace.getLeaf(false).openFile(file);
  }

  private dragOver($event: DragEvent, element: HTMLElement): void {
    if (!this.drag) {
      return;
    }
    $event.preventDefault();
    $event.stopPropagation();
    if ($event.dataTransfer) {
      $event.dataTransfer.dropEffect = isAddParentEvent($event) ? 'copy' : 'move';
    }
    this.setDropTarget(element);
  }

  private dropOn(target: null | TFile, $event: DragEvent): void {
    const drag = this.drag;
    this.drag = null;
    this.setDropTarget(null);
    if (!drag) {
      return;
    }
    $event.preventDefault();
    $event.stopPropagation();
    if (target) {
      this.collapsed.delete(target);
    }
    this.run(async () => {
      const refusal = await moveTag({
        api: this.api,
        app: this.app,
        fromParent: drag.fromParent,
        parentPropertyName: this.settings().parentPropertyName,
        shouldAddParent: isAddParentEvent($event),
        tag: drag.tag,
        target
      });
      if (refusal !== null) {
        this.showNotice(refusal);
      }
    });
  }

  private registerDrag(row: HTMLElement, drag: TagDrag): void {
    row.draggable = true;
    row.addEventListener('dragstart', ($event): void => {
      this.drag = drag;
      row.addClass('is-dragging');
      if (!$event.dataTransfer) {
        return;
      }

      $event.dataTransfer.effectAllowed = 'copyMove';
      $event.dataTransfer.setData('text/plain', drag.tag.path);
    });
    row.addEventListener('dragend', (): void => {
      this.drag = null;
      row.removeClass('is-dragging');
      this.setDropTarget(null);
    });
    row.addEventListener('dragover', ($event): void => {
      this.dragOver($event, row);
    });
    row.addEventListener('drop', ($event): void => {
      this.dropOn(drag.tag, $event);
    });
  }

  private async rename(tag: TFile): Promise<void> {
    const name = await prompt({ app: this.app, defaultValue: tag.basename, title: 'Rename tag note', valueValidator: (value) => this.validateName(value) });
    if (name === null || name.trim() === tag.basename) {
      return;
    }
    await this.app.fileManager.renameFile(tag, normalizePath(`${tag.parent?.path ?? ''}/${name.trim()}.md`));
  }

  private renderResults(): void {
    if (!this.resultsEl) {
      return;
    }
    this.resultsEl.empty();
    const tag = this.selectedTag;
    if (!tag) {
      return;
    }
    if (!this.api.isTagNote(tag)) {
      this.selectedTag = null;
      return;
    }
    this.resultsEl.createEl('h3', { text: `Notes tagged ${tag.basename} or descendants` });
    const notes = this.api.getTaggedNotes(tag, { includeDescendants: true }).sort((a, b) => a.path.localeCompare(b.path));
    if (notes.length === 0) {
      this.resultsEl.createEl('p', { text: 'No notes tagged with this subtree.' });
    }
    for (const note of notes) {
      const button = this.resultsEl.createEl('button', { cls: 'tag-notes-note', text: note.path });
      button.addEventListener('click', (): void => {
        this.run(() => this.app.workspace.getLeaf(false).openFile(note));
      });
    }
  }

  private run(action: () => Promise<void>): void {
    invokeAsyncSafely(() => action().catch(this.showError));
  }

  /**
   * Collapses or expands every given tag that has children; a collapsed tag stays collapsed under each of its parents.
   *
   * The per-level form is adapted from the "Collapse/Expand tags at this level" Tags-pane menu of `Tag Wrangler`
   * (https://github.com/pjeby/tag-wrangler), `src/plugin.js`. Copyright 2021 PJ Eby. ISC License: permission to use,
   * copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that
   * the above copyright notice and this permission notice appear in all copies.
   */
  private setCollapsed(tags: readonly TFile[], isCollapsed: boolean): void {
    for (const tag of tags) {
      if (!isCollapsed) {
        this.collapsed.delete(tag);
      } else if (this.api.getChildren(tag).length > 0) {
        this.collapsed.add(tag);
      }
    }
    this.refresh();
  }

  private setDropTarget(element: HTMLElement | null): void {
    if (this.dropTargetEl === element) {
      return;
    }
    this.dropTargetEl?.removeClass('is-drop-target');
    this.dropTargetEl = element;
    element?.addClass('is-drop-target');
  }

  private showMenu(tag: TFile, level: readonly TFile[], $event: MouseEvent): void {
    const menu = new Menu();
    menu.addItem((item) =>
      item.setTitle('Rename').setIcon('pencil').onClick(() => {
        this.run(() => this.rename(tag));
      })
    );
    menu.addItem((item) =>
      item.setTitle('New child tag').setIcon('plus').onClick(() => {
        this.run(() => this.createChild(tag));
      })
    );
    menu.addItem((item) =>
      item.setTitle('Reveal in file explorer').setIcon('folder').onClick(() => {
        this.run(() => revealInFileExplorer({ abstractFile: tag, app: this.app }));
      })
    );
    if (level.some((sibling) => this.api.getChildren(sibling).length > 0)) {
      menu.addSeparator();
      menu.addItem((item) =>
        item.setTitle('Collapse tags at this level').setIcon('chevrons-down-up').onClick(() => {
          this.setCollapsed(level, true);
        })
      );
      menu.addItem((item) =>
        item.setTitle('Expand tags at this level').setIcon('chevrons-up-down').onClick(() => {
          this.setCollapsed(level, false);
        })
      );
    }
    menu.showAtMouseEvent($event);
  }

  private sortTags(tags: TFile[]): TFile[] {
    return tags.sort((a, b) => (this.sortByCount ? this.api.getCounts(b).withDescendants - this.api.getCounts(a).withDescendants : 0) || a.basename.localeCompare(b.basename) || a.path.localeCompare(b.path));
  }

  private validateName(value: string): null | string {
    return !value.trim() || /[\\/:*?"<>|]/u.test(value) || CONTROL_CHARACTER.test(value) ? 'Enter a note name without path separators or reserved filename characters.' : null;
  }
}

/**
 * Ctrl, or Cmd on macOS, held while dropping adds the target as another parent instead of moving.
 *
 * @param $event - The drag event.
 * @returns Whether the drop adds a parent.
 */
function isAddParentEvent($event: DragEvent): boolean {
  return Platform.isMacOS ? $event.metaKey : $event.ctrlKey;
}
