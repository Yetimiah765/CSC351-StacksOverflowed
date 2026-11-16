import { describe, expect, it } from 'vitest';
import {
  BIGGEST_WINS_LIMIT,
  TOP_EARNERS_LIMIT,
  biggestWins,
  PAGE_ROWS,
  allRows,
  buildLeaderboard,
  leaderboardWeek,
  loadDecidedBets,
  playedInWeek,
  rankEarners,
  type DecidedBet,
} from '../../lib/sports/leaderboard';
import type { SupabaseClient } from '@supabase/supabase-js';

const bet = (playerId: number, stake: number, payout: number, extra: Partial<DecidedBet> = {}): DecidedBet => ({
  playerId,
  stake,
  payout,
  settledAt: '2026-10-27T12:00:00Z',
  kind: 'wager',
  pick: 'Brooklyn Nets +11.5',
  game: 'Brooklyn Nets @ Boston Celtics',
  ...extra,
});

describe('leaderboardWeek (SRS-216.2)', () => {
  it('runs Monday 00:00 to the next Monday 00:00 Eastern, in daylight time', () => {
    // Tuesday Oct 27, 2026, 3 PM Eastern (EDT, UTC-4).
    const week = leaderboardWeek(new Date('2026-10-27T19:00:00Z'));
    expect(week.start.toISOString()).toBe('2026-10-26T04:00:00.000Z');
    // Daylight saving ends Sunday Nov 1, so the week ends at Monday 00:00 EST (UTC-5).
    expect(week.end.toISOString()).toBe('2026-11-02T05:00:00.000Z');
  });

  it('counts Sunday 11:59 PM Eastern as the same week, and Monday 12:00 AM as the next', () => {
    const sundayNight = leaderboardWeek(new Date('2026-11-02T04:59:00Z')); // Sun Nov 1, 11:59 PM EST
    expect(sundayNight.start.toISOString()).toBe('2026-10-26T04:00:00.000Z');
    const mondayMorning = leaderboardWeek(new Date('2026-11-02T05:00:00Z')); // Mon Nov 2, 12:00 AM EST
    expect(mondayMorning.start.toISOString()).toBe('2026-11-02T05:00:00.000Z');
    expect(mondayMorning.end.toISOString()).toBe('2026-11-09T05:00:00.000Z');
  });

  it('uses Eastern, not UTC, to decide the day', () => {
    // Monday Oct 26, 1 AM UTC is still Sunday Oct 25 in New York.
    expect(leaderboardWeek(new Date('2026-10-26T01:00:00Z')).start.toISOString()).toBe('2026-10-19T04:00:00.000Z');
  });

  it('steps back whole weeks for last week (SRS-216.6)', () => {
    const last = leaderboardWeek(new Date('2026-11-04T17:00:00Z'), 1);
    expect(last.start.toISOString()).toBe('2026-10-26T04:00:00.000Z');
    expect(last.end.toISOString()).toBe('2026-11-02T05:00:00.000Z');
  });
});

describe('rankEarners (SRS-216.1, SRS-216.3)', () => {
  it('ranks players by payouts minus stakes across all their bets', () => {
    const ranked = rankEarners([bet(1, 100, 191), bet(1, 50, 0), bet(2, 500, 1000), bet(3, 200, 0)]);
    expect(ranked).toEqual([
      { playerId: 2, net: 500, bets: 1, wins: 1, rank: 1 },
      { playerId: 1, net: 41, bets: 2, wins: 1, rank: 2 },
      { playerId: 3, net: -200, bets: 1, wins: 0, rank: 3 },
    ]);
  });

  it('counts Showdown bets the same as regular ones', () => {
    const ranked = rankEarners([bet(1, 1000, 1666, { kind: 'showdown' }), bet(1, 100, 0)]);
    expect(ranked[0]).toMatchObject({ net: 566, bets: 2, wins: 1 });
  });

  it('gives tied players the same rank, fewer bets listed first', () => {
    const ranked = rankEarners([bet(1, 100, 200), bet(1, 100, 100), bet(2, 100, 200), bet(3, 50, 0)]);
    expect(ranked.map((r) => [r.playerId, r.rank])).toEqual([
      [2, 1],
      [1, 1],
      [3, 3],
    ]);
  });
});

describe('biggestWins (SRS-216.5)', () => {
  it('lists the largest single payouts from winning bets only', () => {
    const wins = biggestWins([
      bet(1, 100, 300, { pick: 'Small' }),
      bet(2, 1000, 0, { pick: 'Lost' }),
      bet(3, 1000, 1666, { pick: 'Big', kind: 'showdown' }),
    ]);
    expect(wins.map((w) => [w.pick, w.payout, w.profit, w.kind])).toEqual([
      ['Big', 1666, 666, 'showdown'],
      ['Small', 300, 200, 'wager'],
    ]);
  });

  it('keeps only the top few, earliest first on equal payouts', () => {
    const many = Array.from({ length: BIGGEST_WINS_LIMIT + 3 }, (_, i) => bet(i + 1, 100, 200, { settledAt: `2026-10-2${i % 9}T00:00:00Z` }));
    const wins = biggestWins(many);
    expect(wins).toHaveLength(BIGGEST_WINS_LIMIT);
    expect(wins[0].settledAt <= wins[1].settledAt).toBe(true);
  });
});

describe('buildLeaderboard', () => {
  const week = leaderboardWeek(new Date('2026-10-27T19:00:00Z'));
  const names = new Map([
    [1, 'Sparkiey12'],
    [2, 'jamejohn'],
  ]);

  it('names players and keeps the top list short', () => {
    const many = Array.from({ length: TOP_EARNERS_LIMIT + 5 }, (_, i) => bet(i + 1, 100, 100 + i));
    const board = buildLeaderboard(many, names, week, null);
    expect(board.topEarners).toHaveLength(TOP_EARNERS_LIMIT);
    expect(board.topEarners[0]).toMatchObject({ playerId: TOP_EARNERS_LIMIT + 5, rank: 1, username: 'Player' });
    expect(board.week).toEqual({ start: '2026-10-26T04:00:00.000Z', end: '2026-11-02T05:00:00.000Z' });
    expect(board.me).toBeNull();
  });

  it("shows the player's own rank even when they're below the top list (SRS-216.4)", () => {
    const many = Array.from({ length: TOP_EARNERS_LIMIT + 5 }, (_, i) => bet(i + 10, 100, 1000));
    const board = buildLeaderboard([...many, bet(1, 100, 0)], names, week, 1);
    expect(board.topEarners.some((row) => row.playerId === 1)).toBe(false);
    expect(board.me).toEqual({ rank: TOP_EARNERS_LIMIT + 6, net: -100, bets: 1 });
  });

  it('gives a player with no decided bets no rank and zero winnings', () => {
    expect(buildLeaderboard([bet(2, 100, 200)], names, week, 1).me).toEqual({ rank: null, net: 0, bets: 0 });
  });
});

// Bug #1004: bets were put in the week the sync settled them, so a Sunday game
// (scored the next morning) landed in the following week.
describe('a bet counts in the week its game was played (SRS-216.2, SRS-216.3)', () => {
  const nov2to8 = leaderboardWeek(new Date('2026-11-05T17:00:00Z'));
  const nov9to15 = leaderboardWeek(new Date('2026-11-10T17:00:00Z'));
  // The Packers Showdown from the bug report: played Sun Nov 8, 4:25 PM ET,
  // settled Mon Nov 9, 10:10 AM ET.
  const SUNDAY_GAME = '2026-11-08T21:25:34Z';
  const MONDAY_SETTLE = '2026-11-09T15:10:20Z';

  it('puts a game in the week it started, in Eastern time', () => {
    expect(playedInWeek(SUNDAY_GAME, nov2to8)).toBe(true);
    expect(playedInWeek(SUNDAY_GAME, nov9to15)).toBe(false);
    // Sun 11:59 PM ET is still that week; Mon 12:00 AM ET is the next.
    expect(playedInWeek('2026-11-09T04:59:00Z', nov2to8)).toBe(true);
    expect(playedInWeek('2026-11-09T05:00:00Z', nov2to8)).toBe(false);
    expect(playedInWeek(null, nov2to8)).toBe(false);
  });

  // A stand-in for supabase-js: each table answers with its rows, whatever
  // the filters, at most PAGE_ROWS of them per request like the real API,
  // and records the settled_at range and the pages it was asked for.
  function fakeSupabase(tables: Record<string, unknown[]>) {
    const ranges: Record<string, { from?: string; to?: string }> = {};
    const pages: Record<string, [number, number][]> = {};
    const client = {
      from(table: string) {
        ranges[table] = {};
        pages[table] ??= [];
        let first = 0;
        let last = Infinity;
        const query = {
          select: () => query,
          in: () => query,
          eq: () => query,
          order: () => query,
          gte: (_column: string, value: string) => ((ranges[table].from = value), query),
          lt: (_column: string, value: string) => ((ranges[table].to = value), query),
          range: (from: number, to: number) => {
            first = from;
            last = to;
            pages[table].push([from, to]);
            return query;
          },
          then: (resolve: (r: unknown) => unknown) => {
            const rows = (tables[table] ?? []).slice(first, Math.min(last + 1, first + PAGE_ROWS));
            return resolve({ data: rows, error: null });
          },
        };
        return query;
      },
    };
    return { client: client as unknown as SupabaseClient, ranges, pages };
  }

  const event = (start_time: string) => ({
    start_time,
    home_team_id: 1,
    away_team_id: 2,
    home: { team_name: 'New England Patriots' },
    away: { team_name: 'Green Bay Packers' },
  });
  const tables = {
    wagers: [
      { player_id: 2, amount: 10000, payout: 0, settled_at: MONDAY_SETTLE, option: { option_label: 'Seattle Seahawks', market: { event: event(SUNDAY_GAME) } } },
      { player_id: 3, amount: 100, payout: 200, settled_at: '2026-11-11T12:00:00Z', option: { option_label: 'Bulls', market: { event: event('2026-11-10T23:00:00Z') } } },
    ],
    public_bets: [
      { settled_at: MONDAY_SETTLE, event: event(SUNDAY_GAME), entries: [{ player_id: 22, team_id: 2, amount: 100000, payout: 505000 }] },
    ],
  };

  it("counts Sunday's games on that week's board, even though they were settled on Monday", async () => {
    const { client } = fakeSupabase(tables);
    const bets = await loadDecidedBets(client, nov2to8);
    expect(bets.map((b) => [b.kind, b.playerId, b.payout])).toEqual([
      ['wager', 2, 0],
      ['showdown', 22, 505000],
    ]);
  });

  it("leaves last Sunday's games off the next week's board", async () => {
    const { client } = fakeSupabase(tables);
    const bets = await loadDecidedBets(client, nov9to15);
    expect(bets.map((b) => b.playerId)).toEqual([3]);
  });

  it('looks for settled bets from the week start until well after it ends', async () => {
    const { client, ranges } = fakeSupabase(tables);
    await loadDecidedBets(client, nov2to8);
    expect(ranges.wagers.from).toBe(nov2to8.start.toISOString());
    // A game with no result is refunded 3 days after it starts, so Sunday's
    // games can be settled as late as Wednesday; the range reaches past that.
    expect(Date.parse(ranges.wagers.to!)).toBeGreaterThan(nov2to8.end.getTime() + 3 * 24 * 60 * 60 * 1000);
    expect(ranges.public_bets).toEqual(ranges.wagers);
  });

  // Bug #1015: the API returns at most PAGE_ROWS rows per request, so a week
  // with more decided bets than that lost the rest.
  it('counts every bet in a week with more than 1,000 of them (SRS-216.3)', async () => {
    const many = Array.from({ length: 2500 }, (_, i) => ({
      player_id: 1 + (i % 50),
      amount: 100,
      payout: i % 2 ? 200 : 0,
      settled_at: MONDAY_SETTLE,
      option: { option_label: 'Pick', market: { event: event(SUNDAY_GAME) } },
    }));
    const { client, pages } = fakeSupabase({ wagers: many, public_bets: [] });
    const bets = await loadDecidedBets(client, nov2to8);
    expect(bets).toHaveLength(2500);
    expect(pages.wagers).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    // The totals come from all 2,500: 1,250 wins of +100 and 1,250 losses of -100.
    expect(rankEarners(bets).reduce((sum, row) => sum + row.net, 0)).toBe(0);
    expect(rankEarners(bets).reduce((sum, row) => sum + row.bets, 0)).toBe(2500);
  });
});

describe('allRows', () => {
  it('keeps asking for pages until one comes back short', async () => {
    const asked: [number, number][] = [];
    const rows = await allRows<number>((from, to) => {
      asked.push([from, to]);
      const page = Array.from({ length: Math.max(0, Math.min(PAGE_ROWS, 2000 - from)) }, (_, i) => from + i);
      return Promise.resolve({ data: page, error: null });
    });
    expect(rows).toHaveLength(2000);
    expect(rows[1999]).toBe(1999);
    // Exactly 2,000 rows: the third page comes back empty, which ends it.
    expect(asked).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('stops at a database error instead of returning part of the rows', async () => {
    await expect(allRows(() => Promise.resolve({ data: null, error: { message: 'timeout' } }))).rejects.toThrow('timeout');
  });
});
