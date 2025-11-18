import fs from 'fs';
import { blue, green, red, yellow } from 'ansis';
import path from 'path';
import { spawn } from 'child_process';
import os from 'os';
import * as tar from 'tar';
import { promises as fsp } from 'fs';
import { copyDirectory } from './fs.js';
import { copyFile } from './fs.js';
import { loadPackageJson } from '@jaculus/project';
import { DistRegistry } from '../localRegistry.js';

/**
 *
 * Registry dist structure:
 *  outputRegistryDist/
 *   |-- <packageName>/
 *   |    |-- <version>/
 *   |    |   |-- package.tar.gz
 *   |    |   |-- package.json (same as in package)
 *	 |    |-- versions.json (list of versions) [{"version":"0.0.24"},{"version":"0.0.25"}]
 * 	 |-- list.json (list of packages) [{"id":"core"},{"id":"smart-led"}]
 *
 *
 * package.tar.gz contains:
 *   package/
 *     |-- dist/
 *     |-- blocks/
 *     |-- package.json
 *     |-- README.md
 */

/**
 * Build all packages in the registry located at pathToRegistry
 */
async function buildPnpmPackage(pathToPackage: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('pnpm', ['run', 'build'], {
      cwd: pathToPackage,
      stdio: 'inherit',
      shell: true,
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Build failed with exit code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

export async function copyBuiltPackagesToRegistryDist(
  pathToRegistry: string,
  outputRegistryDist: string,
  packageName: string,
  version: string,
) {
  const pathToOutputRegistryVer = path.join(outputRegistryDist, packageName, version);
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'registry-copy-'));
  try {
    // Create package structure in temp directory
    const packageDir = path.join(tempDir, 'package');
    await fsp.mkdir(packageDir, { recursive: true });

    // Copy required directories and files
    await copyDirectory(path.join(pathToRegistry, 'dist'), path.join(packageDir, 'dist'));
    await copyDirectory(path.join(pathToRegistry, 'blocks'), path.join(packageDir, 'blocks'));
    await copyFile('package.json', pathToRegistry, packageDir);
    await copyFile('README.md', pathToRegistry, packageDir, true);

    // Create tar.gz archive
    const tarGzPath = path.join(pathToOutputRegistryVer, 'package.tar.gz');
    await fsp.mkdir(pathToOutputRegistryVer, { recursive: true });

    await tar.create(
      {
        gzip: true,
        file: tarGzPath,
        cwd: tempDir,
      },
      ['package'],
    );

    // Copy package.json to version directory
    await copyFile('package.json', pathToRegistry, pathToOutputRegistryVer);
    console.log(green(`Package ${packageName}@${version} successfully copied to registry dist.`));
  } finally {
    // Clean up temp directory
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
}

async function buildPackage(
  pathToPackage: string,
  distRegistry: DistRegistry,
  overrideExisting = false,
) {
  const pkg = await loadPackageJson(fs, path.join(pathToPackage, 'package.json'));

  // package directory name must match package.json name
  const packageDirName = path.basename(pathToPackage);
  if (packageDirName !== pkg.name) {
    throw new Error(
      yellow(
        `Package directory name "${packageDirName}" does not match package.json name "${pkg.name}"`,
      ),
    );
  }

  if (!overrideExisting && distRegistry.existsVersion(pkg.name, pkg.version)) {
    console.error(
      red(`Package ${pkg.name}@${pkg.version} already exists in registry. Skipping build.`),
    );
    return;
  }

  await buildPnpmPackage(pathToPackage);
  await copyBuiltPackagesToRegistryDist(
    pathToPackage,
    distRegistry.getOutputPath(),
    pkg.name,
    pkg.version,
  );

  // register new version in dist registry and save updates
  await distRegistry.addPackageVersion(pkg.name, pkg.version);
}

export async function watchAndBuildPackagesInRegistry(
  pathToRegistry: string,
  distRegistry: DistRegistry,
) {
  const exclude = ['dist', '.git'];

  fs.watch(pathToRegistry, { recursive: true }, async (eventType, filename) => {
    // rebuild on any change, rebuild only corresponding package
    if (filename) {
      const parts = filename.split(path.sep);
      if (parts.some((part) => exclude.includes(part))) return;

      const packageDir = filename.split(path.sep)[0];
      const packagePath = path.join(pathToRegistry, packageDir);
      console.log(blue(`Change detected in ${filename}. Rebuilding package in ${packagePath}`));
      try {
        await buildPackage(packagePath, distRegistry, true);
        console.log(green(`Rebuild of package in ${packagePath} completed successfully.`));
      } catch (err) {
        console.error(red(`Rebuild of package in ${packagePath} failed:\n`), err);
      }
    }
  });
  console.log(`Watching for changes in ${pathToRegistry}...`);
}

export async function buildAllPackagesInRegistry(
  pathToRegistry: string,
  distRegistry: DistRegistry,
  overrideExisting = false,
) {
  const skipDirectories = ['dist', '.git'];
  const packages = await fsp.readdir(pathToRegistry, { withFileTypes: true });
  for await (const dirent of packages) {
    if (dirent.isDirectory() && !skipDirectories.includes(dirent.name)) {
      const packagePath = path.join(pathToRegistry, dirent.name);
      console.log(`Building package in ${packagePath}`);
      await buildPackage(packagePath, distRegistry, overrideExisting);
    }
  }
}
