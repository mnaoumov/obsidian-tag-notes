import { registerDemoVaultCoverageSuite } from '@mnaoumov/obsidian-dev-toolkit/demo-vault-coverage';
import { getRootFolder } from '@mnaoumov/typescript-dev-toolkit/root';
import process from 'node:process';

// Checks authoring conventions, reachability and settings documentation without launching Obsidian.
registerDemoVaultCoverageSuite({
  configInterfaces: [{ interfaceName: 'PluginSettings', sourcePath: 'src/plugin-settings.ts' }],
  rootFolder: getRootFolder() ?? process.cwd()
});
