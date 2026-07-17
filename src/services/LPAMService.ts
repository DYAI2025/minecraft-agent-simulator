import { spawn } from 'child_process';

export interface LocationMemory {
  location: { x: number; y: number; z: number };
  biome: string;
  resources: string[];
  dangerLevel: number;
  visitCount: number;
  lastVisited: string;
  notes: string[];
}

export interface BotExperience {
  id?: string;
  botId: string;
  botName: string;
  timestamp: string;
  location: { x: number; y: number; z: number };
  action: string;
  parameters: Record<string, any>;
  outcome: 'success' | 'failure' | 'partial';
  reasonSummary: string;
  context: {
    nearbyBlocks: Array<{ type: string; x: number; y: number; z: number }>;
    otherBots: Array<{ name: string; distance: number }>;
    inventory: Record<string, number>;
    health: number;
    food: number;
  };
  lesson?: string;
  tags?: string[];
}

export interface BotMemoryQuery {
  botId?: string;
  location?: { x: number; y: number; z: number; radius?: number };
  action?: string;
  outcome?: 'success' | 'failure' | 'partial';
  tags?: string[];
  since?: string;
  until?: string;
  limit?: number;
}

export interface BotLesson {
  id: string;
  botId: string;
  lesson: string;
  confidence: number;
  supportingExperiences: string[];
  createdAt: string;
  tags: string[];
}

export interface BotStrategy {
  botId: string;
  role: string;
  successfulPatterns: Array<{
    action: string;
    context: string;
    reward: number;
    count: number;
  }>;
  failedPatterns: Array<{
    action: string;
    context: string;
    failureReason: string;
    count: number;
  }>;
  updatedAt: string;
}

export interface WorldKnowledge {
  locations: Map<string, LocationMemory>;
  strategies: Map<string, BotStrategy>;
  globalLessons: Array<{
    lesson: string;
    confidence: number;
    supportingExperiences: number;
    tags: string[];
  }>;
}

export class LPAMService {
  private static instance: LPAMService | null = null;
  private gbrainAvailable: boolean = false;
  private initPromise: Promise<void> | null = null;
  private worldKnowledge: WorldKnowledge = {
    locations: new Map(),
    strategies: new Map(),
    globalLessons: [],
  };

  private constructor() {}

  public static getInstance(): LPAMService {
    if (!LPAMService.instance) {
      LPAMService.instance = new LPAMService();
    }
    return LPAMService.instance;
  }

  public async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.checkGbrain();
    return this.initPromise;
  }

  private async checkGbrain(): Promise<void> {
    try {
      const result = await this.runGbrainCommand(['--version']);
      if (result.success) {
        this.gbrainAvailable = true;
        console.log('[LPAM] gbrain detected:', result.stdout.trim());
        const health = await this.runGbrainCommand(['health']);
        if (health.success) {
          console.log('[LPAM] gbrain health OK');
        }
      } else {
        console.warn('[LPAM] gbrain not available, running in local-only mode');
        this.gbrainAvailable = false;
      }
    } catch (error) {
      console.warn('[LPAM] Failed to initialize gbrain:', error);
      this.gbrainAvailable = false;
    }
  }

  private async runGbrainCommand(args: string[]): Promise<{ success: boolean; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const proc = spawn('gbrain', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (data) => stdout += data.toString());
      proc.stderr?.on('data', (data) => stderr += data.toString());
      proc.on('close', (code) => resolve({ success: code === 0, stdout, stderr }));
      proc.on('error', () => resolve({ success: false, stdout, stderr: 'gbrain not found in PATH' }));
    });
  }

  private async runGbrainCommandWithStdin(args: string[], stdin: string): Promise<{ success: boolean; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const proc = spawn('gbrain', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (data) => stdout += data.toString());
      proc.stderr?.on('data', (data) => stderr += data.toString());
      proc.stdin?.write(stdin);
      proc.stdin?.end();
      proc.on('close', (code) => resolve({ success: code === 0, stdout, stderr }));
      proc.on('error', () => resolve({ success: false, stdout, stderr: 'gbrain not found in PATH' }));
    });
  }

  public isAvailable(): boolean {
    return this.gbrainAvailable;
  }

  public async storeExperience(experience: BotExperience): Promise<string | null> {
    if (!this.gbrainAvailable) return null;
    try {
      const slug = `experiences/${experience.botId}/${experience.timestamp.replace(/[:.]/g, '-')}`;
      const content = this.formatExperienceAsMarkdown(experience);
      const result = await this.runGbrainCommandWithStdin(['put', slug, '--stdin'], content);
      if (result.success) {
        console.log(`[LPAM] Stored experience for ${experience.botName}: ${experience.action} at (${experience.location.x}, ${experience.location.y}, ${experience.location.z})`);
        return slug;
      }
      return null;
    } catch (error) {
      console.error('[LPAM] Failed to store experience:', error);
      return null;
    }
  }

  public async queryExperiences(query: BotMemoryQuery): Promise<BotExperience[]> {
    if (!this.gbrainAvailable) return [];
    try {
      let searchQuery = '';
      if (query.botId) searchQuery += `botId:${query.botId} `;
      if (query.action) searchQuery += `action:${query.action} `;
      if (query.outcome) searchQuery += `outcome:${query.outcome} `;
      if (query.tags?.length) searchQuery += query.tags.map(t => `tag:${t}`).join(' ') + ' ';
      if (query.location) {
        searchQuery += `location:near(${query.location.x},${query.location.y},${query.location.z},${query.location.radius || 50}) `;
      }
      if (query.since) searchQuery += `since:${query.since} `;
      if (query.until) searchQuery += `until:${query.until} `;
      searchQuery += 'type:experience';
      const result = await this.runGbrainCommand(['query', searchQuery, '--json', '--limit', String(20)]);
      if (result.success) {
        try {
          const data = JSON.parse(result.stdout);
          return data.results?.map(this.parseExperienceFromResult) || [];
        } catch {
          return [];
        }
      }
      return [];
    } catch (error) {
      console.error('[LPAM] Query failed:', error);
      return [];
    }
  }

  public async storeLesson(lesson: BotLesson): Promise<string | null> {
    if (!this.gbrainAvailable) return null;
    try {
      const slug = `lessons/${lesson.botId}/${lesson.id}`;
      const content = this.formatLessonAsMarkdown(lesson);
      const result = await this.runGbrainCommandWithStdin(['put', slug, '--stdin'], content);
      if (result.success) {
        console.log(`[LPAM] Stored lesson for ${lesson.botId}: ${lesson.lesson.substring(0, 50)}...`);
        return slug;
      }
      return null;
    } catch (error) {
      console.error('[LPAM] Failed to store lesson:', error);
      return null;
    }
  }

  public async getLessons(botId: string, tags?: string[]): Promise<BotLesson[]> {
    if (!this.gbrainAvailable) return [];
    try {
      let query = `type:lesson botId:${botId}`;
      if (tags?.length) query += ` ${tags.map(t => `tag:${t}`).join(' ')}`;
      const result = await this.runGbrainCommand(['query', query, '--json', '--limit', '50']);
      if (result.success) {
        try {
          const data = JSON.parse(result.stdout);
          return data.results?.map(this.parseLessonFromResult) || [];
        } catch {
          return [];
        }
      }
      return [];
    } catch {
      return [];
    }
  }

  public async deriveLessonsFromExperiences(botId: string): Promise<Array<{ id: string; botId: string; lesson: string; confidence: number; supportingExperiences: string[]; createdAt: string; tags: string[] }>> {
    const experiences = await this.queryExperiences({ botId, limit: 100 });
    if (experiences.length < 5) return [];

    const byAction = new Map<string, typeof experiences>();
    for (const exp of experiences) {
      const arr = byAction.get(exp.action) || [];
      arr.push(exp);
      byAction.set(exp.action, arr);
    }

    const lessons = [];
    for (const [action, exps] of byAction) {
      const successRate = exps.filter(e => e.outcome === 'success').length / exps.length;
      const avgLocation = exps.reduce((acc, e) => ({
        x: acc.x + e.location.x / exps.length,
        y: acc.y + e.location.y / exps.length,
        z: acc.z + e.location.z / exps.length,
      }), { x: 0, y: 0, z: 0 });

      if (successRate > 0.7) {
        lessons.push({
          id: `lesson-${experiences[0].botId}-${action}-${Date.now()}`,
          botId: experiences[0].botId,
          lesson: `When performing ${action}, prefer locations near (${Math.round(avgLocation.x)}, ${Math.round(avgLocation.y)}, ${Math.round(avgLocation.z)}) - ${(successRate * 100).toFixed(0)}% success rate`,
          confidence: successRate,
          supportingExperiences: exps.filter(e => e.outcome === 'success').slice(0, 5).map(e => e.id || ''),
          createdAt: new Date().toISOString(),
          tags: [action, 'derived', 'high-success']
        });
      } else if (successRate < 0.3 && exps.length > 3) {
        lessons.push({
          id: `lesson-avoid-${action}-${Date.now()}`,
          botId: experiences[0].botId,
          lesson: `Avoid ${action} at locations similar to recent failures - only ${(successRate * 100).toFixed(0)}% success rate`,
          confidence: 1 - successRate,
          supportingExperiences: exps.filter(e => e.outcome === 'failure').slice(0, 5).map(e => e.id || ''),
          createdAt: new Date().toISOString(),
          tags: [action, 'derived', 'avoidance']
        });
      }
    }

    for (const lesson of lessons) {
      await this.storeLesson(lesson);
    }
    return lessons;
  }

  private formatExperienceAsMarkdown(exp: {
    id?: string;
    botId: string;
    botName: string;
    timestamp: string;
    location: { x: number; y: number; z: number };
    action: string;
    parameters: Record<string, any>;
    outcome: 'success' | 'failure' | 'partial';
    reasonSummary: string;
    context: {
      nearbyBlocks: Array<{ type: string; x: number; y: number; z: number }>;
      otherBots: Array<{ name: string; distance: number }>;
      inventory: Record<string, number>;
      health: number;
      food: number;
    };
    lesson?: string;
    tags?: string[];
  }): string {
    return `---
id: ${exp.id}
type: experience
botId: ${exp.botId}
botName: ${exp.botName}
timestamp: ${exp.timestamp}
location: ${JSON.stringify(exp.location)}
action: ${exp.action}
parameters: ${JSON.stringify(exp.parameters)}
outcome: ${exp.outcome}
reasonSummary: ${exp.reasonSummary}
tags: ${exp.tags?.join(', ') || ''}
---

# Experience: ${exp.action} at (${exp.location.x}, ${exp.location.y}, ${exp.location.z})

## Outcome: ${exp.outcome.toUpperCase()}

## Reason
${exp.reasonSummary}

## Context
- **Location**: (${exp.location.x}, ${exp.location.y}, ${exp.location.z})
- **Health**: ${exp.context.health}/20 | **Food**: ${exp.context.food}/20
- **Inventory**: ${JSON.stringify(exp.context.inventory)}
- **Nearby Blocks**: ${exp.context.nearbyBlocks.map(b => `${b.type} at (${b.x},${b.y},${b.z})`).join(', ') || 'None'}
- **Other Bots**: ${exp.context.otherBots.map(b => `${b.name} (${b.distance}m)`).join(', ') || 'None'}

${exp.lesson ? `## Lesson Learned\n${exp.lesson}` : ''}
`;
  }

  private formatLessonAsMarkdown(lesson: {
    id: string;
    botId: string;
    lesson: string;
    confidence: number;
    supportingExperiences: string[];
    createdAt: string;
    tags: string[];
  }): string {
    return `---
id: ${lesson.id}
type: lesson
botId: ${lesson.botId}
confidence: ${lesson.confidence}
tags: ${lesson.tags.join(', ')}
createdAt: ${lesson.createdAt}
supportingExperiences: ${lesson.supportingExperiences.join(', ')}
---

# Lesson: ${lesson.lesson}

## Confidence: ${(lesson.confidence * 100).toFixed(0)}%

## Supporting Experiences
${lesson.supportingExperiences.map(e => `- ${e}`).join('\n') || 'None'}

## Tags
${lesson.tags.join(', ')}
`;
  }

  private parseExperienceFromResult(result: any): {
    id?: string;
    botId: string;
    botName: string;
    timestamp: string;
    location: { x: number; y: number; z: number };
    action: string;
    parameters: Record<string, any>;
    outcome: 'success' | 'failure' | 'partial';
    reasonSummary: string;
    context: {
      nearbyBlocks: Array<{ type: string; x: number; y: number; z: number }>;
      otherBots: Array<{ name: string; distance: number }>;
      inventory: Record<string, number>;
      health: number;
      food: number;
    };
    lesson?: string;
    tags?: string[];
  } {
    return {
      id: result.slug || result.id,
      botId: result.frontmatter?.botId || '',
      botName: result.frontmatter?.botName || '',
      timestamp: result.frontmatter?.timestamp || new Date().toISOString(),
      location: result.frontmatter?.location || { x: 0, y: 0, z: 0 },
      action: result.frontmatter?.action || '',
      parameters: result.frontmatter?.parameters || {},
      outcome: result.frontmatter?.outcome || 'partial',
      reasonSummary: result.frontmatter?.reasonSummary || '',
      context: result.frontmatter?.context || {
        nearbyBlocks: [],
        otherBots: [],
        inventory: {},
        health: 20,
        food: 20
      },
      lesson: result.frontmatter?.lesson,
      tags: result.frontmatter?.tags?.split(',').map((t: string) => t.trim()) || []
    };
  }

  private parseLessonFromResult(result: any): {
    id: string;
    botId: string;
    lesson: string;
    confidence: number;
    supportingExperiences: string[];
    createdAt: string;
    tags: string[];
  } {
    return {
      id: result.frontmatter?.id || result.slug,
      botId: result.frontmatter?.botId || '',
      lesson: result.frontmatter?.lesson || result.content || '',
      confidence: result.frontmatter?.confidence || 0.5,
      supportingExperiences: result.frontmatter?.supportingExperiences?.split(',').map((s: string) => s.trim()) || [],
      createdAt: result.frontmatter?.createdAt || new Date().toISOString(),
      tags: result.frontmatter?.tags?.split(',').map((t: string) => t.trim()) || []
    };
  }
}
