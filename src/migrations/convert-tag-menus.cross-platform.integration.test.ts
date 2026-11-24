import { evalInObsidian } from 'obsidian-integration-testing';
import {
  expect,
  it
} from 'vitest';

it('converts only the tag under the editor caret from its context menu, after a scoped preview', async () => {
  const result = await evalInObsidian({
    async callback({ app, lib: { waitUntil }, obsidianModule: { MarkdownView, Menu, parseYaml } }) {
      const timeoutInMilliseconds = 2500;
      const source = await app.vault.create('Scoped source.md', '---\ntags: [ScopedKeep]\n---\nSee #ScopedAlpha/ScopedBravo and #ScopedOther.\n');
      await waitUntil({ message: 'source tags cached', predicate: () => (app.metadataCache.getFileCache(source)?.tags?.length ?? 0) === 2, timeoutInMilliseconds });
      const leaf = app.workspace.getLeaf(true);
      await leaf.openFile(source);
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) {
        throw new TypeError('Missing editor');
      }
      const line = view.editor.getLine(3);
      view.editor.setCursor({ ch: line.indexOf('ScopedBravo'), line: 3 });
      const menu = new Menu();
      app.workspace.trigger('editor-menu', menu, view.editor, view);
      menu.showAtPosition({ x: 10, y: 10 });
      const titles = [...document.querySelectorAll('.menu .menu-item-title')].map((element) => element.textContent);
      // These are plugin-owned click handlers with no trusted-input gate; this also runs on Android.
      [...document.querySelectorAll<HTMLElement>('.menu .menu-item')].find((element) => element.textContent.includes('Convert #ScopedAlpha/ScopedBravo to tag note'))?.click();
      await waitUntil({ message: 'scoped dialog', predicate: () => document.querySelector('.tag-notes-migration') !== null, timeoutInMilliseconds });
      const modal = document.querySelector<HTMLElement>('.tag-notes-migration');
      if (!modal) {
        throw new Error('Missing dialog');
      }
      [...modal.querySelectorAll('button')].find((button) => button.textContent === 'Preview')?.click();
      await waitUntil({ message: 'scoped preview', predicate: () => [...modal.querySelectorAll('button')].some((button) => button.textContent === 'Convert'), timeoutInMilliseconds });
      const previewText = modal.textContent;
      [...modal.querySelectorAll('button')].find((button) => button.textContent === 'Convert')?.click();
      await waitUntil({ message: 'scoped conversion', predicate: () => document.querySelector('.tag-notes-migration') === null, timeoutInMilliseconds });
      const converted = await app.vault.read(source);
      const properties: unknown = parseYaml(converted.slice(converted.indexOf('\n') + 1, converted.indexOf('\n---', 1)));
      leaf.detach();
      return { converted, hasOtherTagNote: app.vault.getFileByPath('Tags/ScopedOther.md') !== null, previewText, properties, titles };
    }
  });
  expect(result.titles).toContain('Convert #ScopedAlpha/ScopedBravo to tag note');
  expect(result.previewText).toContain('#ScopedAlpha/ScopedBravo → Tags/ScopedBravo.md (create)');
  expect(result.previewText).not.toContain('#ScopedOther →');
  expect(result.converted).toContain('#ScopedOther.');
  expect(result.converted).not.toContain('#ScopedAlpha');
  expect(result.properties).toHaveProperty('tags', ['ScopedKeep']);
  expect(result.properties).toHaveProperty('keywords', '[[ScopedBravo]]');
  expect(result.hasOtherTagNote).toBe(false);
});
