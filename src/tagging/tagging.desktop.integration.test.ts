import { evalInObsidian } from 'obsidian-integration-testing';
import {
  expect,
  it
} from 'vitest';

it('offers tag notes by alias and tags through the editor', async () => {
  const result = await evalInObsidian({
    async callback({ app, lib: { pressKey, typeIntoEditor, waitUntil }, obsidianModule: { MarkdownView } }) {
      if (!app.vault.getFolderByPath('Tags')) {
        await app.vault.createFolder('Tags');
      }
      await app.vault.create('Tags/SuggestAlpha.md', '---\naliases:\n  - SuggestAlias\n---\n');
      const source = await app.vault.create('SuggestSource.md', 'Text ');
      await app.workspace.getLeaf(false).openFile(source);
      const view = app.workspace.getActiveViewOfType(MarkdownView);
      if (!view) {
        throw new Error('Editor missing');
      }
      await typeIntoEditor({ editor: view.editor, text: '@SuggestAlias' });
      await waitUntil({ message: 'tag note suggestion', predicate: () => document.querySelector('.tag-notes-suggestion') !== null, timeoutInMilliseconds: 2500 });
      const suggestion = document.querySelector('.tag-notes-suggestion')?.textContent;
      await pressKey({ key: 'Enter' });
      await waitUntil({
        message: 'property written',
        predicate: async () => {
          const content = await app.vault.read(source);
          return content.includes('keywords:');
        },
        timeoutInMilliseconds: 2500
      });
      return { content: await app.vault.read(source), suggestion };
    }
  });
  expect(result.suggestion).toContain('SuggestAlpha');
  expect(result.content).toContain('[[SuggestAlpha]]');
  expect(result.content).not.toContain('@SuggestAlias');
  expect(result.content).toContain('Text ');
});

it('creates from the command and avoids duplicate property links across link formats', async () => {
  const result = await evalInObsidian({
    async callback({ app, lib: { pressKey, waitUntil }, obsidianModule: { MarkdownView } }) {
      const source = await app.vault.create('SuggestCommandSource.md', 'Command text');
      await app.workspace.getLeaf(false).openFile(source);
      app.vault.setConfig('useMarkdownLinks', true);
      const processFrontMatter = app.fileManager.processFrontMatter.bind(app.fileManager);
      let processed = 0;
      app.fileManager.processFrontMatter = async (...arguments_): Promise<void> => {
        await processFrontMatter(...arguments_);
        processed++;
      };
      try {
        app.commands.executeCommandById('tag-notes:tag-this-note');
        await waitUntil({ message: 'command picker opened', predicate: () => document.querySelector('.prompt-input') !== null, timeoutInMilliseconds: 2500 });
        const input = document.querySelector<HTMLInputElement>('.prompt-input');
        if (!input) {
          throw new Error('Picker missing');
        }
        input.value = 'SuggestCreated';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await waitUntil({ message: 'create option', predicate: () => document.querySelector('.tag-notes-suggestion')?.textContent.includes('Create tag note: SuggestCreated') === true, timeoutInMilliseconds: 2500 });
        await pressKey({ key: 'Enter' });
        await waitUntil({ message: 'new tag linked', predicate: () => app.metadataCache.getFileCache(source)?.frontmatter?.['keywords'] !== undefined, timeoutInMilliseconds: 2500 });
        const first = await app.vault.read(source);
        app.vault.setConfig('useMarkdownLinks', false);
        const view = app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) {
          throw new Error('Editor missing');
        }
        app.commands.executeCommandById('tag-notes:tag-this-note');
        await waitUntil({ message: 'picker reopened', predicate: () => document.querySelector('.prompt-input') !== null, timeoutInMilliseconds: 2500 });
        const second = document.querySelector<HTMLInputElement>('.prompt-input');
        if (!second) {
          throw new Error('Second picker missing');
        }
        second.value = 'SuggestCreated';
        second.dispatchEvent(new Event('input', { bubbles: true }));
        await waitUntil({ message: 'existing tag offered', predicate: () => document.querySelector('.tag-notes-suggestion')?.textContent.includes('Tags/SuggestCreated.md') === true, timeoutInMilliseconds: 2500 });
        await pressKey({ key: 'Enter' });
        await waitUntil({ message: 'picker closed', predicate: () => document.querySelector('.prompt-input') === null, timeoutInMilliseconds: 2500 });
        await waitUntil({ message: 'both property operations finished', predicate: () => processed === 2, timeoutInMilliseconds: 2500 });
        return { final: await app.vault.read(source), first, target: app.vault.getFileByPath('Tags/SuggestCreated.md')?.path };
      } finally {
        Object.assign(app.fileManager, { processFrontMatter });
        app.vault.setConfig('useMarkdownLinks', false);
      }
    }
  });
  expect(result.target).toBe('Tags/SuggestCreated.md');
  expect(result.first).toMatch(/\[SuggestCreated\]\((?:Tags\/)?SuggestCreated\.md\)/u);
  expect(result.final).toBe(result.first);
  expect(result.final).toContain('Command text');
});

it('loads a custom trigger and inserts body mentions without adding tags', async () => {
  const result = await evalInObsidian({
    async callback({ app, lib: { pressKey, typeIntoEditor, waitUntil }, obsidianModule: { MarkdownView } }) {
      const plugin = app.plugins.plugins['tag-notes'];
      if (!plugin) {
        throw new Error('Plugin missing');
      }
      await plugin.saveData({ insertBodyLink: true, suggestTrigger: '::' });
      await app.plugins.disablePlugin('tag-notes');
      await app.plugins.enablePlugin('tag-notes');
      try {
        const source = await app.vault.create('SuggestBodySource.md', 'Body ');
        await app.workspace.getLeaf(false).openFile(source);
        const view = app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) {
          throw new Error('Editor missing');
        }
        await typeIntoEditor({ editor: view.editor, text: '::SuggestAlias' });
        await waitUntil({ message: 'custom trigger suggestion', predicate: () => document.querySelector('.tag-notes-suggestion')?.textContent.includes('SuggestAlpha') === true, timeoutInMilliseconds: 2500 });
        await pressKey({ key: 'Enter' });
        await waitUntil({ message: 'body link inserted', predicate: () => view.editor.getValue().includes('[[SuggestAlpha]]'), timeoutInMilliseconds: 2500 });
        return view.editor.getValue();
      } finally {
        await app.plugins.plugins['tag-notes']?.saveData({});
        await app.plugins.disablePlugin('tag-notes');
        await app.plugins.enablePlugin('tag-notes');
      }
    }
  });
  expect(result).toBe('Body [[SuggestAlpha]]');
});

it('leaves both notes unchanged when the active editor switches during selection', async () => {
  const result = await evalInObsidian({
    async callback({ app, lib: { pressKey, waitUntil } }) {
      const first = await app.vault.create('SuggestStaleFirst.md', 'First note');
      const second = await app.vault.create('SuggestStaleSecond.md', 'Second note');
      const leaf = app.workspace.getLeaf(false);
      await leaf.openFile(first);
      app.commands.executeCommandById('tag-notes:tag-this-note');
      await waitUntil({ message: 'stale picker opened', predicate: () => document.querySelector('.prompt-input') !== null, timeoutInMilliseconds: 2500 });
      const input = document.querySelector<HTMLInputElement>('.prompt-input');
      if (!input) {
        throw new Error('Picker missing');
      }
      input.value = 'SuggestAlpha';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await waitUntil({ message: 'stale choice rendered', predicate: () => document.querySelector('.tag-notes-suggestion')?.textContent.includes('SuggestAlpha') === true, timeoutInMilliseconds: 2500 });
      await leaf.openFile(second);
      input.focus();
      await pressKey({ key: 'Enter' });
      await waitUntil({ message: 'stale selection rejected', predicate: () => [...document.querySelectorAll('.notice')].some((notice) => notice.textContent.includes('The note changed')), timeoutInMilliseconds: 2500 });
      return { first: await app.vault.read(first), second: await app.vault.read(second) };
    }
  });
  expect(result).toEqual({ first: 'First note', second: 'Second note' });
});
