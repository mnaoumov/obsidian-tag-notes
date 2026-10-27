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
  ItemView,
  Menu,
  normalizePath
} from 'obsidian';

import type { TagNotesApi } from '../api.d.ts';
import type { PluginSettings } from './plugin-settings.ts';

export const TAG_TREE_VIEW_TYPE = 'tag-notes-tree';
const CONTROL_CHARACTER = /\p{Cc}/u;

interface TagTreeViewConstructorParams {
  readonly api: TagNotesApi;
  readonly leaf: WorkspaceLeaf;
  readonly settings: () => PluginSettings;
  readonly showError: (error: unknown) => void;
}

export class TagTreeView extends ItemView {
  private readonly api: TagNotesApi;
  private readonly collapsed = new Set<TFile>();
  private filter = '';
  private resultsEl: HTMLElement | null = null;
  private selectedTag: null | TFile = null;
  private readonly settings: () => PluginSettings;
  private readonly showError: (error: unknown) => void;
  private sortByCount = false;
  private treeEl: HTMLElement | null = null;

  public constructor(params: TagTreeViewConstructorParams) {
    super(params.leaf);
    this.api = params.api;
    this.settings = params.settings;
    this.showError = params.showError;
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
    this.contentEl.createEl('p', { cls: 'tag-notes-legend', text: 'Counts: direct / including descendants' });
    this.treeEl = this.contentEl.createDiv({ cls: 'tag-notes-tree' });
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
    const pending = this.sortTags(roots).reverse().map((tag) => ({ container: tree, tag }));
    for (let entry = pending.pop(); entry; entry = pending.pop()) {
      if (!visible.has(entry.tag)) {
        continue;
      }
      const children = this.sortTags(this.api.getChildren(entry.tag));
      const branch = entry.container.createDiv({ cls: 'tag-notes-branch' });
      const row = branch.createDiv({ cls: 'tag-notes-tree-row' });
      const isExpanded = this.filter !== '' || !this.collapsed.has(entry.tag);
      const tag = entry.tag;
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
      row.addEventListener('contextmenu', (event): void => {
        event.preventDefault();
        this.showMenu(tag, event);
      });
      if (!isExpanded) {
        continue;
      }
      const container = branch.createDiv({ cls: 'tag-notes-children' });
      pending.push(...children.reverse().map((child) => ({ container, tag: child })));
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

  private showMenu(tag: TFile, event: MouseEvent): void {
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
    menu.showAtMouseEvent(event);
  }

  private sortTags(tags: TFile[]): TFile[] {
    return tags.sort((a, b) => (this.sortByCount ? this.api.getCounts(b).withDescendants - this.api.getCounts(a).withDescendants : 0) || a.basename.localeCompare(b.basename) || a.path.localeCompare(b.path));
  }

  private validateName(value: string): string | undefined {
    return !value.trim() || /[\\/:*?"<>|]/u.test(value) || CONTROL_CHARACTER.test(value) ? 'Enter a note name without path separators or reserved filename characters.' : undefined;
  }
}
