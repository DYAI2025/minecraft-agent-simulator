import { describe, it, expect } from 'vitest';
import { isCommandAllowed } from '../domain/server/server-command-policy.js';

describe('isCommandAllowed policy checks', () => {
  it('should allow /say with a message', () => {
    const res = isCommandAllowed('/say Hello everyone');
    expect(res.allowed).toBe(true);

    const res2 = isCommandAllowed('say hello');
    expect(res2.allowed).toBe(true);
  });

  it('should reject say with no message', () => {
    const res = isCommandAllowed('/say');
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain('requires a message');
  });

  it('should allow /seed with no arguments', () => {
    const res = isCommandAllowed('/seed');
    expect(res.allowed).toBe(true);

    const res2 = isCommandAllowed('seed');
    expect(res2.allowed).toBe(true);
  });

  it('should reject seed with arguments', () => {
    const res = isCommandAllowed('/seed 12345');
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain('must not have arguments');
  });

  it('should allow /list with no arguments', () => {
    const res = isCommandAllowed('/list');
    expect(res.allowed).toBe(true);

    const res2 = isCommandAllowed('list');
    expect(res2.allowed).toBe(true);
  });

  it('should reject list with arguments', () => {
    const res = isCommandAllowed('/list uuids');
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain('must not have arguments');
  });

  it('should allow exactly time query daytime', () => {
    const res = isCommandAllowed('/time query daytime');
    expect(res.allowed).toBe(true);

    const res2 = isCommandAllowed('time query daytime');
    expect(res2.allowed).toBe(true);
  });

  it('should reject other time queries/sets', () => {
    const res = isCommandAllowed('/time set day');
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain('Only "/time query daytime" is permitted');

    const res2 = isCommandAllowed('/time set 1000');
    expect(res2.allowed).toBe(false);
  });

  it('should block unsafe/unsupported commands', () => {
    const dangerous = [
      'tellraw', 'weather', 'gamerule', 'difficulty', 'whitelist',
      'give', 'tp', 'teleport', 'op', 'deop', 'stop', 'gamemode', 'fill', 'clone'
    ];

    dangerous.forEach(cmd => {
      const res = isCommandAllowed(`/${cmd}`);
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('blocked for security');
    });
  });
});
