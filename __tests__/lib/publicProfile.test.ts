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

  it('is how your own profile links yours', () => {
    const ownProfile = readFileSync(join(APP, 'profile/page.tsx'), 'utf8');
    expect(ownProfile).toContain('publicProfilePath(profile.playerId)');
  });

  it("opens a seated player's profile from the poker table in a window over the game, not a new tab (SRS-121.14)", () => {
    const table = readFileSync(join(APP, 'poker/[tableId]/page.tsx'), 'utf8');
    expect(table).toContain("import ProfileWindow from '../../../components/profile/ProfileWindow'");
    expect(table).toContain('setProfileWindow({ playerId: seatPlayerId');
    expect(table).not.toMatch(/_blank/);
    // The window shows the same public fields as the page.
    const page = readFileSync(join(APP, 'players/[playerId]/page.tsx'), 'utf8');
    const window = readFileSync(join(APP, '../components/profile/ProfileWindow.tsx'), 'utf8');
    for (const file of [page, window]) {
      expect(file).toContain('usePublicProfile(');
      expect(file).toContain('<PublicProfileView');
    }
  });
});
