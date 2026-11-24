import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashSessionToken } from '../../lib/auth';
import { SAME_GAME_ERROR } from '../../lib/sports/parlays';
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

// The parlays queries used by GET: open ones (`.is('result', null)`) and
// settled ones (`.not('result', 'is', null)`), answered from `parlays.rows`.
const parlays = {
  eq: vi.fn(),
  rows: [] as unknown[],
  error: null as { message: string } | null,
};

function parlayQuery() {
  let want: 'open' | 'settled' = 'open';
  const query = {
    select: () => query,
    eq: (...args: unknown[]) => (parlays.eq(...args), query),
    is: () => ((want = 'open'), query),
    not: () => ((want = 'settled'), query),
    order: () => query,
    limit: () => query,
    then: (resolve: (r: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      if (parlays.error) return Promise.resolve({ data: null, error: parlays.error }).then(resolve, reject);
      const rows = (parlays.rows as { result: string | null }[]).filter((row) => (want === 'open') === (row.result === null));
      return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    },
  };
  return query;
}

// fn_place_parlay's reply; each test sets it.
const rpc = vi.fn();

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    from: vi.fn((table: string) => (table === 'parlays' ? parlayQuery() : sessions)),
    rpc,
  })),
}));

import { GET, POST } from '../../app/api/sports/parlays/route';

function placeParlay(body: unknown, token: string | null = 'good-token') {
  return POST(
    new Request('http://localhost/api/sports/parlays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

const LEGS = [
  { optionId: 11, odds: 1.15 },
  { optionId: 22, odds: 2 },
];
const VALID = { amount: 50, legs: LEGS };

describe('POST /api/sports/parlays (SRS-219.3)', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('requires a logged-in player', async () => {
    expect((await placeParlay(VALID, null)).status).toBe(401);
    expect((await placeParlay(VALID, 'bad-token')).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a parlay with too few or too many picks before touching the database (SRS-219.1)', async () => {
    const one = await placeParlay({ amount: 50, legs: [LEGS[0]] });
    expect(one.status).toBe(400);
    expect((await one.json()).error).toBe('Add 1 more pick to make a parlay (2 to 10).');

    const eleven = Array.from({ length: 11 }, (_, i) => ({ optionId: i + 1, odds: 1.5 }));
    const tooMany = await placeParlay({ amount: 50, legs: eleven });
    expect(tooMany.status).toBe(400);
    expect((await tooMany.json()).error).toBe('A parlay can have at most 10 picks.');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses the same outcome twice, a missing pick or missing odds, and a bad amount', async () => {
    for (const body of [
      { amount: 50, legs: [LEGS[0], LEGS[0]] },
      { amount: 50, legs: [LEGS[0], { odds: 2 }] },
      { amount: 50, legs: [LEGS[0], { optionId: 22 }] },
      { amount: 50 },
      { amount: 49, legs: LEGS },
      { amount: 50.5, legs: LEGS },
    ]) {
      expect((await placeParlay(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it('places it through fn_place_parlay with the picks in order and returns the new balance', async () => {
    rpc.mockResolvedValue({
      data: {
        status: 'placed',
        parlay_id: 5,
        amount: 50,
        combined_odds: '2.300000',
        potential_payout: 115,
        placed_at: '2026-11-23T20:00:00Z',
        balance: 950,
      },
      error: null,
    });

    const res = await placeParlay(VALID);
    expect(res.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith('fn_place_parlay', {
      p_player_id: 7,
      p_amount: 50,
      p_option_ids: [11, 22],
      p_expected_odds: [1.15, 2],
    });
    expect(await res.json()).toEqual({
      parlay: { id: 5, amount: 50, combinedOdds: 2.3, potentialPayout: 115, placedAt: '2026-11-23T20:00:00Z', legs: LEGS },
      balance: 950,
    });
  });

  it('ignores anything the body says about who the player is', async () => {
    rpc.mockResolvedValue({ data: { status: 'placed', balance: 1 }, error: null });
    await placeParlay({ ...VALID, playerId: 99 });
    expect(rpc.mock.calls[0][1].p_player_id).toBe(7);
  });

  it('gives every pick whose odds changed, with its new odds', async () => {
    rpc.mockResolvedValue({
      data: { status: 'odds_changed', changes: [{ option_id: 11, current_odds: '1.200' }, { option_id: 22, current_odds: 2.1 }] },
      error: null,
    });
    const res = await placeParlay(VALID);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.changes).toEqual([
      { optionId: 11, currentOdds: 1.2 },
      { optionId: 22, currentOdds: 2.1 },
    ]);
    expect(body.error).toBe('The odds changed on 2 of your picks. Check the new payout and place your parlay again.');
  });

  it('maps every refusal from the database', async () => {
    const cases: [object, number, string | RegExp][] = [
      [{ status: 'same_game', option_id: 22 }, 400, SAME_GAME_ERROR],
      [{ status: 'closed', option_id: 22 }, 409, /closed/],
      [{ status: 'option_not_found', option_id: 22 }, 404, /no longer exists/],
      [{ status: 'insufficient_balance', balance: 10 }, 400, "You don't have enough coins for this parlay."],
      [{ status: 'no_profit' }, 400, /can't win any coins/],
      [{ status: 'invalid_legs' }, 400, 'A parlay needs 2 to 10 different picks.'],
      [{ status: 'invalid_amount' }, 400, 'The minimum bet is 50 coins.'],
      [{ status: 'not_active' }, 403, /pending deletion/],
      [{ status: 'not_found' }, 404, 'Player not found.'],
    ];
    for (const [data, status, error] of cases) {
      rpc.mockResolvedValue({ data, error: null });
      const res = await placeParlay(VALID);
      expect(res.status, JSON.stringify(data)).toBe(status);
      const body = await res.json();
      if (typeof error === 'string') expect(body.error).toBe(error);
      else expect(body.error).toMatch(error);
    }
  });

  it('reports a database failure without claiming coins were taken', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await placeParlay(VALID);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Could not place your parlay. Your coins were not taken. Please try again.');
  });
});

const ROW: ParlayRow = {
  parlay_id: 5,
  amount: '50',
  combined_odds: '2.300000',
  potential_payout: '115',
  placed_at: '2026-11-23T20:00:00Z',
  result: null,
  payout: null,
  settled_at: null,
  legs: [
    {
      leg_number: 2,
      odds_at_placement: '2.000',
      result: null,
      option: {
        option_label: 'Chiefs',
        market: {
          market_type_code: 'moneyline',
          market_types: { display_name: 'Moneyline' },
          event: {
            event_id: 9,
            start_time: '2099-01-01T00:00:00Z',
            status: 'Upcoming',
            home_score: null,
            away_score: null,
            league: { league_name: 'NFL' },
            home: { team_name: 'Kansas City Chiefs' },
            away: { team_name: 'Denver Broncos' },
          },
        },
      },
    },
    { leg_number: 1, odds_at_placement: '1.150', result: null, option: null },
  ],
};

describe('toMyParlay', () => {
  it('turns a parlay row into what My bets shows, picks in the order they were made', () => {
    const parlay = toMyParlay(ROW);
    expect(parlay).toMatchObject({ id: 5, amount: 50, combinedOdds: 2.3, potentialPayout: 115, decision: 'Pending', result: null });
    expect(parlay.legs.map((l) => [l.legNumber, l.odds])).toEqual([
      [1, 1.15],
      [2, 2],
    ]);
    expect(parlay.legs[1]).toMatchObject({
      selection: 'Chiefs',
      market: 'Moneyline',
      event: { league: 'NFL', homeTeam: 'Kansas City Chiefs', awayTeam: 'Denver Broncos', status: 'Upcoming' },
    });
  });
});

describe('GET /api/sports/parlays', () => {
  beforeEach(() => {
    parlays.eq.mockReset();
    parlays.rows = [];
    parlays.error = null;
  });

  it('requires a logged-in player', async () => {
    expect((await GET(new Request('http://localhost/api/sports/parlays'))).status).toBe(401);
  });

  it("returns only the player's own parlays, split into open and settled", async () => {
    parlays.rows = [ROW, { ...ROW, parlay_id: 6, result: 'Lost', payout: 0, settled_at: '2026-11-24T00:00:00Z' }];
    const res = await GET(new Request('http://localhost/api/sports/parlays', { headers: { Authorization: 'Bearer good-token' } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.open.map((p: { id: number }) => p.id)).toEqual([5]);
    expect(body.settled.map((p: { id: number }) => p.id)).toEqual([6]);
    expect(parlays.eq).toHaveBeenCalledWith('player_id', 7);
  });

  it('returns 500 when the query fails', async () => {
    parlays.error = { message: 'boom' };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await GET(new Request('http://localhost/api/sports/parlays', { headers: { Authorization: 'Bearer good-token' } }));
    expect(res.status).toBe(500);
  });
});

// fn_place_parlay and the parlay tables, in schema.sql and the migration.
// (Run against real Postgres too; these hold the shape every copy must keep.)
describe('fn_place_parlay and the parlay tables (SRS-219.3)', () => {
  const definitions = functionDefinitions('fn_place_parlay');

  it('is defined in schema.sql and the migration', () => {
    expect(definitions.map((d) => d.file)).toEqual(
      expect.arrayContaining(['schema.sql', 'migrations/2026-11-23_place_parlay.sql']),
    );
  });

  it.each(definitions.map((d) => [d.file, d.body] as const))(
    'in %s locks the player before checking the picks, and takes the coins only after every check',
    (_, body) => {
      const lock = body.search(/FROM players\s+WHERE player_id = p_player_id\s+FOR UPDATE/);
      const sameGame = body.search(/'status', 'same_game'/);
      const balance = body.search(/'status', 'insufficient_balance'/);
      const debit = body.search(/SET balance = balance - p_amount/);
      expect([lock, sameGame, balance, debit].every((at) => at >= 0)).toBe(true);
      expect(lock).toBeLessThan(sameGame);
      expect(sameGame).toBeLessThan(debit);
      expect(balance).toBeLessThan(debit);
      expect(body).toMatch(/v_payout := FLOOR\(p_amount \* v_combined\)/);
    },
  );

  it('can be called only by the server, and the tables are closed to the public API, in every file', () => {
    for (const { name, sql } of sqlFiles().filter((f) => f.sql.includes('FUNCTION fn_place_parlay'))) {
      expect(sql, name).toContain('REVOKE EXECUTE ON FUNCTION fn_place_parlay(INTEGER, BIGINT, INTEGER[], NUMERIC[]) FROM PUBLIC');
      expect(sql, name).toContain('REVOKE EXECUTE ON FUNCTION fn_place_parlay(INTEGER, BIGINT, INTEGER[], NUMERIC[]) FROM anon, authenticated');
      for (const table of ['parlays', 'parlay_legs']) {
        expect(sql, name).toContain(`ALTER TABLE ${table.padEnd(11)} ENABLE ROW LEVEL SECURITY`);
        expect(sql, name).toContain(`REVOKE ALL ON ${table} FROM anon, authenticated`);
      }
      expect(sql, name).toContain('CONSTRAINT uq_parlay_legs_event  UNIQUE (parlay_id, event_id)');
    }
  });
});
