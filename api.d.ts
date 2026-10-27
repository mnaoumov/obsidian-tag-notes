import type { TFile } from 'obsidian';

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
  Descendants are excluded unless explicitly requested.
  */
  readonly getTaggedNotes: (tag: TFile, options?: TaggedNotesOptions) => TFile[];
  readonly getTagNotes: () => TFile[];
  readonly getTags: (file: TFile) => TFile[];
  readonly isTagNote: (file: TFile) => boolean;
}
