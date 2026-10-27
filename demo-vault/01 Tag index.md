# Tag index

`Tag Notes` reads links in one frontmatter list property, `keywords` by default. Body links are mentions and do not affect counts. A linked tag note can live anywhere; unused notes in the configured tag folder also count as tag notes.

## Hierarchy and counts

A tag note's `broader` list links to its parents. Several parents are allowed. A cycle produces a notice naming its notes and is broken in the derived hierarchy without editing files.

A direct count includes only notes linked to that tag. A subtree count includes all descendants and counts each note once, even when it links to both a parent and its child.

```code-button
---
caption: Read the example's counts
---
return await require('/demoSetup.ts').showIndex(app);
```

The shipped [Parent](<./Materials/01 Tag index/Tags/Parent.md>), [Child](<./Materials/01 Tag index/Tags/Child.md>) and [Example](<./Materials/01 Tag index/Example.md>) notes provide the material. Manual equivalent: inspect their properties and run the API example below. The parent's direct and subtree counts are both 1. The button restores the demo's `keywords`, `broader` and example tag-folder settings.

## Scripting API

The [root API declaration](../api.d.ts) describes the read-only interface. In a DataviewJS or other script, obtain it with `app.plugins.plugins['tag-notes'].api`. Other plugins can use `obsidian-lib`'s API registry with plugin id `tag-notes` and version range `^1`; registry handles are revoked when the plugin unloads.

```js
const api = app.plugins.plugins['tag-notes'].api;
const tag = app.vault.getFileByPath('Materials/01 Tag index/Tags/Parent.md');
api.getCounts(tag); // { direct: 1, withDescendants: 1 }
api.getTaggedNotes(tag); // Direct notes only.
api.getTaggedNotes(tag, { includeDescendants: true });
api.getParents(tag);
api.getChildren(tag);
api.getAncestors(tag);
api.getDescendants(tag);
```

`getTagNotes()` returns all tag notes, `getTags(file)` returns a note's tags, and `isTagNote(file)` tests membership. Relationship arrays are copies. Queries for an unknown file return empty arrays or zero counts. The initial index becomes available after metadata and settings load; file changes update it automatically.
