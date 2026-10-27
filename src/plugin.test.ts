import type { TFile } from 'obsidian';

import { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
// eslint-disable-next-line import-x/no-namespace -- Spy on the real prompt without replacing the module.
import * as prompts from '@mnaoumov/obsidian-lib/modals/prompt';
import { findPluginApi } from '@mnaoumov/obsidian-lib/plugin/plugin-api';
import { noop } from '@mnaoumov/typescript-lib/function';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { Plugin as ObsidianPlugin } from 'obsidian';
import {
  App,
  MarkdownView,
  Plugin as PluginHost
} from 'obsidian-test-mocks/obsidian';
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
import {
  TAG_TREE_VIEW_TYPE,
  TagTreeView
} from './tag-tree-view.ts';
import { TagPicker } from './tagging/tag-picker.ts';
import { TagSuggest } from './tagging/tag-suggest.ts';

interface ChildHost {
  readonly createChild: (tag: TFile) => Promise<void>;
}
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
  it('opens Tag this note only for a saved editor and reports selection errors', async () => {
    const app = App.createConfigured__({ files: { 'Source.md': 'Text ', 'Tags/Alpha.md': '' } });
    const plugin = new Plugin(app.asOriginalType__(), { author: 'test', description: 'test', id: 'tag-notes', minAppVersion: '1.14.4', name: 'Tag Notes', version: '0.0.0' });
    plugins.push(plugin);
    const onload = vi.spyOn(plugin, 'onload');
    plugin.load();
    await onload.mock.results[0]?.value;
    const host = PluginHost.fromOriginalType2__(plugin);
    const command = host.commands__.get('tag-this-note');
    const view = new MarkdownView(app.workspace.getLeaf(false));
    const open = vi.spyOn(TagPicker.prototype, 'open').mockImplementation(noop);
    command?.editorCallback?.(view.editor.asOriginalType__(), view.asOriginalType7__());
    expect(open).not.toHaveBeenCalled();
    view.file = app.vault.getFileByPath('Source.md');
    view.editor.setValue('Text ');
    command?.editorCallback?.(view.editor.asOriginalType__(), view.asOriginalType7__());
    expect(open).toHaveBeenCalledOnce();
    const suggest = castTo<TagSuggest>(host.editorSuggests__[0]);
    const notice = vi.spyOn(PluginNoticeComponent.prototype, 'showNotice');
    if (!view.file) {
      throw new Error('Source missing');
    }
    suggest.context = { editor: view.editor.asOriginalType__(), end: { ch: 0, line: 0 }, file: view.file.asOriginalType2__(), query: 'Alpha', start: { ch: 0, line: 0 } };
    suggest.selectSuggestion({ file: null, name: 'Alpha' });
    await vi.waitFor(() => {
      expect(notice).toHaveBeenCalledWith(expect.stringContaining('note changed'));
    });
  });
  it('registers and reuses the sidebar view, refreshes it on rebuild and handles an unavailable sidebar', async () => {
    const app = App.createConfigured__({ files: { 'Tags/tag.md': '' } });
    const plugin = new Plugin(app.asOriginalType__(), { author: 'test', description: 'test', id: 'tag-notes', minAppVersion: '1.14.4', name: 'Tag Notes', version: '0.0.0' });
    plugins.push(plugin);
    const onload = vi.spyOn(plugin, 'onload');
    plugin.load();
    await onload.mock.results[0]?.value;
    const command = PluginHost.fromOriginalType2__(plugin).commands__.get('open-tag-tree');
    command?.callback?.();
    await vi.waitFor(() => {
      expect(app.workspace.getLeavesOfType(TAG_TREE_VIEW_TYPE)).toHaveLength(1);
    });
    const leaf = app.workspace.getLeavesOfType(TAG_TREE_VIEW_TYPE)[0];
    if (!leaf || !(leaf.view instanceof TagTreeView)) {
      throw new Error('Tree missing');
    }
    const refresh = vi.spyOn(leaf.view, 'refresh');
    const component = castTo<SettingsHost>(plugin).pluginSettingsComponent;
    await component.editAndSave((settings) => {
      settings.tagFolderPath = 'Other';
    });
    expect(refresh).toHaveBeenCalled();
    expect(leaf.view.contentEl.textContent).toContain('No tag notes yet.');
    command?.callback?.();
    await vi.waitFor(() => {
      expect(app.workspace.getLeavesOfType(TAG_TREE_VIEW_TYPE)).toHaveLength(1);
    });
    const notice = vi.spyOn(PluginNoticeComponent.prototype, 'showNotice');
    const creator = PluginHost.fromOriginalType2__(plugin).views__.get(TAG_TREE_VIEW_TYPE);
    const other = creator?.(app.workspace.getLeaf(false).asOriginalType3__());
    if (!(other instanceof TagTreeView)) {
      throw new TypeError('Creator missing');
    }
    await other.onOpen();
    const open = vi.spyOn(app.workspace.getLeaf(false), 'openFile').mockRejectedValue(new Error('Cannot open'));
    await component.editAndSave((settings) => {
      settings.tagFolderPath = 'Tags';
    });
    other.refresh();
    other.contentEl.querySelector('button.tag-notes-tag')?.dispatchEvent(new MouseEvent('click'));
    await vi.waitFor(() => {
      expect(notice).toHaveBeenCalledWith('Error: Cannot open');
    });
    open.mockRestore();
    vi.spyOn(prompts, 'prompt').mockResolvedValue('New');
    const parent = app.vault.getFileByPath('Tags/tag.md');
    if (!parent) {
      throw new Error('Tag missing');
    }
    await castTo<ChildHost>(other).createChild(parent.asOriginalType2__());
    expect(app.vault.getFileByPath('Tags/New.md')).not.toBeNull();
    vi.spyOn(app.workspace, 'getLeavesOfType').mockReturnValue([app.workspace.getLeaf(false)]);
    await component.editAndSave((settings) => {
      settings.tagFolderPath = 'Other';
    });
    vi.mocked(app.workspace.getLeavesOfType).mockReturnValue([]);
    vi.spyOn(app.workspace, 'getLeftLeaf').mockReturnValue(null);
    command?.callback?.();
    await new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });
  });
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
