# Tag tree

The **Open tag tree** command opens a left-sidebar view, like the core Tags pane, built from tag notes and their `broader` links. Each row shows two counts: notes tagged directly, then distinct notes tagged with the tag or anything under it.

## Open the tree

```code-button
---
caption: Open the tag tree
---
return await require('/demoSetup.ts').showTagTree(app);
```

Manual equivalent: set **Tag folder** to `Materials/06 Tag tree/Tags`, then run **`Tag Notes`: Open tag tree** from the command palette.

The shipped tag notes form this hierarchy:

1. [Projects](<./Materials/06 Tag tree/Tags/Projects.md>) — 0 / 4: nothing links it directly, but four notes sit under it.
   1. [Work](<./Materials/06 Tag tree/Tags/Work.md>) — 2 / 3
      1. `Waiting` — 2 / 2
   2. [Home](<./Materials/06 Tag tree/Tags/Home.md>) — 1 / 3
      1. [Garden](<./Materials/06 Tag tree/Tags/Garden.md>) — 1 / 1
      2. `Waiting` — 2 / 2
2. [Reading](<./Materials/06 Tag tree/Tags/Reading.md>) — 1 / 1

[Waiting](<./Materials/06 Tag tree/Tags/Waiting.md>) has two parents, so it appears under both. [Team offsite](<./Materials/06 Tag tree/Team offsite.md>) is tagged both `Work` and `Waiting` and still counts once in `Work`'s subtree. The tagged notes are [Quarterly report](<./Materials/06 Tag tree/Quarterly report.md>), [Team offsite](<./Materials/06 Tag tree/Team offsite.md>), [Fix the fence](<./Materials/06 Tag tree/Fix the fence.md>), [Tomato beds](<./Materials/06 Tag tree/Tomato beds.md>) and [Book list](<./Materials/06 Tag tree/Book list.md>).

Tag notes from the other demo notes appear in the tree too, because a linked tag note counts wherever it lives.

## Browse, filter and sort

1. Click a tag's name to open its note; click the arrow to collapse or expand its branch.
2. Click **List notes** to list every note tagged with that tag or a descendant, below the tree. Try it on `Projects`.
3. Type in the filter box at the top: `garden` keeps `Garden` and its ancestors `Home` and `Projects`.
4. Switch the sort from **Name** to **Subtree count** to put the busiest tags first.

## Rename, add a child, reveal

Right-click a tag for its menu:

1. **Rename** renames the tag note's file, so Obsidian rewrites every link to it and the tag keeps its notes.
2. **New child tag** asks for a name and creates a note in the tag folder with `broader` linking the parent. It never overwrites an existing file.
3. **Reveal in file explorer** shows where the tag note lives.

The tree keeps its collapsed branches, filter, sort and selection while the view stays open.
