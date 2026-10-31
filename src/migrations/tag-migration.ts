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
import { deleteProperties } from '@mnaoumov/typescript-lib/object-utils';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import {
  getFrontMatterInfo,
  normalizePath,
  parseFrontMatterTags
} from 'obsidian';

import { PluginSettings } from '../plugin-settings.ts';

interface MigrationNote {
  readonly content: string;
  readonly file: TFile;
  readonly inlineTags: readonly TagCache[];
  readonly tags: readonly string[];
}

interface MigrationPlan {
  readonly notes: readonly MigrationNote[];
  /**
   * The folder the preview covered, or '' for the whole vault.
   */
  readonly scope: string;
  readonly snapshots: ReadonlyMap<TFile, MigrationSnapshot>;
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

interface TagMigrationConstructorParams {
  readonly app: App;
  readonly settings: PluginSettings;
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
        frontmatter[this.settings.tagsPropertyName] = [...new Set([...this.readList(frontmatter[this.settings.tagsPropertyName], file.path), ...note.tags.map((name) => this.link(targets, name, file.path))])];
        deleteProperties(frontmatter, this.getTagPropertyKeys(frontmatter));
      }
      if (tag?.parent) {
        frontmatter[this.settings.parentPropertyName] = [...new Set([...this.readList(frontmatter[this.settings.parentPropertyName], file.path), this.link(targets, tag.parent, file.path)])];
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

  public async preview(folder: string): Promise<MigrationPlan> {
    const scope = folder.trim().replaceAll(/^\/+|\/+$/gu, '');
    if (scope && !this.app.vault.getFolderByPath(scope)) {
      throw new Error('Choose an existing vault folder, or leave the folder empty for the whole vault.');
    }
    const notes: MigrationNote[] = [];
    const concepts = new Set<string>();
    const snapshots = new Map<TFile, MigrationSnapshot>();
    const files = this.app.vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path));
    for (const file of files) {
      if (scope && !file.path.startsWith(`${scope}/`)) {
        continue;
      }
      const note = await this.readNote(file);
      if (note.tags.length === 0) {
        continue;
      }
      for (const tag of note.tags) {
        const parts = tag.split('/');
        if (parts.some((part) => !part || /[\\:*?"<>|\p{Cc}]/u.test(part) || /[. ]$/u.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part))) {
          throw new Error(`Cannot convert tag #${tag} to a safe note name in ${file.path}.`);
        }
        for (let length = 1; length <= parts.length; length++) {
          concepts.add(parts.slice(0, length).join('/'));
        }
      }
      notes.push(note);
      snapshots.set(file, { content: note.content, path: file.path });
    }
    const tags = this.mapTags(concepts, files);
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
    return { notes, scope, snapshots, tags };
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

  private mapTags(concepts: ReadonlySet<string>, files: readonly TFile[]): MigrationTag[] {
    const leaves = new Map<string, number>();
    for (const tag of concepts) {
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
      const candidates = files.filter((file) => file.basename.toLowerCase() === name.toLowerCase());
      const existing = candidates.find((file) => file.path.toLowerCase() === path.toLowerCase()) ?? (candidates.length === 1 ? candidates[0] : null) ?? null;
      if (!existing && candidates.length > 1) {
        throw new Error(`Several existing notes match #${tag}. Give the intended tag note a unique name before converting.`);
      }
      const target = existing?.path ?? path;
      if (claimed.has(target.toLowerCase()) || (!existing && this.app.vault.getAbstractFileByPath(target))) {
        throw new Error(`Conflicting tag note path: ${target}`);
      }
      claimed.add(target.toLowerCase());
      return { alias: hasCollision ? leaf : null, existing, parent, path: target, tag };
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

  private async readNote(file: TFile): Promise<MigrationNote> {
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
    for (const key of this.getTagPropertyKeys(frontmatter)) {
      for (const value of this.readList(frontmatter[key], file.path)) {
        const parsed = ensureNonNullable(parseFrontMatterTags({ tags: [value] }));
        if (parsed.length !== 1) {
          throw new Error(`Invalid tag value in ${file.path}: ${value}. Fix the tags property before converting.`);
        }
        propertyTags.push(...parsed);
      }
    }
    const tags = [...new Set([...propertyTags, ...inlineTags.map((tag) => tag.tag)].map((tag) => tag.replace(/^#/u, '')))];
    if (tags.length > 0) {
      this.readList(frontmatter[this.settings.tagsPropertyName], file.path);
    }
    return { content, file, inlineTags, tags };
  }
}
