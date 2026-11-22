import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { serverError } from '../../lib/serverError';

// SRS-NFR-111: a failed database or server call's details are logged on the
// server, never sent to the browser.

const API = join(__dirname, '../../app/api');
// The routes this requirement was written for (bug #1128).
const AREAS = ['auth', 'profile', 'players', 'cosmetics', 'shop', 'daily-login-box', 'wishing-fountain'];

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? routes(path) : name === 'route.ts' ? [path] : [];
  });
}

describe('database and server errors (SRS-NFR-111)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('are logged, and the browser gets only the plain message', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = serverError('register: player insert', { message: 'violates check constraint "chk_players_minimum_age"', code: '23514' }, 'Could not create your account. Please try again.', 400);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Could not create your account. Please try again.' });
    expect(log).toHaveBeenCalledWith('register: player insert:', 'violates check constraint "chk_players_minimum_age"');
  });

  it("never reach the browser from these routes: no error's message, code or name in a reply", () => {
    const files = AREAS.flatMap((area) => routes(join(API, area)));
    expect(files.length).toBeGreaterThan(15);
    const leaks = files.flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return [...source.matchAll(/Response\.json\(\s*\{[^}]*?\b(error|code|name):\s*\w*(?:[Ee]rror|message)\b(?:\?)?(?:\.(?:message|code|name))?[^}]*\}/g)]
        .map((m) => `${relative(API, file).split(sep).join('/')}: ${m[0].replace(/\s+/g, ' ').slice(0, 90)}`)
        .filter((leak) => /\.(message|code|name)\b|\b(error|code|name):\s*(message|name)\b/.test(leak));
    });
    expect(leaks).toEqual([]);
  });
});
