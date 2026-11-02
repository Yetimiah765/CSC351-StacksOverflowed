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
  getSupabaseClient: vi.fn(),
}));

// Every reel rolls 31 (Seven) in these tests.
vi.mock('crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('crypto')>()),
  randomInt: vi.fn(() => 31),
}));

import { randomInt } from 'crypto';
import { getSupabaseClient } from '../../lib/supabase';
import { POST } from '../../app/api/slots/spin/route';

function req(body: unknown, token: string | null = 'valid-token') {
  return new Request('http://localhost/api/slots/spin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const SPUN = {
  status: 'spun',
  spin_id: 7,
  reels: ['Seven', 'Seven', 'Seven'],
  bet: 5,
  multiplier: 200,
  payout: 1000,
  balance: 1995,
};

describe('POST /api/slots/spin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn((table: keyof typeof tables) => tables[table]),
      rpc,
    } as never);
    tables.player_sessions.maybeSingleResult = { data: { player_id: 1 }, error: null };
    rpc.mockResolvedValue({ data: SPUN, error: null });
  });

  it('spins once, as one database call, and returns the committed result (SRS-307.2)', async () => {
    const res = await POST(req({ bet: 5 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      spinId: 7,
      reels: ['Seven', 'Seven', 'Seven'],
      bet: 5,
      multiplier: 200,
      payout: 1000,
      balance: 1995,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('fn_spin_slots', { p_player_id: 1, p_bet: 5, p_rolls: [31, 31, 31] });
  });

  it('draws each reel separately with crypto.randomInt over the 32 rolls (SRS-307.1)', async () => {
    await POST(req({ bet: 5 }));
    expect(randomInt).toHaveBeenCalledTimes(3);
    expect(vi.mocked(randomInt).mock.calls).toEqual([[32], [32], [32]]);
  });

  it('ignores any reels or payout the client sends (SRS-307.3)', async () => {
    await POST(req({ bet: 5, reels: ['Seven', 'Seven', 'Seven'], rolls: [31, 31, 31], payout: 999999 }));
    expect(rpc).toHaveBeenCalledWith('fn_spin_slots', { p_player_id: 1, p_bet: 5, p_rolls: [31, 31, 31] });
  });

  it('spins for the player the token belongs to, not one named in the body', async () => {
    await POST(req({ bet: 5, playerId: 99 }));
    expect(rpc.mock.calls[0][1].p_player_id).toBe(1);
  });

  it('rejects a missing token without touching the database (SRS-306.5)', async () => {
    const res = await POST(req({ bet: 5 }, null));
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects an expired session', async () => {
    tables.player_sessions.maybeSingleResult = { data: null, error: null };
    const res = await POST(req({ bet: 5 }, 'old-token'));
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([[{}], [{ bet: '5' }], [{ bet: 5.5 }], ['not json']])('rejects a missing or malformed bet %j', async (body) => {
    const res = await POST(req(body));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects a bet that is not one of the allowed amounts (SRS-306.2)', async () => {
    rpc.mockResolvedValue({ data: { status: 'invalid_bet' }, error: null });
    const res = await POST(req({ bet: 7 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'That bet amount is not allowed.' });
  });

  it('rejects a bet over the balance and says what the balance is (SRS-306.3)', async () => {
    rpc.mockResolvedValue({ data: { status: 'insufficient_balance', balance: 20 }, error: null });
    const res = await POST(req({ bet: 25 }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "You don't have enough coins for that bet.", balance: 20 });
  });

  it('rejects a spin while the last one is still running (SRS-307.4)', async () => {
    rpc.mockResolvedValue({ data: { status: 'busy' }, error: null });
    const res = await POST(req({ bet: 5 }));
    expect(res.status).toBe(409);
  });

  it('rejects an account pending deletion (SRS-306.5)', async () => {
    rpc.mockResolvedValue({ data: { status: 'not_active' }, error: null });
    expect((await POST(req({ bet: 5 }))).status).toBe(403);
  });

  it('returns 404 for a player who no longer exists', async () => {
    rpc.mockResolvedValue({ data: { status: 'not_found' }, error: null });
    expect((await POST(req({ bet: 5 }))).status).toBe(404);
  });

  it('reports a failed transaction without inventing a result (SRS-307.5)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'connection lost' } });
    const res = await POST(req({ bet: 5 }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'The spin failed and no coins were taken. Please try again.' });
  });

  it('returns 500 when Supabase is not configured', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    expect((await POST(req({ bet: 5 }))).status).toBe(500);
  });
});
