import type {
  App,
  Editor,
  EditorPosition,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  TFile
} from 'obsidian';

import { EditorSuggest } from 'obsidian';

import type { PluginSettings } from '../plugin-settings.ts';
import type {
  TagChoice,
  TagPicker
} from './tag-picker.ts';

export class TagSuggest extends EditorSuggest<TagChoice> {
  private readonly picker: TagPicker;
  private readonly settings: () => PluginSettings;

  public constructor(app: App, picker: TagPicker, settings: () => PluginSettings) {
    super(app);
    this.picker = picker;
    this.settings = settings;
  }

  public override getSuggestions(context: EditorSuggestContext): TagChoice[] {
    return this.picker.choices(context.query);
  }

  public override onTrigger(cursor: EditorPosition, editor: Editor, file: null | TFile): EditorSuggestTriggerInfo | null {
    const trigger = this.settings().suggestTrigger;
    if (!file || !trigger) {
      return null;
    }
    const before = editor.getLine(cursor.line).slice(0, cursor.ch);
    const index = before.lastIndexOf(trigger);
    if (index === -1 || (index > 0 && !/\s/u.test(before.charAt(index - 1)))) {
      return null;
    }
    const query = before.slice(index + trigger.length);
    if (/\s/u.test(query)) {
      return null;
    }
    const cache = this.app.metadataCache.getFileCache(file);
    if (cache?.frontmatterPosition && cursor.line <= cache.frontmatterPosition.end.line) {
      return null;
    }
    return cache?.sections?.some((section) => section.type === 'code' && section.position.start.line <= cursor.line && section.position.end.line >= cursor.line) || before.includes('`') ? null : { end: cursor, query, start: { ch: index, line: cursor.line } };
  }

  public override renderSuggestion(choice: TagChoice, element: HTMLElement): void {
    this.picker.render(choice, element);
  }

  public override selectSuggestion(choice: TagChoice): void {
    const context = this.context;
    if (!context) {
      return;
    }
    this.close();
    this.picker.select(choice, { ...context, text: `${this.settings().suggestTrigger}${context.query}` });
  }
}
