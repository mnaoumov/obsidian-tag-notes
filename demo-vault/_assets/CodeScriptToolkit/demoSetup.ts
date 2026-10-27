import type { App } from 'obsidian';
import { configureCommunityPlugin } from '@mnaoumov/obsidian-lib/community-plugins';

export async function setTagsPropertyName(app: App, value: string): Promise<void> {
  await configureCommunityPlugin({ app, pluginId: 'tag-notes', settings: { tagsPropertyName: value } });
}

export async function showIndex(app: App) {
  const folder = 'Materials/01 Tag index/Tags';
  await configureCommunityPlugin({ app, pluginId: 'tag-notes', settings: { tagsPropertyName: 'keywords', parentPropertyName: 'broader', tagFolderPath: folder } });
  const plugin = app.plugins.getPlugin('tag-notes');
  if (!plugin || !('api' in plugin)) throw new Error('Enable Tag Notes first.');
  const api = plugin.api as { getCounts: (file: unknown) => unknown };
  return api.getCounts(app.vault.getFileByPath(`${folder}/Parent.md`));
}
