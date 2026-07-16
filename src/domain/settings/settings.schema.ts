import { GameMode, Difficulty, MinecraftServerConfig } from '../../types/index.js';

export function validateMinecraftServerConfig(config: any): MinecraftServerConfig {
  if (!config || typeof config !== 'object') {
    throw new Error('Invalid server configuration: must be an object.');
  }

  const serverName = typeof config.serverName === 'string' ? config.serverName.trim() : 'MISSI-Server';
  const levelName = typeof config.levelName === 'string' ? config.levelName.trim() : 'world';
  const seed = typeof config.seed === 'string' ? config.seed.trim() : '';
  
  let gameMode = GameMode.SURVIVAL;
  if (Object.values(GameMode).includes(config.gameMode)) {
    gameMode = config.gameMode as GameMode;
  }

  let difficulty = Difficulty.NORMAL;
  if (Object.values(Difficulty).includes(config.difficulty)) {
    difficulty = config.difficulty as Difficulty;
  }

  const port = typeof config.port === 'number' && !isNaN(config.port) ? config.port : 25565;
  const properties = (config.properties && typeof config.properties === 'object') ? config.properties : {};

  // Simple path traversal protection on levelName
  if (levelName.includes('..') || levelName.includes('/') || levelName.includes('\\')) {
    throw new Error('Path traversal detected in levelName.');
  }

  return {
    serverName,
    levelName,
    seed,
    gameMode,
    difficulty,
    port,
    properties,
  };
}
