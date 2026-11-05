import type {
  CachedMetadata,
  Editor as EditorOriginal,
  EditorPosition,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  TFile as TFileOriginal
} from 'obsidian';
import type { TFile } from 'obsidian-test-mocks/obsidian';

import {
  parseFrontmatter,
  setFrontmatter
} from '@mnaoumov/obsidian-lib/frontmatter';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import {
  App,
  Editor,
  SuggestModal
} from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { TagChoice } from './tag-picker.ts';

import { PluginSettings } from '../plugin-settings.ts';
import { TagIndex } from '../tag-index.ts';
import { TagPicker } from './tag-picker.ts';
import { TagSuggest } from './tag-suggest.ts';

interface ApplyHost {
  readonly apply: (choice: TagChoice, insertion: TagInsertion) => Promise<void>;
}

interface Fixture {
  readonly alpha: TFile;
  readonly app: App;
  readonly apply: (choice?: TagChoice, insertion?: TagInsertion) => Promise<void>;
  readonly choice: TagChoice;
  readonly editor: Editor;
  readonly index: TagIndex;
  readonly insertion: TagInsertion;
  readonly picker: TagPicker;
  readonly settings: PluginSettings;
  readonly showError: ReturnType<typeof vi.fn>;
  readonly source: TFile;
}

interface TagInsertion {
  readonly editor: EditorOriginal;
  readonly end: EditorPosition;
  readonly file: TFileOriginal;
  readonly start: EditorPosition;
  readonly text: string;
}

afterEach(() => {
  vi.restoreAllMocks();
});

function fixture(): Fixture {
  const content = 'Text @Alpha';
  const app = App.createConfigured__({ files: { 'Source.md': content, 'Tags/Alpha.md': '', 'Tags/Bravo.md': '' } });
  const editor = new class extends Editor {}();
  editor.setValue(content);
  const settings = new PluginSettings();
  const index = new TagIndex({ app: app.asOriginalType__(), reportCycle: vi.fn(), settings: (): PluginSettings => settings });
  index.rebuild();
  const showError = vi.fn();
  const picker = new TagPicker({ api: index, app: app.asOriginalType__(), settings: (): PluginSettings => settings, showError });
  const alpha = app.vault.getFileByPath('Tags/Alpha.md');
  const source = app.vault.getFileByPath('Source.md');
  if (!alpha || !source) {
    throw new Error('Fixture missing');
  }
  vi.spyOn(app.workspace, 'getActiveFile').mockReturnValue(source);
  const insertion: TagInsertion = { editor: editor.asOriginalType__(), end: { ch: content.length, line: 0 }, file: source.asOriginalType2__(), start: { ch: 5, line: 0 }, text: content.slice(5) };
  const choice: TagChoice = { file: alpha.asOriginalType2__(), name: 'Alpha' };
  return { alpha, app, apply, choice, editor, index, insertion, picker, settings, showError, source };

  function apply(selected = choice, where = insertion): Promise<void> {
    return castTo<ApplyHost>(picker).apply(selected, where);
  }
}

describe('tag selection', () => {
  it('rejects a switched active note even when the editor text still matches', async () => {
    const f = fixture();
    vi.spyOn(f.app.workspace, 'getActiveFile').mockReturnValue(f.alpha);
    await expect(f.apply()).rejects.toThrow('note changed');
    expect(f.editor.getValue()).toBe('Text @Alpha');
    vi.mocked(f.app.workspace.getActiveFile).mockReturnValue(f.source);
    vi.spyOn(f.app.vault, 'create').mockImplementationOnce(() => {
      vi.mocked(f.app.workspace.getActiveFile).mockReturnValue(f.alpha);
      return Promise.resolve(f.source);
    });
    await expect(f.apply({ file: null, name: 'New' })).rejects.toThrow('note or tag changed');
    expect(f.editor.getValue()).toBe('Text @Alpha');
  });
  it('searches names, paths and aliases; disambiguates paths and only offers valid new names', () => {
    const f = fixture();
    vi.spyOn(f.app.metadataCache, 'getFileCache').mockImplementation((file) => file.path === 'Tags/Alpha.md' ? { frontmatter: { aliases: ['First concept'] } } : null);
    expect(f.picker.choices('First')).toEqual([f.choice, { file: null, name: 'First' }]);
    expect(f.picker.choices('first concept')).toEqual([f.choice]);
    expect(f.picker.choices('Tags/Bravo')).toHaveLength(1);
    expect(f.picker.choices('Alpha')).toEqual([f.choice]);
    expect(f.picker.choices('')).toHaveLength(2);
    for (const name of ['a/b', '.', '..', 'con', 'aux.txt', 'New.', 'Bad\u{0}Name']) {
      expect(f.picker.choices(name).every((choice) => choice.file !== null)).toBe(true);
    }
    expect(f.picker.choices('New')).toEqual([{ file: null, name: 'New' }]);
    const element = createDiv();
    f.picker.render(f.choice, element);
    expect(element.textContent).toContain('Tags/Alpha.md');
    f.picker.render({ file: null, name: 'New' }, element);
    expect(element.textContent).toContain('Create tag note: New');
  });

  it('adds the property and removes only the trigger text', async () => {
    const f = fixture();
    await f.apply();
    expect(await f.app.vault.read(f.source)).toContain('[[Alpha]]');
    expect(f.editor.getValue()).toBe('Text ');
  });

  it('preserves unrelated values and avoids duplicate wikilinks and Markdown links', async () => {
    const f = fixture();
    for (const values of [['plain', '[[Bravo]]', '[Alpha](Tags/Alpha.md)'], ['[[Alpha|caption]]'], ['https://example.com', '[[Bravo]]']]) {
      await f.app.vault.modify(f.source, setFrontmatter('Text ', { keywords: values, other: 'retained' }));
      f.editor.setValue('Text @Alpha');
      await f.apply();
      const content = await f.app.vault.read(f.source);
      expect(content).toContain('other: retained');
      for (const value of values) {
        expect(content).toContain(value);
      }
      expect(parseFrontmatter(content)['keywords']).toEqual(values.some((value) => value.includes('Alpha')) ? values : [...values, '[[Alpha]]']);
    }
  });

  it('keeps equally named tags selectable by their distinct paths', async () => {
    const f = fixture();
    await f.app.vault.createFolder('Tags/Nested');
    await f.app.vault.create('Tags/Nested/Alpha.md', '');
    f.index.rebuild();
    expect(f.picker.choices('Alpha').map((choice) => choice.file?.path)).toEqual(['Tags/Alpha.md', 'Tags/Nested/Alpha.md']);
  });

  it('accepts empty properties and rejects invalid properties before creating a file', async () => {
    const f = fixture();
    for (const value of ['null', 'wrong', '\n  - 123']) {
      const content = `---\nkeywords: ${value}\n---\nText @Alpha`;
      f.editor.setValue(content);
      const line = f.editor.lastLine();
      const insertion = { ...f.insertion, end: { ch: 11, line }, start: { ch: 5, line } };
      if (value === 'null') {
        await f.apply(f.choice, insertion);
      } else {
        await expect(f.apply({ file: null, name: 'New' }, insertion)).rejects.toThrow('list of strings');
        expect(f.editor.getValue()).toBe(content);
        expect(f.app.vault.getFileByPath('Tags/New.md')).toBeNull();
      }
    }
  });

  it('creates in a nested folder or the root, and never overwrites an existing file', async () => {
    const f = fixture();
    for (const folder of ['Concepts/Nested', '']) {
      f.settings.tagFolderPath = folder;
      f.editor.setValue('Text @Alpha');
      await f.apply({ file: null, name: 'New' });
      const path = folder ? `${folder}/New.md` : 'New.md';
      expect(f.app.vault.getFileByPath(path)).not.toBeNull();
      f.editor.setValue('Text @Alpha');
      await expect(f.apply({ file: null, name: 'New' })).rejects.toThrow('already exists');
    }
    await expect(f.apply({ file: null, name: '../Unsafe' })).rejects.toThrow('valid tag');
  });

  it('inserts a body mention in the generated link format without tagging', async () => {
    const f = fixture();
    f.settings.insertBodyLink = true;
    vi.spyOn(f.app.fileManager, 'generateMarkdownLink').mockReturnValue('[Alpha](Tags/Alpha.md)');
    await f.apply();
    expect(f.editor.getValue()).toBe('Text [Alpha](Tags/Alpha.md)');
    expect(await f.app.vault.read(f.source)).not.toContain('keywords:');
  });

  it('rejects stale ranges, deleted sources and targets, and edits made during creation', async () => {
    const f = fixture();
    f.editor.setValue('Text changed');
    await expect(f.apply()).rejects.toThrow('note changed');
    f.editor.setValue('Text @Alpha');
    await f.app.fileManager.trashFile(f.alpha);
    await expect(f.apply()).rejects.toThrow('note or tag changed');
    const create = vi.spyOn(f.app.vault, 'create');
    create.mockImplementationOnce(() => {
      f.editor.setValue('Text changed');
      return Promise.resolve(f.source);
    });
    await expect(f.apply({ file: null, name: 'New' })).rejects.toThrow('note or tag changed');
    await f.app.fileManager.trashFile(f.source);
    f.editor.setValue('Text @Alpha');
    await expect(f.apply()).rejects.toThrow('note changed');
  });

  it('restores typed text on failed property writes and preserves intervening edits', async () => {
    const f = fixture();
    const process = vi.spyOn(f.app.fileManager, 'processFrontMatter').mockRejectedValueOnce(new Error('Write failed'));
    await expect(f.apply()).rejects.toThrow('Write failed');
    expect(f.editor.getValue()).toBe('Text @Alpha');
    process.mockImplementationOnce(() => {
      f.editor.setValue('Text edited');
      return Promise.reject(new Error('Write failed'));
    });
    await expect(f.apply()).rejects.toThrow('Write failed');
    expect(f.editor.getValue()).toBe('Text edited');
    f.picker.select(f.choice, f.insertion);
    await vi.waitFor(() => {
      expect(f.showError).toHaveBeenCalled();
    });
  });

  it('opens the command picker and routes its rendered selection', async () => {
    const f = fixture();
    const constructor = vi.spyOn(SuggestModal.prototype, 'constructor2__');
    f.picker.open(f.insertion);
    const modal = castTo<SuggestModal<TagChoice>>(constructor.mock.instances[0]);
    expect(modal.getSuggestions('Alpha')).toEqual([f.choice]);
    const element = createDiv();
    modal.renderSuggestion(f.choice, element);
    expect(element.textContent).toContain('Alpha');
    modal.onChooseSuggestion(f.choice, new MouseEvent('click'));
    await vi.waitFor(async () => {
      expect(await f.app.vault.read(f.source)).toContain('[[Alpha]]');
    });
    modal.close();
  });
});

describe('editor trigger', () => {
  it('uses the configurable trigger at word boundaries and routes selection', async () => {
    const f = fixture();
    const suggest = new TagSuggest(f.app.asOriginalType__(), f.picker, () => f.settings);
    const cursor = { ch: 11, line: 0 };
    const context: EditorSuggestContext = { ...f.insertion, query: 'Alpha' };
    expect(suggest.onTrigger(cursor, f.insertion.editor, f.insertion.file)).toEqual({ end: cursor, query: 'Alpha', start: { ch: 5, line: 0 } });
    expect(suggest.getSuggestions(context)).toEqual([f.choice]);
    const element = createDiv();
    suggest.renderSuggestion(f.choice, element);
    expect(element.textContent).toContain('Alpha');
    suggest.selectSuggestion(f.choice);
    expect(f.editor.getValue()).toBe('Text @Alpha');
    suggest.context = context;
    suggest.selectSuggestion(f.choice);
    await vi.waitFor(async () => {
      expect(await f.app.vault.read(f.source)).toContain('[[Alpha]]');
    });
    Object.assign(f.settings, { suggestTrigger: '::' });
    f.editor.setValue('::Al');
    vi.spyOn(f.app.metadataCache, 'getFileCache').mockReturnValue(null);
    expect(suggest.onTrigger({ ch: 4, line: 0 }, f.insertion.editor, f.insertion.file)?.query).toBe('Al');
  });

  it('leaves regular prose, email, code and frontmatter alone', () => {
    const f = fixture();
    const suggest = new TagSuggest(f.app.asOriginalType__(), f.picker, () => f.settings);
    for (const text of ['Text', 'email@Alpha', '@Alpha Bravo', '`@Alpha']) {
      expect(trigger(text)).toBeNull();
    }
    expect(trigger('@Alpha', null)).toBeNull();
    f.settings.suggestTrigger = '';
    expect(trigger('@Alpha')).toBeNull();
    f.settings.suggestTrigger = '@';
    const cache = vi.spyOn(f.app.metadataCache, 'getFileCache');
    cache.mockReturnValue(castTo<CachedMetadata>({ frontmatterPosition: { end: { line: 2 } } }));
    expect(trigger('@Alpha')).toBeNull();
    cache.mockReturnValue(castTo<CachedMetadata>({ sections: [{ position: { end: { line: 3 }, start: { line: 0 } }, type: 'code' }] }));
    expect(trigger('@Alpha')).toBeNull();
    cache.mockReturnValue(castTo<CachedMetadata>({ sections: [{ position: { end: { line: 0 }, start: { line: 0 } }, type: 'paragraph' }] }));
    expect(trigger('@Alpha')).not.toBeNull();

    function trigger(text: string, file: null | TFileOriginal = f.insertion.file): EditorSuggestTriggerInfo | null {
      f.editor.setValue(text);
      return suggest.onTrigger({ ch: text.length, line: 0 }, f.insertion.editor, file);
    }
  });
});
