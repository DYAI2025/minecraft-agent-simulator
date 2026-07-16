import express from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { getHttpRuntimeConfig } from './src/config/http-runtime.js';
import { getStorageRoot, ensureStoragePathSync } from './src/config/storage-paths.js';
import { MinecraftServerService } from './src/services/MinecraftServerService.js';
import { MinecraftServerPreflightService } from './src/services/MinecraftServerPreflightService.js';
import { ScenarioService } from './src/services/ScenarioService.js';
import { EventStoreService } from './src/services/EventStoreService.js';
import { BotOrchestratorService } from './src/services/BotOrchestratorService.js';
import { GameMode, Difficulty, EventType } from './src/types/index.js';
import { SmokeTestService } from './src/services/SmokeTestService.js';
import { LLMProviderService } from './src/services/LLMProviderService.js';
import { isCommandAllowed } from './src/domain/server/server-command-policy.js';

import { SecretStoreService } from './src/services/SecretStoreService.js';
import { SettingsService } from './src/services/SettingsService.js';
import { ScenarioLibraryService } from './src/services/ScenarioLibraryService.js';
import { BotProfileService } from './src/services/BotProfileService.js';

// Resolve directory paths for both ES Modules and CommonJS bundles
let currentDirname = '';
try {
  currentDirname = path.dirname(fileURLToPath(import.meta.url));
} catch {
  currentDirname = __dirname;
}

async function startServer() {
  const app = express();
  const httpConfig = getHttpRuntimeConfig();
  const PORT = httpConfig.port;
  const HOST = httpConfig.host;

  // Health Endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: 'missi',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || 'unknown'
    });
  });

  // Standard Middlewares
  app.use(express.json());

  // Initialize persistent services
  const secrets = SecretStoreService.getInstance();
  await secrets.init();
  const settings = SettingsService.getInstance();
  await settings.init();
  const scenarioLibrary = ScenarioLibraryService.getInstance();
  await scenarioLibrary.init();
  const botProfileService = BotProfileService.getInstance();
  await botProfileService.init();

  const serverService = MinecraftServerService.getInstance();
  serverService.loadConfig();

  const eventStore = EventStoreService.getInstance();
  const orchestrator = BotOrchestratorService.getInstance();

  // Restore active scenario if set in workspace config
  const workspaceConfig = settings.getWorkspaceConfig();
  if (workspaceConfig.activeScenarioId) {
    const activeSc = scenarioLibrary.getScenario(workspaceConfig.activeScenarioId);
    if (activeSc) {
      orchestrator.setActiveScenario(activeSc.parsedScenario);
      console.log(`[Startup] Restored active scenario: ${activeSc.title} (${workspaceConfig.activeScenarioId})`);
    }
  }

  // Pipe server service logs into event store service for live monitoring
  serverService.registerLogCallback((log) => {
    eventStore.addEvent(EventType.SYSTEM, log);
  });

  // --- API ROUTES ---

  /**
   * Health check routes
   */
  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  /**
   * Status API
   */
  app.get('/api/status', (req, res) => {
    const serverStatus = serverService.getStatus();
    const simStatus = orchestrator.getSimulationState();
    const bots = orchestrator.getBots();
    const worldGrid = serverService.getWorldGrid();
    
    res.json({
      serverStatus: serverStatus.status,
      runtimeMode: serverStatus.runtimeMode,
      serverConfig: serverStatus.config,
      isSimulating: simStatus.isSimulating,
      currentStep: simStatus.currentStep,
      activeScenario: simStatus.activeScenario,
      bots,
      worldGridSize: worldGrid.length,
      allowSimulationMode: process.env.ALLOW_SIMULATION_MODE !== 'false',
      not_live_ready: serverStatus.runtimeMode === 'simulation' || process.env.ALLOW_SIMULATION_MODE === 'false',
    });
  });

  /**
   * World block layout grid
   */
  app.get('/api/world', (req, res) => {
    res.json({
      worldGrid: serverService.getWorldGrid(),
    });
  });

  /**
   * Delete the generated world folders
   */
  app.delete('/api/server/world', async (req, res) => {
    try {
      const serverStatus = serverService.getStatus();
      if (serverStatus.status !== 'stopped') {
        return res.status(400).json({ error: 'Server must be stopped to delete the generated world.' });
      }

      const levelName = serverService.getConfig().levelName || 'world';

      // Prevent path traversal
      if (!levelName || levelName.includes('..') || levelName.includes('/') || levelName.includes('\\')) {
        return res.status(400).json({ error: 'Invalid level name.' });
      }

      const worldDir = path.resolve(process.cwd(), 'minecraft-server', levelName);

      try {
        await fs.rm(worldDir, { recursive: true, force: true });
        // Regenerate the visual world grid in simulation
        serverService.generateProceduralWorld();
        res.json({ success: true, message: `World folder '${levelName}' deleted successfully.` });
      } catch (err: any) {
        res.status(500).json({ error: `Failed to delete world: ${err.message}` });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Update server properties
   */
  app.post('/api/server/config', (req, res) => {
    const { serverName, levelName, seed, gameMode, difficulty, port, properties } = req.body;
    try {
      serverService.updateConfig({
        serverName: serverName || undefined,
        levelName: levelName || undefined,
        seed: seed || undefined,
        gameMode: (gameMode as GameMode) || undefined,
        difficulty: (difficulty as Difficulty) || undefined,
        port: port ? parseInt(port, 10) : undefined,
        properties: properties || undefined,
      });
      res.json({ success: true, config: serverService.getConfig() });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  /**
   * Preflight Diagnostics API
   */
  app.get('/api/server/preflight', async (req, res) => {
    try {
      const preflightService = MinecraftServerPreflightService.getInstance();
      const report = await preflightService.runPreflight();
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Runtime Config API
   */
  app.get('/api/server/runtime-config', async (req, res) => {
    try {
      const config = serverService.getRuntimeConfig();
      res.json(config);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/server/runtime-config', async (req, res) => {
    try {
      await serverService.updateRuntimeConfig(req.body);
      res.json(serverService.getRuntimeConfig());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Server startup
   */
  app.post('/api/server/start', async (req, res) => {
    try {
      const { acceptEULA, useEmulator } = req.body;
      // Start is asynchronous and doesn't block until running, it just spawns
      await serverService.startServer(!!acceptEULA, !!useEmulator);
      res.status(202).json({ success: true, status: 'starting' });
    } catch (err: any) {
      if (err.message.includes('PREFLIGHT_BLOCKED')) {
        res.status(403).json({ error: err.message, status: 'blocked' });
      } else {
        res.status(500).json({ error: err.message });
      }
    }
  });

  /**
   * Provider connectivity smoke test (Legacy and new routes)
   */
  app.post('/api/providers/:id/test', async (req, res) => {
    const { id } = req.params;
    let providerType: string | undefined = undefined;
    let finalDefaultModel = '';
    let effectiveApiKey = '';
    let finalCustomUrl: string | undefined = undefined;
    try {
      const { type, apiKey, customUrl, defaultModel } = req.body;
      
      providerType = type || settings.getProviders().find(p => p.id === id)?.type;
      if (!providerType) {
        const errMsg = 'Provider type is required for verification test.';
        await settings.updateProviderLastTest(id, { success: false, message: errMsg, error: errMsg, code: 'unknown_provider_error' });
        return res.status(200).json({
          success: false,
          providerId: id,
          providerType: 'unknown',
          model: '',
          error: { code: 'unknown_provider_error', message: errMsg }
        });
      }

      effectiveApiKey = apiKey || '';
      if (effectiveApiKey === undefined || effectiveApiKey === '' || effectiveApiKey.startsWith('*')) {
        effectiveApiKey = secrets.getSecret(id) || '';
        if (!effectiveApiKey) {
          if (providerType === 'gemini') {
            effectiveApiKey = process.env.GEMINI_API_KEY || '';
          } else if (providerType === 'openai') {
            effectiveApiKey = process.env.OPENAI_API_KEY || '';
          } else if (providerType === 'anthropic') {
            effectiveApiKey = process.env.ANTHROPIC_API_KEY || '';
          } else if (providerType === 'openrouter') {
            effectiveApiKey = process.env.OPENROUTER_API_KEY || '';
          }
        }
      }

      const storedProvider = settings.getProviders().find(p => p.id === id);
      finalCustomUrl = customUrl !== undefined ? customUrl : storedProvider?.customUrl;
      finalDefaultModel = defaultModel !== undefined ? defaultModel : (storedProvider?.defaultModel || '');

      const config = {
        id,
        type: providerType as any,
        name: id === 'gemini' ? 'Google Gemini' : id === 'openai' ? 'OpenAI GPT' : id === 'anthropic' ? 'Anthropic Claude' : id === 'openrouter' ? 'OpenRouter' : id === 'ollama' ? 'Ollama' : 'LM Studio',
        apiKey: effectiveApiKey || '',
        customUrl: finalCustomUrl || undefined,
        defaultModel: finalDefaultModel || '',
      };

      if (!effectiveApiKey && providerType !== 'ollama' && providerType !== 'lmstudio') {
        const errMsg = 'API key is missing or not configured.';
        await settings.updateProviderLastTest(id, { success: false, message: errMsg, error: errMsg, code: 'missing_key' });
        return res.status(200).json({
          success: false,
          providerId: id,
          providerType,
          model: finalDefaultModel,
          error: { code: 'missing_key', message: errMsg }
        });
      }

      const start = performance.now();
      const result = await LLMProviderService.testConnection(config);
      const latencyMs = Math.round(performance.now() - start);

      await settings.updateProviderLastTest(id, { success: true, message: result.message });
      res.json({
        success: true,
        providerId: id,
        providerType,
        model: finalDefaultModel,
        latencyMs,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      const errMsg = err.message || String(err);
      const configMock = {
        id,
        type: (providerType || 'gemini') as any,
        name: id,
        apiKey: effectiveApiKey || '',
        defaultModel: finalDefaultModel,
        customUrl: finalCustomUrl || undefined,
      };
      const classified = LLMProviderService.classifyError(err, configMock);
      await settings.updateProviderLastTest(id, { success: false, message: classified.message, error: classified.message, code: classified.code });
      res.status(200).json({
        success: false,
        providerId: id,
        providerType: providerType || 'unknown',
        model: finalDefaultModel,
        error: {
          code: classified.code,
          message: classified.message
        },
        timestamp: new Date().toISOString()
      });
    }
  });

  app.post('/api/provider/test', async (req, res) => {
    const { id, type, apiKey, customUrl, defaultModel } = req.body;
    let effectiveApiKey = '';
    let finalCustomUrl: string | undefined = undefined;
    try {
      if (!id || !type) {
        return res.status(200).json({
          success: false,
          providerId: id || 'unknown',
          providerType: type || 'unknown',
          model: defaultModel || '',
          error: { code: 'unknown_provider_error', message: 'Provider ID and Type are required for verification test.' }
        });
      }

      effectiveApiKey = apiKey || '';
      if (effectiveApiKey === undefined || effectiveApiKey === '' || effectiveApiKey.startsWith('*')) {
        effectiveApiKey = secrets.getSecret(id) || '';
        if (!effectiveApiKey) {
          if (type === 'gemini') {
            effectiveApiKey = process.env.GEMINI_API_KEY || '';
          } else if (type === 'openai') {
            effectiveApiKey = process.env.OPENAI_API_KEY || '';
          } else if (type === 'anthropic') {
            effectiveApiKey = process.env.ANTHROPIC_API_KEY || '';
          } else if (type === 'openrouter') {
            effectiveApiKey = process.env.OPENROUTER_API_KEY || '';
          }
        }
      }

      const storedProvider = settings.getProviders().find(p => p.id === id);
      finalCustomUrl = customUrl !== undefined ? customUrl : storedProvider?.customUrl;
      const finalDefaultModel = defaultModel !== undefined ? defaultModel : (storedProvider?.defaultModel || '');

      const config = {
        id,
        type,
        name: id === 'gemini' ? 'Google Gemini' : id === 'openai' ? 'OpenAI GPT' : id === 'anthropic' ? 'Anthropic Claude' : id === 'openrouter' ? 'OpenRouter' : id === 'ollama' ? 'Ollama' : 'LM Studio',
        apiKey: effectiveApiKey || '',
        customUrl: finalCustomUrl || undefined,
        defaultModel: finalDefaultModel || '',
      };

      if (!effectiveApiKey && type !== 'ollama' && type !== 'lmstudio') {
        const errMsg = 'API key is missing or not configured.';
        await settings.updateProviderLastTest(id, { success: false, message: errMsg, error: errMsg, code: 'missing_key' });
        return res.status(200).json({
          success: false,
          providerId: id,
          providerType: type,
          model: finalDefaultModel,
          error: { code: 'missing_key', message: errMsg }
        });
      }

      const start = performance.now();
      const result = await LLMProviderService.testConnection(config);
      const latencyMs = Math.round(performance.now() - start);

      await settings.updateProviderLastTest(id, { success: true, message: result.message });
      res.json({
        success: true,
        providerId: id,
        providerType: type,
        model: finalDefaultModel,
        latencyMs,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      const errMsg = err.message || String(err);
      const configMock = {
        id: id || 'unknown',
        type: (type || 'gemini') as any,
        name: id || 'unknown',
        apiKey: effectiveApiKey || '',
        defaultModel: defaultModel || '',
        customUrl: finalCustomUrl || undefined,
      };
      const classified = LLMProviderService.classifyError(err, configMock);
      if (id) {
        await settings.updateProviderLastTest(id, { success: false, message: classified.message, error: classified.message, code: classified.code });
      }
      res.status(200).json({
        success: false,
        providerId: id || 'unknown',
        providerType: type || 'unknown',
        model: defaultModel || '',
        error: {
          code: classified.code,
          message: classified.message
        },
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Server shutdown
   */
  app.post('/api/server/stop', async (req, res) => {
    try {
      await serverService.stopServer();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/server/logs', async (req, res) => {
    try {
      res.json({ logs: serverService.getLogs() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Send arbitrary command line strings
   */
  app.post('/api/server/command', (req, res) => {
    const { command } = req.body;
    if (!command) {
      return res.status(400).json({ error: 'Command string is required.' });
    }

    if (process.env.ALLOW_SERVER_COMMAND !== 'true') {
      return res.status(403).json({
        error: 'Command execution is disabled on this workspace by default for system security. Set ALLOW_SERVER_COMMAND=true in your environment to enable.'
      });
    }

    const policyRes = isCommandAllowed(command);
    if (!policyRes.allowed) {
      return res.status(403).json({ error: policyRes.reason });
    }

    serverService.executeCommand(command);
    res.json({ success: true });
  });

  /**
   * Run TCP Minecraft Server & Bot Connection Protocol Mock Diagnostic Test
   */
  app.post('/api/test/protocol-mock-diagnostic', async (req, res) => {
    const { serverName, levelName, seed, gameMode, difficulty, port } = req.body;
    try {
      const result = await SmokeTestService.getInstance().runSmokeTest({
        name: serverName || 'SMOKE-Server',
        level: levelName || 'world',
        seed: seed || '987654321',
        mode: gameMode || 'survival',
        difficulty: difficulty || 'normal',
        port: port ? parseInt(port, 10) : 25565,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Parse Markdown Scenario
   */
  app.post('/api/scenario/parse', (req, res) => {
    const { markdown } = req.body;
    if (!markdown) {
      return res.status(400).json({ error: 'Markdown string is required.' });
    }
    try {
      const parsed = ScenarioService.parseMarkdown(markdown);
      ScenarioService.validate(parsed);
      res.json({ success: true, scenario: parsed });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  /**
   * Spawn bots in active server
   */
  app.post('/api/simulation/spawn', async (req, res) => {
    const { scenario } = req.body;
    if (!scenario) {
      return res.status(400).json({ error: 'Scenario configuration is required.' });
    }
    try {
      await orchestrator.spawnBots(scenario);
      res.json({ success: true, bots: orchestrator.getBots() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Launch the simulation loop
   */
  app.post('/api/simulation/start', (req, res) => {
    const { intervalMs } = req.body;
    try {
      orchestrator.startSimulation(intervalMs || 8000);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Halt the simulation loop
   */
  app.post('/api/simulation/stop', (req, res) => {
    try {
      orchestrator.stopSimulation();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Step manually through simulation
   */
  app.post('/api/simulation/step', async (req, res) => {
    try {
      await orchestrator.executeSimulationStep();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Get historical runs manifests list
   */
  app.get('/api/simulation/runs', async (req, res) => {
    const runs = await eventStore.getCompletedRunsList();
    res.json({ runs });
  });

  /**
   * Get specific run logs detail
   */
  app.get('/api/simulation/runs/:id', async (req, res) => {
    const run = await eventStore.getRunDetails(req.params.id);
    if (!run) {
      return res.status(404).json({ error: 'Run manifest not found.' });
    }
    res.json({ run });
  });

  /**
   * Delete specific run manifest and its logs from disk
   */
  app.delete('/api/simulation/runs/:id', async (req, res) => {
    try {
      const runsDir = path.resolve(process.cwd(), 'runs');
      const runId = req.params.id;
      // Prevent path traversal
      if (!runId || runId.includes('..') || !runId.startsWith('run_')) {
        return res.status(400).json({ error: 'Invalid run ID.' });
      }

      const runDir = path.join(runsDir, runId);
      try {
        await fs.rm(runDir, { recursive: true, force: true });
      } catch (e) {}

      const legacyFilepath = path.join(runsDir, `manifest_${runId}.json`);
      try {
        await fs.unlink(legacyFilepath);
      } catch (e) {}

      res.json({ success: true, message: `Run manifest ${runId} deleted successfully.` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Clear all completed runs and logs
   */
  app.delete('/api/simulation/runs', async (req, res) => {
    try {
      const runsDir = path.resolve(process.cwd(), 'runs');
      try {
        await fs.rm(runsDir, { recursive: true, force: true });
        await fs.mkdir(runsDir, { recursive: true });
      } catch (e) {}
      res.json({ success: true, message: 'All run logs cleared.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Get Settings Aggregate
   */
  app.get('/api/settings', (req, res) => {
    try {
      const serverConfig = settings.getServerConfig();
      const workspace = settings.getWorkspaceConfig();
      const list = settings.getProviders().map(p => {
        const meta = secrets.getSecretMetadata(p.id);
        return {
          id: p.id,
          type: p.type,
          name: p.name,
          customUrl: p.customUrl,
          defaultModel: p.defaultModel,
          isConfigured: !!(p.apiKey && p.apiKey.length > 0),
          secretMetadata: meta,
          lastTest: p.lastTest,
        };
      });
      const scenarios = scenarioLibrary.getScenarios();
      const botProfiles = botProfileService.getProfiles();

      res.json({
        serverConfig,
        workspace,
        providers: list,
        scenarios,
        botProfiles,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Get LLM provider definitions (safely concealing secrets)
   */
  app.get('/api/providers', (req, res) => {
    const list = settings.getProviders().map(p => {
      const meta = secrets.getSecretMetadata(p.id);
      return {
        id: p.id,
        type: p.type,
        name: p.name,
        customUrl: p.customUrl,
        defaultModel: p.defaultModel,
        isConfigured: !!(p.apiKey && p.apiKey.length > 0),
        secretMetadata: meta,
        lastTest: p.lastTest,
      };
    });
    res.json({ providers: list });
  });

  /**
   * Update credentials for standard provider
   */
  app.post('/api/provider/update', async (req, res) => {
    const { id, type, apiKey, customUrl, defaultModel } = req.body;
    if (!id || !type) {
      return res.status(400).json({ error: 'Provider ID and Type are required.' });
    }
    try {
      const saved = await settings.saveProvider({
        id,
        type,
        name: id === 'gemini' ? 'Google Gemini' : id === 'openai' ? 'OpenAI GPT' : id === 'anthropic' ? 'Anthropic Claude' : id === 'openrouter' ? 'OpenRouter' : id === 'ollama' ? 'Ollama' : 'LM Studio',
        apiKey: apiKey || '',
        customUrl: customUrl || undefined,
        defaultModel: defaultModel || '',
      });
      orchestrator.updateProvider(saved);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Update provider config (PUT route)
   */
  app.put('/api/providers/:id', async (req, res) => {
    try {
      const saved = await settings.saveProvider({
        ...req.body,
        id: req.params.id,
      });
      orchestrator.updateProvider(saved);
      const meta = secrets.getSecretMetadata(saved.id);
      res.json({
        success: true,
        provider: {
          id: saved.id,
          type: saved.type,
          name: saved.name,
          customUrl: saved.customUrl,
          defaultModel: saved.defaultModel,
          isConfigured: !!(saved.apiKey && saved.apiKey.length > 0),
          secretMetadata: meta,
          lastTest: saved.lastTest,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Delete provider secret
   */
  app.delete('/api/providers/:id/secret', async (req, res) => {
    try {
      await settings.deleteProviderSecret(req.params.id);
      const updated = settings.getProviders().find(p => p.id === req.params.id);
      if (updated) {
        orchestrator.updateProvider(updated);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/storage/status', async (req, res) => {
    try {
      const storageRoot = getStorageRoot();
      const isPersistentExpected = !!process.env.MISSI_STORAGE_ROOT;
      let exists = false;
      let writable = false;
      const warnings: string[] = [];

      if (!isPersistentExpected) {
        warnings.push('MISSI_STORAGE_ROOT is not set. Data may not persist across restarts without a mounted volume.');
      }

      try {
        ensureStoragePathSync(''); // creates if missing
        exists = true;
        // Check writable by writing a small test file
        const testFile = path.join(storageRoot, '.write-test');
        await fs.writeFile(testFile, 'test');
        await fs.unlink(testFile);
        writable = true;
      } catch (err: any) {
        warnings.push(`Storage access error: ${err.message}`);
      }

      res.json({
        storageRoot,
        exists,
        writable,
        persistentVolumeExpected: isPersistentExpected,
        warnings
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Server config GET/PUT
   */
  app.get('/api/settings/server', (req, res) => {
    res.json({ success: true, config: settings.getServerConfig() });
  });

  app.put('/api/settings/server', async (req, res) => {
    try {
      const updated = await settings.saveServerConfig(req.body);
      serverService.updateConfig(updated);
      res.json({ success: true, config: updated });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  /**
   * Workspace config GET/PUT
   */
  app.get('/api/settings/workspace', (req, res) => {
    res.json({ success: true, config: settings.getWorkspaceConfig() });
  });

  app.put('/api/settings/workspace', async (req, res) => {
    try {
      const updated = await settings.saveWorkspaceConfig(req.body);
      res.json({ success: true, config: updated });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  /**
   * Scenarios Library CRUD
   */
  app.get('/api/scenarios', (req, res) => {
    res.json({ scenarios: scenarioLibrary.getScenarios() });
  });

  app.post('/api/scenarios', async (req, res) => {
    const { id, title, description, markdown, parsedScenario } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Scenario ID is required.' });
    }
    try {
      let finalParsed = parsedScenario;
      if (!finalParsed && markdown) {
        finalParsed = ScenarioService.parseMarkdown(markdown);
        ScenarioService.validate(finalParsed);
      }
      if (!finalParsed) {
        return res.status(400).json({ error: 'Scenario parsed configuration or markdown is required.' });
      }
      const item = {
        id,
        title: title || finalParsed.title,
        description: description || finalParsed.description || '',
        originalMarkdown: markdown || '',
        parsedScenario: finalParsed,
        lastSavedAt: new Date().toISOString(),
        history: [],
      };
      const saved = await scenarioLibrary.saveScenarioItem(item);
      res.json({ success: true, scenario: saved });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/scenarios/:id', (req, res) => {
    const sc = scenarioLibrary.getScenario(req.params.id);
    if (!sc) {
      return res.status(404).json({ error: 'Scenario not found.' });
    }
    res.json({ scenario: sc });
  });

  app.put('/api/scenarios/:id', async (req, res) => {
    const { title, description, markdown, parsedScenario } = req.body;
    try {
      let finalParsed = parsedScenario;
      if (!finalParsed && markdown) {
        finalParsed = ScenarioService.parseMarkdown(markdown);
        ScenarioService.validate(finalParsed);
      }
      const existing = scenarioLibrary.getScenario(req.params.id);
      if (!existing && !finalParsed) {
        return res.status(404).json({ error: 'Scenario not found and no parsed data provided.' });
      }
      
      const newHistory = existing?.history ? [...existing.history] : [];
      if (existing?.originalMarkdown) {
        newHistory.push({ timestamp: existing.lastSavedAt || new Date().toISOString(), markdown: existing.originalMarkdown });
      }

      const item = {
        id: req.params.id,
        title: title || existing?.title || finalParsed?.title || 'Untitled',
        description: description || existing?.description || finalParsed?.description || '',
        originalMarkdown: markdown || existing?.originalMarkdown || '',
        parsedScenario: finalParsed || existing?.parsedScenario,
        lastSavedAt: new Date().toISOString(),
        history: newHistory,
      };
      const saved = await scenarioLibrary.saveScenarioItem(item as any);
      res.json({ success: true, scenario: saved });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/scenarios/:id', async (req, res) => {
    try {
      await scenarioLibrary.deleteScenario(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/scenarios/:id/apply', async (req, res) => {
    const sc = scenarioLibrary.getScenario(req.params.id);
    if (!sc) {
      return res.status(404).json({ error: 'Scenario not found.' });
    }
    try {
      orchestrator.setActiveScenario(sc.parsedScenario);
      await settings.saveWorkspaceConfig({ activeScenarioId: req.params.id });
      res.json({ success: true, scenario: sc });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Bot Profiles Library CRUD
   */
  app.get('/api/bot-profiles', (req, res) => {
    res.json({ profiles: botProfileService.getProfiles() });
  });

  app.post('/api/bot-profiles', async (req, res) => {
    try {
      const saved = await botProfileService.saveProfile(req.body);
      res.json({ success: true, profile: saved });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/bot-profiles/:id', (req, res) => {
    const prof = botProfileService.getProfile(req.params.id);
    if (!prof) {
      return res.status(404).json({ error: 'Profile not found.' });
    }
    res.json({ profile: prof });
  });

  app.put('/api/bot-profiles/:id', async (req, res) => {
    try {
      const data = { ...req.body, id: req.params.id };
      const saved = await botProfileService.saveProfile(data);
      res.json({ success: true, profile: saved });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/bot-profiles/:id', async (req, res) => {
    try {
      await botProfileService.deleteProfile(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  /**
   * Retrieve current event logs buffer
   */
  app.get('/api/simulation/logs', (req, res) => {
    res.json({
      logs: eventStore.getLogs(),
    });
  });

  // --- VITE MIDDLEWARE SETUP ---
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get(/^\/(?!api).*/, (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Start Listener
  app.listen(PORT, HOST, () => {
    console.log(`MISSI running on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server boot failure:', err);
});
