/**
 * @file
 *
 * The excluded folders setting: notes in those folders, a templates folder for example, are never tagged notes and
 * the tag migration leaves them alone.
 *
 * Adapted from the Excluded folders setting of `Unified Tag Links` (https://github.com/theboyroy05/Obsidian-Unified-Tag-Links),
 * `src/settings.ts` (`isInFolders`) and `src/ui/settings-tab.ts`. Copyright (c) 2026 Issac Roy. MIT License: Permission
 * is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation
 * files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use,
 * copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to
 * whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this
 * permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED
 * "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
 * ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/**
 * Whether a vault path is one of the folders or inside one of them.
 *
 * @param path - The vault-relative path of a note.
 * @param folders - Vault-relative folder paths; leading and trailing slashes are ignored, and an empty entry matches nothing.
 * @returns Whether the path is excluded.
 */
export function isInExcludedFolder(path: string, folders: readonly string[]): boolean {
  return folders.some((folder) => {
    const prefix = normalizeFolder(folder);
    return prefix !== '' && (path === prefix || path.startsWith(`${prefix}/`));
  });
}

/**
 * Parses the one-folder-per-line text of the setting.
 *
 * @param text - The text, one folder per line.
 * @returns The non-empty folders, trimmed and without leading or trailing slashes, each once.
 */
export function parseExcludedFolders(text: string): string[] {
  return [...new Set(text.split('\n').map((line) => normalizeFolder(line)).filter((folder) => folder !== ''))];
}

function normalizeFolder(folder: string): string {
  return folder.trim().replaceAll(/^\/+|\/+$/gu, '');
}
