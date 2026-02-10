import {
  parseRegistryList,
  parseRegistryVersions,
  RegistryList,
  RegistryVersions,
} from '@jaculus/project/registry';
import path from 'path';
import { promises as fsp } from 'fs';

import semver from 'semver';
import { JaculusConfig } from '@jaculus/project';

export class DistRegistry {
  // Versions are stored sorted by semver: index 0 = oldest, last index = latest
  private list: RegistryList = [];
  private versionsMap: Map<string, RegistryVersions> = new Map();

  constructor(private outputRegistryDist: string) {}

  getOutputPath(): string {
    return this.outputRegistryDist;
  }

  async loadRegistryData() {
    const listPath = path.join(this.outputRegistryDist, 'list.json');
    const listData = await fsp.readFile(listPath, 'utf-8');
    this.list = parseRegistryList(JSON.parse(listData));

    this.versionsMap = new Map();
    for (const item of this.list) {
      const versionsPath = path.join(this.outputRegistryDist, item.id, 'versions.json');
      const versionsData = await fsp.readFile(versionsPath, 'utf-8');
      const versions = parseRegistryVersions(JSON.parse(versionsData));
      // sort versions using semver (oldest first, latest last)
      versions.sort((a, b) => semver.compare(a.version, b.version));
      this.versionsMap.set(item.id, versions);
    }
  }

  async saveUpdatedList() {
    const listPath = path.join(this.outputRegistryDist, 'list.json');
    await fsp.writeFile(listPath, JSON.stringify(this.list, null, 2), 'utf-8');
  }

  async saveUpdatedVersions(packageName: string) {
    const versions = this.versionsMap.get(packageName);
    if (!versions) {
      throw new Error(`No versions found for package ${packageName}`);
    }
    const versionsPath = path.join(this.outputRegistryDist, packageName, 'versions.json');
    await fsp.writeFile(versionsPath, JSON.stringify(versions, null, 2), 'utf-8');
  }

  getAvailablePackages(): string[] {
    return this.list.map((item) => item.id);
  }

  getAvailableVersions(packageName: string): RegistryVersions {
    return this.versionsMap.get(packageName) || [];
  }

  getLatestVersion(packageName: string): string | null {
    const versions = this.versionsMap.get(packageName);
    if (!versions || versions.length === 0) {
      return null;
    }
    // last element is the latest due to semver sorting
    return versions[versions.length - 1].version;
  }

  existsPackage(packageName: string): boolean {
    return this.versionsMap.has(packageName);
  }

  existsVersion(packageName: string, version: string): boolean {
    const versions = this.versionsMap.get(packageName);
    if (!versions) {
      return false;
    }
    return versions.some((v) => v.version === version);
  }

  async addPackageVersion(
    packageName: string,
    versionStr: string,
    projectType: JaculusConfig['projectType'],
    isTemplate: JaculusConfig['template'],
  ) {
    // add package to list if it doesn't exist
    if (!this.existsPackage(packageName)) {
      this.list.push({ id: packageName, projectType, isTemplate });
      await this.saveUpdatedList();
    }

    // add version to versions map if it doesn't exist
    const versions = this.versionsMap.get(packageName) || [];
    if (!versions.some((v) => v.version === versionStr)) {
      versions.push({ version: versionStr });
      // sort versions using semver (oldest first)
      versions.sort((a, b) => semver.compare(a.version, b.version));
      this.versionsMap.set(packageName, versions);
      await this.saveUpdatedVersions(packageName);
    }
  }
}
