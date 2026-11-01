/**
 * @file
 *
 * Produces the desktop screenshots the community-directory listing needs, driving a real Obsidian on a copy of the
 * demo vault and writing `images/screenshots/screenshot-desktop-N.png`.
 *
 * Five frames, one per headline feature a reader can see, all on the demo vault's own `Materials/`: the tag tree
 * with the notes under `Projects` listed, the **Tag this note** picker, the **Convert tags** preview, a live
 * `tag-notes` block, and the settings tab. Five is the directory's cap per form factor. The frames are staged by the
 * closures in `src/test-helpers/screenshot-stages.test.helper.ts`, which the Android suite shares.
 *
 * The tree frame is staged last because it deletes the other walkthroughs' tag notes from the temporary vault, and
 * the query frame reads one of them.
 *
 * Excluded from `npm run test:integration` by its file name: see the `capture-screenshots:desktop` project in
 * `scripts/vitest-config.ts`. Capturing is an explicit operation (`npm run capture:screenshots`).
 */

import {
  mkdirSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { setTimeout as sleepInNode } from 'node:timers/promises';
import {
  applyObsidianTheme,
  captureObsidianScreenshot,
  computeLabelBand,
  evalInObsidian,
  labelScreenshot,
  pollInObsidian,
  readPngDimensions
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

import type { ScreenshotStage } from './test-helpers/screenshot-stages.test.helper.ts';

import {
  areAllLinksResolved,
  pollStage,
  reserveCaptionBand,
  startStage
} from './test-helpers/screenshot-stages.test.helper.ts';

const WIDTH_IN_PIXELS = 1200;
const HEIGHT_IN_PIXELS = 800;

const TEST_TIMEOUT_IN_MILLISECONDS = 120_000;
const RENDER_TIMEOUT_IN_MILLISECONDS = 60_000;
const POLL_INTERVAL_IN_MILLISECONDS = 250;

/**
 * Time for the explorer and the note to finish laying out after their content is ready.
 */
const SETTLE_DELAY_IN_MILLISECONDS = 1000;

const IMAGES_DIRECTORY = join(process.cwd(), 'images', 'screenshots');

/**
 * The part of Electron's `BrowserWindow` the capture sizes the window with.
 */
interface ElectronBrowserWindow {
  readonly setContentSize: (width: number, height: number) => void;
}

/**
 * Electron's remote module, which reaches the main-process window from the renderer.
 */
interface ElectronRemote {
  readonly getCurrentWindow: () => ElectronBrowserWindow;
}

/**
 * The desktop renderer's window, which can load Electron's remote module.
 */
interface ElectronWindow extends Window {
  readonly require: (id: '@electron/remote') => ElectronRemote;
}

/*
 * `applyObsidianTheme` rather than a bare `app.changeTheme('obsidian')`: that only schedules the config save, and a
 * config reload landing first drops the theme, so every frame would come out light.
 */
beforeAll(async () => {
  await applyObsidianTheme({ theme: 'dark', vaultPath: vaultPath() });
  await evalInObsidian({
    async callback({ app, heightInPixels, lib, widthInPixels }): Promise<void> {
      const { waitUntil } = lib;

      /*
       * The capture pins its viewport only for the length of the frame, so a window of any other size lays the
       * explorer out twice: once when it is staged and again when it is shot.
       */
      const RESIZE_SETTLE_DELAY_IN_MILLISECONDS = 500;
      const browserWindow = (activeWindow as ElectronWindow).require('@electron/remote').getCurrentWindow();

      // The window's viewport and its content size differ by a border, which the second call takes off.
      browserWindow.setContentSize(widthInPixels, heightInPixels);
      await sleep(RESIZE_SETTLE_DELAY_IN_MILLISECONDS);
      browserWindow.setContentSize(
        2 * widthInPixels - activeWindow.innerWidth,
        2 * heightInPixels - activeWindow.innerHeight
      );
      await waitUntil({
        message: 'the window to take the frame size',
        predicate: () => activeWindow.innerWidth === widthInPixels && activeWindow.innerHeight === heightInPixels
      });

      // Each note opens with its own `# H1`, so the inline title would print every name twice.
      app.vault.setConfig('showInlineTitle', false);
      // No frame is about the right sidebar.
      app.workspace.rightSplit.collapse();
    },
    input: { heightInPixels: HEIGHT_IN_PIXELS, widthInPixels: WIDTH_IN_PIXELS },
    vaultPath: vaultPath()
  });
  await evalInObsidian({
    callback: reserveCaptionBand,
    input: { bandHeightInPixels: computeLabelBand({ imageHeightInPixels: HEIGHT_IN_PIXELS, imageWidthInPixels: WIDTH_IN_PIXELS }).heightInPixels },
    vaultPath: vaultPath()
  });
  await pollInObsidian({
    intervalInMilliseconds: POLL_INTERVAL_IN_MILLISECONDS,
    poll: areAllLinksResolved,
    timeoutInMilliseconds: RENDER_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: 'the metadata cache never resolved every note',
    until: (isResolved: boolean): boolean => isResolved,
    vaultPath: vaultPath()
  });
});

describe('desktop store screenshots', () => {
  it('4 - a live tag-notes block', { timeout: TEST_TIMEOUT_IN_MILLISECONDS }, async () => {
    expect(await stage('query')).toBe('query');
    await shoot(4, 'List the notes under a tag inside any note');
  });

  it('5 - the settings tab', { timeout: TEST_TIMEOUT_IN_MILLISECONDS }, async () => {
    expect(await stage('settings')).toBe('settings');
    await shoot(5, 'Choose the tags and parent properties and the tag folder');
  });

  it('3 - the Convert tags preview', { timeout: TEST_TIMEOUT_IN_MILLISECONDS }, async () => {
    expect(await stage('convert')).toBe('convert');
    await shoot(3, 'Convert existing tags into tag notes after a preview');
  });

  it('2 - the Tag this note picker', { timeout: TEST_TIMEOUT_IN_MILLISECONDS }, async () => {
    expect(await stage('tag')).toBe('tag');
    await shoot(2, 'Tag a note by choosing or creating a tag note');
  });

  it('1 - the tag tree', { timeout: TEST_TIMEOUT_IN_MILLISECONDS }, async () => {
    expect(await stage('tree')).toBe('tree');
    await shoot(1, 'Browse tag notes as a tree with direct and subtree counts');
  });
});
/**
 * Captures the window, captions it, and writes it as `images/screenshots/screenshot-desktop-<index>.png`.
 *
 * @param index - The 1-based listing position.
 * @param caption - The caption drawn across the bottom of the frame.
 */
async function shoot(index: number, caption: string): Promise<void> {
  const bytes = await captureObsidianScreenshot({
    heightInPixels: HEIGHT_IN_PIXELS,
    vaultPath: vaultPath(),
    widthInPixels: WIDTH_IN_PIXELS
  });

  // Captioned after capture, so the frame stays an untouched window shot and rewording a label needs no re-shoot.
  const labeled = await labelScreenshot(bytes, { text: caption });

  expect(readPngDimensions(labeled)).toStrictEqual({
    heightInPixels: HEIGHT_IN_PIXELS,
    widthInPixels: WIDTH_IN_PIXELS
  });

  mkdirSync(IMAGES_DIRECTORY, { recursive: true });
  writeFileSync(join(IMAGES_DIRECTORY, `screenshot-desktop-${String(index)}.png`), labeled);
}

/**
 * Stages a frame and waits in Node until it shows what it is about.
 *
 * @param screenshotStage - The frame to stage.
 * @returns What the frame shows.
 */
async function stage(screenshotStage: ScreenshotStage): Promise<string> {
  const shown = await pollInObsidian({
    input: { stage: screenshotStage },
    intervalInMilliseconds: POLL_INTERVAL_IN_MILLISECONDS,
    poll: pollStage,
    start: startStage,
    timeoutInMilliseconds: RENDER_TIMEOUT_IN_MILLISECONDS,
    timeoutMessage: `the ${screenshotStage} frame never became ready`,
    until: (result: string): boolean => result === screenshotStage,
    vaultPath: vaultPath()
  });
  await sleepInNode(SETTLE_DELAY_IN_MILLISECONDS);
  return shown;
}

function vaultPath(): string {
  return getTemporaryVault().path;
}
