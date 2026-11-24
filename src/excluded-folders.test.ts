import {
  describe,
  expect,
  it
} from 'vitest';

import {
  isInExcludedFolder,
  parseExcludedFolders
} from './excluded-folders.ts';

describe('isInExcludedFolder', () => {
  it('matches the folder itself and paths under it, not a sibling sharing its prefix', () => {
    expect(isInExcludedFolder('Templates/a.md', ['Templates'])).toBe(true);
    expect(isInExcludedFolder('Templates/sub/a.md', ['/Templates/'])).toBe(true);
    expect(isInExcludedFolder('Templates', ['Templates'])).toBe(true);
    expect(isInExcludedFolder('Templates2/a.md', ['Templates'])).toBe(false);
    expect(isInExcludedFolder('a.md', ['', ' / '])).toBe(false);
    expect(isInExcludedFolder('a.md', [])).toBe(false);
  });
});

describe('parseExcludedFolders', () => {
  it('reads one trimmed folder per line, dropping blanks, slashes and repeats', () => {
    expect(parseExcludedFolders(' Templates/ \n\n/Archive/Old\nTemplates\n /\n')).toEqual(['Templates', 'Archive/Old']);
    expect(parseExcludedFolders('')).toEqual([]);
  });
});
