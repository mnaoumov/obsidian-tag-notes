# Queries and Bases

List tagged notes inside any note with a `tag-notes` code block. Export a tag subtree to a core Bases advanced filter when you want a table or another Bases view.

## Try a live query

Click this captioned rectangle to configure the supplied example. Its result appears below it; the `</>` toggle shows the code.

```code-button
---
caption: Prepare tag queries
---
return await require('/demoSetup.ts').prepareQueries(app);
```

Manual equivalent: set **Tags property** to `keywords`, **Parent property** to `broader`, and **Tag folder** to `Materials/05 Queries and Bases/Tags`.

The following block lists notes tagged with Parent or any descendant. It should show [Direct](<./Materials/05 Queries and Bases/Direct.md>) and [Nested](<./Materials/05 Queries and Bases/Nested.md>) once each, even though Direct has both tags.

```tag-notes
tag: Materials/05 Queries and Bases/Tags/Parent
includeDescendants: true
```

Omit `includeDescendants` or set it to `false` to list only notes directly tagged with Parent:

```tag-notes
tag: Materials/05 Queries and Bases/Tags/Parent
```

Use a note path as `tag`, without link brackets. Paths resolve relative to the note containing the block, using Obsidian's link resolver. Full vault paths distinguish identical names. A missing tag, malformed YAML, unknown option, or non-boolean `includeDescendants` produces a message in the block. Results refresh when metadata, hierarchy, files or settings change; body mentions never count as tags. Click a result to open the note.

Open [Child](<./Materials/05 Queries and Bases/Tags/Child.md>) and remove its `broader` link to [Parent](<./Materials/05 Queries and Bases/Tags/Parent.md>). The subtree list drops Nested. Restore the link to see it return.

## Copy a Bases filter

1. Run **`Tag Notes`: Copy Bases filter for tag subtree**.
2. Search for `Materials/05 Queries and Bases/Tags/Parent`. Search also matches aliases; every choice shows its full path.
3. Select Parent. The plugin copies a single expression to the clipboard and confirms it with a notice.
4. In a base, add an advanced filter and paste the expression. The shipped [Tag subtree base](<./Materials/05 Queries and Bases/Tag subtree.base>) shows the same filter as a complete example.

The filter reads only the configured tags property. It expands Parent and its current descendants to explicit links, so the base works without this plugin. Bases treats Markdown links in properties as strings; the export also captures their current spellings, scoped to each source folder so relative destinations stay distinct. It is a snapshot: copy it again after changing the hierarchy, renaming a tag, changing the tags property, or using a new Markdown-link spelling or source folder. Changes to which notes carry the captured links remain live in Bases. Cancelling the picker leaves the clipboard alone; a clipboard failure shows a notice.
