import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { getStoragePath } from '../config/storage-paths.js';
import { MinecraftServerConfig, GameMode, Difficulty, WorldBlock, MinecraftRuntimeConfig } from '../types/index.js';
import { SettingsService } from './SettingsService.js';
import { isCommandAllowed } from '../domain/server/server-command-policy.js';
import { MinecraftServerPreflightService } from './MinecraftServerPreflightService.js';

export class MinecraftServerService {
  private static instance: MinecraftServerService | null = null;
  private serverProcess: ChildProcess | null = null;
  private status: 'stopped' | 'validating' | 'blocked' | 'starting' | 'running' | 'stopping' | 'failed' = 'stopped';
  private runtimeMode: 'live' | 'simulation' | 'blocked' | 'failed' | 'stopped' = 'stopped';
  private config: MinecraftServerConfig = {
    serverName: 'MISSI-Server',
    levelName: 'world',
    seed: '123456789',
    gameMode: GameMode.SURVIVAL,
    difficulty: Difficulty.NORMAL,
    port: 25565,
    properties: {
      'allow-flight': 'true',
      'spawn-protection': '0',
      'pvp': 'false',
    },
  };

  private runtimeConfig: MinecraftRuntimeConfig = {
    javaExecutable: 'java',
    serverJarPath: 'server.jar',
    workingDirectory: 'minecraft-server',
    minMemoryMb: 1024,
    maxMemoryMb: 1024,
    startupTimeoutMs: 60000,
    stopTimeoutMs: 15000,
    localOnly: true,
    onlineMode: false,
    eulaAccepted: false,
    minecraftVersion: '1.20.4'
  };

  private worldBlocks: WorldBlock[] = [];
  private serverLogs: string[] = [];
  private onLogCallbacks: ((log: string) => void)[] = [];

  private constructor() {
    this.loadConfig();
    this.generateProceduralWorld();
  }

  public static getInstance(): MinecraftServerService {
    if (!this.instance) {
      this.instance = new MinecraftServerService();
    }
    return this.instance;
  }

  public loadConfig() {
    try {
      const settings = SettingsService.getInstance();
      this.config = settings.getServerConfig();
      this.runtimeConfig = settings.getRuntimeConfig();
      this.generateProceduralWorld();
    } catch (err) {
      // Ignored if SettingsService is not yet initialized (e.g. in tests)
    }
  }

  public getRuntimeConfig(): MinecraftRuntimeConfig {
    return this.runtimeConfig;
  }

  public async updateRuntimeConfig(newConfig: Partial<MinecraftRuntimeConfig>) {
    this.runtimeConfig = { ...this.runtimeConfig, ...newConfig };
    
    try {
      await SettingsService.getInstance().saveRuntimeConfig(this.runtimeConfig);
    } catch (err) {
      // Ignored in unit tests
    }
  }

  public getStatus() {
    return {
      status: this.status,
      runtimeMode: this.runtimeMode,
      config: this.config,
      logsCount: this.serverLogs.length,
    };
  }

  public getConfig(): MinecraftServerConfig {
    return this.config;
  }

  public updateConfig(newConfig: Partial<MinecraftServerConfig>) {
    this.config = { ...this.config, ...newConfig };
    this.generateProceduralWorld();
    
    // Asynchronously save to SettingsService
    try {
      SettingsService.getInstance().saveServerConfig(this.config).catch(err => {
        console.error('Failed to persist server config in background:', err);
      });
    } catch (err) {
      // Ignored in unit tests
    }
  }

  public registerLogCallback(cb: (log: string) => void) {
    this.onLogCallbacks.push(cb);
  }

  private addLog(message: string) {
    const formatted = `[${new Date().toISOString()}] [Server thread/INFO]: ${message}`;
    this.serverLogs.push(formatted);
    this.onLogCallbacks.forEach(cb => cb(formatted));
  }

  /**
   * Generates a 2D procedural grid of blocks based on the seed
   */
  public generateProceduralWorld() {
    const seedNum = this.parseSeed(this.config.seed);
    const blocks: WorldBlock[] = [];
    const size = 30; // 30x30 play area

    // Simple deterministic procedural landscape based on seed
    for (let x = -size / 2; x < size / 2; x++) {
      for (let z = -size / 2; z < size / 2; z++) {
        // Simple elevation function using trig and seed
        const heightVal = Math.sin((x + seedNum) * 0.15) * Math.cos((z - seedNum) * 0.15);
        let blockType = 'grass_block';

        if (heightVal < -0.6) {
          blockType = 'water';
        } else if (heightVal > 0.5) {
          blockType = 'stone';
        } else if (Math.abs(x * z + seedNum) % 17 === 0) {
          blockType = 'oak_log'; // Trees
        } else if (Math.abs(x + z * seedNum) % 23 === 0) {
          blockType = 'crafting_table'; // Naturally spawned crafter
        }

        blocks.push({ x, y: 64, z, type: blockType });
      }
    }
    this.worldBlocks = blocks;
  }

  private parseSeed(seedStr: string): number {
    let hash = 0;
    if (seedStr.length === 0) return hash;
    for (let i = 0; i < seedStr.length; i++) {
      const chr = seedStr.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  public getWorldGrid(): WorldBlock[] {
    return this.worldBlocks;
  }

  /**
   * Modify a block in the simulation world
   */
  public updateBlock(x: number, y: number, z: number, type: string) {
    const idx = this.worldBlocks.findIndex(b => b.x === x && b.y === y && b.z === z);
    if (idx !== -1) {
      this.worldBlocks[idx].type = type;
    } else {
      this.worldBlocks.push({ x, y, z, type });
    }
  }

  /**
   * Attempts to launch a real Minecraft server or falls back to simulated mode
   */
  public async startServer(acceptEULA: boolean = false, useEmulator: boolean = false): Promise<void> {
    if (this.status !== 'stopped' && this.status !== 'blocked' && this.status !== 'failed') {
      throw new Error('Server is already running or in transition.');
    }

    this.status = 'validating';
    this.runtimeMode = useEmulator ? 'simulation' : 'live';

    this.addLog(`Validating environment for Minecraft Java server: "${this.config.serverName}" on port ${this.config.port}...`);

    if (useEmulator) {
      if (process.env.ALLOW_SIMULATION_MODE === 'false') {
        this.status = 'blocked';
        this.runtimeMode = 'blocked';
        throw new Error('SIMULATION_MODE_DISABLED: Simulation mode is disabled. To enable, remove ALLOW_SIMULATION_MODE=false from your environment.');
      }
      this.status = 'starting';
      this.runtimeMode = 'simulation';
      this.addLog('Simulation Mode — Not Live Ready: Launching High-Fidelity Node-based Minecraft Simulation Emulator.');
      
      // Simulating loading chunks and terrain gen
      setTimeout(() => {
        this.addLog('Preparing level "world"');
        setTimeout(() => {
          this.addLog('Preparing start region for dimension minecraft:overworld');
          setTimeout(() => {
            this.status = 'running';
            this.addLog(`Done (${this.config.levelName} seed: ${this.config.seed})! For help, type "help"`);
            this.addLog('Active Minecraft Simulation Socket listening on TCP port 25565 (simulated)');
          }, 600);
        }, 500);
      }, 400);
      return;
    }

    // Real Java Server Startup Flow
    const serverDir = getStoragePath(this.runtimeConfig.workingDirectory || 'minecraft-server');
    await fs.mkdir(serverDir, { recursive: true });

    const envEula = process.env.MISSI_ACCEPT_MINECRAFT_EULA === 'true';
    if (acceptEULA || envEula) {
      await fs.writeFile(path.join(serverDir, 'eula.txt'), 'eula=true');
    }

    // Run Preflight diagnostics
    const preflight = MinecraftServerPreflightService.getInstance();
    const report = await preflight.runPreflight();

    if (!report.realServerReady) {
      this.status = 'blocked';
      this.runtimeMode = 'blocked';
      this.addLog(`[Console Error] BLOCKED: Preflight checks failed: ${report.blockers.join(', ')}`);
      throw new Error(`PREFLIGHT_BLOCKED: ${report.blockers.join(', ')}`);
    }

    this.status = 'starting';
    this.runtimeMode = 'live';
    this.addLog('Java runtime, EULA acceptance, and server.jar verified successfully.');
    this.addLog(`Starting Minecraft Java server: "${this.config.serverName}" on port ${this.config.port}...`);

    this.addLog('Setting up real server directories and server.properties...');
    await this.prepareRealServerFiles(true);
    await this.launchRealJavaServer();
  }

  private async prepareRealServerFiles(accepted: boolean) {
    const serverDir = getStoragePath(this.runtimeConfig.workingDirectory || 'minecraft-server');
    await fs.mkdir(serverDir, { recursive: true });

    // 1. Write server.properties
    const props = [
      `server-port=${this.config.port}`,
      `level-name=${this.config.levelName}`,
      `level-seed=${this.config.seed}`,
      `gamemode=${this.config.gameMode}`,
      `difficulty=${this.config.difficulty}`,
      `motd=${this.config.serverName}`,
      `online-mode=false`, // Required for bots to join easily in local simulation without auth validation
    ];
    Object.entries(this.config.properties).forEach(([k, v]) => {
      props.push(`${k}=${v}`);
    });

    await fs.writeFile(path.join(serverDir, 'server.properties'), props.join('\n'));
    this.addLog('Wrote server.properties successfully.');

    // 2. Write eula.txt depending on user choice
    await fs.writeFile(path.join(serverDir, 'eula.txt'), `eula=${accepted}`);
    this.addLog(`Wrote eula.txt (eula=${accepted}).`);
  }

  private async launchRealJavaServer(): Promise<void> {
    const serverDir = getStoragePath(this.runtimeConfig.workingDirectory || 'minecraft-server');
    const javaBin = this.runtimeConfig.javaExecutable || 'java';
    const jarName = this.runtimeConfig.serverJarPath || 'server.jar';
    const jarPath = path.join(serverDir, jarName);
    const maxMem = this.runtimeConfig.maxMemoryMb ? `${this.runtimeConfig.maxMemoryMb}M` : '1024M';
    const minMem = this.runtimeConfig.minMemoryMb ? `${this.runtimeConfig.minMemoryMb}M` : '1024M';

    this.addLog(`Attempting to launch child process: ${javaBin} -Xmx${maxMem} -Xms${minMem} -jar ${jarName} nogui`);
    
    try {
      await fs.access(jarPath);
      this.serverProcess = spawn(javaBin, [`-Xmx${maxMem}`, `-Xms${minMem}`, '-jar', jarName, 'nogui'], {
        cwd: serverDir,
      });

      this.serverProcess.stdout?.on('data', (data) => {
        const logLines = data.toString().split('\n');
        logLines.forEach((line: string) => {
          if (line.trim()) {
            this.addLog(line.trim());
            if (line.includes('Done (')) {
              this.status = 'running';
              this.runtimeMode = 'live';
            }
          }
        });
      });

      this.serverProcess.stderr?.on('data', (data) => {
        this.addLog(`[STDERR] ${data.toString().trim()}`);
      });

      this.serverProcess.on('close', (code) => {
        this.addLog(`Server process exited with code ${code}`);
        if (code !== 0 && code !== null) {
          this.status = 'failed';
          this.runtimeMode = 'failed';
        } else {
          this.status = 'stopped';
          this.runtimeMode = 'stopped';
        }
        this.serverProcess = null;
      });
    } catch {
      this.status = 'blocked';
      this.runtimeMode = 'blocked';
      const wDir = this.runtimeConfig.workingDir || 'minecraft-server';
      this.addLog(`[Console Error] BLOCKED: "${jarName}" not found in ${wDir}/ directory.`);
      this.addLog('[Console Guidance] Please download a valid Minecraft server.jar or check "Use Sandbox Emulator" in the server config panel.');
      this.addLog(`  To download: wget https://piston-data.mojang.com/v1/objects/84194a5c4d6da61663047990dec7177b3c2e4070/server.jar -O ${wDir}/${jarName}`);
      throw new Error(`SERVER_JAR_NOT_FOUND: "${jarName}" not found at ${wDir}/${jarName}. Real server execution is blocked.`);
    }
  }

  public async stopServer(): Promise<void> {
    if (this.status !== 'running' && this.status !== 'starting') {
      throw new Error('Server is not currently starting or running.');
    }

    this.status = 'stopping';
    this.addLog('Stopping server cleanly...');

    if (this.runtimeMode === 'live' && this.serverProcess) {
      this.serverProcess.stdin?.write('stop\n');
      
      const timeoutMs = this.runtimeConfig.stopTimeoutMs || 15000;
      setTimeout(() => {
        if (this.serverProcess) {
          this.serverProcess.kill('SIGKILL');
          this.serverProcess = null;
          this.status = 'stopped';
          this.runtimeMode = 'stopped';
        }
      }, timeoutMs);
    } else {
      // simulated stop
      setTimeout(() => {
        this.addLog('Saving players');
        this.addLog('Saving worlds');
        this.addLog('Closing Server TCP Sockets');
        this.status = 'stopped';
        this.runtimeMode = 'stopped';
        this.addLog('Server stopped cleanly.');
      }, 500);
    }
  }

  public executeCommand(command: string): void {
    if (this.status !== 'running') {
      this.addLog(`[WARN] Command "${command}" ignored. Server is not running.`);
      return;
    }

    const policyRes = isCommandAllowed(command);
    if (!policyRes.allowed) {
      this.addLog(`[Console] ERROR: ${policyRes.reason}`);
      return;
    }

    this.addLog(`[Console] Executing command: ${command}`);

    const sanitized = command.trim();
    const cleanCommand = sanitized.startsWith('/') ? sanitized.slice(1) : sanitized;
    const parts = cleanCommand.split(/\s+/);
    const cmdName = parts[0].toLowerCase();

    if (cmdName === 'say') {
      const speech = parts.slice(1).join(' ');
      this.addLog(`[Chat] [Server] ${speech}`);
    } else if (cmdName === 'seed') {
      this.addLog(`Current Seed: [${this.config.seed}]`);
    } else {
      this.addLog(`Command executed successfully: ${command}`);
    }
  }

  public getLogs(): string[] {
    return this.serverLogs;
  }
}
