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

it('moves, adds and removes parents by dragging rows, and refuses a drop under a descendant', async () => {
  const result = await evalInObsidian({
    async callback({ app, lib: { waitUntil } }) {
      await app.vault.create('Tags/DragA.md', '');
      await app.vault.create('Tags/DragB.md', '');
      const child = await app.vault.create('Tags/DragChild.md', '---\nbroader: "[[DragA]]"\n---\n');
      const leaf = app.workspace.getLeavesOfType('tag-notes-tree')[0];
      if (!leaf) {
        throw new Error('Tree missing');
      }
      const content = leaf.view.containerEl;
      const tree = content.querySelector<HTMLElement>('.tag-notes-tree');
      if (!tree) {
        throw new Error('Tree element missing');
      }
      function findRow(name: string, parent: null | string): HTMLElement {
        const row = [...content.querySelectorAll<HTMLElement>('.tag-notes-tree-row')].find((entry) => {
          const parentRow = entry.parentElement?.parentElement?.closest('.tag-notes-branch')?.querySelector(':scope > .tag-notes-tree-row');
          return entry.querySelector('.tag-notes-tag')?.textContent === name && (parentRow?.querySelector('.tag-notes-tag')?.textContent ?? null) === parent;
        });
        if (!row) {
          throw new Error(`Row ${name} under ${String(parent)} missing`);
        }
        return row;
      }
      function dispatchDrag(element: HTMLElement, type: string, dataTransfer: DataTransfer, isCtrlPressed = false): void {
        // eslint-disable-next-line obsidian-dev-toolkit/no-untrusted-input-events -- `sendInputEvent` cannot express a drag; the view's listeners act on untrusted events, which the file assertions prove.
        element.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, ctrlKey: isCtrlPressed, dataTransfer }));
      }
      function dragTo(source: HTMLElement, target: HTMLElement, isCtrlPressed = false): void {
        const dataTransfer = new DataTransfer();
        dispatchDrag(source, 'dragstart', dataTransfer);
        dispatchDrag(target, 'dragover', dataTransfer, isCtrlPressed);
        dispatchDrag(target, 'drop', dataTransfer, isCtrlPressed);
        dispatchDrag(source, 'dragend', dataTransfer);
      }
      async function waitForText(message: string, isExpected: (text: string) => boolean): Promise<string> {
        let text = '';
        await waitUntil({
          message,
          predicate: async () => {
            text = await app.vault.read(child);
            return isExpected(text);
          },
          timeoutInMilliseconds: 2500
        });
        return text;
      }
      await waitUntil({ message: 'drag rows rendered', predicate: () => content.textContent.includes('DragChild'), timeoutInMilliseconds: 2500 });
      dragTo(findRow('DragChild', 'DragA'), findRow('DragB', null));
      const moved = await waitForText('moved under DragB', (text) => text.includes('DragB') && !text.includes('DragA'));
      await waitUntil({
        message: 'tree shows the move',
        predicate: () => {
          try {
            return findRow('DragChild', 'DragB').isConnected;
          } catch {
            return false;
          }
        },
        timeoutInMilliseconds: 2500
      });
      dragTo(findRow('DragChild', 'DragB'), findRow('DragA', null), true);
      const added = await waitForText('DragA added as a second parent', (text) => text.includes('DragA') && text.includes('DragB'));
      await waitUntil({ message: 'child shown under both parents', predicate: () => content.textContent.split('DragChild').length === 3, timeoutInMilliseconds: 2500 });
      dragTo(findRow('DragA', null), findRow('DragChild', 'DragA'));
      await waitUntil({ message: 'cycle notice shown', predicate: () => [...document.querySelectorAll('.notice')].some((notice) => notice.textContent.includes('would become a cycle')), timeoutInMilliseconds: 2500 });
      const dragA = app.vault.getFileByPath('Tags/DragA.md');
      if (!dragA) {
        throw new Error('DragA missing');
      }
      const afterCycle = await app.vault.read(dragA);
      const source = findRow('DragChild', 'DragA');
      const dataTransfer = new DataTransfer();
      dispatchDrag(source, 'dragstart', dataTransfer);
      dispatchDrag(tree, 'dragover', dataTransfer);
      dispatchDrag(tree, 'drop', dataTransfer);
      const rooted = await waitForText('DragA link removed', (text) => !text.includes('DragA'));
      return { added, afterCycle, moved, rooted };
    }
  });
  expect(result.moved).toContain('broader: "[[DragB]]"');
  expect(result.added).toContain('  - "[[DragB]]"\n  - "[[DragA]]"');
  expect(result.afterCycle).toBe('');
  expect(result.rooted).toContain('broader: "[[DragB]]"');
});
