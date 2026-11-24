import type { TFile } from 'obsidian';

/**
A note that links a tag together with one of that tag's descendants, so the ancestor link adds nothing.
*/
export interface RedundantTag {
  /**
  The note's tags below `tag`, sorted by path; any one of them already implies `tag`.
  */
  readonly narrower: readonly TFile[];
  readonly note: TFile;
  /**
  The redundant ancestor link.
  */
  readonly tag: TFile;
}

export interface TagCounts {
  readonly direct: number;
  readonly withDescendants: number;
}

export interface TaggedNotesOptions {
  /**
  @default `false`
  */
  readonly includeDescendants?: boolean;
}

/**
Read-only API available as `app.plugins.plugins['tag-notes'].api`.
*/
export interface TagNotesApi {
  readonly getAncestors: (tag: TFile) => TFile[];
  readonly getChildren: (tag: TFile) => TFile[];
  readonly getCounts: (tag: TFile) => TagCounts;
  readonly getDescendants: (tag: TFile) => TFile[];
  readonly getParents: (tag: TFile) => TFile[];
  /**
  Every note whose tags property links a tag and one of its descendants, sorted by note path, then tag path.
  Read-only: no note is changed.

  @since API version 1.1.0
  */
  readonly getRedundantTags: () => RedundantTag[];
  /**
  Descendants are excluded unless explicitly requested.
  */
  readonly getTaggedNotes: (tag: TFile, options?: TaggedNotesOptions) => TFile[];
  readonly getTagNotes: () => TFile[];
  readonly getTags: (file: TFile) => TFile[];
  readonly isTagNote: (file: TFile) => boolean;
}
