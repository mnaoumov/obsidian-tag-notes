import { App } from 'obsidian-test-mocks/obsidian';
import {
  expect,
  it,
  vi
} from 'vitest';

import { PluginSettings } from '../plugin-settings.ts';
import { TagIndex } from '../tag-index.ts';
import { TagNotesBlock } from './tag-notes-block.ts';

it('renders direct and descendant results as safe internal links and refreshes empty and missing tags', async () => {
  const app = App.createConfigured__({ files: { 'A.md': '', 'B.md': '', 'Other.md': '', 'Tags/Parent.md': '' } });
  const api = new TagIndex({ app: app.asOriginalType__(), reportCycle: vi.fn(), settings: (): PluginSettings => new PluginSettings() });
  api.rebuild();
  const notes = app.vault.getMarkdownFiles().filter((file) => file.path === 'A.md' || file.path === 'B.md').map((file) => file.asOriginalType2__());
  const getNotes = vi.spyOn(api, 'getTaggedNotes').mockReturnValue(notes);
  const resolver = vi.spyOn(app.metadataCache, 'getFirstLinkpathDest');
  const element = createDiv();
  const block = new TagNotesBlock({ api, app: app.asOriginalType__(), containerEl: element, source: 'tag: Tags/Parent\nincludeDescendants: true', sourcePath: 'Folder/Query.md' });
  block.load();
  expect(resolver).toHaveBeenCalledWith('Tags/Parent', 'Folder/Query.md');
  expect([...element.querySelectorAll('a')].map((link) => link.dataset['href'])).toEqual(['A.md', 'B.md']);
  expect(getNotes).toHaveBeenLastCalledWith(expect.objectContaining({ path: 'Tags/Parent.md' }), { includeDescendants: true });
  const open = vi.spyOn(app.workspace, 'openLinkText').mockResolvedValue();
  element.querySelector('a')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => {
    expect(open).toHaveBeenCalledWith('A.md', 'Folder/Query.md', false);
  });
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  element.dispatchEvent(new Event('click'));
  const text = document.createTextNode('text');
  element.append(text);
  text.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(open).toHaveBeenCalledOnce();
  const direct = new TagNotesBlock({ api, app: app.asOriginalType__(), containerEl: element, source: 'tag: Tags/Parent', sourcePath: '' });
  direct.load();
  expect(getNotes).toHaveBeenLastCalledWith(expect.anything(), { includeDescendants: false });
  getNotes.mockReturnValue([]);
  block.refresh();
  expect(element.textContent).toBe('No tagged notes.');
  vi.spyOn(api, 'isTagNote').mockReturnValue(false);
  block.refresh();
  expect(element.textContent).toContain('Tag note not found');
  resolver.mockReturnValue(null);
  block.refresh();
  expect(element.textContent).toContain('Tag note not found');
  direct.unload();
  block.unload();
  vi.restoreAllMocks();
});

it.each(['', '[]', 'hello', 'tag: [a]', 'tag: " "', 'includeDescendants: true', 'tag: A\nincludeDescendants: "true"', 'tag: A\ndescendants: true', 'tag: ['])('explains invalid queries without throwing: %s', (source) => {
  const app = App.createConfigured__();
  const api = new TagIndex({ app: app.asOriginalType__(), reportCycle: vi.fn(), settings: (): PluginSettings => new PluginSettings() });
  const element = createDiv();
  const block = new TagNotesBlock({ api, app: app.asOriginalType__(), containerEl: element, source, sourcePath: '' });
  block.load();
  expect(element.querySelector('.tag-notes-query-error')?.textContent).toContain('Invalid tag-notes query');
  block.unload();
});
