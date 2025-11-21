import * as tar from 'tar';
import path from 'path';
import fs, { promises as fsp } from 'fs';
import { red } from 'ansis';

export function extractTarGz(pathToTarGz: string, destinationPath: string): Promise<void> {
  return tar.extract({
    file: pathToTarGz,
    cwd: destinationPath,
    gzip: true,
  });
}

export async function extractPackageAtVersion(
  registryDestPath: string,
  packageName: string,
  version: string,
  destinationPath: string,
) {
  const packageTarGzPath = path.join(registryDestPath, packageName, version, 'package.tar.gz');
  if (!fs.existsSync(packageTarGzPath)) {
    throw new Error(
      red(`Package tar.gz for ${packageName}@${version} does not exist at ${packageTarGzPath}`),
    );
  }
  await fsp.mkdir(destinationPath, { recursive: true });
  return extractTarGz(packageTarGzPath, destinationPath);
}
