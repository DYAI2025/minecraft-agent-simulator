import { Scenario, ScenarioV2 } from '../../types/index.js';

export type ScenarioLibraryItem = ScenarioV2;

export function validateScenarioLibraryItem(item: any): ScenarioV2 {
  if (!item || typeof item !== 'object') {
    throw new Error('Invalid scenario library item: must be an object.');
  }

  const id = typeof item.id === 'string' ? item.id.trim() : '';
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error('Scenario ID must be alphanumeric and contain no spaces or special characters (except - and _).');
  }

  const title = typeof item.title === 'string' ? item.title.trim() : '';
  if (!title) {
    throw new Error('Scenario item must have a title.');
  }

  const description = typeof item.description === 'string' ? item.description.trim() : '';
  const originalMarkdown = typeof item.originalMarkdown === 'string' ? item.originalMarkdown : '';
  
  if (!item.parsedScenario || typeof item.parsedScenario !== 'object') {
    throw new Error('Scenario item must have parsedScenario object.');
  }

  const lastSavedAt = typeof item.lastSavedAt === 'string' ? item.lastSavedAt : new Date().toISOString();

  return {
    id,
    title,
    description,
    originalMarkdown,
    parsedScenario: item.parsedScenario as Scenario,
    lastSavedAt,
  };
}
