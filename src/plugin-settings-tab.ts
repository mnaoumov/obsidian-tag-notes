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
    const rows = ([
      { desc: 'List property containing links to tag notes. The core tags property cannot index links.', name: 'Tags property', property: 'tagsPropertyName' },
      { desc: 'Folder for new tag notes. Its unused notes also appear as tags. Leave empty to use the vault root.', name: 'Tag folder', property: 'tagFolderPath' },
      { desc: 'List property containing links to broader tag notes. Several parents are allowed.', name: 'Parent property', property: 'parentPropertyName' },
      { desc: 'Type this before a tag name or alias. The default @ avoids the core # tag suggester, which takes precedence.', name: 'Suggest trigger', property: 'suggestTrigger' }
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
    rows.push(
      this.settingEx({
        desc: 'Insert a link at the cursor instead of adding it to the tags property. A body link is a mention and does not tag the note.',
        name: 'Insert body link',
        render: (setting) => {
          setting.addToggle((toggle) => {
            this.bind({ propertyName: 'insertBodyLink', valueComponent: toggle });
          });
        }
      }),
      this.settingEx({
        desc: 'Keep leaves inline tags in place, Link replaces them with tag note links, and Remove deletes them. All three add tag note links to the tags property.',
        name: 'Inline tag conversion',
        render: (setting) => {
          setting.addDropdown((dropdown) => {
            dropdown.addOptions({ keep: 'Keep', link: 'Link', remove: 'Remove' });
            this.bind({ propertyName: 'inlineTagConversion', valueComponent: dropdown });
          });
        }
      })
    );
    return rows;
  }
}
