import { evalInObsidian } from 'obsidian-integration-testing';
import {
  describe,
  expect,
  it
} from 'vitest';

import type { TagNotesApi } from '../api.d.ts';

describe('Tag index in Obsidian', () => {
  it('applies all three saved settings live and rejects the core tags property', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { waitUntil } }) {
        const plugin = app.plugins.getPlugin('tag-notes');
        if (!plugin || !('api' in plugin) || !plugin.onExternalSettingsChange) {
          throw new Error('Tag Notes API missing');
        }
        const api = plugin.api as TagNotesApi;
        const saved: unknown = await plugin.loadData();
        try {
          await app.vault.createFolder('Concepts');
          const parent = await app.vault.create('Concepts/Root.md', 'Root');
          const child = await app.vault.create('Concepts/Leaf.md', '---\nup:\n  - "[[Root]]"\n---\n');
          const note = await app.vault.create('CustomSettings.md', '---\ntopics:\n  - "[[Concepts/Leaf]]"\n---\n');
          await plugin.saveData({ parentPropertyName: 'up', tagFolderPath: 'Concepts', tagsPropertyName: 'topics' });
          await plugin.onExternalSettingsChange();
          await waitUntil({ message: 'custom settings indexed', predicate: () => api.getTags(note).length === 1 && api.getParents(child).length === 1 });
          const customCounts = api.getCounts(parent);
          await plugin.saveData({ parentPropertyName: 'up', tagFolderPath: 'Concepts', tagsPropertyName: 'tags' });
          await plugin.onExternalSettingsChange();
          await waitUntil({ message: 'invalid tags property falls back to keywords', predicate: () => api.getTags(note).length === 0 });
          return { customCounts, fallbackCounts: api.getCounts(parent), unusedTag: api.isTagNote(parent) };
        } finally {
          await plugin.saveData(saved);
          await plugin.onExternalSettingsChange();
        }
      }
    });
    expect(result).toEqual({ customCounts: { direct: 0, withDescendants: 1 }, fallbackCounts: { direct: 0, withDescendants: 0 }, unusedTag: true });
  });
  it('indexes real wikilinks and markdown links, resolves relative paths and deduplicates subtree counts', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { waitUntil } }) {
        const plugin = app.plugins.getPlugin('tag-notes');
        if (!plugin || !('api' in plugin)) {
          throw new Error('Tag Notes API missing');
        }
        const api = plugin.api as TagNotesApi;
        if (!app.vault.getFolderByPath('Tags')) {
          await app.vault.createFolder('Tags');
        }
        const parent = await app.vault.create('Tags/Parent.md', 'Parent');
        const child = await app.vault.create('Tags/Child.md', '---\nbroader:\n  - "[[Parent]]"\n---\n');
        const note = await app.vault.create('Tagged.md', '---\nkeywords:\n  - "[[Tags/Parent]]"\n  - "[child](Tags/Child.md)"\n---\n');
        await app.vault.create('Mention.md', '[[Tags/Parent]]');
        await waitUntil({ message: 'both property links indexed', predicate: () => api.getTags(note).length === 2 });
        return {
          childIsTag: api.isTagNote(child),
          counts: api.getCounts(parent),
          notes: api.getTaggedNotes(parent, { includeDescendants: true }).map((file) => file.path),
          parents: api.getParents(child).map((file) => file.path)
        };
      }
    });
    expect(result).toEqual({ childIsTag: true, counts: { direct: 1, withDescendants: 1 }, notes: ['Tagged.md'], parents: ['Tags/Parent.md'] });
  });

  it('updates after metadata changes, renames, deletion and reload', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { waitUntil } }) {
        const plugin = app.plugins.getPlugin('tag-notes');
        if (!plugin || !('api' in plugin)) {
          throw new Error('Tag Notes API missing');
        }
        const api = plugin.api as TagNotesApi;
        if (!app.vault.getFolderByPath('Tags')) {
          await app.vault.createFolder('Tags');
        }
        const parent = await app.vault.create('Tags/EventParent.md', 'Parent');
        const child = await app.vault.create('Tags/EventChild.md', '---\nbroader:\n  - "[[EventParent]]"\n---\n');
        const note = await app.vault.create('EventTagged.md', '---\nkeywords:\n  - "[[Tags/EventParent]]"\n  - "[[Tags/EventChild]]"\n---\n');
        await waitUntil({ message: 'initial event fixture indexed', predicate: () => api.getCounts(parent).direct === 1 });
        await app.vault.modify(note, '---\nkeywords:\n  - "[[Tags/EventChild]]"\n---\n');
        await waitUntil({ message: 'direct count removed', predicate: () => api.getCounts(parent).direct === 0 && api.getCounts(parent).withDescendants === 1 });
        await app.vault.rename(child, 'Tags/Renamed.md');
        await app.vault.modify(note, '---\nkeywords:\n  - "[[Tags/Renamed]]"\n---\n');
        await waitUntil({ message: 'renamed tag resolved', predicate: () => api.getTags(note)[0]?.path === 'Tags/Renamed.md' });
        await app.fileManager.trashFile(child);
        await waitUntil({ message: 'deleted tag removed', predicate: () => api.getCounts(parent).withDescendants === 0 });
        await app.plugins.disablePlugin('tag-notes');
        await app.plugins.enablePlugin('tag-notes');
        const reloaded = app.plugins.getPlugin('tag-notes');
        if (!reloaded || !('api' in reloaded)) {
          throw new Error('Reloaded API missing');
        }
        const reloadedApi = reloaded.api as TagNotesApi;
        await waitUntil({ message: 'index rebuilt after reload', predicate: () => reloadedApi.isTagNote(parent) });
        return reloadedApi.getCounts(parent);
      }
    });
    expect(result).toEqual({ direct: 0, withDescendants: 0 });
  });

  it('breaks a real hierarchy cycle without rewriting frontmatter', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { waitUntil } }) {
        const plugin = app.plugins.getPlugin('tag-notes');
        if (!plugin || !('api' in plugin)) {
          throw new Error('Tag Notes API missing');
        }
        const api = plugin.api as TagNotesApi;
        if (!app.vault.getFolderByPath('Tags')) {
          await app.vault.createFolder('Tags');
        }
        const a = await app.vault.create('Tags/A.md', '---\nbroader:\n  - "[[B]]"\n---\n');
        const b = await app.vault.create('Tags/B.md', '---\nbroader:\n  - "[[A]]"\n---\n');
        await waitUntil({ message: 'cycle reduced to one edge', predicate: () => api.getParents(a).length + api.getParents(b).length === 1 });
        return { ancestors: api.getAncestors(a).length + api.getAncestors(b).length, text: await app.vault.read(b) };
      }
    });
    expect(result).toEqual({ ancestors: 1, text: '---\nbroader:\n  - "[[A]]"\n---\n' });
  });
});
