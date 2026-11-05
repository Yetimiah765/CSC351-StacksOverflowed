import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// See __tests__/api/auth.test.ts for the rationale behind this builder shape:
// chain methods return the same object and `.maybeSingle()` resolves via its
// own configured result.
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

const tables = {
  player_sessions: makeTableMock(),
  fountain_wishes: makeTableMock(),
};

// The database function's reply; each test sets it.
const rpc = vi.fn();

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    from: vi.fn((table: keyof typeof tables) => tables[table]),
    rpc,
  })),
}));

import { getSupabaseClient } from '../../lib/supabase';
import { GET, POST } from '../../app/api/wishing-fountain/route';

const NEXT_WISH_AT = '2026-11-05T05:00:00+00:00';
// 7:20 pm Eastern on 4 November: 5 h 40 min until the next wish.
const NOW = '2026-11-04T23:20:00Z';
const UNTIL_MIDNIGHT = (5 * 60 + 40) * 60 * 1000;

function req(token: string | null = 'valid-token', method: 'GET' | 'POST' = 'POST') {
  return new Request('http://localhost/api/wishing-fountain', {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe('Wishing fountain API route (UR-129)', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn((table: keyof typeof tables) => tables[table]),
      rpc,
    } as never);
    tables.player_sessions.maybeSingleResult = { data: { player_id: 1 }, error: null };
    tables.fountain_wishes.maybeSingleResult = { data: null, error: null };
    tables.fountain_wishes.eq.mockClear();
    rpc.mockReset();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("GET (whether today's wish has been made, SRS-129.2)", () => {
    it('returns 401 without a token', async () => {
      expect((await GET(req(null, 'GET'))).status).toBe(401);
    });

    it("lets a player who hasn't wished today wish now, looking only at today's Eastern date", async () => {
      const response = await GET(req('valid-token', 'GET'));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ wishedToday: false, nextWishAt: null, msRemaining: 0 });
      expect(tables.fountain_wishes.eq).toHaveBeenCalledWith('player_id', 1);
      expect(tables.fountain_wishes.eq).toHaveBeenCalledWith('wish_day', '2026-11-04');
    });

    it('says when the next wish is, at midnight Eastern, once today\'s has been made', async () => {
      tables.fountain_wishes.maybeSingleResult = { data: { wish_id: 7 }, error: null };

      const body = await (await GET(req('valid-token', 'GET'))).json();

      expect(body).toEqual({ wishedToday: true, nextWishAt: '2026-11-05T05:00:00.000Z', msRemaining: UNTIL_MIDNIGHT });
    });

    it('returns a 500 when the wishes cannot be read', async () => {
      tables.fountain_wishes.maybeSingleResult = { data: null, error: { message: 'timeout' } };
      expect((await GET(req('valid-token', 'GET'))).status).toBe(500);
    });
  });

  it('refuses a wish without a token, or with a session that no longer exists (SRS-129.1)', async () => {
    expect((await POST(req(null))).status).toBe(401);
    tables.player_sessions.maybeSingleResult = { data: null, error: null };
    expect((await POST(req('stale-token'))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("makes the logged-in player's wish for 1 coin in one database call (SRS-129.1)", async () => {
    rpc.mockResolvedValue({ data: { status: 'wished', reward: 0, balance: 999, next_wish_at: NEXT_WISH_AT }, error: null });

    const response = await POST(req());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reward: 0, balance: 999, nextWishAt: NEXT_WISH_AT, msRemaining: UNTIL_MIDNIGHT });
    expect(rpc).toHaveBeenCalledWith('fn_make_wish', { p_player_id: 1, p_reward: 0 });
  });

  it('tells a player with no coins they need 1 (SRS-129.1)', async () => {
    rpc.mockResolvedValue({ data: { status: 'insufficient_balance', balance: 0 }, error: null });

    const response = await POST(req());

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe('You need 1 coin to make a wish.');
  });

  it('refuses a second wish the same day, saying when the next one is (SRS-129.2), and one sent while the first is still being made', async () => {
    rpc.mockResolvedValue({ data: { status: 'already_wished', next_wish_at: NEXT_WISH_AT }, error: null });
    let response = await POST(req());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "You've already made today's wish.", nextWishAt: NEXT_WISH_AT, msRemaining: UNTIL_MIDNIGHT });

    rpc.mockResolvedValue({ data: { status: 'busy' }, error: null });
    response = await POST(req());
    expect(response.status).toBe(409);
  });

  it('refuses an account that is not active, or a player who no longer exists (SRS-129.1)', async () => {
    rpc.mockResolvedValue({ data: { status: 'not_active' }, error: null });
    expect((await POST(req())).status).toBe(403);
    rpc.mockResolvedValue({ data: { status: 'not_found' }, error: null });
    expect((await POST(req())).status).toBe(404);
  });

  it('returns a 500, with nothing saved, when the database call fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await POST(req());

    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe('Could not make your wish. Please try again.');
  });

  it('returns a 500 when Supabase credentials are not configured', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    expect((await POST(req())).status).toBe(500);
  });
});
