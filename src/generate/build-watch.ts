import fs, { promises as fsp } from 'fs';
import { blue, green, red, yellow } from 'ansis';
import path from 'path';
import { DistRegistry } from '../localRegistry.js';
import {
  buildCopyHelper,
  copyTemplateHelper,
  transpileCopyHelper,
  fullBuildCopyHelper,
  installJacPackageDeps,
} from './build-utils.js';
import { loadPackageJson } from '@jaculus/project/package';

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
  await distRegistry.addPackageVersion(
    pkg.name,
    pkg.version,
    pkg.jaculus?.projectType,
    pkg.jaculus?.template,
  );
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

async function collectPackagePaths(pathToRegistry: string): Promise<string[]> {
  const packages = await fsp.readdir(pathToRegistry, { withFileTypes: true });
  const packagePaths: string[] = [];
  for (const dirent of packages) {
    if (!dirent.isDirectory() || isIgnored(dirent.name)) continue;
    const packagePath = path.join(pathToRegistry, dirent.name);
    if (dirent.name.startsWith('@')) {
      const scopedPackages = await fsp.readdir(packagePath, { withFileTypes: true });
      for (const scopedDirent of scopedPackages) {
        if (scopedDirent.isDirectory() && !isIgnored(scopedDirent.name)) {
          packagePaths.push(path.join(packagePath, scopedDirent.name));
        }
      }
    } else {
      packagePaths.push(packagePath);
    }
  }
  return packagePaths;
}

export async function buildAllPackagesInRegistry(
  pathToRegistry: string,
  distRegistry: DistRegistry,
  overrideExisting = false,
) {
  const packagePaths = await collectPackagePaths(pathToRegistry);

  // Collect pkg metadata for each path
  const packages = await Promise.all(
    packagePaths.map(async (pkgPath) => ({
      path: pkgPath,
      pkg: await loadPackageJson(fs, path.join(pkgPath, 'package.json')),
    })),
  );

  // Filter out already-existing versions (unless overriding)
  const toProcess = overrideExisting
    ? packages
    : packages.filter(({ pkg }) => {
        if (distRegistry.existsVersion(pkg.name, pkg.version)) {
          console.error(yellow(`Package ${pkg.name}@${pkg.version} already exists. Skipping.`));
          return false;
        }
        return true;
      });

  if (toProcess.length === 0) {
    console.log(blue('All packages already up to date.'));
    return;
  }

  // transpile and copy to dist
  console.log(blue(`Pass 1/3: Transpiling ${toProcess.length} package(s) and publishing to dist...`));
  for (const { path: pkgPath, pkg } of toProcess) {
    console.log(blue(`  Transpiling ${pkg.name}@${pkg.version} in ${pkgPath}`));
    try {
      if (pkg.jaculus?.template) {
        await copyTemplateHelper(pkgPath, distRegistry, pkg);
      } else {
        await transpileCopyHelper(pkgPath, distRegistry, pkg);
      }
      await distRegistry.addPackageVersion(pkg.name, pkg.version, pkg.jaculus?.projectType, pkg.jaculus?.template);
    } catch (err) {
      console.error(red(`  Pass 1 failed for ${pkg.name}: `), err);
      throw err;
    }
  }

  // install dependencies for all packages
  console.log(blue(`Pass 2/3: Installing dependencies for ${toProcess.length} package(s)...`));
  for (const { path: pkgPath, pkg } of toProcess) {
    if (pkg.jaculus?.template) continue; // templates have no src deps to install
    console.log(blue(`  Installing deps for ${pkg.name}@${pkg.version}`));
    try {
      await installJacPackageDeps(pkgPath, pkg);
    } catch (err) {
      console.error(red(`  Pass 2 failed for ${pkg.name}: `), err);
      throw err;
    }
  }

  // build with type checking and copy results
  console.log(blue(`Pass 3/3: Full build for ${toProcess.length} package(s)...`));
  for (const { path: pkgPath, pkg } of toProcess) {
    if (pkg.jaculus?.template) continue; // already copied in pass 1
    console.log(blue(`  Building ${pkg.name}@${pkg.version}`));
    try {
      await fullBuildCopyHelper(pkgPath, distRegistry, pkg);
    } catch (err) {
      console.error(red(`  Pass 3 failed for ${pkg.name}: `), err);
      throw err;
    }
  }

  console.log(green(`Done. ${toProcess.length} package(s) built and published.`));
}
