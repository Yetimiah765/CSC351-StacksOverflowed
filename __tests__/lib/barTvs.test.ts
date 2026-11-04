import { describe, expect, it } from 'vitest';
import { TV_ROTATE_MS, kickoffLabel, showdownForTv, showdownTvGames } from '../../lib/barTvs';
import type { Showdown } from '../../lib/sports/showdown';

let nextId = 1;
function showdown(overrides: Partial<Showdown>): Showdown {
  const id = nextId++;
  return {
    id,
    sport: 'Basketball',
    league: 'NBA',
    eventId: id,
    startTime: '2026-11-08T23:30:00Z',
    status: 'Upcoming',
    homeScore: null,
    awayScore: null,
    home: { id: 1, name: 'Kansas City Chiefs', total: 1200, players: 3 },
    away: { id: 2, name: 'Buffalo Bills', total: 800, players: 1 },
    pool: 2000,
    open: true,
    outcome: 'Pending',
    winningTeamId: null,
    mine: null,
    ...overrides,
  };
}

describe("the bar's TVs", () => {
  it('shows every Showdown, in the order the Showdown page lists them', () => {
    const list = [showdown({ league: 'NBA' }), showdown({ league: 'NFL' }), showdown({ league: 'NHL' }), showdown({ league: 'EPL' })];
    expect(showdownTvGames(list).map((game) => game.league)).toEqual(['NBA', 'NFL', 'NHL', 'EPL']);
  });

  it('carries the pool and what each team has behind it, with the score once the game is on', () => {
    const [open] = showdownTvGames([showdown({})]);
    expect(open!.state).toBe('upcoming');
    expect(open!.pool).toBe(2000);
    expect(open!.home).toMatchObject({ name: 'Kansas City Chiefs', short: 'KC', coins: 1200, players: 3, score: null });
    expect(open!.away).toMatchObject({ name: 'Buffalo Bills', short: 'BUF', coins: 800, players: 1 });
    expect(open!.home.color).toMatch(/^#[0-9a-f]{6}$/i);

    const [live] = showdownTvGames([showdown({ open: false, status: 'In Progress', homeScore: 21, awayScore: 17 })]);
    expect(live!.state).toBe('live');
    expect([live!.away.score, live!.home.score]).toEqual([17, 21]);

    const [done] = showdownTvGames([showdown({ open: false, status: 'Completed', outcome: 'Settled', homeScore: 3, awayScore: 1 })]);
    expect(done!.state).toBe('final');
    const [off] = showdownTvGames([showdown({ open: false, status: 'Postponed', outcome: 'Refunded' })]);
    expect(off!.state).toBe('off');
  });

  it("falls back to initials and a stock colour for a team it doesn't know, and a near-black team's second colour", () => {
    const [game] = showdownTvGames([
      showdown({
        home: { id: 1, name: 'Springfield Isotopes', total: 0, players: 0 },
        away: { id: 2, name: 'Las Vegas Raiders', total: 0, players: 0 },
      }),
    ]);
    expect(game!.home.short).toBe('SI');
    expect(game!.home.color).toMatch(/^#[0-9a-f]{6}$/i);
    // The Raiders are black and silver.
    expect(game!.away.color.toUpperCase()).toBe('#A5ACAF');
  });

  it('gives each TV its own Showdown, repeating them when there are fewer than TVs', () => {
    expect(showdownForTv([], 0, 3, 0)).toBeNull();
    expect([0, 1, 2].map((tv) => showdownForTv(['a', 'b', 'c'], tv, 3, 123456))).toEqual(['a', 'b', 'c']);
    expect([0, 1, 2].map((tv) => showdownForTv(['a', 'b'], tv, 3, 0))).toEqual(['a', 'b', 'a']);
  });

  it('pages through them when there are more Showdowns than TVs, so every one comes round', () => {
    const list = ['a', 'b', 'c', 'd', 'e'];
    const page = (n: number) => [0, 1, 2].map((tv) => showdownForTv(list, tv, 3, n * TV_ROTATE_MS + 10));
    expect(page(0)).toEqual(['a', 'b', 'c']);
    expect(page(1)).toEqual(['d', 'e', 'a']);
    expect(page(2)).toEqual(['a', 'b', 'c']);
    expect(new Set([...page(0), ...page(1)])).toEqual(new Set(list));
  });

  it('labels the start time like a broadcast', () => {
    const now = new Date(2026, 10, 8, 12, 0);
    expect(kickoffLabel(new Date(2026, 10, 8, 19, 30).toISOString(), now)).toBe('TONIGHT 7:30 PM');
    expect(kickoffLabel(new Date(2026, 10, 8, 13, 0).toISOString(), now)).toBe('TODAY 1:00 PM');
    expect(kickoffLabel(new Date(2026, 10, 14, 13, 0).toISOString(), now)).toBe('SAT 1:00 PM');
  });
});
