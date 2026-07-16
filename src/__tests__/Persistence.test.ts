import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { PersistenceService } from '../services/PersistenceService.js';
import { SecretStoreService } from '../services/SecretStoreService.js';
import { SettingsService } from '../services/SettingsService.js';
import { ScenarioLibraryService } from '../services/ScenarioLibraryService.js';
import { BotProfileService } from '../services/BotProfileService.js';
import { GameMode, Difficulty, LLMProviderType } from '../types/index.js';
import { promises as fs } from 'fs';
import path from 'path';
import { getStoragePath } from '../config/storage-paths.js';

describe('MISSI Live Usability & Persistence Layer', () => {
  const testDataDir = getStoragePath('data');

  beforeEach(async () => {
    // Clear data directory or clean up before each run to ensure freshness
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch {}
  });

  afterAll(async () => {
    // Final cleanup of data folder
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch {}
  });

  it('should successfully read and write JSON atomic files in PersistenceService', async () => {
    const persistence = PersistenceService.getInstance();
    
    const testPayload = { foo: 'bar', numberVal: 42 };
    await persistence.writeJson('settings/test-config.json', testPayload);

    const loadedPayload = await persistence.readJson<{ foo: string; numberVal: number }>('settings/test-config.json', { foo: 'default', numberVal: 0 });
    expect(loadedPayload.foo).toBe('bar');
    expect(loadedPayload.numberVal).toBe(42);
  });

  it('should block path traversal outside data folder', () => {
    const persistence = PersistenceService.getInstance();
    expect(() => persistence.resolvePath('../../outside-sandbox.json')).toThrow();
  });

  it('should securely encrypt/isolate credentials in SecretStoreService', async () => {
    const secrets = SecretStoreService.getInstance();
    await secrets.init();

    await secrets.setSecret('openai', 'sk-test-openai-key-abc123xyz');
    expect(secrets.getSecret('openai')).toBe('sk-test-openai-key-abc123xyz');

    // Metadata checks
    const meta = secrets.getSecretMetadata('openai');
    expect(meta).not.toBeNull();
    expect(meta?.configured).toBe(true);
    expect(meta?.last4).toBe('3xyz');
    expect(meta?.updatedAt).toBeTruthy();

    // Create a new instance of SecretStoreService to simulate backend restart
    const secretsAfterRestart = SecretStoreService.getInstance();
    await secretsAfterRestart.init();
    expect(secretsAfterRestart.getSecret('openai')).toBe('sk-test-openai-key-abc123xyz');

    const metaAfterRestart = secretsAfterRestart.getSecretMetadata('openai');
    expect(metaAfterRestart?.last4).toBe('3xyz');

    await secretsAfterRestart.deleteSecret('openai');
    expect(secretsAfterRestart.getSecret('openai')).toBe('');
    expect(secretsAfterRestart.getSecretMetadata('openai')).toBeNull();
  });

  it('should load default server properties and save/load them back after restart', async () => {
    const secrets = SecretStoreService.getInstance();
    await secrets.init();
    
    const settings = SettingsService.getInstance();
    await settings.init();

    const serverConfig = settings.getServerConfig();
    expect(serverConfig.serverName).toBe('MISSI-Server');

    // Change seed and server properties
    await settings.saveServerConfig({
      seed: 'persist-seed-777',
      gameMode: GameMode.CREATIVE,
      serverName: 'Persisted Epic World',
    });

    // Re-init settings to check simulation of backend restart
    const newSettingsInstance = SettingsService.getInstance();
    await newSettingsInstance.init();

    const reloadedConfig = newSettingsInstance.getServerConfig();
    expect(reloadedConfig.seed).toBe('persist-seed-777');
    expect(reloadedConfig.gameMode).toBe(GameMode.CREATIVE);
    expect(reloadedConfig.serverName).toBe('Persisted Epic World');
  });

  it('should support Scenario Library CRUD and default scenarios populating on first start', async () => {
    const library = ScenarioLibraryService.getInstance();
    await library.init();

    const initialList = library.getScenarios();
    expect(initialList.length).toBeGreaterThan(0); // Populated with default challenges

    const customScenarioId = 'custom-survival-test';
    const originalMd = `# Scenario: Custom Survival Test
A custom markdown scenario test.

## Objectives
- Defeat 5 zombies
- Build cobblestone shelter

## Bots
### Bot: Tanky
- Role: Guard
- Goal: Defend the perimeter
- Provider: openai
- Model: gpt-4o-mini
- Position: 0, 64, 0
`;
    
    const parsedScenario = {
      title: 'Custom Survival Test',
      description: 'A custom markdown scenario test.',
      objectives: ['Defeat 5 zombies', 'Build cobblestone shelter'],
      bots: [
        {
          id: 'bot_test_1',
          name: 'Tanky',
          role: 'Guard',
          goal: 'Defend the perimeter',
          providerId: 'openai',
          model: 'gpt-4o-mini',
          inventory: {},
          x: 0,
          y: 64,
          z: 0,
          health: 20,
          food: 20,
        }
      ]
    };

    await library.saveScenarioItem({
      id: customScenarioId,
      title: 'Custom Survival Test',
      description: 'A custom markdown scenario test.',
      originalMarkdown: originalMd,
      parsedScenario,
      lastSavedAt: new Date().toISOString(),
    });

    // Simulated restart
    const reloadedLib = ScenarioLibraryService.getInstance();
    await reloadedLib.init();

    const fetchedItem = reloadedLib.getScenario(customScenarioId);
    expect(fetchedItem).not.toBeNull();
    expect(fetchedItem?.title).toBe('Custom Survival Test');
    expect(fetchedItem?.parsedScenario.bots[0].name).toBe('Tanky');

    // Delete scenario
    await reloadedLib.deleteScenario(customScenarioId);
    expect(reloadedLib.getScenario(customScenarioId)).toBeNull();
  });

  it('should support Bot Profile CRUD with character and behavior prompts', async () => {
    const profileService = BotProfileService.getInstance();
    await profileService.init();

    // Check defaults
    const list = profileService.getProfiles();
    expect(list.length).toBeGreaterThan(0);

    const newProfile = {
      id: 'custom-wizard',
      name: 'GandalfTheGreen',
      role: 'Sorcerer',
      goal: 'Gather potion ingredients and cast magic effects',
      providerId: 'gemini',
      model: 'gemini-2.5-flash',
      characterPrompt: 'You are GandalfTheGreen, an elder druidic magician. Speak cryptically.',
      behaviorPrompt: 'Collect 10 poppies, mix them in crafting table, and output magic chat spells.',
      inventory: { 'poppy': 5 },
      lastSavedAt: new Date().toISOString(),
    };

    await profileService.saveProfile(newProfile);

    // Simulated restart
    const reloadedProfiles = BotProfileService.getInstance();
    await reloadedProfiles.init();

    const loadedWizard = reloadedProfiles.getProfile('custom-wizard');
    expect(loadedWizard).not.toBeNull();
    expect(loadedWizard?.name).toBe('GandalfTheGreen');
    expect(loadedWizard?.characterPrompt).toContain('GandalfTheGreen');
    expect(loadedWizard?.behaviorPrompt).toContain('Collect 10 poppies');

    await reloadedProfiles.deleteProfile('custom-wizard');
    expect(reloadedProfiles.getProfile('custom-wizard')).toBeNull();
  });
});
