/**
 * @file
 *
 * The staging closures the desktop and the Android capture suites share. Each frame is staged by `startStage`,
 * which sets it up and returns at once, and is read by `pollStage` until it shows what the frame needs, both
 * through `pollInObsidian`, so every wait happens in Node and no closure comes near the transport's per-eval cap.
 *
 * Both functions are serialized into Obsidian, so neither may reach anything outside its own body: every constant
 * and helper they use is declared inside them.
 */

import type {
  FileExplorerView,
  FileTreeItem,
  FolderTreeItem
} from '@obsidian-typings/obsidian-public-latest';
import type { CommonArguments } from 'obsidian-integration-testing';

/**
 * What {@link reserveCaptionBand} is given.
 */
export interface ReserveCaptionBandInput {
  /**
   * The height of the caption band `labelScreenshot` draws over the bottom of the frame.
   */
  readonly bandHeightInPixels: number;
}

/**
 * A frame the capture suites can stage.
 */
export type ScreenshotStage = 'convert' | 'query' | 'settings' | 'tag' | 'tree';

/**
 * The part of the plugin's settings component the stages change settings through.
 */
export interface SettingsEditor {
  readonly editAndSave: (edit: (value: Record<string, unknown>) => void) => Promise<void>;
}

/**
 * What a stage closure is given.
 */
export interface StageInput {
  /**
   * The frame to stage.
   */
  readonly stage: ScreenshotStage;
}

/**
 * Reads whether the metadata cache has resolved the links of every note.
 *
 * Until it has, the tag index is still filling, so a frame taken earlier shows lower counts than one taken on the
 * next run.
 *
 * @param params - The closure arguments.
 * @returns Whether every note's links are resolved.
 */
export function areAllLinksResolved({ app }: CommonArguments): boolean {
  return app.vault.getMarkdownFiles().every((file) => Object.hasOwn(app.metadataCache.resolvedLinks, file.path));
}

/**
 * Reads whether the staged frame is ready, and what it shows.
 *
 * @param params - The closure arguments.
 * @returns What the frame shows, or an empty string while it is not ready.
 */
export function pollStage({ app, stage }: CommonArguments & StageInput): string {
  const PLUGIN_ID = 'tag-notes';

  const readers: Record<ScreenshotStage, () => string> = {
    convert: () => activeDocument.querySelector(':scope .tag-notes-migration-preview li') ? 'convert' : '',
    query: () => activeDocument.querySelector(':scope .workspace-leaf.mod-active .block-language-tag-notes a.internal-link') ? 'query' : '',
    settings: () => app.setting.activeTab?.id === PLUGIN_ID && app.setting.activeTab.containerEl.querySelector('.setting-item-name') ? 'settings' : '',
    tag: () => activeDocument.querySelector(':scope .prompt .suggestion-item small') ? 'tag' : '',
    tree: () => activeDocument.querySelector(':scope .tag-notes-results .tag-notes-note') ? 'tree' : ''
  };
  return readers[stage]();
}

/**
 * Lays the app out above the caption band rather than under it.
 *
 * `labelScreenshot` draws its band over the bottom of the frame, on the grounds that the bottom is chrome. Here the
 * tag tree's note list ends near the bottom of the sidebar, so the band is kept clear of everything the app draws.
 *
 * @param params - The closure arguments.
 */
export function reserveCaptionBand({ bandHeightInPixels, obsidianModule }: CommonArguments & ReserveCaptionBandInput): void {
  /*
   * The band is measured in the frame's pixels. A desktop frame is shot at one CSS pixel per pixel, but a phone's is
   * its framebuffer, at the device's pixel ratio.
   */
  const pixelRatio = obsidianModule.Platform.isMobile ? activeWindow.devicePixelRatio : 1;
  const band = `${String(bandHeightInPixels / pixelRatio)}px`;
  activeDocument.querySelector<HTMLElement>(':scope .app-container')?.setCssStyles({ height: `calc(100% - ${band})` });
  // The status bar and a phone's navigation bar are fixed to the viewport rather than laid out in the app, so they are
  // Lifted on their own.
  for (const el of activeDocument.querySelectorAll<HTMLElement>(':scope :is(.status-bar, .mobile-navbar)')) {
    el.setCssStyles({ bottom: band });
  }
}

/**
 * Stages a frame: dismisses whatever the last frame left open, then sets up and performs what the frame is about.
 *
 * @param params - The closure arguments.
 */
export async function startStage({ app, lib, obsidianModule, stage }: CommonArguments & StageInput): Promise<void> {
  const PLUGIN_ID = 'tag-notes';
  const TREE_FOLDER = 'Materials/06 Tag tree';
  const TREE_TAG_FOLDER = `${TREE_FOLDER}/Tags`;
  const CONVERT_FOLDER = 'Materials/03 Convert tags';
  const QUERIES_PATH = '05 Queries and Bases.md';
  const WAIT_TIMEOUT_IN_MILLISECONDS = 10_000;
  const { isMobile } = obsidianModule.Platform;

  await dismissLeftovers();

  switch (stage) {
    case 'convert': {
      await configure({ inlineTagConversion: 'link', tagFolderPath: `${CONVERT_FOLDER}/Tags` });
      await showInExplorer([CONVERT_FOLDER]);
      await openNote(`${CONVERT_FOLDER}/Source.md`, 'source');
      runCommand('convert-tags');
      const input = await waitForElement<HTMLInputElement>('.modal input[aria-label="Migration folder"]');
      input.value = CONVERT_FOLDER;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const preview = [...activeDocument.querySelectorAll<HTMLButtonElement>(':scope .modal button')].find((button) => button.textContent === 'Preview');
      if (!preview) {
        throw new Error('No Preview button.');
      }
      preview.click();
      fitModalAboveBand();
      break;
    }
    case 'query': {
      await showInExplorer(['Materials/05 Queries and Bases']);
      await openNote(QUERIES_PATH, 'preview');
      break;
    }
    case 'settings': {
      await configure({ tagFolderPath: TREE_TAG_FOLDER });
      // On mobile the settings modal is not in the document until something attaches it.
      const { containerEl } = app.setting;
      if (!activeDocument.body.contains(containerEl)) {
        activeDocument.body.append(containerEl);
      }
      app.setting.open();
      app.setting.openTabById(PLUGIN_ID);
      // The tab keeps the scroll it had when it was last open, which differs between runs.
      app.setting.activeTab?.containerEl.scrollTo({ top: 0 });
      break;
    }
    case 'tag': {
      await configure({ tagFolderPath: TREE_TAG_FOLDER });
      await showInExplorer([TREE_FOLDER, TREE_TAG_FOLDER]);
      await openNote(`${TREE_FOLDER}/Book list.md`, 'source');
      runCommand('tag-this-note');
      const input = await waitForElement<HTMLInputElement>('.prompt .prompt-input');
      input.value = 'Ho';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      fitModalAboveBand();
      break;
    }
    case 'tree': {
      /*
       * The other walkthroughs ship tag notes of their own, two of them named Parent and Child, which would sit beside
       * this hierarchy in the tree. The capture runs on a temporary copy of the vault, so they are moved aside.
       */
      for (const path of ['Materials/01 Tag index', 'Materials/05 Queries and Bases']) {
        const folder = app.vault.getFolderByPath(path);
        if (folder) {
          await app.fileManager.trashFile(folder);
        }
      }
      await configure({ tagFolderPath: TREE_TAG_FOLDER });
      await openNote(`${TREE_FOLDER}/Team offsite.md`, 'source');
      runCommand('open-tag-tree');
      const list = await waitForElement<HTMLButtonElement>('.tag-notes-tree-row button.tag-notes-list');
      // The first root by name is Projects, whose subtree holds four of the five tagged notes.
      list.click();
      if (isMobile) {
        app.workspace.leftSplit.expand();
      }
      break;
    }
    default: {
      break;
    }
  }

  async function configure(settings: Record<string, unknown>): Promise<void> {
    const plugin = app.plugins.getPlugin(PLUGIN_ID);
    if (!plugin || !('pluginSettingsComponent' in plugin)) {
      throw new Error('Tag Notes is not loaded.');
    }
    const component = plugin.pluginSettingsComponent as SettingsEditor;
    await component.editAndSave((value) => {
      Object.assign(value, { parentPropertyName: 'broader', tagsPropertyName: 'keywords' }, settings);
    });
  }

  async function dismissLeftovers(): Promise<void> {
    if (activeDocument.body.contains(app.setting.containerEl)) {
      app.setting.close();
    }
    if (activeDocument.querySelector(':scope .modal-container')) {
      activeDocument.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }));
    }
    await lib.waitUntil({
      message: 'the last frame\'s modal to close',
      predicate: () => activeDocument.querySelector(':scope .modal-container') === null,
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
    });
    for (const el of activeDocument.querySelectorAll(':scope .menu, :scope .notice, :scope .tooltip')) {
      el.detach();
    }
  }

  /**
   * Lays an open modal out above the caption band too. A modal is fixed to the viewport rather than laid out in the
   * app, so shrinking the app container leaves it under the band, where a phone puts the Convert button.
   */
  function fitModalAboveBand(): void {
    const appHeight = activeDocument.querySelector(':scope .app-container')?.getBoundingClientRect().height ?? activeWindow.innerHeight;
    const band = `${String(activeWindow.innerHeight - appHeight)}px`;
    activeDocument.querySelector<HTMLElement>(':scope .modal-container')?.setCssStyles({ bottom: band, height: 'auto' });
  }

  function isFolderItem(item: FileTreeItem | FolderTreeItem): item is FolderTreeItem {
    return 'vChildren' in item;
  }

  async function openNote(path: string, mode: 'preview' | 'source'): Promise<void> {
    await app.workspace.getLeaf(false).setViewState({ active: true, state: { file: path, mode, source: false }, type: 'markdown' });
  }

  function runCommand(id: string): void {
    if (!app.commands.executeCommandById(`${PLUGIN_ID}:${id}`)) {
      throw new Error(`Command ${id} did not run.`);
    }
  }

  /**
   * Expands `Materials` and the given folders, collapses every other one, and shows the explorer. A phone's explorer
   * is a drawer that would cover the note, so there it stays closed.
   */
  async function showInExplorer(expandedFolderPaths: readonly string[]): Promise<void> {
    if (isMobile) {
      app.workspace.leftSplit.collapse();
      return;
    }
    const leaf = app.workspace.getLeavesOfType('file-explorer')[0];
    if (!leaf) {
      throw new Error('No File explorer leaf.');
    }
    await leaf.loadIfDeferred();
    app.workspace.leftSplit.expand();
    await app.workspace.revealLeaf(leaf);
    const view = leaf.view as FileExplorerView;
    const expandedPaths = new Set(['Materials', ...expandedFolderPaths]);
    for (const item of Object.values(view.fileItems)) {
      if (isFolderItem(item) && item.file.path !== '/') {
        await item.setCollapsed(!expandedPaths.has(item.file.path));
      }
    }
  }

  async function waitForElement<T extends HTMLElement>(selector: string): Promise<T> {
    await lib.waitUntil({
      message: `${selector} to appear`,
      predicate: () => activeDocument.querySelector(`:scope ${selector}`) !== null,
      timeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
    });
    const found = activeDocument.querySelector<T>(`:scope ${selector}`);
    if (!found) {
      throw new Error(`No ${selector}.`);
    }
    return found;
  }
}
