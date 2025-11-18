import { Command } from 'commander';
import { RegistryTool } from './main.js';

const repoPath = './test-repo';
const cachePath = './registry-cache.json';

const program = new Command();
program.name('jaculus-registry').description('Registry management CLI');

program
  .command('cache')
  .description('Print registry cache info')
  .action(async () => {
    const rt = new RegistryTool(repoPath, cachePath);
    console.log(rt.getCache());
  });

program
  .command('generate-new')
  .description('Run generateRegistry for new commits (respects cache)')
  .action(async () => {
    const rt = new RegistryTool(repoPath, cachePath);
    await rt.generateRegistry(false);
  });

program
  .command('generate-force-all')
  .description('Run generateRegistry ignoring the cache and processing all commits')
  .action(async () => {
    const rt = new RegistryTool(repoPath, cachePath);
    await rt.generateRegistry(true);
  });

program.parse(process.argv);
