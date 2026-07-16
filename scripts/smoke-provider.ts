import { LLMProviderService } from '../src/services/LLMProviderService.js';
import { LLMProviderType } from '../src/types/index.js';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
  console.log('=== MISSI SMOKE TEST: LLM PROVIDER ===');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    console.error('\n[BLOCKED] GEMINI_API_KEY NOT SET');
    console.error('Please configure your GEMINI_API_KEY in the environment to run the live provider test.');
    console.error('To run locally:');
    console.error('  GEMINI_API_KEY="your-api-key" tsx scripts/smoke-provider.ts');
    process.exit(1);
  }

  console.log('API key found. Dispatching connection test to Google Gemini...');
  try {
    const result = await LLMProviderService.testConnection({
      id: 'gemini',
      type: LLMProviderType.GEMINI,
      name: 'Google Gemini',
      apiKey: apiKey,
      defaultModel: 'gemini-2.5-flash',
    });

    if (result.success) {
      console.log(`\n=== PROVLDER SMOKE TEST SUCCESSFUL ===`);
      console.log(result.message);
      process.exit(0);
    } else {
      console.error(`\n[FAILED] Provider test did not return success status.`);
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`\n[FAILED] LLM connection test failed:`, err.message || err);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal smoke provider script crash:', err);
  process.exit(1);
});
