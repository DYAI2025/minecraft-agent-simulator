import path from 'path';
import fs from 'fs';

export function getStorageRoot(): string {
  if (process.env.MISSI_STORAGE_ROOT) {
    return process.env.MISSI_STORAGE_ROOT;
  }
  return path.resolve(process.cwd());
}

export function getStoragePath(subpath: string): string {
  return path.join(getStorageRoot(), subpath);
}

export function ensureStoragePathSync(subpath: string): string {
  const fullPath = getStoragePath(subpath);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
  return fullPath;
}

export async function ensureStoragePath(subpath: string): Promise<string> {
  const fullPath = getStoragePath(subpath);
  try {
    await fs.promises.access(fullPath);
  } catch {
    await fs.promises.mkdir(fullPath, { recursive: true });
  }
  return fullPath;
}
