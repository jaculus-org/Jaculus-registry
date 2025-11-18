import fs, { promises as fsp } from 'fs';

export interface RegistryCache {
  lastProcessedCommit: string;
  lastCacheUpdate: string;
}

export interface RegistryConfig {
  registryGit: string;
  registryPath: string;
  outputRegistryDist: string;
}

export function loadConfig(configPath: string): RegistryConfig {
  try {
    const cacheData = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(cacheData) as RegistryConfig;
  } catch {
    throw new Error(`Failed to load config from ${configPath}`);
  }
}

export function loadCache(cachePath: string): RegistryCache {
  try {
    const cacheData = fs.readFileSync(cachePath, 'utf-8');
    return JSON.parse(cacheData) as RegistryCache;
  } catch {
    return { lastProcessedCommit: '', lastCacheUpdate: '' };
  }
}

export async function saveCache(cachePath: string, cache: RegistryCache): Promise<void> {
  return fsp.writeFile(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
}
