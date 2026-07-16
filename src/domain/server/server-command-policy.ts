export interface CommandPolicyResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Validates a Minecraft command against the shared security policy.
 * Only the following are allowed:
 * - say with message
 * - seed with no arguments
 * - list with no dangerous arguments (only base "list" command)
 * - exactly "time query daytime"
 */
export function isCommandAllowed(command: string): CommandPolicyResult {
  if (!command) {
    return { allowed: false, reason: 'Command string is required.' };
  }

  const sanitized = command.trim();
  const cleanCommand = sanitized.startsWith('/') ? sanitized.slice(1) : sanitized;
  const parts = cleanCommand.split(/\s+/);
  const cmdName = parts[0].toLowerCase();

  const allowedList = ['say', 'seed', 'list', 'time'];

  if (!allowedList.includes(cmdName)) {
    return {
      allowed: false,
      reason: `Command execution of "${cmdName}" is blocked for security and compliance. Only whitelisted commands are allowed: say, seed, list, time query daytime.`
    };
  }

  if (cmdName === 'say') {
    if (parts.length < 2) {
      return { allowed: false, reason: 'Command "say" requires a message.' };
    }
    return { allowed: true };
  }

  if (cmdName === 'seed') {
    if (parts.length > 1) {
      return { allowed: false, reason: 'Command "seed" must not have arguments.' };
    }
    return { allowed: true };
  }

  if (cmdName === 'list') {
    if (parts.length > 1) {
      return { allowed: false, reason: 'Command "list" must not have arguments or dangerous flags.' };
    }
    return { allowed: true };
  }

  if (cmdName === 'time') {
    if (parts.length === 3 && parts[1].toLowerCase() === 'query' && parts[2].toLowerCase() === 'daytime') {
      return { allowed: true };
    }
    return { allowed: false, reason: 'Command "time" is restricted. Only "/time query daytime" is permitted.' };
  }

  return {
    allowed: false,
    reason: `Command execution of "${cmdName}" is blocked for security and compliance.`
  };
}
