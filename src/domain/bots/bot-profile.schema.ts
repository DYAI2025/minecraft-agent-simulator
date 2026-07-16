export interface BotProfile {
  id: string;
  name: string;
  role: string;
  goal: string;
  providerId: string;
  model: string;
  characterPrompt: string;
  behaviorPrompt: string;
  inventory: Record<string, number>;
  lastSavedAt: string;
}

export function validateBotProfile(profile: any): BotProfile {
  if (!profile || typeof profile !== 'object') {
    throw new Error('Invalid bot profile: must be an object.');
  }

  const id = typeof profile.id === 'string' ? profile.id.trim() : '';
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error('Bot Profile ID must be alphanumeric and contain no spaces or special characters (except - and _).');
  }

  const name = typeof profile.name === 'string' ? profile.name.trim() : '';
  if (!name) {
    throw new Error('Bot profile must have a name.');
  }

  const role = typeof profile.role === 'string' ? profile.role.trim() : 'Assistant';
  const goal = typeof profile.goal === 'string' ? profile.goal.trim() : '';
  const providerId = typeof profile.providerId === 'string' ? profile.providerId.trim() : 'gemini';
  const model = typeof profile.model === 'string' ? profile.model.trim() : 'gemini-2.5-flash';
  const characterPrompt = typeof profile.characterPrompt === 'string' ? profile.characterPrompt : '';
  const behaviorPrompt = typeof profile.behaviorPrompt === 'string' ? profile.behaviorPrompt : '';
  const inventory = (profile.inventory && typeof profile.inventory === 'object') ? profile.inventory : {};
  const lastSavedAt = typeof profile.lastSavedAt === 'string' ? profile.lastSavedAt : new Date().toISOString();

  return {
    id,
    name,
    role,
    goal,
    providerId,
    model,
    characterPrompt,
    behaviorPrompt,
    inventory,
    lastSavedAt,
  };
}
