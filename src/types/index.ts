export enum GameMode {
  SURVIVAL = 'survival',
  CREATIVE = 'creative',
  ADVENTURE = 'adventure',
  SPECTATOR = 'spectator',
}

export enum Difficulty {
  PEACEFUL = 'peaceful',
  EASY = 'easy',
  NORMAL = 'normal',
  HARD = 'hard',
}

export interface MinecraftServerConfig {
  serverName: string;
  levelName: string;
  seed: string;
  gameMode: GameMode;
  difficulty: Difficulty;
  port: number;
  properties: Record<string, string>;
}

export enum LLMProviderType {
  GEMINI = 'gemini',
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  OPENROUTER = 'openrouter',
  OLLAMA = 'ollama',
  LMSTUDIO = 'lmstudio',
}

export interface LLMProviderConfig {
  id: string;
  type: LLMProviderType;
  name: string;
  apiKey: string; // Stored in memory / session on backend
  customUrl?: string; // For Ollama / LMStudio / OpenRouter custom endpoints
  defaultModel: string;
  lastTest?: {
    status: 'untested' | 'passed' | 'failed';
    testedAt?: string;
    errorCode?: string;
    message?: string;
  };
}

export interface BotConfig {
  id: string;
  name: string;
  role: string;
  goal: string;
  providerId: string;
  model: string;
  inventory: Record<string, number>;
  x: number;
  y: number;
  z: number;
  health: number;
  food: number;
  characterPrompt?: string;
  character_prompt?: string;
  behaviorPrompt?: string;
  behavior_prompt?: string;
}

export interface Scenario {
  id?: string;
  version?: string;
  title: string;
  description: string;
  objectives: string[];
  bots: BotConfig[];
  scenarioPrompt?: string;
  scenario_prompt?: string;
  worldConfig?: {
    seed?: string;
    gameMode?: string;
    game_mode?: string;
    difficulty?: string;
    port?: number;
    levelName?: string;
    level_name?: string;
    properties?: Record<string, string>;
  };
  research?: {
    question?: string;
    hypothesis?: string;
    measurementFocus?: string[];
    observationProtocol?: string;
    expectedEmergencePatterns?: string[];
  };
}

export interface ScenarioV2 {
  id: string;
  title: string;
  description: string;
  originalMarkdown: string;
  parsedScenario: Scenario;
  lastSavedAt: string;
}

export enum EventType {
  SERVER_START = 'server_start',
  SERVER_STOP = 'server_stop',
  BOT_JOIN = 'bot_join',
  BOT_LEAVE = 'bot_leave',
  BOT_THINK = 'bot_think',
  BOT_ACTION = 'bot_action',
  BOT_CHAT = 'bot_chat',
  LLM_CALL = 'llm_call',
  SYSTEM = 'system',
  ERROR = 'error',
}

export interface EventLog {
  id: string;
  timestamp: string;
  type: EventType;
  botId?: string;
  botName?: string;
  message: string;
  details?: Record<string, any>;
}

export interface RunManifest {
  id: string;
  startTime: string;
  endTime?: string;
  scenarioTitle: string;
  serverConfig: MinecraftServerConfig;
  status: 'idle' | 'running' | 'completed' | 'failed';
  logs: EventLog[];
  research?: {
    question?: string;
    hypothesis?: string;
    measurementFocus?: string[];
    observationProtocol?: string;
    expectedEmergencePatterns?: string[];
  };
  scenario?: Scenario;
}

export interface WorldBlock {
  x: number;
  y: number;
  z: number;
  type: string;
}

export interface SimulationState {
  serverStatus: 'stopped' | 'validating' | 'blocked' | 'starting' | 'running' | 'stopping' | 'failed';
  runtimeMode: 'live' | 'simulation' | 'blocked' | 'failed' | 'stopped';
  serverConfig: MinecraftServerConfig;
  bots: BotConfig[];
  logs: EventLog[];
  worldGrid: WorldBlock[];
  activeScenario?: Scenario;
}

export interface WorkspaceConfig {
  activeScenarioId?: string;
  selectedBotProfileIds?: string[];
  defaultProviderId?: string;
  activeProviderId?: string;
  intervalMs?: number;
  lastAppliedAt?: string;
}

export interface MinecraftRuntimeConfig {
  javaExecutable: string;
  serverJarPath: string;
  workingDirectory: string;
  minMemoryMb: number;
  maxMemoryMb: number;
  startupTimeoutMs: number;
  stopTimeoutMs: number;
  localOnly: boolean;
  onlineMode: boolean;
  eulaAccepted: boolean;
  eulaAcceptedAt?: string;
  minecraftVersion?: string;
  host?: string;
  // legacy aliases for migration
  acceptEula?: boolean;
  useEmulator?: boolean;
  javaPath?: string;
  jarPath?: string;
  workingDir?: string;
  maxMemory?: string;
  minMemory?: string;
}

export interface BotDecisionTrace {
  runId: string;
  step: number;
  botId: string;
  botName: string;
  providerId: string;
  model: string;
  reason_summary: string;
  action: string;
  parameters: Record<string, any>;
  message?: string;
  latencyMs?: number;
  timestamp: string;
  decisionSource: 'real_provider' | 'simulation' | 'fallback_wait';
  activeGoal?: string | null;
  confidence?: number | null;
  observationSummary?: string | null;
}
