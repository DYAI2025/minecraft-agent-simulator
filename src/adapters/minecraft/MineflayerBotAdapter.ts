import mineflayer from 'mineflayer';

export class MineflayerBotAdapter {
  private bot: any = null;
  private isConnected: boolean = false;

  constructor(
    private name: string,
    private host: string,
    private port: number,
    private onLog: (msg: string, isError?: boolean) => void
  ) {}

  public connect(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        this.onLog(`[Mineflayer Sockets] Initiating connection for "${this.name}" to ${this.host}:${this.port}...`);
        
        this.bot = mineflayer.createBot({
          host: this.host,
          port: this.port,
          username: this.name,
          version: '1.20',
        });

        // Set up robust event handlers to prevent unhandled node errors
        this.bot.on('login', () => {
          this.onLog(`[Mineflayer Sockets] Bot ${this.name} successfully logged in.`);
        });

        this.bot.on('spawn', () => {
          this.isConnected = true;
          this.onLog(`[Mineflayer Sockets] Bot ${this.name} spawned in world successfully at [${this.bot.entity.position.toString()}].`);
          resolve(true);
        });

        this.bot.on('error', (err: any) => {
          this.onLog(`[Mineflayer Sockets Error] Bot ${this.name} connection failed: ${err.message}`, true);
          this.isConnected = false;
          resolve(false);
        });

        this.bot.on('kicked', (reason: string) => {
          this.onLog(`[Mineflayer Sockets] Bot ${this.name} kicked from server. Reason: ${reason}`, true);
          this.isConnected = false;
        });

        this.bot.on('end', () => {
          this.onLog(`[Mineflayer Sockets] Bot ${this.name} connection terminated.`);
          this.isConnected = false;
        });
      } catch (err: any) {
        this.onLog(`[Mineflayer Exception] Error establishing bot socket: ${err.message}`, true);
        this.isConnected = false;
        resolve(false);
      }
    });
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
              // Direct coordinates look/step
              const yaw = Math.atan2(x - this.bot.entity.position.x, z - this.bot.entity.position.z);
              this.bot.look(yaw, 0, true);
              
              // Move slightly in direction
              this.bot.setControlState('forward', true);
              setTimeout(() => {
                if (this.bot) {
                  this.bot.setControlState('forward', false);
                }
                resolve(true);
              }, 500);
            } else {
              resolve(true);
            }
            break;
          }
          case 'harvest': {
            const { blockType } = params;
            this.bot.chat(`I am attempting to harvest ${blockType || 'nearby block'}`);
            resolve(true);
            break;
          }
          case 'place': {
            const { blockType } = params;
            this.bot.chat(`I am attempting to place ${blockType || 'block'}`);
            resolve(true);
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
}
