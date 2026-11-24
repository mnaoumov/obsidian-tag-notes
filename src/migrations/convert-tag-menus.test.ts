import type {
  CachedMetadata,
  WorkspaceLeaf
} from 'obsidian';

import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import {
  App,
  Editor,
  Menu
} from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  expect,
  it,
  vi
} from 'vitest';

import {
  ConvertTagMenusComponent,
  getTagAtCursor,
  TAG_PANE_VIEW_TYPE,
  TAG_WRANGLER_MENU_EVENT
} from './convert-tag-menus.ts';

interface Fixture {
  readonly app: App;
  readonly component: ConvertTagMenusComponent;
  readonly editor: Editor;
  readonly openConversion: ReturnType<typeof vi.fn>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

const CONTENT = 'Text #alpha/bravo and `#code`';

function setup(): Fixture {
  const app = App.createConfigured__({ files: { 'source.md': CONTENT } });
  vi.spyOn(app.metadataCache, 'getFileCache').mockReturnValue(tagCache('#alpha/bravo', 5));
  const editor = new class extends Editor {}();
  editor.setValue(CONTENT);
  const openConversion = vi.fn();
  const component = new ConvertTagMenusComponent({ app: app.asOriginalType__(), openConversion });
  component.load();
  return { app, component, editor, openConversion };
}

function tagCache(tag: string, offset: number): CachedMetadata {
  return { tags: [{ position: { end: { col: offset + tag.length, line: 0, offset: offset + tag.length }, start: { col: offset, line: 0, offset } }, tag }] };
}

function titles(menu: Menu): string[] {
  return menu.menuItems__.map((item) => (typeof item.title__ === 'string' ? item.title__ : item.title__.textContent));
}

it('reads the cached tag under the caret, and nothing where the cache disagrees with the editor', () => {
  const { app, editor } = setup();
  const file = app.vault.getFileByPath('source.md');
  if (!file) {
    throw new Error('Missing source');
  }
  editor.setCursor({ ch: 8, line: 0 });
  expect(getTagAtCursor(app.asOriginalType__(), editor.asOriginalType__(), file.asOriginalType2__())).toBe('alpha/bravo');
  editor.setCursor({ ch: 2, line: 0 });
  expect(getTagAtCursor(app.asOriginalType__(), editor.asOriginalType__(), file.asOriginalType2__())).toBeNull();
  editor.setValue('Text #delta/bravo');
  editor.setCursor({ ch: 8, line: 0 });
  expect(getTagAtCursor(app.asOriginalType__(), editor.asOriginalType__(), file.asOriginalType2__())).toBeNull();
  vi.mocked(app.metadataCache.getFileCache).mockReturnValue(null);
  expect(getTagAtCursor(app.asOriginalType__(), editor.asOriginalType__(), file.asOriginalType2__())).toBeNull();
});

it('adds one convert item to the editor menu on a tag, and none off a tag or without a file', () => {
  const { app, component, editor, openConversion } = setup();
  const file = app.vault.getFileByPath('source.md');
  editor.setCursor({ ch: 8, line: 0 });
  const menu = Menu.create2__();
  app.workspace.trigger('editor-menu', menu.asOriginalType2__(), editor.asOriginalType__(), { file: file?.asOriginalType2__() });
  app.workspace.trigger('editor-menu', menu.asOriginalType2__(), editor.asOriginalType__(), { file: file?.asOriginalType2__() });
  expect(titles(menu)).toEqual(['Convert #alpha/bravo to tag note']);
  menu.menuItems__[0]?.onClick__?.(new MouseEvent('click'));
  expect(openConversion).toHaveBeenCalledWith('alpha/bravo');
  const withoutFile = Menu.create2__();
  app.workspace.trigger('editor-menu', withoutFile.asOriginalType2__(), editor.asOriginalType__(), { file: null });
  editor.setCursor({ ch: 1, line: 0 });
  app.workspace.trigger('editor-menu', withoutFile.asOriginalType2__(), editor.asOriginalType__(), { file: file?.asOriginalType2__() });
  expect(titles(withoutFile)).toEqual([]);
  component.unload();
});

it('adds the item to the menu Tag Wrangler builds, ignoring a malformed event or an empty tag', () => {
  const { app, component } = setup();
  const menu = Menu.create2__();
  app.workspace.trigger(TAG_WRANGLER_MENU_EVENT, menu.asOriginalType2__(), '#status/done');
  app.workspace.trigger(TAG_WRANGLER_MENU_EVENT, {}, 'status');
  app.workspace.trigger(TAG_WRANGLER_MENU_EVENT, menu.asOriginalType2__(), 12);
  expect(titles(menu)).toEqual(['Convert #status/done to tag note']);
  const empty = Menu.create2__();
  app.workspace.trigger(TAG_WRANGLER_MENU_EVENT, empty.asOriginalType2__(), '#');
  expect(titles(empty)).toEqual([]);
  component.unload();
});

it('opens its own menu on a core Tags pane row, unless Tag Wrangler built one for the same click', async () => {
  const { app, component, openConversion } = setup();
  const containerEl = createDiv();
  const rowEl = containerEl.createDiv();
  const textEl = rowEl.createSpan({ text: 'Bravo' });
  const otherEl = containerEl.createDiv();
  const view = { containerEl, tagDoms: { '#alpha/bravo': { selfEl: rowEl, tag: '#alpha/bravo' } } };
  const untypedPaneEl = createDiv();
  const leaves = [castTo<WorkspaceLeaf>({ view }), castTo<WorkspaceLeaf>({ view: { containerEl: untypedPaneEl } })];
  vi.spyOn(app.workspace, 'getLeavesOfType').mockImplementation((type) => (type === TAG_PANE_VIEW_TYPE ? castTo(leaves) : []));
  app.workspace.setLayoutReady__();
  app.workspace.trigger('layout-change');
  const show = vi.spyOn(Menu.prototype, 'showAtMouseEvent');

  const $event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  textEl.dispatchEvent($event);
  expect($event.defaultPrevented).toBe(true);
  await vi.waitFor(() => {
    expect(show).toHaveBeenCalledOnce();
  });
  const menu = show.mock.contexts[0];
  if (!(menu instanceof Menu)) {
    throw new TypeError('Missing menu');
  }
  expect(titles(menu)).toEqual(['Convert #alpha/bravo to tag note']);
  menu.menuItems__[0]?.onClick__?.(new MouseEvent('click'));
  expect(openConversion).toHaveBeenCalledWith('alpha/bravo');

  textEl.addEventListener('contextmenu', () => {
    app.workspace.trigger(TAG_WRANGLER_MENU_EVENT, Menu.create2__().asOriginalType2__(), 'alpha/bravo');
  }, { once: true });
  textEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  const offRow = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  otherEl.dispatchEvent(offRow);
  untypedPaneEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => {
    window.setTimeout(resolve, 10);
  });
  expect(show).toHaveBeenCalledOnce();
  expect(offRow.defaultPrevented).toBe(false);

  containerEl.addEventListener('contextmenu', () => {
    app.workspace.trigger(TAG_WRANGLER_MENU_EVENT, Menu.create2__().asOriginalType2__(), 'alpha/bravo');
  }, { once: true });
  textEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => {
    window.setTimeout(resolve, 10);
  });
  expect(show).toHaveBeenCalledOnce();
  component.unload();
});
