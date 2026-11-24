import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { gradeParlay, settleParlays } from '../../lib/sports/settleParlays';
import { PAGE_ROWS } from '../../lib/sports/paging';
import type { PendingOption } from '../../lib/sports/settle';
import { functionDefinitions, sqlFiles } from '../helpers/sql';

const HOME = 10;
const AWAY = 11;
const AFTER_GAMES = new Date('2026-10-16T06:00:00Z');

// One leg: a moneyline pick on the home team, whose game ended homeScore to
// awayScore (null scores while it's still to play).
function leg(
  legNumber: number,
  odds: number,
  {
    status = 'Completed',
    homeScore = 27,
    awayScore = 24,
  }: { status?: 'Upcoming' | 'Completed' | 'Canceled'; homeScore?: number | null; awayScore?: number | null } = {},
): { leg_number: number; odds_at_placement: string; option: PendingOption } {
  return {
    leg_number: legNumber,
    odds_at_placement: odds.toFixed(3),
    option: {
      team_id: HOME,
      option_label: 'Dallas Cowboys',
      market: {
        market_type_code: 'moneyline',
        line: null,
        betting_options: [
          { option_label: 'Dallas Cowboys', team_id: HOME },
          { option_label: 'Tampa Bay Buccaneers', team_id: AWAY },
        ],
        event: { start_time: '2026-10-16T00:15:00Z', status, home_score: homeScore, away_score: awayScore, home_team_id: HOME, away_team_id: AWAY },
      },
    },
  };
}
const WIN = {};
const LOSS = { homeScore: 10, awayScore: 24 };
const STILL_TO_PLAY = { status: 'Upcoming' as const, homeScore: null, awayScore: null };
const CANCELED = { status: 'Canceled' as const, homeScore: null, awayScore: null };

function parlay(parlayId: number, amount: number, legs: ReturnType<typeof leg>[]) {
  return { parlay_id: parlayId, amount: String(amount), legs };
}

describe('gradeParlay (SRS-219.4)', () => {
  it('grades each leg like a single bet, in leg order', () => {
    // Legs come back from the database in any order.
    const { results, decision } = gradeParlay(parlay(1, 100, [leg(2, 3, LOSS), leg(1, 2, WIN)]), AFTER_GAMES);
    expect(results).toEqual(['Won', 'Lost']);
    expect(decision).toEqual({ result: 'Lost', payout: 0 });
  });

  it('settles a parlay as lost while its other games are still to play', () => {
    const { results, decision } = gradeParlay(parlay(1, 100, [leg(1, 2, LOSS), leg(2, 3, STILL_TO_PLAY)]), AFTER_GAMES);
    expect(results).toEqual(['Lost', null]);
    expect(decision?.result).toBe('Lost');
  });

  it('waits while a game is undecided and nothing has lost', () => {
    expect(gradeParlay(parlay(1, 100, [leg(1, 2, WIN), leg(2, 3, STILL_TO_PLAY)]), AFTER_GAMES).decision).toBeNull();
  });

  it('drops a canceled game and pays on the rest', () => {
    const { results, decision } = gradeParlay(parlay(1, 100, [leg(1, 2, WIN), leg(2, 5, CANCELED), leg(3, 3, WIN)]), AFTER_GAMES);
    expect(results).toEqual(['Won', 'Refunded', 'Won']);
    expect(decision).toEqual({ result: 'Won', payout: 600 });
  });
});

describe('settleParlays (SRS-219.4)', () => {
  // Answers like the real API: at most PAGE_ROWS rows per request.
  function fakeSupabase(rows: unknown[], replies: Record<number, unknown> = {}) {
    const query = {
      select: vi.fn(() => query),
      is: vi.fn(() => query),
      order: vi.fn(() => query),
      range: vi.fn((first: number, last: number) =>
        Promise.resolve({ data: rows.slice(first, Math.min(last + 1, first + PAGE_ROWS)), error: null }),
      ),
    };
    const rpc = vi.fn(async (_fn: string, args: { p_parlay_id: number; p_leg_results: unknown[] }) => {
      const reply = replies[args.p_parlay_id];
      if (reply) return { data: reply, error: null };
      const results = args.p_leg_results;
      const result = results.includes('Lost') ? 'Lost' : results.every((r) => r === 'Refunded') ? 'Refunded' : 'Won';
      return { data: { status: 'settled', result }, error: null };
    });
    return { client: { from: vi.fn(() => query), rpc } as unknown as SupabaseClient, rpc, query };
  }

  it('settles only decided parlays through fn_settle_parlay, sending every leg result, and counts them', async () => {
    const { client, rpc, query } = fakeSupabase([
      parlay(1, 100, [leg(1, 2, WIN), leg(2, 3, WIN)]),
      parlay(2, 100, [leg(1, 2, LOSS), leg(2, 3, STILL_TO_PLAY)]),
      parlay(3, 100, [leg(1, 2, WIN), leg(2, 3, STILL_TO_PLAY)]),
      parlay(4, 100, [leg(1, 2, CANCELED), leg(2, 3, CANCELED)]),
    ]);

    const summary = await settleParlays(client, AFTER_GAMES);

    expect(query.is).toHaveBeenCalledWith('result', null);
    expect(rpc.mock.calls.map((call) => call[1])).toEqual([
      { p_parlay_id: 1, p_leg_results: ['Won', 'Won'] },
      { p_parlay_id: 2, p_leg_results: ['Lost', null] },
      { p_parlay_id: 4, p_leg_results: ['Refunded', 'Refunded'] },
    ]);
    expect(rpc.mock.calls.every((call) => call[0] === 'fn_settle_parlay')).toBe(true);
    expect(summary).toEqual({ settled: 3, won: 1, lost: 1, refunded: 1, errors: [] });
  });

  it('does not count a parlay another run already settled', async () => {
    const { client } = fakeSupabase([parlay(1, 100, [leg(1, 2, WIN), leg(2, 3, WIN)])], {
      1: { status: 'already_settled', result: 'Won' },
    });
    expect((await settleParlays(client, AFTER_GAMES)).settled).toBe(0);
  });

  it('settles every decided parlay however many are open', async () => {
    const rows = Array.from({ length: PAGE_ROWS + 5 }, (_, i) => parlay(i + 1, 100, [leg(1, 2, LOSS), leg(2, 3, WIN)]));
    const { client, rpc, query } = fakeSupabase(rows);
    const summary = await settleParlays(client, AFTER_GAMES);
    expect(query.range).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledTimes(PAGE_ROWS + 5);
    expect(summary.lost).toBe(PAGE_ROWS + 5);
  });

  it('reports a failed settlement and carries on with the rest', async () => {
    const { client, rpc } = fakeSupabase([
      parlay(1, 100, [leg(1, 2, WIN), leg(2, 3, WIN)]),
      parlay(2, 100, [leg(1, 2, LOSS), leg(2, 3, WIN)]),
    ]);
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } } as never);
    const summary = await settleParlays(client, AFTER_GAMES);
    expect(summary.errors).toEqual(['Parlay 1: timeout']);
    expect(summary.lost).toBe(1);
  });

  it('reports a failure to load the open parlays without settling anything', async () => {
    const query = {
      select: () => query,
      is: () => query,
      order: () => query,
      range: () => Promise.resolve({ data: null, error: { message: 'down' } }),
    };
    const rpc = vi.fn();
    const summary = await settleParlays({ from: () => query, rpc } as unknown as SupabaseClient, AFTER_GAMES);
    expect(summary.errors).toEqual(['Loading open parlays failed: down']);
    expect(rpc).not.toHaveBeenCalled();
  });
});

// fn_settle_parlay (supabase/schema.sql and the 2026-11-24 migration): run
// against real Postgres too; these hold the shape every copy must keep.
describe('fn_settle_parlay (SRS-219.4)', () => {
  const definitions = functionDefinitions('fn_settle_parlay');

  it('is defined in schema.sql and the migration', () => {
    expect(definitions.map((d) => d.file)).toEqual(
      expect.arrayContaining(['schema.sql', 'migrations/2026-11-24_settle_parlay.sql']),
    );
  });

  it.each(definitions.map((d) => [d.file, d.body] as const))(
    'in %s locks the player, never settles twice, and pays from the stored odds of the won legs',
    (_, body) => {
      const lock = body.search(/FROM players WHERE player_id = v_player_id FOR UPDATE/);
      const twice = body.search(/'status', 'already_settled'/);
      const pay = body.search(/SET balance = balance \+ v_payout/);
      expect([lock, twice, pay].every((at) => at >= 0)).toBe(true);
      expect(lock).toBeLessThan(twice);
      expect(twice).toBeLessThan(pay);
      expect(body).toMatch(/v_won_odds := v_won_odds \* v_leg\.odds_at_placement/);
      expect(body).toMatch(/v_payout := FLOOR\(v_amount \* v_won_odds\)/);
    },
  );

  it('can be called only by the server, in every file', () => {
    for (const { name, sql } of sqlFiles().filter((f) => f.sql.includes('FUNCTION fn_settle_parlay'))) {
      expect(sql, name).toContain('REVOKE EXECUTE ON FUNCTION fn_settle_parlay(INTEGER, VARCHAR[]) FROM PUBLIC');
      expect(sql, name).toContain('REVOKE EXECUTE ON FUNCTION fn_settle_parlay(INTEGER, VARCHAR[]) FROM anon, authenticated');
    }
  });
});
