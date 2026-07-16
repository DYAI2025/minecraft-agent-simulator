import { promises as fs } from 'fs';
import path from 'path';
import { getStoragePath } from '../config/storage-paths.js';
import { EventLog, EventType, RunManifest, MinecraftServerConfig, Scenario } from '../types/index.js';

function redactSecrets(data: any): any {
  if (!data) return data;
  if (typeof data === 'string') {
    return data
      .replace(/AIzaSy[A-Za-z0-9_-]{33}/g, '[REDACTED_API_KEY]')
      .replace(/sk-[A-Za-z0-9]{32,}/g, '[REDACTED_API_KEY]');
  }
  if (Array.isArray(data)) {
    return data.map(item => redactSecrets(item));
  }
  if (typeof data === 'object') {
    const redacted: any = {};
    for (const key of Object.keys(data)) {
      if (key.toLowerCase().includes('apikey') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('key')) {
        redacted[key] = '[REDACTED_API_KEY]';
      } else {
        redacted[key] = redactSecrets(data[key]);
      }
    }
    return redacted;
  }
  return data;
}

export class EventStoreService {
  private static instance: EventStoreService | null = null;
  private currentRun: RunManifest | null = null;
  private allLogs: EventLog[] = [];
  private onEventCallbacks: ((event: EventLog) => void)[] = [];
  private currentStep = 0;
  private lastBotThinkByBotId: Record<string, { providerId: string; model: string }> = {};

  private constructor() {}

  public static getInstance(): EventStoreService {
    if (!this.instance) {
      this.instance = new EventStoreService();
    }
    return this.instance;
  }

  public registerEventCallback(cb: (event: EventLog) => void) {
    this.onEventCallbacks.push(cb);
  }

  public async startRun(
    scenarioTitle: string,
    serverConfig: MinecraftServerConfig,
    scenario?: Scenario,
    originalMarkdown?: string
  ) {
    const runId = `run_${Date.now()}`;
    this.currentRun = {
      id: runId,
      startTime: new Date().toISOString(),
      scenarioTitle,
      serverConfig,
      status: 'running',
      logs: [],
      research: scenario?.research,
      scenario,
    };
    this.allLogs = [];
    this.currentStep = 0;
    this.lastBotThinkByBotId = {};

    // Pre-create runs directory and run-specific directory immediately, and save start files
    try {
      const runsDir = getStoragePath('runs');
      const runDir = path.join(runsDir, runId);
      await fs.mkdir(runDir, { recursive: true });

      // Save start-time files as required by S7-004
      await fs.writeFile(path.join(runDir, 'manifest.json'), JSON.stringify(this.currentRun, null, 2));

      const mdContent = originalMarkdown || (scenario ? `# ${scenario.title}\n\n${scenario.description}` : `# Custom Simulation\n\nNo scenario markdown provided.`);
      await fs.writeFile(path.join(runDir, 'scenario.original.md'), mdContent);

      const parsedContent = scenario || { title: scenarioTitle, description: '', objectives: [], bots: [] };
      await fs.writeFile(path.join(runDir, 'scenario.parsed.json'), JSON.stringify(parsedContent, null, 2));
    } catch (err) {
      console.error('Failed to pre-create and write start-time run files:', err);
    }

    this.addEvent(EventType.SYSTEM, `Simulation Run [${runId}] started for Scenario: "${scenarioTitle}".`);
  }

  public endRun(status: 'completed' | 'failed' | 'idle') {
    if (!this.currentRun) return;

    this.currentRun.status = status;
    this.currentRun.endTime = new Date().toISOString();
    this.currentRun.logs = [...this.allLogs];

    this.addEvent(EventType.SYSTEM, `Simulation Run [${this.currentRun.id}] ended with status: ${status}.`);

    // Persist full manifest to disk in background
    this.saveManifestToDisk(this.currentRun);
    this.currentRun = null;
  }

  public addEvent(type: EventType, message: string, botId?: string, botName?: string, details?: Record<string, any>) {
    const event: EventLog = {
      id: `evt_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      type,
      botId,
      botName,
      message,
      details,
    };

    this.allLogs.push(event);
    if (this.currentRun) {
      this.currentRun.logs.push(event);
    }

    // Real-time tracking of step index
    if (type === EventType.SYSTEM && message.includes('Simulation Step #')) {
      const match = message.match(/Simulation Step #(\d+)/);
      if (match) {
        this.currentStep = parseInt(match[1], 10);
      }
    }

    // Real-time tracking of thinking provider/model
    if (type === EventType.BOT_THINK) {
      this.lastBotThinkByBotId[botId || 'unknown'] = {
        providerId: details?.providerId || 'unknown',
        model: details?.model || 'unknown',
      };
    }

    // Continuous file appending when a run is active
    if (this.currentRun) {
      const runId = this.currentRun.id;
      const runsDir = getStoragePath('runs');
      const runDir = path.join(runsDir, runId);

      // Deeply redact secrets from nested data copied for events
      const redactedEvent = redactSecrets(event);

      // 1. Append immediately to events.jsonl and event-stream.jsonl
      fs.appendFile(path.join(runDir, 'events.jsonl'), JSON.stringify(redactedEvent) + '\n').catch((err) => {
        console.error(`[EVIDENCE ERROR] Failed writing to events.jsonl for run ${runId}:`, err);
      });
      fs.appendFile(path.join(runDir, 'event-stream.jsonl'), JSON.stringify(redactedEvent) + '\n').catch(() => {});

      // 2. Append immediately to provider-calls.redacted.jsonl
      if (type === EventType.LLM_CALL || type === EventType.BOT_THINK) {
        fs.appendFile(path.join(runDir, 'provider-calls.redacted.jsonl'), JSON.stringify(redactedEvent) + '\n').catch((err) => {
          console.error(`[EVIDENCE ERROR] Failed writing to provider-calls.redacted.jsonl for run ${runId}:`, err);
        });
      }

      // 3. Append immediately to bot-decisions.jsonl
      if (type === EventType.LLM_CALL) {
        const think = this.lastBotThinkByBotId[botId || 'unknown'] || { providerId: 'unknown', model: 'unknown' };
        const action = details?.action || 'idle';
        const parameters = details?.parameters || {};
        const reasonSummary = details?.reason_summary || details?.rationale || message || '';

        const decisionTrace = {
          runId,
          step: this.currentStep,
          botId: botId || 'unknown',
          botName: botName || 'unknown',
          providerId: think.providerId,
          model: think.model,
          reason_summary: reasonSummary,
          action,
          parameters,
          message: details?.message || '',
          latencyMs: details?.latencyMs || 0,
          timestamp: event.timestamp,
          decisionSource: details?.decisionSource || 'simulation',
          activeGoal: details?.activeGoal || null,
          confidence: details?.confidence !== undefined ? details?.confidence : null,
          observationSummary: details?.observationSummary || null,
        };

        fs.appendFile(path.join(runDir, 'bot-decisions.jsonl'), JSON.stringify(decisionTrace) + '\n').catch((err) => {
          console.error(`[EVIDENCE ERROR] Failed writing to bot-decisions.jsonl for run ${runId}:`, err);
        });
      }

      // 4. Append immediately to action-results.jsonl on actions or errors
      if (type === EventType.BOT_ACTION || type === EventType.ERROR) {
        const actionResult = {
          runId,
          step: this.currentStep,
          botId: botId || 'unknown',
          botName: botName || 'unknown',
          action: type === EventType.BOT_ACTION ? 'execute' : 'error',
          success: type === EventType.BOT_ACTION,
          message: message,
          timestamp: event.timestamp,
          details: details || {},
        };
        fs.appendFile(path.join(runDir, 'action-results.jsonl'), JSON.stringify(actionResult) + '\n').catch((err) => {
          console.error(`[EVIDENCE ERROR] Failed writing to action-results.jsonl for run ${runId}:`, err);
        });
      }
    }

    this.onEventCallbacks.forEach(cb => cb(event));
  }

  public getLogs(): EventLog[] {
    return this.allLogs;
  }

  public getCurrentRun(): RunManifest | null {
    return this.currentRun;
  }

  private async saveManifestToDisk(manifest: RunManifest) {
    try {
      const runsDir = getStoragePath('runs');
      const runDir = path.join(runsDir, manifest.id);
      await fs.mkdir(runDir, { recursive: true });

      // Strip credentials if they are present anywhere in logs using deep redactSecrets
      const sanitizedLogs = manifest.logs.map(log => redactSecrets(log));

      const sanitizedManifest = {
        ...manifest,
        logs: sanitizedLogs,
      };

      // 1. Write structured directory layout files
      await fs.writeFile(path.join(runDir, 'manifest.json'), JSON.stringify(sanitizedManifest, null, 2));

      const eventsJsonl = sanitizedLogs.map(log => JSON.stringify(log)).join('\n');
      await fs.writeFile(path.join(runDir, 'events.jsonl'), eventsJsonl);

      const providerCalls = sanitizedLogs.filter(log => log.type === EventType.LLM_CALL || log.type === EventType.BOT_THINK);
      const providerCallsJsonl = providerCalls.map(log => JSON.stringify(log)).join('\n');
      await fs.writeFile(path.join(runDir, 'provider-calls.redacted.jsonl'), providerCallsJsonl);
      await fs.writeFile(path.join(runDir, 'provider-calls.jsonl'), providerCallsJsonl);

      // Reconstruct bot decisions and action outcomes for scientific audit trail
      const botDecisions: any[] = [];
      const actionResults: any[] = [];
      let currentStep = 0;
      let lastBotThinkByBotId: Record<string, any> = {};

      let md = `# Decision Log for Run: ${manifest.id}\n`;
      md += `Scenario: ${manifest.scenarioTitle}\n`;
      md += `Started: ${manifest.startTime}\n`;
      md += `Status: ${manifest.status}\n\n`;
      md += `## Bot Decisions and Action Outcomes\n\n`;

      for (const log of sanitizedLogs) {
        if (log.type === EventType.SYSTEM && log.message.includes('Simulation Step #')) {
          const match = log.message.match(/Simulation Step #(\d+)/);
          if (match) {
            currentStep = parseInt(match[1], 10);
            md += `### Step ${currentStep}\n\n`;
          }
        }

        if (log.type === EventType.BOT_THINK) {
          lastBotThinkByBotId[log.botId || 'unknown'] = {
            providerId: log.details?.providerId || 'unknown',
            model: log.details?.model || 'unknown',
            timestamp: log.timestamp,
          };
          md += `* **${log.botName}** started thinking (Provider: ${log.details?.providerId || 'gemini'}, Model: ${log.details?.model || 'unknown'})\n`;
        }

        if (log.type === EventType.LLM_CALL) {
          const botId = log.botId || 'unknown';
          const botName = log.botName || 'unknown';
          const think = lastBotThinkByBotId[botId] || {};

          const action = log.details?.action || 'idle';
          const parameters = log.details?.parameters || {};
          const reasonSummary = log.details?.reason_summary || log.details?.rationale || log.message || '';

          const decisionTrace = {
            runId: manifest.id,
            step: currentStep,
            botId,
            botName,
            providerId: think.providerId || 'unknown',
            model: think.model || 'unknown',
            reason_summary: reasonSummary,
            action,
            parameters,
            message: log.details?.message || '',
            latencyMs: log.details?.latencyMs || 0,
            timestamp: log.timestamp,
            decisionSource: log.details?.decisionSource || 'simulation',
            activeGoal: log.details?.activeGoal || null,
            confidence: log.details?.confidence !== undefined ? log.details?.confidence : null,
            observationSummary: log.details?.observationSummary || null,
          };

          botDecisions.push(decisionTrace);

          const paramsStr = parameters ? JSON.stringify(parameters) : '{}';
          md += `  * **Decision**: Selected action \`${action}\` with parameters \`${paramsStr}\`.\n`;
          md += `  * **Reason Summary**: *${reasonSummary}*\n`;
        }

        if (log.type === EventType.BOT_ACTION || log.type === EventType.ERROR) {
          const actionResult = {
            runId: manifest.id,
            step: currentStep,
            botId: log.botId || 'unknown',
            botName: log.botName || 'unknown',
            action: log.type === EventType.BOT_ACTION ? 'execute' : 'error',
            success: log.type === EventType.BOT_ACTION,
            message: log.message,
            timestamp: log.timestamp,
            details: log.details || {},
          };
          actionResults.push(actionResult);

          if (log.type === EventType.BOT_ACTION) {
            md += `  * **Outcome**: ✅ ${log.message}\n\n`;
          } else {
            md += `  * **Outcome**: ❌ Error: ${log.message}\n\n`;
          }
        }
      }

      // Generate highly evidence-faithful research summary markdown file
      let resMd = `# Research Summary for Run: ${manifest.id}\n\n`;
      resMd += `* **Scenario Title**: ${manifest.scenarioTitle}\n`;
      resMd += `* **Start Time**: ${manifest.startTime}\n`;
      resMd += `* **End Time**: ${manifest.endTime || 'N/A'}\n`;
      resMd += `* **Final Status**: ${manifest.status}\n\n`;

      if (manifest.research) {
        resMd += `## Scientific Framework\n\n`;
        if (manifest.research.question) {
          resMd += `### Research Question\n${manifest.research.question}\n\n`;
        }
        if (manifest.research.hypothesis) {
          resMd += `### Hypothesis\n${manifest.research.hypothesis}\n\n`;
        }
        if (manifest.research.measurementFocus && manifest.research.measurementFocus.length > 0) {
          resMd += `### Measurement Focus\n`;
          manifest.research.measurementFocus.forEach(focus => {
            resMd += `- ${focus}\n`;
          });
          resMd += `\n`;
        }
        if (manifest.research.observationProtocol) {
          resMd += `### Observation Protocol\n${manifest.research.observationProtocol}\n\n`;
        }
        if (manifest.research.expectedEmergencePatterns && manifest.research.expectedEmergencePatterns.length > 0) {
          resMd += `### Expected Emergence Patterns\n`;
          manifest.research.expectedEmergencePatterns.forEach(pattern => {
            resMd += `- ${pattern}\n`;
          });
          resMd += `\n`;
        }
      } else {
        resMd += `*No scientific research metadata was configured for this run.*\n\n`;
      }

      resMd += `## Executive Summary\n\n`;
      resMd += `The scenario simulation completed with status **${manifest.status}** over a total of **${currentStep}** recorded step(s).\n\n`;
      resMd += `- **Total Logged Events**: ${sanitizedLogs.length}\n`;
      resMd += `- **Total Bot Decisions**: ${botDecisions.length}\n`;
      resMd += `- **Total Executed Actions**: ${actionResults.length}\n`;

      // Write scientific audit log files with safe try-catch wrapper
      try {
        const botDecisionsJsonl = botDecisions.map(d => JSON.stringify(d)).join('\n');
        await fs.writeFile(path.join(runDir, 'bot-decisions.jsonl'), botDecisionsJsonl);

        const actionResultsJsonl = actionResults.map(r => JSON.stringify(r)).join('\n');
        await fs.writeFile(path.join(runDir, 'action-results.jsonl'), actionResultsJsonl);

        await fs.writeFile(path.join(runDir, 'decision-log.md'), md);
        await fs.writeFile(path.join(runDir, 'research-summary.md'), resMd);
      } catch (writeErr) {
        console.warn('Warning: Failed to write scientific trace files due to permissions:', writeErr);
      }

      // 2. Also write flat legacy file for backward compatibility
      const legacyFilepath = path.join(runsDir, `manifest_${manifest.id}.json`);
      await fs.writeFile(legacyFilepath, JSON.stringify(sanitizedManifest, null, 2));

      console.log(`Saved structured run files to directory: ${runDir}`);
    } catch (err) {
      console.error('Failed to write run files to disk:', err);
    }
  }

  public async getCompletedRunsList(): Promise<{ id: string; startTime: string; scenarioTitle: string; status: string }[]> {
    try {
      const runsDir = getStoragePath('runs');
      const items = await fs.readdir(runsDir, { withFileTypes: true });
      const list = [];

      for (const item of items) {
        if (item.isDirectory() && item.name.startsWith('run_')) {
          const runId = item.name;
          try {
            const manifestPath = path.join(runsDir, runId, 'manifest.json');
            const content = await fs.readFile(manifestPath, 'utf-8');
            const json = JSON.parse(content);
            list.push({
              id: json.id,
              startTime: json.startTime,
              scenarioTitle: json.scenarioTitle,
              status: json.status,
            });
          } catch {}
        } else if (item.isFile() && item.name.startsWith('manifest_') && item.name.endsWith('.json')) {
          try {
            const content = await fs.readFile(path.join(runsDir, item.name), 'utf-8');
            const json = JSON.parse(content);
            list.push({
              id: json.id,
              startTime: json.startTime,
              scenarioTitle: json.scenarioTitle,
              status: json.status,
            });
          } catch {}
        }
      }

      // Remove duplicate IDs that might exist in both legacy and directory format
      const uniqueList = Array.from(new Map(list.map(item => [item.id, item])).values());
      return uniqueList.sort((a, b) => b.startTime.localeCompare(a.startTime));
    } catch {
      return [];
    }
  }

  public async getRunDetails(id: string): Promise<RunManifest | null> {
    try {
      const runsDir = getStoragePath('runs');
      
      // Try directory format first
      try {
        const manifestPath = path.join(runsDir, id, 'manifest.json');
        const content = await fs.readFile(manifestPath, 'utf-8');
        return JSON.parse(content);
      } catch {
        // Fallback to legacy flat file
        const legacyFilepath = path.join(runsDir, `manifest_${id}.json`);
        const content = await fs.readFile(legacyFilepath, 'utf-8');
        return JSON.parse(content);
      }
    } catch {
      return null;
    }
  }
}
