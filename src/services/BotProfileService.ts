import { BotProfile, validateBotProfile } from '../domain/bots/bot-profile.schema.ts';
import { PersistenceService } from './PersistenceService.js';

export class BotProfileService {
  private static instance: BotProfileService | null = null;
  private persistence: PersistenceService;
  private cachedProfiles: Map<string, BotProfile> = new Map();

  private constructor() {
    this.persistence = PersistenceService.getInstance();
  }

  public static getInstance(): BotProfileService {
    if (!BotProfileService.instance) {
      BotProfileService.instance = new BotProfileService();
    }
    return BotProfileService.instance;
  }

  public async init(): Promise<void> {
    const files = await this.persistence.listDirectoryFiles('bot-profiles');
    
    if (files.length === 0) {
      console.log('No custom bot profiles found. Pre-populating default profiles...');
      const defaultProfiles: BotProfile[] = [
        {
          id: 'lumberjack',
          name: 'LumberjackBob',
          role: 'Timber Harvester',
          goal: 'Harvest Oak Wood Planks and chop nearby trees cleanly',
          providerId: 'gemini',
          model: 'gemini-2.5-flash',
          characterPrompt: 'You are LumberjackBob, a humble, hard-working woodcutter. Speak simply and focus on trees, axes, and timber.',
          behaviorPrompt: 'When asked to gather wood, locate the nearest oak log block. Walk to it, harvest it with your axe, and announce in chat how many logs you have collected.',
          inventory: { 'wooden_axe': 1 },
          lastSavedAt: new Date().toISOString(),
        },
        {
          id: 'miner',
          name: 'GathererGaby',
          role: 'Resource Miner',
          goal: 'Mine cobblestone blocks and locate coal ore veins',
          providerId: 'gemini',
          model: 'gemini-2.5-flash',
          characterPrompt: 'You are Gaby, a skilled subterranean explorer. You love dark caves and precious ores. Speak with excitement about find minerals.',
          behaviorPrompt: 'Locate nearby cobblestone or coal ore blocks. Use your pickaxe to mine them, gather the drops, and keep track of your coordinate position.',
          inventory: { 'stone_pickaxe': 1, 'torch': 5 },
          lastSavedAt: new Date().toISOString(),
        },
        {
          id: 'architect',
          name: 'BuilderBen',
          role: 'Structural Architect',
          goal: 'Construct foundations and place safety barriers',
          providerId: 'gemini',
          model: 'gemini-2.5-flash',
          characterPrompt: 'You are Ben, a precise structural engineer who loves constructing symmetric boundaries. You are detail-oriented and concise.',
          behaviorPrompt: 'Construct a secure boundary out of cobblestone at current level coordinate offsets. Ensure blocks are placed contiguously.',
          inventory: { 'cobblestone': 64 },
          lastSavedAt: new Date().toISOString(),
        }
      ];

      for (const def of defaultProfiles) {
        await this.saveProfile(def);
      }
    } else {
      for (const file of files) {
        if (!file.endsWith('.json') || file.startsWith('.')) continue;
        try {
          const profileData = await this.persistence.readJson<any>(`bot-profiles/${file}`, null);
          if (profileData) {
            const validated = validateBotProfile(profileData);
            this.cachedProfiles.set(validated.id, validated);
          }
        } catch (err) {
          console.error(`Failed to load bot profile from file ${file}:`, err);
        }
      }
    }
  }

  public getProfiles(): BotProfile[] {
    return Array.from(this.cachedProfiles.values()).sort((a, b) => 
      new Date(b.lastSavedAt).getTime() - new Date(a.lastSavedAt).getTime()
    );
  }

  public getProfile(id: string): BotProfile | null {
    return this.cachedProfiles.get(id) || null;
  }

  public async saveProfile(profile: BotProfile): Promise<BotProfile> {
    const validated = validateBotProfile(profile);
    const subPath = `bot-profiles/${validated.id}.json`;
    await this.persistence.writeJson(subPath, validated);
    this.cachedProfiles.set(validated.id, validated);
    return validated;
  }

  public async deleteProfile(id: string): Promise<void> {
    if (!this.cachedProfiles.has(id)) {
      throw new Error(`Profile with ID ${id} not found.`);
    }

    const subPath = `bot-profiles/${id}.json`;
    await this.persistence.deleteFile(subPath);
    this.cachedProfiles.delete(id);
  }
}
