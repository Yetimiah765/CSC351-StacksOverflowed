import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashSessionToken } from '../../lib/auth';

// Same session builder as __tests__/api/sportsWagers.test.ts.
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

const mocks = vi.hoisted(() => ({ fetchShowdowns: vi.fn(), rpc: vi.fn(), notify: vi.fn() }));

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: vi.fn(() => sessions), rpc: mocks.rpc })),
}));
vi.mock('../../lib/sports/showdown', () => ({ fetchShowdowns: mocks.fetchShowdowns }));
vi.mock('../../lib/sports/showdownRealtime', () => ({ notifyShowdownChanged: mocks.notify }));

import { GET, POST } from '../../app/api/sports/showdown/route';

const get = (token: string | null = null) =>
  GET(new Request('http://localhost/api/sports/showdown', { headers: token ? { Authorization: `Bearer ${token}` } : {} }));

const join = (body: unknown, token: string | null = 'good-token') =>
  POST(
    new Request('http://localhost/api/sports/showdown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }),
  );

const VALID = { showdownId: 3, teamId: 10, amount: 200 };

describe('GET /api/sports/showdown', () => {
  beforeEach(() => {
    mocks.fetchShowdowns.mockReset();
    mocks.fetchShowdowns.mockResolvedValue([{ id: 3, sport: 'Basketball' }]);
  });

  it('works for guests, without a player', async () => {
    const response = await get();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ showdowns: [{ id: 3, sport: 'Basketball' }] });
    expect(mocks.fetchShowdowns.mock.calls[0][1]).toBeNull();
  });

  it("passes a logged-in player's id so their entry is included", async () => {
    await get('good-token');
    expect(mocks.fetchShowdowns.mock.calls[0][1]).toBe(7);
  });

  it('returns 500 when loading fails', async () => {
    mocks.fetchShowdowns.mockRejectedValue(new Error('boom'));
    expect((await get()).status).toBe(500);
  });
});

describe('POST /api/sports/showdown', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.notify.mockReset();
    mocks.notify.mockResolvedValue(true);
  });

  it('requires a logged-in player', async () => {
    expect((await join(VALID, null)).status).toBe(401);
    expect((await join(VALID, 'bad-token')).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects a bad Showdown, team, or amount before touching the database', async () => {
    expect((await join({ ...VALID, showdownId: 'x' })).status).toBe(404);
    expect((await join({ ...VALID, teamId: undefined })).status).toBe(400);
    expect((await join({ ...VALID, amount: 20 })).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('joins through fn_join_showdown and returns the entry and new balance (SRS-212.1)', async () => {
    mocks.rpc.mockResolvedValue({
      data: { status: 'joined', team_id: 10, added: 200, entry_amount: 700, balance: 1300 },
      error: null,
    });

    const response = await join(VALID);

    expect(mocks.rpc).toHaveBeenCalledWith('fn_join_showdown', {
      p_player_id: 7,
      p_public_bet_id: 3,
      p_team_id: 10,
      p_amount: 200,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ teamId: 10, added: 200, entryAmount: 700, balance: 1300 });
    // Every open Showdown page gets a live "changed" ping.
    expect(mocks.notify).toHaveBeenCalledWith(expect.anything(), { showdownId: 3, reason: 'bet' });
  });

  it('still succeeds when the live ping cannot be sent', async () => {
    mocks.rpc.mockResolvedValue({ data: { status: 'joined', team_id: 10, added: 50, entry_amount: 50, balance: 950 }, error: null });
    mocks.notify.mockResolvedValue(false);

    expect((await join({ ...VALID, amount: 50 })).status).toBe(200);
  });

  it('refuses the other side once a player has picked one (SRS-212.2)', async () => {
    mocks.rpc.mockResolvedValue({ data: { status: 'other_side', team_id: 11 }, error: null });

    const response = await join(VALID);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "You've already backed the other team. You can only add to your side.",
      teamId: 11,
    });
  });

  it('refuses once the game has started (SRS-212.3), without a live ping', async () => {
    mocks.rpc.mockResolvedValue({ data: { status: 'closed' }, error: null });
    expect((await join(VALID)).status).toBe(409);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('refuses more than the balance', async () => {
    mocks.rpc.mockResolvedValue({ data: { status: 'insufficient_balance', balance: 40 }, error: null });

    const response = await join(VALID);

    expect(response.status).toBe(400);
    expect((await response.json()).balance).toBe(40);
  });

  it('reports a database failure without claiming coins were taken', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'timeout' } });

    const response = await join(VALID);

    expect(response.status).toBe(500);
    expect((await response.json()).error).toMatch(/coins were not taken/);
  });
});
