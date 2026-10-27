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
