# Convert tags

Turn existing inline tags and the core `tags` property into links to tag notes. **`Tag Notes`: Convert tags** previews everything before changing a note.

## Try a migration

The example [Source](<./Materials/03 Convert tags/Source.md>) contains two tags with the same leaf name under different parents. This button restores that source and chooses the demo's migration settings. Clicking the rectangle runs the setup and shows the result below it; the `</>` toggle shows its source.

```code-button
---
caption: Prepare the migration example
---
return await require('/demoSetup.ts').prepareMigration(app);
```

Manual equivalent: set **Tags property** to `keywords`, **Parent property** to `broader`, **Tag folder** to `Materials/03 Convert tags/Tags` and **Inline tag conversion** to `Link`. Restore the Source note's tags from the example below.

1. Run **`Tag Notes`: Convert tags**.
2. Enter `Materials/03 Convert tags` as the folder. An empty folder means the whole vault.
3. Select **Preview**. Review every note to update and every new or reused tag note. Cancel now to leave the vault unchanged.
4. Select **Convert**. Inspect Source's `keywords` and the new tag notes' `broader` properties.

## What changes

`#alpha/bravo` and `#charlie/bravo` become separate tag notes, `bravo (alpha)` and `bravo (charlie)`, each with alias `bravo` and a link to its parent. The migration also creates missing ancestors, at any depth. A collision's qualifier uses its full parent path, with slashes replaced by ` - `; a root tag sharing a leaf uses `(root)`.

Core `tags` values become links in the configured tags property, retaining its existing values, and the core property is removed. Inline tags add the same property links. By default each inline tag becomes a body link, preserving its place in the sentence. **Inline tag conversion** can instead keep or remove inline tags. Code is left alone; inline tag recognition follows Obsidian's metadata parser.

All links follow the vault's own wikilink or Markdown-link preferences. An existing note with a matching name is reused wherever it lives; the command leaves it there. Move it afterward with the File explorer if desired. When several notes match, a match in the configured tag folder wins; otherwise give the intended note a unique name before converting.

## Review and recovery

Back up a vault before a large conversion. The preview rejects malformed properties, unsupported tag values, unsafe filenames and conflicting targets. Existing properties and note bodies are preserved, apart from the tag changes; normal YAML serialization may change property formatting.

A note edited, renamed or deleted after preview causes conversion to stop. Writes use atomic processing per note, but there is no vault-wide rollback: a disk error or edit during conversion can leave earlier files changed and some tag notes created. Review those changes and open a fresh preview before retrying. New files never overwrite existing paths.
