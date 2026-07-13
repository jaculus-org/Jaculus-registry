import { Command } from 'commander';
import { RegistryTool } from './registryTool.js';
import { initRepos } from './utils/clone.js';
import { extractPackageAtVersion } from './utils/tarGz.js';

const cacheFileName = '.cache/registry-cache.json';

const program = new Command();
program.name('jaculus-registry').description('Registry management CLI');

program
  .command('init')
  .description('Clone the registry repository and initialize the dist')
  .argument('<registryDestPath>', 'Path to the registry dist directory')
  .option(
    '--git-url <url>',
    'HTTPS URL of the registry git repository',
    'https://github.com/jaculus-org/Jaculus-libraries.git',
  )
  .option('--branch-dist <branch>', 'Branch name for the registry dist repository', 'registry')
  .option('-f, --force', 'Force overwrite if the local path exists')
  .action(async (registryDestPath, options) => {
    await initRepos(
      registryDestPath,
      options.gitUrl,
      options.branchDist,
      cacheFileName,
      options.force,
    );
  });

program
  .command('info')
  .description('Print registry and cache information')
  .argument(
    '[registrySourcePath]',
    'Path to the registry source directory',
    './.jaculus-libs-source',
  )
  .argument('[registryDestPath]', 'Path to the registry dist directory', './.jaculus-libs-dist')
  .action(async (registrySourcePath, registryDestPath) => {
    const rt = new RegistryTool(registrySourcePath, registryDestPath, cacheFileName);
    console.log(`Registry Cache: ${JSON.stringify(rt.getCache(), null, 2)}`);
  });

program
  .command('generate')
  .description('Run generateRegistry for new commits (respects cache)')
  .option('-f, --force', 'Force regenerate all commits, ignoring cache')
  .option(
    '--force-rebuild-all',
    'Skip blocks directory validation and rebuild/overwrite packages already in dist',
  )
  .argument(
    '[registrySourcePath]',
    'Path to the registry source directory',
    './.jaculus-libs-source',
  )
  .argument('[registryDestPath]', 'Path to the registry dist directory', './.jaculus-libs-dist')
  .action(async (registrySourcePath, registryDestPath, options) => {
    const rt = new RegistryTool(registrySourcePath, registryDestPath, cacheFileName);
    await rt.generateRegistry(options.force, options.forceRebuildAll);
  });

program
  .command('serve')
  .description('Serve the current registry over HTTP')
  .option('-p, --port <number>', 'Port to serve the registry on', '3737')
  .argument(
    '[registrySourcePath]',
    'Path to the registry source directory',
    './.jaculus-libs-source',
  )
  .argument('[registryDestPath]', 'Path to the registry dist directory', './.jaculus-libs-dist')
  .action(async (registrySourcePath, registryDestPath, options) => {
    const rt = new RegistryTool(registrySourcePath, registryDestPath, cacheFileName);
    await rt.serveCurrentRegistry(options.port);
  });

program
  .command('build')
  .description('Build all packages in the current registry')
  .option('-f, --force', 'Force rebuild all packages, ignoring cache')
  .argument(
    '[registrySourcePath]',
    'Path to the registry source directory',
    './.jaculus-libs-source',
  )
  .argument('[registryDestPath]', 'Path to the registry dist directory', './.jaculus-libs-dist')
  .action(async (registrySourcePath, registryDestPath, options) => {
    const rt = new RegistryTool(registrySourcePath, registryDestPath, cacheFileName);
    await rt.buildCurrentRegistry(options.force);
  });

program
  .command('build-watch')
  .description('Watch and build packages on changes in the current registry')
  .argument(
    '[registrySourcePath]',
    'Path to the registry source directory',
    './.jaculus-libs-source',
  )
  .argument('[registryDestPath]', 'Path to the registry dist directory', './.jaculus-libs-dist')
  .action(async (registrySourcePath, registryDestPath) => {
    const rt = new RegistryTool(registrySourcePath, registryDestPath, cacheFileName);
    await rt.watchBuildCurrentRegistry();
  });

program
  .command('extract')
  .argument('<registryDestPath>', 'Path to the registry dist directory')
  .argument('<packageName>', 'Name of the package to extract')
  .argument('<version>', 'Version of the package to extract')
  .argument('<extractPath>', 'Path to extract the package to')
  .description('Extract a specific package version to the given destination path')
  .action(
    async (packageName: string, version: string, extractPath: string, registryDestPath: string) => {
      await extractPackageAtVersion(registryDestPath, packageName, version, extractPath);
      console.log(`Extracted ${packageName}@${version} to ${extractPath}`);
    },
  );

program.parse(process.argv);
