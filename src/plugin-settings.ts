export class PluginSettings {
  public inlineTagConversion: 'keep' | 'link' | 'remove' = 'link';
  public insertBodyLink = false;
  public parentPropertyName = 'broader';
  public suggestTrigger = '@';
  public tagFolderPath = 'Tags';
  public tagsPropertyName = 'keywords';
}
