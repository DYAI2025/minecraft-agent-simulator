import { Scenario, BotConfig, GameMode, Difficulty } from '../types/index.js';

/**
 * Predefined Schema definition for Scenario Validation
 */
export interface SchemaRule {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  min?: number;
  max?: number;
  allowedValues?: string[];
  properties?: Record<string, SchemaRule>;
  elementRule?: SchemaRule;
}

export const SCENARIO_SCHEMA: Record<string, SchemaRule> = {
  title: { type: 'string', required: true },
  description: { type: 'string', required: true },
  version: { type: 'string', required: false },
  objectives: {
    type: 'array',
    required: true,
    elementRule: { type: 'string' }
  },
  bots: {
    type: 'array',
    required: true,
    elementRule: {
      type: 'object',
      properties: {
        id: { type: 'string', required: false },
        name: { type: 'string', required: true },
        role: { type: 'string', required: true },
        goal: { type: 'string', required: true },
        providerId: { type: 'string', required: true },
        model: { type: 'string', required: true },
        x: { type: 'number', required: true },
        y: { type: 'number', required: true },
        z: { type: 'number', required: true },
        health: { type: 'number', required: true, min: 0, max: 20 },
        food: { type: 'number', required: true, min: 0, max: 20 },
        inventory: { type: 'object', required: true },
        characterPrompt: { type: 'string', required: false },
        character_prompt: { type: 'string', required: false },
        behaviorPrompt: { type: 'string', required: false },
        behavior_prompt: { type: 'string', required: false }
      }
    }
  },
  worldConfig: {
    type: 'object',
    required: false,
    properties: {
      seed: { type: 'string', required: false },
      gameMode: { 
        type: 'string', 
        required: false, 
        allowedValues: ['survival', 'creative', 'adventure', 'spectator'] 
      },
      game_mode: { 
        type: 'string', 
        required: false, 
        allowedValues: ['survival', 'creative', 'adventure', 'spectator'] 
      },
      difficulty: { 
        type: 'string', 
        required: false, 
        allowedValues: ['peaceful', 'easy', 'normal', 'hard'] 
      },
      port: { type: 'number', required: false, min: 1, max: 65535 },
      levelName: { type: 'string', required: false },
      level_name: { type: 'string', required: false },
      properties: { type: 'object', required: false }
    }
  },
  research: {
    type: 'object',
    required: false,
    properties: {
      question: { type: 'string', required: false },
      hypothesis: { type: 'string', required: false },
      measurementFocus: {
        type: 'array',
        required: false,
        elementRule: { type: 'string' }
      },
      observationProtocol: { type: 'string', required: false },
      expectedEmergencePatterns: {
        type: 'array',
        required: false,
        elementRule: { type: 'string' }
      }
    }
  }
};

export class ScenarioValidatorService {
  private static instance: ScenarioValidatorService | null = null;

  public static getInstance(): ScenarioValidatorService {
    if (!this.instance) {
      this.instance = new ScenarioValidatorService();
    }
    return this.instance;
  }

  /**
   * Checks value against a SchemaRule and returns any errors found.
   */
  private checkRule(value: any, rule: SchemaRule, path: string): string[] {
    const errors: string[] = [];

    if (value === undefined || value === null) {
      if (rule.required) {
        errors.push(`Field "${path}" is required but missing.`);
      }
      return errors;
    }

    // Check type
    if (rule.type === 'array') {
      if (!Array.isArray(value)) {
        errors.push(`Field "${path}" must be an array, got ${typeof value}.`);
        return errors;
      }
    } else if (rule.type === 'object') {
      if (typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`Field "${path}" must be an object, got ${typeof value}.`);
        return errors;
      }
    } else {
      if (typeof value !== rule.type) {
        errors.push(`Field "${path}" must be of type ${rule.type}, got ${typeof value}.`);
        return errors;
      }
    }

    // Check string constraints
    if (rule.type === 'string') {
      if (value.trim() === '') {
        if (rule.required) {
          errors.push(`Field "${path}" is empty, but a value is required.`);
        }
      }
      if (rule.allowedValues && !rule.allowedValues.includes(value.toLowerCase())) {
        errors.push(`Field "${path}" value "${value}" is invalid. Allowed values are: ${rule.allowedValues.join(', ')}.`);
      }
    }

    // Check number constraints
    if (rule.type === 'number') {
      if (isNaN(value)) {
        errors.push(`Field "${path}" must be a valid number.`);
      } else {
        if (rule.min !== undefined && value < rule.min) {
          errors.push(`Field "${path}" value (${value}) cannot be less than ${rule.min}.`);
        }
        if (rule.max !== undefined && value > rule.max) {
          errors.push(`Field "${path}" value (${value}) cannot be greater than ${rule.max}.`);
        }
      }
    }

    // Check elements of an array
    if (rule.type === 'array' && rule.elementRule) {
      value.forEach((element: any, idx: number) => {
        errors.push(...this.checkRule(element, rule.elementRule!, `${path}[${idx}]`));
      });
    }

    // Check nested object properties
    if (rule.type === 'object' && rule.properties) {
      Object.entries(rule.properties).forEach(([key, propRule]) => {
        errors.push(...this.checkRule(value[key], propRule, `${path}.${key}`));
      });
    }

    return errors;
  }

  /**
   * Validates a parsed Scenario object against the predefined SCENARIO_SCHEMA.
   * Returns a validated internal scenario object or throws a descriptive error message on failure.
   */
  public validate(scenario: any): Scenario {
    if (!scenario || typeof scenario !== 'object') {
      throw new Error('Scenario must be a valid object.');
    }

    // 1. Basic required fields with exact error messages for backward compatibility
    if (!scenario.title || typeof scenario.title !== 'string' || scenario.title.trim() === '') {
      throw new Error('Scenario must have a title.');
    }
    if (!scenario.objectives || !Array.isArray(scenario.objectives) || scenario.objectives.length === 0) {
      throw new Error('Scenario must have at least one objective.');
    }
    if (!scenario.bots || !Array.isArray(scenario.bots) || scenario.bots.length === 0) {
      throw new Error('Scenario must define at least one bot.');
    }

    scenario.bots.forEach((bot: any) => {
      if (!bot || typeof bot !== 'object') {
        throw new Error('Bot must be a valid object.');
      }
      if (!bot.name || typeof bot.name !== 'string' || bot.name.trim() === '') {
        throw new Error('Bot must have a valid name.');
      }
      if (!bot.role || typeof bot.role !== 'string' || bot.role.trim() === '') {
        throw new Error(`Bot ${bot.name} must have a specified role.`);
      }
      if (!bot.goal || typeof bot.goal !== 'string' || bot.goal.trim() === '') {
        throw new Error(`Bot ${bot.name} must have a specified goal.`);
      }
      if (typeof bot.x !== 'number' || typeof bot.y !== 'number' || typeof bot.z !== 'number' || isNaN(bot.x) || isNaN(bot.y) || isNaN(bot.z)) {
        throw new Error(`Bot ${bot.name} coordinates must be numbers.`);
      }
    });

    const errors: string[] = [];

    // Run structural schema checks
    Object.entries(SCENARIO_SCHEMA).forEach(([key, rule]) => {
      // Avoid duplicating checks for fields already validated above
      if (key === 'title' || key === 'objectives' || key === 'bots') return;
      errors.push(...this.checkRule(scenario[key], rule, key));
    });

    if (errors.length > 0) {
      throw new Error(`Scenario validation failed:\n- ${errors.join('\n- ')}`);
    }

    // Format and return a validated, structured internal Scenario object
    const validatedBots: BotConfig[] = (scenario.bots || []).map((bot: any) => {
      const charPrompt = bot.characterPrompt || bot.character_prompt || '';
      const behPrompt = bot.behaviorPrompt || bot.behavior_prompt || '';
      
      const parsedInventory: Record<string, number> = {};
      if (bot.inventory && typeof bot.inventory === 'object') {
        Object.entries(bot.inventory).forEach(([k, v]) => {
          parsedInventory[k] = Number(v) || 1;
        });
      }

      return {
        id: typeof bot.id === 'string' && bot.id.trim() ? bot.id.trim() : `bot_${Math.random().toString(36).substr(2, 9)}`,
        name: bot.name.trim(),
        role: bot.role.trim(),
        goal: bot.goal.trim(),
        providerId: bot.providerId.trim(),
        model: bot.model.trim(),
        x: Number(bot.x),
        y: Number(bot.y),
        z: Number(bot.z),
        health: Number(bot.health) ?? 20,
        food: Number(bot.food) ?? 20,
        inventory: parsedInventory,
        characterPrompt: charPrompt,
        character_prompt: charPrompt,
        behaviorPrompt: behPrompt,
        behavior_prompt: behPrompt,
      };
    });

    const finalScenario: Scenario = {
      id: scenario.id,
      title: scenario.title.trim(),
      description: scenario.description.trim(),
      version: scenario.version ? scenario.version.trim() : undefined,
      objectives: (scenario.objectives || []).map((obj: any) => String(obj).trim()),
      bots: validatedBots,
      scenarioPrompt: scenario.scenarioPrompt || scenario.scenario_prompt,
      scenario_prompt: scenario.scenarioPrompt || scenario.scenario_prompt,
    };

    if (scenario.worldConfig) {
      const wc = scenario.worldConfig;
      finalScenario.worldConfig = {
        seed: wc.seed ? String(wc.seed).trim() : undefined,
        gameMode: wc.gameMode || wc.game_mode,
        game_mode: wc.gameMode || wc.game_mode,
        difficulty: wc.difficulty,
        port: wc.port ? Number(wc.port) : undefined,
        levelName: wc.levelName || wc.level_name,
        level_name: wc.levelName || wc.level_name,
        properties: wc.properties,
      };
    }

    if (scenario.research) {
      const r = scenario.research;
      finalScenario.research = {
        question: r.question ? String(r.question).trim() : undefined,
        hypothesis: r.hypothesis ? String(r.hypothesis).trim() : undefined,
        measurementFocus: r.measurementFocus ? r.measurementFocus.map((f: any) => String(f).trim()) : undefined,
        observationProtocol: r.observationProtocol ? String(r.observationProtocol).trim() : undefined,
        expectedEmergencePatterns: r.expectedEmergencePatterns ? r.expectedEmergencePatterns.map((e: any) => String(e).trim()) : undefined,
      };
    }

    return finalScenario;
  }
}
