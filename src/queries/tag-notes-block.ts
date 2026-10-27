import type { App } from 'obsidian';

import { invokeAsyncSafely } from '@mnaoumov/typescript-lib/async';
import {
  Keymap,
  MarkdownRenderChild,
  parseYaml
} from 'obsidian';

import type { TagNotesApi } from '../../api.d.ts';

interface TagNotesBlockConstructorParams {
  readonly api: TagNotesApi;
  readonly app: App;
  readonly containerEl: HTMLElement;
  readonly source: string;
  readonly sourcePath: string;
}

interface TagQuery {
  readonly includeDescendants: boolean;
  readonly tag: string;
}

export class TagNotesBlock extends MarkdownRenderChild {
  private readonly api: TagNotesApi;
  private readonly app: App;
  private readonly source: string;
  private readonly sourcePath: string;

  public constructor(params: TagNotesBlockConstructorParams) {
    super(params.containerEl);
    this.api = params.api;
    this.app = params.app;
    this.source = params.source;
    this.sourcePath = params.sourcePath;
  }

  public override onload(): void {
    this.registerDomEvent(this.containerEl, 'click', (event) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a.internal-link') : null;
      const path = link?.dataset['href'];
      if (!path) {
        return;
      }

      event.preventDefault();
      invokeAsyncSafely(() => this.app.workspace.openLinkText(path, this.sourcePath, Keymap.isModEvent(event)));
    });
    this.refresh();
  }

  public refresh(): void {
    this.containerEl.empty();
    this.containerEl.addClass('tag-notes-query');
    try {
      const query = parseQuery(this.source);
      const tag = this.app.metadataCache.getFirstLinkpathDest(query.tag, this.sourcePath);
      if (!tag || !this.api.isTagNote(tag)) {
        this.containerEl.createEl('p', { text: `Tag note not found: ${query.tag}` });
        return;
      }
      const notes = this.api.getTaggedNotes(tag, { includeDescendants: query.includeDescendants })
        .sort((a, b) => a.path.localeCompare(b.path));
      if (notes.length === 0) {
        this.containerEl.createEl('p', { text: 'No tagged notes.' });
        return;
      }
      const list = this.containerEl.createEl('ul');
      for (const note of notes) {
        const link = list.createEl('li').createEl('a', {
          attr: { 'data-href': note.path, 'href': note.path },
          cls: 'internal-link',
          text: note.path.replace(/\.md$/u, '')
        });
        link.setAttribute('title', note.path);
      }
    } catch (error) {
      this.containerEl.createEl('p', { cls: 'tag-notes-query-error', text: `Invalid tag-notes query: ${String(error)}` });
    }
  }
}

function parseQuery(source: string): TagQuery {
  const value: unknown = parseYaml(source);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Use YAML with a tag path and optional includeDescendants: true or false.');
  }
  if (!('tag' in value) || typeof value.tag !== 'string' || value.tag.trim() === '') {
    throw new Error('tag must be a non-empty note path.');
  }
  for (const key of Object.keys(value)) {
    if (key !== 'tag' && key !== 'includeDescendants') {
      throw new Error(`Unknown option: ${key}`);
    }
  }
  if ('includeDescendants' in value && typeof value.includeDescendants !== 'boolean') {
    throw new Error('includeDescendants must be true or false.');
  }
  return { includeDescendants: 'includeDescendants' in value && value.includeDescendants === true, tag: value.tag.trim() };
}
