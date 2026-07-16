import { promises as fs } from 'fs';
import path from 'path';
import { getStoragePath } from '../config/storage-paths.js';

export class PersistenceService {
  private static instance: PersistenceService | null = null;
  private baseDir: string;

  private constructor() {
    this.baseDir = getStoragePath('data');
  }

  public static getInstance(): PersistenceService {
    if (!PersistenceService.instance) {
      PersistenceService.instance = new PersistenceService();
    }
    return PersistenceService.instance;
  }

  /**
   * Resolves and secures path, preventing path traversal
   */
  public resolvePath(subPath: string): string {
    const resolved = path.resolve(this.baseDir, subPath);
    if (!resolved.startsWith(this.baseDir)) {
      throw new Error(`Path traversal detected: ${subPath} attempts to escape sandbox.`);
    }
    return resolved;
  }

  public async ensureDirExists(resolvedPath: string): Promise<void> {
    const dir = path.dirname(resolvedPath);
    await fs.mkdir(dir, { recursive: true });
  }

  public async readJson<T>(subPath: string, defaultValue: T): Promise<T> {
    try {
      const filePath = this.resolvePath(subPath);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return defaultValue;
      }
      console.error(`Error reading persistent JSON at ${subPath}:`, err);
      return defaultValue;
    }
  }

  public async writeJson<T>(subPath: string, data: T): Promise<void> {
    const filePath = this.resolvePath(subPath);
    await this.ensureDirExists(filePath);
    
    // Atomic write pattern: write to temp file then rename
    const tempPath = `${filePath}.${Math.random().toString(36).substring(2)}.tmp`;
    try {
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      await fs.rename(tempPath, filePath);
    } catch (err) {
      // Clean up temp file on failure
      try {
        await fs.unlink(tempPath);
      } catch {}
      throw err;
    }
  }

  public async deleteFile(subPath: string): Promise<void> {
    try {
      const filePath = this.resolvePath(subPath);
      await fs.unlink(filePath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  public async listDirectoryFiles(subDir: string): Promise<string[]> {
    try {
      const dirPath = path.resolve(this.baseDir, subDir);
      if (!dirPath.startsWith(this.baseDir)) {
        throw new Error(`Path traversal detected: ${subDir} attempts to escape sandbox.`);
      }
      const files = await fs.readdir(dirPath);
      return files;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }
}
