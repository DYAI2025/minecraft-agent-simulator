import { BotConfig, Scenario, EventType, LLMProviderConfig, LLMProviderType, WorldBlock } from '../types/index.js';
import { LLMProviderService } from './LLMProviderService.js';
import { MinecraftServerService } from './MinecraftServerService.js';
import { EventStoreService } from './EventStoreService.js';
import { MineflayerBotAdapter } from '../adapters/minecraft/MineflayerBotAdapter.js';
import { SettingsService } from './SettingsService.js';

export class BotOrchestratorService {
  private static instance: BotOrchestratorService | null = null;
  private activeBots: BotConfig[] = [];
  private isSimulating: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private providers: Record<string, LLMProviderConfig> = {};
  private activeScenario: Scenario | null = null;
  private currentStep: number = 0;
  private botAdapters: Record<string, MineflayerBotAdapter> = {};

  private constructor() {
    this.setupDefaultProviders();
  }

  public static getInstance(): BotOrchestratorService {
    if (!this.instance) {
      this.instance = new BotOrchestratorService();
    }
    return this.instance;
  }

  private setupDefaultProviders() {
    try {
      const persisted = SettingsService.getInstance().getProviders();
      persisted.forEach(p => {
        this.providers[p.id] = p;
      });
    } catch {
      // Read secret key from environment or use default empty placeholder
      const geminiKey = process.env.GEMINI_API_KEY || '';
      
      this.providers['gemini'] = {
        id: 'gemini',
        type: LLMProviderType.GEMINI,
        name: 'Google Gemini',
        apiKey: geminiKey,
        defaultModel: 'gemini-3.5-flash',
      };
      
      this.providers['openai'] = {
        id: 'openai',
        type: LLMProviderType.OPENAI,
        name: 'OpenAI GPT',
        apiKey: '',
        defaultModel: 'gpt-4o-mini',
      };

      this.providers['anthropic'] = {
        id: 'anthropic',
        type: LLMProviderType.ANTHROPIC,
        name: 'Anthropic Claude',
        apiKey: '',
        defaultModel: 'claude-3-5-haiku-latest',
      };

      this.providers['openrouter'] = {
        id: 'openrouter',
        type: LLMProviderType.OPENROUTER,
        name: 'OpenRouter',
        apiKey: '',
        defaultModel: 'google/gemini-2.5-flash',
      };

      this.providers['ollama'] = {
        id: 'ollama',
        type: LLMProviderType.OLLAMA,
        name: 'Ollama Local',
        apiKey: '',
        customUrl: 'http://localhost:11434',
        defaultModel: 'llama3',
      };

      this.providers['lmstudio'] = {
        id: 'lmstudio',
        type: LLMProviderType.LMSTUDIO,
        name: 'LM Studio',
        apiKey: '',
        customUrl: 'http://localhost:1234',
        defaultModel: 'meta-llama-3-8b-instruct',
      };
    }
  }

  public getProviders(): LLMProviderConfig[] {
    try {
      return SettingsService.getInstance().getProviders();
    } catch {
      return Object.values(this.providers);
    }
  }

  public updateProvider(config: LLMProviderConfig) {
    try {
      SettingsService.getInstance().saveProvider(config).then(saved => {
        this.providers[saved.id] = saved;
      }).catch(err => {
        console.error('Failed to save provider config asynchronously:', err);
      });
    } catch {
      this.providers[config.id] = { ...this.providers[config.id], ...config };
    }
  }

  public setActiveScenario(scenario: Scenario) {
    this.activeScenario = scenario;
  }

  public getBots(): BotConfig[] {
    return this.activeBots;
  }

  public getSimulationState() {
    return {
      isSimulating: this.isSimulating,
      currentStep: this.currentStep,
      activeScenario: this.activeScenario,
    };
  }

  /**
   * Spawns bots into the active Minecraft server
   */
  public async spawnBots(scenario: Scenario): Promise<void> {
    const serverService = MinecraftServerService.getInstance();
    const eventStore = EventStoreService.getInstance();

    if (serverService.getStatus().status !== 'running') {
      throw new Error('Minecraft server is not running. Launch the server first.');
    }

    // Clean up any existing bot connections
    for (const bId of Object.keys(this.botAdapters)) {
      try {
        this.botAdapters[bId].disconnect();
      } catch {}
    }
    this.botAdapters = {};

    this.activeScenario = scenario;
    this.activeBots = JSON.parse(JSON.stringify(scenario.bots)); // deep clone
    this.currentStep = 0;

    const serverPort = serverService.getConfig().port || 25565;
    const settings = SettingsService.getInstance();
    const runtimeConfig = settings.getRuntimeConfig();
    const serverHost = runtimeConfig?.host || '127.0.0.1';

    // Log connection sequence and attempt real Mineflayer socket joins
    for (const bot of this.activeBots) {
      eventStore.addEvent(
        EventType.BOT_JOIN,
        `[Orchestrator] Attaching bot client "${bot.name}" (role: "${bot.role}").`,
        bot.id,
        bot.name
      );

      // Create and connect a real Mineflayer client adapter
      const adapter = new MineflayerBotAdapter(
        bot.name,
        serverHost,
        serverPort,
        (msg, isError) => {
          eventStore.addEvent(
            isError ? EventType.ERROR : EventType.SYSTEM,
            msg,
            bot.id,
            bot.name
          );
        }
      );

      this.botAdapters[bot.id] = adapter;
      
      // Connect asynchronously. If it fails, the event is logged and we run in fallback engine.
      adapter.connect().then((connected) => {
        if (!connected) {
          eventStore.addEvent(
            EventType.ERROR,
            `[Real Socket Downstream] Bot "${bot.name}" could not connect to local host on port ${serverPort} (server may be offline/blocked). Fallback internal engine will handle actions.`,
            bot.id,
            bot.name
          );
        } else {
          eventStore.addEvent(
            EventType.SYSTEM,
            `[Real Socket Success] Bot "${bot.name}" successfully established connection and logged into active Minecraft world seed ${serverService.getConfig().seed}.`,
            bot.id,
            bot.name
          );
        }
      });
    }
  }

  /**
   * Starts the autonomous simulator loops
   */
  public startSimulation(stepIntervalMs: number = 8000) {
    if (this.isSimulating) return;
    
    const serverService = MinecraftServerService.getInstance();
    if (serverService.getStatus().status !== 'running') {
      throw new Error('Simulation cannot start: Minecraft server is offline.');
    }

    this.isSimulating = true;
    const eventStore = EventStoreService.getInstance();
    eventStore.startRun(
      this.activeScenario?.title || 'Custom Simulation',
      serverService.getConfig(),
      this.activeScenario || undefined,
      (this.activeScenario as any)?.originalMarkdown
    );

    this.addLogEvent(EventType.SYSTEM, 'Autonomous Minecraft Scenario Simulation loop started.');

    // Execute first step immediately, then set interval
    this.executeSimulationStep();
    
    this.intervalId = setInterval(() => {
      if (this.isSimulating) {
        this.executeSimulationStep();
      }
    }, stepIntervalMs);
  }

  public stopSimulation() {
    if (!this.isSimulating) return;

    this.isSimulating = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    const eventStore = EventStoreService.getInstance();
    eventStore.endRun('completed');
    this.addLogEvent(EventType.SYSTEM, 'Simulation loop stopped manually.');
  }

  /**
   * Execute a single tick/step for all bots
   */
  public async executeSimulationStep(): Promise<void> {
    if (this.activeBots.length === 0) {
      this.addLogEvent(EventType.ERROR, 'No active bots spawned to simulate.');
      this.stopSimulation();
      return;
    }

    this.currentStep++;
    this.addLogEvent(EventType.SYSTEM, `--- Simulation Step #${this.currentStep} ---`);

    const serverService = MinecraftServerService.getInstance();
    const eventStore = EventStoreService.getInstance();

    // Loop through each bot sequentially
    for (const bot of this.activeBots) {
      try {
        const provider = this.providers[bot.providerId] || this.providers['gemini'];
        
        // Build surrounding context
        const context = this.buildEnvironmentContext(bot, serverService.getWorldGrid());
        
        // 1. Log Think Trigger
        eventStore.addEvent(
          EventType.BOT_THINK,
          `${bot.name} is thinking about next action... Using Provider: ${provider.name} (${bot.model})`,
          bot.id,
          bot.name,
          { providerId: provider.id, model: bot.model }
        );

        // 2. Build system and user instruction prompts
        const systemInstruction = this.getSystemPrompt();
        const userPrompt = this.getUserPrompt(bot, context);

        let decision;
        
        // Check if API key exists. If not, trigger structured simulation mode
        const activeKey = provider.apiKey || (provider.type === LLMProviderType.GEMINI ? process.env.GEMINI_API_KEY : '');
        
        if (!activeKey && provider.type !== LLMProviderType.OLLAMA && provider.type !== LLMProviderType.LMSTUDIO) {
          // No API key -> Fallback to intelligent local simulation planner so UI stays interactive and works
          const startTime = Date.now();
          decision = this.getSimulatedDecision(bot, context);
          const latencyMs = Date.now() - startTime;
          eventStore.addEvent(
            EventType.LLM_CALL,
            `[SIMULATED PLANNER] No API key found for ${provider.name}. Procedural decision generated.`,
            bot.id,
            bot.name,
            {
              reason_summary: decision.reason_summary,
              action: decision.action,
              parameters: decision.parameters,
              message: decision.message || '',
              latencyMs,
              decisionSource: 'simulation',
              activeGoal: bot.goal || null,
              confidence: null,
              observationSummary: null
            }
          );
        } else {
          // Real API Call!
          try {
            const startTime = Date.now();
            const rawDecision = await LLMProviderService.getBotDecision(
              provider,
              systemInstruction,
              userPrompt,
              this.getResponseSchema()
            );
            const latencyMs = Date.now() - startTime;

            decision = {
              reason_summary: rawDecision.reason_summary || rawDecision.rationale || '',
              rationale: rawDecision.reason_summary || rawDecision.rationale || '',
              action: rawDecision.action,
              parameters: rawDecision.parameters,
              message: rawDecision.message,
            };

            eventStore.addEvent(
              EventType.LLM_CALL,
              `[REAL API CALL] ${provider.name} returned validated decision.`,
              bot.id,
              bot.name,
              {
                reason_summary: decision.reason_summary,
                action: decision.action,
                parameters: decision.parameters,
                message: decision.message || '',
                latencyMs,
                decisionSource: 'real_provider',
                activeGoal: bot.goal || null,
                confidence: (rawDecision as any).confidence !== undefined ? (rawDecision as any).confidence : null,
                observationSummary: (rawDecision as any).observationSummary || null
              }
            );
          } catch (err: any) {
            // fallback gracefully on API rate limits / errors
            const startTime = Date.now();
            decision = this.getSimulatedDecision(bot, context);
            const latencyMs = Date.now() - startTime;
            eventStore.addEvent(
              EventType.ERROR,
              `LLM Provider ${provider.name} failed: ${err.message || err}. Falling back to simulated plan.`,
              bot.id,
              bot.name
            );
            eventStore.addEvent(
              EventType.LLM_CALL,
              `[SIMULATED PLANNER] LLM provider failed. Falling back to simulated decision.`,
              bot.id,
              bot.name,
              {
                reason_summary: decision.reason_summary,
                action: decision.action,
                parameters: decision.parameters,
                message: decision.message || '',
                latencyMs,
                decisionSource: 'fallback_wait',
                activeGoal: bot.goal || null,
                confidence: null,
                observationSummary: null
              }
            );
          }
        }

        // 3. Action validation & execution
        this.executeAction(bot, decision, serverService);

      } catch (err: any) {
        this.addLogEvent(EventType.ERROR, `Error in bot ${bot.name} simulation tick: ${err.message || err}`, bot.id, bot.name);
      }
    }
  }

  private buildEnvironmentContext(bot: BotConfig, worldBlocks: WorldBlock[]) {
    // Find nearby blocks within 5 blocks distance
    const nearbyBlocks = worldBlocks
      .filter(b => {
        const dist = Math.sqrt(Math.pow(b.x - bot.x, 2) + Math.pow(b.z - bot.z, 2));
        return dist <= 6 && b.type !== 'air';
      })
      .slice(0, 8); // Keep list reasonable

    // Find other players/bots
    const otherBots = this.activeBots
      .filter(b => b.id !== bot.id)
      .map(b => ({
        name: b.name,
        role: b.role,
        distance: Math.sqrt(Math.pow(b.x - bot.x, 2) + Math.pow(b.z - bot.z, 2)).toFixed(1),
        coords: { x: b.x, y: b.y, z: b.z }
      }));

    return {
      currentCoordinates: { x: bot.x, y: bot.y, z: bot.z },
      nearbyBlocks,
      otherBots,
      inventory: bot.inventory,
      objectives: this.activeScenario?.objectives || []
    };
  }

  public getSystemPrompt(): string {
    return `You are an advanced Minecraft autonomous AI bot. You run in a server-side simulator.
You must analyze your current surroundings, objectives, and inventory, and select your next optimal action.

You must reply strictly in JSON format. Do not write any normal conversational text outside the JSON.
Your JSON response must match this schema:
{
  "reason_summary": "Brief public reason for the selected action. Do not include hidden or private chain-of-thought.",
  "action": "move" | "harvest" | "place" | "craft" | "talk" | "idle",
  "parameters": {
    // For move: { "x": number, "y": number, "z": number }
    // For harvest: { "blockType": string, "x": number, "y": number, "z": number }
    // For place: { "blockType": string, "x": number, "y": number, "z": number }
    // For craft: { "itemType": string, "count": number }
    // For talk: { "recipient": string, "message": string }
    // For idle: { "reason": string }
  },
  "message": "Optional conversational message to broadcast to server chat."
}`;
  }

  public getUserPrompt(bot: BotConfig, context: any): string {
    return `Your name: ${bot.name}
Your Role: ${bot.role}
Your Goal: ${bot.goal}

--- ENVIRONMENT CONTEXT ---
Coordinates: [x: ${bot.x}, y: ${bot.y}, z: ${bot.z}]
Health: ${bot.health}/20 | Food: ${bot.food}/20

Your Inventory:
${JSON.stringify(context.inventory, null, 2)}

Nearby Blocks:
${JSON.stringify(context.nearbyBlocks, null, 2)}

Other Bots in range:
${JSON.stringify(context.otherBots, null, 2)}

Scenario Objectives:
${JSON.stringify(context.objectives, null, 2)}

What is your next action? Select the action and parameters carefully.`;
  }

  public getResponseSchema() {
    return {
      type: 'OBJECT',
      properties: {
        reason_summary: { type: 'STRING', description: 'Brief public reason for the selected action. Do not include hidden or private chain-of-thought.' },
        action: { type: 'STRING', description: 'The validated action keyword (move, harvest, place, craft, talk, idle).' },
        parameters: {
          type: 'OBJECT',
          description: 'Parameters required for the selected action.',
        },
        message: { type: 'STRING', description: 'Optional chat line broadcasted to other players.' },
      },
      required: ['reason_summary', 'action', 'parameters'],
    };
  }

  /**
   * Action validator & executor. Mutates bot state and world block grids.
   */
  private executeAction(
    bot: BotConfig,
    decision: { rationale: string; action: string; parameters: any; message?: string },
    serverService: MinecraftServerService
  ) {
    const eventStore = EventStoreService.getInstance();
    const action = decision.action.toLowerCase();
    const params = decision.parameters || {};

    // Forward action to the real Mineflayer bot socket adapter if active
    const adapter = this.botAdapters[bot.id];
    if (adapter) {
      adapter.performAction(action, params);
    }

    if (decision.message) {
      eventStore.addEvent(
        EventType.BOT_CHAT,
        `<${bot.name}> ${decision.message}`,
        bot.id,
        bot.name
      );
    }

    switch (action) {
      case 'move': {
        const targetX = Number(params.x ?? bot.x);
        const targetY = Number(params.y ?? bot.y);
        const targetZ = Number(params.z ?? bot.z);

        // Move bot up to 3 blocks closer to target in X/Z plane
        const diffX = targetX - bot.x;
        const diffZ = targetZ - bot.z;
        const dist = Math.sqrt(diffX * diffX + diffZ * diffZ);

        if (dist > 0) {
          const moveDist = Math.min(3, dist);
          bot.x = Math.round(bot.x + (diffX / dist) * moveDist);
          bot.z = Math.round(bot.z + (diffZ / dist) * moveDist);
        }
        bot.y = targetY; // set Y directly for simplicity

        eventStore.addEvent(
          EventType.BOT_ACTION,
          `${bot.name} walked to coordinates [x: ${bot.x}, y: ${bot.y}, z: ${bot.z}]. Rationale: ${decision.rationale}`,
          bot.id,
          bot.name,
          { x: bot.x, y: bot.y, z: bot.z }
        );
        break;
      }

      case 'harvest': {
        const blockType = String(params.blockType || 'oak_log');
        const bx = Number(params.x ?? bot.x);
        const bz = Number(params.z ?? bot.z);

        const dist = Math.sqrt(Math.pow(bx - bot.x, 2) + Math.pow(bz - bot.z, 2));
        if (dist > 6) {
          // Action Validation Failure!
          eventStore.addEvent(
            EventType.ERROR,
            `${bot.name} failed to harvest ${blockType}: block is too far away (${dist.toFixed(1)} blocks). Range limit is 6.`,
            bot.id,
            bot.name
          );
          return;
        }

        // Change block in server to grass/dirt (harvested)
        serverService.updateBlock(bx, 64, bz, 'grass_block');

        // Add to inventory
        bot.inventory[blockType] = (bot.inventory[blockType] || 0) + 1;

        eventStore.addEvent(
          EventType.BOT_ACTION,
          `${bot.name} mined and harvested [${blockType}] block at coordinates [x: ${bx}, y: 64, z: ${bz}]. Inventory updated.`,
          bot.id,
          bot.name,
          { blockType, x: bx, z: bz, inventory: bot.inventory }
        );
        break;
      }

      case 'place': {
        const blockType = String(params.blockType || 'crafting_table');
        const bx = Number(params.x ?? bot.x);
        const bz = Number(params.z ?? bot.z);

        if (!bot.inventory[blockType] || bot.inventory[blockType] <= 0) {
          eventStore.addEvent(
            EventType.ERROR,
            `${bot.name} failed to place ${blockType}: item is missing from inventory.`,
            bot.id,
            bot.name
          );
          return;
        }

        // Place block
        serverService.updateBlock(bx, 64, bz, blockType);

        // Deduct inventory
        bot.inventory[blockType]--;
        if (bot.inventory[blockType] === 0) {
          delete bot.inventory[blockType];
        }

        eventStore.addEvent(
          EventType.BOT_ACTION,
          `${bot.name} placed [${blockType}] at [x: ${bx}, y: 64, z: ${bz}]. Rationale: ${decision.rationale}`,
          bot.id,
          bot.name,
          { blockType, x: bx, z: bz, inventory: bot.inventory }
        );
        break;
      }

      case 'craft': {
        const itemType = String(params.itemType || 'crafting_table');
        const count = Number(params.count || 1);

        // Simple crafting validation rules
        if (itemType === 'crafting_table') {
          const woodNeeded = 4 * count;
          if ((bot.inventory['oak_log'] || 0) < woodNeeded) {
            // Check planks too
            const planksNeeded = 4 * count;
            if ((bot.inventory['oak_planks'] || 0) < planksNeeded) {
              eventStore.addEvent(
                EventType.ERROR,
                `${bot.name} failed to craft crafting_table: Needs 4 planks or logs. Current logs: ${bot.inventory['oak_log'] || 0}.`,
                bot.id,
                bot.name
              );
              return;
            } else {
              bot.inventory['oak_planks'] -= planksNeeded;
            }
          } else {
            bot.inventory['oak_log'] -= woodNeeded;
          }
          bot.inventory['crafting_table'] = (bot.inventory['crafting_table'] || 0) + count;
        } else if (itemType === 'oak_planks') {
          const logsNeeded = count;
          if ((bot.inventory['oak_log'] || 0) < logsNeeded) {
            eventStore.addEvent(
              EventType.ERROR,
              `${bot.name} failed to craft oak_planks: Needs ${logsNeeded} logs.`,
              bot.id,
              bot.name
            );
            return;
          }
          bot.inventory['oak_log'] -= logsNeeded;
          bot.inventory['oak_planks'] = (bot.inventory['oak_planks'] || 0) + count * 4;
        } else {
          // generic crafting for simplicity
          bot.inventory[itemType] = (bot.inventory[itemType] || 0) + count;
        }

        eventStore.addEvent(
          EventType.BOT_ACTION,
          `${bot.name} crafted ${count}x [${itemType}]. Inventory updated.`,
          bot.id,
          bot.name,
          { itemType, count, inventory: bot.inventory }
        );
        break;
      }

      case 'talk': {
        const recipient = String(params.recipient || 'all');
        const message = String(params.message || 'Hello');

        eventStore.addEvent(
          EventType.BOT_ACTION,
          `${bot.name} messaged [${recipient}]: "${message}"`,
          bot.id,
          bot.name,
          { recipient, message }
        );
        break;
      }

      case 'idle':
      default: {
        const reason = String(params.reason || 'Resting');
        eventStore.addEvent(
          EventType.BOT_ACTION,
          `${bot.name} is idling. Reason: "${reason}"`,
          bot.id,
          bot.name
        );
        break;
      }
    }
  }

  /**
   * Procedural planner/emulator when no LLM key is configured.
   * Emulates highly realistic autonomous bot moves matching goals.
   */
  private getSimulatedDecision(bot: BotConfig, context: any) {
    const goals = bot.goal.toLowerCase();
    const inventory = bot.inventory;
    
    let reason_summary = '';
    let action = 'idle';
    let parameters: any = {};
    let message = '';

    if (goals.includes('wood') || goals.includes('harvest') || goals.includes('log')) {
      const logsCount = inventory['oak_log'] || 0;
      const planksCount = inventory['oak_planks'] || 0;
      
      if (logsCount < 4) {
        // Find nearest oak log block
        const targetBlock = context.nearbyBlocks.find((b: WorldBlock) => b.type === 'oak_log');
        if (targetBlock) {
          // check if close
          const dist = Math.sqrt(Math.pow(targetBlock.x - bot.x, 2) + Math.pow(targetBlock.z - bot.z, 2));
          if (dist <= 2) {
            reason_summary = `Found oak log at [x: ${targetBlock.x}, z: ${targetBlock.z}] within close range. Harvesting now.`;
            action = 'harvest';
            parameters = { blockType: 'oak_log', x: targetBlock.x, y: 64, z: targetBlock.z };
          } else {
            reason_summary = `Spotted oak log at [x: ${targetBlock.x}, z: ${targetBlock.z}] which is ${dist.toFixed(1)} blocks away. Approaching...`;
            action = 'move';
            parameters = { x: targetBlock.x, y: 64, z: targetBlock.z };
          }
        } else {
          // Wander/search
          reason_summary = 'Searching nearby terrain chunks for oak trees to harvest.';
          action = 'move';
          parameters = { x: bot.x + Math.floor(Math.random() * 6) - 3, y: 64, z: bot.z + Math.floor(Math.random() * 6) - 3 };
          message = 'I am looking for some trees to cut!';
        }
      } else {
        // We have logs! Craft planks or crafting table
        if (planksCount < 4) {
          reason_summary = `We have ${logsCount} oak logs. Crafting oak wood planks to start resource refinement.`;
          action = 'craft';
          parameters = { itemType: 'oak_planks', count: 1 };
        } else {
          reason_summary = 'Crafting oak planks into a standard crafting table to proceed with tool forging.';
          action = 'craft';
          parameters = { itemType: 'crafting_table', count: 1 };
          message = 'Okay Sally, I have crafted a crafting table!';
        }
      }
    } else if (goals.includes('craft') || goals.includes('build')) {
      // Sally the crafter
      const tableCount = inventory['crafting_table'] || 0;
      
      if (tableCount > 0) {
        reason_summary = 'Setting down our crafting table on a flat grassy plain.';
        action = 'place';
        parameters = { blockType: 'crafting_table', x: bot.x + 1, y: 64, z: bot.z };
      } else {
        // Coordinate with Lumberjack Bob
        reason_summary = 'Standing by for wood logs delivery from Bob.';
        action = 'talk';
        parameters = { recipient: 'LumberjackBob', message: 'Bob, send me the logs when you have them!' };
        message = 'Bob, did you gather the oak logs yet?';
      }
    } else {
      // Default explorer
      reason_summary = 'Exploring the surrounding map layout procedurally.';
      action = 'move';
      parameters = { x: bot.x + Math.floor(Math.random() * 8) - 4, y: 64, z: bot.z + Math.floor(Math.random() * 8) - 4 };
      message = 'This looks like a great world seed!';
    }

    return { reason_summary, rationale: reason_summary, action, parameters, message };
  }

  private addLogEvent(type: EventType, message: string, botId?: string, botName?: string) {
    EventStoreService.getInstance().addEvent(type, message, botId, botName);
  }
}
