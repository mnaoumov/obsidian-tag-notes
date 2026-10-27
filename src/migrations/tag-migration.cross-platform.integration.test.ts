import { evalInObsidian } from 'obsidian-integration-testing';
import {
  expect,
  it
} from 'vitest';

it('previews, cancels and confirms a folder migration through the real command and respects Markdown link format', async () => {
  const result = await evalInObsidian({
    async callback({ app, lib: { waitUntil }, obsidianModule: { parseYaml } }) {
      const timeoutInMilliseconds = 5000;
      await app.vault.createFolder('Migration');
      const source = await app.vault.create('Migration/Source.md', '---\ntags: [MigrationAlpha/MigrationBravo, MigrationCharlie/MigrationBravo]\nother: retained\n---\nSentence #MigrationAlpha/MigrationBravo.\n`#CodeOnly`\n');
      await app.vault.create('MigrationCharlie.md', 'Existing tag note');
      const excluded = await app.vault.create('MigrationExcluded.md', '#ExcludedTag');
      const original = await app.vault.read(source);
      app.vault.setConfig('useMarkdownLinks', true);
      app.commands.executeCommandById('tag-notes:convert-tags');
      await waitUntil({ message: 'migration dialog', predicate: () => document.querySelector('.tag-notes-migration') !== null, timeoutInMilliseconds });
      const modal = document.querySelector<HTMLElement>('.tag-notes-migration');
      if (!modal) {
        throw new Error('Missing migration dialog');
      }
      const input = modal.querySelector<HTMLInputElement>('input');
      if (!input) {
        throw new Error('Missing scope');
      }
      input.value = 'Migration';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      // These are plugin-owned click handlers with no trusted-input gate; this also runs on Android.
      const preview = [...modal.querySelectorAll('button')].find((button) => button.textContent === 'Preview');
      preview?.click();
      await waitUntil({ message: 'migration preview', predicate: () => modal.textContent.includes('Tags/MigrationBravo (MigrationAlpha).md'), timeoutInMilliseconds });
      const isUnchangedAtPreview = await app.vault.read(source) === original && app.vault.getFileByPath('Tags/MigrationBravo (MigrationAlpha).md') === null;
      [...modal.querySelectorAll('button')].find((button) => button.textContent === 'Cancel')?.click();
      const isUnchangedAfterCancel = await app.vault.read(source) === original;
      app.commands.executeCommandById('tag-notes:convert-tags');
      await waitUntil({ message: 'migration reopened', predicate: () => document.querySelector('.tag-notes-migration') !== null, timeoutInMilliseconds });
      const second = document.querySelector<HTMLElement>('.tag-notes-migration');
      const folder = second?.querySelector<HTMLInputElement>('input');
      if (!second || !folder) {
        throw new Error('Missing second dialog');
      }
      folder.value = 'Migration';
      folder.dispatchEvent(new Event('input', { bubbles: true }));
      [...second.querySelectorAll('button')].find((button) => button.textContent === 'Preview')?.click();
      await waitUntil({ message: 'confirmation available', predicate: () => [...second.querySelectorAll('button')].some((button) => button.textContent === 'Convert'), timeoutInMilliseconds });
      [...second.querySelectorAll('button')].find((button) => button.textContent === 'Convert')?.click();
      await waitUntil({ message: 'migration completed', predicate: () => document.querySelector('.tag-notes-migration') === null, timeoutInMilliseconds });
      const child = app.vault.getFileByPath('Tags/MigrationBravo (MigrationCharlie).md');
      if (!child) {
        throw new Error('Missing child tag');
      }
      const converted = await app.vault.read(source);
      const childText = await app.vault.read(child);
      const properties: unknown = parseYaml(converted.slice(converted.indexOf('\n') + 1, converted.indexOf('\n---', 1)));
      return { childText, converted, excluded: await app.vault.read(excluded), properties, unchangedAfterCancel: isUnchangedAfterCancel, unchangedAtPreview: isUnchangedAtPreview };
    }
  });
  expect(result.unchangedAtPreview).toBe(true);
  expect(result.unchangedAfterCancel).toBe(true);
  expect(result.excluded).toBe('#ExcludedTag');
  expect(result.converted).toMatch(/Sentence \[[^\n]+\]\([^\n]+\)/u);
  expect(result.converted).not.toContain('Sentence [[');
  expect(result.converted).toContain('`#CodeOnly`');
  expect(result.converted).not.toContain('Sentence #MigrationAlpha');
  expect(result.properties).toHaveProperty('other', 'retained');
  expect(result.properties).not.toHaveProperty('tags');
  expect(result.properties).toHaveProperty('keywords');
  expect(result.childText).toContain('MigrationCharlie');
  expect(result.childText).toContain('aliases:');
});
