import { simpleGit } from 'simple-git';
import fs from 'fs';
import path from 'path';
import { writeJSONFile } from './fs.js';
import { green } from 'ansis';

const fsp = fs.promises;

export async function createOrCheckoutBranch(
  git: ReturnType<typeof simpleGit>,
  branch: string,
  localPath: string,
) {
  await git.fetch();
  const branchSummary = await git.branch(['-a']);
  if (branchSummary.all.includes(`remotes/origin/${branch}`)) {
    await git.checkout(branch);
  } else {
    // create an orphan branch (no history) and make an initial empty commit
    try {
      try {
        await git.raw(['switch', '--orphan', branch]);
      } catch {
        await git.raw(['checkout', '--orphan', branch]);
      }

      // remove all files from the working tree except the .git directory
      const entries = await fsp.readdir(localPath);
      for (const entry of entries) {
        if (entry === '.git') continue;
        await fsp.rm(path.join(localPath, entry), { recursive: true, force: true });
      }
    } catch (error) {
      throw new Error(`Failed to create orphan branch ${branch}: ${error}`);
    }
  }
}

export async function processIfExists(path: string, forceOverwrite: boolean) {
  if (fs.existsSync(path)) {
    if (forceOverwrite) {
      await fsp.rm(path, { recursive: true, force: true });
    } else {
      throw new Error(`Local path ${path} already exists. Use forceOverwrite option to overwrite.`);
    }
  }
}

async function cloneRepo(repoGit: string, localPath: string) {
  const gitInit = simpleGit();
  try {
    await gitInit.clone(repoGit, localPath);
  } catch (error) {
    throw new Error(`Failed to clone repository from ${repoGit} to ${localPath}: ${error}`);
  }
}

export async function cloneRegistrySource(
  registryGit: string,
  registrySourcePath: string,
  forceOverwrite: boolean = false,
) {
  await processIfExists(registrySourcePath, forceOverwrite);
  await cloneRepo(registryGit, registrySourcePath);
}

export async function cloneRegistryDist(
  registryDistGit: string,
  storeBranch: string,
  registryDistPath: string,
  cacheFile: string,
  forceOverwrite: boolean = false,
) {
  await processIfExists(registryDistPath, forceOverwrite);
  await cloneRepo(registryDistGit, registryDistPath);
  const git = simpleGit(registryDistPath);
  await createOrCheckoutBranch(git, storeBranch, registryDistPath);

  // Initialize cache file
  await writeJSONFile(path.join(registryDistPath, cacheFile), {
    lastProcessedCommit: '-',
    lastCacheUpdate: new Date().toISOString(),
  });

  await writeJSONFile(path.join(registryDistPath, 'list.json'), []);

  await git.raw(['add', '--all']);
  await git.commit('Initialize registry dist branch');
}

export async function initRepos(
  registrySourcePath: string,
  registryDestPath: string,
  registryGit: string,
  registryDestBranch: string,
  cacheFile: string,
  forceOverwrite: boolean = false,
) {
  console.log(green(`Initializing registry repositories...`));

  await cloneRegistrySource(registryGit, registrySourcePath, forceOverwrite);

  await cloneRegistryDist(
    registryGit,
    registryDestBranch,
    registryDestPath,
    cacheFile,
    forceOverwrite,
  );

  console.log(green(`Successfully initialized registry repositories.`));
}
