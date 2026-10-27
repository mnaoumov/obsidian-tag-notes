import type { TFile } from 'obsidian';

import { App } from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  expect,
  it,
  vi
} from 'vitest';

import { PluginSettings } from '../plugin-settings.ts';
import { TagIndex } from '../tag-index.ts';
import { BasesFilterModal } from './bases-filter-modal.ts';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

interface Fixture {
  readonly api: TagIndex;
  readonly app: App;
  readonly modal: BasesFilterModal;
  readonly settings: PluginSettings;
  readonly showNotice: ReturnType<typeof vi.fn>;
  readonly tag: TFile;
  readonly tags: readonly TFile[];
  readonly writeText: ReturnType<typeof vi.fn<Navigator['clipboard']['writeText']>>;
}

function fixture(): Fixture {
  const app = App.createConfigured__({ files: { 'Tags/Child "quoted".md': '', 'Tags/Parent.md': '' } });
  const api = new TagIndex({ app: app.asOriginalType__(), reportCycle: vi.fn(), settings: (): PluginSettings => new PluginSettings() });
  api.rebuild();
  const tags = api.getTagNotes();
  const tag = tags.find((file) => file.basename === 'Parent');
  if (!tag) {
    throw new Error('Missing tag');
  }
  const settings = new PluginSettings();
  settings.tagsPropertyName = 'my "tags"';
  const showNotice = vi.fn();
  const writeText = vi.fn<Navigator['clipboard']['writeText']>().mockResolvedValue();
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  const modal = new BasesFilterModal({ api, app: app.asOriginalType__(), settings: (): PluginSettings => settings, showNotice });
  return { api, app, modal, settings, showNotice, tag, tags, writeText };
}

it('searches paths and aliases and copies an escaped, deduplicated snapshot of the latest subtree', async () => {
  const f = fixture();
  vi.spyOn(f.app.metadataCache, 'getFileCache').mockImplementation((file) => file.basename === 'Parent' ? { frontmatter: { aliases: ['First'] } } : null);
  expect(f.modal.getSuggestions(' First ')).toEqual([f.tag]);
  expect(f.modal.getSuggestions('tags/')).toHaveLength(2);
  expect(f.modal.getSuggestions('missing')).toEqual([]);
  const element = createDiv();
  f.modal.renderSuggestion(f.tag, element);
  expect(element.textContent).toContain('Tags/Parent.md');
  vi.spyOn(f.api, 'getDescendants').mockReturnValue([...f.tags, f.tag]);
  f.modal.onChooseSuggestion(f.tag);
  await vi.waitFor(() => {
    expect(f.showNotice).toHaveBeenCalledWith(expect.stringContaining('Bases filter copied'));
  });
  expect(f.writeText).toHaveBeenCalledWith(String.raw`list(note["my \"tags\""]).contains(link("Tags/Child \"quoted\".md")) || list(note["my \"tags\""]).contains(link("Tags/Parent.md"))`);
  f.settings.tagsPropertyName = 'keywords';
  vi.mocked(f.api.getDescendants).mockReturnValue([]);
  f.modal.onChooseSuggestion(f.tag);
  await vi.waitFor(() => {
    expect(f.writeText).toHaveBeenLastCalledWith('list(note["keywords"]).contains(link("Tags/Parent.md"))');
  });
});

it('reports clipboard failures and rejects stale selections without touching the clipboard', async () => {
  const f = fixture();
  f.writeText.mockRejectedValue(new Error('Clipboard denied'));
  f.modal.onChooseSuggestion(f.tag);
  await vi.waitFor(() => {
    expect(f.showNotice).toHaveBeenCalledWith(expect.stringContaining('Clipboard denied'));
  });
  f.writeText.mockClear();
  vi.spyOn(f.api, 'isTagNote').mockReturnValue(false);
  f.modal.onChooseSuggestion(f.tag);
  await vi.waitFor(() => {
    expect(f.showNotice).toHaveBeenCalledWith(expect.stringContaining('tag changed'));
  });
  expect(f.writeText).not.toHaveBeenCalled();
  vi.spyOn(f.app.vault, 'getFileByPath').mockReturnValue(null);
  f.modal.onChooseSuggestion(f.tag);
  expect(f.writeText).not.toHaveBeenCalled();
});

it('includes only resolved Markdown property links and scopes their spelling to the source folder', async () => {
  const f = fixture();
  const root = await f.app.vault.create('Root.md', '');
  const nested = await f.app.vault.create('Tags/Note.md', '');
  const uncached = await f.app.vault.create('Uncached.md', '');
  vi.spyOn(f.api, 'getTaggedNotes').mockReturnValue([root.asOriginalType2__(), nested.asOriginalType2__(), uncached.asOriginalType2__()]);
  vi.spyOn(f.app.metadataCache, 'getFileCache').mockImplementation((file) =>
    file.path === 'Uncached.md' ? null : {
      frontmatter: { [f.settings.tagsPropertyName]: [null, 3, 'plain', '[[Parent]]', '[invalid]', '[external](https://example.com)', '[missing](missing.md)', '[other](Child%20%22quoted%22.md)', '[Parent](Tags/Parent.md)'] }
    }
  );
  f.modal.onChooseSuggestion(f.tag);
  await vi.waitFor(() => {
    expect(f.writeText).toHaveBeenCalledOnce();
  });
  const text = f.writeText.mock.calls[0]?.[0];
  expect(text).toContain(String.raw`(file.folder == "/" && list(note["my \"tags\""]).contains("[Parent](Tags/Parent.md)"))`);
  expect(text).toContain('(file.folder == "Tags" &&');
  expect(text).not.toContain('[missing]');
  expect(text).not.toContain('[external]');
  expect(text).not.toContain('[other]');
});
