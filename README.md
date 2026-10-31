# Tag Notes

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/mnaoumov) [![GitHub release](https://img.shields.io/github/v/release/mnaoumov/obsidian-tag-notes)](https://github.com/mnaoumov/obsidian-tag-notes/releases) [![GitHub downloads](https://img.shields.io/github/downloads/mnaoumov/obsidian-tag-notes/total)](https://github.com/mnaoumov/obsidian-tag-notes/releases)

Make every tag a note: tag a note with links in a list property, organize tag notes through parent links, browse their tree and counts, and convert existing tags with a preview. Choose or create tag notes with **Tag this note** or by typing `@`.

See [the tag index and API](<./demo-vault/01 Tag index.md>), [settings](<./demo-vault/02 Settings.md>), [converting existing tags](<./demo-vault/03 Convert tags.md>) and [tagging while writing](<./demo-vault/04 Tag this note.md>).

Embed live lists with a `tag-notes` block or copy a tag subtree as a core Bases filter: [queries and Bases](<./demo-vault/05 Queries and Bases.md>).

In a vault kept in git, each conversion can become one commit that the **Undo a bulk operation...** command reverts: [undo with git](<./demo-vault/02 Settings.md#undo-with-git>).

## Demo vault

**The documentation is a demo vault.** Every feature has a note that explains what it does and why you would want it, with a button you can press to watch it happen.

**[Start reading here](<./demo-vault/00 Start.md>)** — it is plain markdown, so it works on GitHub with nothing installed.

A copy of the vault ships with every release. You can access it via any of the following:

1. Running the **`Tag Notes`: Open demo vault** command.
2. Downloading `tag-notes-demo-vault.zip` from the [Releases](https://github.com/mnaoumov/obsidian-tag-notes/releases). It unzips into a single `tag-notes-demo-vault-<version>` folder.
3. Browsing its source in [`demo-vault/`](./demo-vault/README.md) in this repository.

## Installation

The plugin is not available in [the official Community Plugins repository](https://community.obsidian.md) yet.

### Beta versions

To install the latest beta release of this plugin (regardless if it is available in [the official Community Plugins repository](https://community.obsidian.md) or not), follow these steps:

1. Ensure you have the [BRAT plugin](https://community.obsidian.md/plugins/obsidian42-brat) installed and enabled.
2. Click [Install via BRAT](https://intradeus.github.io/http-protocol-redirector?r=obsidian://brat?plugin=https://github.com/mnaoumov/obsidian-tag-notes).
3. An Obsidian pop-up window should appear. In the window, click the `Add plugin` button once and wait a few seconds for the plugin to install.

## Debugging

By default, debug messages for this plugin (id: `tag-notes`) are hidden.

If you need to enable them refer to the [documentation](https://mnaoumov.dev/obsidian-lib/guides/debugging/).

## Contributing

Contributions are welcome — see [CONTRIBUTING](./CONTRIBUTING.md) to get set up.

## Support

<!-- markdownlint-disable MD033 -->

<a href="https://www.buymeacoffee.com/mnaoumov" target="_blank">Support this plugin</a>

<!-- markdownlint-enable MD033 -->

### Filing an issue (for AI agents and humans)

Open issues through the [issue forms](https://github.com/mnaoumov/obsidian-tag-notes/issues/new/choose), not as blank issues.

To report a bug from inside Obsidian, run the **`Tag Notes`: Report a bug** command. It opens the bug form with the plugin version, the Obsidian version and your operating system already filled in.

Filing from the CLI or the API (`gh issue create --body`, or an AI agent filing for you) skips the form, and `gh issue create --template` cannot load an issue form. In that case, open the matching form in [`.github/ISSUE_TEMPLATE/`](https://github.com/mnaoumov/obsidian-tag-notes/tree/HEAD/.github/ISSUE_TEMPLATE), copy every field as a `### <label>` heading in the form's order, and fill in each one. Always state the plugin version, the Obsidian version and your operating system.

## License

© [mnaoumov](https://github.com/mnaoumov/)
