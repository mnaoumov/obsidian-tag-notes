import type { App } from 'obsidian';

import { invokeAsyncSafely } from '@mnaoumov/typescript-lib/async';
import {
  Modal,
  Setting
} from 'obsidian';

import type { PluginSettings } from '../plugin-settings.ts';

import { TagMigration } from './tag-migration.ts';

/**
 * Runs the conversion, as one bulk operation when the plugin records them as git commits.
 */
export type RunBulkOperation = (params: RunBulkOperationParams) => Promise<void>;

/**
 * The conversion and the summary naming it in the operation's commit.
 */
export interface RunBulkOperationParams {
  readonly operation: () => Promise<void>;
  readonly summary: string;
}

interface MigrationModalConstructorParams {
  readonly app: App;
  readonly runBulkOperation: RunBulkOperation;
  readonly settings: PluginSettings;
  readonly showNotice: (message: string) => void;
}

export class MigrationModal extends Modal {
  private isBusy = false;
  private readonly migration: TagMigration;
  private readonly runBulkOperation: RunBulkOperation;
  private readonly showNotice: (message: string) => void;

  public constructor(params: MigrationModalConstructorParams) {
    super(params.app);
    this.migration = new TagMigration(params);
    this.runBulkOperation = params.runBulkOperation;
    this.showNotice = params.showNotice;
  }

  public override onOpen(): void {
    this.setTitle('Convert tags');
    this.contentEl.addClass('tag-notes-migration');
    this.contentEl.createEl('p', { text: 'Preview every affected note before converting. Existing notes are reused in their current folders. Back up your vault before a large conversion.' });
    let folder = '';
    const results = this.contentEl.createDiv({ cls: 'tag-notes-migration-preview' });
    new Setting(this.contentEl).setName('Folder').setDesc('Leave empty to convert the whole vault, or enter a folder path to include its notes and subfolders.').addText((text) => {
      text.inputEl.setAttribute('aria-label', 'Migration folder');
      text.onChange((value) => {
        folder = value;
        results.empty();
      });
    });
    new Setting(this.contentEl).addButton((button) => {
      button.setButtonText('Preview').onClick(() => {
        this.run(async () => {
          results.empty();
          const previewFolder = folder;
          const plan = await this.migration.preview(previewFolder);
          if (folder !== previewFolder) {
            return;
          }
          results.createEl('h3', { text: `${countOf(plan.notes.length, 'tagged note')}; ${countOf(plan.tags.filter((tag) => !tag.existing).length, 'new tag note')}` });
          if (plan.notes.length === 0) {
            results.createEl('p', { text: 'No tags to convert in this scope.' });
            return;
          }
          results.createEl('p', { text: 'Notes to update:' });
          const notes = results.createEl('ul');
          const affectedPaths = new Set([...plan.notes.map((note) => note.file.path), ...plan.tags.filter((tag) => tag.existing && (tag.parent !== null || tag.alias !== null)).map((tag) => tag.path)]);
          for (const path of [...affectedPaths].sort()) {
            notes.createEl('li', { text: path });
          }
          results.createEl('p', { text: 'Tag mapping (new or reused):' });
          const mapping = results.createEl('ul');
          for (const tag of plan.tags) {
            mapping.createEl('li', { text: `#${tag.tag} → ${tag.path} (${tag.existing ? 'reuse' : 'create'})${tag.parent ? `; parent #${tag.parent}` : ''}${tag.alias ? `; alias ${tag.alias}` : ''}` });
          }
          results.createEl('p', { text: 'Conversion removes the core tags property, merges links into your tags property, and handles inline tags using the inline tag conversion setting. A failure may leave a partial conversion; review it before retrying.' });
          new Setting(results).addButton((convert) => {
            convert.setButtonText('Convert').setCta().onClick(() => {
              this.run(async () => {
                convert.setDisabled(true);
                await this.runBulkOperation({
                  operation: () => this.migration.apply(plan),
                  summary: `Convert tags in ${plan.scope || 'entire vault'}`
                });
                this.showNotice(`Converted tags. Updated notes: ${String(plan.notes.length)}.`);
                this.close();
              });
            });
          });
        });
      });
    }).addButton((button) => {
      button.setButtonText('Cancel').onClick(() => {
        this.close();
      });
    });
  }

  private run(action: () => Promise<void>): void {
    if (this.isBusy) {
      return;
    }
    this.isBusy = true;
    invokeAsyncSafely(async () => {
      try {
        await action();
      } catch (error) {
        this.showNotice(String(error));
      } finally {
        this.isBusy = false;
      }
    });
  }
}

function countOf(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}
