import { ScenarioService } from '../src/services/ScenarioService.js';
import { LLMProviderService } from '../src/services/LLMProviderService.js';
import { LLMProviderType } from '../src/types/index.js';

async function run() {
  console.log('\x1b[36m==================================================\x1b[0m');
  console.log('\x1b[36m=== MISSI SPRINT-5 AUTOMATED VERIFICATION ===\x1b[0m');
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
    // --- 1. VERIFY SCENARIO V2 PARSING ---
    console.log('\n--- Step 1: Verifying ScenarioV2 Advanced Parser Capabilities ---');
    
    const v2Markdown = `
# Scenario: Hardened Survival Workspace
Version: 2.1.4

## Scenario Prompt
A complex sandbox test. Survive the hostile nether environment and gather blaze rods.

## World Configuration
- Seed: 998877
- Game Mode: survival
- Difficulty: hard
- Level Name: NetherLair

## Bots
### Bot: NetherKnight
- Role: Vanguard
- Goal: Guard the portal and hunt blazes
- Provider: gemini
- Model: gemini-2.5-flash
- Character Prompt: You are a brave knight wearing heavy netherite armor.
- Behavior Prompt: Stand ground near coordinates and use shield on fireballs.
- Position: 12, 54, -98
- Inventory: netherite_sword:1, shield:1
`;

    const parsed = ScenarioService.parseMarkdown(v2Markdown);
    
    assert(parsed.title === 'Hardened Survival Workspace', 'Scenario title parsed correctly');
    assert(parsed.version === '2.1.4', 'ScenarioV2 Version parsed correctly');
    assert(parsed.scenario_prompt?.includes('gather blaze rods') === true, 'scenario_prompt field matches multi-line parser output');
    assert(parsed.scenarioPrompt?.includes('Survive the hostile nether') === true, 'scenarioPrompt camelCase field matched');
    assert(parsed.worldConfig?.gameMode === 'survival', 'Game Mode with space parsed correctly');
    assert(parsed.worldConfig?.levelName === 'NetherLair', 'Level Name with space parsed correctly');
    
    assert(parsed.bots.length === 1, 'Bots parsed successfully');
    const bot = parsed.bots[0];
    assert(bot.name === 'NetherKnight', 'Bot name parsed correctly');
    assert(bot.characterPrompt === 'You are a brave knight wearing heavy netherite armor.', 'Character Prompt parsed correctly');
    assert(bot.behaviorPrompt === 'Stand ground near coordinates and use shield on fireballs.', 'Behavior Prompt parsed correctly');

    // --- 2. VERIFY PROVIDER ERROR CLASSIFICATION ---
    console.log('\n--- Step 2: Verifying LLMProvider Error Classifications ---');

    const providerConfig = {
      id: 'test-prov',
      type: LLMProviderType.GEMINI,
      name: 'Test Provider',
      apiKey: 'test-key',
      defaultModel: 'gemini-1.5-flash'
    };

    // Test missing_key classification
    const errMissing1 = new Error('api key is required but not configured');
    const cMissing1 = LLMProviderService.classifyError(errMissing1, { ...providerConfig, apiKey: '' });
    assert(cMissing1.code === 'missing_key', 'Successfully classified missing API key');

    // Test invalid_key classification (401/403)
    const errInvalidKey = new Error('Request failed with status code 401: Unauthorized');
    const cInvalidKey = LLMProviderService.classifyError(errInvalidKey, providerConfig);
    assert(cInvalidKey.code === 'unauthorized', 'Successfully classified unauthorized API key');

    // Test unreachable classification
    const errUnreachable = new Error('fetch failed: ECONNREFUSED 127.0.0.1');
    const cUnreachable = LLMProviderService.classifyError(errUnreachable, providerConfig);
    assert(cUnreachable.code === 'unreachable', 'Successfully classified network unreachable');

    // Test timeout classification
    const errTimeout = new Error('The connection timed out after 10000ms');
    const cTimeout = LLMProviderService.classifyError(errTimeout, providerConfig);
    assert(cTimeout.code === 'unreachable', 'Successfully classified timeout error');

    // Test rate_limited classification
    const errRate = new Error('Rate limit exceeded: HTTP status 429 Too Many Requests');
    const cRate = LLMProviderService.classifyError(errRate, providerConfig);
    assert(cRate.code === 'quota_exceeded', 'Successfully classified rate limit');

    // Test invalid_model classification
    const errModel = new Error('The model gpt-5-super-flash was not found');
    const cModel = LLMProviderService.classifyError(errModel, providerConfig);
    assert(cModel.code === 'bad_request', 'Successfully classified model not found');

    // Test parse_error classification
    const errParse = new Error('Unexpected token < in JSON at position 0');
    const cParse = LLMProviderService.classifyError(errParse, providerConfig);
    assert(cParse.code === 'bad_request', 'Successfully classified parse/JSON error');

  } catch (err: any) {
    console.error('An unexpected error occurred during Sprint 5 automated verification:', err);
    hasFailures = true;
  }

  console.log('\n==================================================');
  if (hasFailures) {
    console.error('\x1b[31m=== SPRINT-5 VERIFICATION: FAILED ===\x1b[0m');
    process.exit(1);
  } else {
    console.log('\x1b[32m=== SPRINT-5 VERIFICATION: ALL PASSED ===\x1b[0m');
    process.exit(0);
  }
}

run().catch(err => {
  console.error('Sprint 5 verification script crash:', err);
  process.exit(1);
});
