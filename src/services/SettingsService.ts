import { MinecraftServerConfig, LLMProviderConfig, LLMProviderType, WorkspaceConfig, MinecraftRuntimeConfig } from '../types/index.js';
import { PersistenceService } from './PersistenceService.js';
import { validateMinecraftServerConfig } from '../domain/settings/settings.schema.ts';
import { validateLLMProviderConfig } from '../domain/providers/provider.schema.ts';
import { SecretStoreService } from './SecretStoreService.js';

export class SettingsService {
  private static instance: SettingsService | null = null;
  private persistence: PersistenceService;
  private secrets: SecretStoreService;

  private serverConfigPath = 'settings/server-config.json';
  private workspaceConfigPath = 'settings/workspace.default.json';
  private providersConfigPath = 'settings/providers.public.json';
  private runtimeConfigPath = 'settings/runtime-config.json';

  private cachedServerConfig: MinecraftServerConfig | null = null;
  private cachedWorkspaceConfig: WorkspaceConfig | null = null;
  private cachedProviders: LLMProviderConfig[] = [];
  private cachedRuntimeConfig: MinecraftRuntimeConfig | null = null;

  private constructor() {
    this.persistence = PersistenceService.getInstance();
    this.secrets = SecretStoreService.getInstance();
  }

  public static getInstance(): SettingsService {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService();
    }
    return SettingsService.instance;
  }

  /**
   * Initializes settings: loads server-config, providers, and workspace configs.
   * Merges secrets from SecretStoreService.
   */
  public async init(): Promise<void> {
    // 1. Server config
    const defaultServerConfig: MinecraftServerConfig = {
      serverName: 'MISSI-Server',
      levelName: 'world',
      seed: '987654321',
      gameMode: 'survival' as any,
      difficulty: 'normal' as any,
      port: 25565,
      properties: {},
    };
    const loadedServer = await this.persistence.readJson<Partial<MinecraftServerConfig>>(this.serverConfigPath, {});
    this.cachedServerConfig = validateMinecraftServerConfig({ ...defaultServerConfig, ...loadedServer });

    // 2. Workspace config
    this.cachedWorkspaceConfig = await this.persistence.readJson<WorkspaceConfig>(this.workspaceConfigPath, {
      intervalMs: 8000,
    });

    // 3. Providers config
    const defaultProviders: LLMProviderConfig[] = [
      {
        id: 'gemini',
        type: LLMProviderType.GEMINI,
        name: 'Google Gemini',
        apiKey: '',
        defaultModel: 'gemini-2.5-flash',
      },
      {
        id: 'openai',
        type: LLMProviderType.OPENAI,
        name: 'OpenAI GPT',
        apiKey: '',
        defaultModel: 'gpt-4o-mini',
      },
      {
        id: 'anthropic',
        type: LLMProviderType.ANTHROPIC,
        name: 'Anthropic Claude',
        apiKey: '',
        defaultModel: 'claude-3-5-sonnet',
      },
      {
        id: 'openrouter',
        type: LLMProviderType.OPENROUTER,
        name: 'OpenRouter',
        apiKey: '',
        customUrl: 'https://openrouter.ai/api/v1',
        defaultModel: 'google/gemini-2.5-flash',
      },
      {
        id: 'ollama',
        type: LLMProviderType.OLLAMA,
        name: 'Ollama',
        apiKey: 'local',
        customUrl: 'http://localhost:11434',
        defaultModel: 'llama3',
      },
      {
        id: 'lmstudio',
        type: LLMProviderType.LMSTUDIO,
        name: 'LM Studio',
        apiKey: 'local',
        customUrl: 'http://localhost:1234/v1',
        defaultModel: 'meta-llama-3-8b-instruct',
      },
    ];

    const loadedProviders = await this.persistence.readJson<any[]>(this.providersConfigPath, []);
    
    // Merge default list and public loaded providers
    const providersMap = new Map<string, LLMProviderConfig>();
    defaultProviders.forEach(p => providersMap.set(p.id, {
      ...p,
      lastTest: { status: 'untested' }
    }));
    loadedProviders.forEach(p => {
      if (p && p.id) {
        try {
          const validated = validateLLMProviderConfig({ ...p, apiKey: '' });
          providersMap.set(validated.id, {
            ...validated,
            lastTest: p.lastTest || { status: 'untested' },
          });
        } catch (err) {
          console.error(`Skipping invalid loaded provider config:`, err);
        }
      }
    });

    // Load actual secrets and bind them in memory
    this.cachedProviders = Array.from(providersMap.values()).map(p => {
      const secretKey = this.secrets.getSecret(p.id);
      // Fallback to GEMINI_API_KEY env for gemini if no manual secret exists
      const effectiveKey = secretKey || (p.type === LLMProviderType.GEMINI ? (process.env.GEMINI_API_KEY || '') : '');
      return {
        ...p,
        apiKey: effectiveKey,
      };
    });

    // 4. Runtime config
    const defaultRuntime: MinecraftRuntimeConfig = {
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
      minecraftVersion: '1.20.4',
      // backward compatibility fields temporarily populated
      acceptEula: false,
      useEmulator: false,
      javaPath: 'java',
      jarPath: 'server.jar',
      workingDir: 'minecraft-server',
      minMemory: '1024M',
      maxMemory: '1024M'
    };
    const loadedRuntime = await this.persistence.readJson<Partial<MinecraftRuntimeConfig>>(this.runtimeConfigPath, {});
    this.cachedRuntimeConfig = { ...defaultRuntime, ...loadedRuntime };
  }

  public getServerConfig(): MinecraftServerConfig {
    if (!this.cachedServerConfig) {
      throw new Error('SettingsService not initialized.');
    }
    return this.cachedServerConfig;
  }

  public async saveServerConfig(config: Partial<MinecraftServerConfig>): Promise<MinecraftServerConfig> {
    const current = this.getServerConfig();
    const updated = validateMinecraftServerConfig({ ...current, ...config });
    this.cachedServerConfig = updated;
    await this.persistence.writeJson(this.serverConfigPath, updated);
    return updated;
  }

  public getWorkspaceConfig(): WorkspaceConfig {
    if (!this.cachedWorkspaceConfig) {
      throw new Error('SettingsService not initialized.');
    }
    return this.cachedWorkspaceConfig;
  }

  public async saveWorkspaceConfig(config: Partial<WorkspaceConfig>): Promise<WorkspaceConfig> {
    const current = this.getWorkspaceConfig();
    const updated = { ...current, ...config };
    this.cachedWorkspaceConfig = updated;
    await this.persistence.writeJson(this.workspaceConfigPath, updated);
    return updated;
  }

  public getProviders(): LLMProviderConfig[] {
    return this.cachedProviders;
  }

  public async saveProvider(providerConfig: Partial<LLMProviderConfig> & { id: string }): Promise<LLMProviderConfig> {
    const idx = this.cachedProviders.findIndex(p => p.id === providerConfig.id);
    let current: LLMProviderConfig;

    if (idx >= 0) {
      current = this.cachedProviders[idx];
    } else {
      // Create new custom provider
      current = {
        id: providerConfig.id,
        type: providerConfig.type || LLMProviderType.GEMINI,
        name: providerConfig.name || providerConfig.id,
        apiKey: '',
        customUrl: providerConfig.customUrl,
        defaultModel: providerConfig.defaultModel || '',
      };
    }

    const merged = { ...current, ...providerConfig };
    const validated = validateLLMProviderConfig(merged);

    // Save key to secret store if provided. Note: if key is omitted or masked (e.g. "**"), we preserve current key.
    const keyInput = providerConfig.apiKey;
    if (keyInput !== undefined && keyInput !== '' && !keyInput.startsWith('*')) {
      await this.secrets.setSecret(validated.id, keyInput);
      validated.apiKey = keyInput;
    } else if (keyInput === '') {
      await this.secrets.deleteSecret(validated.id);
      validated.apiKey = '';
    } else {
      // Retain the existing key from secret store or environment
      const secretKey = this.secrets.getSecret(validated.id);
      validated.apiKey = secretKey || (validated.type === LLMProviderType.GEMINI ? (process.env.GEMINI_API_KEY || '') : '');
    }

    if (idx >= 0) {
      this.cachedProviders[idx] = {
        ...validated,
        lastTest: current.lastTest || { status: 'untested' },
      };
    } else {
      this.cachedProviders.push({
        ...validated,
        lastTest: { status: 'untested' },
      });
    }

    const finalProvider = idx >= 0 ? this.cachedProviders[idx] : this.cachedProviders[this.cachedProviders.length - 1];

    // Save only the public configurations to providers.public.json
    const publicList = this.cachedProviders.map(p => ({
      id: p.id,
      type: p.type,
      name: p.name,
      customUrl: p.customUrl,
      defaultModel: p.defaultModel,
      lastTest: p.lastTest,
    }));
    await this.persistence.writeJson(this.providersConfigPath, publicList);

    return finalProvider;
  }

  public async updateProviderLastTest(
    providerId: string,
    result: { success: boolean; message: string; error?: string; code?: string }
  ): Promise<void> {
    const p = this.cachedProviders.find(prov => prov.id === providerId);
    if (p) {
      p.lastTest = {
        status: result.success ? 'passed' : 'failed',
        testedAt: new Date().toISOString(),
        errorCode: result.code,
        message: result.message,
      };

      const publicList = this.cachedProviders.map(p => ({
        id: p.id,
        type: p.type,
        name: p.name,
        customUrl: p.customUrl,
        defaultModel: p.defaultModel,
        lastTest: p.lastTest,
      }));
      await this.persistence.writeJson(this.providersConfigPath, publicList);
    }
  }

  public async deleteProviderSecret(providerId: string): Promise<void> {
    await this.secrets.deleteSecret(providerId);
    const p = this.cachedProviders.find(prov => prov.id === providerId);
    if (p) {
      p.apiKey = p.type === LLMProviderType.GEMINI ? (process.env.GEMINI_API_KEY || '') : '';
    }
  }

  public getRuntimeConfig(): MinecraftRuntimeConfig {
    if (!this.cachedRuntimeConfig) {
      throw new Error('SettingsService not initialized.');
    }
    return this.cachedRuntimeConfig;
  }

  public async saveRuntimeConfig(config: Partial<MinecraftRuntimeConfig>): Promise<MinecraftRuntimeConfig> {
    const current = this.getRuntimeConfig();
    const updated = { ...current, ...config };
    this.cachedRuntimeConfig = updated;
    await this.persistence.writeJson(this.runtimeConfigPath, updated);
    return updated;
  }
}
