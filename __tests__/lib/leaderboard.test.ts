import { describe, expect, it } from 'vitest';
import {
  BIGGEST_WINS_LIMIT,
  TOP_EARNERS_LIMIT,
  biggestWins,
  buildLeaderboard,
  leaderboardWeek,
  rankEarners,
  type DecidedBet,
} from '../../lib/sports/leaderboard';

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
