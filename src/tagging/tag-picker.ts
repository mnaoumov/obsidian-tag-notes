import type {
  App,
  Editor,
  EditorPosition,
  TFile
} from 'obsidian';

import { parseFrontmatter } from '@mnaoumov/obsidian-lib/frontmatter';
import { parseLink } from '@mnaoumov/obsidian-lib/parse-link';
import { createFolderSafe } from '@mnaoumov/obsidian-lib/vault';
import { invokeAsyncSafely } from '@mnaoumov/typescript-lib/async';
import {
  normalizePath,
  parseFrontMatterAliases,
  parseLinktext,
  SuggestModal
} from 'obsidian';

import type { TagNotesApi } from '../../api.d.ts';

import { PluginSettings } from '../plugin-settings.ts';

export interface TagChoice {
  readonly file: null | TFile;
  readonly name: string;
}

interface TagInsertion {
  readonly editor: Editor;
  readonly end: EditorPosition;
  readonly file: TFile;
  readonly start: EditorPosition;
  readonly text: string;
}

interface TagPickerConstructorParams {
  readonly api: TagNotesApi;
  readonly app: App;
  readonly settings: () => PluginSettings;
  readonly showError: (error: unknown) => void;
}

class TagPickerModal extends SuggestModal<TagChoice> {
  private readonly insertion: TagInsertion;
  private readonly picker: TagPicker;

  public constructor(app: App, picker: TagPicker, insertion: TagInsertion) {
    super(app);
    this.picker = picker;
    this.insertion = insertion;
    this.setPlaceholder('Find or create a tag note');
  }

  public override getSuggestions(query: string): TagChoice[] {
    return this.picker.choices(query);
  }

  public override onChooseSuggestion(choice: TagChoice): void {
    this.picker.select(choice, this.insertion);
  }

  public override renderSuggestion(choice: TagChoice, element: HTMLElement): void {
    this.picker.render(choice, element);
  }
}

export class TagPicker {
  private readonly api: TagNotesApi;
  private readonly app: App;
  private readonly settings: () => PluginSettings;
  private readonly showError: (error: unknown) => void;

  public constructor(params: TagPickerConstructorParams) {
    this.app = params.app;
    this.api = params.api;
    this.settings = params.settings;
    this.showError = params.showError;
  }

  public choices(query: string): TagChoice[] {
    const name = query.trim();
    const needle = name.toLocaleLowerCase();
    const tags = this.api.getTagNotes();
    const matches: TagChoice[] = tags.filter((file) => [file.basename, file.path, ...this.aliases(file)].some((value) => value.toLocaleLowerCase().includes(needle)))
      .sort((a, b) => a.basename.localeCompare(b.basename) || a.path.localeCompare(b.path))
      .map((file) => ({ file, name: file.basename }));
    const hasExactMatch = tags.some((file) => [file.basename, ...this.aliases(file)].some((value) => value.toLocaleLowerCase() === needle));
    if (isValidTagName(name) && !hasExactMatch) {
      matches.push({ file: null, name });
    }
    return matches;
  }

  public open(insertion: TagInsertion): void {
    new TagPickerModal(this.app, this, insertion).open();
  }

  public render(choice: TagChoice, element: HTMLElement): void {
    element.addClass('tag-notes-suggestion');
    element.createDiv({ text: choice.file ? choice.name : `Create tag note: ${choice.name}` });
    if (choice.file) {
      element.createEl('small', { text: choice.file.path });
    }
  }

  public select(choice: TagChoice, insertion: TagInsertion): void {
    invokeAsyncSafely(async () => {
      try {
        await this.apply(choice, insertion);
      } catch (error) {
        this.showError(error);
      }
    });
  }

  private aliases(file: TFile): string[] {
    return parseFrontMatterAliases(this.app.metadataCache.getFileCache(file)?.frontmatter) ?? [];
  }

  private async apply(choice: TagChoice, insertion: TagInsertion): Promise<void> {
    const { editor, end, file, start, text } = insertion;
    const settings = Object.assign(new PluginSettings(), this.settings());
    const original = editor.getValue();
    if (editor.getRange(start, end) !== text || this.app.vault.getFileByPath(file.path) !== file || this.app.workspace.getActiveFile() !== file) {
      throw new Error('The note changed. Choose the tag again.');
    }
    if (!settings.insertBodyLink) {
      this.readTags(parseFrontmatter(original)[settings.tagsPropertyName]);
    }
    const target = choice.file ?? await this.createTag(choice.name, settings);
    if (editor.getValue() !== original || this.app.vault.getFileByPath(target.path) !== target || this.app.workspace.getActiveFile() !== file) {
      throw new Error('The note or tag changed. Choose the tag again.');
    }
    const link = this.app.fileManager.generateMarkdownLink(target, file.path);
    editor.replaceRange(settings.insertBodyLink ? link : '', start, end);
    if (settings.insertBodyLink) {
      return;
    }
    const afterRemoval = editor.getValue();
    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
        const values = this.readTags(frontmatter[settings.tagsPropertyName]);
        const isAlreadyTagged = values.some((value) => {
          const parsed = parseLink(value);
          return parsed !== null && !parsed.isExternal && this.app.metadataCache.getFirstLinkpathDest(parseLinktext(parsed.url).path, file.path) === target;
        });
        if (!isAlreadyTagged) {
          frontmatter[settings.tagsPropertyName] = [...values, link];
        }
      });
    } catch (error) {
      if (editor.getValue() === afterRemoval) {
        editor.replaceRange(text, start, start);
      }
      throw error;
    }
  }

  private async createTag(name: string, settings: PluginSettings): Promise<TFile> {
    if (!isValidTagName(name)) {
      throw new Error('Enter a valid tag note name.');
    }
    const path = normalizePath(settings.tagFolderPath ? `${settings.tagFolderPath}/${name}.md` : `${name}.md`);
    if (this.app.vault.getAbstractFileByPath(path)) {
      throw new Error(`A file already exists at ${path}. Choose an existing tag or another name.`);
    }
    await createFolderSafe(this.app, settings.tagFolderPath);
    return this.app.vault.create(path, '');
  }

  private readTags(value: unknown): string[] {
    if (value === undefined || value === null) {
      return [];
    }
    if (!Array.isArray(value)) {
      throw new TypeError('The tags property must be a list of strings. Its contents were left unchanged.');
    }
    const entries: unknown[] = value;
    const tags: string[] = [];
    for (const entry of entries) {
      if (typeof entry !== 'string') {
        throw new TypeError('The tags property must be a list of strings. Its contents were left unchanged.');
      }
      tags.push(entry);
    }
    return tags;
  }
}

function isValidTagName(name: string): boolean {
  return name.trim() === name && name !== '' && name !== '.' && name !== '..' && !/[\\/:*?"<>|\p{Cc}]/u.test(name) && !/[. ]$/u.test(name) && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(name);
}
