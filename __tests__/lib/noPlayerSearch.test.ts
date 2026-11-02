import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { describe, expect, it } from 'vitest';

// SRS-121.2: there is no way to search for a player's profile by username.
// Profiles open only by player id (/players/[playerId]), so these checks
// look at the app itself: its pages and API routes.

const APP = join(__dirname, '../../app');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const appFiles = files(APP).map((path) => relative(APP, path));

describe('No player search (SRS-121.2)', () => {
  it('has no search page or route', () => {
    expect(appFiles.filter((path) => /search/i.test(path))).toEqual([]);
  });

  it('opens profiles only by player id, with no page or route that lists players', () => {
    expect(appFiles.filter((path) => path.startsWith('players/'))).toEqual(['players/[playerId]/page.tsx']);
    expect(appFiles.filter((path) => path.startsWith('api/players/')).every((path) => path.startsWith('api/players/[playerId]/'))).toBe(true);
  });

  it('matches usernames by text only to log in and sign up, never to find a profile', () => {
    // .ilike/.like/.textSearch are how a route would look a name up by text.
    const textLookups = appFiles.filter(
      (path) => path.endsWith('.ts') && /\.(?:i?like|textSearch)\(/.test(readFileSync(join(APP, path), 'utf8'))
    );
    expect(textLookups.sort()).toEqual(['api/auth/login/route.ts', 'api/auth/register/route.ts']);
  });
});
