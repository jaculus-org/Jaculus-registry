import { simpleGit } from 'simple-git';
import { RegistryConfig } from '../interface.js';
import fs from 'fs';

const fsp = fs.promises;

export async function cloneRegistry(
  registryDist: string,
  registryGitUrlHttps: string,
  localPath: string,
  configPath: string,
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
    await git.clone(registryGitUrlHttps, localPath);
  } catch (error) {
    throw new Error(
      `Failed to clone repository from ${registryGitUrlHttps} to ${localPath}: ${error}`,
    );
  }

  const config: RegistryConfig = {
    outputRegistryDist: registryDist,
    registryGitUrlHttps: registryGitUrlHttps,
    registryPath: localPath,
  };

  try {
    await fsp.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    throw new Error(`Failed to write config to ${configPath}: ${error}`);
  }
  console.log(`Successfully cloned registry to ${localPath} and wrote config to ${configPath}`);
}
