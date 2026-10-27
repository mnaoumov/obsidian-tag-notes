import type { DataHandler } from '@mnaoumov/obsidian-lib/data-handler';
import type { PluginEventMap } from '@mnaoumov/obsidian-lib/plugin/plugin-event-source';

import { AsyncEvents } from '@mnaoumov/typescript-lib/async-events';
import { noopAsync } from '@mnaoumov/typescript-lib/function';
import {
  describe,
  expect,
  it
} from 'vitest';

import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { PluginSettings } from './plugin-settings.ts';

describe('PluginSettingsComponent', () => {
  it('rejects invalid property and folder choices with defaults and validation messages', async () => {
    const component = createComponent(undefined);
    await component.loadWithPromises();
    for (const property of ['tagsPropertyName', 'parentPropertyName'] as const) {
      for (const value of ['', 'tags', property === 'tagsPropertyName' ? 'broader' : 'keywords']) {
        const candidate = createComponent(undefined);
        await candidate.loadWithPromises();
        expect(await candidate.setProperty(property, value)).toBeTruthy();
      }
    }
    for (const value of ['../Tags', './Tags', String.raw`C:\Tags`]) {
      expect(await component.setProperty('tagFolderPath', value)).toBeTruthy();
    }
    expect(await component.setProperty('tagFolderPath', '')).toBe('');
    expect(component.settings.tagFolderPath).toBe('');
    expect(await component.setProperty('parentPropertyName', 'up')).toBe('');
    expect(await component.setProperty('tagsPropertyName', 'topics')).toBe('');
    expect(component.settings.tagsPropertyName).toBe('topics');
    expect(await component.setProperty('suggestTrigger', '')).toBeTruthy();
    expect(await component.setProperty('suggestTrigger', 'two words')).toBeTruthy();
    expect(await component.setProperty('suggestTrigger', '::')).toBe('');
  });
  it('takes its defaults from the PluginSettings class', async () => {
    const component = createComponent(undefined);
    await component.loadWithPromises();
    expect(component.settings).toBeInstanceOf(PluginSettings);
  });

  // This drives the component through the lifecycle Obsidian does: `load()` reads `data.json`, and a
  // Value the user saved there has to win over the class default.
  it('loads a saved setting from data.json over its default', async () => {
    const component = createComponent({ tagsPropertyName: 'topics' });
    await component.loadWithPromises();
    expect(component.settings.tagsPropertyName).toBe('topics');
  });
});

function createComponent(data: unknown): PluginSettingsComponent {
  const dataHandler: DataHandler = {
    loadData(): Promise<unknown> {
      return Promise.resolve(data);
    },
    saveData(): Promise<void> {
      return noopAsync();
    }
  };

  return new PluginSettingsComponent({
    dataHandler,
    pluginEventSource: new AsyncEvents<PluginEventMap>()
  });
}
