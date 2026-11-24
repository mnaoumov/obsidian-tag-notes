import type {
  App,
  TFile
} from 'obsidian';

import { selectItem } from '@mnaoumov/obsidian-lib/modals/select-item';
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
  /**
   * The one tag to convert, without its `#`. Without it, the modal converts every tag.
   */
  readonly tag?: string;
}

export class MigrationModal extends Modal {
  private isBusy = false;
  private readonly migration: TagMigration;
  private readonly runBulkOperation: RunBulkOperation;
  private readonly showNotice: (message: string) => void;
  private readonly tag: null | string;

  public constructor(params: MigrationModalConstructorParams) {
    super(params.app);
    this.migration = new TagMigration(params);
    this.runBulkOperation = params.runBulkOperation;
    this.showNotice = params.showNotice;
    this.tag = params.tag ?? null;
  }

  public override onOpen(): void {
    const tag = this.tag;
    this.setTitle(tag === null ? 'Convert tags' : `Convert #${tag}`);
    this.contentEl.addClass('tag-notes-migration');
    this.contentEl.createEl('p', {
      text: tag === null
        ? 'Preview every affected note before converting. Existing notes are reused in their current folders. Back up your vault before a large conversion.'
        : `Converts #${tag} and the tags under it to tag notes. Other tags stay as they are. Preview every affected note before converting.`
    });
    let folder = '';
    let tagNote: null | TFile = null;
    let version = 0;
    const results = this.contentEl.createDiv({ cls: 'tag-notes-migration-preview' });
    function reset(): void {
      version++;
      results.empty();
    }
    if (tag !== null) {
      const tagNoteSetting = new Setting(this.contentEl).setName('Tag note');

      function describe(): void {
        tagNoteSetting.setDesc(tagNote ? `Use ${tagNote.path}.` : 'Reuse the note named after the tag, or create one in the tag folder.');
      }
      describe();
      tagNoteSetting.addButton((button) => {
        button.setButtonText('Choose existing note').onClick(() => {
          this.run(async () => {
            const chosen = await selectItem({
              app: this.app,
              items: this.app.vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path)),
              itemTextFunction: (file) => file.path,
              placeholder: `Note for #${tag}`
            });
            if (!chosen) {
              return;
            }
            tagNote = chosen;
            describe();
            reset();
          });
        });
      }).addButton((button) => {
        button.setButtonText('Use default').onClick(() => {
          tagNote = null;
          describe();
          reset();
        });
      });
    }
    new Setting(this.contentEl).setName('Folder').setDesc('Leave empty to convert the whole vault, or enter a folder path to include its notes and subfolders.').addText((text) => {
      text.inputEl.setAttribute('aria-label', 'Migration folder');
      text.onChange((value) => {
        folder = value;
        reset();
      });
    });
    new Setting(this.contentEl).addButton((button) => {
      button.setButtonText('Preview').onClick(() => {
        this.run(async () => {
          results.empty();
          const previewVersion = version;
          const plan = await this.migration.preview(folder, tag === null ? {} : { tag, tagNote });
          if (version !== previewVersion) {
            return;
          }
          results.createEl('h3', { text: `${countOf(plan.notes.length, 'tagged note')}; ${countOf(plan.tags.filter((entry) => !entry.existing).length, 'new tag note')}` });
          if (plan.notes.length === 0) {
            results.createEl('p', { text: 'No tags to convert in this scope.' });
            return;
          }
          results.createEl('p', { text: 'Notes to update:' });
          const notes = results.createEl('ul');
          const affectedPaths = new Set([...plan.notes.map((note) => note.file.path), ...plan.tags.filter((entry) => entry.existing && (entry.parent !== null || entry.alias !== null)).map((entry) => entry.path)]);
          for (const path of [...affectedPaths].sort()) {
            notes.createEl('li', { text: path });
          }
          results.createEl('p', { text: 'Tag mapping (new or reused):' });
          const mapping = results.createEl('ul');
          for (const entry of plan.tags) {
            mapping.createEl('li', { text: `#${entry.tag} → ${entry.path} (${entry.existing ? 'reuse' : 'create'})${entry.parent ? `; parent #${entry.parent}` : ''}${entry.alias ? `; alias ${entry.alias}` : ''}` });
          }
          results.createEl('p', {
            text: plan.tag === null
              ? 'Conversion removes the core tags property, merges links into your tags property, and handles inline tags using the inline tag conversion setting. A failure may leave a partial conversion; review it before retrying.'
              : `Conversion removes #${plan.tag} and the tags under it from the core tags property, merges links into your tags property, and handles those inline tags using the inline tag conversion setting. A failure may leave a partial conversion; review it before retrying.`
          });
          new Setting(results).addButton((convert) => {
            convert.setButtonText('Convert').setCta().onClick(() => {
              this.run(async () => {
                convert.setDisabled(true);
                const subject = plan.tag === null ? 'tags' : `#${plan.tag}`;
                await this.runBulkOperation({
                  operation: () => this.migration.apply(plan),
                  summary: `Convert ${subject} in ${plan.scope || 'entire vault'}`
                });
                this.showNotice(`Converted ${subject}. Updated notes: ${String(plan.notes.length)}.`);
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
