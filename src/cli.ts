import { Command } from 'commander';
import { RegistryTool } from './registryTool.js';
import { cloneRegistry } from './utils/clone.js';

const configPath = './registry-config.json';
const cachePath = './registry-cache.json';

const program = new Command();
program.name('jaculus-registry').description('Registry management CLI');

program
  .command('init')
  .description('Clone the registry repository and initialize the dist')
  .option(
    '-g, --git-url <url>',
    'HTTPS URL of the registry git repository',
    'https://github.com/jaculus-org/Jaculus-libraries.git',
  )
  .option(
    '-p, --packages <path>',
    'Local path to clone the registry repository',
    './jaculus-packages',
  )
  .option(
    '-d, --packages-dist <path>',
    'Local path for the registry dist',
    './jaculus-packages-dist',
  )
  .option('-f, --force', 'Force overwrite if the local path exists')
  .action(async (options) => {
    await cloneRegistry(
      options.gitUrl,
      options.packages,
      configPath,
      options.packagesDist,
      options.force,
    );
    const rt = new RegistryTool(configPath, cachePath);
    await rt.initializeRegistryDist();
  });

program
  .command('info')
  .description('Print registry and cache information')
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
  .option('-p, --port <number>', 'Port to serve the registry on', '3232')
  .action(async (options) => {
    const rt = new RegistryTool(configPath, cachePath);
    await rt.serveCurrentRegistry(options.port);
  });

program
  .command('build')
  .description('Build all packages in the current registry')
  .option('-o, --override', 'Override existing package versions in the dist')
  .action(async (options) => {
    const rt = new RegistryTool(configPath, cachePath);
    await rt.buildCurrentRegistry(options.override);
  });

program
  .command('build-watch')
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
