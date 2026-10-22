import { beforeEach, describe, expect, it, vi } from 'vitest';

// See __tests__/api/auth.test.ts for the rationale behind this builder shape.
// Reads go through `.maybeSingle()`, resolving with the next queued entry in
// `reads`. A balance update is `.update().eq().eq().select()`, and that
// `.select()` resolves with the next entry in `updates` (default: the write
// succeeds with the new balance).
function makeTableMock() {
  const builder: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    reads: { data: unknown; error: unknown }[];
    updates: { data: unknown; error: unknown }[];
    pendingUpdate: { balance: number } | null;
  } = {
    select: vi.fn(),
    eq: vi.fn(() => builder),
    update: vi.fn((values: { balance: number }) => {
      builder.pendingUpdate = values;
      return builder;
    }),
    maybeSingle: vi.fn(() => Promise.resolve(builder.reads.shift() ?? { data: null, error: null })),
    reads: [],
    updates: [],
    pendingUpdate: null,
  };
  builder.select.mockImplementation(() => {
    if (!builder.pendingUpdate) return builder;
    const written = builder.pendingUpdate;
    builder.pendingUpdate = null;
    return Promise.resolve(builder.updates.shift() ?? { data: [written], error: null });
  });
  return builder;
}

const tables = {
  player_sessions: makeTableMock(),
  players: makeTableMock(),
};

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}));

import { getSupabaseClient } from '../../lib/supabase';
import { GET } from '../../app/api/blackjack/route';
import { POST as deal } from '../../app/api/blackjack/deal/route';
import { POST as act } from '../../app/api/blackjack/action/route';
import { clearHands, getHand, saveHand } from '../../app/api/blackjack/hands';

function resetTable(table: ReturnType<typeof makeTableMock>) {
  table.select.mockClear();
  table.eq.mockClear();
  table.update.mockClear();
  table.maybeSingle.mockClear();
  table.reads = [];
  table.updates = [];
  table.pendingUpdate = null;
}

function req(path: string, body?: unknown, token: string | null = 'valid-token') {
  return new Request(`http://localhost/api/blackjack${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function signedIn() {
  tables.player_sessions.reads.push({ data: { player_id: 1 }, error: null });
}

function hasBalance(balance: number, account_status = 'Active') {
  tables.players.reads.push({ data: { balance, account_status }, error: null });
}

// A hand already in play for player 1, with known cards.
function handInPlay(playerCards: string[], dealerCards: string[], deck: string[]) {
  saveHand(1, { handId: 4, bet: 50, state: { playerCards, dealerCards, deck } });
}

beforeEach(() => {
  vi.mocked(getSupabaseClient).mockReturnValue({
    from: vi.fn((table: keyof typeof tables) => tables[table]),
  } as never);
  resetTable(tables.player_sessions);
  resetTable(tables.players);
  clearHands();
});

describe('GET /api/blackjack', () => {
  it("returns the hand in play with the dealer's second card hidden", async () => {
    signedIn();
    handInPlay(['Ts', '7h'], ['Kd', '6c'], ['2s']);

    const response = await GET(req(''));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hand).toMatchObject({ handId: 4, bet: 50, playerTotal: 17, dealerCards: ['Kd', null], dealerTotal: 10 });
    expect(JSON.stringify(body)).not.toContain('6c');
    expect(JSON.stringify(body)).not.toContain('2s');
  });

  it('returns null when there is no hand in play', async () => {
    signedIn();

    expect(await (await GET(req(''))).json()).toEqual({ hand: null });
  });

  it('returns 401 without a session', async () => {
    expect((await GET(req('', undefined, null))).status).toBe(401);
  });
});

describe('POST /api/blackjack/deal', () => {
  it('takes the bet, deals from a full deck, and keeps the face-down card on the server', async () => {
    signedIn();
    hasBalance(1000);
    // A blackjack on the deal pays out at once; give that write a balance too.
    hasBalance(950);

    const response = await deal(req('/deal', { bet: 50 }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(tables.players.update).toHaveBeenNthCalledWith(1, { balance: 950 });
    // Only writes if the balance is still the one just read.
    expect(tables.players.eq).toHaveBeenCalledWith('balance', 1000);
    expect(body.hand.playerCards).toHaveLength(2);
    expect(body.hand.dealerCards).toHaveLength(2);

    const stored = getHand(1);
    if (body.hand.result === null) {
      expect(body.balance).toBe(950);
      expect(stored?.state.playerCards).toEqual(body.hand.playerCards);
      expect(body.hand.dealerCards[1]).toBeNull();
      const all = [...stored!.state.playerCards, ...stored!.state.dealerCards, ...stored!.state.deck];
      expect(new Set(all).size).toBe(52);
    } else {
      // Settled on the deal: nothing kept in memory.
      expect(stored).toBeUndefined();
    }
  });

  it('rejects a bet above the balance without taking anything (SRS-901.2)', async () => {
    signedIn();
    hasBalance(40);

    const response = await deal(req('/deal', { bet: 50 }));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/more than your balance/);
    expect(tables.players.update).not.toHaveBeenCalled();
    expect(getHand(1)).toBeUndefined();
  });

  it('retries when the balance changed between the read and the write', async () => {
    signedIn();
    hasBalance(1000);
    hasBalance(1200);
    hasBalance(1150);
    tables.players.updates.push({ data: [], error: null });

    const response = await deal(req('/deal', { bet: 50 }));

    expect(response.status).toBe(200);
    expect(tables.players.update).toHaveBeenNthCalledWith(2, { balance: 1150 });
  });

  it('refuses a second hand while one is in play', async () => {
    signedIn();
    handInPlay(['Ts', '7h'], ['Kd', '6c'], ['2s']);

    expect((await deal(req('/deal', { bet: 50 }))).status).toBe(409);
    expect(tables.players.update).not.toHaveBeenCalled();
  });

  it.each([0, -10, 5, 12.5, '50', null])('rejects a bet of %s', async (bet) => {
    signedIn();

    expect((await deal(req('/deal', { bet }))).status).toBe(400);
    expect(tables.players.update).not.toHaveBeenCalled();
  });

  it('rejects an account pending deletion', async () => {
    signedIn();
    hasBalance(1000, 'Pending Deletion');

    expect((await deal(req('/deal', { bet: 50 }))).status).toBe(403);
    expect(tables.players.update).not.toHaveBeenCalled();
  });

  it('returns 401 without a session', async () => {
    expect((await deal(req('/deal', { bet: 50 }, null))).status).toBe(401);
  });
});

describe('POST /api/blackjack/action', () => {
  it('Hit draws the next card and keeps the hand in play, without touching the balance', async () => {
    signedIn();
    handInPlay(['Ts', '2h'], ['Kd', '6c'], ['5s', '9d']);

    const response = await act(req('/action', { handId: 4, move: 'hit', cards: 2 }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      hand: expect.objectContaining({ playerCards: ['Ts', '2h', '5s'], playerTotal: 17, dealerCards: ['Kd', null], result: null }),
    });
    expect(getHand(1)?.state.deck).toEqual(['9d']);
    expect(tables.players.update).not.toHaveBeenCalled();
  });

  it('Stand plays the dealer, pays a win, and ends the hand', async () => {
    signedIn();
    handInPlay(['Ts', '9h'], ['Kd', '6c'], ['2s', '9d']);
    hasBalance(950);

    const response = await act(req('/action', { handId: 4, move: 'stand', cards: 2 }));
    const body = await response.json();

    expect(body.hand).toMatchObject({ dealerCards: ['Kd', '6c', '2s'], dealerTotal: 18, result: 'Win', net: 50 });
    // The bet back plus the winnings.
    expect(tables.players.update).toHaveBeenCalledWith({ balance: 1050 });
    expect(body.balance).toBe(1050);
    expect(getHand(1)).toBeUndefined();
  });

  it('a Bust ends the hand and pays nothing', async () => {
    signedIn();
    handInPlay(['Ts', '7h'], ['Kd', '6c'], ['8s']);

    const body = await (await act(req('/action', { handId: 4, move: 'hit', cards: 2 }))).json();

    expect(body.hand).toMatchObject({ result: 'Bust', net: -50, dealerCards: ['Kd', '6c'] });
    expect(tables.players.update).not.toHaveBeenCalled();
    expect(getHand(1)).toBeUndefined();
  });

  it('a Push gives the bet back', async () => {
    signedIn();
    handInPlay(['Ts', '8h'], ['Kd', '8c'], []);
    hasBalance(950);

    await act(req('/action', { handId: 4, move: 'stand', cards: 2 }));

    expect(tables.players.update).toHaveBeenCalledWith({ balance: 1000 });
  });

  it('Double takes a second bet, deals one card, and pays the win on twice the bet (SRS-910)', async () => {
    signedIn();
    handInPlay(['5s', '6h'], ['Kd', '6c'], ['9d', '2c']);
    hasBalance(950);
    hasBalance(900);

    const response = await act(req('/action', { handId: 4, move: 'double', cards: 2 }));
    const body = await response.json();

    expect(response.status).toBe(200);
    // The second bet, then the doubled bet back plus winnings of 100.
    expect(tables.players.update).toHaveBeenNthCalledWith(1, { balance: 900 });
    expect(tables.players.update).toHaveBeenNthCalledWith(2, { balance: 1100 });
    expect(body.hand).toMatchObject({ bet: 100, playerCards: ['5s', '6h', '9d'], result: 'Win', net: 100 });
    expect(body.balance).toBe(1100);
    expect(getHand(1)).toBeUndefined();
  });

  it('a doubled bust takes both bets and pays nothing', async () => {
    signedIn();
    handInPlay(['Ts', '6h'], ['Kd', '6c'], ['9d']);
    hasBalance(950);

    const body = await (await act(req('/action', { handId: 4, move: 'double', cards: 2 }))).json();

    expect(tables.players.update).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({ balance: 900, hand: { bet: 100, result: 'Bust', net: -100 } });
  });

  it('refuses Double without enough coins, taking nothing and keeping the hand (SRS-910.1)', async () => {
    signedIn();
    handInPlay(['5s', '6h'], ['Kd', '6c'], ['9d']);
    hasBalance(30);

    const response = await act(req('/action', { handId: 4, move: 'double', cards: 2 }));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/to double/);
    expect(tables.players.update).not.toHaveBeenCalled();
    expect(getHand(1)?.state.playerCards).toEqual(['5s', '6h']);
  });

  it('refuses Double after the first two cards', async () => {
    signedIn();
    handInPlay(['2s', '3h', '4d'], ['Kd', '6c'], ['9d']);

    const response = await act(req('/action', { handId: 4, move: 'double', cards: 3 }));

    expect(response.status).toBe(409);
    expect(tables.players.update).not.toHaveBeenCalled();
  });

  it('refuses a move from a stale click instead of playing it twice', async () => {
    signedIn();
    handInPlay(['Ts', '2h', '5s'], ['Kd', '6c'], ['9d']);

    const response = await act(req('/action', { handId: 4, move: 'hit', cards: 2 }));

    expect(response.status).toBe(409);
    expect(getHand(1)?.state.playerCards).toEqual(['Ts', '2h', '5s']);
  });

  it('returns 404 when there is no hand in play', async () => {
    signedIn();

    expect((await act(req('/action', { handId: 4, move: 'hit', cards: 2 }))).status).toBe(404);
  });

  it.each([
    { handId: 4, move: 'split', cards: 2 },
    { handId: '4', move: 'hit', cards: 2 },
    { handId: 4, move: 'hit' },
  ])('rejects %j', async (body) => {
    signedIn();
    handInPlay(['Ts', '2h'], ['Kd', '6c'], ['5s']);

    expect((await act(req('/action', body))).status).toBe(400);
    expect(getHand(1)?.state.playerCards).toEqual(['Ts', '2h']);
  });
});
