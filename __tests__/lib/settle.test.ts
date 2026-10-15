import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NO_RESULT_REFUND_MS, decideWager, gradeWager, settleWagers } from '../../lib/sports/settle';

describe('gradeWager', () => {
  const game = (homeScore: number, awayScore: number) => ({ homeScore, awayScore });

  it('grades moneyline picks by who won (SRS-209.4)', () => {
    expect(gradeWager({ marketType: 'moneyline', line: null, side: 'home', ...game(27, 24) })).toBe('Won');
    expect(gradeWager({ marketType: 'moneyline', line: null, side: 'away', ...game(27, 24) })).toBe('Lost');
    expect(gradeWager({ marketType: 'moneyline', line: null, side: 'away', ...game(17, 20) })).toBe('Won');
  });

  it('refunds moneyline team picks on a tie and pays a Draw pick (SRS-209.2)', () => {
    expect(gradeWager({ marketType: 'moneyline', line: null, side: 'home', ...game(27, 27) })).toBe('Refunded');
    expect(gradeWager({ marketType: 'moneyline', line: null, side: 'draw', ...game(1, 1) })).toBe('Won');
    expect(gradeWager({ marketType: 'moneyline', line: null, side: 'draw', ...game(2, 1) })).toBe('Lost');
  });

  it('grades the spread from the home line, with the away team getting the opposite', () => {
    // Home -3.5: home must win by 4+.
    expect(gradeWager({ marketType: 'point_spread', line: -3.5, side: 'home', ...game(28, 24) })).toBe('Won');
    expect(gradeWager({ marketType: 'point_spread', line: -3.5, side: 'home', ...game(27, 24) })).toBe('Lost');
    expect(gradeWager({ marketType: 'point_spread', line: -3.5, side: 'away', ...game(27, 24) })).toBe('Won');
    // Home +2.5: home can lose by up to 2.
    expect(gradeWager({ marketType: 'point_spread', line: 2.5, side: 'home', ...game(22, 24) })).toBe('Won');
    expect(gradeWager({ marketType: 'point_spread', line: 2.5, side: 'away', ...game(22, 24) })).toBe('Lost');
  });

  it('refunds a spread that lands exactly on a whole-number line (push)', () => {
    expect(gradeWager({ marketType: 'point_spread', line: -3, side: 'home', ...game(27, 24) })).toBe('Refunded');
    expect(gradeWager({ marketType: 'point_spread', line: -3, side: 'away', ...game(27, 24) })).toBe('Refunded');
  });

  it('grades over/under against the combined score, refunding an exact hit', () => {
    expect(gradeWager({ marketType: 'total', line: 48.5, side: 'over', ...game(27, 24) })).toBe('Won');
    expect(gradeWager({ marketType: 'total', line: 48.5, side: 'under', ...game(27, 24) })).toBe('Lost');
    expect(gradeWager({ marketType: 'total', line: 41.5, side: 'under', ...game(17, 20) })).toBe('Won');
    expect(gradeWager({ marketType: 'total', line: 51, side: 'over', ...game(27, 24) })).toBe('Refunded');
  });

  it('refunds an option that does not fit its market', () => {
    expect(gradeWager({ marketType: 'total', line: 48.5, side: 'home', ...game(27, 24) })).toBe('Refunded');
    expect(gradeWager({ marketType: 'point_spread', line: null, side: 'home', ...game(27, 24) })).toBe('Refunded');
  });
});

const HOME = 10;
const AWAY = 11;

function pending({
  marketType = 'moneyline' as 'moneyline' | 'point_spread' | 'total',
  line = null as number | string | null,
  teamId = HOME as number | null,
  label = 'Dallas Cowboys',
  options = [
    { option_label: 'Dallas Cowboys', team_id: HOME },
    { option_label: 'Tampa Bay Buccaneers', team_id: AWAY },
  ] as { option_label: string; team_id: number | null }[],
  status = 'Completed' as 'Upcoming' | 'In Progress' | 'Completed' | 'Canceled' | 'Postponed',
  startTime = '2026-10-16T00:15:00Z',
  homeScore = 27 as number | null,
  awayScore = 24 as number | null,
  wagerId = 1,
} = {}) {
  return {
    wager_id: wagerId,
    option: {
      team_id: teamId,
      option_label: label,
      market: {
        market_type_code: marketType,
        line,
        betting_options: options,
        event: { start_time: startTime, status, home_score: homeScore, away_score: awayScore, home_team_id: HOME, away_team_id: AWAY },
      },
    },
  };
}

const AFTER_GAME = new Date('2026-10-16T06:00:00Z');

describe('decideWager', () => {
  it('grades a completed game', () => {
    expect(decideWager(pending(), AFTER_GAME)).toBe('Won');
    expect(decideWager(pending({ teamId: AWAY, label: 'Tampa Bay Buccaneers' }), AFTER_GAME)).toBe('Lost');
  });

  it('reads the line as a number (PostgREST returns NUMERIC as text)', () => {
    const row = pending({ marketType: 'total', line: '48.5', teamId: null, label: 'Over 48.5' });
    expect(decideWager(row, AFTER_GAME)).toBe('Won');
  });

  it('makes a team pick lose a tie when a Draw option was offered', () => {
    const options = [
      { option_label: 'Dallas Cowboys', team_id: HOME },
      { option_label: 'Tampa Bay Buccaneers', team_id: AWAY },
      { option_label: 'Draw', team_id: null },
    ];
    expect(decideWager(pending({ homeScore: 1, awayScore: 1, options }), AFTER_GAME)).toBe('Lost');
    expect(decideWager(pending({ homeScore: 1, awayScore: 1, options, teamId: null, label: 'Draw' }), AFTER_GAME)).toBe('Won');
    // No Draw offered: a tie refunds.
    expect(decideWager(pending({ homeScore: 1, awayScore: 1 }), AFTER_GAME)).toBe('Refunded');
  });

  it('waits while the game is undecided', () => {
    expect(decideWager(pending({ status: 'Upcoming', homeScore: null, awayScore: null }), AFTER_GAME)).toBeNull();
    expect(decideWager(pending({ status: 'In Progress', homeScore: 14, awayScore: 10 }), AFTER_GAME)).toBeNull();
  });

  it('refunds canceled and postponed games (SRS-209.3)', () => {
    expect(decideWager(pending({ status: 'Canceled', homeScore: null, awayScore: null }), AFTER_GAME)).toBe('Refunded');
    expect(decideWager(pending({ status: 'Postponed', homeScore: null, awayScore: null }), AFTER_GAME)).toBe('Refunded');
  });

  it('refunds a game with no result 3 days after it started', () => {
    const row = pending({ status: 'Upcoming', homeScore: null, awayScore: null });
    const start = new Date('2026-10-16T00:15:00Z').getTime();
    expect(decideWager(row, new Date(start + NO_RESULT_REFUND_MS - 1000))).toBeNull();
    expect(decideWager(row, new Date(start + NO_RESULT_REFUND_MS))).toBe('Refunded');
  });
});

describe('settleWagers', () => {
  function fakeSupabase(rows: unknown[], replies: Record<number, unknown> = {}) {
    const query = {
      select: vi.fn(() => query),
      is: vi.fn(() => query),
      limit: vi.fn(() => Promise.resolve({ data: rows, error: null })),
    };
    const rpc = vi.fn(async (_fn: string, args: { p_wager_id: number }) => ({
      data: replies[args.p_wager_id] ?? { status: 'settled' },
      error: null,
    }));
    return { client: { from: vi.fn(() => query), rpc } as unknown as SupabaseClient, rpc, query };
  }

  it('settles only decided wagers through fn_settle_wager and counts the results', async () => {
    const { client, rpc, query } = fakeSupabase([
      pending({ wagerId: 1 }),
      pending({ wagerId: 2, teamId: AWAY, label: 'Tampa Bay Buccaneers' }),
      pending({ wagerId: 3, status: 'Upcoming', homeScore: null, awayScore: null }),
      pending({ wagerId: 4, status: 'Canceled', homeScore: null, awayScore: null }),
    ]);

    const summary = await settleWagers(client, AFTER_GAME);

    expect(query.is).toHaveBeenCalledWith('result', null);
    expect(rpc.mock.calls.map((call) => call[1])).toEqual([
      { p_wager_id: 1, p_result: 'Won' },
      { p_wager_id: 2, p_result: 'Lost' },
      { p_wager_id: 4, p_result: 'Refunded' },
    ]);
    expect(summary).toEqual({ settled: 3, won: 1, lost: 1, refunded: 1, errors: [] });
  });

  it('does not count a wager another run already settled', async () => {
    const { client } = fakeSupabase([pending({ wagerId: 1 })], { 1: { status: 'already_settled', result: 'Won' } });
    expect((await settleWagers(client, AFTER_GAME)).settled).toBe(0);
  });
});
