import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashSessionToken } from '../../lib/auth';
import { toMyParlay, type ParlayRow } from '../../lib/sports/myParlays';
import { functionDefinitions, sqlFiles } from '../helpers/sql';

// Session lookup, as in __tests__/api/sportsWagers.test.ts: only 'good-token'
// belongs to a player (7).
const sessions = {
  select: vi.fn(() => sessions),
  eq: vi.fn((_column: string, tokenHash: string) => {
    sessions.lastHash = tokenHash;
    return sessions;
  }),
  maybeSingle: vi.fn(() =>
    Promise.resolve({
      data: sessions.lastHash === hashSessionToken('good-token') ? { player_id: 7 } : null,
      error: null,
    }),
  ),
  lastHash: '',
};

// fn_cancel_parlay's reply; each test sets it.
const rpc = vi.fn();

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: vi.fn(() => sessions), rpc })),
}));

import { DELETE } from '../../app/api/sports/parlays/[parlayId]/route';

function cancel(parlayId: string, token: string | null = 'good-token') {
  return DELETE(
    new Request(`http://localhost/api/sports/parlays/${parlayId}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
    { params: { parlayId } },
  );
}

describe('DELETE /api/sports/parlays/[parlayId] (SRS-219.6)', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('requires a logged-in player', async () => {
    expect((await cancel('5', null)).status).toBe(401);
    expect((await cancel('5', 'bad-token')).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses an id that is not a number without touching the database', async () => {
    expect((await cancel('abc')).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("cancels the player's own parlay through fn_cancel_parlay and returns the refund and new balance", async () => {
    rpc.mockResolvedValue({ data: { status: 'cancelled', parlay_id: 5, refund: 100, balance: 1000 }, error: null });
    const res = await cancel('5');
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('fn_cancel_parlay', { p_player_id: 7, p_parlay_id: 5 });
    expect(await res.json()).toEqual({ parlayId: 5, refund: 100, balance: 1000 });
  });

  it('maps every refusal from the database', async () => {
    const cases: [object, number, string][] = [
      [{ status: 'too_late' }, 409, 'Parlays can only be cancelled until 1 hour before their first game starts.'],
      [{ status: 'already_settled', result: 'Lost' }, 409, 'This parlay has already been settled.'],
      [{ status: 'parlay_not_found' }, 404, 'That parlay does not exist.'],
      [{ status: 'not_found' }, 404, 'Player not found.'],
    ];
    for (const [data, status, error] of cases) {
      rpc.mockResolvedValue({ data, error: null });
      const res = await cancel('5');
      expect(res.status, JSON.stringify(data)).toBe(status);
      expect((await res.json()).error).toBe(error);
    }
  });

  it('reports a database failure and says the parlay is still active', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await cancel('5');
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Could not cancel your parlay. It is still active. Please try again.');
  });
});

// A parlay whose games start at the given times.
function row(startTimes: string[], result: ParlayRow['result'] = null): ParlayRow {
  return {
    parlay_id: 5,
    amount: 100,
    combined_odds: '6.000000',
    potential_payout: 600,
    placed_at: '2026-11-20T12:00:00Z',
    result,
    payout: result ? 100 : null,
    settled_at: result ? '2026-11-20T13:00:00Z' : null,
    legs: startTimes.map((start, i) => ({
      leg_number: i + 1,
      odds_at_placement: '2.000',
      result: null,
      option: {
        option_label: `Pick ${i + 1}`,
        market: {
          market_type_code: 'moneyline',
          market_types: { display_name: 'Moneyline' },
          event: {
            event_id: i + 1,
            start_time: start,
            status: 'Upcoming',
            home_score: null,
            away_score: null,
            league: null,
            home: null,
            away: null,
          },
        },
      },
    })),
  };
}

describe('when a parlay can be cancelled (SRS-219.6)', () => {
  // The earliest game is at 20:00; the other is the next day.
  const games = ['2026-11-22T20:00:00Z', '2026-11-21T20:00:00Z'];

  it('can be cancelled until 1 hour before its earliest game, whichever pick that is', () => {
    const parlay = toMyParlay(row(games), new Date('2026-11-21T18:59:00Z'));
    expect(parlay.canCancel).toBe(true);
    expect(parlay.cancelUntil).toBe('2026-11-21T19:00:00.000Z');
  });

  it('is locked in from then on, even though its other games are still a day away', () => {
    expect(toMyParlay(row(games), new Date('2026-11-21T19:00:00Z')).canCancel).toBe(false);
  });

  it('cannot be cancelled once it has a result', () => {
    expect(toMyParlay(row(games, 'Cancelled'), new Date('2026-11-20T00:00:00Z')).canCancel).toBe(false);
  });
});

// fn_cancel_parlay (supabase/schema.sql and the 2026-11-24 migration): run
// against real Postgres too; these hold the shape every copy must keep.
describe('fn_cancel_parlay (SRS-219.6)', () => {
  const definitions = functionDefinitions('fn_cancel_parlay');

  it('is defined in schema.sql and the migration', () => {
    expect(definitions.map((d) => d.file)).toEqual(
      expect.arrayContaining(['schema.sql', 'migrations/2026-11-24_cancel_parlay.sql']),
    );
  });

  it.each(definitions.map((d) => [d.file, d.body] as const))(
    'in %s locks the player, checks the owner, an open parlay and the earliest game, and only then refunds the whole stake',
    (_, body) => {
      const lock = body.search(/FROM players\s+WHERE player_id = p_player_id\s+FOR UPDATE/);
      const owner = body.search(/v_owner <> p_player_id/);
      const open = body.search(/'status', 'already_settled'/);
      const cutoff = body.search(/MIN\(e\.start_time\)[\s\S]*INTERVAL '1 hour'/);
      const refund = body.search(/SET balance = balance \+ v_amount/);
      expect([lock, owner, open, cutoff, refund].every((at) => at >= 0)).toBe(true);
      expect(lock).toBeLessThan(owner);
      expect(owner).toBeLessThan(open);
      expect(open).toBeLessThan(cutoff);
      expect(cutoff).toBeLessThan(refund);
      expect(body).toMatch(/SET result = 'Cancelled', payout = v_amount/);
    },
  );

  it('can be called only by the server, in every file', () => {
    for (const { name, sql } of sqlFiles().filter((f) => f.sql.includes('FUNCTION fn_cancel_parlay'))) {
      expect(sql, name).toContain('REVOKE EXECUTE ON FUNCTION fn_cancel_parlay(INTEGER, INTEGER) FROM PUBLIC');
      expect(sql, name).toContain('REVOKE EXECUTE ON FUNCTION fn_cancel_parlay(INTEGER, INTEGER) FROM anon, authenticated');
    }
  });
});
