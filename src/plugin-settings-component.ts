import type { DataHandler } from '@mnaoumov/obsidian-lib/data-handler';
import type { PluginEventSource } from '@mnaoumov/obsidian-lib/plugin/plugin-event-source';

import { PluginSettingsComponentBase } from '@mnaoumov/obsidian-lib/components/plugin-settings-component';

import { PluginSettings } from './plugin-settings.ts';

interface PluginSettingsComponentConstructorParams {
  readonly dataHandler: DataHandler;
  readonly pluginEventSource: PluginEventSource;
}

/**
 * Owns the plugin's settings: loading them from `data.json`, saving them back, and telling the rest of
 * the plugin when they change.
 *
 * Override `onLoadRecord` here to migrate settings written by an older version of the plugin, and
 * `onLoadSettings` / `onSaveSettings` to react to a value changing.
 */
export class PluginSettingsComponent extends PluginSettingsComponentBase<PluginSettings> {
  public constructor(params: PluginSettingsComponentConstructorParams) {
    super({
      ...params,
      pluginSettingsClass: PluginSettings
    });
    this.registerValidator('tagsPropertyName', (value, settings) => {
      return !value.trim() || value.toLowerCase() === 'tags' || value === settings.parentPropertyName ? 'Choose a non-empty property other than tags or the parent property.' : undefined;
    });
    this.registerValidator('parentPropertyName', (value, settings) => {
      return !value.trim() || value.toLowerCase() === 'tags' || value === settings.tagsPropertyName ? 'Choose a non-empty property other than tags or the tags property.' : undefined;
    });
    this.registerValidator('tagFolderPath', (value) => {
      return value.split('/').some((part) => part === '..' || part === '.') || /[\\:*?"<>|]/u.test(value) ? 'Use a vault-relative folder path with forward slashes.' : undefined;
    });
    this.registerValidator('inlineTagConversion', (value) => {
      return ['keep', 'link', 'remove'].includes(value) ? undefined : 'Choose keep, link or remove.';
    });
    this.registerValidator('suggestTrigger', (value) => {
      return !value || /[\s\p{Cc}]/u.test(value) ? 'Choose a non-empty trigger without spaces.' : undefined;
    });
  }
}
