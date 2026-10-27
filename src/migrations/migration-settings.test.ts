import type { PluginEventMap } from '@mnaoumov/obsidian-lib/plugin/plugin-event-source';

import { AsyncEvents } from '@mnaoumov/typescript-lib/async-events';
import { noopAsync } from '@mnaoumov/typescript-lib/function';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import {
  expect,
  it
} from 'vitest';

import { PluginSettingsComponent } from '../plugin-settings-component.ts';
import { PluginSettings } from '../plugin-settings.ts';

it('validates the inline conversion setting and persists each supported mode', async () => {
  const component = new PluginSettingsComponent({
    dataHandler: { loadData: (): Promise<unknown> => Promise.resolve(undefined), saveData: (): Promise<void> => noopAsync() },
    pluginEventSource: new AsyncEvents<PluginEventMap>()
  });
  await component.loadWithPromises();
  expect(await component.setProperty('inlineTagConversion', castTo<PluginSettings['inlineTagConversion']>('invalid'))).toBeTruthy();
  for (const mode of ['keep', 'link', 'remove'] as const) {
    expect(await component.setProperty('inlineTagConversion', mode)).toBe('');
    expect(component.settings.inlineTagConversion).toBe(mode);
  }
});
