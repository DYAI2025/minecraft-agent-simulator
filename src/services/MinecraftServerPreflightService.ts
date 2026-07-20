import { promises as fs } from 'fs';
import path from 'path';
import { getStoragePath, getStorageRoot } from '../config/storage-paths.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { SettingsService } from './SettingsService.js';
import https from 'https';

const execFileAsync = promisify(execFile);

// Official Mojang server.jar download URL for 1.20.4
const SERVER_JAR_URL = 'https://piston-data.mojang.com/v1/objects/8dd1a28015f51b1803213892b50b7b4fc76e594d/server.jar';
const SERVER_JAR_SHA256 = '8dd1a28015f51b1803213892b50b7b4fc76e594d';

export interface PreflightCheck {
  id: string;
  status: 'passed' | 'failed';
  message: string;
}

export interface PreflightReport {
  realServerReady: boolean;
  simulationAvailable: boolean;
  checks: PreflightCheck[];
  blockers: string[];
  warnings: string[];
  // Legacy fields to not immediately break ServerConfigCard.tsx before we update it
  javaAvailable?: boolean;
  eulaAccepted?: boolean;
  jarExists?: boolean;
  issues?: string[];
  status?: 'ready' | 'blocked';
  ready?: boolean;
}

export class MinecraftServerPreflightService {
  private static instance: MinecraftServerPreflightService | null = null;

  private constructor() {}

  public static getInstance(): MinecraftServerPreflightService {
    if (!this.instance) {
      this.instance = new MinecraftServerPreflightService();
    }
    return this.instance;
  }

  public async runPreflight(): Promise<PreflightReport> {
    const checks: PreflightCheck[] = [];
    const blockers: string[] = [];
    const warnings: string[] = [];

    let javaBin = 'java';
    let jarName = 'server.jar';
    let workingDirName = 'minecraft-server';
    let minMem = 1024;
    let maxMem = 1024;
    let eulaConfigured = false;
    let useEmulator = false;

    try {
      const settings = SettingsService.getInstance();
      const runConfig = settings.getRuntimeConfig();
      if (runConfig) {
        if (runConfig.javaExecutable) javaBin = runConfig.javaExecutable;
        if (runConfig.serverJarPath) jarName = runConfig.serverJarPath;
        if (runConfig.workingDirectory) workingDirName = runConfig.workingDirectory;
        if (runConfig.minMemoryMb) minMem = runConfig.minMemoryMb;
        if (runConfig.maxMemoryMb) maxMem = runConfig.maxMemoryMb;
        if (runConfig.eulaAccepted) eulaConfigured = runConfig.eulaAccepted;
        if (runConfig.useEmulator) useEmulator = runConfig.useEmulator;
      }
    } catch {
      // Ignored
    }

    // 1. Storage Root
    try {
      const storageRoot = getStorageRoot();
      const testFile = path.join(storageRoot, '.preflight-test');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
      checks.push({ id: 'storage_root', status: 'passed', message: 'Storage root is writable.' });
    } catch (err: any) {
      checks.push({ id: 'storage_root', status: 'failed', message: `Storage root is not writable: ${err.message}` });
      blockers.push('storage_root');
    }

    // 2. Working Directory
    const serverDir = getStoragePath(workingDirName);
    try {
      await fs.mkdir(serverDir, { recursive: true });
      const testFile = path.join(serverDir, '.preflight-test');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
      checks.push({ id: 'working_directory', status: 'passed', message: 'Working directory exists and is writable.' });
    } catch (err: any) {
      checks.push({ id: 'working_directory', status: 'failed', message: `Working directory is not writable: ${err.message}` });
      blockers.push('working_directory');
    }

    // 3. Java
    try {
      await execFileAsync(javaBin, ['-version']);
      checks.push({ id: 'java', status: 'passed', message: `Java executable found: ${javaBin}` });
    } catch (err: any) {
      checks.push({ id: 'java', status: 'failed', message: `Java executable not found or failed: ${err.message}` });
      blockers.push('java');
    }

    // 4. Server JAR
    const jarPath = path.join(serverDir, jarName);
    let jarDownloaded = false;
    try {
      await fs.access(jarPath, fs.constants.R_OK);
      checks.push({ id: 'server_jar', status: 'passed', message: `Server JAR found and readable: ${jarName}` });
    } catch (err: any) {
      // Check if auto-download is enabled via environment variable
      const autoDownload = process.env.MISSI_AUTO_DOWNLOAD_SERVER_JAR === 'true';
      if (autoDownload) {
        checks.push({ id: 'server_jar', status: 'passed', message: `Server JAR not found, attempting auto-download...` });
        try {
          await this.downloadServerJar(jarPath);
          jarDownloaded = true;
          checks.push({ id: 'server_jar', status: 'passed', message: `Server JAR downloaded successfully: ${jarName}` });
        } catch (downloadErr: any) {
          checks.push({ id: 'server_jar', status: 'failed', message: `Auto-download failed: ${downloadErr.message}. To enable, set MISSI_AUTO_DOWNLOAD_SERVER_JAR=true` });
          blockers.push('server_jar');
        }
      } else {
        checks.push({ id: 'server_jar', status: 'failed', message: `Configured server JAR was not found or is not readable: ${jarName}. Set MISSI_AUTO_DOWNLOAD_SERVER_JAR=true to enable auto-download.` });
        blockers.push('server_jar');
      }
    }

    // 5. Memory
    if (minMem > maxMem) {
      checks.push({ id: 'memory', status: 'failed', message: 'minMemoryMb cannot be greater than maxMemoryMb' });
      blockers.push('memory');
    } else {
      checks.push({ id: 'memory', status: 'passed', message: 'Memory settings are valid.' });
    }

    // 6. EULA
    const eulaPath = path.join(serverDir, 'eula.txt');
    try {
      const content = await fs.readFile(eulaPath, 'utf-8');
      if (content.includes('eula=true')) {
        checks.push({ id: 'eula', status: 'passed', message: 'EULA accepted in eula.txt.' });
      } else {
        if (eulaConfigured) {
          checks.push({ id: 'eula', status: 'passed', message: 'EULA accepted via config, will be written on start.' });
        } else {
          checks.push({ id: 'eula', status: 'failed', message: 'Minecraft EULA has not been accepted.' });
          blockers.push('eula');
        }
      }
    } catch {
      if (eulaConfigured) {
        checks.push({ id: 'eula', status: 'passed', message: 'EULA accepted via config, will be written on start.' });
      } else {
        checks.push({ id: 'eula', status: 'failed', message: 'Minecraft EULA has not been accepted (eula.txt missing).' });
        blockers.push('eula');
      }
    }

    // 7. online-mode=false validation (critical for bot connections)
    const serverPropertiesPath = path.join(serverDir, 'server.properties');
    try {
      const propsContent = await fs.readFile(serverPropertiesPath, 'utf-8');
      if (propsContent.includes('online-mode=false')) {
        checks.push({ id: 'online_mode', status: 'passed', message: 'online-mode=false configured (required for offline/bot connections).' });
      } else {
        // Auto-write online-mode=false to server.properties
        await this.ensureOnlineModeFalse(serverPropertiesPath);
        checks.push({ id: 'online_mode', status: 'passed', message: 'online-mode=false auto-configured in server.properties.' });
        warnings.push('online-mode=false was missing and has been automatically added to server.properties for bot compatibility.');
      }
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // server.properties doesn't exist yet - will be created on start with online-mode=false
        checks.push({ id: 'online_mode', status: 'passed', message: 'server.properties will be created with online-mode=false on server start.' });
      } else {
        checks.push({ id: 'online_mode', status: 'failed', message: `Could not read server.properties: ${err.message}` });
        blockers.push('online_mode');
      }
    }

    // Railway Deployment Warnings
    if (!process.env.MISSI_STORAGE_ROOT) {
      warnings.push('Running without MISSI_STORAGE_ROOT environment variable. If deployed on Railway, volume data may not persist.');
    }

    const realServerReady = blockers.length === 0;

    return {
      realServerReady,
      simulationAvailable: true,
      checks,
      blockers,
      warnings,
      // legacy fields
      javaAvailable: !blockers.includes('java'),
      eulaAccepted: !blockers.includes('eula'),
      jarExists: !blockers.includes('server_jar'),
      issues: checks.filter(c => c.status === 'failed').map(c => c.message),
      status: realServerReady ? 'ready' : 'blocked',
      ready: realServerReady
    };
  }

  private async ensureOnlineModeFalse(serverPropertiesPath: string): Promise<void> {
    let content = '';
    try {
      content = await fs.readFile(serverPropertiesPath, 'utf-8');
    } catch {
      content = '';
    }
    
    const lines = content.split('\n');
    const filtered = lines.filter(line => !line.trim().startsWith('online-mode='));
    filtered.push('online-mode=false');
    
    await fs.writeFile(serverPropertiesPath, filtered.join('\n'));
  }

  private async downloadServerJar(jarPath: string): Promise<void> {
    const jarUrl = 'https://piston-data.mojang.com/v1/objects/8dd1a28015f51b1803213892b50b7b4fc76e594d/server.jar';
    const https = await import('https');
    const { createWriteStream } = await import('fs');
    
    return new Promise((resolve, reject) => {
      const file = createWriteStream(jarPath);
      https.default.get(jarUrl, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download server.jar: HTTP ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
        file.on('error', (err) => {
          fs.unlink(jarPath).catch(() => {});
          reject(err);
        });
      }).on('error', (err) => {
        fs.unlink(jarPath).catch(() => {});
        reject(err);
      });
    });
  }
}
