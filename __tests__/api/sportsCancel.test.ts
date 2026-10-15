import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashSessionToken } from '../../lib/auth';
import { CANCEL_CUTOFF_MS, canCancelWager, cancelDeadline } from '../../lib/sports/wagers';

// Same builder shape as __tests__/api/sportsWagers.test.ts.
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

// fn_cancel_wager's reply; each test sets it.
const rpc = vi.fn();

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: vi.fn(() => sessions), rpc })),
}));

import { DELETE } from '../../app/api/sports/wagers/[wagerId]/route';

function cancel(wagerId: string, token: string | null = 'good-token') {
  return DELETE(
    new Request(`http://localhost/api/sports/wagers/${wagerId}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
    { params: { wagerId } },
  );
}

describe('cancel cutoff', () => {
  const start = '2026-10-16T00:15:00Z';

  it('closes 1 hour before the game starts', () => {
    expect(CANCEL_CUTOFF_MS).toBe(60 * 60 * 1000);
    expect(cancelDeadline(start).toISOString()).toBe('2026-10-15T23:15:00.000Z');
  });

  it('allows cancelling before the deadline only', () => {
    expect(canCancelWager(start, new Date('2026-10-15T23:14:59Z'))).toBe(true);
    expect(canCancelWager(start, new Date('2026-10-15T23:15:00Z'))).toBe(false);
    expect(canCancelWager(start, new Date('2026-10-16T01:00:00Z'))).toBe(false);
  });
});

describe('DELETE /api/sports/wagers/[wagerId]', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('requires a logged-in player', async () => {
    expect((await cancel('3', null)).status).toBe(401);
    expect((await cancel('3', 'bad-token')).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric wager id without touching the database', async () => {
    expect((await cancel('abc')).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('cancels through fn_cancel_wager and returns the refund and new balance', async () => {
    rpc.mockResolvedValue({ data: { status: 'cancelled', wager_id: 3, refund: 500, balance: 1277 }, error: null });

    const response = await cancel('3');

    expect(rpc).toHaveBeenCalledWith('fn_cancel_wager', { p_player_id: 7, p_wager_id: 3 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ wagerId: 3, refund: 500, balance: 1277 });
  });

  it('refuses within 1 hour of the game', async () => {
    rpc.mockResolvedValue({ data: { status: 'too_late' }, error: null });

    const response = await cancel('3');

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Bets can only be cancelled until 1 hour before the game starts.' });
  });

  it('refuses a bet that was already settled or cancelled', async () => {
    rpc.mockResolvedValue({ data: { status: 'already_settled', result: 'Cancelled' }, error: null });
    expect((await cancel('3')).status).toBe(409);
  });

  it("treats another player's bet as not found", async () => {
    rpc.mockResolvedValue({ data: { status: 'wager_not_found' }, error: null });
    expect((await cancel('3')).status).toBe(404);
  });

  it('reports a database failure and says the bet is still active', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } });

    const response = await cancel('3');

    expect(response.status).toBe(500);
    expect((await response.json()).error).toMatch(/still active/);
  });
});
