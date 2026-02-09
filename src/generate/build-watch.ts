import fs, { promises as fsp } from 'fs';
import { blue, green, red, yellow } from 'ansis';
import path from 'path';
import { loadPackageJson } from '@jaculus/project';
import { DistRegistry } from '../localRegistry.js';
import { buildCopyHelper, copyTemplateHelper } from './build-utils.js';

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

async function buildCopyPackage(
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

  if (pkg.jaculus?.template) {
    await copyTemplateHelper(pathToPackage, distRegistry, pkg);
  } else {
    await buildCopyHelper(pathToPackage, distRegistry, pkg);
  }



  // register new version in dist registry and save updates
  await distRegistry.addPackageVersion(pkg.name, pkg.version, pkg.jaculus?.projectType, pkg.jaculus?.template);
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
      await buildCopyPackage(packagePath, distRegistry, true);
      console.log(green(`Rebuild of package in ${packagePath} completed successfully.`));
    } catch (err) {
      console.error(red(`Rebuild of package in ${packagePath} failed:\n`), err);
    }
  });
  console.log(`Watching for changes in ${pathToRegistry}...`);
}

function isIgnored(name: string) {
  return folderIgnoreListGlobe.some((ignore) =>
    typeof ignore === 'string' ? ignore === name : ignore.test(name),
  );
}

export async function buildAllPackagesInRegistry(
  pathToRegistry: string,
  distRegistry: DistRegistry,
  overrideExisting = false,
) {
  const packages = await fsp.readdir(pathToRegistry, { withFileTypes: true });
  for await (const dirent of packages) {
    if (dirent.isDirectory() && !isIgnored(dirent.name)) {
      const packagePath = path.join(pathToRegistry, dirent.name);

      // Handle scoped/namespaced packages (e.g., @types/jaculus)
      if (dirent.name.startsWith('@')) {
        // This is a namespace folder, iterate through its subdirectories
        const scopedPackages = await fsp.readdir(packagePath, { withFileTypes: true });
        for await (const scopedDirent of scopedPackages) {
          if (scopedDirent.isDirectory() && !isIgnored(scopedDirent.name)) {
            const scopedPackagePath = path.join(packagePath, scopedDirent.name);
            console.log(`Building scoped package in ${scopedPackagePath}`);
            await buildCopyPackage(scopedPackagePath, distRegistry, overrideExisting);
          }
        }
      } else {
        console.log(`Building package in ${packagePath}`);
        await buildCopyPackage(packagePath, distRegistry, overrideExisting);
      }
    }
  }
}
