import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CLASH_LINE_MAX,
  CLASH_LINE_MIN,
  SHOWDOWN_MIN_LEAD_MS,
  clashLinePosition,
  decideShowdown,
  lopsidedness,
  pickMostEven,
  projectedPayout,
  selectShowdowns,
  settleShowdowns,
  splitPool,
  toShowdown,
  type PoolEntry,
} from '../../lib/sports/showdown';
import { NO_RESULT_REFUND_MS } from '../../lib/sports/settle';

const NOW = new Date('2026-10-22T12:00:00Z');
const inHours = (h: number) => new Date(NOW.getTime() + h * 3600_000).toISOString();

describe('picking the most even game', () => {
  it('scores a coin flip as 0 and a lopsided game higher', () => {
    expect(lopsidedness(1.91, 1.91)).toBe(0);
    expect(lopsidedness(1.82, 2.02)).toBeCloseTo(0.026, 3);
    expect(lopsidedness(1.2, 4.8)).toBeCloseTo(0.3, 6);
  });

  it('picks the closest-to-even game inside the window, earliest on a tie', () => {
    const pick = pickMostEven(
      [
        { eventId: 1, startTime: inHours(30), homeOdds: 1.5, awayOdds: 2.6 },
        { eventId: 2, startTime: inHours(48), homeOdds: 1.91, awayOdds: 1.91 },
        { eventId: 3, startTime: inHours(24), homeOdds: 1.91, awayOdds: 1.91 },
      ],
      NOW,
    );
    expect(pick?.eventId).toBe(3);
  });

  it('skips games starting too soon or more than 7 days out', () => {
    const tooSoon = { eventId: 1, startTime: new Date(NOW.getTime() + SHOWDOWN_MIN_LEAD_MS - 1000).toISOString(), homeOdds: 1.91, awayOdds: 1.91 };
    const tooFar = { eventId: 2, startTime: inHours(24 * 8), homeOdds: 1.91, awayOdds: 1.91 };
    const ok = { eventId: 3, startTime: inHours(5), homeOdds: 1.4, awayOdds: 3 };
    expect(pickMostEven([tooSoon, tooFar, ok], NOW)?.eventId).toBe(3);
    expect(pickMostEven([tooSoon, tooFar], NOW)).toBeNull();
  });
});

const entry = (entryId: number, teamId: number, amount: number, placedAt = `2026-10-22T0${entryId}:00:00Z`): PoolEntry => ({
  entryId,
  teamId,
  amount,
  placedAt,
});
const HOME = 10;
const AWAY = 11;

describe('splitPool (SRS-214)', () => {
  it('pays winners in proportion to their stake (SRS-214.1)', () => {
    // Pool 10,000; winning side put in 4,000.
    const payouts = splitPool([entry(1, HOME, 1000), entry(2, HOME, 3000), entry(3, AWAY, 6000)], HOME);
    expect(Object.fromEntries(payouts)).toEqual({ 1: 2500, 2: 7500, 3: 0 });
  });

  it('pays out exactly the whole pool, giving rounding leftovers to the biggest bettor', () => {
    // Pool 1,000; winners 300 + 300 + 100 = 700. Shares 428.57, 428.57, 142.85 -> 428, 428, 142 = 998.
    const payouts = splitPool(
      [entry(1, HOME, 300), entry(2, HOME, 300), entry(3, HOME, 100), entry(4, AWAY, 300)],
      HOME,
    );
    expect(Object.fromEntries(payouts)).toEqual({ 1: 430, 2: 428, 3: 142, 4: 0 });
    expect([...payouts.values()].reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it('refunds everyone when there is no winner (tie or canceled, SRS-214.3)', () => {
    const payouts = splitPool([entry(1, HOME, 500), entry(2, AWAY, 200)], null);
    expect(Object.fromEntries(payouts)).toEqual({ 1: 500, 2: 200 });
  });

  it('refunds everyone when nobody backed the winning team', () => {
    const payouts = splitPool([entry(1, AWAY, 500), entry(2, AWAY, 200)], HOME);
    expect(Object.fromEntries(payouts)).toEqual({ 1: 500, 2: 200 });
  });

  it('gives winners their own stake back when nobody backed the losing team', () => {
    const payouts = splitPool([entry(1, HOME, 500), entry(2, HOME, 200)], HOME);
    expect(Object.fromEntries(payouts)).toEqual({ 1: 500, 2: 200 });
  });

  it('handles huge stakes exactly', () => {
    const payouts = splitPool([entry(1, HOME, 2_000_000), entry(2, AWAY, 3_000_000)], HOME);
    expect(payouts.get(1)).toBe(5_000_000);
  });
});

describe('clashLinePosition', () => {
  it('sits dead center with no bets or an even split', () => {
    expect(clashLinePosition(0, 0)).toBe(50);
    expect(clashLinePosition(500, 1000)).toBe(50);
  });

  it("moves into the other side's half as one side gets more money", () => {
    expect(clashLinePosition(750, 1000)).toBeGreaterThan(50);
    expect(clashLinePosition(250, 1000)).toBeLessThan(50);
  });

  it('never leaves the range that keeps both logos in view', () => {
    expect(clashLinePosition(1000, 1000)).toBe(CLASH_LINE_MAX);
    expect(clashLinePosition(0, 1000)).toBe(CLASH_LINE_MIN);
  });
});

describe('projectedPayout', () => {
  it('estimates what a stake pays if its team wins now', () => {
    expect(projectedPayout(1000, 4000, 10000)).toBe(2500);
    expect(projectedPayout(0, 4000, 10000)).toBe(0);
  });
});

function pendingRow(overrides: Record<string, unknown> = {}) {
  return {
    public_bet_id: 1,
    event_id: 5,
    event: {
      start_time: '2026-10-25T17:00:00Z',
      status: 'Completed' as const,
      home_score: 27,
      away_score: 24,
      home_team_id: HOME,
      away_team_id: AWAY,
      league: { sport: { sport_name: 'American Football' } },
      ...overrides,
    },
  };
}

const AFTER = new Date('2026-10-26T06:00:00Z');

describe('decideShowdown', () => {
  it('returns the winning team', () => {
    expect(decideShowdown(pendingRow(), AFTER)).toBe(HOME);
    expect(decideShowdown(pendingRow({ home_score: 10, away_score: 13 }), AFTER)).toBe(AWAY);
  });

  it('refunds (null) on a tie, cancellation, or no result after 3 days', () => {
    expect(decideShowdown(pendingRow({ home_score: 20, away_score: 20 }), AFTER)).toBeNull();
    expect(decideShowdown(pendingRow({ status: 'Postponed', home_score: null, away_score: null }), AFTER)).toBeNull();
    const noResult = pendingRow({ status: 'Upcoming', home_score: null, away_score: null });
    expect(decideShowdown(noResult, new Date(Date.parse('2026-10-25T17:00:00Z') + NO_RESULT_REFUND_MS))).toBeNull();
  });

  it('waits while the game is undecided', () => {
    expect(decideShowdown(pendingRow({ status: 'In Progress', home_score: 7, away_score: 3 }), AFTER)).toBeUndefined();
  });
});

describe('toShowdown', () => {
  const row = {
    public_bet_id: 1,
    event_id: 5,
    outcome: 'Pending' as const,
    winning_team_id: null,
    settled_at: null,
    event: {
      start_time: '2026-10-25T17:00:00Z',
      status: 'Upcoming' as const,
      home_score: null,
      away_score: null,
      home_team_id: HOME,
      away_team_id: AWAY,
      league: { league_name: 'NFL', sport: { sport_name: 'American Football' } },
      home: { team_name: 'Baltimore Ravens' },
      away: { team_name: 'Cincinnati Bengals' },
    },
  };
  const entries = [
    { public_bet_id: 1, player_id: 7, team_id: HOME, amount: '1000', payout: null },
    { public_bet_id: 1, player_id: 8, team_id: HOME, amount: 3000, payout: null },
    { public_bet_id: 1, player_id: 9, team_id: AWAY, amount: 6000, payout: null },
  ];

  it('adds up each side and the pool (SRS-213.1, SRS-213.2)', () => {
    const showdown = toShowdown(row, entries, null, NOW)!;
    expect(showdown.home).toEqual({ id: HOME, name: 'Baltimore Ravens', total: 4000, players: 2 });
    expect(showdown.away).toEqual({ id: AWAY, name: 'Cincinnati Bengals', total: 6000, players: 1 });
    expect(showdown.pool).toBe(10000);
    expect(showdown.open).toBe(true);
    expect(showdown.mine).toBeNull();
  });

  it("includes the player's own entry and projected payout", () => {
    expect(toShowdown(row, entries, 7, NOW)!.mine).toEqual({ teamId: HOME, amount: 1000, projectedPayout: 2500, payout: null });
  });

  it('never exposes player ids', () => {
    expect(JSON.stringify(toShowdown(row, entries, 7, NOW))).not.toMatch(/player_id|"8"|"9"/);
  });

  it('closes betting once the game starts (SRS-212.3)', () => {
    expect(toShowdown(row, entries, null, new Date('2026-10-25T17:05:00Z'))!.open).toBe(false);
  });
});

describe('settleShowdowns', () => {
  function fake(rows: unknown[]) {
    const query = { select: vi.fn(() => query), eq: vi.fn(() => Promise.resolve({ data: rows, error: null })) };
    const rpc = vi.fn(async (_fn: string, args: { p_winning_team_id: number | null }) => ({
      data: { status: 'settled', outcome: args.p_winning_team_id === null ? 'Refunded' : 'Settled' },
      error: null,
    }));
    return { client: { from: vi.fn(() => query), rpc } as unknown as SupabaseClient, rpc };
  }

  it('settles decided Showdowns with the winner, refunds ties, and skips live games', async () => {
    const { client, rpc } = fake([
      pendingRow(),
      { ...pendingRow({ home_score: 20, away_score: 20 }), public_bet_id: 2 },
      { ...pendingRow({ status: 'In Progress' }), public_bet_id: 3 },
    ]);

    const summary = await settleShowdowns(client, AFTER);

    expect(rpc.mock.calls.map((c) => c[1])).toEqual([
      { p_public_bet_id: 1, p_winning_team_id: HOME },
      { p_public_bet_id: 2, p_winning_team_id: null },
    ]);
    expect(summary).toEqual({ settled: 1, refunded: 1, errors: [] });
  });
});

describe('selectShowdowns', () => {
  function fake({ pending = [] as unknown[], used = [] as unknown[], candidates = [] as unknown[] }) {
    const inserted: unknown[] = [];
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'sports_events') {
          const q = {
            select: vi.fn(() => q),
            eq: vi.fn(() => q),
            gte: vi.fn(() => q),
            lte: vi.fn(() => q),
            then: (resolve: (v: unknown) => void) => resolve({ data: candidates, error: null }),
          };
          return q;
        }
        return {
          select: vi.fn((cols: string) =>
            cols === 'event_id'
              ? Promise.resolve({ data: used, error: null })
              : { eq: vi.fn(() => Promise.resolve({ data: pending, error: null })) },
          ),
          insert: vi.fn(async (row: unknown) => {
            inserted.push(row);
            return { error: null };
          }),
        };
      }),
    } as unknown as SupabaseClient;
    return { client, inserted };
  }

  const candidate = (eventId: number, sport: string, homeOdds: number, awayOdds: number, startHours = 30) => ({
    event_id: eventId,
    start_time: inHours(startHours),
    home_team_id: eventId * 10,
    away_team_id: eventId * 10 + 1,
    league: { sport: { sport_name: sport } },
    betting_markets: [{ betting_options: [{ team_id: eventId * 10, decimal_odds: String(homeOdds) }, { team_id: eventId * 10 + 1, decimal_odds: awayOdds }] }],
  });

  it('picks the most even game for each sport without an open Showdown', async () => {
    const { client, inserted } = fake({
      candidates: [
        candidate(1, 'American Football', 1.5, 2.6),
        candidate(2, 'American Football', 1.82, 2.02),
        candidate(3, 'Basketball', 1.91, 1.91),
      ],
    });

    const summary = await selectShowdowns(client, NOW);

    expect(inserted).toEqual([{ event_id: 2 }, { event_id: 3 }]);
    expect(summary.picked).toEqual([
      { sport: 'American Football', eventId: 2 },
      { sport: 'Basketball', eventId: 3 },
    ]);
  });

  it("leaves a sport alone while its Showdown's game hasn't started, and never reuses a game", async () => {
    const { client, inserted } = fake({
      pending: [{ public_bet_id: 9, event_id: 50, event: { start_time: inHours(10), league: { sport: { sport_name: 'Basketball' } } } }],
      used: [{ event_id: 2 }, { event_id: 50 }],
      candidates: [candidate(1, 'American Football', 1.5, 2.6), candidate(2, 'American Football', 1.91, 1.91), candidate(3, 'Basketball', 1.91, 1.91)],
    });

    await selectShowdowns(client, NOW);

    expect(inserted).toEqual([{ event_id: 1 }]);
  });
});
