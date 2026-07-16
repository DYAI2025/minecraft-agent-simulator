import React, { useState, useEffect } from 'react';
import { LLMProviderConfig, WorkspaceConfig, BotConfig } from '../types/index.ts';
import { ShieldCheck, Server, AlertTriangle, Play, Save, CheckCircle, Cpu, Clock, Users, ArrowRight } from 'lucide-react';

interface SetupReadinessPanelProps {
  workspace: WorkspaceConfig | null;
  providers: (LLMProviderConfig & { isConfigured: boolean })[];
  botProfiles: any[];
  serverStatus: 'stopped' | 'validating' | 'blocked' | 'starting' | 'running' | 'stopping' | 'failed';
  runtimeMode: string;
  allowSimulationMode: boolean;
  onSaveWorkspace: (config: Partial<WorkspaceConfig>) => Promise<void>;
  onTriggerTestProvider: (providerId: string) => Promise<void>;
}

export const SetupReadinessPanel: React.FC<SetupReadinessPanelProps> = ({
  workspace,
  providers,
  botProfiles,
  serverStatus,
  runtimeMode,
  allowSimulationMode,
  onSaveWorkspace,
  onTriggerTestProvider,
}) => {
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [intervalMs, setIntervalMs] = useState<number>(8000);
  const [selectedBotIds, setSelectedBotIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  // Sync state with workspace prop changes
  useEffect(() => {
    if (workspace) {
      setSelectedProvider(workspace.activeProviderId || workspace.defaultProviderId || 'gemini');
      setIntervalMs(workspace.intervalMs || 8000);
      setSelectedBotIds(workspace.selectedBotProfileIds || []);
    }
  }, [workspace]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await onSaveWorkspace({
        activeProviderId: selectedProvider,
        intervalMs: Number(intervalMs),
        selectedBotProfileIds: selectedBotIds,
        lastAppliedAt: new Date().toISOString(),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save workspace config:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleBotProfile = (id: string) => {
    setSelectedBotIds((prev) =>
      prev.includes(id) ? prev.filter((bId) => bId !== id) : [...prev, id]
    );
  };

  // Evaluate readiness checklists
  const activeProviderObj = providers.find((p) => p.id === selectedProvider);
  const isLLMConfigured = !!activeProviderObj?.isConfigured;

  const hasActiveScenario = !!workspace?.activeScenarioId;

  // Since Java binary isn't guaranteed in sandboxed/deployed preview containers,
  // we check runtimeMode or if serverStatus is 'blocked'
  const isJavaAvailable = runtimeMode === 'java-server' && serverStatus !== 'blocked';
  
  // Compute overall readiness status
  let readinessState: 'blocked' | 'needs_attention' | 'not_live_ready' | 'ready_to_configure' | 'workspace_ready' | 'ready_for_live_boundary_smoke' = 'blocked';
  let readinessColor = 'text-red-500 bg-red-500/10 border-red-500/20';
  let readinessLabel = 'Blocked / Not Ready';
  let readinessExplanation = 'No active scenario or active provider loaded.';

  const providerTestStatus = activeProviderObj?.lastTest?.status || 'untested';

  if (!hasActiveScenario) {
    readinessState = 'blocked';
    readinessColor = 'text-red-500 bg-red-500/10 border-red-500/20';
    readinessLabel = 'Blocked: Scenario Missing';
    readinessExplanation = 'No active scenario template has been selected. Please load or create a scenario to begin.';
  } else if (selectedBotIds.length === 0) {
    readinessState = 'blocked';
    readinessColor = 'text-red-500 bg-red-500/10 border-red-500/20';
    readinessLabel = 'Blocked: No Bots Selected';
    readinessExplanation = 'No bot profiles have been selected for this workspace. Please select participating bots below.';
  } else if (!isLLMConfigured) {
    readinessState = 'blocked';
    readinessColor = 'text-red-500 bg-red-500/10 border-red-500/20';
    readinessLabel = 'Blocked: Credentials Missing';
    readinessExplanation = 'The active LLM provider requires an API key. Please configure and save your credentials.';
  } else if (providerTestStatus === 'failed') {
    readinessState = 'blocked';
    readinessColor = 'text-red-500 bg-red-500/10 border-red-500/20';
    readinessLabel = 'Blocked: Connection Failed';
    readinessExplanation = `LLM test failed with error: ${activeProviderObj?.lastTest?.message || 'unknown error'}. Check API key and network connection.`;
  } else if (providerTestStatus === 'untested') {
    readinessState = 'needs_attention';
    readinessColor = 'text-orange-500 bg-orange-500/10 border-orange-500/20';
    readinessLabel = 'Needs Attention: Untested LLM';
    readinessExplanation = 'LLM is configured, but the connection has not been tested. Please click "Test Connection" to verify.';
  } else if (!isJavaAvailable || serverStatus === 'blocked') {
    readinessState = 'not_live_ready';
    readinessColor = 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
    readinessLabel = 'Not Live Ready';
    readinessExplanation = 'The real Minecraft Java server environment is currently offline or unavailable.';
  } else if (allowSimulationMode) {
    readinessState = 'not_live_ready';
    readinessColor = 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
    readinessLabel = 'Not Live Ready (Simulation Mode)';
    readinessExplanation = 'The workspace is configured for simulation/sandbox mode. Live Minecraft E2E execution is not fully verified.';
  } else {
    readinessState = 'ready_for_live_boundary_smoke';
    readinessColor = 'text-brand-green bg-brand-green/10 border-brand-green/20';
    readinessLabel = 'Ready for Live Boundary Smoke';
    readinessExplanation = 'Verified workspace! LLM provider test passed, bots selected, and active scenario is applied. Ready for live boundary verification.';
  }

  const handleTestProvider = async (pId: string) => {
    setTestingId(pId);
    try {
      await onTriggerTestProvider(pId);
    } catch (e) {
      console.warn(e);
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div id="readiness-panel" data-readiness-state={readinessState} className="bg-brand-aside border border-brand-border rounded-none p-4 shadow-none flex flex-col space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-brand-border pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-brand-green" />
          <h2 id="readiness-title" className="text-[10px] font-mono uppercase tracking-widest text-brand-muted font-bold">Workspace // Readiness Checklist</h2>
        </div>
        <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 border ${readinessColor}`}>
          {readinessLabel}
        </span>
      </div>

      {/* Explanation Banner */}
      <div className={`p-2.5 border text-[9.5px] font-mono leading-normal rounded-none ${
        readinessState === 'blocked'
          ? 'bg-red-500/5 border-red-500/10 text-red-400'
          : readinessState === 'needs_attention'
          ? 'bg-orange-500/5 border-orange-500/10 text-orange-400'
          : readinessState === 'not_live_ready'
          ? 'bg-yellow-500/5 border-yellow-500/10 text-yellow-400'
          : 'bg-brand-green/5 border-brand-green/10 text-brand-green-light'
      }`}>
        <div className="flex gap-1.5 items-start">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold uppercase tracking-wider block mb-0.5">Workspace Status Report //</span>
            {readinessExplanation}
          </div>
        </div>
      </div>

      {/* Checklist items */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Prereq 1: LLM Connection */}
        <div className="p-3 bg-brand-panel border border-brand-border flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-1">
              <span className="text-[9px] font-mono text-brand-muted uppercase">01 // LLM Engine</span>
              {isLLMConfigured ? (
                <span className={`text-[8px] font-mono font-bold uppercase border px-1 py-0.2 ${
                  providerTestStatus === 'passed'
                    ? 'text-brand-green bg-brand-green/10 border-brand-green/20'
                    : providerTestStatus === 'failed'
                    ? 'text-red-500 bg-red-500/10 border-red-500/20'
                    : 'text-orange-400 bg-orange-400/10 border-orange-400/20'
                }`}>{providerTestStatus === 'passed' ? 'PASSED' : providerTestStatus === 'failed' ? 'FAILED' : 'UNTESTED'}</span>
              ) : (
                <span className="text-[8px] text-red-500 font-mono font-bold uppercase bg-red-500/10 border border-red-500/20 px-1 py-0.2">MISSING KEY</span>
              )}
            </div>
            <h4 className="text-xs font-mono font-bold mt-1 text-brand-text">
              {activeProviderObj?.name || 'Google Gemini'}
            </h4>
            <p className="text-[9px] text-brand-muted font-mono mt-1 leading-tight uppercase">
              Model: {activeProviderObj?.defaultModel || 'gemini-2.5-flash'}
            </p>

            {activeProviderObj?.lastTest && (
              <div className="mt-2 text-[8px] font-mono border-t border-brand-border/40 pt-1.5 space-y-0.5">
                {activeProviderObj.lastTest.testedAt && (
                  <div className="text-brand-muted">
                    TESTED: {new Date(activeProviderObj.lastTest.testedAt).toLocaleTimeString()}
                  </div>
                )}
                {activeProviderObj.lastTest.errorCode && (
                  <div className="text-red-400 font-bold">
                    CODE: {activeProviderObj.lastTest.errorCode}
                  </div>
                )}
                {activeProviderObj.lastTest.message && (
                  <div className="text-brand-muted max-h-12 overflow-y-auto leading-normal">
                    {activeProviderObj.lastTest.message}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="mt-3">
            <button
              id={`test-provider-${selectedProvider}`}
              disabled={testingId !== null}
              onClick={() => handleTestProvider(selectedProvider)}
              className="w-full text-center py-1 text-[9px] font-mono uppercase font-bold border border-brand-border hover:border-brand-green text-brand-muted hover:text-brand-green transition-all cursor-pointer"
            >
              {testingId === selectedProvider ? 'Verifying...' : 'Test Connection'}
            </button>
          </div>
        </div>

        {/* Prereq 2: Active Scenario */}
        <div className="p-3 bg-brand-panel border border-brand-border flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-1">
              <span className="text-[9px] font-mono text-brand-muted uppercase">02 // Active Scenario</span>
              {hasActiveScenario ? (
                <span className="text-[8px] text-brand-green font-mono font-bold uppercase bg-brand-green/10 border border-brand-green/20 px-1 py-0.2">APPLIED</span>
              ) : (
                <span className="text-[8px] text-orange-500 font-mono font-bold uppercase bg-orange-500/10 border border-orange-500/20 px-1 py-0.2">DEFAULT</span>
              )}
            </div>
            <h4 className="text-xs font-mono font-bold mt-1 text-brand-text truncate">
              {workspace?.activeScenarioId || 'None (Default Fallback)'}
            </h4>
            <p className="text-[9px] text-brand-muted font-mono mt-1 leading-tight uppercase">
              {workspace?.lastAppliedAt 
                ? `Last applied: ${new Date(workspace.lastAppliedAt).toLocaleTimeString()}`
                : 'Not applied recently'}
            </p>
          </div>
          <div className="mt-3">
            <span className="text-[8px] text-brand-muted font-mono block text-center uppercase border border-brand-border/40 py-1">
              {hasActiveScenario ? 'Scenario Registered' : 'Using Temporary Preset'}
            </span>
          </div>
        </div>

        {/* Prereq 3: Minecraft server */}
        <div className="p-3 bg-brand-panel border border-brand-border flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-1">
              <span className="text-[9px] font-mono text-brand-muted uppercase">03 // Server Environment</span>
              {allowSimulationMode ? (
                <span className="text-[8px] text-brand-green font-mono font-bold uppercase bg-brand-green/10 border border-brand-green/20 px-1 py-0.2">SANDBOX ENABLED</span>
              ) : (
                <span className="text-[8px] text-red-500 font-mono font-bold uppercase bg-red-500/10 border border-red-500/20 px-1 py-0.2">JAVA BLOCKED</span>
              )}
            </div>
            <h4 className="text-xs font-mono font-bold mt-1 text-brand-text">
              {allowSimulationMode ? 'Local Sandbox Emulator' : 'Real Java Server'}
            </h4>
            <p className="text-[9px] text-brand-muted font-mono mt-1 leading-tight uppercase">
              Mode: {runtimeMode === 'java-server' ? 'Java Host' : 'Simulator'}
            </p>
          </div>
          <div className="mt-3">
            {!isJavaAvailable && (
              <div className="text-[8px] text-red-400 font-mono border border-red-950/20 bg-red-950/10 p-1.5 leading-tight rounded-none">
                Install JRE to run real server:
                <code className="block select-all bg-brand-bg px-1 py-0.5 mt-1 border border-brand-border text-brand-text text-[7.5px] font-mono">
                  sudo apt-get install openjdk-17-jre-headless
                </code>
              </div>
            )}
            {isJavaAvailable && (
              <span className="text-[8px] text-brand-green font-mono block text-center uppercase border border-brand-green/20 bg-brand-green/5 py-1">
                Java Runtime Ready
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Workspace Configuration Inputs */}
      <div className="p-4 bg-brand-panel border border-brand-border space-y-4">
        <div className="flex items-center gap-2 border-b border-brand-border pb-2">
          <Server className="w-3.5 h-3.5 text-brand-muted" />
          <h3 className="text-[10px] font-mono uppercase font-bold text-brand-text">Active Workspace V2 Settings</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Provider and Tick Rate */}
          <div className="space-y-3">
            <div>
              <label htmlFor="active-provider-select" className="block text-[9px] font-mono text-brand-muted uppercase mb-1">Active LLM Provider</label>
              <select
                id="active-provider-select"
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                className="w-full bg-brand-bg text-xs font-mono text-brand-text border border-brand-border px-2.5 py-1.5 rounded-none focus:outline-none focus:border-brand-green"
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.isConfigured ? '✓' : '(Unconfigured)'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="tick-interval-input" className="block text-[9px] font-mono text-brand-muted uppercase mb-1">Simulation Loop Speed (Interval ms)</label>
              <div className="relative flex items-center">
                <Clock className="absolute left-2.5 w-3.5 h-3.5 text-brand-muted" />
                <input
                  id="tick-interval-input"
                  type="number"
                  min="2000"
                  max="60000"
                  step="1000"
                  value={intervalMs}
                  onChange={(e) => setIntervalMs(Math.max(1000, Number(e.target.value)))}
                  className="w-full bg-brand-bg text-xs font-mono text-brand-text border border-brand-border pl-8 pr-3 py-1.5 rounded-none focus:outline-none focus:border-brand-green"
                  placeholder="8000"
                />
              </div>
            </div>
          </div>

          {/* Bot Profile checklist */}
          <div>
            <label className="block text-[9px] font-mono text-brand-muted uppercase mb-1">Participating Bot Profiles</label>
            <div className="border border-brand-border bg-brand-bg h-28 overflow-y-auto p-1.5 space-y-1 rounded-none">
              {botProfiles.length === 0 ? (
                <div className="text-[9px] font-mono text-brand-muted uppercase text-center py-8">
                  No bot profiles registered
                </div>
              ) : (
                botProfiles.map((bot) => {
                  const isChecked = selectedBotIds.includes(bot.id);
                  return (
                    <div
                      key={bot.id}
                      onClick={() => toggleBotProfile(bot.id)}
                      className={`flex items-center justify-between p-1 px-2 border cursor-pointer select-none transition-colors ${
                        isChecked
                          ? 'border-brand-green bg-brand-green/5 text-brand-text font-bold'
                          : 'border-brand-border hover:border-brand-border-light text-brand-muted'
                      }`}
                    >
                      <span className="text-[10px] font-mono">{bot.name}</span>
                      <span className="text-[8px] font-mono uppercase text-brand-muted">
                        {bot.role}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Save Workspace Actions */}
        <div className="flex items-center justify-between border-t border-brand-border pt-3">
          <div className="flex items-center gap-1.5">
            {saveSuccess && (
              <span className="text-[9px] font-mono text-brand-green font-bold bg-brand-green/10 border border-brand-green/20 px-2 py-0.5 uppercase animate-fade-in">
                ✓ Config Saved & Applied
              </span>
            )}
          </div>
          <button
            id="save-workspace-btn"
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase px-4 py-2 rounded-none bg-brand-green/10 text-brand-green border border-brand-green/30 hover:bg-brand-green/20 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            {isSaving ? 'Applying...' : 'Save Workspace Config'}
          </button>
        </div>
      </div>
    </div>
  );
};
