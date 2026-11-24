import type {
  App,
  TFile
} from 'obsidian';

import { invokeAsyncSafely } from '@mnaoumov/typescript-lib/async';
import { Modal } from 'obsidian';

import type {
  RedundantTag,
  TagNotesApi
} from '../../api.d.ts';

interface RedundantTagsModalConstructorParams {
  readonly api: TagNotesApi;
  readonly app: App;
  readonly showError: (error: unknown) => void;
}

/**
Lists the notes that link a tag together with one of its descendants. Read-only: it never edits a note.
*/
export class RedundantTagsModal extends Modal {
  private readonly api: TagNotesApi;
  private readonly showError: (error: unknown) => void;

  public constructor(params: RedundantTagsModalConstructorParams) {
    super(params.app);
    this.api = params.api;
    this.showError = params.showError;
  }

  public override onClose(): void {
    this.contentEl.empty();
  }

  public override onOpen(): void {
    this.setTitle('Redundant tags');
    this.contentEl.addClass('tag-notes-redundant-tags');
    const rows = this.api.getRedundantTags();
    if (rows.length === 0) {
      this.contentEl.createEl('p', { text: 'No note links a tag together with one of its descendants.' });
      return;
    }

    // Rows arrive sorted by note path, so a set of their notes keeps that order.
    const notes = [...new Set(rows.map((row) => row.note))];
    this.contentEl.createEl('p', {
      text: `${String(notes.length)} ${notes.length === 1 ? 'note links' : 'notes link'} a tag that a narrower tag on the same note already implies. Nothing is changed.`
    });
    const list = this.contentEl.createEl('ul');
    for (const note of notes) {
      const noteRows: RedundantTag[] = rows.filter((row) => row.note === note);
      const item = list.createEl('li');
      const link = item.createEl('a', { cls: 'internal-link', href: '#', text: note.path });
      link.addEventListener('click', ($event) => {
        $event.preventDefault();
        this.openNote(note);
      });
      const reasons = item.createEl('ul');
      for (const row of noteRows) {
        reasons.createEl('li', {
          text: `${row.tag.basename} is implied by ${row.narrower.map((file) => file.basename).join(', ')}`
        });
      }
    }
  }

  private openNote(note: TFile): void {
    invokeAsyncSafely(async () => {
      try {
        await this.app.workspace.getLeaf(false).openFile(note);
        this.close();
      } catch (error) {
        this.showError(error);
      }
    });
  }
}
