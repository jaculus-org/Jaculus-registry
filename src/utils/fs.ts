import fs from 'fs';
import path from 'path';
import { promises as fsp } from 'fs';

export async function copyDirectory(src: string, dest: string, skipIfNotExists = false) {
  if (skipIfNotExists && !fs.existsSync(src)) return;
  await fsp.mkdir(dest, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await fsp.mkdir(destPath, { recursive: true });
      await copyDirectory(srcPath, destPath);
    } else {
      await fsp.copyFile(srcPath, destPath);
    }
  }
}

export async function copyFile(
  fileName: string,
  sourceDir: string,
  destDir: string,
  skipIfNotExists = false,
) {
  const srcPath = path.join(sourceDir, fileName);
  const destPath = path.join(destDir, fileName);

  if (skipIfNotExists && !fs.existsSync(srcPath)) {
    return;
  }
  await fsp.copyFile(srcPath, destPath);
}

export async function writeFile(pathToFile: string, data: string) {
  const dir = path.dirname(pathToFile);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(pathToFile, data, 'utf-8').catch((err) => {
    throw new Error(`Failed to write file at ${pathToFile}: ${err}`);
  });
}

export async function writeJSONFile(pathToFile: string, data: object) {
  const dir = path.dirname(pathToFile);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(pathToFile, JSON.stringify(data, null, 2), 'utf-8').catch((err) => {
    throw new Error(`Failed to write JSON file at ${pathToFile}: ${err}`);
  });
}
