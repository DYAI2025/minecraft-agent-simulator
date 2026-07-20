import mineflayer from 'mineflayer';

export interface SpawnPosition {
  x: number;
  y: number;
  z: number;
}

export interface PlayerInfo {
  name: string;
  position?: { x: number; y: number; z: number };
}

export class MineflayerBotAdapter {
  private bot: any = null;
  private isConnected: boolean = false;
  private spawnPosition?: SpawnPosition;
  private onPlayerEvent?: (event: 'joined' | 'left', player: PlayerInfo) => void;

  constructor(
    private name: string,
    private host: string,
    private port: number,
    private onLog: (msg: string, isError?: boolean) => void,
    spawnPosition?: SpawnPosition,
    onPlayerEvent?: (event: 'joined' | 'left', player: PlayerInfo) => void
  ) {
    this.spawnPosition = spawnPosition;
    this.onPlayerEvent = onPlayerEvent;
  }

  public isBotConnected(): boolean {
    return this.isConnected;
  }

  public getBotPosition(): { x: number; y: number; z: number } | null {
    if (!this.bot || !this.isConnected) return null;
    const pos = this.bot.entity.position;
    return { x: pos.x, y: pos.y, z: pos.z };
  }

  public connect(): Promise<boolean> {
    let resolveRef: (value: boolean) => void;
    const promise = new Promise<boolean>((resolve) => {
      resolveRef = resolve;
    });

    try {
      this.onLog(`[Mineflayer Sockets] Initiating connection for "${this.name}" to ${this.host}:${this.port}...`);
      
      this.bot = mineflayer.createBot({
        host: this.host,
        port: this.port,
        username: this.name,
        version: '1.20.4',
        auth: 'offline',
      });

      // Set up robust event handlers to prevent unhandled node errors
      this.bot.on('login', () => {
        this.onLog(`[Mineflayer Sockets] Bot ${this.name} successfully logged in.`);
      });

      this.bot.on('spawn', () => {
        this.isConnected = true;
        this.onLog(`[Mineflayer Sockets] Bot ${this.name} spawned in world successfully at [${this.bot.entity.position.toString()}].`);
        
        // Teleport to desired spawn position if provided
        if (this.spawnPosition) {
          const { x, y, z } = this.spawnPosition;
          this.bot.entity.position.set(x, y, z);
          this.onLog(`[Mineflayer Sockets] Bot ${this.name} teleported to spawn position (${x}, ${y}, ${z}).`);
        }
        
        if (resolveRef) resolveRef(true);
      });

      this.bot.on('error', (err: any) => {
        this.onLog(`[Mineflayer Sockets Error] Bot ${this.name} connection failed: ${err.message}`, true);
        this.isConnected = false;
        if (resolveRef) resolveRef(false);
      });

      this.bot.on('kicked', (reason: string) => {
        this.onLog(`[Mineflayer Sockets] Bot ${this.name} kicked from server. Reason: ${reason}`, true);
        this.isConnected = false;
      });

      this.bot.on('end', () => {
        this.onLog(`[Mineflayer Sockets] Bot ${this.name} connection terminated.`);
        this.isConnected = false;
      });

      // Player join/leave events for context injection
      this.bot.on('playerJoined', (player: any) => {
        if (player.username !== this.name) {
          const pos = player.entity?.position ? { x: player.entity.position.x, y: player.entity.position.y, z: player.entity.position.z } : undefined;
          this.onLog(`[Mineflayer Sockets] Player joined: ${player.username} at ${pos ? JSON.stringify(pos) : 'unknown position'}`);
          if (this.onPlayerEvent) {
            this.onPlayerEvent('joined', { name: player.username, position: pos });
          }
        }
      });

      this.bot.on('playerLeft', (player: any) => {
        if (player.username !== this.name) {
          this.onLog(`[Mineflayer Sockets] Player left: ${player.username}`);
          if (this.onPlayerEvent) {
            this.onPlayerEvent('left', { name: player.username });
          }
        }
      });
    } catch (err: any) {
      this.onLog(`[Mineflayer Exception] Error establishing bot socket: ${err.message}`, true);
      this.isConnected = false;
      if (resolveRef) resolveRef(false);
    }

    return promise;
  }

  public disconnect() {
    if (this.bot) {
      try {
        this.bot.end();
      } catch {}
      this.bot = null;
    }
    this.isConnected = false;
  }

  public performAction(action: string, params: any): Promise<boolean> {
    if (!this.bot || !this.isConnected) {
      this.onLog(`[Mineflayer Warning] Bot ${this.name} is not connected. Cannot execute action: ${action}`);
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      try {
        this.onLog(`[Mineflayer Act] "${this.name}" executing real socket action: ${action} with params: ${JSON.stringify(params)}`);
        
        switch (action.toLowerCase()) {
          case 'talk':
          case 'chat': {
            const msg = params.message || 'Executing simulation directive.';
            this.bot.chat(msg);
            resolve(true);
            break;
          }
          case 'move': {
            const { x, y, z } = params;
            if (x !== undefined && z !== undefined) {
              // Use mineflayer-pathfinder for proper pathfinding
              const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
              if (!this.bot.pathfinder) {
                this.bot.loadPlugin(pathfinder);
              }
              
              const movements = new Movements(this.bot);
              this.bot.pathfinder.setMovements(movements);
              
              const goal = new goals.GoalBlock(x, y ?? this.bot.entity.position.y, z);
              this.bot.pathfinder.setGoal(goal, true);
              
              // Wait a bit for movement to start
              setTimeout(() => resolve(true), 1000);
            } else {
              resolve(true);
            }
            break;
          }
          case 'harvest': {
            const { blockType, x, y, z } = params;
            const targetPos = x !== undefined && y !== undefined && z !== undefined
              ? { x, y, z }
              : this.findNearestBlock(blockType);
            
            if (targetPos) {
              const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
              if (!this.bot.pathfinder) {
                this.bot.loadPlugin(pathfinder);
              }
              const movements = new Movements(this.bot);
              this.bot.pathfinder.setMovements(movements);
              this.bot.pathfinder.setGoal(new goals.GoalBlock(targetPos.x, targetPos.y, targetPos.z));
              
              // Wait then dig
              setTimeout(() => {
                const block = this.bot.blockAt(targetPos);
                if (block) {
                  this.bot.dig(block, (err) => {
                    if (err) this.onLog(`[Mineflayer] Dig error: ${err.message}`, true);
                    resolve(true);
                  });
                } else {
                  resolve(true);
                }
              }, 2000);
            } else {
              this.bot.chat(`No ${blockType || 'block'} found nearby to harvest`);
              resolve(true);
            }
            break;
          }
          case 'place': {
            const { blockType, x, y, z } = params;
            const referencePos = x !== undefined && y !== undefined && z !== undefined
              ? { x, y, z }
              : this.findPlacePosition(blockType);
            
            if (referencePos) {
              const block = this.bot.blockAt(referencePos);
              if (block) {
                const item = this.findItemInInventory(blockType);
                if (item) {
                  this.bot.equip(item, 'hand', (err) => {
                    if (err) {
                      this.onLog(`[Mineflayer] Equip error: ${err.message}`, true);
                      resolve(true);
                      return;
                    }
                    this.bot.placeBlock(block, item, (err) => {
                      if (err) this.onLog(`[Mineflayer] Place error: ${err.message}`, true);
                      resolve(true);
                    });
                  });
                } else {
                  this.bot.chat(`No ${blockType} in inventory to place`);
                  resolve(true);
                }
              } else {
                resolve(true);
              }
            } else {
              this.bot.chat(`Cannot find valid position to place ${blockType || 'block'}`);
              resolve(true);
            }
            break;
          }
          case 'craft': {
            const { itemType, count = 1 } = params;
            const recipe = this.findRecipe(itemType);
            if (recipe) {
              this.bot.craft(recipe, count, (err) => {
                if (err) this.onLog(`[Mineflayer] Craft error: ${err.message}`, true);
                resolve(true);
              });
            } else {
              this.bot.chat(`Don't know how to craft ${itemType}`);
              resolve(true);
            }
            break;
          }
          case 'equip': {
            const { itemType, slot = 'hand' } = params;
            const item = this.findItemInInventory(itemType);
            if (item) {
              this.bot.equip(item, slot, (err) => {
                if (err) this.onLog(`[Mineflayer] Equip error: ${err.message}`, true);
                resolve(true);
              });
            } else {
              this.bot.chat(`No ${itemType} in inventory to equip`);
              resolve(true);
            }
            break;
          }
          case 'pathfind': {
            const { x, y, z } = params;
            const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
            if (!this.bot.pathfinder) {
              this.bot.loadPlugin(pathfinder);
            }
            const movements = new Movements(this.bot);
            this.bot.pathfinder.setMovements(movements);
            this.bot.pathfinder.setGoal(new goals.GoalBlock(x, y ?? this.bot.entity.position.y, z), true);
            setTimeout(() => resolve(true), 1000);
            break;
          }
          default:
            resolve(true);
        }
      } catch (err: any) {
        this.onLog(`[Mineflayer Action Exception] Action "${action}" failed: ${err.message}`, true);
        resolve(false);
      }
    });
  }

  private findNearestBlock(blockType?: string): { x: number; y: number; z: number } | null {
    if (!this.bot || !blockType) return null;
    const mcData = require('minecraft-data')(this.bot.version);
    const blocksByName = mcData.blocksByName as Record<string, { name: string; id: number }>;
    const blockIds = Object.values(blocksByName).filter(b => 
      blockType ? b.name.includes(blockType.toLowerCase()) : true
    ).map(b => b.id);
    
    const block = this.bot.findBlock({
      matching: blockIds,
      maxDistance: 32,
      count: 1
    });
    return block ? { x: block.position.x, y: block.position.y, z: block.position.z } : null;
  }

  private findPlacePosition(blockType?: string): { x: number; y: number; z: number } | null {
    if (!this.bot) return null;
    const pos = this.bot.entity.position;
    const offsets: [number, number, number][] = [
      [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
      [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1]
    ];
    for (const [dx, dy, dz] of offsets) {
      const checkPos = pos.offset(dx, dy, dz);
      const block = this.bot.blockAt(checkPos);
      if (block && block.name === 'air') {
        const below = this.bot.blockAt(pos.offset(dx, dy - 1, dz));
        if (below && below.name !== 'air') {
          return { x: checkPos.x, y: checkPos.y, z: checkPos.z };
        }
      }
    }
    return null;
  }

  private findItemInInventory(itemName: string) {
    if (!this.bot) return null;
    const mcData = require('minecraft-data')(this.bot.version);
    const item = mcData.itemsByName[itemName.toLowerCase()];
    if (!item) return null;
    return this.bot.inventory.items().find(i => i.type === item.id);
  }

  private findRecipe(itemName: string) {
    if (!this.bot) return null;
    const mcData = require('minecraft-data')(this.bot.version);
    const item = mcData.itemsByName[itemName.toLowerCase()];
    if (!item) return null;
    return this.bot.recipesAll.find(r => r.resultId === item.id);
  }
}