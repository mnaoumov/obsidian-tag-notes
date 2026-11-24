import type { TFile } from 'obsidian';

import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  expect,
  it,
  vi
} from 'vitest';

import type {
  RedundantTag,
  TagNotesApi
} from '../../api.d.ts';

import { RedundantTagsModal } from './redundant-tags-modal.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

function createModal(app: App, rows: RedundantTag[], showError = vi.fn()): RedundantTagsModal {
  const api = castTo<TagNotesApi>({ getRedundantTags: (): RedundantTag[] => rows });
  return new RedundantTagsModal({ api, app: app.asOriginalType__(), showError });
}

function file(path: string): TFile {
  return castTo<TFile>({ basename: path.slice(path.lastIndexOf('/') + 1, -'.md'.length), path });
}

it('says so when no note links a tag together with a descendant', () => {
  const modal = createModal(App.createConfigured__(), []);
  modal.onOpen();
  expect(modal.contentEl.textContent).toBe('No note links a tag together with one of its descendants.');
  modal.onClose();
  expect(modal.contentEl.textContent).toBe('');
});

it('groups the redundant links by note and opens a note on click', async () => {
  const app = App.createConfigured__();
  const note = file('Notes/Seed order.md');
  const other = file('Other.md');
  const garden = file('Tags/Garden.md');
  const plants = file('Tags/Plants.md');
  const tomatoes = file('Tags/Tomatoes.md');
  const modal = createModal(app, [
    { narrower: [tomatoes], note, tag: garden },
    { narrower: [garden, tomatoes], note, tag: plants },
    { narrower: [tomatoes], note: other, tag: garden }
  ]);
  const openFile = vi.spyOn(app.workspace.getLeaf(false), 'openFile').mockResolvedValue();
  vi.spyOn(app.workspace, 'getLeaf').mockReturnValue(app.workspace.getLeaf(false));
  const close = vi.spyOn(modal, 'close');
  modal.onOpen();
  expect(modal.contentEl.querySelector('p')?.textContent).toBe('2 notes link a tag that a narrower tag on the same note already implies. Nothing is changed.');
  const items = [...modal.contentEl.querySelectorAll(':scope > ul > li')];
  expect(items.map((item) => item.querySelector('a')?.textContent)).toEqual(['Notes/Seed order.md', 'Other.md']);
  expect([...(items[0]?.querySelectorAll('li') ?? [])].map((item) => item.textContent)).toEqual([
    'Garden is implied by Tomatoes',
    'Plants is implied by Garden, Tomatoes'
  ]);
  const click = new MouseEvent('click', { cancelable: true });
  items[0]?.querySelector('a')?.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);
  await vi.waitFor(() => {
    expect(close).toHaveBeenCalledOnce();
  });
  expect(openFile).toHaveBeenCalledWith(note);
});

it('uses the singular for one note and reports a note that cannot be opened', async () => {
  const app = App.createConfigured__();
  const showError = vi.fn();
  const note = file('Note.md');
  const modal = createModal(app, [{ narrower: [file('Tags/Child.md')], note, tag: file('Tags/Parent.md') }], showError);
  const error = new Error('Cannot open');
  vi.spyOn(app.workspace.getLeaf(false), 'openFile').mockRejectedValue(error);
  vi.spyOn(app.workspace, 'getLeaf').mockReturnValue(app.workspace.getLeaf(false));
  modal.onOpen();
  expect(modal.contentEl.querySelector('p')?.textContent).toContain('1 note links a tag');
  modal.contentEl.querySelector('a')?.dispatchEvent(new MouseEvent('click'));
  await vi.waitFor(() => {
    expect(showError).toHaveBeenCalledWith(error);
  });
});
