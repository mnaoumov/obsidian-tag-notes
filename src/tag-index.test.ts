import type {
  App,
  CachedMetadata,
  TFile
} from 'obsidian';

import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { PluginSettings } from './plugin-settings.ts';
import { TagIndex } from './tag-index.ts';

interface Fixture {
  add: (path: string, properties?: Record<string, unknown>) => TFile;
  caches: Map<TFile, CachedMetadata>;
  files: TFile[];
  index: TagIndex;
  reportCycle: ReturnType<typeof vi.fn>;
  settings: PluginSettings;
}

function fixture(): Fixture {
  const files: TFile[] = [];
  const caches = new Map<TFile, CachedMetadata>();
  const settings = new PluginSettings();
  const reportCycle = vi.fn();
  const app = castTo<App>({
    metadataCache: {
      getFileCache: (file: TFile): CachedMetadata | null => caches.get(file) ?? null,
      // eslint-disable-next-line unicorn/name-replacements -- Obsidian's API spelling.
      getFirstLinkpathDest: (path: string): TFile | undefined => files.find((file) => file.path === `${path}.md`)
    },
    vault: { getMarkdownFiles: (): TFile[] => [...files] }
  });
  const index = new TagIndex({ app, reportCycle, settings: (): PluginSettings => settings });
  return {
    add(path, properties = {}): TFile {
      const file = castTo<TFile>({ extension: 'md', path });
      files.push(file);
      const frontmatterLinks = Object.entries(properties).flatMap(([key, value]) =>
        Array.isArray(value)
          ? value.flatMap((entry: unknown, index_) => typeof entry === 'string' ? [{ key: `${key}.${String(index_)}`, link: entry, original: entry }] : [])
          : []
      );
      caches.set(file, { frontmatter: properties, frontmatterLinks });
      return file;
    },
    caches,
    files,
    index,
    reportCycle,
    settings
  };
}

describe('TagIndex', () => {
  it('rolls a diamond up once and accepts custom properties and the root folder', () => {
    const f = fixture();
    f.settings.tagFolderPath = '';
    f.settings.tagsPropertyName = 'topics';
    f.settings.parentPropertyName = 'up';
    const a = f.add('a.md');
    const b = f.add('b.md', { up: ['a'] });
    const c = f.add('c.md', { up: ['a'] });
    const d = f.add('d.md', { up: ['b', 'c'] });
    const note = f.add('note.md', { topics: ['d'] });
    f.index.rebuild();
    expect(new Set(f.index.getAncestors(d))).toEqual(new Set([a, b, c]));
    expect(f.index.getTaggedNotes(a, { includeDescendants: true })).toEqual([note]);
    expect(f.index.getCounts(a).withDescendants).toBe(1);
    expect(f.reportCycle).not.toHaveBeenCalled();
    const unknown = castTo<TFile>({ path: 'unknown.md' });
    expect(f.index.getTags(unknown)).toEqual([]);
    expect(f.index.getDescendants(unknown)).toEqual([]);
  });
  it('walks shared ancestors once while checking new edges and invalidates ancestry after repair', () => {
    const f = fixture();
    f.add('Tags/a.md');
    f.add('Tags/b.md', { broader: ['Tags/a'] });
    f.add('Tags/c.md', { broader: ['Tags/a'] });
    const d = f.add('Tags/d.md', { broader: ['Tags/b', 'Tags/c'] });
    const leaf = f.add('Tags/e.md', { broader: ['Tags/d'] });
    f.index.rebuild();
    expect(f.index.getAncestors(leaf)).toHaveLength(4);
    f.caches.set(d, { frontmatter: { broader: [] } });
    f.index.rebuild();
    expect(f.index.getAncestors(leaf)).toEqual([d]);
  });
  it('discovers linked tags anywhere and unused folder tags, with distinct direct and subtree notes', () => {
    const f = fixture();
    const root = f.add('Elsewhere/root.md');
    const child = f.add('Tags/child.md', { broader: ['Elsewhere/root'] });
    const unused = f.add('Tags/unused.md');
    const note = f.add('note.md', { keywords: ['Elsewhere/root', 'Tags/child', 'Tags/child', 'missing'] });
    const childOnly = f.add('second.md', { keywords: ['Tags/child'] });
    const mention = f.add('mention.md');
    f.index.rebuild();
    expect(new Set(f.index.getTagNotes())).toEqual(new Set([child, root, unused]));
    expect(f.index.getTags(note)).toEqual([root, child]);
    expect(f.index.getTaggedNotes(root)).toEqual([note]);
    expect(new Set(f.index.getTaggedNotes(root, { includeDescendants: true }))).toEqual(new Set([childOnly, note]));
    expect(f.index.getCounts(root)).toEqual({ direct: 1, withDescendants: 2 });
    expect(f.index.getCounts(unused)).toEqual({ direct: 0, withDescendants: 0 });
    expect(f.index.isTagNote(mention)).toBe(false);
    expect(f.index.getTags(mention)).toEqual([]);
    expect(f.index.getParents(child)).toEqual([root]);
    expect(f.index.getChildren(root)).toEqual([child]);
    expect(f.index.getAncestors(child)).toEqual([root]);
    expect(f.index.getDescendants(root)).toEqual([child]);
  });

  it('supports diamonds and breaks cycles without changing notes or repeating warnings', () => {
    const f = fixture();
    const a = f.add('Tags/a.md', { broader: ['Tags/d'] });
    const b = f.add('Tags/b.md', { broader: ['Tags/a'] });
    const c = f.add('Tags/c.md', { broader: ['Tags/a'] });
    const d = f.add('Tags/d.md', { broader: ['Tags/b', 'Tags/c', 'Tags/d'] });
    const original = structuredClone(f.caches.get(d) ?? {});
    f.index.rebuild();
    expect(f.index.getParents(d)).toEqual([]);
    expect(f.index.getAncestors(b)).toEqual([a, d]);
    expect(f.index.getDescendants(d)).toEqual([a, c, b]);
    expect(f.reportCycle).toHaveBeenCalledTimes(3);
    f.index.rebuild();
    expect(f.reportCycle).toHaveBeenCalledTimes(3);
    expect(f.caches.get(d)).toEqual(original);
    expect(f.index.getParents(c)).toEqual([a]);
    f.caches.set(d, { frontmatter: { broader: [] } });
    f.index.rebuild();
    expect(f.reportCycle).toHaveBeenCalledTimes(3);
    f.caches.set(d, original);
    f.index.rebuild();
    expect(f.reportCycle).toHaveBeenCalledTimes(6);
  });

  it('invalidates cached results after removal, link changes and settings changes', () => {
    const f = fixture();
    const parent = f.add('Tags/parent.md');
    const child = f.add('Tags/child.md', { broader: ['Tags/parent'] });
    const note = f.add('note.md', { keywords: ['Tags/child'] });
    f.index.rebuild();
    f.index.getDescendants(parent).length = 0;
    expect(f.index.getCounts(parent).withDescendants).toBe(1);
    f.files.splice(f.files.indexOf(child), 1);
    f.index.rebuild();
    expect(f.index.getDescendants(parent)).toEqual([]);
    expect(f.index.getTags(note)).toEqual([]);
    f.settings.tagFolderPath = 'Elsewhere';
    f.settings.tagsPropertyName = 'topics';
    f.settings.parentPropertyName = 'up';
    f.index.rebuild();
    expect(f.index.getTagNotes()).toEqual([]);
    expect(f.index.getParents(parent)).toEqual([]);
    expect(f.index.getChildren(parent)).toEqual([]);
    expect(f.index.getAncestors(parent)).toEqual([]);
    expect(f.index.getTaggedNotes(parent)).toEqual([]);
  });

  it('ignores scalar properties, nested entries, unresolved and non-markdown links', () => {
    const f = fixture();
    const tag = f.add('Tags/tag.md');
    const scalar = f.add('scalar.md', { keywords: 'Tags/tag' });
    const nested = f.add('nested.md', { keywords: [{ value: 'Tags/tag' }, 42] });
    f.caches.set(nested, {
      frontmatter: { keywords: [{}] },
      frontmatterLinks: [
        { key: 'keywords.0.value', link: 'Tags/tag', original: 'Tags/tag' },
        { key: 'keywordsExtra.0', link: 'Tags/tag', original: 'Tags/tag' }
      ]
    });
    const noCache = f.add('no-cache.md');
    f.caches.delete(noCache);
    const noFrontmatter = f.add('no-frontmatter.md');
    f.caches.set(noFrontmatter, {});
    const noLinks = f.add('no-links.md');
    f.caches.set(noLinks, { frontmatter: { keywords: [] } });
    const attachment = f.add('image.md');
    attachment.extension = 'png';
    f.add('attachment-link.md', { keywords: ['image'] });
    f.index.rebuild();
    expect(f.index.getTags(scalar)).toEqual([]);
    expect(f.index.getTags(nested)).toEqual([]);
    expect(f.index.isTagNote(tag)).toBe(true);
    expect(f.index.getCounts(tag).direct).toBe(0);
  });
});
