import * as tar from 'tar';

export function extractTarGz(pathToTarGz: string, destinationPath: string): Promise<void> {
  return tar.extract({
    file: pathToTarGz,
    cwd: destinationPath,
    gzip: true,
  });
}
