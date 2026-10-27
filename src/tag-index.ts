import type {
  App,
  CachedMetadata,
  TFile
} from 'obsidian';

import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import { parseLinktext } from 'obsidian';

import type {
  TagCounts,
  TaggedNotesOptions,
  TagNotesApi
} from '../api.d.ts';
import type { PluginSettings } from './plugin-settings.ts';

interface TagIndexConstructorParams {
  readonly app: App;
  readonly reportCycle: (paths: string[]) => void;
  readonly settings: () => PluginSettings;
}
type TagIndexGetTaggedNotesOptions = TaggedNotesOptions;

/**
Derived data only: no vault writes, and callers receive independent arrays.
*/
export class TagIndex implements TagNotesApi {
  private readonly app: App;
  private readonly children = new Map<TFile, Set<TFile>>();
  private readonly descendants = new Map<TFile, Set<TFile>>();
  private readonly notes = new Map<TFile, Set<TFile>>();
  private readonly parents = new Map<TFile, Set<TFile>>();
  private readonly reportCycle: (paths: string[]) => void;
  private reportedCycles = new Set<string>();
  private readonly settings: () => PluginSettings;
  private readonly tags = new Map<TFile, Set<TFile>>();

  public constructor(params: TagIndexConstructorParams) {
    this.app = params.app;
    this.settings = params.settings;
    this.reportCycle = params.reportCycle;
  }

  public getAncestors(tag: TFile): TFile[] {
    return [...this.collect(tag, this.parents)];
  }

  public getChildren(tag: TFile): TFile[] {
    return [...(this.children.get(tag) ?? [])];
  }

  public getCounts(tag: TFile): TagCounts {
    return {
      direct: this.getTaggedNotes(tag).length,
      withDescendants: this.getTaggedNotes(tag, { includeDescendants: true }).length
    };
  }

  public getDescendants(tag: TFile): TFile[] {
    let result = this.descendants.get(tag);
    if (!result) {
      result = this.collect(tag, this.children);
      this.descendants.set(tag, result);
    }
    return [...result];
  }

  public getParents(tag: TFile): TFile[] {
    return [...(this.parents.get(tag) ?? [])];
  }

  public getTaggedNotes(tag: TFile, options: TagIndexGetTaggedNotesOptions = {}): TFile[] {
    const result = new Set(this.notes.get(tag));
    if (options.includeDescendants) {
      for (const child of this.getDescendants(tag)) {
        for (const note of ensureNonNullable(this.notes.get(child))) {
          result.add(note);
        }
      }
    }
    return [...result];
  }

  public getTagNotes(): TFile[] {
    return [...this.notes.keys()];
  }

  public getTags(file: TFile): TFile[] {
    return [...(this.tags.get(file) ?? [])];
  }

  public isTagNote(file: TFile): boolean {
    return this.notes.has(file);
  }

  public rebuild(): void {
    this.tags.clear();
    this.notes.clear();
    this.parents.clear();
    this.children.clear();
    this.descendants.clear();
    const settings = this.settings();
    const folder = settings.tagFolderPath.replaceAll(/^\/+|\/+$/gu, '');
    const files = this.app.vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path));
    for (const file of files) {
      if (folder === '' || file.path.startsWith(`${folder}/`)) {
        this.ensureTag(file);
      }
      const targets = this.readLinks(file, settings.tagsPropertyName);
      this.tags.set(file, new Set(targets));
      for (const target of targets) {
        this.ensureTag(target);
        ensureNonNullable(this.notes.get(target)).add(file);
      }
    }
    // Map iteration also visits newly discovered parents outside the tag folder.
    const cycles = new Set<string>();
    for (const tag of this.notes.keys()) {
      for (const parent of this.readLinks(tag, settings.parentPropertyName)) {
        this.ensureTag(parent);
        const path = this.findParentPath(parent, tag);
        if (path) {
          const paths = [tag.path, ...path.map((file) => file.path)];
          const key = [...new Set(paths)].sort().join('\n');
          cycles.add(key);
          if (!this.reportedCycles.has(key)) {
            this.reportCycle(paths);
          }
          continue;
        }
        ensureNonNullable(this.parents.get(tag)).add(parent);
        ensureNonNullable(this.children.get(parent)).add(tag);
      }
    }
    this.reportedCycles = cycles;
  }

  private collect(tag: TFile, edges: Map<TFile, Set<TFile>>): Set<TFile> {
    const result = new Set<TFile>();
    const pending = [...(edges.get(tag) ?? [])];
    for (let file = pending.pop(); file; file = pending.pop()) {
      if (result.has(file)) {
        continue;
      }

      result.add(file);
      pending.push(...ensureNonNullable(edges.get(file)));
    }
    return result;
  }

  private ensureTag(file: TFile): void {
    if (this.notes.has(file)) {
      return;
    }

    this.notes.set(file, new Set());
    this.parents.set(file, new Set());
    this.children.set(file, new Set());
  }

  private findParentPath(start: TFile, target: TFile): TFile[] | undefined {
    const pending = [[start]];
    const visited = new Set<TFile>();
    for (let path = pending.pop(); path; path = pending.pop()) {
      const file = ensureNonNullable(path.at(-1));
      if (file === target) {
        return path;
      }
      if (visited.has(file)) {
        continue;
      }

      visited.add(file);
      for (const parent of ensureNonNullable(this.parents.get(file))) {
        pending.push([...path, parent]);
      }
    }
    return undefined;
  }

  private readLinks(file: TFile, property: string): TFile[] {
    const cache: CachedMetadata | null = this.app.metadataCache.getFileCache(file);
    if (!Array.isArray(cache?.frontmatter?.[property])) {
      return [];
    }
    const result = new Set<TFile>();
    for (const link of cache.frontmatterLinks ?? []) {
      // Only direct list entries: nested objects and body links are not tags.
      const suffix = link.key.slice(property.length);
      if (!link.key.startsWith(property) || !/^\.\d+$/u.test(suffix)) {
        continue;
      }
      const target = this.app.metadataCache.getFirstLinkpathDest(parseLinktext(link.link).path, file.path);
      if (target?.extension === 'md') {
        result.add(target);
      }
    }
    return [...result];
  }
}
