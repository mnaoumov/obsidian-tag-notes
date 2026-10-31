import { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import {
  App,
  Plugin as PluginHost
} from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  expect,
  it,
  vi
} from 'vitest';

import type { RunBulkOperationParams } from './migration-modal.ts';

import { PluginSettings } from '../plugin-settings.ts';
import { Plugin } from '../plugin.ts';
import { MigrationModal } from './migration-modal.ts';
import { TagMigration } from './tag-migration.ts';

interface ModalHost {
  readonly isBusy: boolean;
  readonly run: (action: () => Promise<void>) => void;
}

afterEach(() => {
  vi.restoreAllMocks();
});

function click(modal: MigrationModal, label: string): void {
  const button = [...modal.contentEl.querySelectorAll('button')].find((entry) => entry.textContent === label);
  if (!button) {
    throw new Error(`Missing button ${label}`);
  }
  button.click();
}

async function passThrough(params: RunBulkOperationParams): Promise<void> {
  await params.operation();
}

it('requires a preview and explicit confirmation before changing notes, and ignores duplicate clicks', async () => {
  const app = App.createConfigured__({ files: { 'alpha.md': '#alpha/bravo' } });
  const showNotice = vi.fn();
  const modal = new MigrationModal({ app: app.asOriginalType__(), runBulkOperation: passThrough, settings: new PluginSettings(), showNotice });
  modal.onOpen();
  expect([...modal.contentEl.querySelectorAll('button')].some((button) => button.textContent === 'Convert')).toBe(false);
  click(modal, 'Preview');
  click(modal, 'Preview');
  await vi.waitFor(() => {
    expect(modal.contentEl.textContent).toContain('#alpha/bravo → Tags/bravo.md');
  });
  expect(app.vault.getMarkdownFiles()).toHaveLength(1);
  click(modal, 'Convert');
  await vi.waitFor(() => {
    expect(showNotice).toHaveBeenCalledWith('Converted tags. Updated notes: 1.');
  });
  expect(app.vault.getFileByPath('Tags/bravo.md')).not.toBeNull();
});

it('clears a preview when scope changes, handles empty folders and reports preview and write errors', async () => {
  const app = App.createConfigured__({ files: { 'alpha.md': '', 'Folder/note.md': '#alpha' } });
  const showNotice = vi.fn();
  const modal = new MigrationModal({ app: app.asOriginalType__(), runBulkOperation: passThrough, settings: new PluginSettings(), showNotice });
  modal.onOpen();
  const input = modal.contentEl.querySelector('input');
  if (!input) {
    throw new Error('Missing folder input');
  }
  input.value = 'Missing';
  input.dispatchEvent(new Event('input'));
  click(modal, 'Preview');
  await vi.waitFor(() => {
    expect(showNotice).toHaveBeenCalledWith(expect.stringContaining('existing vault folder'));
  });
  input.value = 'Folder';
  input.dispatchEvent(new Event('input'));
  click(modal, 'Preview');
  await vi.waitFor(() => {
    expect(modal.contentEl.textContent).toContain('Tag mapping');
  });
  vi.spyOn(TagMigration.prototype, 'apply').mockRejectedValue(new Error('Disk full'));
  click(modal, 'Convert');
  await vi.waitFor(() => {
    expect(showNotice).toHaveBeenCalledWith('Error: Disk full');
  });
  const file = app.vault.getFileByPath('Folder/note.md');
  if (!file) {
    throw new Error('Missing note');
  }
  await app.vault.modify(file, 'No tags');
  input.value = '';
  input.dispatchEvent(new Event('input'));
  expect(modal.contentEl.querySelector('.tag-notes-migration-preview')?.textContent).toBe('');
  click(modal, 'Preview');
  await vi.waitFor(() => {
    expect(modal.contentEl.textContent).toContain('No tags to convert');
  });
  const close = vi.spyOn(modal, 'close');
  click(modal, 'Cancel');
  expect(close).toHaveBeenCalledOnce();
});

it('lists reused parent and collision notes among the notes to update', async () => {
  const app = App.createConfigured__({ files: { 'bravo (alpha).md': '', 'charlie.md': '', 'source.md': '#alpha/bravo #charlie/bravo' } });
  const modal = new MigrationModal({ app: app.asOriginalType__(), runBulkOperation: passThrough, settings: new PluginSettings(), showNotice: vi.fn() });
  modal.onOpen();
  click(modal, 'Preview');
  await vi.waitFor(() => {
    expect(modal.contentEl.textContent).toContain('alias bravo');
  });
  expect(modal.contentEl.querySelector('ul')?.textContent).toContain('bravo (alpha).md');
  expect(modal.contentEl.textContent).toContain('(reuse)');
});

it('registers the conversion command and opens its modal through the plugin', async () => {
  const app = App.createConfigured__();
  const plugin = new Plugin(app.asOriginalType__(), { author: 'test', description: 'test', id: 'tag-notes', minAppVersion: '1.14.4', name: 'Tag Notes', version: '0.0.0' });
  const onload = vi.spyOn(plugin, 'onload');
  plugin.load();
  await onload.mock.results[0]?.value;
  const open = vi.spyOn(MigrationModal.prototype, 'open');
  PluginHost.fromOriginalType2__(plugin).commands__.get('convert-tags')?.callback?.();
  expect(open).toHaveBeenCalledOnce();
  const instance = open.mock.instances[0];
  if (!instance) {
    throw new Error('Modal missing');
  }
  const modal = castTo<MigrationModal>(instance);
  const host = castTo<ModalHost>(modal);
  const notice = vi.spyOn(PluginNoticeComponent.prototype, 'showNotice');
  host.run(() => Promise.reject(new Error('Command test')));
  await vi.waitFor(() => {
    expect(notice).toHaveBeenCalledWith('Error: Command test');
  });
  modal.close();
  plugin.unload();
});

it('discards a preview if the folder changes while it is still being built', async () => {
  const app = App.createConfigured__({ files: { 'alpha.md': '#alpha', 'Folder/note.md': '' } });
  const plan = await new TagMigration({ app: app.asOriginalType__(), settings: new PluginSettings() }).preview('');
  let resolvePlan: (value: typeof plan) => void = vi.fn();
  const pending = new Promise<typeof plan>((resolve) => {
    resolvePlan = resolve;
  });
  vi.spyOn(TagMigration.prototype, 'preview').mockReturnValue(pending);
  const modal = new MigrationModal({ app: app.asOriginalType__(), runBulkOperation: passThrough, settings: new PluginSettings(), showNotice: vi.fn() });
  modal.onOpen();
  click(modal, 'Preview');
  const input = modal.contentEl.querySelector('input');
  if (!input) {
    throw new Error('Missing scope');
  }
  input.value = 'Folder';
  input.dispatchEvent(new Event('input'));
  resolvePlan(plan);
  await vi.waitFor(() => {
    expect(castTo<ModalHost>(modal).isBusy).toBe(false);
  });
  expect(modal.contentEl.querySelector('.tag-notes-migration-preview')?.textContent).toBe('');
  expect([...modal.contentEl.querySelectorAll('button')].some((button) => button.textContent === 'Convert')).toBe(false);
});
