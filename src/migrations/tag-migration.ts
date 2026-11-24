import type {
  App,
  TagCache,
  TFile
} from 'obsidian';

import { reportBulkOperationProgress } from '@mnaoumov/obsidian-lib/bulk-operation-progress';
import {
  checkIsPlainObject,
  parseFrontmatter,
  setFrontmatter
} from '@mnaoumov/obsidian-lib/frontmatter';
import { parseMetadata } from '@mnaoumov/obsidian-lib/metadata-cache';
import { createFolderSafe } from '@mnaoumov/obsidian-lib/vault';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import {
  getFrontMatterInfo,
  normalizePath,
  parseFrontMatterTags
} from 'obsidian';

import { isInExcludedFolder } from '../excluded-folders.ts';
import { PluginSettings } from '../plugin-settings.ts';
import { toPropertyValue } from '../property-values.ts';

/**
 * Narrows a preview to one tag.
 */
export interface TagMigrationPreviewOptions {
  /**
   * The tag to convert, with or without its `#`. Tags under it convert too; other tags stay as they are.
   */
  readonly tag?: string;
  /**
   * An existing note to use as the tag's note. Without one, the tag note is found or created as in a full conversion.
   */
  readonly tagNote?: null | TFile;
}

interface MigrationNote {
  readonly content: string;
  readonly file: TFile;
  readonly inlineTags: readonly TagCache[];
  /**
   * The note's core tags properties whose values change, each with the values that stay.
   */
  readonly keptPropertyTags: ReadonlyMap<string, readonly string[]>;
  readonly tags: readonly string[];
}

interface MigrationPlan {
  readonly notes: readonly MigrationNote[];
  /**
   * The folder the preview covered, or '' for the whole vault.
   */
  readonly scope: string;
  readonly snapshots: ReadonlyMap<TFile, MigrationSnapshot>;
  /**
   * The one tag the preview converts, without its `#`, or `null` for every tag.
   */
  readonly tag: null | string;
  readonly tags: readonly MigrationTag[];
}

interface MigrationSnapshot {
  readonly content: string;
  readonly path: string;
}

interface MigrationTag {
  readonly alias: null | string;
  readonly existing: null | TFile;
  readonly parent: null | string;
  readonly path: string;
  readonly tag: string;
}

interface ReadNote extends MigrationNote {
  /**
   * Every tag of the note, in scope or not.
   */
  readonly allTags: readonly string[];
}

interface TagMigrationConstructorParams {
  readonly app: App;
  readonly settings: PluginSettings;
}

interface TagMigrationMapTagsParams {
  readonly allConcepts: ReadonlySet<string>;
  readonly concepts: ReadonlySet<string>;
  readonly files: readonly TFile[];
  readonly scopedTag: null | string;
  readonly tagNote: null | TFile;
}

export class TagMigration {
  private readonly app: App;
  private readonly appliedPlans = new WeakSet<MigrationPlan>();
  private readonly settings: PluginSettings;

  public constructor(params: TagMigrationConstructorParams) {
    this.app = params.app;
    this.settings = Object.assign(new PluginSettings(), params.settings);
  }

  public async apply(plan: MigrationPlan): Promise<void> {
    if (this.appliedPlans.has(plan)) {
      throw new Error('This preview has already been applied. Open a new preview.');
    }
    for (const [file, snapshot] of plan.snapshots) {
      if (file.path !== snapshot.path || this.app.vault.getFileByPath(file.path) !== file || await this.app.vault.read(file) !== snapshot.content) {
        throw new Error(`${file.path} changed since the preview. Open a new preview.`);
      }
    }
    for (const tag of plan.tags) {
      if (!tag.existing && this.app.vault.getAbstractFileByPath(tag.path)) {
        throw new Error(`${tag.path} was created since the preview. Open a new preview.`);
      }
    }
    this.appliedPlans.add(plan);
    const targets = await this.createTargets(plan);
    const notes = new Map(plan.notes.map((note) => [note.file, note]));
    const tags = new Map(plan.tags.map((tag) => [this.getTarget(targets, tag.tag), tag]));
    const affected = new Set([...notes.keys(), ...tags.keys()]);
    for (const file of affected) {
      const note = notes.get(file);
      const tag = tags.get(file);
      const before = plan.snapshots.get(file)?.content ?? '';
      let content = before;
      const frontmatter = parseFrontmatter(content);
      if (note) {
        content = this.convertInline(note, targets);
        frontmatter[this.settings.tagsPropertyName] = toPropertyValue([...new Set([...this.readList(frontmatter[this.settings.tagsPropertyName], file.path), ...note.tags.map((name) => this.link(targets, name, file.path))])]);
        for (const [key, kept] of note.keptPropertyTags) {
          if (kept.length === 0) {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- The key is the note's own spelling of the core tags property.
            delete frontmatter[key];
          } else {
            frontmatter[key] = [...kept];
          }
        }
      }
      if (tag?.parent) {
        frontmatter[this.settings.parentPropertyName] = toPropertyValue([...new Set([...this.readList(frontmatter[this.settings.parentPropertyName], file.path), this.link(targets, tag.parent, file.path)])]);
      }
      if (tag?.alias) {
        frontmatter.aliases = [...new Set([...this.readList(frontmatter.aliases, file.path), tag.alias])];
      }
      const after = setFrontmatter(content, frontmatter);
      if (after !== before) {
        await this.app.vault.process(file, (current) => {
          if (current !== before) {
            throw new Error(`${file.path} changed during conversion. Some earlier changes may already have been applied.`);
          }
          return after;
        });
      }
      // The loop does not use `loop()`, so it refreshes the bulk-operation lock's heartbeat itself.
      reportBulkOperationProgress();
    }
  }

  public async preview(folder: string, options: TagMigrationPreviewOptions = {}): Promise<MigrationPlan> {
    const scope = folder.trim().replaceAll(/^\/+|\/+$/gu, '');
    if (scope && !this.app.vault.getFolderByPath(scope)) {
      throw new Error('Choose an existing vault folder, or leave the folder empty for the whole vault.');
    }
    const scopedTag = options.tag === undefined ? null : options.tag.trim().replace(/^#/u, '');
    if (scopedTag === '') {
      throw new Error('Choose a tag to convert.');
    }
    const tagNote = options.tagNote ?? null;
    const notes: MigrationNote[] = [];
    const concepts = new Set<string>();
    const allConcepts = new Set<string>();
    const snapshots = new Map<TFile, MigrationSnapshot>();
    // Notes in excluded folders (templates, say) keep their tags and are never reused as tag notes.
    const files = this.app.vault.getMarkdownFiles()
      .filter((file) => !isInExcludedFolder(file.path, this.settings.excludedFolders))
      .sort((a, b) => a.path.localeCompare(b.path));
    for (const file of files) {
      if (scope && !file.path.startsWith(`${scope}/`)) {
        continue;
      }
      const { allTags, ...note } = await this.readNote(file, scopedTag);
      for (const tag of allTags) {
        addConcepts(allConcepts, tag);
      }
      if (note.tags.length === 0) {
        continue;
      }
      for (const tag of note.tags) {
        if (tag.split('/').some((part) => !part || /[\\:*?"<>|\p{Cc}]/u.test(part) || /[. ]$/u.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part))) {
          throw new Error(`Cannot convert tag #${tag} to a safe note name in ${file.path}.`);
        }
        addConcepts(concepts, tag);
      }
      notes.push(note);
      snapshots.set(file, { content: note.content, path: file.path });
    }
    const tags = this.mapTags({ allConcepts, concepts, files, scopedTag, tagNote });
    for (const tag of tags) {
      if (!tag.existing) {
        continue;
      }
      const content = await this.app.vault.read(tag.existing);
      const frontmatter = parseFrontmatter(content);
      if (!checkIsPlainObject(frontmatter)) {
        throw new Error(`Invalid properties in ${tag.path}`);
      }
      this.readList(frontmatter[this.settings.parentPropertyName], tag.path);
      if (tag.alias) {
        this.readList(frontmatter.aliases, tag.path);
      }
      const previous = snapshots.get(tag.existing);
      if (previous && previous.content !== content) {
        throw new Error(`${tag.path} changed while building the preview. Open a new preview.`);
      }
      snapshots.set(tag.existing, { content, path: tag.path });
    }
    return { notes, scope, snapshots, tag: scopedTag, tags };
  }

  private convertInline(note: MigrationNote, targets: ReadonlyMap<string, TFile>): string {
    let content = note.content;
    for (const inline of [...note.inlineTags].sort((a, b) => b.position.start.offset - a.position.start.offset)) {
      const { end, start } = inline.position;
      const replacement = this.settings.inlineTagConversion === 'keep' ? inline.tag : (this.settings.inlineTagConversion === 'remove' ? '' : this.link(targets, inline.tag.slice(1), note.file.path));
      content = content.slice(0, start.offset) + replacement + content.slice(end.offset);
    }
    return content;
  }

  private async createTargets(plan: MigrationPlan): Promise<Map<string, TFile>> {
    const targets = new Map<string, TFile>();
    // Create all targets before asking core to generate links, including relative Markdown links.
    for (const tag of plan.tags) {
      let file = tag.existing;
      if (!file) {
        const folder = tag.path.includes('/') ? tag.path.slice(0, tag.path.lastIndexOf('/')) : '';
        if (folder) {
          await createFolderSafe(this.app, folder);
        }
        file = await this.app.vault.create(tag.path, '');
        reportBulkOperationProgress();
      }
      targets.set(tag.tag, file);
    }
    return targets;
  }

  private getTagPropertyKeys(frontmatter: object): string[] {
    return Object.keys(frontmatter).filter((key) => key.toLowerCase() === 'tags');
  }

  private getTarget(targets: ReadonlyMap<string, TFile>, tag: string): TFile {
    const file = targets.get(tag);
    if (!file) {
      throw new Error(`Missing target for #${tag}`);
    }
    return file;
  }

  private link(targets: ReadonlyMap<string, TFile>, tag: string, source: string): string {
    return this.app.fileManager.generateMarkdownLink(this.getTarget(targets, tag), source);
  }

  private mapTags(params: TagMigrationMapTagsParams): MigrationTag[] {
    const { allConcepts, concepts, files, scopedTag, tagNote } = params;
    // A one-tag conversion counts leaves over every tag in scope, so it names notes as the full conversion would.
    const leaves = new Map<string, number>();
    for (const tag of allConcepts) {
      const leaf = tag.slice(tag.lastIndexOf('/') + 1).toLowerCase();
      leaves.set(leaf, (leaves.get(leaf) ?? 0) + 1);
    }
    const claimed = new Set<string>();
    return [...concepts].sort().map((tag) => {
      const separator = tag.lastIndexOf('/');
      const parent = separator === -1 ? null : tag.slice(0, separator);
      const leaf = tag.slice(separator + 1);
      const hasCollision = leaves.get(leaf.toLowerCase()) !== 1;
      const name = hasCollision ? `${leaf} (${parent?.replaceAll('/', ' - ') ?? 'root'})` : leaf;
      const path = normalizePath(`${this.settings.tagFolderPath}/${name}.md`);
      // The note the user chose for the converted tag carries the tag's leaf as an alias unless it is named after it.
      const chosen = scopedTag?.toLowerCase() === tag.toLowerCase() ? tagNote : null;
      const existing = chosen ?? findExistingTagNote(files, name, path, tag);
      const target = existing?.path ?? path;
      if (claimed.has(target.toLowerCase()) || (!existing && this.app.vault.getAbstractFileByPath(target))) {
        throw new Error(`Conflicting tag note path: ${target}`);
      }
      claimed.add(target.toLowerCase());
      const needsAlias = chosen ? chosen.basename.toLowerCase() !== leaf.toLowerCase() : hasCollision;
      return { alias: needsAlias ? leaf : null, existing, parent, path: target, tag };
    });
  }

  private readList(value: unknown, path: string): string[] {
    if (value === undefined || value === null) {
      return [];
    }
    if (typeof value === 'string') {
      return [value];
    }
    if (Array.isArray(value) && value.every((entry: unknown) => typeof entry === 'string')) {
      return value;
    }
    throw new Error(`Expected a string or list of strings in ${path}. Fix the property before converting.`);
  }

  private async readNote(file: TFile, scopedTag: null | string): Promise<ReadNote> {
    const content = await this.app.vault.read(file);
    const frontmatter = parseFrontmatter(content);
    if (!checkIsPlainObject(frontmatter)) {
      throw new Error(`Invalid properties in ${file.path}`);
    }
    const cache = await parseMetadata(this.app, content);
    const inlineTags = cache.tags ?? [];
    for (const inline of inlineTags) {
      const { end, start } = inline.position;
      if (content.slice(start.offset, end.offset) !== inline.tag || start.offset < getFrontMatterInfo(content).contentStart) {
        throw new Error(`Invalid tag position in ${file.path}. Open a new preview.`);
      }
    }
    const propertyTags: string[] = [];
    const keptPropertyTags = new Map<string, string[]>();
    for (const key of this.getTagPropertyKeys(frontmatter)) {
      const values = this.readList(frontmatter[key], file.path);
      const kept: string[] = [];
      for (const value of values) {
        const parsed = ensureNonNullable(parseFrontMatterTags({ tags: [value] }));
        if (parsed.length !== 1) {
          throw new Error(`Invalid tag value in ${file.path}: ${value}. Fix the tags property before converting.`);
        }
        const tag = ensureNonNullable(parsed[0]);
        propertyTags.push(tag);
        if (!isInTagScope(tag, scopedTag)) {
          kept.push(value);
        }
      }
      // An empty core tags property is dropped by a full conversion, and left alone by a one-tag one.
      if (kept.length < values.length || (values.length === 0 && scopedTag === null)) {
        keptPropertyTags.set(key, kept);
      }
    }
    const allTags = [...new Set([...propertyTags, ...inlineTags.map((tag) => tag.tag)].map((tag) => tag.replace(/^#/u, '')))];
    const tags = allTags.filter((tag) => isInTagScope(tag, scopedTag));
    if (tags.length > 0) {
      this.readList(frontmatter[this.settings.tagsPropertyName], file.path);
    }
    return { allTags, content, file, inlineTags: inlineTags.filter((tag) => isInTagScope(tag.tag, scopedTag)), keptPropertyTags, tags };
  }
}

/**
 * Whether a tag is the scoped tag or under it. Obsidian compares tags case-insensitively.
 *
 * @param tag - The tag, with or without its `#`.
 * @param scopedTag - The scoped tag without its `#`, or `null` for every tag.
 * @returns Whether the tag converts.
 */
export function isInTagScope(tag: string, scopedTag: null | string): boolean {
  if (scopedTag === null) {
    return true;
  }
  const name = tag.replace(/^#/u, '').toLowerCase();
  const scope = scopedTag.toLowerCase();
  return name === scope || name.startsWith(`${scope}/`);
}

function addConcepts(concepts: Set<string>, tag: string): void {
  const parts = tag.split('/');
  for (let length = 1; length <= parts.length; length++) {
    concepts.add(parts.slice(0, length).join('/'));
  }
}

function findExistingTagNote(files: readonly TFile[], name: string, path: string, tag: string): null | TFile {
  const candidates = files.filter((file) => file.basename.toLowerCase() === name.toLowerCase());
  const existing = candidates.find((file) => file.path.toLowerCase() === path.toLowerCase()) ?? (candidates.length === 1 ? candidates[0] : null) ?? null;
  if (!existing && candidates.length > 1) {
    throw new Error(`Several existing notes match #${tag}. Give the intended tag note a unique name before converting.`);
  }
  return existing;
}
