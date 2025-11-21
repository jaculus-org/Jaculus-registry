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
  .argument('<registrySourcePath>', 'Path to the registry source directory')
  .argument('<registryDestPath>', 'Path to the registry dist directory')
  .option(
    '-g, --git-url <url>',
    'HTTPS URL of the registry git repository',
    'https://github.com/JakubAndrysek/Jaculus-libraries.git',
  )
  .option('--branch-dist <branch>', 'Branch name for the registry dist repository', 'registry')
  .option('-f, --force', 'Force overwrite if the local path exists')
  .action(async (registrySourcePath, registryDestPath, options) => {
    await initRepos(
      registrySourcePath,
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
  .argument('[registrySourcePath]', 'Path to the registry source directory',  "./jaculus-packages-source")
  .argument('[registryDestPath]', 'Path to the registry dist directory', "./jaculus-packages-dist")
  .action(async (registrySourcePath, registryDestPath) => {
    const rt = new RegistryTool(registrySourcePath, registryDestPath, cacheFileName);
    console.log(`Registry Cache: ${JSON.stringify(rt.getCache(), null, 2)}`);
  });

program
  .command('generate')
  .description('Run generateRegistry for new commits (respects cache)')
  .option('-f, --force', 'Force regenerate all commits, ignoring cache')
  .argument('[registrySourcePath]', 'Path to the registry source directory',  "./jaculus-packages-source")
  .argument('[registryDestPath]', 'Path to the registry dist directory', "./jaculus-packages-dist")
  .action(async (registrySourcePath, registryDestPath, options) => {
    const rt = new RegistryTool(registrySourcePath, registryDestPath, cacheFileName);
    await rt.generateRegistry(options.force);
  });

program
  .command('serve')
  .description('Serve the current registry over HTTP')
  .option('-p, --port <number>', 'Port to serve the registry on', '3232')
  .argument('[registrySourcePath]', 'Path to the registry source directory',  "./jaculus-packages-source")
  .argument('[registryDestPath]', 'Path to the registry dist directory', "./jaculus-packages-dist")
  .action(async (registrySourcePath, registryDestPath, options) => {
    const rt = new RegistryTool(registrySourcePath, registryDestPath, cacheFileName);
    await rt.serveCurrentRegistry(options.port);
  });

program
  .command('build')
  .description('Build all packages in the current registry')
  .option('-f, --force', 'Force rebuild all packages, ignoring cache')
  .argument('[registrySourcePath]', 'Path to the registry source directory',  "./jaculus-packages-source")
  .argument('[registryDestPath]', 'Path to the registry dist directory', "./jaculus-packages-dist")
  .action(async (registrySourcePath, registryDestPath, options) => {
    const rt = new RegistryTool(registrySourcePath, registryDestPath, cacheFileName);
    await rt.buildCurrentRegistry(options.force);
  });

program
  .command('build-watch')
  .description('Watch and build packages on changes in the current registry')
  .argument('[registrySourcePath]', 'Path to the registry source directory',  "./jaculus-packages-source")
  .argument('[registryDestPath]', 'Path to the registry dist directory', "./jaculus-packages-dist")
  .action(async (registrySourcePath, registryDestPath) => {
    const rt = new RegistryTool(registrySourcePath, registryDestPath, cacheFileName);
    await rt.watchBuildCurrentRegistry();
  });

program
  .command('extract <packageName> <version> <destinationPath>')
  .description('Extract a specific package version to the given destination path')
  .argument('<registryDestPath>', 'Path to the registry dist directory')
  .action(
    async (
      packageName: string,
      version: string,
      destinationPath: string,
      registryDestPath: string,
    ) => {
      await extractPackageAtVersion(registryDestPath, packageName, version, destinationPath);
      console.log(`Extracted ${packageName}@${version} to ${destinationPath}`);
    },
  );

program.parse(process.argv);
