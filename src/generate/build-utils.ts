import fs, { promises as fsp } from 'fs';
import { blue, green } from 'ansis';
import path from 'path';
import { spawn } from 'child_process';
import os from 'os';
import * as tar from 'tar';
import { minimatch } from 'minimatch';
import { copyDirectory, writeJSONFile } from '../utils/fs.js';
import { copyFile } from '../utils/fs.js';
import { DistRegistry } from '../localRegistry.js';
import { PackageJson, loadPackageJson } from '@jaculus/project/package';

const IGNORED_PACKAGE_DIRS = new Set(['node_modules', '.git']);

function getBlocksDir(pkg: PackageJson): string | null {
  return pkg.jaculus?.blocks ?? 'blocks';
}

function matchesPackageFilesPattern(relPath: string, patterns: string[]): boolean {
  const normalizedRelPath = relPath.replace(/\\/g, '/');

  for (const pattern of patterns) {
    const posixPattern = pattern.replace(/\\/g, '/').replace(/^\.\//, '');
    const cleanPattern = posixPattern.replace(/\/$/, '');

    if (
      minimatch(normalizedRelPath, posixPattern) ||
      minimatch(normalizedRelPath, `${cleanPattern}/**`)
    ) {
      return true;
    }
  }

  return false;
}

async function copyMatchedPackageFiles(
  sourceDir: string,
  targetDir: string,
  patterns: string[],
  currentDir = sourceDir,
) {
  if (patterns.length === 0 || !fs.existsSync(currentDir)) {
    return;
  }

  const entries = await fsp.readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_PACKAGE_DIRS.has(entry.name)) {
      continue;
    }

    const sourcePath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      await copyMatchedPackageFiles(sourceDir, targetDir, patterns, sourcePath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const relPath = path.relative(sourceDir, sourcePath).replace(/\\/g, '/');
    if (!matchesPackageFilesPattern(relPath, patterns)) {
      continue;
    }

    const destinationPath = path.join(targetDir, relPath);
    await fsp.mkdir(path.dirname(destinationPath), { recursive: true });
    await fsp.copyFile(sourcePath, destinationPath);
  }
}

async function copyDefaultPackageFiles(
  pathToPackage: string,
  packageDir: string,
  pkg: PackageJson,
) {
  await copyFile('package.json', pathToPackage, packageDir);
  await copyFile('README.md', pathToPackage, packageDir, true);
  await copyFile('tsconfig.json', pathToPackage, packageDir, true);
  await copyFile('.gitignore', pathToPackage, packageDir, true);

  const blocksDir = getBlocksDir(pkg);
  if (blocksDir) {
    await copyDirectory(
      path.join(pathToPackage, blocksDir),
      path.join(packageDir, blocksDir),
      true,
    );
    await validateBlocksDirectory(path.join(packageDir, blocksDir));
  }

  await resolvePackageJsonWorkspace('package.json', packageDir);
}

async function copyPackageFilesFromManifest(
  pathToPackage: string,
  packageDir: string,
  pkg: PackageJson,
) {
  const filesArray = pkg.files ?? [];
  await copyMatchedPackageFiles(pathToPackage, packageDir, filesArray);
}

export async function copyTemplateHelper(
  pathToPackage: string,
  distRegistry: DistRegistry,
  pkg: PackageJson,
) {
  const pathToOutputRegistryVer = path.join(distRegistry.getOutputPath(), pkg.name, pkg.version);
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'registry-copy-'));
  try {
    // Create package structure in temp directory
    const packageDir = path.join(tempDir, 'package');
    await fsp.mkdir(packageDir, { recursive: true });

    await copyPackageFilesFromManifest(pathToPackage, packageDir, pkg);
    await copyDefaultPackageFiles(pathToPackage, packageDir, pkg);

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
  } finally {
    // Clean up temp directory
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
}

export async function buildCopyHelper(
  pathToPackage: string,
  distRegistry: DistRegistry,
  pkg: PackageJson,
) {
  await buildJacPackage(pathToPackage, pkg);
  await copyBuiltPackagesToRegistryDist(
    pathToPackage,
    distRegistry.getOutputPath(),
    pkg.name,
    pkg.version,
  );
}

export async function transpileCopyHelper(
  pathToPackage: string,
  distRegistry: DistRegistry,
  pkg: PackageJson,
) {
  await transpileJacPackage(pathToPackage, pkg);
  await copyBuiltPackagesToRegistryDist(
    pathToPackage,
    distRegistry.getOutputPath(),
    pkg.name,
    pkg.version,
  );
}

export async function fullBuildCopyHelper(
  pathToPackage: string,
  distRegistry: DistRegistry,
  pkg: PackageJson,
) {
  await fullBuildJacPackage(pathToPackage, pkg);
  await copyBuiltPackagesToRegistryDist(
    pathToPackage,
    distRegistry.getOutputPath(),
    pkg.name,
    pkg.version,
  );
}

// Utils

/**
 * Build all packages in the registry located at pathToRegistry
 */
async function runCommand(pathToPackage: string, command: string, args: string[]): Promise<void> {
  console.log(blue(`Running command: ${command} ${args.join(' ')} in ${pathToPackage}`));
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: pathToPackage,
      stdio: 'inherit',
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

export async function transpileJacPackage(pathToPackage: string, pkg: PackageJson) {
  if (fs.existsSync(path.join(pathToPackage, 'src')) && pkg.scripts?.['build-no-check']) {
    await runCommand(pathToPackage, 'pnpm', ['run', 'build-no-check']);
  }
}

export async function installJacPackageDeps(pathToPackage: string, pkg: PackageJson) {
  if (pkg.scripts?.install) {
    await runCommand(pathToPackage, 'pnpm', ['run', 'install', '--user-registry', 'http://127.0.0.1:3737/']);
  }
}

export async function fullBuildJacPackage(pathToPackage: string, pkg: PackageJson) {
  if (fs.existsSync(path.join(pathToPackage, 'src')) && pkg.scripts?.build) {
    await runCommand(pathToPackage, 'pnpm', ['run', 'build']);
  }
}

async function buildJacPackage(pathToPackage: string, pkg: PackageJson) {
  await transpileJacPackage(pathToPackage, pkg);
  await installJacPackageDeps(pathToPackage, pkg);
  await fullBuildJacPackage(pathToPackage, pkg);
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

export async function validateBlocksDirectory(blocksDir: string) {
  if (!fs.existsSync(blocksDir)) {
    return;
  }
  const files = await fsp.readdir(blocksDir);
  for (const file of files) {
    if (file.endsWith('.jacly.json')) {
      const filePath = path.join(blocksDir, file);
      const content = JSON.parse(await fsp.readFile(filePath, 'utf-8'));
      const category = content.category;

      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(category)) {
        throw new Error(
          `Invalid category name: ${category}. Category must start with a letter and can only contain lowercase letters, numbers and underscores.`,
        );
      }

      const expectedFileName = `${category}.jacly.json`;
      if (file !== expectedFileName) {
        throw new Error(
          `Invalid blocks file name: ${file}. Expected file name for category "${category}" is "${expectedFileName}".`,
        );
      }
    } else if (file === 'translations') {
      const translationsDir = path.join(blocksDir, file);
      const translationFiles = await fsp.readdir(translationsDir);
      for (const translationFile of translationFiles) {
        if (!translationFile.endsWith('.lang.json')) {
          throw new Error(
            `Invalid translation file name: ${translationFile}. Expected file name to end with ".lang.json".`,
          );
        }
      }
    } else {
      throw new Error(
        `Invalid file in blocks directory: ${file}. Expected files are <category>.jacly.json or translations/<lang>.lang.json.`,
      );
    }
  }
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
    const pkg = await loadPackageJson(fs, path.join(pathToRegistry, 'package.json'));

    // Create package structure in temp directory
    const packageDir = path.join(tempDir, 'package');
    await fsp.mkdir(packageDir, { recursive: true });

    await copyPackageFilesFromManifest(pathToRegistry, packageDir, pkg);
    await copyDefaultPackageFiles(pathToRegistry, packageDir, pkg);

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
