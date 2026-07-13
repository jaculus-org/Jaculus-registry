import { simpleGit } from 'simple-git';
import fs, { promises as fsp } from 'fs';
import { serveFolder } from './utils/serve.js';
import {
  buildAllPackagesInRegistry,
  watchAndBuildPackagesInRegistry,
} from './generate/build-watch.js';
import { DistRegistry } from './localRegistry.js';
import path from 'path';
import { loadCache, RegistryCache, saveCache } from './utils/config.js';
import { blue, red } from 'ansis';

export class RegistryTool {
  private git: ReturnType<typeof simpleGit>;
  private cache: RegistryCache;
  private distRegistry: DistRegistry;
  constructor(
    private registrySourcePath: string,
    private registryDestPath: string,
    private cachePath: string,
  ) {
    console.log(`Source Path: ${registrySourcePath}, Dest Path: ${registryDestPath}`);
    this.git = simpleGit(this.registrySourcePath);
    this.cache = loadCache(path.join(this.registryDestPath, this.cachePath));

    if (!fs.existsSync(this.registryDestPath)) {
      fs.mkdirSync(this.registryDestPath, { recursive: true });
    }
    this.distRegistry = new DistRegistry(this.registryDestPath);
  }

  async updateCache(latestCommit: string) {
    this.cache.lastProcessedCommit = latestCommit;
    this.cache.lastCacheUpdate = new Date().toISOString();
    await saveCache(path.join(this.registryDestPath, this.cachePath), this.cache);
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

  async serveCurrentRegistry(port: number) {
    await serveFolder(this.registryDestPath, port);
  }

  async buildCurrentRegistry(override = false) {
    await this.distRegistry.loadRegistryData();
    await buildAllPackagesInRegistry(this.registrySourcePath, this.distRegistry, override);
  }

  async watchBuildCurrentRegistry() {
    await this.distRegistry.loadRegistryData();
    await watchAndBuildPackagesInRegistry(this.registrySourcePath, this.distRegistry);
  }

  async doInCommitHash(commitHash: string, action: () => Promise<void>) {
    await this.git.checkout(commitHash);
    await action();
    await this.git.checkout('HEAD');
  }

  async generateRegistry(forceAll = false, forceRebuildAll = false, packages: string[] = []) {
    const packageFilter = packages.length > 0 ? new Set(packages) : undefined;
    if (packageFilter) {
      console.log(blue(`Restricting build to packages: ${packages.join(', ')}`));
    }
    await this.moveHeadToLastCommit();
    if (forceAll) {
      this.cache.lastProcessedCommit = '';
    }
    const commitsToProcess = await this.getListOfCommitsUntil(this.cache.lastProcessedCommit);
    if (commitsToProcess.length === 0) {
      console.log(blue('No new commits to process.'));
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
        const files = await fsp.readdir(this.registrySourcePath);
        console.log('Files at this commit:', files);

        try {
          await buildAllPackagesInRegistry(
            this.registrySourcePath,
            this.distRegistry,
            forceRebuildAll,
            forceRebuildAll,
            packageFilter,
          );
        } catch (err) {
          console.error(
            red(`Error processing registry at this commit: ${commitHash} Error:\n`),
            err,
          );
          throw err;
        }
      });
    }
    await this.moveHeadToLastCommit();
    await this.updateCache(commitsToProcess[0]);
  }
}
