# AGENTS.md

This file provides guidance to AI coding agents working with code in this repository.

## Overview

`Tag Notes` makes a tag a **note**. A note is tagged by **linking** that tag note from a list property, and the plugin gives tag notes what `#tags` and the core Tags pane give `#tags`: a hierarchy, a tree with counts, "notes tagged X or anything under X", fast typing, and a one-shot migration from existing `#tags`.

Why a note instead of a `#tag`:

- A tag note is visible and editable with no tool: it can carry a description, aliases, links and its own properties.
- A misspelt link shows as unresolved; a misspelt `#tag` silently becomes a new tag.
- Renaming a tag note is a file rename, so Obsidian rewrites every link to it.

What is lost against `#tags` is the convenience: `#parent/child` hierarchy, the Tags pane's tree and counts, and typing `#` to get suggestions. This plugin brings those back on top of tag notes.

What already exists, so the plugin does not rebuild it:

- **`Breadcrumbs`** (`breadcrumbs`) builds hierarchies from typed links in general (`up`/`down`), with implied and transitive relations and a tree view of a note's surroundings. It is not about tags: no tag counts, no migration from `#tags`, no "tagged X or below" query. Both plugins can run side by side; the parent property here can also be declared as an `up` field there.
- **`Tag Wrangler`** (`tag-wrangler`) has tag pages, a note carrying a `#tag` alias, but the `#tag` stays the source of truth.
- **`Tag Ontology`** (`tag-ontology`) keeps parents, children and roll-up counts in a JSON dictionary and draws them in the Graph view; `#tags` stay the source of truth.
- **`Tag Page`** (`tag-page-md`) and **`Index Notes`** (`index-notes`) generate pages or index blocks from `#tags`.
- Tag-tree explorers (`obsidian-tagfolder`, `tag-folder-explorer`, `tag-along`, `notebook-navigator`) browse `#tag` hierarchies.

None of them makes the note the tag. That inversion is this plugin's whole scope.

## Current state

The repo was generated on 2026-10-26 with `create-obsidian-plugin` (preset `all-in-one`, CSS, desktop and mobile, the unofficial API subset, no editor extensions). Its answers are in `.create-obsidian-plugin.json`, so re-running the generator in this folder updates every file not edited by hand.

The metadata index, three validated settings, version 1 API and tag tree are implemented. `src/tag-index.ts` reads only metadata-cache frontmatter links; it never writes notes. `src/plugin.ts` wires layout-ready, metadata changed/deleted/resolved, rename and settings events and refreshes open tree views. The generated sample commands and setting have been removed. The migration, suggester, code block and Bases command remain unimplemented.

The **Open tag tree** command opens or reuses a left-sidebar view. `src/tag-tree-view.ts` renders collapsible branches, direct/subtree counts, name/count sorting, an ancestor-preserving path filter and distinct subtree note lists. A tag appears under each parent. Context actions rename through the file manager, create a child in the configured tag folder using the vault's link format, and reveal in the File explorer. Creation writes the parent property together with the new note; existing paths are never overwritten. Errors are shown through the plugin notice component. Collapse, filter, sort and selection are held for the view's lifetime.

The current index rebuilds the graph from the metadata cache on each event and invalidates all descendant caches. This conservative invalidation handles link-resolution changes outside the edited subtree, including an unresolved target becoming available. Descendants are cached on demand between rebuilds; traversals are iterative. Parent targets reached through `broader` are included even outside the configured folder. Edges are considered in sorted note-path order, with each cyclic closing edge excluded. An unchanged cycle is reported once; repairing it permits a later recurrence to be reported again.

The self-contained root `api.d.ts` is the consumer contract. The plugin publishes it through `obsidian-lib`'s registry under `tag-notes`, API version `1.0.0`; the same API is available at `app.plugins.plugins['tag-notes'].api`. Returned arrays are copies. Unknown files return empty relationships and zero counts; callers use current vault `TFile` objects. The API is empty until the initial metadata/layout and settings load complete.

Verification: `npm run gate` includes the 100% unit-coverage threshold. Unit workers are capped at two. `npm run test:integration:desktop` exercises real link resolution, counts, changes, renames, deletion, reload and cycle handling in an isolated vault. Set `OBSIDIAN_VERSION` to select a particular installed/public/catalyst channel.

## Design

### The data model

**Everything the plugin reads is plain, tool-free data; only the derived views need the plugin.**

- **A note's tags** are links in one frontmatter list property, `keywords` by default (setting `tagsPropertyName`). `keywords` is schema.org's name for exactly this (`CreativeWork.keywords`, whose values may be `DefinedTerm`s). It cannot be the core `tags` property: Obsidian types that one as tag strings and does not index links in it.
- **A tag note** is any note that some note's tags property links to, wherever it lives. The tag folder (`Tags` by default, setting `tagFolderPath`) is only where the plugin **creates** new tag notes, and the tree also shows tag notes in that folder that nothing links to yet.
- **A tag's parents** are links in the tag note's own list property, `broader` by default (setting `parentPropertyName`). `broader` is SKOS's name for a parent concept (`skos:broader`). It deliberately avoids `parent`, which vaults commonly use for people. A tag may have several parents (`#status/cancelled` and `#project/cancelled` can be one concept or two); a cycle is detected, reported once with the notes involved, and broken at the edge that closed it for every derived view, without editing any note.
- **Links in a note's body** to a tag note are mentions, not tags. Only the property tags a note, so a count never depends on prose.

### The index

One in-memory index, rebuilt from the metadata cache at layout ready and kept current from `metadataCache` `changed`/`deleted`/`resolved`, vault `rename` and settings events:

- tag note to the notes tagged with it directly, and the reverse;
- tag note to its parents and children;
- for every tag note, its descendant set, computed on demand and cached until the next index rebuild.

Counts are reported both ways, **direct** and **with descendants** (distinct notes, so a note tagged with a parent and a child counts once). The index never writes a file.

### Commands and views

- **Tag tree** view (left sidebar, like the core Tags pane): the tag notes as a tree by `broader`, each with its two counts; a tag with several parents appears under each. Click opens the tag note; a secondary action lists the notes of its subtree in the view. Context menu: rename (a file rename, so links follow), new child tag (creates a note in the tag folder with `broader` set), reveal in the File explorer. A sort (name or count) and a filter box.
- **Tag this note** command and a `#` suggester: typing the trigger (`#` by default, setting `suggestTrigger`) in the editor lists tag notes by name and alias, plus "create tag note" for a new name. Choosing one removes the typed text and adds the link to the note's tags property; a setting inserts a body link at the cursor instead. Whether the trigger can share `#` with the core tag suggester is checked when it is built; if the core one always wins, the default trigger changes and the decision is recorded here.
- **Convert tags to tag notes** command: the migration. See below.
- **`tag-notes` code block**: lists the notes tagged with a tag, with or without descendants, for readers who do not install anything else.

### The migration

A one-shot command over the whole vault or one folder, with a **preview first** (every note it will change, every tag note it will create) and nothing written until the user confirms.

- **`#a/b`** becomes tag note `b` with `broader: [[a]]`, and tag note `a` if missing. A leaf name used under two different parents (`#x/b`, `#y/b`) becomes `b (x)` and `b (y)`, each with `b` as an alias, because two parents of one leaf usually mean two concepts; the user can merge them afterwards with any note-merging tool.
- **`tags:` values** move to the tags property as links, and are removed from `tags:`.
- **Inline `#tags`** add the link to the tags property and are, by default, replaced in place by a link to the tag note, so the sentence keeps its meaning (setting `inlineTagConversion`: keep, link, or remove).
- An existing note whose name matches a tag is reused as its tag note, and moved into the tag folder only when the user asks.
- Links are written in the user's own link format (`app.fileManager.generateMarkdownLink`), so wikilink and markdown-link vaults both get what they use.

### API

A hand-written, self-contained root `api.d.ts`, published through the plugin registry under the id `tag-notes`: whether a file is a tag note; the tag notes of a note; the notes tagged with a tag, with an `includeDescendants` switch (off by default, the narrow meaning); a tag's parents, children, ancestors and descendants; and the two counts. `Dataview` and script users call it; a Bases view can filter on the tags property directly, and a command copies a Bases filter that expands a tag's subtree into the explicit list of links.
