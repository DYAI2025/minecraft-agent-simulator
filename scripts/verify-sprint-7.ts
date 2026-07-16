import { EventStoreService } from '../src/services/EventStoreService.js';
import { EventType, GameMode, Difficulty, Scenario } from '../src/types/index.js';
import { MinecraftServerPreflightService } from '../src/services/MinecraftServerPreflightService.js';
import { promises as fs } from 'fs';
import path from 'path';

async function run() {
  console.log('\x1b[36m==================================================\x1b[0m');
  console.log('\x1b[36m=== MISSI SPRINT-7 AUTOMATED VERIFICATION ===\x1b[0m');
  console.log('\x1b[36m==================================================\x1b[0m');

  let hasFailures = false;

  const assert = (condition: boolean, message: string) => {
    if (condition) {
      console.log(`\x1b[32m[PASS]\x1b[0m ${message}`);
    } else {
      console.error(`\x1b[31m[FAIL]\x1b[0m ${message}`);
      hasFailures = true;
    }
  };

  try {
    // --- 1. VERIFY CONTINOUS APPENDING & START-TIME EVIDENCE ---
    console.log('\n--- Step 1: Verifying Start-Time Evidence and Continuous Appending ---');

    const eventStore = EventStoreService.getInstance();
    const serverConfig = {
      serverName: 'TEST-SERVER-S7',
      levelName: 'world-s7',
      seed: '7777777',
      gameMode: GameMode.SURVIVAL,
      difficulty: Difficulty.NORMAL,
      port: 25565,
      properties: {},
    };

    const scenario: Scenario = {
      title: 'Sprint 7 Test Scenario',
      description: 'A scenario to verify continuous appending and deep redaction.',
      objectives: ['Complete verification successfully'],
      bots: [],
      research: {
        question: 'Does continuous appending ensure evidence persistence during crashes?',
        hypothesis: 'Immediate filesystem appending preserves records.',
        measurementFocus: ['File availability', 'Write latency'],
        observationProtocol: 'Observe written file presence directly post-write'
      }
    };

    const originalMarkdown = '# Sprint 7 Test Scenario\n\n- Hypothesis: Immediate filesystem appending preserves records.';

    // Start simulation run
    await eventStore.startRun('Sprint 7 Test Scenario', serverConfig, scenario, originalMarkdown);
    const runId = eventStore.getCurrentRun()?.id;
    assert(!!runId, 'Simulation Run successfully started');

    if (runId) {
      const runDir = path.resolve(process.cwd(), 'runs', runId);

      // Verify start-time files exist immediately before adding logs or ending run
      const manifestExists = await fs.access(path.join(runDir, 'manifest.json')).then(() => true).catch(() => false);
      const originalMdExists = await fs.access(path.join(runDir, 'scenario.original.md')).then(() => true).catch(() => false);
      const parsedJsonExists = await fs.access(path.join(runDir, 'scenario.parsed.json')).then(() => true).catch(() => false);

      assert(manifestExists, 'manifest.json written to run directory immediately at start');
      assert(originalMdExists, 'scenario.original.md written to run directory immediately at start');
      assert(parsedJsonExists, 'scenario.parsed.json written to run directory immediately at start');

      // Now add events to verify continuous appending (no endRun called yet!)
      eventStore.addEvent(EventType.SYSTEM, '--- Simulation Step #1 ---');
      eventStore.addEvent(EventType.BOT_THINK, 'Alice is thinking...', 'alice-bot', 'Alice', {
        providerId: 'gemini',
        model: 'gemini-2.5-flash',
      });

      // Pass API keys to verify deep redaction
      eventStore.addEvent(EventType.LLM_CALL, 'Alice decided action.', 'alice-bot', 'Alice', {
        reason_summary: 'Locating trees to chop.',
        action: 'move',
        parameters: { apiKey: 'AIzaSyTestApiKeyForDeepRedactionS7_123456789' },
        decisionSource: 'real_provider',
        activeGoal: 'Harvest wood',
        confidence: 0.95,
        observationSummary: 'Alice sees 3 trees'
      });

      eventStore.addEvent(EventType.BOT_ACTION, 'Alice harvested wood block.', 'alice-bot', 'Alice', {
        success: true,
        secretKey: 'sk-abcdefabcdefabcdefabcdefabcdefabc'
      });

      // Wait a brief moment to ensure node completes asynchronous append writes
      await new Promise(resolve => setTimeout(resolve, 300));

      // Verify that continuous files have been written and contain elements
      const eventsJsonlContent = await fs.readFile(path.join(runDir, 'events.jsonl'), 'utf-8');
      const providerCallsContent = await fs.readFile(path.join(runDir, 'provider-calls.redacted.jsonl'), 'utf-8');
      const botDecisionsContent = await fs.readFile(path.join(runDir, 'bot-decisions.jsonl'), 'utf-8');
      const actionResultsContent = await fs.readFile(path.join(runDir, 'action-results.jsonl'), 'utf-8');

      assert(eventsJsonlContent.split('\n').filter(Boolean).length > 0, 'events.jsonl continuously appended to');
      assert(providerCallsContent.split('\n').filter(Boolean).length > 0, 'provider-calls.redacted.jsonl continuously appended to');
      assert(botDecisionsContent.split('\n').filter(Boolean).length > 0, 'bot-decisions.jsonl continuously appended to');
      assert(actionResultsContent.split('\n').filter(Boolean).length > 0, 'action-results.jsonl continuously appended to');

      // Check deep redaction
      assert(!eventsJsonlContent.includes('AIzaSyTestApiKeyForDeepRedactionS7_123456789'), 'AIzaSy key redacted in events.jsonl');
      assert(!eventsJsonlContent.includes('sk-abcdefabcdefabcdefabcdefabcdefabc'), 'sk- key redacted in events.jsonl');
      assert(eventsJsonlContent.includes('[REDACTED_API_KEY]'), 'Redaction placeholder present in events.jsonl');

      assert(!providerCallsContent.includes('AIzaSyTestApiKeyForDeepRedactionS7_123456789'), 'AIzaSy key redacted in provider-calls.redacted.jsonl');
      assert(providerCallsContent.includes('[REDACTED_API_KEY]'), 'Redaction placeholder present in provider-calls.redacted.jsonl');

      // Check BotDecisionTrace fields (decisionSource, activeGoal, confidence, observationSummary)
      const decisionLine = JSON.parse(botDecisionsContent.split('\n').filter(Boolean)[0]);
      assert(decisionLine.decisionSource === 'real_provider', 'decisionSource is recorded faithfully');
      assert(decisionLine.activeGoal === 'Harvest wood', 'activeGoal is recorded faithfully');
      assert(decisionLine.confidence === 0.95, 'confidence is recorded faithfully without reconstruction');
      assert(decisionLine.observationSummary === 'Alice sees 3 trees', 'observationSummary is recorded faithfully');

      // End run and check final files
      console.log('\n--- Step 2: Verifying End-Time Finalization and Research Summary ---');
      eventStore.endRun('completed');

      await new Promise(resolve => setTimeout(resolve, 300));

      const researchSummaryExists = await fs.access(path.join(runDir, 'research-summary.md')).then(() => true).catch(() => false);
      const decisionLogExists = await fs.access(path.join(runDir, 'decision-log.md')).then(() => true).catch(() => false);

      assert(researchSummaryExists, 'research-summary.md finalized at end of run');
      assert(decisionLogExists, 'decision-log.md finalized at end of run');

      if (researchSummaryExists) {
        const researchSummaryContent = await fs.readFile(path.join(runDir, 'research-summary.md'), 'utf-8');
        assert(researchSummaryContent.includes('Does continuous appending ensure evidence persistence during crashes?'), 'Research question present in summary');
        assert(researchSummaryContent.includes('Immediate filesystem appending preserves records.'), 'Hypothesis present in summary');
        assert(researchSummaryContent.includes('Observe written file presence directly post-write'), 'Observation protocol present in summary');
        assert(researchSummaryContent.includes('Measurement Focus'), 'Measurement focus present in summary');
      }
    }

    // --- 3. VERIFY PREFLIGHT DIAGNOSTICS & RUNTIME CONFIG STATE ---
    console.log('\n--- Step 3: Verifying Preflight Diagnostics and Runtime Config ---');
    const preflight = MinecraftServerPreflightService.getInstance();
    const report = await preflight.runPreflight();
    assert(report !== undefined, 'Preflight report successfully fetched');
    assert(report.status === 'blocked' || report.status === 'ready', 'Preflight returns valid status');

  } catch (err: any) {
    console.error('Failure during automated verification tests:', err);
    hasFailures = true;
  }

  console.log('\n==================================================');
  if (hasFailures) {
    console.error('\x1b[31m=== SPRINT-7 VERIFICATION: FAILED ===\x1b[0m');
    console.log('==================================================');
    process.exit(1);
  } else {
    console.log('\x1b[32m=== SPRINT-7 VERIFICATION: ALL PASSED ===\x1b[0m');
    console.log('==================================================');
    process.exit(0);
  }
}

run();
