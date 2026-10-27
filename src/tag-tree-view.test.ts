import type { TFile } from 'obsidian';

// eslint-disable-next-line import-x/no-namespace -- Spy on the real library exports without replacing the modules.
import * as explorer from '@mnaoumov/obsidian-lib/file-explorer';
// eslint-disable-next-line import-x/no-namespace -- Spy on the real library exports without replacing the modules.
import * as prompts from '@mnaoumov/obsidian-lib/modals/prompt';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import {
  App,
  Menu
} from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  expect,
  it,
  vi
} from 'vitest';

import { PluginSettings } from './plugin-settings.ts';
import { TagIndex } from './tag-index.ts';
import {
  TAG_TREE_VIEW_TYPE,
  TagTreeView
} from './tag-tree-view.ts';

interface Fixture {
  readonly a: TFile;
  readonly app: App;
  readonly b: TFile;
  readonly child: TFile;
  readonly host: ViewHost;
  readonly index: TagIndex;
  readonly note: TFile;
  readonly settings: PluginSettings;
  readonly showError: ReturnType<typeof vi.fn>;
  readonly view: TagTreeView;
}

interface ViewHost {
  readonly createChild: (tag: TFile) => Promise<void>;
  readonly rename: (tag: TFile) => Promise<void>;
  readonly renderResults: () => void;
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- Tests clear the view's results element to exercise rendering before initialization.
  resultsEl: HTMLElement | null;
  readonly showMenu: (tag: TFile, event: MouseEvent) => void;
  readonly validateName: (name: string) => string | undefined;
}

afterEach(() => {
  vi.restoreAllMocks();
});

function click(element: Element | null): void {
  if (!element) {
    throw new Error('Missing control');
  }
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function fixture(): Fixture {
  const app = App.createConfigured__({ files: { 'note.md': '', 'Tags/A.md': '', 'Tags/B.md': '', 'Tags/Child.md': '' } });
  const settings = new PluginSettings();
  const a = app.vault.getFileByPath('Tags/A.md');
  const b = app.vault.getFileByPath('Tags/B.md');
  const child = app.vault.getFileByPath('Tags/Child.md');
  const note = app.vault.getFileByPath('note.md');
  if (!a || !b || !child || !note) {
    throw new Error('Missing fixture file');
  }
  vi.spyOn(app.metadataCache, 'getFileCache').mockImplementation((file) => {
    const key = file.path === child.path ? 'broader' : 'keywords';
    const links = file.path === child.path ? ['Tags/A', 'Tags/B'] : (file.path === note.path ? ['Tags/A', 'Tags/Child'] : []);
    return { frontmatter: { [key]: links }, frontmatterLinks: links.map((link, index) => ({ key: `${key}.${String(index)}`, link, original: link })) };
  });
  const index = new TagIndex({ app: app.asOriginalType__(), reportCycle: vi.fn(), settings: (): PluginSettings => settings });
  index.rebuild();
  const showError = vi.fn();
  const view = new TagTreeView({ api: index, leaf: app.workspace.getLeaf(false).asOriginalType3__(), settings: (): PluginSettings => settings, showError });
  return { a: a.asOriginalType2__(), app, b: b.asOriginalType2__(), child: child.asOriginalType2__(), host: castTo<ViewHost>(view), index, note: note.asOriginalType2__(), settings, showError, view };
}

it('renders both parents, counts, collapse, ancestor-preserving filter and sort', async () => {
  const f = fixture();
  f.view.refresh();
  await f.view.onOpen();
  const content = f.view.contentEl;
  expect(f.view.getDisplayText()).toBe('Tag Notes');
  expect(f.view.getIcon()).toBe('tags');
  expect(f.view.getViewType()).toBe(TAG_TREE_VIEW_TYPE);
  expect(content.querySelectorAll('.tag-notes-tag')).toHaveLength(4);
  expect(content.querySelector('.tag-notes-counts')?.textContent).toBe('1 / 1');
  click(content.querySelector('.tag-notes-toggle'));
  expect(content.querySelectorAll('.tag-notes-tag')).toHaveLength(3);
  click(content.querySelector('.tag-notes-toggle'));
  expect(content.querySelectorAll('.tag-notes-tag')).toHaveLength(4);
  const filter = content.querySelector('input');
  if (!filter) {
    throw new Error('Missing filter');
  }
  filter.value = 'CHILD';
  filter.dispatchEvent(new Event('input'));
  expect(content.querySelectorAll('.tag-notes-tag')).toHaveLength(4);
  filter.value = 'absent';
  filter.dispatchEvent(new Event('input'));
  expect(content.textContent).toContain('No matching tag notes.');
  filter.value = '';
  filter.dispatchEvent(new Event('input'));
  const sort = content.querySelector('select');
  if (!sort) {
    throw new Error('Missing sort');
  }
  sort.value = 'count';
  sort.dispatchEvent(new Event('change'));
  expect(content.querySelector('.tag-notes-tag')?.textContent).toBe('A');
  await f.view.onOpen();
  expect(content.querySelector('select')?.value).toBe('count');
  sort.value = 'name';
  sort.dispatchEvent(new Event('change'));
});

it('opens tags and listed notes, reports open failures and clears a deleted selection', async () => {
  const f = fixture();
  await f.view.onOpen();
  const leaf = f.app.workspace.getLeaf(false);
  const open = vi.spyOn(leaf, 'openFile').mockResolvedValue();
  click(f.view.contentEl.querySelector('.tag-notes-tag'));
  await vi.waitFor(() => {
    expect(open).toHaveBeenCalledWith(f.a);
  });
  click(f.view.contentEl.querySelector('.tag-notes-list'));
  expect(f.view.contentEl.querySelectorAll('.tag-notes-note')).toHaveLength(1);
  click(f.view.contentEl.querySelector('.tag-notes-note'));
  await vi.waitFor(() => {
    expect(open).toHaveBeenCalledWith(f.note);
  });
  open.mockRejectedValue(new Error('Open failed'));
  click(f.view.contentEl.querySelector('.tag-notes-note'));
  await vi.waitFor(() => {
    expect(f.showError).toHaveBeenCalled();
  });
  const extra = await f.app.vault.create('extra.md', '');
  vi.spyOn(f.index, 'getTaggedNotes').mockReturnValue([f.note, extra.asOriginalType2__()]);
  f.view.refresh();
  expect(f.view.contentEl.querySelector('.tag-notes-note')?.textContent).toBe('extra.md');
  vi.mocked(f.index.getTaggedNotes).mockReturnValue([]);
  f.view.refresh();
  expect(f.view.contentEl.textContent).toContain('No notes tagged with this subtree.');
  vi.spyOn(f.index, 'isTagNote').mockReturnValue(false);
  f.view.refresh();
  expect(f.view.contentEl.querySelector('.tag-notes-results')?.textContent).toBe('');
  f.host.resultsEl = null;
  f.host.renderResults();
});

it('explains an empty index and orders equal names by full path and count', async () => {
  const f = fixture();
  vi.spyOn(f.index, 'getTagNotes').mockReturnValue([]);
  await f.view.onOpen();
  expect(f.view.contentEl.textContent).toContain('No tag notes yet.');
  await f.app.vault.createFolder('Elsewhere');
  const other = await f.app.vault.create('Elsewhere/A.md', '');
  vi.mocked(f.index.getTagNotes).mockReturnValue([other.asOriginalType2__(), f.a, f.b]);
  vi.spyOn(f.index, 'getParents').mockReturnValue([]);
  vi.spyOn(f.index, 'getChildren').mockReturnValue([]);
  vi.spyOn(f.index, 'getCounts').mockImplementation((tag) => ({ direct: 0, withDescendants: tag === f.b ? 2 : 0 }));
  f.view.refresh();
  expect(f.view.contentEl.querySelector('.tag-notes-tag')?.getAttribute('title')).toBe('Elsewhere/A.md');
  const sort = f.view.contentEl.querySelector('select');
  if (!sort) {
    throw new Error('Missing sort');
  }
  sort.value = 'count';
  sort.dispatchEvent(new Event('change'));
  expect(f.view.contentEl.querySelector('.tag-notes-tag')?.textContent).toBe('B');
});

it('creates a child with configured property and link format, cancels safely and rejects invalid names', async () => {
  const f = fixture();
  const prompt = vi.spyOn(prompts, 'prompt').mockResolvedValue(null);
  await f.host.createChild(f.a);
  expect(f.app.vault.getFileByPath('Tags/New.md')).toBeNull();
  prompt.mockResolvedValue(' New ');
  f.settings.tagFolderPath = 'Concepts/Nested';
  f.settings.parentPropertyName = 'up';
  vi.spyOn(f.app.fileManager, 'generateMarkdownLink').mockReturnValue('[A](../../Tags/A.md)');
  const open = vi.spyOn(f.app.workspace.getLeaf(false), 'openFile').mockResolvedValue();
  await f.host.createChild(f.a);
  const created = f.app.vault.getFileByPath('Concepts/Nested/New.md');
  if (!created) {
    throw new Error('Child missing');
  }
  expect(await f.app.vault.read(created)).toContain('"[A](../../Tags/A.md)"');
  expect(await f.app.vault.read(created)).toContain('up:');
  expect(open).toHaveBeenCalled();
  await expect(f.host.createChild(f.a)).rejects.toThrow();
  f.settings.tagFolderPath = '';
  prompt.mockResolvedValue('RootChild');
  await f.host.createChild(f.a);
  expect(f.app.vault.getFileByPath('RootChild.md')).not.toBeNull();
  const validator = prompt.mock.calls[0]?.[0].valueValidator;
  expect(await validator?.('valid')).toBeUndefined();
  expect(await validator?.('')).toBeTruthy();
  expect(f.host.validateName('bad/name')).toBeTruthy();
  expect(f.host.validateName('bad\nname')).toBeTruthy();
});

it('renames through the file manager and preserves files on cancel or unchanged name', async () => {
  const f = fixture();
  const prompt = vi.spyOn(prompts, 'prompt').mockResolvedValue(null);
  const rename = vi.spyOn(f.app.fileManager, 'renameFile').mockResolvedValue();
  await f.host.rename(f.a);
  prompt.mockResolvedValue('A');
  await f.host.rename(f.a);
  expect(rename).not.toHaveBeenCalled();
  prompt.mockResolvedValue(' Renamed ');
  await f.host.rename(f.a);
  expect(rename).toHaveBeenCalledWith(f.a, 'Tags/Renamed.md');
  const root = await f.app.vault.create('Root.md', '');
  await f.host.rename(root.asOriginalType2__());
  expect(rename).toHaveBeenCalledWith(root, 'Renamed.md');
  await f.host.rename(castTo<TFile>({ basename: 'Orphan', parent: null }));
  const validator = prompt.mock.calls[0]?.[0].valueValidator;
  expect(await validator?.('valid')).toBeUndefined();
});

it('offers rename, child creation and reveal from the row context menu', async () => {
  const f = fixture();
  await f.view.onOpen();
  const show = vi.spyOn(Menu.prototype, 'showAtMouseEvent');
  const rename = vi.spyOn(f.host, 'rename').mockResolvedValue();
  const create = vi.spyOn(f.host, 'createChild').mockResolvedValue();
  const reveal = vi.spyOn(explorer, 'revealInFileExplorer').mockResolvedValue();
  f.view.contentEl.querySelector('.tag-notes-tree-row')?.dispatchEvent(new MouseEvent('contextmenu', { cancelable: true }));
  const menu = castTo<Menu>(show.mock.instances[0]);
  expect(menu.menuItems__.map((item) => item.title__)).toEqual(['Rename', 'New child tag', 'Reveal in file explorer']);
  for (const item of menu.menuItems__) {
    item.onClick__?.(new MouseEvent('click'));
  }
  await vi.waitFor(() => {
    expect(reveal).toHaveBeenCalledWith({ abstractFile: f.a, app: f.app });
  });
  expect(rename).toHaveBeenCalledWith(f.a);
  expect(create).toHaveBeenCalledWith(f.a);
});
