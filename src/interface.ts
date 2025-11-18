export interface RegistryCache {
  lastProcessedCommit: string;
  lastCacheUpdate: string;
}

export interface RegistryConfig {
  registryGitUrlHttps: string;
  registryPath: string;
  outputRegistryDist: string;
}
