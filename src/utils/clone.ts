import { simpleGit } from 'simple-git';
import { RegistryConfig } from './config.js';
import fs from 'fs';

const fsp = fs.promises;

export async function cloneRegistry(
  registryGit: string,
  localPath: string,
  configPath: string,
  registryDist: string,
  forceOverwrite: boolean = false,
) {
  if (fs.existsSync(localPath)) {
    if (forceOverwrite) {
      await fsp.rm(localPath, { recursive: true, force: true });
    } else {
      throw new Error(
        `Local path ${localPath} already exists. Use forceOverwrite option to overwrite.`,
      );
    }
  }

  const git = simpleGit();
  try {
    await git.clone(registryGit, localPath);
  } catch (error) {
    throw new Error(`Failed to clone repository from ${registryGit} to ${localPath}: ${error}`);
  }

  const config: RegistryConfig = {
    outputRegistryDist: registryDist,
    registryGit: registryGit,
    registryPath: localPath,
  };

  try {
    await fsp.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    throw new Error(`Failed to write config to ${configPath}: ${error}`);
  }
  console.log(`Successfully cloned registry to ${localPath} and wrote config to ${configPath}`);
}
