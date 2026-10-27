import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// See __tests__/api/auth.test.ts for the rationale behind this builder shape.
// Only player_sessions is read (by getPlayerIdForToken).
const sessions: {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  maybeSingleResult: { data: unknown; error: unknown };
} = {
  select: vi.fn(() => sessions),
  eq: vi.fn(() => sessions),
  maybeSingle: vi.fn(() => Promise.resolve(sessions.maybeSingleResult)),
  maybeSingleResult: { data: null, error: null },
};

// What POST /api/poker/action broadcast, by channel name.
const httpSend = vi.fn();
const channel = vi.fn((name: string) => ({
  httpSend: (event: string, payload: unknown) => httpSend(name, event, payload),
}));
const removeChannel = vi.fn(() => Promise.resolve('ok'));

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}));

import { getSupabaseClient } from '../../lib/supabase';
import { POST as postAction } from '../../app/api/poker/action/route';
import { POST as postHoleCards } from '../../app/api/poker/hole-cards/route';
import { RELAY_MAX_AGE_MS, sealHoleCards, verifyRelayedAction } from '../../lib/pokerSecure';

const SECRET = 'route-test-secret';

function req(path: string, body: unknown, token: string | null = 'valid-token') {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.POKER_SERVER_SECRET = SECRET;
  vi.mocked(getSupabaseClient).mockReturnValue({
    from: vi.fn(() => sessions),
    channel,
    removeChannel,
  } as never);
  sessions.maybeSingleResult = { data: { player_id: 7 }, error: null };
  httpSend.mockReset();
  httpSend.mockResolvedValue({ success: true });
  channel.mockClear();
  removeChannel.mockClear();
});

afterEach(() => {
  delete process.env.POKER_SERVER_SECRET;
});

describe('POST /api/poker/action', () => {
  const join = { tableId: 'low-1', requestId: 'req-1', action: 'join', buyIn: 250, seatNumber: 3 };

  it('broadcasts the action signed with the player_id from the session token, without the token', async () => {
    const response = await postAction(req('/api/poker/action', join));

    expect(response.status).toBe(202);
    expect(httpSend).toHaveBeenCalledTimes(1);
    const [channelName, event, payload] = httpSend.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(channelName).toBe('poker:table-low-1');
    expect(event).toBe('action');
    expect(JSON.stringify(payload)).not.toContain('valid-token');
    expect(verifyRelayedAction(payload, SECRET, 'low-1', Date.now())).toMatchObject({
      tableId: 'low-1',
      requestId: 'req-1',
      playerId: 7,
      action: 'join',
      buyIn: 250,
      seatNumber: 3,
    });
    expect(removeChannel).toHaveBeenCalled();
  });

  it('ignores any player id the client sends', async () => {
    await postAction(req('/api/poker/action', { ...join, playerId: 99 }));

    const payload = httpSend.mock.calls[0]?.[2];
    expect(verifyRelayedAction(payload, SECRET, 'low-1', Date.now())?.playerId).toBe(7);
  });

  it('signs a fresh nonce for every request', async () => {
    await postAction(req('/api/poker/action', join));
    await postAction(req('/api/poker/action', join));

    const [first, second] = httpSend.mock.calls.map((call) => (call[2] as { nonce: string }).nonce);
    expect(first).not.toBe(second);
  });

  it('carries the move and amount of a betting action', async () => {
    await postAction(req('/api/poker/action', { tableId: 'mid-2', requestId: 'r', action: 'act', move: 'raise', amount: 60 }));

    const payload = httpSend.mock.calls[0]?.[2];
    expect(verifyRelayedAction(payload, SECRET, 'mid-2', Date.now())).toMatchObject({ move: 'raise', amount: 60 });
  });

  it("carries a busted player's buy-back amount (SRS-12.4)", async () => {
    await postAction(req('/api/poker/action', { tableId: 'low-1', requestId: 'r', action: 'rebuy', buyIn: 500 }));

    const payload = httpSend.mock.calls[0]?.[2];
    expect(verifyRelayedAction(payload, SECRET, 'low-1', Date.now())).toMatchObject({ action: 'rebuy', buyIn: 500 });
  });

  it('relays the choice to post missed blinds or wait for the big blind (SRS-11.6)', async () => {
    await postAction(req('/api/poker/action', { tableId: 'low-1', requestId: 'a', action: 'post-blinds' }));
    await postAction(req('/api/poker/action', { tableId: 'low-1', requestId: 'b', action: 'wait-for-big-blind' }));

    const actions = httpSend.mock.calls.map((call) => verifyRelayedAction(call[2], SECRET, 'low-1', Date.now())?.action);
    expect(actions).toEqual(['post-blinds', 'wait-for-big-blind']);
  });

  it('returns 401 without a token or with an expired session, broadcasting nothing', async () => {
    expect((await postAction(req('/api/poker/action', join, null))).status).toBe(401);

    sessions.maybeSingleResult = { data: null, error: null };
    expect((await postAction(req('/api/poker/action', join))).status).toBe(401);

    expect(httpSend).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown table', { ...join, tableId: 'nope' }],
    ['an unknown action', { ...join, action: 'sync' }],
    ['a missing request id', { ...join, requestId: '' }],
    ['a non-numeric buy-in', { ...join, buyIn: '250' }],
    ['an act without a valid move', { tableId: 'low-1', requestId: 'r', action: 'act', move: 'shove' }],
  ])('returns 400 for %s', async (_label, body) => {
    expect((await postAction(req('/api/poker/action', body))).status).toBe(400);
    expect(httpSend).not.toHaveBeenCalled();
  });

  it('returns 500 when POKER_SERVER_SECRET is missing', async () => {
    delete process.env.POKER_SERVER_SECRET;

    expect((await postAction(req('/api/poker/action', join))).status).toBe(500);
  });

  it('returns 502 when the broadcast fails', async () => {
    httpSend.mockRejectedValue(new Error('down'));

    expect((await postAction(req('/api/poker/action', join))).status).toBe(502);
    expect(removeChannel).toHaveBeenCalled();
  });

  it('signs actions that expire after RELAY_MAX_AGE_MS', async () => {
    await postAction(req('/api/poker/action', join));

    const payload = httpSend.mock.calls[0]?.[2];
    expect(verifyRelayedAction(payload, SECRET, 'low-1', Date.now() + RELAY_MAX_AGE_MS + 1_000)).toBeNull();
  });
});

describe('POST /api/poker/hole-cards (SRS-6.1)', () => {
  it("opens the caller's own sealed cards", async () => {
    const sealed = sealHoleCards(SECRET, 'low-1', 4, '7', ['As', 'Kd']);

    const response = await postHoleCards(req('/api/poker/hole-cards', { tableId: 'low-1', handNumber: 4, sealed }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ cards: ['As', 'Kd'] });
  });

  it("refuses to open another player's cards", async () => {
    const sealed = sealHoleCards(SECRET, 'low-1', 4, '8', ['Qh', 'Qc']);

    const response = await postHoleCards(req('/api/poker/hole-cards', { tableId: 'low-1', handNumber: 4, sealed }));

    expect(response.status).toBe(403);
    expect(JSON.stringify(await response.json())).not.toContain('Qh');
  });

  it('refuses cards from another hand', async () => {
    const sealed = sealHoleCards(SECRET, 'low-1', 4, '7', ['As', 'Kd']);

    const response = await postHoleCards(req('/api/poker/hole-cards', { tableId: 'low-1', handNumber: 5, sealed }));

    expect(response.status).toBe(403);
  });

  it('returns 401 without a valid session', async () => {
    const sealed = sealHoleCards(SECRET, 'low-1', 4, '7', ['As', 'Kd']);

    expect((await postHoleCards(req('/api/poker/hole-cards', { tableId: 'low-1', handNumber: 4, sealed }, null))).status).toBe(401);
  });

  it('returns 400 for a malformed body', async () => {
    expect((await postHoleCards(req('/api/poker/hole-cards', { tableId: 'low-1' }))).status).toBe(400);
  });
});
