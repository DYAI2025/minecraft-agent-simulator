import React, { useState, useEffect, useMemo } from 'react';
import { GameMode, Difficulty, MinecraftServerConfig } from '../types/index.js';
import { Play, Square, Settings, Terminal, Radio, Activity, CheckCircle, AlertTriangle, AlertCircle, Layers, Server } from 'lucide-react';
import { usePersistence } from '../hooks/usePersistence.js';

interface ServerConfigCardProps {
  serverStatus: 'stopped' | 'validating' | 'blocked' | 'starting' | 'running' | 'stopping' | 'failed';
  runtimeMode: 'live' | 'simulation' | 'blocked' | 'failed' | 'stopped';
  config: MinecraftServerConfig;
  onUpdateConfig: (config: Partial<MinecraftServerConfig>) => Promise<void>;
  onStartServer: (acceptEULA: boolean, useEmulator: boolean) => Promise<void>;
  onStopServer: () => Promise<void>;
  onSendCommand: (command: string) => Promise<void>;
  allowSimulationMode: boolean;
}

export const ServerConfigCard: React.FC<ServerConfigCardProps> = ({
  serverStatus,
  runtimeMode,
  config,
  onUpdateConfig,
  onStartServer,
  onStopServer,
  onSendCommand,
  allowSimulationMode,
}) => {
  const [serverName, setServerName] = useState(config.serverName);
  const [seed, setSeed] = useState(config.seed);
  const [levelName, setLevelName] = useState(config.levelName);
  const [gameMode, setGameMode] = useState<GameMode>(config.gameMode);
  const [difficulty, setDifficulty] = useState<Difficulty>(config.difficulty);
  const [port, setPort] = useState(config.port);
  const [command, setCommand] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSmokeTesting, setIsSmokeTesting] = useState(false);
  const [smokeTestResult, setSmokeTestResult] = useState<{ success: boolean; logs: string[] } | null>(null);
  
  const [acceptEULA, setAcceptEULA] = useState(false);
  const [useEmulator, setUseEmulator] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Preflight Report states
  const [preflightReport, setPreflightReport] = useState<{
    realServerReady: boolean;
    simulationAvailable: boolean;
    checks: { id: string; status: 'passed' | 'failed'; message: string; }[];
    blockers: string[];
    warnings: string[];
    // legacy fields
    javaAvailable?: boolean;
    eulaAccepted?: boolean;
    jarExists?: boolean;
    issues?: string[];
    ready?: boolean;
    status?: 'ready' | 'blocked';
  } | null>(null);
  const [isCheckingPreflight, setIsCheckingPreflight] = useState(false);

  // Custom Java runtime setting states
  const [javaPath, setJavaPath] = useState('java');
  const [jarPath, setJarPath] = useState('server.jar');
  const [workingDir, setWorkingDir] = useState('minecraft-server');
  const [maxMemory, setMaxMemory] = useState('1024M');
  const [minMemory, setMinMemory] = useState('1024M');
  const [isSavingRuntime, setIsSavingRuntime] = useState(false);
  const [runtimeSaveMessage, setRuntimeSaveMessage] = useState<string | null>(null);
  const [showJavaSettings, setShowJavaSettings] = useState(false);

  const isPathsPopulated = useMemo(() => {
    return !!(javaPath?.trim() && jarPath?.trim() && workingDir?.trim());
  }, [javaPath, jarPath, workingDir]);

  useEffect(() => {
    if (!isPathsPopulated) {
      setAcceptEULA(false);
    }
  }, [isPathsPopulated]);

  const fetchRuntimeConfig = async () => {
    try {
      const res = await fetch('/api/server/runtime-config');
      if (res.ok) {
        const data = await res.json();
        setJavaPath(data.javaExecutable || 'java');
        setJarPath(data.serverJarPath || 'server.jar');
        setWorkingDir(data.workingDirectory || 'minecraft-server');
        setMaxMemory(data.maxMemoryMb ? `${data.maxMemoryMb}M` : '1024M');
        setMinMemory(data.minMemoryMb ? `${data.minMemoryMb}M` : '1024M');
      }
    } catch (err) {
      console.warn('Failed to fetch runtime config:', err);
    }
  };

  const handleSaveRuntime = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingRuntime(true);
    setRuntimeSaveMessage(null);
    try {
      const res = await fetch('/api/server/runtime-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          javaExecutable: javaPath, 
          serverJarPath: jarPath, 
          workingDirectory: workingDir, 
          maxMemoryMb: parseInt(maxMemory.replace(/\D/g, '') || '1024'), 
          minMemoryMb: parseInt(minMemory.replace(/\D/g, '') || '1024') 
        }),
      });
      if (res.ok) {
        setRuntimeSaveMessage('Java Settings Saved');
        setTimeout(() => setRuntimeSaveMessage(null), 3000);
        checkPreflight();
      } else {
        setRuntimeSaveMessage('Failed to save settings');
      }
    } catch (err) {
      setRuntimeSaveMessage('Error saving settings');
    } finally {
      setIsSavingRuntime(false);
    }
  };

  const checkPreflight = async () => {
    setIsCheckingPreflight(true);
    try {
      const res = await fetch('/api/server/preflight');
      if (res.ok) {
        const data = await res.json();
        setPreflightReport(data);
        if (data.status === 'blocked' && allowSimulationMode) {
          setUseEmulator(true);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch preflight report:', err);
    } finally {
      setIsCheckingPreflight(false);
    }
  };

  useEffect(() => {
    checkPreflight();
  }, [serverStatus, acceptEULA]);

  const [isDeletingWorld, setIsDeletingWorld] = useState(false);
  const [worldDeleteMessage, setWorldDeleteMessage] = useState<string | null>(null);

  const handleDeleteWorld = async () => {
    const levelName = config.levelName || 'world';
    if (!window.confirm(`Are you sure you want to permanently delete the generated world folder '${levelName}'? This action cannot be undone.`)) {
      return;
    }

    setIsDeletingWorld(true);
    setWorldDeleteMessage(null);
    try {
      const res = await fetch('/api/server/world', { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        setWorldDeleteMessage(`SUCCESS: ${data.message}`);
      } else {
        const data = await res.json();
        setWorldDeleteMessage(`ERROR: ${data.error || 'Failed to delete world.'}`);
      }
    } catch (err: any) {
      setWorldDeleteMessage(`ERROR: ${err.message || 'Network error deleting world.'}`);
    } finally {
      setIsDeletingWorld(false);
    }
  };

  const [serverLogs, setServerLogs] = useState<string[]>([]);

  useEffect(() => {
    let logInterval: NodeJS.Timeout;
    if (serverStatus === 'starting' || serverStatus === 'running' || serverStatus === 'stopping') {
      logInterval = setInterval(async () => {
        try {
          const res = await fetch('/api/server/logs');
          if (res.ok) {
            const data = await res.json();
            setServerLogs(data.logs);
          }
        } catch (err) {
          console.warn('Failed to fetch server logs:', err);
        }
      }, 2000);
    }
    return () => clearInterval(logInterval);
  }, [serverStatus]);

  // Synchronize config prop with local editing states
  useEffect(() => {
    setServerName(config.serverName);
    setSeed(config.seed);
    setLevelName(config.levelName);
    setGameMode(config.gameMode);
    setDifficulty(config.difficulty);
    setPort(config.port);
  }, [config]);

  // Workspace Preference States
  const [defaultProviderId, setDefaultProviderId] = useState('gemini');
  const [intervalMs, setIntervalMs] = useState(8000);
  const [savedWorkspaceConfig, setSavedWorkspaceConfig] = useState<{ defaultProviderId: string; intervalMs: number }>({
    defaultProviderId: 'gemini',
    intervalMs: 8000,
  });

  // Build current forms state objects to pass to usePersistence
  const currentServerValue = useMemo(() => ({
    serverName,
    seed,
    levelName,
    gameMode,
    difficulty,
    port: Number(port),
  }), [serverName, seed, levelName, gameMode, difficulty, port]);

  const currentWorkspaceValue = useMemo(() => ({
    defaultProviderId,
    intervalMs: Number(intervalMs),
  }), [defaultProviderId, intervalMs]);

  // Hook-based Persistence State for Server Config
  const serverPersistence = usePersistence<MinecraftServerConfig>(config, currentServerValue, {
    onSave: async (val) => {
      setIsSaving(true);
      try {
        await onUpdateConfig(val);
      } finally {
        setIsSaving(false);
      }
    }
  });

  // Hook-based Persistence State for Workspace Preferences
  const workspacePersistence = usePersistence<{ defaultProviderId: string; intervalMs: number }>(
    savedWorkspaceConfig,
    currentWorkspaceValue,
    {
      onSave: async (val) => {
        const res = await fetch('/api/settings/workspace', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(val),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to save workspace settings.');
        }
        const data = await res.json();
        setSavedWorkspaceConfig({
          defaultProviderId: data.config.defaultProviderId || 'gemini',
          intervalMs: Number(data.config.intervalMs) || 8000,
        });
      }
    }
  );

  // State manager for tracking dirty fields reactively
  const [dirtyFields, setDirtyFields] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setDirtyFields({
      serverName: serverName !== config.serverName,
      seed: seed !== config.seed,
      levelName: levelName !== config.levelName,
      gameMode: gameMode !== config.gameMode,
      difficulty: difficulty !== config.difficulty,
      port: Number(port) !== config.port,
      defaultProviderId: defaultProviderId !== savedWorkspaceConfig.defaultProviderId,
      intervalMs: Number(intervalMs) !== savedWorkspaceConfig.intervalMs,
    });
  }, [
    serverName, seed, levelName, gameMode, difficulty, port, config,
    defaultProviderId, intervalMs, savedWorkspaceConfig
  ]);

  // Load workspace preferences and runtime configuration on mount
  useEffect(() => {
    let active = true;
    const fetchWorkspace = async () => {
      try {
        const res = await fetch('/api/settings/workspace');
        if (res.ok && active) {
          const data = await res.json();
          if (data && data.config) {
            setDefaultProviderId(data.config.defaultProviderId || 'gemini');
            setIntervalMs(Number(data.config.intervalMs) || 8000);
            setSavedWorkspaceConfig({
              defaultProviderId: data.config.defaultProviderId || 'gemini',
              intervalMs: Number(data.config.intervalMs) || 8000,
            });
            // Mark loaded config as saved
            workspacePersistence.setStatus('saved');
          }
        }
      } catch (err) {
        console.warn('Failed to load workspace preferences:', err);
      }
    };
    fetchWorkspace();
    fetchRuntimeConfig();
    return () => {
      active = false;
    };
  }, []);

  const handleStart = async () => {
    setStartError(null);
    try {
      // 1. Fetch current preflight report
      const res = await fetch('/api/server/preflight');
      if (!res.ok) {
        throw new Error('Failed to run server preflight check.');
      }
      const report = await res.json();
      setPreflightReport(report);

      // 2. Conditionally execute only if ready is true
      let isReady = report.realServerReady;
      if (!isReady && acceptEULA && report.blockers.length === 1 && report.blockers.includes('eula')) {
        isReady = true;
      }
      
      if (!isReady && !useEmulator) {
        throw new Error('Server cannot start: preflight diagnostics failed. Please make sure Java executables, server JARs, working directories, and Minecraft EULA acceptance are configured and valid.');
      }

      await onStartServer(acceptEULA, useEmulator);
    } catch (err: any) {
      setStartError(err.message || 'Failed to start server.');
    }
  };

  const handleRunDiagnostic = async () => {
    setIsSmokeTesting(true);
    setSmokeTestResult(null);
    try {
      const res = await fetch('/api/test/protocol-mock-diagnostic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverName,
          levelName,
          seed,
          gameMode,
          difficulty,
          port,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSmokeTestResult(data);
      } else {
        const err = await res.json();
        setSmokeTestResult({ success: false, logs: [err.error || 'Diagnostic API failed.'] });
      }
    } catch (err: any) {
      setSmokeTestResult({ success: false, logs: [err.message || 'Network error executing diagnostic test.'] });
    } finally {
      setIsSmokeTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await serverPersistence.save();
  };

  const handleSaveWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    await workspacePersistence.save();
  };

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;
    onSendCommand(command);
    setCommand('');
  };

  const getStatusStyle = () => {
    switch (serverStatus) {
      case 'running': return 'bg-brand-green/10 text-brand-green border-brand-green/40';
      case 'validating': return 'bg-blue-500/10 text-blue-400 border-blue-500/30 animate-pulse';
      case 'starting': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30 animate-pulse';
      case 'stopping': return 'bg-red-500/10 text-red-400 border-red-500/30';
      case 'blocked': return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
      case 'failed': return 'bg-red-500/15 text-red-500 border-red-500/40';
      default: return 'bg-brand-border text-brand-muted border-brand-border';
    }
  };

  return (
    <div id="server-config-card" className="bg-brand-aside border border-brand-border rounded-none p-4 shadow-none">
      {runtimeMode === 'simulation' && (
        <div className="mb-4 bg-orange-950/40 border border-orange-500/30 p-2.5 rounded-none text-[10px] font-mono text-orange-400 font-bold uppercase tracking-wide flex items-center gap-1.5 animate-pulse">
          <AlertCircle className="w-4 h-4 text-orange-500 shrink-0" />
          Simulation Mode — Not Live Ready
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-brand-border pb-3 mb-4 gap-2">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-brand-green" />
          <h2 className="text-[10px] font-mono uppercase tracking-widest text-brand-muted font-bold">System Config // MC_SERVER</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Server Config Save-State Indicators */}
          {serverPersistence.status === 'saving' && (
            <span className="text-[9px] font-mono text-yellow-500 uppercase animate-pulse">Saving...</span>
          )}
          {serverPersistence.status === 'failed' && (
            <span className="text-[9px] font-mono text-red-500 uppercase font-bold">Save Failed</span>
          )}
          {serverPersistence.status === 'saved' && (
            <span className="text-[9px] font-mono text-brand-green uppercase font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-green" />
              Saved
            </span>
          )}
          {serverPersistence.status === 'unsaved' && (
            <span className="text-[9px] font-mono text-yellow-500 uppercase font-bold flex items-center gap-1 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
              Unsaved
            </span>
          )}
          {serverPersistence.lastSavedAt && (
            <span className="text-[8px] font-mono text-brand-muted opacity-65">
              Last: {new Date(serverPersistence.lastSavedAt).toLocaleTimeString()}
            </span>
          )}
          <div className="h-3 w-px bg-brand-border mx-1" />
          <div className={`px-2 py-0.5 text-[9px] font-mono font-bold rounded-none border ${getStatusStyle()} flex items-center gap-1.5`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              serverStatus === 'running' ? 'bg-brand-green' : 
              serverStatus === 'validating' ? 'bg-blue-400' :
              serverStatus === 'starting' ? 'bg-yellow-400' : 
              serverStatus === 'blocked' ? 'bg-orange-400' :
              serverStatus === 'failed' ? 'bg-red-500' :
              'bg-brand-muted'
            }`} />
            {serverStatus.toUpperCase()}
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[9px] text-brand-muted uppercase mb-1 italic font-mono flex items-center justify-between">
            <span>Server Name</span>
            {dirtyFields['serverName'] && (
              <span className="text-[8px] text-yellow-500 font-bold uppercase tracking-wider animate-pulse">● Unsaved</span>
            )}
          </label>
          <input
            type="text"
            className="w-full text-xs font-mono bg-brand-card border border-brand-border rounded-none px-3 py-1.5 text-brand-text focus:outline-none focus:border-brand-green transition-colors disabled:opacity-40"
            value={serverName}
            onChange={(e) => setServerName(e.target.value)}
            disabled={serverStatus !== 'stopped'}
          />
        </div>
        <div>
          <label className="block text-[9px] text-brand-muted uppercase mb-1 italic font-mono flex items-center justify-between">
            <span>World Seed</span>
            {dirtyFields['seed'] && (
              <span className="text-[8px] text-yellow-500 font-bold uppercase tracking-wider animate-pulse">● Unsaved</span>
            )}
          </label>
          <input
            type="text"
            className="w-full text-xs font-mono bg-brand-card border border-brand-border rounded-none px-3 py-1.5 text-brand-text focus:outline-none focus:border-brand-green transition-colors disabled:opacity-40"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            disabled={serverStatus !== 'stopped'}
          />
        </div>
        <div>
          <label className="block text-[9px] text-brand-muted uppercase mb-1 italic font-mono flex items-center justify-between">
            <span>Level Name</span>
            {dirtyFields['levelName'] && (
              <span className="text-[8px] text-yellow-500 font-bold uppercase tracking-wider animate-pulse">● Unsaved</span>
            )}
          </label>
          <input
            type="text"
            className="w-full text-xs font-mono bg-brand-card border border-brand-border rounded-none px-3 py-1.5 text-brand-text focus:outline-none focus:border-brand-green transition-colors disabled:opacity-40"
            value={levelName}
            onChange={(e) => setLevelName(e.target.value)}
            disabled={serverStatus !== 'stopped'}
          />
        </div>
        <div>
          <label className="block text-[9px] text-brand-muted uppercase mb-1 italic font-mono flex items-center justify-between">
            <span>Server Port</span>
            {dirtyFields['port'] && (
              <span className="text-[8px] text-yellow-500 font-bold uppercase tracking-wider animate-pulse">● Unsaved</span>
            )}
          </label>
          <input
            type="number"
            className="w-full text-xs font-mono bg-brand-card border border-brand-border rounded-none px-3 py-1.5 text-brand-text focus:outline-none focus:border-brand-green transition-colors disabled:opacity-40"
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
            disabled={serverStatus !== 'stopped'}
          />
        </div>
        <div>
          <label className="block text-[9px] text-brand-muted uppercase mb-1 italic font-mono flex items-center justify-between">
            <span>Game Mode</span>
            {dirtyFields['gameMode'] && (
              <span className="text-[8px] text-yellow-500 font-bold uppercase tracking-wider animate-pulse">● Unsaved</span>
            )}
          </label>
          <select
            className="w-full text-xs font-mono bg-brand-card border border-brand-border rounded-none px-3 py-1.5 text-brand-text focus:outline-none focus:border-brand-green transition-colors disabled:opacity-40"
            value={gameMode}
            onChange={(e) => setGameMode(e.target.value as GameMode)}
            disabled={serverStatus !== 'stopped'}
          >
            <option value={GameMode.SURVIVAL}>Survival</option>
            <option value={GameMode.CREATIVE}>Creative</option>
            <option value={GameMode.ADVENTURE}>Adventure</option>
            <option value={GameMode.SPECTATOR}>Spectator</option>
          </select>
        </div>
        <div>
          <label className="block text-[9px] text-brand-muted uppercase mb-1 italic font-mono flex items-center justify-between">
            <span>Difficulty</span>
            {dirtyFields['difficulty'] && (
              <span className="text-[8px] text-yellow-500 font-bold uppercase tracking-wider animate-pulse">● Unsaved</span>
            )}
          </label>
          <select
            className="w-full text-xs font-mono bg-brand-card border border-brand-border rounded-none px-3 py-1.5 text-brand-text focus:outline-none focus:border-brand-green transition-colors disabled:opacity-40"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            disabled={serverStatus !== 'stopped'}
          >
            <option value={Difficulty.PEACEFUL}>Peaceful</option>
            <option value={Difficulty.EASY}>Easy</option>
            <option value={Difficulty.NORMAL}>Normal</option>
            <option value={Difficulty.HARD}>Hard</option>
          </select>
        </div>

        {serverStatus === 'stopped' && (
          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="text-[11px] font-mono font-bold uppercase px-3 py-1.5 rounded-none bg-brand-border-light text-brand-text border border-brand-border hover:bg-brand-border transition-colors"
            >
              {isSaving ? 'Applying...' : 'Apply Config & Seed'}
            </button>
          </div>
        )}
      </form>
      {serverPersistence.error && (
        <div className="mt-3 bg-red-950/40 border border-red-500/30 p-2 text-[9px] font-mono text-red-400">
          {serverPersistence.error}
        </div>
      )}
 
      {/* Workspace Preferences Section */}
      <div id="workspace-preferences-section" className="mt-6 border-t border-brand-border pt-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand-green" />
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-brand-muted font-bold">Workspace Preferences</h3>
          </div>
          <div className="flex items-center gap-2">
            {/* Status indicator */}
            {workspacePersistence.status === 'saving' && (
              <span className="text-[9px] font-mono text-yellow-500 uppercase animate-pulse">Saving...</span>
            )}
            {workspacePersistence.status === 'failed' && (
              <span className="text-[9px] font-mono text-red-500 uppercase font-bold">Save Failed</span>
            )}
            {workspacePersistence.status === 'saved' && (
              <span className="text-[9px] font-mono text-brand-green uppercase font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-green" />
                Saved
              </span>
            )}
            {workspacePersistence.status === 'unsaved' && (
              <span className="text-[9px] font-mono text-yellow-500 uppercase font-bold flex items-center gap-1 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                Unsaved
              </span>
            )}
            {workspacePersistence.lastSavedAt && (
              <span className="text-[8px] font-mono text-brand-muted opacity-65">
                Last: {new Date(workspacePersistence.lastSavedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
 
        <form onSubmit={handleSaveWorkspace} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[9px] text-brand-muted uppercase mb-1 italic font-mono flex items-center justify-between">
              <span>Default AI Provider</span>
              {dirtyFields['defaultProviderId'] && (
                <span className="text-[8px] text-yellow-500 font-bold uppercase tracking-wider animate-pulse">● Unsaved</span>
              )}
            </label>
            <select
              className="w-full text-xs font-mono bg-brand-card border border-brand-border rounded-none px-3 py-1.5 text-brand-text focus:outline-none focus:border-brand-green transition-colors"
              value={defaultProviderId}
              onChange={(e) => setDefaultProviderId(e.target.value)}
            >
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI GPT</option>
              <option value="anthropic">Anthropic Claude</option>
              <option value="openrouter">OpenRouter</option>
              <option value="ollama">Ollama (Local)</option>
              <option value="lmstudio">LM Studio (Local)</option>
            </select>
          </div>
          <div>
            <label className="block text-[9px] text-brand-muted uppercase mb-1 italic font-mono flex items-center justify-between">
              <span>Step Loop Interval (ms)</span>
              {dirtyFields['intervalMs'] && (
                <span className="text-[8px] text-yellow-500 font-bold uppercase tracking-wider animate-pulse">● Unsaved</span>
              )}
            </label>
            <input
              type="number"
              min={1000}
              max={60000}
              className="w-full text-xs font-mono bg-brand-card border border-brand-border rounded-none px-3 py-1.5 text-brand-text focus:outline-none focus:border-brand-green transition-colors"
              value={intervalMs}
              onChange={(e) => setIntervalMs(Number(e.target.value))}
            />
          </div>
          <div className="md:col-span-2 flex justify-between items-center mt-1">
            <span className="text-[9px] font-mono text-brand-muted italic">
              * Controls prompt loop delays & default active providers.
            </span>
            <button
              type="submit"
              disabled={workspacePersistence.status === 'saving'}
              className="text-[11px] font-mono font-bold uppercase px-3 py-1.5 rounded-none bg-brand-border-light text-brand-text border border-brand-border hover:bg-brand-border transition-colors disabled:opacity-50"
            >
              {workspacePersistence.status === 'saving' ? 'Saving Workspace...' : 'Save Workspace'}
            </button>
          </div>
        </form>
        {workspacePersistence.error && (
          <div className="mt-3 bg-red-950/40 border border-red-500/30 p-2 text-[9px] font-mono text-red-400">
            {workspacePersistence.error}
          </div>
        )}
      </div>

      {/* Real Server Configuration */}
      {(serverStatus === 'stopped' || serverStatus === 'blocked' || serverStatus === 'failed') && (
        <div id="real-server-config-section" className="mt-6 border-t border-brand-border pt-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-brand-green" />
              <h3 className="text-[10px] font-mono uppercase tracking-widest text-brand-muted font-bold">Real Server Configuration</h3>
            </div>
            {runtimeSaveMessage && (
              <span className="text-[9px] font-mono text-brand-green font-bold uppercase animate-pulse">{runtimeSaveMessage}</span>
            )}
          </div>

          <form onSubmit={handleSaveRuntime} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[9px] text-brand-muted uppercase mb-1 italic font-mono">Java Executable Path</label>
                <input
                  type="text"
                  value={javaPath}
                  onChange={(e) => setJavaPath(e.target.value)}
                  placeholder="e.g. java"
                  className="w-full text-xs font-mono bg-brand-card border border-brand-border rounded-none px-3 py-1.5 text-brand-text focus:outline-none focus:border-brand-green transition-colors"
                />
              </div>
              <div>
                <label className="block text-[9px] text-brand-muted uppercase mb-1 italic font-mono">Server JAR Path</label>
                <input
                  type="text"
                  value={jarPath}
                  onChange={(e) => setJarPath(e.target.value)}
                  placeholder="e.g. server.jar"
                  className="w-full text-xs font-mono bg-brand-card border border-brand-border rounded-none px-3 py-1.5 text-brand-text focus:outline-none focus:border-brand-green transition-colors"
                />
              </div>
              <div>
                <label className="block text-[9px] text-brand-muted uppercase mb-1 italic font-mono">Working Directory</label>
                <input
                  type="text"
                  value={workingDir}
                  onChange={(e) => setWorkingDir(e.target.value)}
                  placeholder="e.g. minecraft-server"
                  className="w-full text-xs font-mono bg-brand-card border border-brand-border rounded-none px-3 py-1.5 text-brand-text focus:outline-none focus:border-brand-green transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[9px] text-brand-muted uppercase mb-1 italic font-mono">Max Memory (-Xmx)</label>
                <input
                  type="text"
                  value={maxMemory}
                  onChange={(e) => setMaxMemory(e.target.value)}
                  placeholder="e.g. 1024M"
                  className="w-full text-xs font-mono bg-brand-card border border-brand-border rounded-none px-3 py-1.5 text-brand-text focus:outline-none focus:border-brand-green transition-colors"
                />
              </div>
              <div>
                <label className="block text-[9px] text-brand-muted uppercase mb-1 italic font-mono">Min Memory (-Xms)</label>
                <input
                  type="text"
                  value={minMemory}
                  onChange={(e) => setMinMemory(e.target.value)}
                  placeholder="e.g. 1024M"
                  className="w-full text-xs font-mono bg-brand-card border border-brand-border rounded-none px-3 py-1.5 text-brand-text focus:outline-none focus:border-brand-green transition-colors"
                />
              </div>
            </div>

            {/* EULA Acceptance Checkbox */}
            <div className="p-3 bg-brand-card/50 border border-brand-border/60">
              <label className={`flex items-start gap-2.5 select-none ${isPathsPopulated ? 'cursor-pointer text-brand-text' : 'cursor-not-allowed text-brand-muted opacity-50'}`}>
                <input
                  type="checkbox"
                  id="eula-acceptance-checkbox"
                  className="mt-0.5 accent-brand-green bg-brand-bg border border-brand-border rounded-none h-3.5 w-3.5 shrink-0"
                  checked={acceptEULA}
                  disabled={!isPathsPopulated}
                  onChange={(e) => setAcceptEULA(e.target.checked)}
                />
                <span className="text-[10px] font-mono leading-tight">
                  I accept the <a href="https://www.minecraft.net/eula" target="_blank" rel="noopener noreferrer" className={`text-brand-green underline hover:text-brand-text ${!isPathsPopulated ? 'pointer-events-none' : ''}`}>Minecraft EULA</a>. Required to launch a real server.
                  {!isPathsPopulated && (
                    <span className="block text-[9px] text-yellow-500 font-bold uppercase mt-1">
                      * Populate Java Executable, Server JAR, and Working Directory paths to enable EULA acceptance.
                    </span>
                  )}
                </span>
              </label>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[9px] font-mono text-brand-muted italic">
                * Configures the physical server process executable and directories.
              </span>
              <button
                type="submit"
                disabled={isSavingRuntime}
                className="text-[11px] font-mono font-bold uppercase px-3 py-1.5 rounded-none bg-brand-border-light text-brand-text border border-brand-border hover:bg-brand-border transition-colors disabled:opacity-50"
              >
                {isSavingRuntime ? 'Saving Settings...' : 'Save Server Settings'}
              </button>
            </div>
          </form>

          {/* Sandbox & Tools Section */}
          <div className="mt-4 border-t border-brand-border/60 pt-4 space-y-3">
            {allowSimulationMode ? (
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-brand-green bg-brand-bg border border-brand-border rounded-none h-3.5 w-3.5 shrink-0"
                  checked={useEmulator}
                  onChange={(e) => setUseEmulator(e.target.checked)}
                />
                <span className="text-[10px] font-mono text-brand-text leading-tight text-orange-400">
                  Use Sandbox Emulator. Bypasses Java/server.jar check & runs local simulation (Simulation Mode — Not Live Ready).
                </span>
              </label>
            ) : (
              <div className="text-[9px] font-mono text-brand-muted italic uppercase border border-brand-border bg-brand-card p-2">
                * Sandbox Emulator is locked (Requires <strong className="text-orange-400">ALLOW_SIMULATION_MODE=true</strong> in environment)
              </div>
            )}

            <div className="pt-3 border-t border-brand-border flex flex-col gap-2">
              <button
                type="button"
                onClick={handleDeleteWorld}
                disabled={isDeletingWorld}
                className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-none bg-red-950/20 text-red-400 border border-red-900/50 hover:bg-red-950/40 hover:text-red-300 font-mono font-bold text-[10px] uppercase transition-all disabled:opacity-50"
              >
                Delete Generated World Folder
              </button>
              {worldDeleteMessage && (
                <div className={`p-2 text-[9px] font-mono border ${
                  worldDeleteMessage.startsWith('SUCCESS')
                    ? 'bg-brand-green/10 text-brand-green border-brand-green/30'
                    : 'bg-red-950/40 text-red-400 border-red-500/30'
                }`}>
                  {worldDeleteMessage}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {startError && (
        <div className="mt-3 bg-red-950/40 border border-red-500/30 p-2.5 rounded-none text-[10px] font-mono text-red-400 leading-relaxed">
          <div className="font-bold uppercase flex items-center gap-1.5 mb-1 text-red-300">
            <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
            Startup Blocked
          </div>
          {startError}
        </div>
      )}

      {/* Control Buttons */}
      <div className="flex gap-3 mt-4 border-t border-brand-border pt-4">
        {serverStatus === 'stopped' || serverStatus === 'blocked' || serverStatus === 'failed' ? (
          <button
            onClick={handleStart}
            disabled={useEmulator ? false : (preflightReport ? (preflightReport.status === 'blocked' || !preflightReport.ready) : false)}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-none bg-brand-green hover:opacity-90 text-brand-bg font-mono font-bold text-xs uppercase transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play className="w-3.5 h-3.5 fill-brand-bg" /> Start Minecraft Server
          </button>
        ) : (
          <button
            onClick={onStopServer}
            disabled={serverStatus === 'stopping'}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-none bg-red-600 hover:bg-red-700 text-brand-text font-mono font-bold text-xs uppercase transition-all disabled:opacity-50"
          >
            <Square className="w-3.5 h-3.5 fill-brand-text" /> Stop Server Cleanly
          </button>
        )}
      </div>

      {serverStatus === 'running' && (
        <div className="mt-4 border-t border-brand-border pt-4">
          <div className="flex items-center gap-1.5 text-[10px] text-brand-muted mb-2 font-mono uppercase">
            <Radio className="w-3.5 h-3.5 text-brand-green animate-pulse" />
            <span>Runtime: <strong className="text-brand-green">{runtimeMode.toUpperCase()}</strong></span>
          </div>
          
          <form onSubmit={handleCommandSubmit} className="flex gap-2">
            <div className="relative flex-grow">
              <Terminal className="w-3.5 h-3.5 text-brand-muted absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Send terminal command (e.g. /say Hello)..."
                className="w-full text-xs bg-brand-card border border-brand-border rounded-none pl-9 pr-3 py-2 text-brand-text focus:outline-none focus:border-brand-green font-mono"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="text-xs bg-brand-border-light border border-brand-border hover:bg-brand-border px-4 py-2 text-brand-text rounded-none font-mono font-bold uppercase transition-colors"
            >
              Send
            </button>
          </form>
        </div>
      )}

      {(serverStatus === 'starting' || serverStatus === 'running' || serverStatus === 'stopping') && (
        <div className="mt-4 border border-brand-border bg-black/40">
          <div className="flex items-center gap-2 p-2 border-b border-brand-border bg-brand-card">
            <Activity className="w-4 h-4 text-brand-muted" />
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-brand-muted font-bold">Server Output Console</h3>
          </div>
          <div className="h-48 overflow-y-auto p-2 font-mono text-[10px] leading-relaxed text-brand-muted scrollbar-thin scrollbar-thumb-brand-border flex flex-col-reverse">
            <div>
              {serverLogs.map((log, idx) => (
                <div key={idx} className="whitespace-pre-wrap break-words">{log}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Preflight Diagnostics Panel */}
      <div id="preflight-diagnostics-panel" className="mt-4 border-t border-brand-border pt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-[10px] text-brand-muted font-mono uppercase">
            <CheckCircle className="w-3.5 h-3.5 text-brand-green" />
            <span>Preflight Diagnostics</span>
          </div>
          <button 
            type="button"
            onClick={checkPreflight}
            disabled={isCheckingPreflight}
            className="text-[8px] font-mono uppercase bg-brand-border px-1.5 py-0.5 hover:bg-brand-border-light text-brand-muted"
          >
            {isCheckingPreflight ? 'Checking...' : 'Refresh'}
          </button>
        </div>
        {preflightReport ? (
          <div className="grid grid-cols-3 gap-2 text-center text-[9px] font-mono uppercase tracking-wider">
            <div className={`p-1.5 border ${preflightReport.javaAvailable ? 'bg-brand-green/10 text-brand-green border-brand-green/30' : 'bg-red-950/20 text-red-400 border-red-900/40'}`}>
              Java: {preflightReport.javaAvailable ? 'OK' : 'MISSING'}
            </div>
            <div className={`p-1.5 border ${preflightReport.jarExists ? 'bg-brand-green/10 text-brand-green border-brand-green/30' : 'bg-red-950/20 text-red-400 border-red-900/40'}`}>
              Jar: {preflightReport.jarExists ? 'OK' : 'MISSING'}
            </div>
            <div className={`p-1.5 border ${preflightReport.eulaAccepted ? 'bg-brand-green/10 text-brand-green border-brand-green/30' : 'bg-red-950/20 text-red-400 border-red-900/40'}`}>
              EULA: {preflightReport.eulaAccepted ? 'OK' : 'REQUIRED'}
            </div>
          </div>
        ) : (
          <span className="text-[9px] font-mono text-brand-muted italic">Running diagnostics...</span>
        )}
      </div>

      {/* Protocol Mock Diagnostic Section */}
      <div className="mt-4 border-t border-brand-border pt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-[10px] text-brand-muted font-mono uppercase">
            <Activity className="w-3.5 h-3.5 text-brand-green" />
            <span>Protocol Mock Diagnostic</span>
          </div>
          <span className="text-[9px] font-mono text-brand-muted border border-brand-border px-1 uppercase">Evidence: protocol-mock</span>
        </div>
        
        <p className="text-[10px] text-brand-muted mb-3 font-mono leading-relaxed">
          Launches a lightweight TCP socket server on port {port} & connects a mock Mineflayer client to verify server lifecycle, socket bindings, and Minecraft packet handshaking.
        </p>

        <button
          type="button"
          disabled={isSmokeTesting || serverStatus !== 'stopped'}
          onClick={handleRunDiagnostic}
          className={`w-full py-1.5 px-3 font-mono text-[10px] font-bold uppercase tracking-wider border rounded-none flex items-center justify-center gap-2 transition-all ${
            serverStatus !== 'stopped'
              ? 'bg-brand-border text-brand-muted border-brand-border cursor-not-allowed opacity-40'
              : 'bg-brand-border-light text-brand-text border-brand-border hover:bg-brand-border'
          }`}
        >
          {isSmokeTesting ? (
            <>
              <div className="w-2.5 h-2.5 border-2 border-brand-green border-t-transparent rounded-full animate-spin"></div>
              Executing Diagnostic Handshake...
            </>
          ) : (
            'Execute Protocol Mock Diagnostic'
          )}
        </button>

        {serverStatus !== 'stopped' && (
          <p className="text-[9px] text-yellow-500/80 font-mono mt-1 italic">
            * Server must be STOPPED to bind diagnostic port {port} for testing.
          </p>
        )}

        {smokeTestResult && (
          <div className="mt-3 border border-brand-border bg-brand-card p-3">
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-brand-border">
              <span className="text-[10px] font-mono uppercase font-bold text-brand-muted">Handshake Diagnostics</span>
              <span className={`text-[10px] font-mono font-bold uppercase flex items-center gap-1 ${smokeTestResult.success ? 'text-brand-green' : 'text-red-500'}`}>
                {smokeTestResult.success ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5 text-brand-green animate-pulse" /> Success
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 animate-bounce" /> Failed
                  </>
                )}
              </span>
            </div>
            
            <div className="max-h-40 overflow-y-auto font-mono text-[9px] text-brand-muted space-y-1 scrollbar-thin scrollbar-thumb-brand-border">
              {smokeTestResult.logs.map((log, idx) => (
                <div key={idx} className={`leading-relaxed border-l-2 pl-2 ${
                  log.includes('SUCCESSFUL') || log.includes('Success') 
                    ? 'border-brand-green text-brand-text font-bold' 
                    : log.includes('Error') || log.includes('Failed')
                    ? 'border-red-500 text-red-400'
                    : 'border-brand-border'
                }`}>
                  {log}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
