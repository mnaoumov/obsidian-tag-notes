import { evalInObsidian } from 'obsidian-integration-testing';
import {
  expect,
  it
} from 'vitest';

it('offers the conversion on a right-click of a core Tags pane row', async () => {
  const result = await evalInObsidian({
    async callback({ app, lib: { clickElement, waitUntil } }) {
      const timeoutInMilliseconds = 2500;
      const source = await app.vault.create('Pane source.md', '#PaneOnly\n');
      await waitUntil({ message: 'pane tag cached', predicate: () => (app.metadataCache.getFileCache(source)?.tags?.length ?? 0) === 1, timeoutInMilliseconds });
      const leaf = app.workspace.getLeaf(true);
      await leaf.setViewState({ active: true, type: 'tag' });
      function findRow(): HTMLElement | null {
        return [...leaf.view.containerEl.querySelectorAll<HTMLElement>('.tag-pane-tag')].find((element) => element.textContent.includes('PaneOnly')) ?? null;
      }
      function findItem(): HTMLElement | null {
        return [...document.querySelectorAll<HTMLElement>('.menu .menu-item')].find((element) => element.textContent.includes('Convert #PaneOnly to tag note')) ?? null;
      }
      await waitUntil({ message: 'tag pane row', predicate: () => findRow() !== null, timeoutInMilliseconds });
      const row = findRow();
      if (!row) {
        throw new Error('Missing tag pane row');
      }
      await clickElement({ button: 'right', element: row });
      await waitUntil({ message: 'tag pane menu', predicate: () => findItem() !== null, timeoutInMilliseconds });
      const item = findItem();
      if (!item) {
        throw new Error('Missing menu item');
      }
      await clickElement({ element: item });
      await waitUntil({ message: 'pane dialog', predicate: () => document.querySelector('.tag-notes-migration') !== null, timeoutInMilliseconds });
      const title = document.querySelector('.modal-title')?.textContent ?? null;
      const cancel = [...document.querySelectorAll<HTMLElement>('.tag-notes-migration button')].find((button) => button.textContent === 'Cancel');
      if (cancel) {
        await clickElement({ element: cancel });
      }
      leaf.detach();
      return { title, unchanged: await app.vault.read(source) };
    }
  });
  expect(result.title).toBe('Convert #PaneOnly');
  expect(result.unchanged).toBe('#PaneOnly\n');
});
