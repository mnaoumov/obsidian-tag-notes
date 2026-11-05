# CHANGELOG

## 1.0.0

First release of `Tag Notes`: make every tag a note. A note is tagged by linking a tag note from a list property, and the plugin brings back what `#tags` give: a hierarchy, a tree with counts, "tagged X or anything under X", fast tagging, and a one-shot migration from existing `#tags`.

- **Tag notes and their hierarchy**: a note's tags are the links in its `keywords` list, and a tag note lists its parents in `broader`. A tag may have several parents. A cycle is reported once and broken without editing any note. Every tag has a direct count and a count with descendants, each note counted once.
- **Tag tree**: a sidebar view like the core Tags pane, with both counts, a filter, sorting by name or count, the notes of a subtree, and rename, new child tag and reveal in the File explorer on a right-click.
- **Tag this note** and the `@` suggester: choose a tag note by name, path or alias, or create one, and the link lands in the tags property. The trigger is configurable.
- **Convert tags**: turn the `#tags` of the whole vault or one folder into tag notes, `#a/b` into `b` with `broader: [[a]]`, after a preview of every note it will change. Inline tags can be kept, replaced by links or removed. In a vault kept in `git`, each run can be one commit that **Undo a bulk operation...** reverts.
- **Queries and Bases**: a `tag-notes` code block lists the notes tagged with a tag, with or without its descendants, and **Copy Bases filter for tag subtree** exports a subtree as a core Bases filter.
- An API for other plugins (`api.d.ts`, version 1.0.0) answers tag membership, relationships and counts.
- A demo vault ships with the release, with an **Open demo vault** command and a **Report a bug** command.
