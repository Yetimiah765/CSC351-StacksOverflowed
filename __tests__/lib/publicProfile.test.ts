import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { publicProfilePath } from '../../lib/publicProfile';

const APP = join(__dirname, '../../app');

describe('Links to a public profile (SRS-121.1)', () => {
  it('points at the public profile page for that player id', () => {
    expect(publicProfilePath(7)).toBe('/players/7');
    // The poker table's seats carry player ids as strings.
    expect(publicProfilePath('12')).toBe('/players/12');
    expect(existsSync(join(APP, 'players/[playerId]/page.tsx'))).toBe(true);
  });

  it('keeps anything odd inside the one path segment', () => {
    expect(publicProfilePath('a/b?c')).toBe('/players/a%2Fb%3Fc');
  });

  it("is how the poker table links a seated player's photo and name, and your own profile links yours", () => {
    const table = readFileSync(join(APP, 'poker/[tableId]/page.tsx'), 'utf8');
    expect(table).toContain('publicProfilePath(seat.playerId)');
    // Opened in a new tab, so leaving to look doesn't take the player away from the hand.
    expect(table).toMatch(/target: '_blank'/);

    const ownProfile = readFileSync(join(APP, 'profile/page.tsx'), 'utf8');
    expect(ownProfile).toContain('publicProfilePath(profile.playerId)');
  });
});
