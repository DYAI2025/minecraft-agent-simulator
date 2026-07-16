import { useState, useEffect } from 'react';
import { ServerConfigCard } from './components/ServerConfigCard.tsx';
import { ScenarioCard } from './components/ScenarioCard.tsx';
import { BotProfileLibrary } from './components/BotProfileLibrary.tsx';
import { ProvidersCard } from './components/ProvidersCard.tsx';
import { LiveMonitor } from './components/LiveMonitor.tsx';
import { WorldGridVisualizer } from './components/WorldGridVisualizer.tsx';
import { RunHistory } from './components/RunHistory.tsx';
import { SetupReadinessPanel } from './components/SetupReadinessPanel.tsx';
import { SimulationState, Scenario, BotConfig, EventLog, LLMProviderConfig, LLMProviderType, WorkspaceConfig } from './types/index.ts';
import { DEFAULT_SCENARIOS } from './data/scenarios.ts';
import { ShieldCheck, Server, Play, History, Compass, Info, Cpu, Layers } from 'lucide-react';

export default function App() {
  const [state, setState] = useState<SimulationState>({
    serverStatus: 'stopped',
    runtimeMode: 'node-emulator',
    serverConfig: {
      serverName: 'MISSI-Server',
      levelName: 'world',
      seed: '123456789',
      gameMode: 'survival' as any,
      difficulty: 'normal' as any,
      port: 25565,
      properties: {},
    },
    bots: [],
    logs: [],
    worldGrid: [],
  });

  const [providers, setProviders] = useState<(LLMProviderConfig & { isConfigured: boolean })[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceConfig | null>(null);
  const [botProfiles, setBotProfiles] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'monitor' | 'map' | 'history'>('monitor');
  const [isLoading, setIsLoading] = useState(true);
  const [allowSimulationMode, setAllowSimulationMode] = useState(false);
  const [scenarioMarkdown, setScenarioMarkdown] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('missi_scenario_markdown');
      return saved !== null ? saved : DEFAULT_SCENARIOS[0].markdown;
    } catch (e) {
      return DEFAULT_SCENARIOS[0].markdown;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('missi_scenario_markdown', scenarioMarkdown);
    } catch (e) {
      console.warn('Failed to save scenario markdown to localStorage:', e);
    }
  }, [scenarioMarkdown]);

  const [libraryReloadTrigger, setLibraryReloadTrigger] = useState(0);

  // Poll server state every 2 seconds to keep dashboard fully live
  const pollStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (!res.ok) throw new Error('API offline');
      const data = await res.json();
      
      const worldRes = await fetch('/api/world');
      const worldData = await worldRes.json();

      const logsRes = await fetch('/api/simulation/logs');
      const logsData = await logsRes.json();

      setState((prev) => ({
        ...prev,
        serverStatus: data.serverStatus,
        runtimeMode: data.runtimeMode,
        serverConfig: data.serverConfig,
        bots: data.bots,
        worldGrid: worldData.worldGrid || [],
        logs: logsData.logs || [],
        activeScenario: data.activeScenario,
      }));
      setAllowSimulationMode(!!data.allowSimulationMode);
    } catch (err) {
      console.warn('Polling error:', err);
    }
  };

  const fetchProviders = async () => {
    try {
      const res = await fetch('/api/providers');
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers);
      }
    } catch (err) {
      console.error('Failed to fetch providers:', err);
    }
  };

  const reloadWorkspace = async () => {
    try {
      const res = await fetch('/api/settings/workspace');
      if (res.ok) {
        const data = await res.json();
        setWorkspace(data.config);
      }
    } catch (err) {
      console.warn('Failed to reload workspace config:', err);
    }
  };

  const handleApplyScenario = async (id: string) => {
    const res = await fetch(`/api/scenarios/${id}/apply`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to apply scenario.');
    }
    await reloadWorkspace();
    await pollStatus();
  };

  const handleSaveWorkspace = async (newConfig: Partial<WorkspaceConfig>) => {
    const res = await fetch('/api/settings/workspace', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConfig),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save workspace config.');
    }
    const data = await res.json();
    setWorkspace(data.config);
  };

  const handleTriggerTestProvider = async (providerId: string) => {
    const res = await fetch(`/api/providers/${providerId}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Test failed.');
    }
    await fetchProviders();
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      try {
        const settingsRes = await fetch('/api/settings');
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          if (settingsData.providers) {
            setProviders(settingsData.providers);
          }
          if (settingsData.serverConfig) {
            setState(prev => ({
              ...prev,
              serverConfig: settingsData.serverConfig
            }));
          }
          if (settingsData.workspace) {
            setWorkspace(settingsData.workspace);
          }
          if (settingsData.botProfiles) {
            setBotProfiles(settingsData.botProfiles);
          }
        }
      } catch (err) {
        console.warn('Failed to hydrate initial settings:', err);
      }
      await Promise.all([pollStatus(), fetchProviders()]);
      setIsLoading(false);
    };
    init();

    const interval = setInterval(pollStatus, 2500);
    return () => clearInterval(interval);
  }, [libraryReloadTrigger]);

  // --- ACTIONS HANDLERS ---

  const handleUpdateConfig = async (newConfig: Partial<any>) => {
    try {
      const res = await fetch('/api/settings/server', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });
      if (res.ok) {
        await pollStatus();
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update server settings.');
      }
    } catch (err) {
      console.error('Failed to save server config:', err);
      throw err;
    }
  };

  const handleStartServer = async (acceptEULA: boolean = false, useEmulator: boolean = false) => {
    try {
      // Fetch current preflight report
      const preflightRes = await fetch('/api/server/preflight');
      if (preflightRes.ok) {
        const report = await preflightRes.json();
        let isReady = report.realServerReady;
        if (!isReady && acceptEULA && report.blockers.length === 1 && report.blockers.includes('eula')) {
          isReady = true;
        }

        if (!isReady && !useEmulator) {
          throw new Error('Server preflight check is not passing. Please make sure Java executables, server JARs, working directories, and Minecraft EULA acceptance are configured and valid.');
        }
      }

      const res = await fetch('/api/server/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceptEULA, useEmulator }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Server startup failed.');
      }
      await pollStatus();
    } catch (err: any) {
      console.error('Failed to start server:', err);
      throw err;
    }
  };

  const handleStopServer = async () => {
    try {
      await fetch('/api/server/stop', { method: 'POST' });
      await pollStatus();
    } catch (err) {
      console.error('Failed to stop server:', err);
    }
  };

  const handleSendCommand = async (command: string) => {
    try {
      await fetch('/api/server/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      await pollStatus();
    } catch (err) {
      console.error('Failed to execute command:', err);
    }
  };

  const handleParseScenario = async (markdown: string): Promise<Scenario | null> => {
    const res = await fetch('/api/scenario/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to parse scenario.');
    }
    const data = await res.json();
    return data.scenario;
  };

  const handleSpawnBots = async (scenario: Scenario) => {
    const res = await fetch('/api/simulation/spawn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to spawn bots.');
    }
    await pollStatus();
  };

  const handleStartSimulation = async () => {
    try {
      await fetch('/api/simulation/start', { method: 'POST' });
      await pollStatus();
    } catch (err) {
      console.error(err);
    }
  };

  const handleStopSimulation = async () => {
    try {
      await fetch('/api/simulation/stop', { method: 'POST' });
      await pollStatus();
    } catch (err) {
      console.error(err);
    }
  };

  const handleStepManual = async () => {
    try {
      await fetch('/api/simulation/step', { method: 'POST' });
      await pollStatus();
    } catch (err) {
      console.error(err);
    }
  };

  const handleLoadHistoryList = async () => {
    const res = await fetch('/api/simulation/runs');
    if (!res.ok) return [];
    const data = await res.json();
    return data.runs;
  };

  const handleLoadRunDetails = async (id: string) => {
    const res = await fetch(`/api/simulation/runs/${id}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.run;
  };

  const handleUpdateProvider = async (config: {
    id: string;
    type: LLMProviderType;
    apiKey: string;
    customUrl?: string;
    defaultModel?: string;
  }) => {
    const res = await fetch(`/api/providers/${config.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: config.type,
        apiKey: config.apiKey,
        customUrl: config.customUrl,
        defaultModel: config.defaultModel,
      }),
    });
    if (!res.ok) {
      throw new Error('Failed to update provider keys.');
    }
    await fetchProviders();
  };

  const handleDeleteSecret = async (id: string) => {
    const res = await fetch(`/api/providers/${id}/secret`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to delete secret.');
    }
    await fetchProviders();
  };

  const handleSaveBotToLibrary = async (bot: BotConfig) => {
    try {
      const newProfile = {
        id: bot.name.toLowerCase().replace(/[^a-z0-9_-]/g, '') || `bot_${Math.random().toString(36).substr(2, 5)}`,
        name: bot.name,
        role: bot.role,
        goal: bot.goal,
        providerId: bot.providerId,
        model: bot.model,
        characterPrompt: `You are ${bot.name}, a ${bot.role}. Speak in character and focus on your goal: ${bot.goal}.`,
        behaviorPrompt: `Actively pursue your goal: ${bot.goal}. Communicate with your teammates as needed.`,
        inventory: bot.inventory,
        lastSavedAt: new Date().toISOString(),
      };
      
      const res = await fetch('/api/bot-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProfile),
      });
      
      if (res.ok) {
        setLibraryReloadTrigger(prev => prev + 1);
      } else {
        const err = await res.json();
        console.error(err.error || 'Failed to save bot profile.');
      }
    } catch (err) {
      console.error('Error occurred while saving bot profile:', err);
    }
  };

  const handleAppendBotToScenario = (p: any) => {
    const invStr = Object.entries(p.inventory || {})
      .map(([item, qty]) => `${item}: ${qty}`)
      .join(', ');

    const markdownBlock = `### Bot: ${p.name}
- Role: ${p.role}
- Goal: ${p.goal}
- Provider: ${p.providerId}
- Model: ${p.model}
- Position: 0, 64, 0
${invStr ? `- Inventory: ${invStr}` : ''}
`;

    setScenarioMarkdown((prev) => {
      const cleanPrev = prev.trimEnd();
      return `${cleanPrev}\n\n${markdownBlock}`;
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-brand-bg text-brand-text flex flex-col items-center justify-center font-mono text-xs gap-3">
        <div className="w-4 h-4 border-2 border-brand-green border-t-transparent rounded-full animate-spin"></div>
        <span className="tracking-widest uppercase text-brand-green">Initializing MISSI Control Systems...</span>
      </div>
    );
  }

  const isServerRunning = state.serverStatus === 'running';

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text flex flex-col font-sans selection:bg-brand-green selection:text-brand-bg">
      {/* Top Main Navigation Header Bar */}
      <header className="h-14 border-b border-brand-border bg-brand-panel flex items-center justify-between px-6 shrink-0 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full shadow-[0_0_8px_currentColor] ${
              state.serverStatus === 'running' 
                ? 'bg-brand-green text-brand-green' 
                : state.serverStatus === 'validating'
                ? 'bg-blue-500 text-blue-500 animate-pulse'
                : state.serverStatus === 'starting' 
                ? 'bg-yellow-500 text-yellow-500 animate-pulse' 
                : 'bg-red-500 text-red-500'
            }`}></div>
            <span className={`font-mono text-[10px] uppercase tracking-widest ${
              state.serverStatus === 'running' 
                ? 'text-brand-green' 
                : state.serverStatus === 'validating'
                ? 'text-blue-500'
                : state.serverStatus === 'starting' 
                ? 'text-yellow-500' 
                : 'text-brand-muted'
            }`}>
              {state.serverStatus === 'running' ? 'System Online' : `Server: ${state.serverStatus}`}
            </span>
          </div>
          <div className="h-4 w-px bg-brand-border"></div>
          <h1 className="text-sm font-bold tracking-tighter uppercase font-mono">
            <span className="opacity-50">MISSI //</span> Minecraft Scenario Simulator
          </h1>
        </div>

        {/* Global indicators */}
        <div className="flex items-center gap-6">
          <div className="text-[10px] font-mono text-brand-muted text-right leading-tight hidden md:block">
            <span className="opacity-40">SESSION_ID:</span> 0x82FA91<br/>
            <span className="opacity-40">TIME:</span> {new Date().toLocaleTimeString()}
          </div>
          <div className="h-4 w-px bg-brand-border hidden md:block"></div>
          <div className="flex items-center gap-2">
            {state.serverStatus === 'stopped' || state.serverStatus === 'blocked' || state.serverStatus === 'failed' ? (
              <button
                onClick={() => handleStartServer(false, false)}
                className="bg-brand-green text-brand-bg text-[11px] px-3 py-1 font-bold uppercase tracking-wider rounded-none hover:opacity-90 transition-opacity"
              >
                Launch Server
              </button>
            ) : (
              <button
                onClick={handleStopServer}
                disabled={state.serverStatus === 'stopping'}
                className="bg-red-600 text-brand-text text-[11px] px-3 py-1 font-bold uppercase tracking-wider rounded-none hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                Stop Server
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container Layout */}
      <main className="flex-grow p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto max-w-[1600px]">
        {/* Left Column (Grid width 5): Configurations, Scenario, Providers */}
        <section className="lg:col-span-5 space-y-6 flex flex-col">
          <ServerConfigCard
            serverStatus={state.serverStatus}
            runtimeMode={state.runtimeMode}
            config={state.serverConfig}
            onUpdateConfig={handleUpdateConfig}
            onStartServer={handleStartServer}
            onStopServer={handleStopServer}
            onSendCommand={handleSendCommand}
            allowSimulationMode={allowSimulationMode}
          />

          <SetupReadinessPanel
            workspace={workspace}
            providers={providers}
            botProfiles={botProfiles}
            serverStatus={state.serverStatus}
            runtimeMode={state.runtimeMode}
            allowSimulationMode={allowSimulationMode}
            onSaveWorkspace={handleSaveWorkspace}
            onTriggerTestProvider={handleTriggerTestProvider}
          />

          <ScenarioCard
            onParseScenario={handleParseScenario}
            onSpawnBots={handleSpawnBots}
            serverStatus={state.serverStatus}
            activeScenario={state.activeScenario}
            onApplyWorldConfig={handleUpdateConfig}
            markdown={scenarioMarkdown}
            setMarkdown={setScenarioMarkdown}
            onSaveBotToLibrary={handleSaveBotToLibrary}
            activeScenarioId={workspace?.activeScenarioId}
            onApplyScenario={handleApplyScenario}
          />

          <BotProfileLibrary
            reloadTrigger={libraryReloadTrigger}
            onAppendToScenario={handleAppendBotToScenario}
          />

          <ProvidersCard
            providers={providers}
            onUpdateProvider={handleUpdateProvider}
            onDeleteSecret={handleDeleteSecret}
          />
        </section>

        {/* Right Column (Grid width 7): Live View / Map / HistoryTabs */}
        <section className="lg:col-span-7 flex flex-col space-y-6">
          {/* Visual Tabs Navigation */}
          <div className="flex border border-brand-border bg-brand-panel p-1 rounded-none">
            <button
              onClick={() => setActiveTab('monitor')}
              className={`flex-grow sm:flex-grow-0 flex items-center justify-center gap-2 py-2 px-5 text-xs font-mono font-bold tracking-wider uppercase rounded-none transition-all ${
                activeTab === 'monitor'
                  ? 'bg-brand-border-light text-brand-text border border-brand-border'
                  : 'text-brand-muted hover:text-brand-text'
              }`}
            >
              <Play className="w-3.5 h-3.5" /> 01 // Active Monitor
            </button>
            <button
              onClick={() => setActiveTab('map')}
              className={`flex-grow sm:flex-grow-0 flex items-center justify-center gap-2 py-2 px-5 text-xs font-mono font-bold tracking-wider uppercase rounded-none transition-all ${
                activeTab === 'map'
                  ? 'bg-brand-border-light text-brand-text border border-brand-border'
                  : 'text-brand-muted hover:text-brand-text'
              }`}
            >
              <Compass className="w-3.5 h-3.5" /> 02 // Synthetic Preview
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-grow sm:flex-grow-0 flex items-center justify-center gap-2 py-2 px-5 text-xs font-mono font-bold tracking-wider uppercase rounded-none transition-all ${
                activeTab === 'history'
                  ? 'bg-brand-border-light text-brand-text border border-brand-border'
                  : 'text-brand-muted hover:text-brand-text'
              }`}
            >
              <History className="w-3.5 h-3.5" /> 03 // Audit Logs
            </button>
          </div>

          {/* Active Tab Viewport */}
          <div className="flex-grow">
            {activeTab === 'monitor' && (
              <LiveMonitor
                isSimulating={state.logs.some(l => l.type === 'system' && l.message.includes('loop started')) && !state.logs.some(l => l.type === 'system' && l.message.includes('stopped manually'))}
                currentStep={state.bots.length > 0 ? Math.max(1, Math.floor(state.logs.filter(l => l.message.includes('--- Simulation Step #')).length)) : 0}
                activeScenario={state.activeScenario}
                bots={state.bots}
                logs={state.logs}
                onStartSimulation={handleStartSimulation}
                onStopSimulation={handleStopSimulation}
                onStepManual={handleStepManual}
              />
            )}

            {activeTab === 'map' && (
              <WorldGridVisualizer
                worldGrid={state.worldGrid}
                bots={state.bots}
                logs={state.logs}
              />
            )}

            {activeTab === 'history' && (
              <RunHistory
                onLoadHistoryList={handleLoadHistoryList}
                onLoadRunDetails={handleLoadRunDetails}
              />
            )}
          </div>
        </section>
      </main>

      {/* Footer System Metrics Bar */}
      <footer className="h-10 border-t border-brand-border bg-brand-panel px-6 flex items-center justify-between text-[10px] font-mono text-brand-muted tracking-wider mt-auto shrink-0">
        <div>CORE: Minecraft Scenario Simulator | MINEFLAYER: RUNTIME-INTEGRATED</div>
        <div className="hidden sm:block">COORDINATION: team_bulletin_shared_context</div>
        <div>BUILD: DEV_PREVIEW</div>
      </footer>
    </div>
  );
}
