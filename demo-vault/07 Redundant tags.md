# Redundant tags

The **Check redundant tags** command lists every note that links a tag together with one of its descendants. The ancestor link adds nothing, because the narrower tag already places the note under it. The check is read-only: it never edits a note.

## Run the check

```code-button
---
caption: Check redundant tags
---
return await require('/demoSetup.ts').showRedundantTags(app);
```

Manual equivalent: set **Tag folder** to `Materials/07 Redundant tags/Tags`, then run **`Tag Notes`: Check redundant tags** from the command palette.

The example has two tag notes, [Garden](<./Materials/07 Redundant tags/Tags/Garden.md>) and [Tomatoes](<./Materials/07 Redundant tags/Tags/Tomatoes.md>), whose `broader` links Garden.

1. [Seed order](<./Materials/07 Redundant tags/Seed order.md>) links both Garden and Tomatoes, so the check lists it with `Garden is implied by Tomatoes`.
2. [Watering](<./Materials/07 Redundant tags/Watering.md>) links Tomatoes only, so the check does not list it.

Click a note's path in the list to open it, then remove the redundant link by hand if you agree. Tag notes from the other demo notes are checked too, so their notes appear when they link a tag next to its descendant.

## Scripts

`getRedundantTags()` on the plugin API returns the same rows: the note, the redundant ancestor tag, and the narrower tags that imply it.
