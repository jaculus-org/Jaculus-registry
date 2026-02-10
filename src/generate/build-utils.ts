import fs, { promises as fsp } from 'fs';
import { blue, green } from 'ansis';
import path from 'path';
import { spawn } from 'child_process';
import os from 'os';
import * as tar from 'tar';
import { copyDirectory, writeJSONFile } from '../utils/fs.js';
import { copyFile } from '../utils/fs.js';
import { loadPackageJson, PackageJson } from '@jaculus/project';
import { DistRegistry } from '../localRegistry.js';

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

    // Copy required directories and files
    await copyDirectory(path.join(pathToPackage, 'src'), path.join(packageDir, 'src'), true);
    await copyFile('package.json', pathToPackage, packageDir);
    await resolvePackageJsonWorkspace('package.json', packageDir);
    await copyFile('tsconfig.json', pathToPackage, packageDir);
    await copyFile('README.md', pathToPackage, packageDir, true);

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
  await buildJacPackage(pathToPackage);
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

async function buildJacPackage(pathToPackage: string) {
  if (fs.existsSync(path.join(pathToPackage, 'src'))) {
    await runCommand(pathToPackage, 'pnpm', ['install']);
    await runCommand(pathToPackage, 'pnpm', ['run', 'build']);
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
    console.log(`Wr: ${path.join(pathToRegistry, 'dist')}`);

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
