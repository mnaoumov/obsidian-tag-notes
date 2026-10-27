import { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
import { findPluginApi } from '@mnaoumov/obsidian-lib/plugin/plugin-api';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { Plugin as ObsidianPlugin } from 'obsidian';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { TagNotesApi } from '../api.d.ts';

import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { Plugin } from './plugin.ts';

interface SettingsHost {
  readonly pluginSettingsComponent: PluginSettingsComponent;
}

const plugins: Plugin[] = [];
afterEach(() => {
  for (const plugin of plugins.splice(0)) {
    plugin.unload();
  }
  vi.restoreAllMocks();
});

describe('TagNotes', () => {
  it('reports hierarchy cycles through the plugin notice component', async () => {
    const app = App.createConfigured__({ files: { 'Tags/a.md': '', 'Tags/b.md': '' } });
    vi.spyOn(app.metadataCache, 'getFileCache').mockImplementation((file) => {
      const link = file.path === 'Tags/a.md' ? 'Tags/b' : 'Tags/a';
      return { frontmatter: { broader: [link] }, frontmatterLinks: [{ key: 'broader.0', link, original: link }] };
    });
    const showNotice = vi.spyOn(PluginNoticeComponent.prototype, 'showNotice');
    const plugin = new Plugin(app.asOriginalType__(), { author: 'test', description: 'test', id: 'tag-notes', minAppVersion: '1.14.4', name: 'Tag Notes', version: '0.0.0' });
    plugins.push(plugin);
    const onload = vi.spyOn(plugin, 'onload');
    plugin.load();
    await onload.mock.results[0]?.value;
    expect(showNotice).toHaveBeenCalledWith('Tag hierarchy cycle ignored: Tags/b.md → Tags/a.md → Tags/b.md');
    plugin.unload();
    showNotice.mockRestore();
  });
  it('loads its index, settings and registered API and removes listeners on unload', async () => {
    const app = App.createConfigured__({ files: { 'Tags/tag.md': '' } });
    const plugin = new Plugin(app.asOriginalType__(), { author: 'test', description: 'test', id: 'tag-notes', minAppVersion: '1.14.4', name: 'Tag Notes', version: '0.0.0' });
    plugins.push(plugin);
    const onload = vi.spyOn(plugin, 'onload');
    plugin.load();
    await onload.mock.results[0]?.value;
    expect(plugin.api.getTagNotes().map((file) => file.path)).toEqual(['Tags/tag.md']);
    expect(findPluginApi<TagNotesApi>({ apiVersionRange: '^1', pluginId: 'tag-notes' })?.getTagNotes().length).toBe(1);
    const component = castTo<SettingsHost>(plugin).pluginSettingsComponent;
    await component.editAndSave((settings) => {
      settings.tagFolderPath = 'Elsewhere';
    });
    expect(plugin.api.getTagNotes()).toEqual([]);
    plugin.unload();
    expect(findPluginApi({ apiVersionRange: '^1', pluginId: 'tag-notes' })).toBeNull();
  });
  it('extends the Obsidian Plugin class', () => {
    expect(Plugin.prototype).toBeInstanceOf(ObsidianPlugin);
  });
});
