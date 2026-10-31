/**
 * @file
 *
 * Integration suite for bulk-operation commits: with `shouldCommitBulkOperations` on and the vault inside a git
 * work tree, a Convert tags run lands as `chore: before OP<n>` (what was pending) followed by
 * `OP<n>: Convert tags in <folder>` (what the run changed), and `git revert` of the second commit puts the vault back.
 *
 * The shared temporary vault is made a git work tree for this suite only, and its `.git` is removed again
 * afterwards, so no other suite runs against a repository. The config folder is ignored, because the workspace file
 * Obsidian keeps rewriting would otherwise land in the operation's commit and make its revert conflict.
 *
 * It is named `*.desktop.integration.test.ts` so it runs only in the desktop integration project: the commits
 * need the system `git`, which only the desktop app reaches.
 */

import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

const PLUGIN_ID = 'tag-notes';
const FOLDER_PATH = 'BulkOperationCommits';
const SOURCE_PATH = `${FOLDER_PATH}/Source.md`;
const SOURCE_CONTENT = 'Sentence #BulkOperationAlpha.\n';
const TAG_NOTE_PATH = 'Tags/BulkOperationAlpha.md';
const COMMIT_WAIT_TIMEOUT_IN_MILLISECONDS = 30_000;
const COMMIT_POLL_INTERVAL_IN_MILLISECONDS = 200;

let vaultPath: string;

function git(...gitArguments: string[]): string {
  return execFileSync('git', gitArguments, { cwd: vaultPath, encoding: 'utf-8' }).trim();
}

beforeAll(async () => {
  vaultPath = getTemporaryVault().path;
  const configDirectory = await evalInObsidian({
    callback({ app }): string {
      return app.vault.configDir;
    },
    vaultPath
  });
  git('init', '--quiet', '--initial-branch=main');
  // Hooks from the machine's global config must not decide whether the suite's commits land.
  const hooksPath = join(vaultPath, '.git', 'test-hooks');
  mkdirSync(hooksPath);
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.com');
  git('config', 'commit.gpgSign', 'false');
  // A global core.autocrlf would check the reverted note out with CRLF line endings.
  git('config', 'core.autocrlf', 'false');
  git('config', 'core.hooksPath', hooksPath);
  writeFileSync(join(vaultPath, '.gitignore'), `${configDirectory}/\n`);
  git('add', '-A');
  git('commit', '--quiet', '--allow-empty', '-m', 'chore: vault before the suite');
});

afterAll(async () => {
  // Turned off only once the operation's commit has landed: the commit is made after the vault goes quiet,
  // well after the conversion the test waits for.
  await evalInObsidian({
    async callback({ app, folderPath, pluginId }): Promise<void> {
      const plugin = app.plugins.getPlugin(pluginId);
      if (plugin?.onExternalSettingsChange) {
        const saved: unknown = await plugin.loadData();
        await plugin.saveData({ ...(saved as object), shouldCommitBulkOperations: false });
        await plugin.onExternalSettingsChange();
      }
      const folder = app.vault.getFolderByPath(folderPath);
      if (folder) {
        await app.fileManager.trashFile(folder);
      }
    },
    input: { folderPath: FOLDER_PATH, pluginId: PLUGIN_ID },
    vaultPath
  });
  rmSync(join(vaultPath, '.git'), { force: true, recursive: true });
  rmSync(join(vaultPath, '.gitignore'), { force: true });
});

describe('bulk operation commits (Desktop)', () => {
  it('should record a folder conversion as two commits that a revert undoes', async () => {
    const convertedContent = await runConvertTagsInFolder();
    expect(convertedContent).not.toContain('#BulkOperationAlpha');

    const operationCommitSha = await waitForOperationCommit();
    const subjects = git('log', '--format=%s', '-2', operationCommitSha).split('\n');
    const operationId = /^(?<operationId>OP\d+): /u.exec(subjects[0] ?? '')?.groups?.['operationId'];
    expect(subjects).toEqual([
      `${operationId ?? 'OP?'}: Convert tags in ${FOLDER_PATH}`,
      `chore: before ${operationId ?? 'OP?'}`
    ]);
    expect(git('show', '--name-only', '--format=', operationCommitSha).split('\n').sort()).toEqual([SOURCE_PATH, TAG_NOTE_PATH]);
    expect(git('show', '--format=%B', '--no-patch', operationCommitSha)).toContain(`Obsidian-Plugin: ${PLUGIN_ID}`);

    git('revert', '--no-edit', operationCommitSha);

    expect(await readFromVault(SOURCE_PATH)).toBe(SOURCE_CONTENT);
    expect(await doesExistInVault(TAG_NOTE_PATH)).toBe(false);
    expect(git('status', '--porcelain')).toBe('');
  });
});

/**
 * Checks whether a path exists the way the vault sees it after git rewrote it from outside.
 *
 * @param path - The vault path.
 * @returns Whether it exists.
 */
async function doesExistInVault(path: string): Promise<boolean> {
  return evalInObsidian({
    async callback({ app, notePath }): Promise<boolean> {
      return await app.vault.adapter.exists(notePath);
    },
    input: { notePath: path },
    vaultPath
  });
}

/**
 * Reads a note the way the vault sees it after git rewrote it from outside.
 *
 * @param path - The note's vault path.
 * @returns Its content.
 */
async function readFromVault(path: string): Promise<string> {
  return evalInObsidian({
    async callback({ app, notePath }): Promise<string> {
      return await app.vault.adapter.read(notePath);
    },
    input: { notePath: path },
    vaultPath
  });
}

/**
 * Turns the commits on, creates the tagged note, runs Convert tags over its folder through the real dialog, and
 * returns the source once the conversion is on disk.
 *
 * @returns The converted source.
 */
async function runConvertTagsInFolder(): Promise<string> {
  return evalInObsidian({
    async callback({ app, folderPath, lib: { waitUntil }, pluginId, sourceContent, sourcePath, tagNotePath }): Promise<string> {
      const timeoutInMilliseconds = 5000;
      const plugin = app.plugins.getPlugin(pluginId);
      if (!plugin?.onExternalSettingsChange) {
        throw new Error(`Plugin not found: ${pluginId}`);
      }
      const saved: unknown = await plugin.loadData();
      await plugin.saveData({ ...(saved as object), shouldCommitBulkOperations: true });
      await plugin.onExternalSettingsChange();

      await app.vault.createFolder(folderPath);
      const source = await app.vault.create(sourcePath, sourceContent);
      await waitUntil({ message: 'source indexed', predicate: () => (app.metadataCache.getFileCache(source)?.tags?.length ?? 0) > 0, timeoutInMilliseconds });

      app.commands.executeCommandById(`${pluginId}:convert-tags`);
      await waitUntil({ message: 'migration dialog', predicate: () => document.querySelector('.tag-notes-migration') !== null, timeoutInMilliseconds });
      const modal = document.querySelector<HTMLElement>('.tag-notes-migration');
      const input = modal?.querySelector<HTMLInputElement>('input');
      if (!modal || !input) {
        throw new Error('Missing migration dialog');
      }
      input.value = folderPath;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      [...modal.querySelectorAll('button')].find((button) => button.textContent === 'Preview')?.click();
      await waitUntil({ message: 'confirmation available', predicate: () => [...modal.querySelectorAll('button')].some((button) => button.textContent === 'Convert'), timeoutInMilliseconds });
      [...modal.querySelectorAll('button')].find((button) => button.textContent === 'Convert')?.click();
      await waitUntil({ message: 'migration completed', predicate: () => document.querySelector('.tag-notes-migration') === null, timeoutInMilliseconds });
      if (!await app.vault.adapter.exists(tagNotePath)) {
        throw new Error(`Missing tag note ${tagNotePath}`);
      }
      return await app.vault.adapter.read(sourcePath);
    },
    input: { folderPath: FOLDER_PATH, pluginId: PLUGIN_ID, sourceContent: SOURCE_CONTENT, sourcePath: SOURCE_PATH, tagNotePath: TAG_NOTE_PATH },
    vaultPath
  });
}

/**
 * Waits for the operation's commit, which lands only after the vault has gone quiet following the run.
 *
 * @returns The commit's sha.
 */
async function waitForOperationCommit(): Promise<string> {
  const start = performance.now();
  while (performance.now() - start < COMMIT_WAIT_TIMEOUT_IN_MILLISECONDS) {
    const sha = git('log', '--format=%H', '-1', '--grep=^OP[0-9]+: ', '--extended-regexp');
    if (sha) {
      return sha;
    }

    await delay(COMMIT_POLL_INTERVAL_IN_MILLISECONDS);
  }

  throw new Error(`No OP commit appeared within ${String(COMMIT_WAIT_TIMEOUT_IN_MILLISECONDS)} ms`);
}
