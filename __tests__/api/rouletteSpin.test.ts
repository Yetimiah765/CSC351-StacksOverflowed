import { beforeEach, describe, expect, it, vi } from 'vitest';

// See __tests__/api/auth.test.ts for the rationale behind this builder shape.
function makeTableMock() {
  const builder: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    maybeSingleResult: { data: unknown; error: unknown };
  } = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(builder.maybeSingleResult)),
    maybeSingleResult: { data: null, error: null },
  };
  return builder;
}

const tables = { player_sessions: makeTableMock() };

// The database function's reply; each test sets it.
const rpc = vi.fn();

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    from: vi.fn((table: keyof typeof tables) => tables[table]),
    rpc,
  })),
}));

// The wheel always lands on 17 in these tests.
vi.mock('crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('crypto')>()),
  randomInt: vi.fn(() => 17),
}));

import { randomInt } from 'crypto';
import { getSupabaseClient } from '../../lib/supabase';
import { POST } from '../../app/api/roulette/spin/route';

const BETS = [
  { type: 'Number', number: 17, amount: 50 },
  { type: 'Red', amount: 10 },
];

function req(body: unknown, token: string | null = 'valid-token') {
  return new Request('http://localhost/api/roulette/spin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/roulette/spin', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn((table: keyof typeof tables) => tables[table]),
      rpc,
    } as never);
    tables.player_sessions.maybeSingleResult = { data: { player_id: 1 }, error: null };
    rpc.mockReset();
    vi.mocked(randomInt).mockClear();
  });

  it('spins, settles, and returns the committed result (SRS-302.2)', async () => {
    rpc.mockResolvedValue({
      data: {
        status: 'spun',
        spin_id: 9,
        winning_number: 17,
        staked: 60,
        returned: 1800,
        balance: 2740,
        bets: [
          { type: 'Number', number: 17, amount: 50, payout: 1800 },
          { type: 'Red', number: null, amount: 10, payout: 0 },
        ],
      },
      error: null,
    });

    const response = await POST(req({ bets: BETS }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      spinId: 9,
      number: 17,
      color: 'black',
      staked: 60,
      returned: 1800,
      balance: 2740,
      bets: [
        { type: 'Number', number: 17, amount: 50, payout: 1800 },
        { type: 'Red', number: null, amount: 10, payout: 0 },
      ],
    });
  });

  it('picks the number on the server with a secure random number (SRS-302.1, SRS-302.3)', async () => {
    rpc.mockResolvedValue({ data: { status: 'spun', winning_number: 17, bets: [] }, error: null });

    // A number sent by the client is ignored.
    await POST(req({ bets: BETS, number: 0, winning_number: 0 }));

    expect(randomInt).toHaveBeenCalledWith(37);
    expect(rpc).toHaveBeenCalledWith('fn_spin_roulette', {
      p_player_id: 1,
      p_bets: [
        { type: 'Number', number: 17, amount: 50 },
        { type: 'Red', number: undefined, amount: 10 },
      ],
      p_winning_number: 17,
    });
  });

  it('only passes each bet\'s type, number, and amount on to the database', async () => {
    rpc.mockResolvedValue({ data: { status: 'spun', winning_number: 17, bets: [] }, error: null });

    await POST(req({ bets: [{ type: 'Red', amount: 10, payout: 9999, player_id: 2 }] }));

    expect(rpc.mock.calls[0][1].p_bets).toEqual([{ type: 'Red', number: undefined, amount: 10 }]);
  });

  it('rejects guests without calling the database (SRS-301.10)', async () => {
    const response = await POST(req({ bets: BETS }, null));
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects an expired session', async () => {
    tables.player_sessions.maybeSingleResult = { data: null, error: null };
    const response = await POST(req({ bets: BETS }, 'stale-token'));
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects a request with no bets list (SRS-302.4)', async () => {
    expect((await POST(req({}))).status).toBe(400);
    expect((await POST(req('not json'))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid_bets', 400, 'One or more bets are not valid.'],
    ['over_limit', 400, 'The most you can bet on one spin is 500 coins.'], // SRS-301.6
    ['busy', 409, 'Your last spin is still being processed.'], // SRS-302.5
    ['not_active', 403, 'Accounts pending deletion cannot play roulette.'], // SRS-301.10
    ['not_found', 404, 'Player not found.'],
  ])('maps a %s reply to %i', async (status, code, error) => {
    rpc.mockResolvedValue({ data: { status }, error: null });

    const response = await POST(req({ bets: BETS }));

    expect(response.status).toBe(code);
    expect((await response.json()).error).toBe(error);
  });

  it('reports the current balance when the bets are more than it (SRS-109.3)', async () => {
    rpc.mockResolvedValue({ data: { status: 'insufficient_balance', balance: 20 }, error: null });

    const response = await POST(req({ bets: BETS }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "You don't have enough coins for these bets.", balance: 20 });
  });

  it('returns 500 and says no coins were taken when the transaction fails (SRS-302.6)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } });

    const response = await POST(req({ bets: BETS }));

    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe('The spin failed and no coins were taken. Please try again.');
  });

  it('returns 500 when Supabase credentials are not configured', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    const response = await POST(req({ bets: BETS }));
    expect(response.status).toBe(500);
  });
});
