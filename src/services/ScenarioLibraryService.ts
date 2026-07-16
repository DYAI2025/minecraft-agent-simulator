import { Scenario } from '../types/index.js';
import { PersistenceService } from './PersistenceService.js';
import { ScenarioLibraryItem, validateScenarioLibraryItem } from '../domain/scenarios/scenario-library.schema.ts';
import { DEFAULT_SCENARIOS } from '../data/scenarios.js';
import { ScenarioService } from './ScenarioService.js';
import { promises as fs } from 'fs';
import path from 'path';

export class ScenarioLibraryService {
  private static instance: ScenarioLibraryService | null = null;
  private persistence: PersistenceService;
  private cachedScenarios: Map<string, ScenarioLibraryItem> = new Map();

  private constructor() {
    this.persistence = PersistenceService.getInstance();
  }

  public static getInstance(): ScenarioLibraryService {
    if (!ScenarioLibraryService.instance) {
      ScenarioLibraryService.instance = new ScenarioLibraryService();
    }
    return ScenarioLibraryService.instance;
  }

  /**
   * Initializes the library.
   * If data/scenarios is empty, imports the default scenarios.
   */
  public async init(): Promise<void> {
    const list = await this.persistence.listDirectoryFiles('scenarios');
    
    if (list.length === 0) {
      // Import defaults
      console.log('No custom scenarios found. Pre-populating default scenarios...');
      for (const def of DEFAULT_SCENARIOS) {
        const id = def.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        try {
          const parsed = ScenarioService.parseMarkdown(def.markdown);
          const item: ScenarioLibraryItem = {
            id,
            title: def.title,
            description: def.description,
            originalMarkdown: def.markdown,
            parsedScenario: parsed,
            lastSavedAt: new Date().toISOString(),
          };
          await this.saveScenarioItem(item);
        } catch (err) {
          console.error(`Error importing default scenario ${def.title}:`, err);
        }
      }
    } else {
      // Load existing scenarios
      for (const itemDir of list) {
        if (itemDir.startsWith('.') || itemDir.includes('/') || itemDir.includes('\\')) continue;
        try {
          const metaPath = `scenarios/${itemDir}/metadata.json`;
          const parsedPath = `scenarios/${itemDir}/scenario.parsed.json`;
          const mdPath = `scenarios/${itemDir}/scenario.original.md`;

          const meta = await this.persistence.readJson<any>(metaPath, null);
          if (meta) {
            const parsed = await this.persistence.readJson<any>(parsedPath, null);
            const rawMd = await fs.readFile(
              this.persistence.resolvePath(mdPath),
              'utf-8'
            ).catch(() => '');

            const item = validateScenarioLibraryItem({
              id: meta.id || itemDir,
              title: meta.title,
              description: meta.description,
              originalMarkdown: rawMd,
              parsedScenario: parsed,
              lastSavedAt: meta.lastSavedAt,
            });
            this.cachedScenarios.set(item.id, item);
          }
        } catch (err) {
          console.error(`Failed to load scenario under folder ${itemDir}:`, err);
        }
      }
    }
  }

  public getScenarios(): ScenarioLibraryItem[] {
    return Array.from(this.cachedScenarios.values()).sort((a, b) => 
      new Date(b.lastSavedAt).getTime() - new Date(a.lastSavedAt).getTime()
    );
  }

  public getScenario(id: string): ScenarioLibraryItem | null {
    return this.cachedScenarios.get(id) || null;
  }

  public async saveScenarioItem(item: ScenarioLibraryItem): Promise<ScenarioLibraryItem> {
    const validated = validateScenarioLibraryItem(item);
    
    const metaPath = `scenarios/${validated.id}/metadata.json`;
    const parsedPath = `scenarios/${validated.id}/scenario.parsed.json`;
    const mdPath = `scenarios/${validated.id}/scenario.original.md`;

    // Ensure directory is structured cleanly
    await this.persistence.writeJson(metaPath, {
      id: validated.id,
      title: validated.title,
      description: validated.description,
      lastSavedAt: validated.lastSavedAt,
    });

    await this.persistence.writeJson(parsedPath, validated.parsedScenario);

    // Save raw Markdown
    const absoluteMdPath = this.persistence.resolvePath(mdPath);
    await this.persistence.ensureDirExists(absoluteMdPath);
    await fs.writeFile(absoluteMdPath, validated.originalMarkdown, 'utf-8');

    this.cachedScenarios.set(validated.id, validated);
    return validated;
  }

  public async deleteScenario(id: string): Promise<void> {
    if (!this.cachedScenarios.has(id)) {
      throw new Error(`Scenario with ID ${id} not found.`);
    }

    const folderPath = this.persistence.resolvePath(`scenarios/${id}`);
    
    // Safely delete directory contents recursively
    try {
      await fs.rm(folderPath, { recursive: true, force: true });
    } catch (err) {
      console.error(`Failed to delete scenario directory ${id}:`, err);
    }

    this.cachedScenarios.delete(id);
  }
}
