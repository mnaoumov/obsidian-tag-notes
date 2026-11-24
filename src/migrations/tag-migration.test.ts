import type { TFile } from 'obsidian';

import { parseFrontmatter } from '@mnaoumov/obsidian-lib/frontmatter';
// eslint-disable-next-line import-x/no-namespace -- Control native parser results for invalid-metadata validation.
import * as metadata from '@mnaoumov/obsidian-lib/metadata-cache';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  expect,
  it,
  vi
} from 'vitest';

import { PluginSettings } from '../plugin-settings.ts';
import { TagMigration } from './tag-migration.ts';

interface TargetHost {
  readonly getTarget: (targets: ReadonlyMap<string, TFile>, tag: string) => void;
}

afterEach(() => {
  vi.restoreAllMocks();
});

it('previews without writes and converts hierarchy, collisions and inline tags while preserving properties', async () => {
  const app = App.createConfigured__({
    files: {
      'alpha.md': '---\ntags: [alpha/bravo, charlie/bravo]\nkeywords: ["[[Existing]]"]\nother: preserved\n---\nSentence #alpha/bravo and #charlie/bravo.\n`#code`\n',
      'charlie.md': 'Existing tag note',
      'Existing.md': ''
    }
  });
  const migration = new TagMigration({ app: app.asOriginalType__(), settings: new PluginSettings() });
  const plan = await migration.preview('');
  expect(app.vault.getMarkdownFiles()).toHaveLength(3);
  expect(plan.tags.map((tag) => tag.path)).toContain('Tags/bravo (alpha).md');
  expect(plan.tags.map((tag) => tag.path)).toContain('Tags/bravo (charlie).md');
  await migration.apply(plan);
  const note = app.vault.getFileByPath('alpha.md');
  const child = app.vault.getFileByPath('Tags/bravo (charlie).md');
  if (!note || !child) {
    throw new Error('Missing migrated note');
  }
  const content = await app.vault.read(note);
  expect(parseFrontmatter(content)['keywords']).toContain('[[Existing]]');
  expect(parseFrontmatter(content)['other']).toBe('preserved');
  expect(parseFrontmatter(content).tags).toBeUndefined();
  expect(content).toContain('Sentence [[');
  expect(content).toContain('`#code`');
  expect(parseFrontmatter(await app.vault.read(child)).aliases).toEqual(['bravo']);
  expect(parseFrontmatter(await app.vault.read(child))['broader']).toBe('[[charlie]]');
});

it('rejects a stale preview before creating any tag notes', async () => {
  const app = App.createConfigured__({ files: { 'alpha.md': '#alpha' } });
  const migration = new TagMigration({ app: app.asOriginalType__(), settings: new PluginSettings() });
  const plan = await migration.preview('');
  const file = app.vault.getFileByPath('alpha.md');
  if (!file) {
    throw new Error('Missing source');
  }
  await app.vault.modify(file, 'New content');
  await expect(migration.apply(plan)).rejects.toThrow('changed');
  expect(app.vault.getFileByPath('Tags/alpha.md')).toBeNull();
});

it.each(['keep', 'remove'] as const)('uses %s for inline tags and adds property links in a selected folder only', async (mode) => {
  const app = App.createConfigured__({ files: { 'Folder/note.md': 'Text #alpha #bravo.', 'FolderElse/other.md': '#charlie', 'no-tags.md': 'Plain' } });
  const settings = new PluginSettings();
  settings.inlineTagConversion = mode;
  settings.tagFolderPath = '';
  const migration = new TagMigration({ app: app.asOriginalType__(), settings });
  const plan = await migration.preview('/Folder/');
  expect(plan.notes.map((note) => note.file.path)).toEqual(['Folder/note.md']);
  expect(plan.tags.map((tag) => tag.path)).toEqual(['alpha.md', 'bravo.md']);
  await migration.apply(plan);
  const source = app.vault.getFileByPath('Folder/note.md');
  if (!source) {
    throw new Error('Missing source');
  }
  const content = await app.vault.read(source);
  expect(content).toContain(mode === 'keep' ? 'Text #alpha #bravo.' : 'Text  .');
  expect(parseFrontmatter(content)['keywords']).toEqual(['[[alpha]]', '[[bravo]]']);
  expect(app.vault.getFolderByPath('alpha.m')).toBeNull();
  expect(app.vault.getFolderByPath('bravo.m')).toBeNull();
  await expect(migration.apply(plan)).rejects.toThrow('already been applied');
});

it('keeps existing scalar properties and merges parents and aliases without duplicate values', async () => {
  const app = App.createConfigured__({
    files: {
      'bravo (alpha).md': '---\nbroader: "[[alpha]]"\naliases: bravo\n---\nExisting body',
      'source.md': '---\ntags: [alpha/bravo, charlie/bravo]\nkeywords: "[[Keep]]"\n---\n',
      'Tags/alpha.md': '',
      'Tags/bravo (charlie).md': '---\nbroader: null\naliases: null\n---\n'
    }
  });
  const migration = new TagMigration({ app: app.asOriginalType__(), settings: new PluginSettings() });
  const plan = await migration.preview('');
  await migration.apply(plan);
  const reused = app.vault.getFileByPath('bravo (alpha).md');
  const source = app.vault.getFileByPath('source.md');
  if (!reused || !source) {
    throw new Error('Missing source');
  }
  expect(parseFrontmatter(await app.vault.read(reused))).toMatchObject({ aliases: ['bravo'], broader: '[[alpha]]' });
  expect(await app.vault.read(reused)).toContain('Existing body');
  expect(parseFrontmatter(await app.vault.read(source))['keywords']).toContain('[[Keep]]');
});

it('disambiguates a root and nested tag and prefers an exact target-folder match', async () => {
  const app = App.createConfigured__({ files: { 'Other/alpha (root).md': '', 'source.md': '#alpha #bravo/alpha', 'Tags/alpha (root).md': '' } });
  const migration = new TagMigration({ app: app.asOriginalType__(), settings: new PluginSettings() });
  const plan = await migration.preview('');
  expect(plan.tags.find((tag) => tag.tag === 'alpha')?.path).toBe('Tags/alpha (root).md');
  expect(plan.tags.find((tag) => tag.tag === 'bravo/alpha')?.path).toBe('Tags/alpha (bravo).md');
});

it.each([
  ['---\n- alpha\n---\n', 'Invalid properties'],
  ['---\ntags: [12]\n---\n', 'Expected a string'],
  ['---\ntags: alpha\nkeywords: {alpha: bravo}\n---\n', 'Expected a string'],
  ['---\ntags: alpha//bravo\n---\n', 'safe note name'],
  ['---\ntags: "alpha:bravo"\n---\n', 'safe note name'],
  ['---\ntags: con\n---\n', 'safe note name'],
  ['---\ntags: alpha.\n---\n', 'safe note name']
])('refuses invalid properties or filenames before any write: %s', async (content, error) => {
  const app = App.createConfigured__({ files: { 'source.md': content } });
  const migration = new TagMigration({ app: app.asOriginalType__(), settings: new PluginSettings() });
  await expect(migration.preview('')).rejects.toThrow(error);
  expect(app.vault.getMarkdownFiles()).toHaveLength(1);
});

it('refuses ambiguous existing note names and occupied paths without overwriting', async () => {
  const app = App.createConfigured__({ files: { 'One/alpha.md': '', 'source.md': '#alpha', 'Two/alpha.md': '' } });
  const migration = new TagMigration({ app: app.asOriginalType__(), settings: new PluginSettings() });
  await expect(migration.preview('')).rejects.toThrow('Several existing');
  await app.fileManager.trashFile(app.vault.getFileByPath('One/alpha.md') ?? app.vault.getRoot());
  await app.fileManager.trashFile(app.vault.getFileByPath('Two/alpha.md') ?? app.vault.getRoot());
  await app.vault.createFolder('Tags/alpha.md');
  await expect(migration.preview('')).rejects.toThrow('Conflicting tag note path');
});

it('refuses a filename collision between distinct tag spellings', async () => {
  const app = App.createConfigured__({ files: { 'source.md': '#alpha #Alpha' } });
  await expect(new TagMigration({ app: app.asOriginalType__(), settings: new PluginSettings() }).preview('')).rejects.toThrow('Conflicting tag note path');
});

it('refuses new occupied targets and renamed or deleted sources after preview', async () => {
  const app = App.createConfigured__({ files: { 'source.md': '#alpha' } });
  const migration = new TagMigration({ app: app.asOriginalType__(), settings: new PluginSettings() });
  const plan = await migration.preview('');
  await app.vault.createFolder('Tags');
  const occupied = await app.vault.create('Tags/alpha.md', 'Do not overwrite');
  await expect(migration.apply(plan)).rejects.toThrow('created since');
  await app.fileManager.trashFile(occupied);
  const source = app.vault.getFileByPath('source.md');
  if (!source) {
    throw new Error('Missing source');
  }
  await app.vault.rename(source, 'moved.md');
  await expect(migration.apply(plan)).rejects.toThrow('changed');
  await app.vault.rename(source, 'source.md');
  await app.fileManager.trashFile(source);
  await expect(migration.apply(plan)).rejects.toThrow('changed');
});

it('rejects a source changed during conversion through the atomic file processor', async () => {
  const app = App.createConfigured__({ files: { 'source.md': '#alpha' } });
  const migration = new TagMigration({ app: app.asOriginalType__(), settings: new PluginSettings() });
  const plan = await migration.preview('');
  const process = app.vault.process.bind(app.vault);
  vi.spyOn(app.vault, 'process').mockImplementation(async (file, callback) => {
    await app.vault.modify(file, 'Concurrent edit');
    return process(file, callback);
  });
  await expect(migration.apply(plan)).rejects.toThrow('changed during conversion');
  const source = app.vault.getFileByPath('source.md');
  if (!source) {
    throw new Error('Missing source');
  }
  expect(await app.vault.read(source)).toBe('Concurrent edit');
});

it('rejects inconsistent native parser offsets before any notes are created', async () => {
  const app = App.createConfigured__({ files: { 'source.md': '#alpha' } });
  vi.spyOn(metadata, 'parseMetadata').mockResolvedValue({ features: [], tags: [{ position: { end: { col: 6, line: 0, offset: 7 }, start: { col: 0, line: 0, offset: 1 } }, tag: '#alpha' }] });
  await expect(new TagMigration({ app: app.asOriginalType__(), settings: new PluginSettings() }).preview('')).rejects.toThrow('Invalid tag position');
  expect(app.vault.getMarkdownFiles()).toHaveLength(1);
});

it('rejects inconsistent metadata pointing inside frontmatter', async () => {
  const app = App.createConfigured__({ files: { 'source.md': '---\ntags: alpha\n---\n' } });
  vi.spyOn(metadata, 'parseMetadata').mockResolvedValue({ features: [], tags: [{ position: { end: { col: 11, line: 1, offset: 15 }, start: { col: 6, line: 1, offset: 10 } }, tag: 'alpha' }] });
  await expect(new TagMigration({ app: app.asOriginalType__(), settings: new PluginSettings() }).preview('')).rejects.toThrow('Invalid tag position');
});

it('rejects a reused source changed while the preview is being built', async () => {
  const app = App.createConfigured__({ files: { 'alpha.md': '#alpha/bravo' } });
  const read = app.vault.read.bind(app.vault);
  let reads = 0;
  vi.spyOn(app.vault, 'read').mockImplementation((file) => {
    reads++;
    return reads > 1 ? Promise.resolve('Changed') : read(file);
  });
  await expect(new TagMigration({ app: app.asOriginalType__(), settings: new PluginSettings() }).preview('')).rejects.toThrow('changed while');
});

it('reports an incomplete target map rather than producing an unresolved link', () => {
  const app = App.createConfigured__();
  const migration = new TagMigration({ app: app.asOriginalType__(), settings: new PluginSettings() });
  expect(() => {
    castTo<TargetHost>(migration).getTarget(new Map(), 'alpha');
  }).toThrow('Missing target');
});

it('refuses to discard an invalid tags entry when converting valid inline tags', async () => {
  const app = App.createConfigured__({ files: { 'source.md': '---\ntags: [alpha, "bad tag"]\n---\n#bravo' } });
  await expect(new TagMigration({ app: app.asOriginalType__(), settings: new PluginSettings() }).preview('')).rejects.toThrow('Invalid tag value');
});

it('allows a fresh preview after a write failure while keeping the failed preview single-use', async () => {
  const app = App.createConfigured__({ files: { 'source.md': '#alpha' } });
  const migration = new TagMigration({ app: app.asOriginalType__(), settings: new PluginSettings() });
  const plan = await migration.preview('');
  const process = vi.spyOn(app.vault, 'process').mockRejectedValueOnce(new Error('Disk full'));
  await expect(migration.apply(plan)).rejects.toThrow('Disk full');
  process.mockRestore();
  await expect(migration.apply(plan)).rejects.toThrow('already been applied');
  await migration.apply(await migration.preview(''));
  const source = app.vault.getFileByPath('source.md');
  if (!source) {
    throw new Error('Missing source');
  }
  expect(parseFrontmatter(await app.vault.read(source))['keywords']).toBe('[[alpha]]');
});

it('converts a case-insensitive core tags property and removes its original key', async () => {
  const app = App.createConfigured__({ files: { 'source.md': '---\nTags: alpha\n---\n' } });
  const migration = new TagMigration({ app: app.asOriginalType__(), settings: new PluginSettings() });
  await migration.apply(await migration.preview(''));
  const source = app.vault.getFileByPath('source.md');
  if (!source) {
    throw new Error('Missing source');
  }
  const frontmatter = parseFrontmatter(await app.vault.read(source));
  expect(frontmatter['Tags']).toBeUndefined();
  expect(frontmatter['keywords']).toBe('[[alpha]]');
});

it('converts one tag and the tags under it, leaving every other tag in place', async () => {
  const app = App.createConfigured__({
    files: {
      'other.md': '---\ntags: [charlie]\n---\n#charlie',
      'source.md': '---\ntags: [alpha, charlie]\nEmpty: null\n---\nSee #alpha/bravo, #alphabet and #charlie.\n'
    }
  });
  const migration = new TagMigration({ app: app.asOriginalType__(), settings: new PluginSettings() });
  const plan = await migration.preview('', { tag: '#alpha' });
  expect(plan.tag).toBe('alpha');
  expect(plan.notes.map((note) => note.file.path)).toEqual(['source.md']);
  expect(plan.tags.map((tag) => tag.tag)).toEqual(['alpha', 'alpha/bravo']);
  await migration.apply(plan);
  const source = app.vault.getFileByPath('source.md');
  if (!source) {
    throw new Error('Missing source');
  }
  const content = await app.vault.read(source);
  const frontmatter = parseFrontmatter(content);
  expect(frontmatter.tags).toEqual(['charlie']);
  expect(frontmatter['Empty']).toBeNull();
  expect(frontmatter['keywords']).toEqual(['[[alpha]]', '[[bravo]]']);
  expect(content).toContain('See [[bravo]], #alphabet and #charlie.');
  expect(app.vault.getFileByPath('Tags/charlie.md')).toBeNull();
});

it('leaves an empty core tags property alone in a one-tag conversion and drops it in a full one', async () => {
  const app = App.createConfigured__({ files: { 'source.md': '---\ntags:\n---\n#alpha' } });
  const migration = new TagMigration({ app: app.asOriginalType__(), settings: new PluginSettings() });
  await migration.apply(await migration.preview('', { tag: 'alpha' }));
  const source = app.vault.getFileByPath('source.md');
  if (!source) {
    throw new Error('Missing source');
  }
  expect(Object.keys(parseFrontmatter(await app.vault.read(source)))).toContain('tags');
  await app.vault.modify(source, '---\ntags:\n---\n#bravo');
  await migration.apply(await migration.preview(''));
  expect(Object.keys(parseFrontmatter(await app.vault.read(source)))).not.toContain('tags');
});

it('names a one-tag conversion the way the full conversion would when its leaf collides elsewhere', async () => {
  const app = App.createConfigured__({ files: { 'one.md': '#alpha/bravo', 'two.md': '#charlie/bravo' } });
  const plan = await new TagMigration({ app: app.asOriginalType__(), settings: new PluginSettings() }).preview('', { tag: 'alpha/bravo' });
  expect(plan.tags.map((tag) => [tag.tag, tag.path, tag.alias])).toEqual([['alpha', 'Tags/alpha.md', null], ['alpha/bravo', 'Tags/bravo (alpha).md', 'bravo']]);
});

it('uses the chosen note as the tag note, adding the tag as an alias only when the names differ', async () => {
  const app = App.createConfigured__({ files: { 'Concepts/Alpha concept.md': 'Body', 'Other/alpha.md': '', 'source.md': '#alpha #bravo' } });
  const migration = new TagMigration({ app: app.asOriginalType__(), settings: new PluginSettings() });
  const chosen = app.vault.getFileByPath('Concepts/Alpha concept.md');
  const named = app.vault.getFileByPath('Other/alpha.md');
  if (!chosen || !named) {
    throw new Error('Missing notes');
  }
  const plan = await migration.preview('', { tag: 'alpha', tagNote: chosen.asOriginalType2__() });
  expect(plan.tags).toEqual([expect.objectContaining({ alias: 'alpha', path: 'Concepts/Alpha concept.md', tag: 'alpha' })]);
  await migration.apply(plan);
  expect(parseFrontmatter(await app.vault.read(chosen)).aliases).toEqual(['alpha']);
  expect(await app.vault.read(chosen)).toContain('Body');
  const source = app.vault.getFileByPath('source.md');
  if (!source) {
    throw new Error('Missing source');
  }
  expect(parseFrontmatter(await app.vault.read(source))['keywords']).toBe('[[Alpha concept]]');
  expect(await app.vault.read(source)).toContain('#bravo');
  const second = await migration.preview('', { tag: 'bravo', tagNote: named.asOriginalType2__() });
  expect(second.tags).toEqual([expect.objectContaining({ alias: 'bravo', path: 'Other/alpha.md' })]);
  await app.vault.modify(source, '#alpha');
  const exact = await migration.preview('', { tag: 'ALPHA', tagNote: named.asOriginalType2__() });
  expect(exact.tags).toEqual([expect.objectContaining({ alias: null, path: 'Other/alpha.md' })]);
});

it('refuses an empty tag and a chosen note another tag already maps to', async () => {
  const app = App.createConfigured__({ files: { 'source.md': '#Alpha #alpha', 'Tags/note.md': '' } });
  const migration = new TagMigration({ app: app.asOriginalType__(), settings: new PluginSettings() });
  await expect(migration.preview('', { tag: ' # ' })).rejects.toThrow('Choose a tag');
  const note = app.vault.getFileByPath('Tags/note.md');
  if (!note) {
    throw new Error('Missing note');
  }
  await expect(migration.preview('', { tag: 'alpha', tagNote: note.asOriginalType2__() })).rejects.toThrow('Conflicting tag note path: Tags/note.md');
});

it('leaves notes in excluded folders alone and never reuses one as a tag note', async () => {
  const template = '---\ntags: [alpha, invalid tag]\n---\n#bravo\n';
  const app = App.createConfigured__({ files: { 'source.md': '#alpha', 'Templates/alpha.md': template, 'Templates/sub/bravo.md': '#bravo' } });
  const settings = new PluginSettings();
  settings.excludedFolders = ['/Templates/'];
  const migration = new TagMigration({ app: app.asOriginalType__(), settings });
  const plan = await migration.preview('');
  expect(plan.notes.map((note) => note.file.path)).toEqual(['source.md']);
  expect(plan.tags).toEqual([expect.objectContaining({ existing: null, path: 'Tags/alpha.md', tag: 'alpha' })]);
  await migration.apply(plan);
  const file = app.vault.getFileByPath('Templates/alpha.md');
  if (!file) {
    throw new Error('Missing template');
  }
  expect(await app.vault.read(file)).toBe(template);
  expect(app.vault.getFileByPath('Tags/alpha.md')).not.toBeNull();
});

it.each([
  ['---\nplain\n---\n', 'Invalid properties'],
  ['---\nbroader: {alpha: bravo}\n---\n', 'Expected a string'],
  ['---\naliases: 12\n---\n', 'Expected a string']
])('rejects invalid properties in reused tag notes outside the selected folder: %s', async (content, error) => {
  const app = App.createConfigured__({ files: { 'bravo (alpha).md': content, 'Folder/source.md': '#alpha/bravo #charlie/bravo' } });
  const migration = new TagMigration({ app: app.asOriginalType__(), settings: new PluginSettings() });
  await expect(migration.preview('Folder')).rejects.toThrow(error);
  expect(app.vault.getFileByPath('Tags/alpha.md')).toBeNull();
});
