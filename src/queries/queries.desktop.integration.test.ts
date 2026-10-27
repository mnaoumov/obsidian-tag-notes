import { evalInObsidian } from 'obsidian-integration-testing';
import {
  expect,
  it
} from 'vitest';

it('renders direct and subtree queries, opens links and refreshes after property and hierarchy edits', async () => {
  const result = await evalInObsidian({
    async callback({ app, lib: { clickElement, waitUntil }, obsidianModule: { MarkdownView } }) {
      if (!app.vault.getFolderByPath('Tags')) {
        await app.vault.createFolder('Tags');
      }
      await app.vault.create('Tags/QueryParent.md', '');
      const child = await app.vault.create('Tags/QueryChild.md', '---\nbroader:\n  - "[[QueryParent]]"\n---\n');
      await app.vault.create('QueryDirect.md', '---\nkeywords:\n  - "[[QueryParent]]"\n---\n');
      const note = await app.vault.create('QueryNested.md', '---\nkeywords:\n  - "[[QueryChild]]"\n---\n');
      const query = await app.vault.create('QueryDisplay.md', '```tag-notes\ntag: Tags/QueryParent\n```\n\n```tag-notes\ntag: Tags/QueryParent\nincludeDescendants: true\n```');
      const leaf = app.workspace.getLeaf(false);
      await leaf.openFile(query);
      await leaf.setViewState({ state: { file: query.path, mode: 'preview' }, type: 'markdown' });
      function blocks(): Element[] {
        return [...leaf.view.containerEl.querySelectorAll(':scope .markdown-preview-view .tag-notes-query')];
      }
      await waitUntil({ message: 'subtree query rendered', predicate: () => blocks()[1]?.querySelectorAll('a').length === 2, timeoutInMilliseconds: 2500 });
      const direct = blocks()[0]?.textContent;
      const subtree = blocks()[1]?.textContent;
      await app.fileManager.processFrontMatter(note, (frontmatter: Record<string, unknown>) => {
        frontmatter['keywords'] = [];
      });
      await waitUntil({ message: 'query refreshed after removing a tag', predicate: () => blocks()[1]?.querySelectorAll('a').length === 1, timeoutInMilliseconds: 2500 });
      await app.fileManager.processFrontMatter(note, (frontmatter: Record<string, unknown>) => {
        frontmatter['keywords'] = ['[[QueryChild]]'];
      });
      await waitUntil({ message: 'query restored after tagging', predicate: () => blocks()[1]?.querySelectorAll('a').length === 2, timeoutInMilliseconds: 2500 });
      await app.fileManager.processFrontMatter(child, (frontmatter: Record<string, unknown>) => {
        frontmatter['broader'] = [];
      });
      await waitUntil({ message: 'query refreshed after removing the parent', predicate: () => blocks()[1]?.querySelectorAll('a').length === 1, timeoutInMilliseconds: 2500 });
      const link = blocks()[0]?.querySelector<HTMLElement>('a');
      if (!link) {
        throw new Error('Query link missing');
      }
      await clickElement({ element: link });
      await waitUntil({ message: 'query link opens note', predicate: () => app.workspace.getActiveViewOfType(MarkdownView)?.file?.path === 'QueryDirect.md', timeoutInMilliseconds: 2500 });
      return { direct, subtree };
    }
  });
  expect(result.direct).toBe('QueryDirect');
  expect(result.subtree).toContain('QueryDirect');
  expect(result.subtree).toContain('QueryNested');
});

it('copies the selected tag subtree through the real command picker and filters a real base', async () => {
  const result = await evalInObsidian({
    async callback({ app, lib: { clickElement, waitUntil } }) {
      const writeText = navigator.clipboard.writeText.bind(navigator.clipboard);
      let copied = '';
      navigator.clipboard.writeText = async (text): Promise<void> => {
        copied = text;
        await writeText(text);
      };
      window.electron.clipboard.writeText('native-probe');
      const nativeProbe = window.electron.clipboard.readText();
      try {
        const child = app.vault.getFileByPath('Tags/QueryChild.md');
        if (!child) {
          throw new Error('Child missing');
        }
        await app.fileManager.processFrontMatter(child, (frontmatter: Record<string, unknown>) => {
          frontmatter['broader'] = ['[[QueryParent]]'];
        });
        await waitUntil({ message: 'subtree restored', predicate: () => app.metadataCache.getFileCache(child)?.frontmatterLinks?.some((link) => link.key.startsWith('broader.') && link.link === 'QueryParent') === true, timeoutInMilliseconds: 2500 });
        const markdown = await app.vault.create('QueryMarkdown.md', '---\nkeywords:\n  - "[Parent](Tags/QueryParent.md)"\n---\n');
        await waitUntil({ message: 'Markdown property indexed', predicate: () => app.metadataCache.getFileCache(markdown) !== null, timeoutInMilliseconds: 2500 });
        await app.vault.create('QueryMention.md', 'Body [[QueryParent]]');
        app.commands.executeCommandById('tag-notes:copy-bases-filter');
        await waitUntil({ message: 'Bases picker opened', predicate: () => document.querySelector('.prompt-input') !== null, timeoutInMilliseconds: 2500 });
        const input = document.querySelector<HTMLInputElement>('.prompt-input');
        if (!input) {
          throw new Error('Picker missing');
        }
        input.value = 'QueryParent';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await waitUntil({ message: 'tag choice shown', predicate: () => document.querySelector('.suggestion-item')?.textContent.includes('Tags/QueryParent.md') === true, timeoutInMilliseconds: 2500 });
        const choice = document.querySelector<HTMLElement>('.suggestion-item');
        if (!choice) {
          throw new Error('Choice missing');
        }
        await clickElement({ element: choice });
        await waitUntil({ message: 'Bases copy notice', predicate: () => document.querySelector('.notice')?.textContent.includes('Bases') === true, timeoutInMilliseconds: 2500 });
        const notice = document.querySelector('.notice')?.textContent;
        if (notice?.includes('Could not copy')) {
          throw new Error(notice);
        }
        await waitUntil({ message: 'copy completed', predicate: () => copied.includes('QueryParent.md'), timeoutInMilliseconds: 2500 });
        const clipboard = window.electron.clipboard.readText();
        const base = await app.vault.create('QueryResults.base', `filters: ${JSON.stringify(copied)}\nviews:\n  - type: table\n    name: Tagged\n    order:\n      - file.name\n`);
        const leaf = app.workspace.getLeaf(false);
        await leaf.openFile(base);
        await waitUntil({ message: 'base shows tagged note', predicate: () => leaf.view.containerEl.textContent.includes('QueryDirect'), timeoutInMilliseconds: 2500 });
        return { clipboard, content: leaf.view.containerEl.textContent, nativeProbe, text: copied };
      } finally {
        Object.assign(navigator.clipboard, { writeText });
      }
    }
  });
  expect(result.text).toContain('list(note["keywords"]).contains(link("Tags/QueryParent.md"))');
  expect(result.content).toContain('QueryDirect');
  expect(result.text).toContain('link("Tags/QueryChild.md")');
  expect(result.content).toContain('QueryNested');
  expect(result.content).not.toContain('QueryMention');
  expect(result.text).toContain('[Parent]');
  expect(result.content).toContain('QueryMarkdown');
  if (result.nativeProbe === 'native-probe') {
    expect(result.clipboard).toBe(result.text);
  } else {
    console.warn('Native clipboard probe returned empty in the hidden runtime; asserted the real write call and Bases results.');
  }
});
