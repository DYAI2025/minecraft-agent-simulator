import { ScenarioLibraryService } from '../src/services/ScenarioLibraryService.js';
import { SettingsService } from '../src/services/SettingsService.js';
import { BotOrchestratorService } from '../src/services/BotOrchestratorService.js';
import { ScenarioService } from '../src/services/ScenarioService.js';
import { promises as fs } from 'fs';
import path from 'path';

async function run() {
  console.log('\x1b[36m==================================================\x1b[0m');
  console.log('\x1b[36m=== MISSI SPRINT-3 AUTOMATED VERIFICATION ===\x1b[0m');
  console.log('\x1b[36m==================================================\x1b[0m');

  const dataDir = path.resolve(process.cwd(), 'data');
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
    // --- 1. INITIALIZE SERVICES ---
    console.log('\n--- Step 1: Initializing Persistent Services ---');
    
    const settings = SettingsService.getInstance();
    await settings.init();
    
    const scenarioLibrary = ScenarioLibraryService.getInstance();
    await scenarioLibrary.init();
    
    const orchestrator = BotOrchestratorService.getInstance();
    
    assert(settings !== null, 'SettingsService initialized successfully');
    assert(scenarioLibrary !== null, 'ScenarioLibraryService initialized successfully');
    assert(orchestrator !== null, 'BotOrchestratorService initialized successfully');

    // --- 2. CREATE AND SAVE A SCENARIO ---
    console.log('\n--- Step 2: Creating and Saving Custom Scenario ---');
    const scenarioId = 'sprint-3-eval-scenario';
    const originalMarkdown = `# Scenario: Sprint 3 Test Scenario
A special verification scenario for testing persistence and workspace application.

## World Configuration
- Seed: 1337
- GameMode: creative
- Difficulty: hard
- Port: 25565

## Objectives
- Test persistence after simulated server reboot
- Ensure scenario remains active and consistent

## Bots
### Bot: persistence_test_bot
- Role: State Auditor
- Goal: Audit scenario loading and verify parameters are identical after reboot
- Position: 10, 64, -20
- Inventory: clock:1, chest:2
`;

    const parsedScenario = ScenarioService.parseMarkdown(originalMarkdown);
    ScenarioService.validate(parsedScenario);

    const scenarioItem = {
      id: scenarioId,
      title: parsedScenario.title,
      description: parsedScenario.description,
      originalMarkdown,
      parsedScenario,
      lastSavedAt: new Date().toISOString(),
    };

    const savedItem = await scenarioLibrary.saveScenarioItem(scenarioItem);
    assert(savedItem.id === scenarioId, 'Scenario saved with expected ID');
    assert(savedItem.parsedScenario.title === 'Sprint 3 Test Scenario', 'Scenario title parsed and saved correctly');
    assert(savedItem.parsedScenario.worldConfig?.seed === '1337', 'Scenario worldConfig seed parsed and saved correctly');
    assert(savedItem.parsedScenario.bots.length === 1, 'Scenario bots array parsed and saved correctly');
    assert(savedItem.parsedScenario.bots[0].name === 'persistence_test_bot', 'Scenario bot name parsed and saved correctly');
    assert(savedItem.parsedScenario.bots[0].role === 'State Auditor', 'Scenario bot role parsed and saved correctly');
    assert(savedItem.parsedScenario.bots[0].x === 10, 'Scenario bot coordinate X parsed and saved correctly');

    // --- 3. APPLY SCENARIO TO WORKSPACE ---
    console.log('\n--- Step 3: Applying Scenario to Workspace ---');
    
    orchestrator.setActiveScenario(savedItem.parsedScenario);
    await settings.saveWorkspaceConfig({ activeScenarioId: scenarioId });

    // Verify current in-memory active scenario
    const currentSimState = orchestrator.getSimulationState();
    assert(currentSimState.activeScenario !== null, 'Simulation state now has an active scenario');
    assert(currentSimState.activeScenario?.title === 'Sprint 3 Test Scenario', 'Active scenario matches the applied scenario title');
    
    const workspaceConfigBeforeRestart = settings.getWorkspaceConfig();
    assert(workspaceConfigBeforeRestart.activeScenarioId === scenarioId, 'Workspace configuration persisted the activeScenarioId');

    // --- 4. SIMULATE SERVER REBOOT ---
    console.log('\n--- Step 4: Simulating Server Restart (Clearing Service Singletons and Reloading From Disk) ---');
    
    // Clear Singleton caches to simulate fresh server boot
    (ScenarioLibraryService as any).instance = null;
    (SettingsService as any).instance = null;
    (BotOrchestratorService as any).instance = null;

    // Load new instances from scratch
    const reloadedSettings = SettingsService.getInstance();
    await reloadedSettings.init();
    
    const reloadedLibrary = ScenarioLibraryService.getInstance();
    await reloadedLibrary.init();
    
    const reloadedOrchestrator = BotOrchestratorService.getInstance();

    // Verify settings re-loaded the saved configuration file correctly from disk
    const workspaceConfigAfterRestart = reloadedSettings.getWorkspaceConfig();
    assert(workspaceConfigAfterRestart.activeScenarioId === scenarioId, 'Workspace configuration successfully recovered activeScenarioId after reboot');

    // Run the server startup recovery logic
    if (workspaceConfigAfterRestart.activeScenarioId) {
      const activeSc = reloadedLibrary.getScenario(workspaceConfigAfterRestart.activeScenarioId);
      if (activeSc) {
        reloadedOrchestrator.setActiveScenario(activeSc.parsedScenario);
      }
    }

    // --- 5. VERIFY STATE CONSISTENCY ---
    console.log('\n--- Step 5: Verifying Post-Reboot State Consistency ---');
    
    const postRebootSimState = reloadedOrchestrator.getSimulationState();
    assert(postRebootSimState.activeScenario !== null, 'Active scenario restored successfully after server reboot');
    
    const active = postRebootSimState.activeScenario;
    if (active) {
      assert(active.title === 'Sprint 3 Test Scenario', 'Restored scenario has correct title');
      assert(active.worldConfig?.seed === '1337', 'Restored scenario has correct world seed');
      assert(active.worldConfig?.gameMode === 'creative', 'Restored scenario has correct gameMode');
      assert(active.worldConfig?.difficulty === 'hard', 'Restored scenario has correct difficulty');
      assert(active.objectives.length === 2, 'Restored scenario has correct number of objectives');
      assert(active.bots.length === 1, 'Restored scenario has correct number of bots');
      
      const bot = active.bots[0];
      assert(bot.name === 'persistence_test_bot', 'Restored bot has correct name');
      assert(bot.role === 'State Auditor', 'Restored bot has correct role');
      assert(bot.goal === 'Audit scenario loading and verify parameters are identical after reboot', 'Restored bot has correct goal');
      assert(bot.x === 10 && bot.y === 64 && bot.z === -20, 'Restored bot has correct coordinates');
      assert(bot.inventory['clock'] === 1 && bot.inventory['chest'] === 2, 'Restored bot has correct inventory mapping');
    } else {
      assert(false, 'Active scenario was null after simulated reboot');
    }

    // Clean up test scenario from library so we leave the workspace tidy
    await reloadedLibrary.deleteScenario(scenarioId);
    console.log('\nTidied up test scenario successfully.');

  } catch (err: any) {
    console.error('An unexpected error occurred during Sprint 3 evaluation:', err);
    hasFailures = true;
  }

  console.log('\n==================================================');
  if (hasFailures) {
    console.error('\x1b[31m=== SPRINT-3 VERIFICATION: FAILED ===\x1b[0m');
    process.exit(1);
  } else {
    console.log('\x1b[32m=== SPRINT-3 VERIFICATION: ALL PASSED ===\x1b[0m');
    process.exit(0);
  }
}

run().catch(err => {
  console.error('Sprint 3 verification crash:', err);
  process.exit(1);
});
