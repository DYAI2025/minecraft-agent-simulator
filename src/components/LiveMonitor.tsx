import React, { useEffect, useRef, useState, useMemo } from 'react';
import { BotConfig, EventLog, EventType, Scenario } from '../types/index.js';
import { Play, Pause, Square, ChevronRight, Activity, Terminal, ShieldAlert, Heart, User, Sparkles, Brain, X, ActivitySquare } from 'lucide-react';
import { BarChart, Bar, ResponsiveContainer, Tooltip } from 'recharts';

interface LiveMonitorProps {
  isSimulating: boolean;
  currentStep: number;
  activeScenario?: Scenario;
  bots: BotConfig[];
  logs: EventLog[];
  onStartSimulation: () => Promise<void>;
  onStopSimulation: () => Promise<void>;
  onStepManual: () => Promise<void>;
}

export const LiveMonitor: React.FC<LiveMonitorProps> = ({
  isSimulating,
  currentStep,
  activeScenario,
  bots,
  logs,
  onStartSimulation,
  onStopSimulation,
  onStepManual,
}) => {
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);

  const timelineData = useMemo(() => {
    if (logs.length === 0) return [];

    const NUM_BUCKETS = 60;
    const times = logs.map(l => new Date(l.timestamp).getTime());
    const minTime = Math.min(...times);
    let maxTime = Math.max(...times);

    // Add minimal spread to prevent division by zero and look better
    if (maxTime - minTime < 60000) {
      maxTime = minTime + 60000;
    }

    const bucketSize = (maxTime - minTime) / NUM_BUCKETS;

    const buckets = Array.from({ length: NUM_BUCKETS }, (_, i) => ({
      time: minTime + i * bucketSize,
      actions: 0,
      thinks: 0,
    }));

    logs.forEach(log => {
      const time = new Date(log.timestamp).getTime();
      let bucketIndex = Math.floor((time - minTime) / bucketSize);
      if (bucketIndex >= NUM_BUCKETS) bucketIndex = NUM_BUCKETS - 1;
      if (bucketIndex < 0) bucketIndex = 0;

      if (log.type === EventType.BOT_ACTION) {
        buckets[bucketIndex].actions += 1;
      } else if (log.type === EventType.BOT_THINK) {
        buckets[bucketIndex].thinks += 1;
      }
    });

    return buckets.map(b => ({
      time: new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      actions: b.actions,
      thinks: b.thinks,
    }));
  }, [logs]);

  // Removed auto-scroll effect to prevent jumping when user is reading logs
  // useEffect(() => {
  //   terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  // }, [logs]);

  const getLogStyle = (type: EventType) => {
    switch (type) {
      case EventType.BOT_THINK: return 'text-purple-400 font-bold';
      case EventType.BOT_ACTION: return 'text-amber-300 font-bold';
      case EventType.BOT_CHAT: return 'text-brand-green italic';
      case EventType.LLM_CALL: return 'text-blue-300 text-[10px]';
      case EventType.SERVER_START:
      case EventType.SERVER_STOP: return 'text-blue-400 font-bold';
      case EventType.SYSTEM: return 'text-brand-muted font-mono text-[10px]';
      case EventType.ERROR: return 'text-red-400 font-bold border-l border-red-500 pl-2 bg-red-500/5 py-0.5';
      default: return 'text-brand-text';
    }
  };

  const getLogTag = (type: EventType) => {
    switch (type) {
      case EventType.BOT_THINK: return 'THINK';
      case EventType.BOT_ACTION: return 'ACTION';
      case EventType.BOT_CHAT: return 'CHAT';
      case EventType.LLM_CALL: return 'API';
      case EventType.SERVER_START: return 'START';
      case EventType.SERVER_STOP: return 'STOP';
      case EventType.SYSTEM: return 'SYS';
      case EventType.ERROR: return 'ERR';
      default: return 'INFO';
    }
  };

  const getLogTagColor = (type: EventType) => {
    switch (type) {
      case EventType.BOT_THINK: return 'bg-purple-950/40 text-purple-300 border-purple-800/40';
      case EventType.BOT_ACTION: return 'bg-amber-950/40 text-amber-300 border-amber-800/40';
      case EventType.BOT_CHAT: return 'bg-brand-green/10 text-brand-green border-brand-green/30';
      case EventType.LLM_CALL: return 'bg-blue-950/40 text-blue-300 border-blue-800/40';
      case EventType.ERROR: return 'bg-red-950/40 text-red-300 border-red-800/40';
      default: return 'bg-brand-panel text-brand-muted border-brand-border';
    }
  };

  return (
    <div id="live-monitor" className="bg-brand-aside border border-brand-border rounded-none p-4 shadow-none flex flex-col h-full">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-brand-border pb-3 mb-3 gap-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-brand-green animate-pulse" />
          <div>
            <h2 className="text-[10px] font-mono uppercase tracking-widest text-brand-muted font-bold">Autonomy Thread // ACTIVE_MONITOR</h2>
            {activeScenario && (
              <span className="text-[10px] text-brand-text font-mono block">Scenario: <strong>{activeScenario.title}</strong></span>
            )}
          </div>
        </div>

        {/* Action button rows */}
        <div className="flex items-center gap-2 w-full sm:w-auto font-mono">
          {isSimulating ? (
            <button
              onClick={onStopSimulation}
              className="flex-grow sm:flex-grow-0 flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase px-3 py-1.5 bg-red-600 hover:bg-red-700 text-brand-text border brand-border rounded-none transition-colors"
            >
              <Pause className="w-3.5 h-3.5 fill-brand-text" /> Pause Loop
            </button>
          ) : (
            <>
              <button
                onClick={onStartSimulation}
                disabled={bots.length === 0}
                className="flex-grow sm:flex-grow-0 flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase px-3 py-1.5 bg-brand-green text-brand-bg rounded-none hover:opacity-90 transition-all disabled:opacity-40"
              >
                <Play className="w-3.5 h-3.5 fill-brand-bg" /> Start Loop
              </button>
              <button
                onClick={onStepManual}
                disabled={bots.length === 0}
                className="flex-grow sm:flex-grow-0 flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase px-3 py-1.5 bg-brand-border-light border brand-border text-brand-text rounded-none hover:bg-brand-border transition-colors disabled:opacity-40"
              >
                <ChevronRight className="w-3.5 h-3.5 text-brand-green" /> Step Manual
              </button>
            </>
          )}
        </div>
      </div>

      {/* Action Timeline Visualization */}
      <div className="w-full mb-4 bg-brand-bg/50 border brand-border p-2 flex flex-col gap-1">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <ActivitySquare className="w-3 h-3 text-brand-muted" />
            <span className="text-[9px] font-mono font-bold text-brand-muted uppercase tracking-widest">Action Frequency Timeline</span>
          </div>
          <div className="flex items-center gap-3 text-[8px] font-mono font-bold uppercase">
            <div className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-300 block"></span> Actions</div>
            <div className="flex items-center gap-1"><span className="w-2 h-2 bg-purple-400 block"></span> Thoughts</div>
          </div>
        </div>
        <div className="h-12 w-full mt-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={timelineData} barCategoryGap={1}>
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-brand-panel border brand-border p-1.5 text-[9px] font-mono shadow-md z-50">
                        <div className="text-brand-muted mb-1 font-bold">{payload[0].payload.time}</div>
                        <div className="text-amber-300">Actions: {payload[0].payload.actions}</div>
                        <div className="text-purple-400">Thoughts: {payload[0].payload.thinks}</div>
                      </div>
                    );
                  }
                  return null;
                }}
                cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
              />
              <Bar dataKey="actions" stackId="a" fill="#fcd34d" isAnimationActive={false} />
              <Bar dataKey="thinks" stackId="a" fill="#c084fc" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-grow">
        {/* Left Column: Objectives & Bot Vitals */}
        <div className="lg:col-span-1 space-y-4 flex flex-col">
          {/* Scenario Objectives */}
          {activeScenario && (
            <div className="bg-brand-bg border brand-border rounded-none p-3.5">
              <h3 className="text-[10px] font-mono font-bold text-brand-green uppercase tracking-widest mb-2.5 block">// MISSION OBJECTIVES</h3>
              <div className="space-y-2">
                {activeScenario.objectives.map((obj, i) => {
                  const isHarvested = bots.some(b => b.inventory['oak_log'] && b.inventory['oak_log'] >= 1) && obj.includes('logs');
                  const isPlanks = bots.some(b => b.inventory['oak_planks'] && b.inventory['oak_planks'] >= 1) && obj.includes('Planks');
                  const isCrafted = bots.some(b => b.inventory['crafting_table'] && b.inventory['crafting_table'] >= 1) && obj.includes('Table');
                  const completed = isHarvested || isPlanks || isCrafted || currentStep > 3;

                  return (
                    <div key={i} className="flex items-start gap-2.5 text-xs font-mono">
                      <input
                        type="checkbox"
                        checked={!!completed}
                        readOnly
                        className="mt-0.5 w-3 h-3 rounded-none border-border text-brand-green bg-brand-bg focus:ring-0 cursor-default"
                      />
                      <span className={completed ? 'text-brand-muted line-through opacity-60' : 'text-brand-text'}>
                        {obj}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Vitals of bots */}
          <div className="bg-brand-bg border brand-border rounded-none p-3.5 flex-grow overflow-y-auto max-h-[300px] lg:max-h-[380px]">
            <h3 className="text-[10px] font-mono font-bold text-brand-green uppercase tracking-widest mb-2.5 block">// ACTIVE LIFEFORMS (CLICK FOR DEEP PROFILE)</h3>

            {bots.length > 0 ? (
              <div className="space-y-4">
                {bots.map((bot) => (
                  <div
                    key={bot.id}
                    onClick={() => setSelectedBotId(selectedBotId === bot.id ? null : bot.id)}
                    className={`border-b brand-border pb-3 last:border-b-0 last:pb-0 font-mono cursor-pointer transition-all hover:bg-brand-panel/60 p-2 -mx-2 rounded-none select-none ${
                      selectedBotId === bot.id
                        ? 'bg-brand-green/5 border border-dashed border-brand-green/40 p-2'
                        : 'border border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-brand-green" />
                        <span className="text-xs font-bold text-brand-text">{bot.name}</span>
                        {selectedBotId === bot.id && (
                          <span className="text-[8px] font-mono bg-brand-green/20 text-brand-green border border-brand-green/30 px-1 py-0 rounded-none uppercase tracking-widest font-bold">
                            INSPECTING
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-brand-muted">
                        [{bot.x}, {bot.y}, {bot.z}]
                      </span>
                    </div>
                    <div className="text-[9px] text-brand-muted mb-2 italic uppercase">ROLE: {bot.role}</div>

                    {/* Vitals metrics */}
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div className="flex items-center gap-1 bg-brand-panel border brand-border/60 px-2 py-0.5 rounded-none">
                        <Heart className="w-3 h-3 text-red-500 fill-red-500" />
                        <span className="text-[9px] font-mono text-brand-text font-bold">{bot.health}/20 HP</span>
                      </div>
                      <div className="flex items-center gap-1 bg-brand-panel border brand-border/60 px-2 py-0.5 rounded-none">
                        <Sparkles className="w-3 h-3 text-brand-green" />
                        <span className="text-[9px] font-mono text-brand-text font-bold">{bot.food}/20 F</span>
                      </div>
                    </div>

                    {/* Inventory list */}
                    <div>
                      <span className="text-[9px] text-brand-muted block font-mono uppercase mb-1">INVENTORY_CONTENTS:</span>
                      {Object.keys(bot.inventory).length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(bot.inventory).map(([item, qty]) => (
                            <div key={item} className="flex items-center gap-1 bg-brand-panel border brand-border/60 px-2 py-0.5 rounded-none text-[9px] font-mono">
                              <span className="font-medium">{item}:</span> <span>{qty}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[9px] text-brand-muted font-mono">None</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[10px] text-brand-muted font-mono italic">No active bots.</p>
            )}
          </div>
        }

        {/* Right Column: Logs */}
        <div className="lg:col-span-2 space-y-4 flex flex-col h-full">
          <h3 className="text-[10px] font-mono font-bold text-brand-green uppercase tracking-widest mb-2.5 block">// SYSTEM LOGS</h3>
          <div
            className="bg-brand-bg border brand-border rounded-none p-3.5 flex-grow overflow-y-auto"
          >
            {logs.map((log, index) => (
              <div key={log.id} className="mb-2 last:mb-0">
                <div className="flex items-start gap-2">
                  <div className="flex items-center gap-1 text-[9px] font-mono">
                    <span className={`${getLogTagColor(log.type)} px-1.5 py-0.5 rounded text-[8px] font-mono`}>{getLogTag(log.type)}</span>
                    <span className="ml-1 text-[9px] font-mono text-brand-muted">[new Date(log.timestamp).toLocaleTimeString()]</span>
                  </div>
                  <div className="flex-1 ml-2 space-y-0.5 text-[9px] font-mono leading-relaxed" style={{ whiteSpace: 'pre-wrap' }}>
                    <span className={`${getLogStyle(log.type)}`}>{log.message}</span>
                    {log.meta && Object.keys(log.meta).length > 0 && (
                      <div className="mt-1 text-[8px] font-mono text-brand-muted">
                        {JSON.stringify(log.meta)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Bot Insights (when a bot is selected) */}
        {selectedBotId && bots.find(b => b.id === selectedBotId) && (
          <div className="lg:col-span-2 space-y-4 flex flex-col h-full">
            <h3 className="text-[10px] font-mono font-bold text-brand-green uppercase tracking-widest mb-2.5 block">// BOT INSIGHTS</h3>
            <div className="bg-brand-bg border brand-border rounded-none p-3.5 flex-grow overflow-y-auto">
              {/* Placeholder for detailed bot info */}
              <p className="text-[10px] text-brand-muted font-mono italic">Detailed bot view coming soon...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};