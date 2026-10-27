import { describe, expect, it } from 'vitest';
import { TEAMS, luminance, teamAccent, teamInfo, teamLogoUrl } from '../../lib/sports/teams';

describe('team table', () => {
  const entries = Object.entries(TEAMS);

  it('lists every NFL, NBA, and NHL team', () => {
    expect(entries.filter(([, t]) => t.league === 'NFL')).toHaveLength(32);
    expect(entries.filter(([, t]) => t.league === 'NBA')).toHaveLength(30);
    // 32 teams plus the Arizona Coyotes, which The Odds API still lists.
    expect(entries.filter(([, t]) => t.league === 'NHL')).toHaveLength(33);
  });

  it('gives every team a unique ESPN code within its league', () => {
    for (const league of ['NFL', 'NBA', 'NHL']) {
      const codes = entries.filter(([, t]) => t.league === league).map(([, t]) => t.code);
      expect(new Set(codes).size).toBe(codes.length);
      for (const code of codes) expect(code).toMatch(/^[a-z]{2,4}$/);
    }
  });

  it('gives every team two valid hex colors', () => {
    for (const [, team] of entries) {
      expect(team.primary).toMatch(/^#[0-9A-F]{6}$/);
      expect(team.secondary).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

describe('teamLogoUrl', () => {
  it("builds the resized ESPN logo URL from the team's league and code", () => {
    expect(teamLogoUrl('Baltimore Ravens', 96)).toBe('https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/bal.png&h=96&w=96');
    expect(teamLogoUrl('Utah Jazz', 64)).toBe('https://a.espncdn.com/combiner/i?img=/i/teamlogos/nba/500/utah.png&h=64&w=64');
    expect(teamLogoUrl('Toronto Maple Leafs', 64)).toBe('https://a.espncdn.com/combiner/i?img=/i/teamlogos/nhl/500/tor.png&h=64&w=64');
  });

  it("matches The Odds API's exact NHL spellings", () => {
    expect(teamInfo('Montréal Canadiens')?.code).toBe('mtl');
    expect(teamInfo('St Louis Blues')?.code).toBe('stl');
  });

  it('returns null for a team that is not listed, so the crest falls back to initials', () => {
    expect(teamLogoUrl('Manchester United')).toBeNull();
    expect(teamInfo('Manchester United')).toBeNull();
  });
});

describe('teamAccent', () => {
  it('uses the primary color when it shows on a dark background', () => {
    expect(teamAccent('Chicago Bulls')).toBe('#CE1141');
  });

  it('switches to the secondary color when the primary is nearly black', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#FFFFFF')).toBeCloseTo(1, 5);
    expect(teamAccent('Las Vegas Raiders')).toBe('#A5ACAF');
    expect(teamAccent('Brooklyn Nets')).toBe('#FFFFFF');
  });

  it('returns null for an unlisted team', () => {
    expect(teamAccent('Manchester United')).toBeNull();
  });
});
