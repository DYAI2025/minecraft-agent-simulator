import { SecretStoreService } from '../src/services/SecretStoreService.js';
import { SettingsService } from '../src/services/SettingsService.js';
import { maskProvider } from '../src/domain/providers/provider.schema.js';
import { LLMProviderType } from '../src/types/index.js';
import { promises as fs } from 'fs';
import path from 'path';

async function run() {
  console.log('\x1b[36m==================================================\x1b[0m');
  console.log('\x1b[36m=== MISSI SPRINT-2 AUTOMATED VERIFICATION ===\x1b[0m');
  console.log('\x1b[36m==================================================\x1b[0m');

  const dataDir = path.resolve(process.cwd(), 'data');
  
  // Clean up test data dir to ensure test freshness
  try {
    await fs.rm(dataDir, { recursive: true, force: true });
  } catch {}

  let hasFailures = false;

  const assert = (condition: boolean, message: string) => {
    if (condition) {
      console.log(`\x1b[32m[PASS]\x1b[0m ${message}`);
    } else {
      console.error(`\x1b[31m[FAIL]\x1b[0m ${message}`);
      hasFailures = true;
    }
  };

  // --- 1. SECRET STORE SERVICE METADATA (TASK-201) ---
  console.log('\n--- Evaluating SecretStoreService (TASK-201) ---');
  const secrets = SecretStoreService.getInstance();
  await secrets.init();

  await secrets.setSecret('gemini', 'AIzaSyTestGeminiKey123456');
  
  const geminiSecret = secrets.getSecret('gemini');
  assert(geminiSecret === 'AIzaSyTestGeminiKey123456', 'getSecret recovers original key');

  const metadata = secrets.getSecretMetadata('gemini');
  assert(metadata !== null, 'getSecretMetadata returns valid object');
  assert(metadata?.configured === true, 'metadata has configured: true');
  assert(metadata?.last4 === '3456', 'metadata isolates last 4 digits correctly (3456)');
  assert(!!metadata?.updatedAt, 'metadata contains updatedAt ISO timestamp');

  // Delete secret and metadata check
  await secrets.deleteSecret('gemini');
  assert(secrets.getSecret('gemini') === '', 'getSecret returns empty after deletion');
  assert(secrets.getSecretMetadata('gemini') === null, 'getSecretMetadata returns null after deletion');

  // --- 2. SETTINGS SERVICE INTEGRITY (TASK-201 / TASK-203) ---
  console.log('\n--- Evaluating SettingsService Integration (TASK-201) ---');
  const settings = SettingsService.getInstance();
  await settings.init();

  await secrets.setSecret('openai', 'sk-proj-TestOpenAIKey9988');
  await settings.init(); // Reload to pick up key

  const openaiProvider = settings.getProviders().find(p => p.id === 'openai');
  assert(openaiProvider !== undefined, 'SettingsService manages openai provider');
  
  // Masking check
  const masked = maskProvider(openaiProvider!, secrets.getSecretMetadata('openai'));
  assert((masked as any).apiKey === undefined, 'maskProvider does not leak the raw apiKey');
  assert(masked.isConfigured === true, 'masked provider lists isConfigured: true');
  assert(masked.secretMetadata?.last4 === '9988', 'masked provider contains secretMetadata with last4');

  // --- 3. SETTINGS AGGREGATION CHECK (TASK-203) ---
  console.log('\n--- Evaluating settings aggregate builder (TASK-203) ---');
  const serverConfig = settings.getServerConfig();
  const workspace = settings.getWorkspaceConfig();
  const list = settings.getProviders().map(p => maskProvider(p, secrets.getSecretMetadata(p.id)));

  assert(serverConfig !== undefined && typeof serverConfig === 'object', 'serverConfig is object');
  assert(workspace !== undefined && typeof workspace === 'object', 'workspace is object');
  assert(Array.isArray(list) && list.length > 0, 'providers aggregate lists non-empty array');
  assert(list.every(p => !(p as any).apiKey), 'all aggregate providers conceal credentials');

  // Clean up
  await secrets.deleteSecret('openai');

  console.log('\n==================================================');
  if (hasFailures) {
    console.error('\x1b[31m=== SPRINT-2 VERIFICATION: FAILED ===\x1b[0m');
    process.exit(1);
  } else {
    console.log('\x1b[32m=== SPRINT-2 VERIFICATION: ALL PASSED ===\x1b[0m');
    process.exit(0);
  }
}

run().catch(err => {
  console.error('Sprint 2 verification crash:', err);
  process.exit(1);
});
