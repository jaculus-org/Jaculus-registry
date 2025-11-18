import { Command } from 'commander';
import { RegistryTool } from './registry.js';
import { cloneRegistry } from './utils/clone.js';

const configPath = './registry-config.json';
const cachePath = './registry-cache.json';

const program = new Command();
program.name('jaculus-registry').description('Registry management CLI');

program
  .command('init')
  .description('Clone the registry repository and initialize the dist')
  .option('-o, --output <output>', 'Output directory for the registry dist', './libraries-dist')
  .option(
    '-u, --url <url>',
    'HTTPS URL of the registry git repository',
    'https://github.com/jaculus-org/Jaculus-libraries.git',
  )
  .option('-f, --force', 'Force overwrite if the local path exists')
  .action(async (options) => {
    await cloneRegistry(
      options.output,
      options.url,
      configPath,
      './registry-config.json',
      options.force,
    );
    const rt = new RegistryTool(configPath, cachePath);
    await rt.initializeRegistryDist();
  });

program
  .command('info')
  .description('Print registry cache info')
  .action(async () => {
    const rt = new RegistryTool(configPath, cachePath);
    console.log(`Registry Cache: ${JSON.stringify(rt.getCache(), null, 2)}`);
  });

program
  .command('generate')
  .description('Run generateRegistry for new commits (respects cache)')
  .option('-f, --force', 'Force regenerate all commits, ignoring cache')
  .action(async (options) => {
    const rt = new RegistryTool(configPath, cachePath);
    await rt.generateRegistry(options.force);
  });

program
  .command('serve')
  .description('Serve the current registry over HTTP')
  .action(async () => {
    const rt = new RegistryTool(configPath, cachePath);
    await rt.serveCurrentRegistry();
  });

program
  .command('build')
  .description('Build all packages in the current registry')
  .action(async () => {
    const rt = new RegistryTool(configPath, cachePath);
    await rt.processCurrentRegistry();
  });

program
  .command('watch-build')
  .description('Watch and build packages on changes in the current registry')
  .action(async () => {
    const rt = new RegistryTool(configPath, cachePath);
    await rt.watchBuildCurrentRegistry();
  });

program
  .command('extract <packageName> <version> <destinationPath>')
  .description('Extract a specific package version to the given destination path')
  .action(async (packageName: string, version: string, destinationPath: string) => {
    const rt = new RegistryTool(configPath, cachePath);
    await rt.extractPackageAtVersion(packageName, version, destinationPath);
    console.log(`Extracted ${packageName}@${version} to ${destinationPath}`);
  });

program.parse(process.argv);
