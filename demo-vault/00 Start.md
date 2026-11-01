# Start here

This vault demonstrates `Tag Notes`: a note is tagged by links in its `keywords` list property, and tag notes name their parents through `broader`.

## Try the index

This button configures the shipped example and shows its direct and subtree counts.

```code-button
---
caption: Show a parent and child tag
---
return await require('/demoSetup.ts').showIndex(app);
```

Manual equivalent: create two tag notes, link the parent from the child's `broader` list, and link both from another note's `keywords` list. Read the counts through the API described below.

## Features

1. [01 Tag index](<./01 Tag index.md>): relationships, distinct counts and the scripting API.
2. [02 Settings](<./02 Settings.md>): property names and the tag folder.
3. [03 Convert tags](<./03 Convert tags.md>): preview and convert existing inline and property tags.
4. [04 Tag this note](<./04 Tag this note.md>): choose by name or alias, create tags, and insert body mentions.
5. [05 Queries and Bases](<./05 Queries and Bases.md>): live lists inside notes and a copied filter for core Bases.
6. [06 Tag tree](<./06 Tag tree.md>): browse tag notes as a tree with counts, filter, sort and edit the hierarchy.
