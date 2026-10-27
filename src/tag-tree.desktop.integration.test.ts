import { evalInObsidian } from 'obsidian-integration-testing';
import {
  expect,
  it
} from 'vitest';

it('opens the tag tree command and shows distinct subtree counts and notes', async () => {
  const result = await evalInObsidian({
    async callback({ app, lib: { waitUntil } }) {
      if (!app.vault.getFolderByPath('Tags')) {
        await app.vault.createFolder('Tags');
      }
      await app.vault.create('Tags/TreeParent.md', '');
      await app.vault.create('Tags/TreeChild.md', '---\nbroader:\n  - "[[TreeParent]]"\n---\n');
      await app.vault.create('TreeNote.md', '---\nkeywords:\n  - "[[TreeParent]]"\n  - "[[TreeChild]]"\n---\n');
      app.commands.executeCommandById('tag-notes:open-tag-tree');
      await waitUntil({ message: 'tag tree rendered', predicate: () => document.querySelector('.tag-notes-tree')?.textContent.includes('TreeParent') === true, timeoutInMilliseconds: 2500 });
      const rows = [...document.querySelectorAll('.tag-notes-tree-row')];
      const parent = rows.find((row) => row.querySelector('.tag-notes-tag')?.textContent === 'TreeParent');
      const counts = parent?.querySelector('.tag-notes-counts')?.textContent;
      parent?.querySelector<HTMLButtonElement>('.tag-notes-list')?.click();
      await waitUntil({ message: 'subtree note listed', predicate: () => document.querySelector('.tag-notes-results')?.textContent.includes('TreeNote') === true, timeoutInMilliseconds: 2500 });
      return { counts, notes: document.querySelectorAll('.tag-notes-results .tag-notes-note').length };
    }
  });
  expect(result).toEqual({ counts: '1 / 1', notes: 1 });
});

it('creates and renames child tags through the real context menu and keeps links updated', async () => {
  const result = await evalInObsidian({
    async callback({ app, lib: { clickElement, waitUntil } }) {
      const leaf = app.workspace.getLeavesOfType('tag-notes-tree')[0];
      if (!leaf) {
        throw new Error('Tree missing');
      }
      const content = leaf.view.containerEl;
      const row = [...content.querySelectorAll<HTMLElement>('.tag-notes-tree-row')].find((entry) => entry.querySelector('.tag-notes-tag')?.textContent === 'TreeParent');
      if (!row) {
        throw new Error('Parent row missing');
      }
      await clickElement({ button: 'right', element: row });
      await waitUntil({ message: 'child action visible', predicate: () => [...document.querySelectorAll('.menu-item')].some((item) => item.textContent.includes('New child tag')), timeoutInMilliseconds: 2500 });
      const childAction = [...document.querySelectorAll<HTMLElement>('.menu-item')].find((item) => item.textContent.includes('New child tag'));
      if (!childAction) {
        throw new Error('Child action missing');
      }
      await clickElement({ element: childAction });
      await waitUntil({ message: 'child prompt opened', predicate: () => document.querySelector('.modal input') !== null, timeoutInMilliseconds: 2500 });
      const input = document.querySelector<HTMLInputElement>('.modal input');
      if (!input) {
        throw new Error('Prompt input missing');
      }
      input.value = 'CreatedChild';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await waitUntil({ message: 'child name validated', predicate: () => input.checkValidity(), timeoutInMilliseconds: 2500 });
      const createButton = document.querySelector<HTMLButtonElement>('.modal button.mod-cta');
      if (!createButton) {
        throw new Error('Create button missing');
      }
      await clickElement({ element: createButton });
      await waitUntil({ message: 'child created and indexed', predicate: () => content.textContent.includes('CreatedChild'), timeoutInMilliseconds: 2500 });
      const child = app.vault.getFileByPath('Tags/CreatedChild.md');
      if (!child) {
        throw new Error('Child missing');
      }
      const created = await app.vault.read(child);
      const parentRow = [...content.querySelectorAll<HTMLElement>('.tag-notes-tree-row')].find((entry) => entry.querySelector('.tag-notes-tag')?.textContent === 'TreeParent');
      if (!parentRow) {
        throw new Error('Parent row missing');
      }
      await clickElement({ button: 'right', element: parentRow });
      await waitUntil({ message: 'rename action visible', predicate: () => [...document.querySelectorAll('.menu-item')].some((item) => item.textContent.trim() === 'Rename'), timeoutInMilliseconds: 2500 });
      const renameAction = [...document.querySelectorAll<HTMLElement>('.menu-item')].find((item) => item.textContent.trim() === 'Rename');
      if (!renameAction) {
        throw new Error('Rename action missing');
      }
      await clickElement({ element: renameAction });
      await waitUntil({ message: 'rename prompt opened', predicate: () => document.querySelector('.modal input') !== null, timeoutInMilliseconds: 2500 });
      const renameInput = document.querySelector<HTMLInputElement>('.modal input');
      if (!renameInput) {
        throw new Error('Rename input missing');
      }
      renameInput.value = 'RenamedParent';
      renameInput.dispatchEvent(new Event('input', { bubbles: true }));
      await waitUntil({ message: 'rename validated', predicate: () => renameInput.checkValidity(), timeoutInMilliseconds: 2500 });
      const renameButton = document.querySelector<HTMLButtonElement>('.modal button.mod-cta');
      if (!renameButton) {
        throw new Error('Rename button missing');
      }
      await clickElement({ element: renameButton });
      await waitUntil({ message: 'parent renamed', predicate: () => app.vault.getFileByPath('Tags/RenamedParent.md') !== null, timeoutInMilliseconds: 2500 });
      await waitUntil({
        message: 'child link updated',
        predicate: async () => {
          const text = await app.vault.read(child);
          return text.includes('RenamedParent');
        }
      });
      return { created, renamed: await app.vault.read(child) };
    }
  });
  expect(result.created).toContain('broader:');
  expect(result.created).toContain('TreeParent');
  expect(result.renamed).toContain('RenamedParent');
});
