import type { SettingDefinitionItem } from 'obsidian';

import { PluginSettingsTabBase } from '@mnaoumov/obsidian-lib/plugin/plugin-settings-tab';

import type { PluginSettings } from './plugin-settings.ts';

/**
 * The settings tab is declarative: return one definition per row from `getSettingDefinitionItems()` and
 * Obsidian renders them. `bind` wires a component to a settings property in both directions, so there is
 * no read/write plumbing to maintain.
 */
export class PluginSettingsTab extends PluginSettingsTabBase<PluginSettings> {
  protected override getSettingDefinitionItems(): SettingDefinitionItem[] {
    return ([
      { desc: 'List property containing links to tag notes. The core tags property cannot index links.', name: 'Tags property', property: 'tagsPropertyName' },
      { desc: 'Folder for new tag notes. Its unused notes also appear as tags. Leave empty to use the vault root.', name: 'Tag folder', property: 'tagFolderPath' },
      { desc: 'List property containing links to broader tag notes. Several parents are allowed.', name: 'Parent property', property: 'parentPropertyName' }
    ] as const).map(({ desc, name, property }) =>
      this.settingEx({
        desc,
        name,
        render: (setting) => {
          setting.addText((text) => {
            this.bind({ propertyName: property, shouldResetSettingWhenComponentIsEmpty: property !== 'tagFolderPath', valueComponent: text });
          });
        }
      })
    );
  }
}
