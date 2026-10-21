import { beforeEach, describe, expect, it, vi } from 'vitest';

// See __tests__/api/auth.test.ts for the rationale behind this builder shape:
// chain methods return the same object and `.maybeSingle()` resolves via its
// own configured result.
function makeTableMock() {
  const builder: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    maybeSingleResult: { data: unknown; error: unknown };
  } = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(builder.maybeSingleResult)),
    maybeSingleResult: { data: null, error: null },
  };
  return builder;
}

const tables = {
  player_sessions: makeTableMock(),
  daily_login_box_claims: makeTableMock(),
};

// The database function's reply; each test sets it.
const rpc = vi.fn();

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    from: vi.fn((table: keyof typeof tables) => tables[table]),
    rpc,
  })),
}));

// A fixed roll of 55 picks the 500-coin reward (rolls 40-69).
vi.mock('crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('crypto')>()),
  randomInt: vi.fn(() => 55),
}));

import { getSupabaseClient } from '../../lib/supabase';
import { GET, POST } from '../../app/api/daily-login-box/route';

const HOUR = 60 * 60 * 1000;

function resetTable(table: ReturnType<typeof makeTableMock>) {
  table.select.mockClear();
  table.eq.mockClear();
  table.order.mockClear();
  table.limit.mockClear();
  table.maybeSingle.mockClear();
  table.maybeSingleResult = { data: null, error: null };
}

function req(method: 'GET' | 'POST', token: string | null = 'valid-token') {
  return new Request('http://localhost/api/daily-login-box', {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe('Daily Login Box API route', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn((table: keyof typeof tables) => tables[table]),
      rpc,
    } as never);
    resetTable(tables.player_sessions);
    resetTable(tables.daily_login_box_claims);
    rpc.mockReset();
    tables.player_sessions.maybeSingleResult = { data: { player_id: 1 }, error: null };
  });

  describe('GET (box status)', () => {
    it('returns 401 without a token (SRS-128.20)', async () => {
      const response = await GET(req('GET', null));
      expect(response.status).toBe(401);
    });

    it('returns 401 for a session that no longer exists', async () => {
      tables.player_sessions.maybeSingleResult = { data: null, error: null };
      const response = await GET(req('GET', 'stale-token'));
      expect(response.status).toBe(401);
    });

    it('is available to a player who has never opened one (SRS-110.2/128.3)', async () => {
      const response = await GET(req('GET'));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ available: true, nextAvailableAt: null, msRemaining: 0 });
      expect(tables.daily_login_box_claims.eq).toHaveBeenCalledWith('player_id', 1);
    });

    it('reports the remaining cooldown from the saved time (SRS-128.13/128.18)', async () => {
      const nextAvailableAt = new Date(Date.now() + 2 * HOUR).toISOString();
      tables.daily_login_box_claims.maybeSingleResult = { data: { next_available_at: nextAvailableAt }, error: null };

      const body = await (await GET(req('GET'))).json();

      expect(body.available).toBe(false);
      expect(body.nextAvailableAt).toBe(nextAvailableAt);
      expect(body.msRemaining).toBeGreaterThan(2 * HOUR - 5000);
      expect(body.msRemaining).toBeLessThanOrEqual(2 * HOUR);
    });

    it('is available again once the cooldown has passed (SRS-128.14)', async () => {
      const past = new Date(Date.now() - 60_000).toISOString();
      tables.daily_login_box_claims.maybeSingleResult = { data: { next_available_at: past }, error: null };

      const body = await (await GET(req('GET'))).json();

      expect(body).toEqual({ available: true, nextAvailableAt: null, msRemaining: 0 });
    });

    it('returns a 500 when Supabase credentials are not configured', async () => {
      vi.mocked(getSupabaseClient).mockReturnValueOnce(null as never);
      const response = await GET(req('GET'));
      expect(response.status).toBe(500);
    });
  });

  describe('POST (open the box)', () => {
    it('returns 401 without a token and does not open anything (SRS-128.20)', async () => {
      const response = await POST(req('POST', null));

      expect(response.status).toBe(401);
      expect(rpc).not.toHaveBeenCalled();
    });

    it('opens the box with a randomly picked reward (SRS-128.4/128.8)', async () => {
      const nextAvailableAt = new Date(Date.now() + 24 * HOUR).toISOString();
      rpc.mockResolvedValue({
        data: { status: 'opened', reward: 500, balance: 1500, next_available_at: nextAvailableAt },
        error: null,
      });

      const response = await POST(req('POST'));
      const body = await response.json();

      expect(rpc).toHaveBeenCalledWith('fn_open_daily_login_box', { p_player_id: 1, p_reward: 500 });
      expect(response.status).toBe(200);
      expect(body.reward).toBe(500);
      expect(body.balance).toBe(1500);
      expect(body.nextAvailableAt).toBe(nextAvailableAt);
      expect(body.msRemaining).toBeGreaterThan(24 * HOUR - 5000);
    });

    it('rejects a second opening during the cooldown (SRS-128.12/128.19)', async () => {
      const nextAvailableAt = new Date(Date.now() + 3 * HOUR).toISOString();
      rpc.mockResolvedValue({ data: { status: 'cooldown', next_available_at: nextAvailableAt }, error: null });

      const response = await POST(req('POST'));
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.nextAvailableAt).toBe(nextAvailableAt);
      expect(body.msRemaining).toBeGreaterThan(0);
    });

    it('rejects an account pending deletion (SRS-128.20)', async () => {
      rpc.mockResolvedValue({ data: { status: 'not_active' }, error: null });

      const response = await POST(req('POST'));

      expect(response.status).toBe(403);
    });

    it('reports a failed opening so the player can try again (SRS-128.21)', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      rpc.mockResolvedValue({ data: null, error: { message: 'connection lost' } });

      const response = await POST(req('POST'));

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Could not open the Daily Login Box. Please try again.' });
      consoleError.mockRestore();
    });

    it('returns a 500 when Supabase credentials are not configured', async () => {
      vi.mocked(getSupabaseClient).mockReturnValueOnce(null as never);
      const response = await POST(req('POST'));
      expect(response.status).toBe(500);
    });
  });
});
