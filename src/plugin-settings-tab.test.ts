import type { PluginEventMap } from '@mnaoumov/obsidian-lib/plugin/plugin-event-source';
import type { TextComponent } from 'obsidian';

import { AsyncEvents } from '@mnaoumov/typescript-lib/async-events';
import { noopAsync } from '@mnaoumov/typescript-lib/function';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import {
  Platform,
  Setting,
  SettingGroup
} from 'obsidian';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PluginSettings } from './plugin-settings.ts';

import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { PluginSettingsTab } from './plugin-settings-tab.ts';
import { Plugin } from './plugin.ts';

interface BindingHost {
  readonly bind: (params: BindingParams) => void;
}
interface BindingParams {
  readonly propertyName: keyof PluginSettings;
  readonly valueComponent: TextComponent;
}

interface ValueSetter {
  readonly setValue: (value: unknown) => void;
}

interface VisibleDefinition {
  readonly visible: () => boolean;
}

describe('PluginSettingsTab', () => {
  it('renders four bound text settings with defaults', async () => {
    const app = App.createConfigured__();
    const plugin = new Plugin(app.asOriginalType__(), { author: 'test', description: 'test', id: 'tag-notes', minAppVersion: '1.14.4', name: 'Tag Notes', version: '0.0.0' });
    const component = new PluginSettingsComponent({
      dataHandler: { loadData: (): Promise<unknown> => Promise.resolve(undefined), saveData: (): Promise<void> => noopAsync() },
      pluginEventSource: new AsyncEvents<PluginEventMap>()
    });
    await component.loadWithPromises();
    const tab = new PluginSettingsTab({ plugin, pluginSettingsComponent: component });
    // This tests our declarative bindings; the library owns the binding implementation.
    vi.spyOn(castTo<BindingHost>(tab), 'bind').mockImplementation(({ propertyName, valueComponent }) => {
      castTo<ValueSetter>(valueComponent).setValue(component.settings[propertyName]);
    });
    const group = new SettingGroup(tab.containerEl);
    for (const definition of tab.getSettingDefinitions()) {
      if ('render' in definition) {
        definition.render(new Setting(tab.containerEl), group);
      }
    }
    expect(tab.containerEl.querySelectorAll<HTMLInputElement>('input')).toHaveLength(4);
    expect([...tab.containerEl.querySelectorAll<HTMLInputElement>('input')].map((input) => input.value)).toEqual(['keywords', 'Tags', 'broader', '@']);
    tab.hide();
  });

  // The commits run the system `git`, which only the desktop app can reach.
  it('shows the bulk operation commits row on desktop only', () => {
    const app = App.createConfigured__();
    const plugin = new Plugin(app.asOriginalType__(), { author: 'test', description: 'test', id: 'tag-notes', minAppVersion: '1.14.4', name: 'Tag Notes', version: '0.0.0' });
    const component = new PluginSettingsComponent({
      dataHandler: { loadData: (): Promise<unknown> => Promise.resolve(undefined), saveData: (): Promise<void> => noopAsync() },
      pluginEventSource: new AsyncEvents<PluginEventMap>()
    });
    const tab = new PluginSettingsTab({ plugin, pluginSettingsComponent: component });
    const definition = tab.getSettingDefinitions().find((entry) => 'name' in entry && entry.name === 'Should commit bulk operations');
    const isVisible = castTo<VisibleDefinition>(definition).visible;
    const isDesktop = Platform.isDesktop;
    try {
      Platform.isDesktop = true;
      expect(isVisible()).toBe(true);
      Platform.isDesktop = false;
      expect(isVisible()).toBe(false);
    } finally {
      Platform.isDesktop = isDesktop;
    }
  });
});
