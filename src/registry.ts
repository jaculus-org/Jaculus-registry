import { simpleGit } from 'simple-git';
import fs from 'fs';
import { RegistryCache, RegistryConfig } from './interface.js';
import { serveFolder } from './utils/serve.js';
import {
  buildAllPackagesInRegistry,
  watchAndBuildPackagesInRegistry,
} from './utils/build-watch.js';
import { DistRegistry } from './localRegistry.js';
import { extractTarGz } from './utils/tarGz.js';
import path from 'path';

const fsp = fs.promises;

export class RegistryTool {
  private git: ReturnType<typeof simpleGit>;
  private cache: RegistryCache;
  private config: RegistryConfig;
  private distRegistry: DistRegistry;
  constructor(
    configPath: string,
    private cachePath: string,
  ) {
    this.config = this.loadConfig(configPath);
    if (!fs.existsSync(this.config.registryPath)) {
      throw new Error(
        `Registry path ${this.config.registryPath} does not exist. Please clone the registry repository first.`,
      );
    }
    console.log(
      `Using registry: URL: ${this.config.registryGitUrlHttps} Path: ${this.config.registryPath}`,
    );
    this.git = simpleGit(this.config.registryPath);
    this.cache = this.loadCache(cachePath);

    if (!fs.existsSync(this.config.outputRegistryDist)) {
      fs.mkdirSync(this.config.outputRegistryDist, { recursive: true });
    }
    this.distRegistry = new DistRegistry(this.config.outputRegistryDist);
  }

  initializeRegistryDist() {
    return this.distRegistry.initialize();
  }

  loadConfig(configPath: string): RegistryConfig {
    try {
      const cacheData = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(cacheData) as RegistryConfig;
    } catch {
      throw new Error(`Failed to load config from ${configPath}`);
    }
  }

  loadCache(cachePath: string): RegistryCache {
    try {
      const cacheData = fs.readFileSync(cachePath, 'utf-8');
      return JSON.parse(cacheData) as RegistryCache;
    } catch {
      return { lastProcessedCommit: '', lastCacheUpdate: '' };
    }
  }

  async updateCache(latestCommit: string) {
    this.cache.lastProcessedCommit = latestCommit;
    this.cache.lastCacheUpdate = new Date().toISOString();
    await fsp.writeFile(this.cachePath, JSON.stringify(this.cache, null, 2), 'utf-8');
  }

  getCache(): RegistryCache {
    return this.cache;
  }

  async moveHeadToLastCommit() {
    await this.git.reset(['--hard', 'HEAD']);
  }

  /*
   * Get list of commit hashes until (but not including) the specified commit hash
   */
  async getListOfCommitsUntil(commitHash: string): Promise<string[]> {
    const log = await this.git.log();
    const commits: string[] = [];
    for (const entry of log.all) {
      if (entry.hash === commitHash) {
        break;
      }
      commits.push(entry.hash);
    }
    return commits;
  }

  async doInCommitHash(commitHash: string, action: () => Promise<void>) {
    await this.git.checkout(commitHash);
    await action();
    await this.git.checkout('HEAD');
  }

  async serveCurrentRegistry() {
    await serveFolder(this.config.registryPath, 8080);
  }

  async processCurrentRegistry() {
    await this.distRegistry.loadRegistryData();
    await buildAllPackagesInRegistry(this.config.registryPath, this.distRegistry);
  }

  async watchBuildCurrentRegistry() {
    await this.distRegistry.loadRegistryData();
    await watchAndBuildPackagesInRegistry(this.config.registryPath, this.distRegistry);
  }

  async generateRegistry(forceAll = false) {
    await this.moveHeadToLastCommit();
    if (forceAll) {
      this.cache.lastProcessedCommit = '';
    }
    const commitsToProcess = await this.getListOfCommitsUntil(this.cache.lastProcessedCommit);
    if (commitsToProcess.length === 0) {
      console.log('No new commits to process.');
      process.exit(0);
    }

    await this.distRegistry.loadRegistryData();
    console.log(`Processing ${commitsToProcess.length} commits...`);
    for (const commitHash of commitsToProcess.toReversed()) {
      await this.doInCommitHash(commitHash, async () => {
        const log = await this.git.log({ n: 1 });
        console.log(
          `Processing commit: ${log.latest?.hash} - ${log.latest?.message} from date ${log.latest?.date}`,
        );
        // list files in the repo at this commit
        const files = await fsp.readdir(this.config.registryPath);
        console.log('Files at this commit:', files);

        try {
          await buildAllPackagesInRegistry(this.config.registryPath, this.distRegistry);
        } catch (err) {
          console.error(`Error processing registry at this commit: ${commitHash} Error:\n`, err);
          throw err;
        }
      });
    }
    await this.moveHeadToLastCommit();
    await this.updateCache(commitsToProcess[0]);
  }

  async extractPackageAtVersion(packageName: string, version: string, destinationPath: string) {
    const packageTarGzPath = path.join(
      this.config.outputRegistryDist,
      packageName,
      version,
      'package.tar.gz',
    );
    if (!fs.existsSync(packageTarGzPath)) {
      throw new Error(
        `Package tar.gz for ${packageName}@${version} does not exist at ${packageTarGzPath}`,
      );
    }
    await fsp.mkdir(destinationPath, { recursive: true });

    return extractTarGz(packageTarGzPath, destinationPath);
  }
}
