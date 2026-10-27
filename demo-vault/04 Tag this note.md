# Tag this note

Choose tag notes while writing, without editing YAML by hand. **Tag this note** searches names, paths and aliases; typing `@` opens the same choices inline. Each result shows its path, so equally named notes remain distinguishable.

## Try property tagging

Click the captioned rectangle below to prepare the supplied example. The result appears below the button; its `</>` toggle shows the code.

```code-button
---
caption: Prepare property tagging
---
return await require('/demoSetup.ts').prepareTagging(app);
```

Manual equivalent: set **Tags property** to `keywords`, **Tag folder** to `Materials/04 Tag this note/Tags`, **Suggest trigger** to `@` and **Insert body link** off. Clear the supplied Source note's tags before repeating the example.

1. Open [Source](<./Materials/04 Tag this note/Source.md>) in editing mode.
2. Type `@First` after a space. Choose **Alpha**, whose alias is **First**, and press Enter.
3. The typed text disappears and `keywords` receives a link to [Alpha](<./Materials/04 Tag this note/Tags/Alpha.md>). Choosing Alpha again leaves one property link.
4. Run **`Tag Notes`: Tag this note**. Search for `New concept` and choose **Create tag note**. The command supports spaces in names; inline completion ends at whitespace.

The default trigger is `@` because Obsidian's core tag suggester takes precedence over plugins on `#`. Change **Suggest trigger** to another non-empty value without whitespace if another plugin uses `@`.

## Try a body mention

```code-button
---
caption: Prepare body mentions
---
return await require('/demoSetup.ts').prepareTagging(app, true);
```

Manual equivalent: turn **Insert body link** on and clear Source's tags. Open Source and type `@First`, then choose Alpha. This time the body receives a link at the cursor and the note gets no tags property. A body mention does not affect tag counts. Use **Prepare property tagging** above to restore the default action.

## Preservation and errors

Links follow the vault's wikilink or Markdown-link preference. Existing list values and unrelated properties are retained. Invalid tags properties produce a notice without replacing them. Creation refuses unsafe names and existing paths. If a write fails after a new tag note was created, that file remains available; review it before retrying.
