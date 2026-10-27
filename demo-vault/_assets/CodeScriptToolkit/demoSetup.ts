import type { App } from 'obsidian';
import { configureCommunityPlugin } from '@mnaoumov/obsidian-lib/community-plugins';

export async function setTagsPropertyName(app: App, value: string): Promise<void> {
  await configureCommunityPlugin({ app, pluginId: 'tag-notes', settings: { tagsPropertyName: value } });
}

export async function prepareMigration(app: App): Promise<string> {
  await configureCommunityPlugin({ app, pluginId: 'tag-notes', settings: { tagsPropertyName: 'keywords', parentPropertyName: 'broader', tagFolderPath: 'Materials/03 Convert tags/Tags', inlineTagConversion: 'link' } });
  const source = app.vault.getFileByPath('Materials/03 Convert tags/Source.md');
  if (!source) throw new Error('Migration source is missing.');
  await app.vault.modify(source, '---\ntags:\n  - alpha/bravo\n  - charlie/bravo\n---\n\n# Migration source\n\nThis sentence mentions #alpha/bravo and #charlie/bravo.\n\nCode stays code: `#alpha/bravo`.\n');
  return 'Ready. Run Tag Notes: Convert tags and choose Materials/03 Convert tags as the folder.';
}

export async function showIndex(app: App) {
  const folder = 'Materials/01 Tag index/Tags';
  await configureCommunityPlugin({ app, pluginId: 'tag-notes', settings: { tagsPropertyName: 'keywords', parentPropertyName: 'broader', tagFolderPath: folder } });
  const plugin = app.plugins.getPlugin('tag-notes');
  if (!plugin || !('api' in plugin)) throw new Error('Enable Tag Notes first.');
  const api = plugin.api as { getCounts: (file: unknown) => unknown };
  return api.getCounts(app.vault.getFileByPath(`${folder}/Parent.md`));
}
