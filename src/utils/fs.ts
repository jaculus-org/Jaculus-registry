import fs from 'fs';
import path from 'path';
import { promises as fsp } from 'fs';

export async function copyDirectory(src: string, dest: string) {
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
