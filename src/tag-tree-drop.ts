/*
The parent-link rewrite and the cycle refusal below are adapted from `Link Structure`
(https://github.com/fertion/Bases_Link_Structure, `src/structure-view.ts`, `updateRelationForMove` and `wouldCreateCycle`).

MIT License

Copyright (c) 2026 Fertion

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import type {
  App,
  TFile
} from 'obsidian';

import { parseLink } from '@mnaoumov/obsidian-lib/parse-link';
import { parseLinktext } from 'obsidian';

import type { TagNotesApi } from '../api.d.ts';

import { toPropertyValue } from './property-values.ts';

interface MoveTagParams {
  readonly api: TagNotesApi;
  readonly app: App;
  /**
  The parent the dragged row was shown under; `null` for a root row.
  */
  readonly fromParent: null | TFile;
  readonly parentPropertyName: string;
  /**
  Keep `fromParent` and add `target` as another parent.
  */
  readonly shouldAddParent: boolean;
  readonly tag: TFile;
  /**
  The new parent; `null` makes the tag a root by removing the `fromParent` link.
  */
  readonly target: null | TFile;
}

/**
 * Rewrites the dragged tag note's parent property for a drop in the tag tree.
 *
 * @param params - The drop.
 * @returns A message explaining why the drop was refused, or `null` when the property was written or nothing needed to change.
 */
export async function moveTag(params: MoveTagParams): Promise<null | string> {
  const { api, app, fromParent, parentPropertyName, shouldAddParent, tag, target } = params;
  if (target === tag || (target === fromParent && !shouldAddParent)) {
    return null;
  }
  if (target && api.getDescendants(tag).includes(target)) {
    return `Cannot move ${tag.basename} under ${target.basename}: ${target.basename} is inside ${tag.basename}, so the hierarchy would become a cycle.`;
  }
  if (!target && (shouldAddParent || !fromParent)) {
    return null;
  }

  await app.fileManager.processFrontMatter(tag, (frontmatter: Record<string, unknown>) => {
    const values = readLinks(frontmatter[parentPropertyName], parentPropertyName);
    let result = values;
    if (!shouldAddParent && fromParent) {
      const index = result.findIndex((value) => resolveLink(app, value, tag) === fromParent);
      if (index !== -1) {
        result = result.filter((_value, valueIndex) => valueIndex !== index);
      }
    }
    if (target && result.every((value) => resolveLink(app, value, tag) !== target)) {
      result = [...result, app.fileManager.generateMarkdownLink(target, tag.path)];
    }
    if (result.length === values.length && result.every((value, index) => value === values[index])) {
      return;
    }
    if (result.length === 0) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- The property name is a user setting.
      delete frontmatter[parentPropertyName];
    } else {
      frontmatter[parentPropertyName] = toPropertyValue(result);
    }
  });
  return null;
}

function readLinks(value: unknown, propertyName: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (typeof value === 'string') {
    return [value];
  }
  const error = new TypeError(`The ${propertyName} property must be a string or a list of strings. Its contents were left unchanged.`);
  if (!Array.isArray(value)) {
    throw error;
  }
  const entries: unknown[] = value;
  return entries.map((entry) => {
    if (typeof entry !== 'string') {
      throw error;
    }
    return entry;
  });
}

function resolveLink(app: App, value: string, source: TFile): null | TFile {
  const parsed = parseLink(value);
  return parsed === null || parsed.isExternal ? null : app.metadataCache.getFirstLinkpathDest(parseLinktext(parsed.url).path, source.path);
}
