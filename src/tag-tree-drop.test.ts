import type { TFile } from 'obsidian';

import {
  parseFrontmatter,
  setFrontmatter
} from '@mnaoumov/obsidian-lib/frontmatter';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { TagNotesApi } from '../api.d.ts';

import { moveTag } from './tag-tree-drop.ts';

interface Fixture {
  readonly a: TFile;
  readonly app: App;
  readonly b: TFile;
  readonly c: TFile;
  readonly descendants: TFile[];
  readonly move: (params: Partial<MoveParams>) => Promise<null | string>;
  readonly read: () => Promise<unknown>;
}

interface MoveParams {
  readonly fromParent: null | TFile;
  readonly shouldAddParent: boolean;
  readonly target: null | TFile;
}

afterEach(() => {
  vi.restoreAllMocks();
});

function fixture(broader: unknown): Fixture {
  const app = App.createConfigured__({ files: { 'Tags/A.md': '', 'Tags/B.md': '', 'Tags/C.md': '', 'Tags/Child.md': setFrontmatter('Body', { broader }) } });
  const [a, b, c, child] = ['Tags/A.md', 'Tags/B.md', 'Tags/C.md', 'Tags/Child.md'].map((path) => app.vault.getFileByPath(path)?.asOriginalType2__());
  if (!a || !b || !c || !child) {
    throw new Error('Missing fixture file');
  }
  vi.spyOn(app.fileManager, 'generateMarkdownLink').mockImplementation((target) => `[[${target.basename}]]`);
  vi.spyOn(app.metadataCache, 'getFirstLinkpathDest').mockImplementation((path) => app.vault.getFileByPath(`Tags/${path}.md`));
  const descendants: TFile[] = [];
  const api = castTo<TagNotesApi>({ getDescendants: (): TFile[] => descendants });
  return {
    a,
    app,
    b,
    c,
    descendants,
    move: (params) => moveTag({ api, app: app.asOriginalType__(), fromParent: a, parentPropertyName: 'broader', shouldAddParent: false, tag: child, target: b, ...params }),
    read: async () => parseFrontmatter(await app.vault.adapter.read(child.path))['broader']
  };
}

describe('moveTag', () => {
  it('replaces the parent the row was dragged from with the target, writing one link as text', async () => {
    const f = fixture(['[[A]]']);
    expect(await f.move({})).toBeNull();
    expect(await f.read()).toBe('[[B]]');
  });

  it('keeps the other parents and their order when moving', async () => {
    const f = fixture(['[[C]]', '[[A]]']);
    await f.move({});
    expect(await f.read()).toEqual(['[[C]]', '[[B]]']);
  });

  it('adds the target as another parent with the modifier', async () => {
    const f = fixture('[[A]]');
    await f.move({ shouldAddParent: true });
    expect(await f.read()).toEqual(['[[A]]', '[[B]]']);
  });

  it('does not duplicate a target that is already a parent', async () => {
    const f = fixture(['[[A]]', '[[B]]']);
    await f.move({ shouldAddParent: true });
    expect(await f.read()).toEqual(['[[A]]', '[[B]]']);
    await f.move({});
    expect(await f.read()).toBe('[[B]]');
  });

  it('adds the first parent to a root tag', async () => {
    const f = fixture(null);
    await f.move({ fromParent: null });
    expect(await f.read()).toBe('[[B]]');
  });

  it('makes a tag a root on a drop on empty space, removing the property when no parent is left', async () => {
    const f = fixture('[[A]]');
    await f.move({ target: null });
    expect(await f.read()).toBeUndefined();
    const g = fixture(['[[A]]', '[[C]]']);
    await g.move({ target: null });
    expect(await g.read()).toBe('[[C]]');
  });

  it('leaves the note untouched for no-op drops', async () => {
    const f = fixture(['[[A]]', 'https://example.com', '[[Missing]]']);
    const process = vi.spyOn(f.app.fileManager, 'processFrontMatter');
    expect(await f.move({ target: f.a })).toBeNull();
    expect(await f.move({ shouldAddParent: true, target: null })).toBeNull();
    expect(await f.move({ fromParent: null, target: null })).toBeNull();
    expect(process).not.toHaveBeenCalled();
    await f.move({ fromParent: f.c, shouldAddParent: false, target: f.a });
    expect(await f.read()).toEqual(['[[A]]', 'https://example.com', '[[Missing]]']);
  });

  it('ignores a drop on itself and refuses a drop under its own descendant', async () => {
    const f = fixture('[[A]]');
    const child = castTo<TFile>(f.app.vault.getFileByPath('Tags/Child.md')?.asOriginalType2__());
    expect(await f.move({ target: child })).toBeNull();
    f.descendants.push(f.b);
    expect(await f.move({})).toBe('Cannot move Child under B: B is inside Child, so the hierarchy would become a cycle.');
    expect(await f.read()).toBe('[[A]]');
  });

  it('rejects a parent property that is not a string or a list of strings and leaves it unchanged', async () => {
    const f = fixture({ nested: '[[A]]' });
    await expect(f.move({})).rejects.toThrow('The broader property must be a string or a list of strings. Its contents were left unchanged.');
    const g = fixture(['[[A]]', 1]);
    await expect(g.move({})).rejects.toThrow(TypeError);
    expect(await g.read()).toEqual(['[[A]]', 1]);
  });
});
