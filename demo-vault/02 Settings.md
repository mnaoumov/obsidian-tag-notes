# Settings

Open **Settings → Community plugins → `Tag Notes`** to choose where the plugin reads tags and parents. Changes apply live.

## Property names

1. `tagsPropertyName` defaults to `keywords`. This must be a list containing links to tag notes.
2. `parentPropertyName` defaults to `broader`. A tag note lists its parents here.

The two properties must differ and cannot use the core `tags` name, which Obsidian treats as tag strings rather than links. Blank or invalid values show a validation message and use the default.

## Tag folder

`tagFolderPath` defaults to `Tags`. Notes in this folder and its subfolders appear as tag notes even before anything tags them. Linked tag notes outside the folder are included too. An empty folder path includes the vault root. Use a vault-relative path with forward slashes, without `.` or `..` segments.

## Inline tag conversion

`inlineTagConversion` controls how **Convert tags** handles body tags: `keep` leaves them in place, `link` replaces each with a link (the default), and `remove` deletes them. Every mode adds links to the note's tags property. The setting applies only to the migration, which requires a preview and confirmation.

## Typing assistance

1. `suggestTrigger`
   1. defaults to `@`. Type it at a word boundary, followed by a tag name or alias. Core claims `#` before plugin suggestions, so choose another non-empty trigger without whitespace.
2. `insertBodyLink`
   1. defaults to `false`. When enabled, choosing a tag inserts a body mention instead of adding a property link. It applies to both the command and inline suggestions. Body mentions do not tag the note.

See [Tag this note](<./04 Tag this note.md>) to try both actions.

## Try a different property

```code-button
---
caption: Use topics as the tags property
---
await require('/demoSetup.ts').setTagsPropertyName(app, 'topics');
```

Manual equivalent: enter `topics` under **Tags property**. Existing `keywords` lists no longer tag notes until you restore that setting; no note is rewritten.

```code-button
---
caption: Restore keywords
---
await require('/demoSetup.ts').setTagsPropertyName(app, 'keywords');
```

Manual equivalent: enter `keywords` under **Tags property**.
