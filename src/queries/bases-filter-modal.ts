import type {
  App,
  TFile
} from 'obsidian';

import { parseLink } from '@mnaoumov/obsidian-lib/parse-link';
import { invokeAsyncSafely } from '@mnaoumov/typescript-lib/async';
import {
  parseFrontMatterAliases,
  parseLinktext,
  SuggestModal
} from 'obsidian';

import type { TagNotesApi } from '../../api.d.ts';
import type { PluginSettings } from '../plugin-settings.ts';

interface BasesFilterModalConstructorParams {
  readonly api: TagNotesApi;
  readonly app: App;
  readonly settings: () => PluginSettings;
  readonly showNotice: (message: string) => void;
}

export class BasesFilterModal extends SuggestModal<TFile> {
  private readonly api: TagNotesApi;
  private readonly settings: () => PluginSettings;
  private readonly showNotice: (message: string) => void;

  public constructor(params: BasesFilterModalConstructorParams) {
    super(params.app);
    this.api = params.api;
    this.settings = params.settings;
    this.showNotice = params.showNotice;
    this.setPlaceholder('Choose a tag subtree to copy as a Bases filter');
  }

  public override getSuggestions(query: string): TFile[] {
    const needle = query.trim().toLocaleLowerCase();
    return this.api.getTagNotes().filter((file) => {
      const aliases = parseFrontMatterAliases(this.app.metadataCache.getFileCache(file)?.frontmatter) ?? [];
      return [file.path, ...aliases].some((value) => value.toLocaleLowerCase().includes(needle));
    }).sort((a, b) => a.path.localeCompare(b.path));
  }

  public override onChooseSuggestion(file: TFile): void {
    invokeAsyncSafely(async () => {
      try {
        if (this.app.vault.getFileByPath(file.path) !== file || !this.api.isTagNote(file)) {
          throw new Error('The tag changed. Choose it again.');
        }
        const expression = createBasesFilter(this.app, this.api, file, this.settings().tagsPropertyName);
        // eslint-disable-next-line n/no-unsupported-features/node-builtins -- Runs in Obsidian's browser renderer on desktop and mobile.
        await window.navigator.clipboard.writeText(expression);
        this.showNotice('Bases filter copied. Paste it into a Bases advanced filter. Copy again after changing the hierarchy.');
      } catch (error) {
        this.showNotice(`Could not copy Bases filter: ${String(error)}`);
      }
    });
  }

  public override renderSuggestion(file: TFile, element: HTMLElement): void {
    element.createDiv({ text: file.basename });
    element.createEl('small', { text: file.path });
  }
}

function createBasesFilter(app: App, api: TagNotesApi, tag: TFile, property: string): string {
  const paths = [...new Set([tag, ...api.getDescendants(tag)].map((file) => file.path))].sort();
  const reference = `note[${JSON.stringify(property)}]`;
  const expressions = new Set(paths.map((path) => `list(${reference}).contains(link(${JSON.stringify(path)}))`));
  // Bases keeps Markdown links as strings. Preserve the spellings already used in the property,
  // scoped to the source folder so relative destinations cannot tag unrelated notes elsewhere.
  for (const note of api.getTaggedNotes(tag, { includeDescendants: true })) {
    const values: unknown = app.metadataCache.getFileCache(note)?.frontmatter?.[property];
    if (!Array.isArray(values)) {
      continue;
    }
    for (const value of values) {
      if (typeof value !== 'string' || !value.startsWith('[') || value.startsWith('[[')) {
        continue;
      }
      const parsed = parseLink(value);
      if (!parsed || parsed.isExternal) {
        continue;
      }
      const target = app.metadataCache.getFirstLinkpathDest(parseLinktext(parsed.url).path, note.path);
      if (!target || !paths.includes(target.path)) {
        continue;
      }
      const folder = note.path.includes('/') ? note.path.slice(0, note.path.lastIndexOf('/')) : '/';
      expressions.add(`(file.folder == ${JSON.stringify(folder)} && list(${reference}).contains(${JSON.stringify(value)}))`);
    }
  }
  return [...expressions].join(' || ');
}
