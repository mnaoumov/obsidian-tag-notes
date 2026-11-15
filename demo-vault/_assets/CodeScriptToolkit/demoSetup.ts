import type { App } from 'obsidian';

import { configureCommunityPlugin } from '@mnaoumov/obsidian-lib/community-plugins';

interface TagCountsApi {
  readonly getCounts: (file: unknown) => unknown;
}

const PLUGIN_ID = 'tag-notes';

export async function prepareMigration(app: App): Promise<string> {
  await configureCommunityPlugin({
    app,
    pluginId: PLUGIN_ID,
    settings: {
      inlineTagConversion: 'link',
      parentPropertyName: 'broader',
      tagFolderPath: 'Materials/03 Convert tags/Tags',
      tagsPropertyName: 'keywords'
    }
  });
  const source = app.vault.getFileByPath('Materials/03 Convert tags/Source.md');
  if (!source) {
    throw new Error('Migration source is missing.');
  }
  await app.vault.modify(
    source,
    '---\ntags:\n  - alpha/bravo\n  - charlie/bravo\n---\n\n# Migration source\n\nThis sentence mentions #alpha/bravo and #charlie/bravo.\n\nCode stays code: `#alpha/bravo`.\n'
  );
  return 'Ready. Run Tag Notes: Convert tags and choose Materials/03 Convert tags as the folder.';
}

export async function prepareQueries(app: App): Promise<string> {
  await configureCommunityPlugin({
    app,
    pluginId: PLUGIN_ID,
    settings: { parentPropertyName: 'broader', tagFolderPath: 'Materials/05 Queries and Bases/Tags', tagsPropertyName: 'keywords' }
  });
  return 'Ready. The subtree block shows Direct and Nested; the direct block shows Direct only. Run Tag Notes: Copy Bases filter for tag subtree to export Parent.';
}

export async function prepareTagging(app: App, shouldInsertBodyLink = false): Promise<string> {
  await configureCommunityPlugin({
    app,
    pluginId: PLUGIN_ID,
    settings: {
      insertBodyLink: shouldInsertBodyLink,
      suggestTrigger: '@',
      tagFolderPath: 'Materials/04 Tag this note/Tags',
      tagsPropertyName: 'keywords'
    }
  });
  const source = app.vault.getFileByPath('Materials/04 Tag this note/Source.md');
  if (!source) {
    throw new Error('Tagging source is missing.');
  }
  await app.vault.modify(source, '# Source\n\nTry typing a tag note here: ');
  return 'Ready. Open Source, type @First after a space, and choose Alpha.';
}

export async function setTagsPropertyName(app: App, value: string): Promise<void> {
  await configureCommunityPlugin({ app, pluginId: PLUGIN_ID, settings: { tagsPropertyName: value } });
}

export async function showIndex(app: App): Promise<unknown> {
  const folder = 'Materials/01 Tag index/Tags';
  await configureCommunityPlugin({
    app,
    pluginId: PLUGIN_ID,
    settings: { parentPropertyName: 'broader', tagFolderPath: folder, tagsPropertyName: 'keywords' }
  });
  const plugin = app.plugins.getPlugin(PLUGIN_ID);
  if (!plugin || !('api' in plugin)) {
    throw new Error('Enable Tag Notes first.');
  }
  const api = plugin.api as TagCountsApi;
  return api.getCounts(app.vault.getFileByPath(`${folder}/Parent.md`));
}

export async function showTagTree(app: App): Promise<string> {
  await configureCommunityPlugin({
    app,
    pluginId: PLUGIN_ID,
    settings: { parentPropertyName: 'broader', tagFolderPath: 'Materials/06 Tag tree/Tags', tagsPropertyName: 'keywords' }
  });
  if (!app.commands.executeCommandById('tag-notes:open-tag-tree')) {
    throw new Error('Enable Tag Notes first.');
  }
  return 'Ready. The Tag Notes view is open in the left sidebar: Projects shows 0 / 4, and Waiting appears under both Work and Home.';
}
