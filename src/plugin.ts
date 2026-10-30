import type { PluginApiDeclaration } from '@mnaoumov/obsidian-lib/plugin/plugin-api';

import { OpenBugReportCommandHandler } from '@mnaoumov/obsidian-lib/command-handlers/open-bug-report-command-handler';
import { OpenDemoVaultCommandHandler } from '@mnaoumov/obsidian-lib/command-handlers/open-demo-vault-command-handler';
import { PluginSettingsTabComponent } from '@mnaoumov/obsidian-lib/components/plugin-settings-tab-component';
import { PluginDataHandler } from '@mnaoumov/obsidian-lib/data-handler';
import { PluginBase } from '@mnaoumov/obsidian-lib/plugin/plugin';
import { PluginEventSourceImpl } from '@mnaoumov/obsidian-lib/plugin/plugin-event-source';
import { invokeAsyncSafely } from '@mnaoumov/typescript-lib/async';

import type { TagNotesApi } from '../api.d.ts';

import { MigrationModal } from './migrations/migration-modal.ts';
import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { PluginSettingsTab } from './plugin-settings-tab.ts';
import { PluginSettings } from './plugin-settings.ts';
import { BasesFilterModal } from './queries/bases-filter-modal.ts';
import { TagNotesBlock } from './queries/tag-notes-block.ts';
import { TagIndex } from './tag-index.ts';
import {
  TAG_TREE_VIEW_TYPE,
  TagTreeView
} from './tag-tree-view.ts';
import { TagPicker } from './tagging/tag-picker.ts';
import { TagSuggest } from './tagging/tag-suggest.ts';

export class Plugin extends PluginBase {
  private readonly tagIndex = new TagIndex({
    app: this.app,
    reportCycle: (paths): void => {
      this.pluginNoticeComponent.showNotice(`Tag hierarchy cycle ignored: ${paths.join(' → ')}`);
    },
    settings: (): PluginSettings => this.indexSettings
  });

  /**
  Read-only queries for `Dataview` and scripts; also published through the plugin API registry.
  */
  public readonly api: TagNotesApi = this.tagIndex;

  private indexSettings = new PluginSettings();
  private readonly queryBlocks = new Set<TagNotesBlock>();

  protected override getPluginApis(): PluginApiDeclaration[] {
    return [{ api: this.api, apiVersion: '1.0.0' }];
  }

  protected override async onloadImpl(): Promise<void> {
    this.registerMarkdownCodeBlockProcessor('tag-notes', (source, element, context) => {
      const block = new TagNotesBlock({ api: this.api, app: this.app, containerEl: element, source, sourcePath: context.sourcePath });
      this.queryBlocks.add(block);
      block.register(() => {
        this.queryBlocks.delete(block);
      });
      context.addChild(block);
    });
    this.register(() => {
      this.queryBlocks.clear();
    });
    this.addCommand({
      callback: () => {
        new BasesFilterModal({
          api: this.api,
          app: this.app,
          settings: (): PluginSettings => this.indexSettings,
          showNotice: (message): void => {
            this.pluginNoticeComponent.showNotice(message);
          }
        }).open();
      },
      id: 'copy-bases-filter',
      name: 'Copy Bases filter for tag subtree'
    });
    const picker = new TagPicker({
      api: this.api,
      app: this.app,
      settings: (): PluginSettings => this.indexSettings,
      showError: (error): void => {
        this.pluginNoticeComponent.showNotice(String(error));
      }
    });
    this.registerEditorSuggest(new TagSuggest(this.app, picker, (): PluginSettings => this.indexSettings));
    this.addCommand({
      editorCallback: (editor, view): void => {
        if (!view.file) {
          return;
        }

        const cursor = editor.getCursor();
        picker.open({ editor, end: cursor, file: view.file, start: cursor, text: '' });
      },
      id: 'tag-this-note',
      name: 'Tag this note'
    });
    this.addCommand({
      callback: () => {
        new MigrationModal({
          app: this.app,
          settings: this.indexSettings,
          showNotice: (message): void => {
            this.pluginNoticeComponent.showNotice(message);
          }
        }).open();
      },
      id: 'convert-tags',
      name: 'Convert tags'
    });
    this.registerView(TAG_TREE_VIEW_TYPE, (leaf) =>
      new TagTreeView({
        api: this.api,
        leaf,
        settings: (): PluginSettings => this.indexSettings,
        showError: (error): void => {
          this.pluginNoticeComponent.showNotice(String(error));
        }
      }));
    this.addCommand({
      callback: () => {
        invokeAsyncSafely(() => this.openTagTree());
      },
      id: 'open-tag-tree',
      name: 'Open tag tree'
    });
    const pluginSettingsComponent = this.addChild(
      new PluginSettingsComponent({
        dataHandler: new PluginDataHandler(this),
        pluginEventSource: new PluginEventSourceImpl(this)
      })
    );
    this.pluginSettingsComponent = pluginSettingsComponent;

    this.addChild(
      new PluginSettingsTabComponent({
        plugin: this,
        pluginSettingsTab: new PluginSettingsTab({
          plugin: this,
          pluginSettingsComponent
        })
      })
    );

    const rebuild = (): void => {
      this.indexSettings = { ...pluginSettingsComponent.settings };
      this.tagIndex.rebuild();
      for (const block of this.queryBlocks) {
        block.refresh();
      }
      for (const leaf of this.app.workspace.getLeavesOfType(TAG_TREE_VIEW_TYPE)) {
        if (leaf.view instanceof TagTreeView) {
          leaf.view.refresh();
        }
      }
    };
    this.app.workspace.onLayoutReady(rebuild);
    this.registerEvent(this.app.metadataCache.on('changed', rebuild));
    this.registerEvent(this.app.metadataCache.on('deleted', rebuild));
    this.registerEvent(this.app.metadataCache.on('resolved', rebuild));
    this.registerEvent(this.app.vault.on('rename', rebuild));
    const saveRef = pluginSettingsComponent.on('saveSettings', rebuild);
    const loadRef = pluginSettingsComponent.on('loadSettings', rebuild);
    this.register(() => {
      pluginSettingsComponent.offref(saveRef);
      pluginSettingsComponent.offref(loadRef);
    });

    // `OpenDemoVaultCommandHandler` is what makes the README's first demo-vault route real: it downloads
    // The `<plugin-id>-demo-vault.zip` attached to the GitHub release and opens it as a vault in
    // A new window. It is not registered automatically -- a demo vault without this command can only be
    // Reached by downloading the asset by hand. It hides itself on mobile, so no platform guard is needed.
    await this.commandHandlerComponent.registerCommandHandlers(() => [
      new OpenBugReportCommandHandler({
        app: this.app,
        gitHubRepo: 'mnaoumov/obsidian-tag-notes',
        pluginId: this.manifest.id
      }),
      new OpenDemoVaultCommandHandler({
        app: this.app,
        pluginId: this.manifest.id,
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginVersion: this.manifest.version
      })
    ]);
  }

  private async openTagTree(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(TAG_TREE_VIEW_TYPE)[0];
    const leaf = existing ?? this.app.workspace.getLeftLeaf(false);
    if (!leaf) {
      return;
    }

    await leaf.setViewState({ active: true, type: TAG_TREE_VIEW_TYPE });
    await this.app.workspace.revealLeaf(leaf);
  }
}
