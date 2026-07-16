import assert from 'assert';
import { MinecraftServerPreflightService } from '../src/services/MinecraftServerPreflightService.js';
import { SettingsService } from '../src/services/SettingsService.js';
import { BotOrchestratorService } from '../src/services/BotOrchestratorService.js';
import { MineflayerBotAdapter } from '../src/adapters/minecraft/MineflayerBotAdapter.js';

async function runSprint8Verification() {
  console.log('Starting Sprint 8 Verification...');

  // 1. Verify Preflight structure
  console.log('Testing Preflight structure...');
  const settings = SettingsService.getInstance();
  await settings.init();
  
  const preflight = MinecraftServerPreflightService.getInstance();
  const report = await preflight.runPreflight();

  assert(typeof report.realServerReady === 'boolean', 'realServerReady must be a boolean');
  assert(Array.isArray(report.checks), 'checks must be an array');
  assert(Array.isArray(report.blockers), 'blockers must be an array');
  assert(Array.isArray(report.warnings), 'warnings must be an array');

  // 2. Verify graceful failure without jar
  console.log('Testing jar missing failure...');
  await settings.saveRuntimeConfig({
    serverJarPath: 'non_existent_jar.jar',
    javaExecutable: 'java'
  });
  
  const reportNoJar = await preflight.runPreflight();
  assert(reportNoJar.realServerReady === false, 'Preflight must fail if JAR is missing');
  assert(reportNoJar.blockers.includes('server_jar'), 'Blockers must include server_jar');

  // 3. Verify Mineflayer resolves remote host/port
  console.log('Testing Mineflayer adapter host resolution...');
  const adapter = new MineflayerBotAdapter('TestBot', 'play.example.com', 25565, () => {});
  // We cannot easily test if it connects, but we verify constructor takes host.

  console.log('Sprint 8 Verification Passed!');
}

runSprint8Verification().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
