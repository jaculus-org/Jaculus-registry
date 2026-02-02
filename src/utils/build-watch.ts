import fs, { promises as fsp } from 'fs';
import { blue, green, red, yellow } from 'ansis';
import path from 'path';
import { spawn } from 'child_process';
import os from 'os';
import * as tar from 'tar';
import { copyDirectory, writeJSONFile } from './fs.js';
import { copyFile } from './fs.js';
import { JaculusConfig, loadPackageJson } from '@jaculus/project';
import { DistRegistry } from '../localRegistry.js';

const folderIgnoreListGlobe = ['node_modules', 'dist', /^\..*/]; // ignore node_modules, dist, and dotfiles

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
async function runCommand(pathToPackage: string, command: string, args: string[]): Promise<void> {
  console.log(blue(`Running command: ${command} ${args.join(' ')} in ${pathToPackage}`));
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: pathToPackage,
      stdio: 'inherit',
      shell: true,
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Build failed with exit code ${code} under ${pathToPackage}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

async function buildPnpmPackage(pathToPackage: string, template: JaculusConfig['template']) {
  await runCommand(pathToPackage, 'pnpm', ['install']);
  switch (template) {
    case 'code':
      await runCommand(pathToPackage, 'pnpm', ['run', 'build']);
      break;
    case 'jacly': {
      const srcPath = path.join(pathToPackage, 'src');
      const distPath = path.join(pathToPackage, 'dist');

      if (fs.existsSync(srcPath)) {
        await copyDirectory(srcPath, distPath, true);
      } else {
        console.log(yellow(`No src directory found in ${pathToPackage}, skipping copy to dist.`));
      }
      break;
    }
  }
}

export async function resolvePackageJsonWorkspace(fileName: string, sourceDir: string) {
  const packageJsonPath = path.join(sourceDir, fileName);
  const packageJson = await loadPackageJson(fs, packageJsonPath);

  // Resolve workspace: versions in dependencies
  if (packageJson.dependencies) {
    for (const [dep, version] of Object.entries(packageJson.dependencies)) {
      if (version.startsWith('workspace:')) {
        packageJson.dependencies[dep] = version.replace('workspace:', '');
      }
    }
  }

  await writeJSONFile(packageJsonPath, packageJson);
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
    await copyDirectory(path.join(pathToRegistry, 'dist'), path.join(packageDir, 'dist'), true);
    await copyDirectory(path.join(pathToRegistry, 'blocks'), path.join(packageDir, 'blocks'), true);
    await copyFile('package.json', pathToRegistry, packageDir);
    await resolvePackageJsonWorkspace('package.json', packageDir);
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

    await copyDirectory(packageDir, path.join(pathToOutputRegistryVer, 'package'), true);

    // Copy package.json to version directory
    await copyFile('package.json', packageDir, pathToOutputRegistryVer);
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
  // For scoped packages (e.g., @types/jaculus), construct the expected name from path
  const packageDirName = path.basename(pathToPackage);
  const parentDirName = path.basename(path.dirname(pathToPackage));
  const expectedPackageName = parentDirName.startsWith('@')
    ? `${parentDirName}/${packageDirName}`
    : packageDirName;

  if (expectedPackageName !== pkg.name) {
    throw new Error(
      yellow(
        `Package directory name "${expectedPackageName}" does not match package.json name "${pkg.name}"`,
      ),
    );
  }

  if (!overrideExisting && distRegistry.existsVersion(pkg.name, pkg.version)) {
    console.error(
      yellow(`Package ${pkg.name}@${pkg.version} already exists in registry. Skipping build.`),
    );
    return;
  }

  await buildPnpmPackage(pathToPackage, pkg.jaculus?.template);
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
  fs.watch(pathToRegistry, { recursive: true }, async (eventType, filename) => {
    // rebuild on any change, rebuild only corresponding package
    if (!filename) return;

    // normalize and split relative path reported by watcher
    const parts = filename.split(path.sep).filter(Boolean);
    if (
      parts.some((part) =>
        folderIgnoreListGlobe.some((ignore) =>
          typeof ignore === 'string' ? ignore === part : ignore.test(part),
        ),
      )
    )
      return;

    // If the change is at the registry root (e.g. a top-level package.json), ignore it
    if (parts.length === 0) return;

    // Handle scoped packages (e.g., @types/jaculus)
    // For scoped packages, the actual package is at parts[0]/parts[1]
    let packagePath: string;
    if (parts[0].startsWith('@')) {
      // Scoped package - need at least 2 parts (e.g., @types/jaculus)
      if (parts.length < 2) return;
      packagePath = path.join(pathToRegistry, parts[0], parts[1]);
    } else {
      // Regular package
      packagePath = path.join(pathToRegistry, parts[0]);
    }

    try {
      const stat = await fsp.stat(packagePath);
      if (!stat.isDirectory()) {
        // Not a package directory -- ignore
        return;
      }
    } catch {
      // Path does not exist or cannot be accessed; ignore noisy watcher events
      return;
    }

    console.log(blue(`Change detected in ${filename}. Rebuilding package in ${packagePath}`));
    try {
      await buildPackage(packagePath, distRegistry, true);
      console.log(green(`Rebuild of package in ${packagePath} completed successfully.`));
    } catch (err) {
      console.error(red(`Rebuild of package in ${packagePath} failed:\n`), err);
    }
  });
  console.log(`Watching for changes in ${pathToRegistry}...`);
}

export async function buildAllPackagesInRegistry(
  pathToRegistry: string,
  distRegistry: DistRegistry,
  overrideExisting = false,
) {
  const packages = await fsp.readdir(pathToRegistry, { withFileTypes: true });
  for await (const dirent of packages) {
    if (
      dirent.isDirectory() &&
      !folderIgnoreListGlobe.some((ignore) =>
        typeof ignore === 'string' ? ignore === dirent.name : ignore.test(dirent.name),
      )
    ) {
      const packagePath = path.join(pathToRegistry, dirent.name);

      // Handle scoped/namespaced packages (e.g., @types/jaculus)
      if (dirent.name.startsWith('@')) {
        // This is a namespace folder, iterate through its subdirectories
        const scopedPackages = await fsp.readdir(packagePath, { withFileTypes: true });
        for await (const scopedDirent of scopedPackages) {
          if (
            scopedDirent.isDirectory() &&
            !folderIgnoreListGlobe.some((ignore) =>
              typeof ignore === 'string' ? ignore === scopedDirent.name : ignore.test(scopedDirent.name),
            )
          ) {
            const scopedPackagePath = path.join(packagePath, scopedDirent.name);
            console.log(`Building scoped package in ${scopedPackagePath}`);
            await buildPackage(scopedPackagePath, distRegistry, overrideExisting);
          }
        }
      } else {
        console.log(`Building package in ${packagePath}`);
        await buildPackage(packagePath, distRegistry, overrideExisting);
      }
    }
  }
}
