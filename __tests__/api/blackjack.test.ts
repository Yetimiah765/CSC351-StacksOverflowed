import { beforeEach, describe, expect, it, vi } from 'vitest';

// See __tests__/api/auth.test.ts for the rationale behind this builder shape.
// Reads go through `.maybeSingle()`, resolving with the next queued entry in
// `reads`. A balance update is `.update().eq().eq().select()`, and that
// `.select()` resolves with the next entry in `updates` (default: the write
// succeeds with the new balance). `.insert()` records its rows in `inserted`
// and resolves with `insertResult`; a list read
// (`.select().eq().not().order().order().limit()`) resolves with `listResult`.
function makeTableMock() {
  const builder: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    not: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    inserted: unknown[];
    insertResult: { error: unknown };
    listResult: { data: unknown; error: unknown };
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
    insert: vi.fn((rows: unknown[]) => {
      builder.inserted.push(...rows);
      return Promise.resolve(builder.insertResult);
    }),
    not: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve(builder.listResult)),
    inserted: [],
    insertResult: { error: null },
    listResult: { data: [], error: null },
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
  blackjack_hands: makeTableMock(),
};

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}));

import { getSupabaseClient } from '../../lib/supabase';
import { GET } from '../../app/api/blackjack/route';
import { POST as deal } from '../../app/api/blackjack/deal/route';
import { POST as act } from '../../app/api/blackjack/action/route';
import { GET as history } from '../../app/api/blackjack/history/route';
import { clearHands, getHand, saveHand } from '../../app/api/blackjack/hands';

function resetTable(table: ReturnType<typeof makeTableMock>) {
  table.select.mockClear();
  table.eq.mockClear();
  table.update.mockClear();
  table.maybeSingle.mockClear();
  table.insert.mockClear();
  table.not.mockClear();
  table.order.mockClear();
  table.limit.mockClear();
  table.inserted = [];
  table.insertResult = { error: null };
  table.listResult = { data: [], error: null };
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

// A round already in play for player 1, with one hand of known cards.
function handInPlay(playerCards: string[], dealerCards: string[], deck: string[]) {
  saveHand(1, {
    handId: 4,
    bet: 50,
    state: {
      hands: [{ cards: playerCards, doubled: false, fromSplit: false, done: false }],
      active: 0,
      step: 0,
      dealerCards,
      deck,
    },
    startedAt: '2026-10-27T18:00:00.000Z',
  });
}

beforeEach(() => {
  vi.mocked(getSupabaseClient).mockReturnValue({
    from: vi.fn((table: keyof typeof tables) => tables[table]),
  } as never);
  resetTable(tables.player_sessions);
  resetTable(tables.players);
  resetTable(tables.blackjack_hands);
  clearHands();
});

describe('GET /api/blackjack', () => {
  it("returns the hand in play with the dealer's second card hidden", async () => {
    signedIn();
    handInPlay(['Ts', '7h'], ['Kd', '6c'], ['2s']);

    const response = await GET(req(''));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hand).toMatchObject({ handId: 4, bet: 50, step: 0, dealerCards: ['Kd', null], dealerTotal: 10 });
    expect(body.hand.hands).toEqual([expect.objectContaining({ cards: ['Ts', '7h'], total: 17 })]);
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
    expect(body.hand.hands[0].cards).toHaveLength(2);
    expect(body.hand.dealerCards).toHaveLength(2);

    const stored = getHand(1);
    if (!body.hand.finished) {
      expect(body.balance).toBe(950);
      expect(stored?.state.hands[0]!.cards).toEqual(body.hand.hands[0].cards);
      expect(body.hand.dealerCards[1]).toBeNull();
      const all = [...stored!.state.hands[0]!.cards, ...stored!.state.dealerCards, ...stored!.state.deck];
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

  it.each([0, -10, 5, 12.5, '50', null, 111, 15])('rejects a bet of %s', async (bet) => {
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
  const move = (m: string, step = 0) => act(req('/action', { handId: 4, move: m, step }));

  it('Hit draws the next card and keeps the round in play, without touching the balance', async () => {
    signedIn();
    handInPlay(['Ts', '2h'], ['Kd', '6c'], ['5s', '9d']);

    const response = await move('hit');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hand).toMatchObject({ step: 1, active: 0, finished: false, dealerCards: ['Kd', null] });
    expect(body.hand.hands[0]).toMatchObject({ cards: ['Ts', '2h', '5s'], total: 17, result: null });
    expect(body.balance).toBeUndefined();
    expect(getHand(1)?.state.deck).toEqual(['9d']);
    expect(tables.players.update).not.toHaveBeenCalled();
  });

  it('Stand plays the dealer, pays a win, and ends the round', async () => {
    signedIn();
    handInPlay(['Ts', '9h'], ['Kd', '6c'], ['2s', '9d']);
    hasBalance(950);

    const body = await (await move('stand')).json();

    expect(body.hand).toMatchObject({ dealerCards: ['Kd', '6c', '2s'], dealerTotal: 18, finished: true, net: 50 });
    expect(body.hand.hands[0]).toMatchObject({ result: 'Win', net: 50 });
    // The bet back plus the winnings.
    expect(tables.players.update).toHaveBeenCalledWith({ balance: 1050 });
    expect(body.balance).toBe(1050);
    expect(getHand(1)).toBeUndefined();
  });

  it('a Bust ends the round and pays nothing', async () => {
    signedIn();
    handInPlay(['Ts', '7h'], ['Kd', '6c'], ['8s']);

    const body = await (await move('hit')).json();

    expect(body.hand.hands[0]).toMatchObject({ result: 'Bust', net: -50 });
    expect(body.hand.dealerCards).toEqual(['Kd', '6c']);
    expect(tables.players.update).not.toHaveBeenCalled();
    expect(getHand(1)).toBeUndefined();
  });

  it('a Push gives the bet back', async () => {
    signedIn();
    handInPlay(['Ts', '8h'], ['Kd', '8c'], []);
    hasBalance(950);

    await move('stand');

    expect(tables.players.update).toHaveBeenCalledWith({ balance: 1000 });
  });

  it('Double takes a second bet, deals one card, and pays the win on twice the bet (SRS-910)', async () => {
    signedIn();
    handInPlay(['5s', '6h'], ['Kd', '6c'], ['9d', '2c']);
    hasBalance(950);
    hasBalance(900);

    const response = await move('double');
    const body = await response.json();

    expect(response.status).toBe(200);
    // The second bet, then the doubled bet back plus winnings of 100.
    expect(tables.players.update).toHaveBeenNthCalledWith(1, { balance: 900 });
    expect(tables.players.update).toHaveBeenNthCalledWith(2, { balance: 1100 });
    expect(body.hand).toMatchObject({ totalBet: 100, net: 100 });
    expect(body.hand.hands[0]).toMatchObject({ bet: 100, doubled: true, cards: ['5s', '6h', '9d'], result: 'Win' });
    expect(body.balance).toBe(1100);
  });

  it('a doubled bust takes both bets and pays nothing', async () => {
    signedIn();
    handInPlay(['Ts', '6h'], ['Kd', '6c'], ['9d']);
    hasBalance(950);

    const body = await (await move('double')).json();

    expect(tables.players.update).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({ balance: 900, hand: { totalBet: 100, net: -100 } });
  });

  it('refuses Double without enough coins, taking nothing and keeping the round (SRS-910.1)', async () => {
    signedIn();
    handInPlay(['5s', '6h'], ['Kd', '6c'], ['9d']);
    hasBalance(30);

    const response = await move('double');

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/to double/);
    expect(tables.players.update).not.toHaveBeenCalled();
    expect(getHand(1)?.state.hands[0]!.cards).toEqual(['5s', '6h']);
  });

  it('refuses Double after the first two cards', async () => {
    signedIn();
    handInPlay(['2s', '3h', '4d'], ['Kd', '6c'], ['9d']);

    expect((await move('double')).status).toBe(409);
    expect(tables.players.update).not.toHaveBeenCalled();
  });

  it('Split takes a second bet and makes two hands, playing the first (SRS-911.2, 911.3)', async () => {
    signedIn();
    handInPlay(['8s', '8h'], ['9d', '7c'], ['3c', '2d', 'Td', 'Kc', '4s']);
    hasBalance(950);

    const response = await move('split');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(tables.players.update).toHaveBeenCalledWith({ balance: 900 });
    expect(body.balance).toBe(900);
    expect(body.hand).toMatchObject({ totalBet: 100, active: 0, step: 1, canSplit: false, finished: false });
    expect(body.hand.hands.map((h: { cards: string[] }) => h.cards)).toEqual([
      ['8s', '3c'],
      ['8h', '2d'],
    ]);
  });

  it('plays both split hands, then settles each on its own bet in one payout (SRS-911.6)', async () => {
    signedIn();
    handInPlay(['8s', '8h'], ['9d', '7c'], ['3c', '2d', 'Td', 'Kc', '4s']);
    hasBalance(950);
    await move('split');
    // Hand 1 hits to 21, which finishes it; hand 2 doubles to 20. Each
    // request looks up the session again.
    signedIn();
    await move('hit', 1);
    signedIn();
    hasBalance(900);
    hasBalance(850);

    const body = await (await move('double', 2)).json();

    // Hand 1 wins 50 on 50, hand 2 pushes its 100: 50 + 50 + 100 back.
    expect(tables.players.update).toHaveBeenLastCalledWith({ balance: 1050 });
    expect(body.hand).toMatchObject({ totalBet: 150, net: 50, finished: true });
    expect(body.hand.hands.map((h: { result: string }) => h.result)).toEqual(['Win', 'Push']);
    expect(getHand(1)).toBeUndefined();
  });

  it('refuses Split on cards that are not a pair', async () => {
    signedIn();
    handInPlay(['Ks', 'Qh'], ['9d', '7c'], ['3c']);

    const response = await move('split');

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/pair/);
    expect(tables.players.update).not.toHaveBeenCalled();
  });

  it('refuses Split without enough coins, taking nothing (SRS-911.1)', async () => {
    signedIn();
    handInPlay(['8s', '8h'], ['9d', '7c'], ['3c']);
    hasBalance(20);

    const response = await move('split');

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/to split/);
    expect(getHand(1)?.state.hands).toHaveLength(1);
  });

  it('refuses a move from a stale click instead of playing it twice', async () => {
    signedIn();
    handInPlay(['Ts', '2h'], ['Kd', '6c'], ['5s', '9d']);
    await move('hit');
    signedIn();

    // The second click still carries the old step.
    const response = await move('hit', 0);

    expect(response.status).toBe(409);
    expect(getHand(1)?.state.hands[0]!.cards).toEqual(['Ts', '2h', '5s']);
  });

  it('returns 404 when there is no hand in play', async () => {
    signedIn();

    expect((await move('hit')).status).toBe(404);
  });

  it.each([
    { handId: 4, move: 'surrender', step: 0 },
    { handId: '4', move: 'hit', step: 0 },
    { handId: 4, move: 'hit' },
  ])('rejects %j', async (body) => {
    signedIn();
    handInPlay(['Ts', '2h'], ['Kd', '6c'], ['5s']);

    expect((await act(req('/action', body))).status).toBe(400);
    expect(getHand(1)?.state.hands[0]!.cards).toEqual(['Ts', '2h']);
  });
});

describe('Hand history (SRS-909.1)', () => {
  const move = (m: string, step = 0) => act(req('/action', { handId: 4, move: m, step }));

  it('saves a finished hand with its bet, result, and coins won', async () => {
    signedIn();
    handInPlay(['Ts', '9h'], ['Kd', '6c'], ['2s']);
    hasBalance(950);

    await move('stand');

    expect(tables.blackjack_hands.inserted).toEqual([
      {
        player_id: 1,
        bet_amount: 50,
        result: 'Win',
        net_amount: 50,
        started_at: '2026-10-27T18:00:00.000Z',
        completed_at: expect.any(String),
      },
    ]);
  });

  it('saves a lost or busted hand as minus its bet, as the table requires', async () => {
    signedIn();
    handInPlay(['Ts', '7h'], ['Kd', '6c'], ['8s']);

    await move('hit');

    expect(tables.blackjack_hands.inserted).toEqual([
      expect.objectContaining({ bet_amount: 50, result: 'Bust', net_amount: -50 }),
    ]);
  });

  it('saves a doubled hand on its doubled bet', async () => {
    signedIn();
    handInPlay(['5s', '6h'], ['Kd', '7c'], ['4d']);
    hasBalance(950);

    await move('double');

    expect(tables.blackjack_hands.inserted).toEqual([
      expect.objectContaining({ bet_amount: 100, result: 'Lose', net_amount: -100 }),
    ]);
  });

  it('saves the two hands of a split round as two rows, each on its own bet', async () => {
    signedIn();
    handInPlay(['8s', '8h'], ['9d', '7c'], ['3c', '2d', 'Td', 'Kc', '4s']);
    hasBalance(950);
    await move('split');
    signedIn();
    await move('hit', 1);
    signedIn();
    hasBalance(900);
    hasBalance(850);
    await move('double', 2);

    expect(tables.blackjack_hands.inserted).toEqual([
      expect.objectContaining({ bet_amount: 50, result: 'Win', net_amount: 50 }),
      expect.objectContaining({ bet_amount: 100, result: 'Push', net_amount: 0 }),
    ]);
  });

  it('saves nothing while the round is still in play', async () => {
    signedIn();
    handInPlay(['Ts', '2h'], ['Kd', '6c'], ['5s']);

    await move('hit');

    expect(tables.blackjack_hands.insert).not.toHaveBeenCalled();
  });

  it('still pays out when the history cannot be saved', async () => {
    signedIn();
    handInPlay(['Ts', '9h'], ['Kd', '6c'], ['2s']);
    hasBalance(950);
    tables.blackjack_hands.insertResult = { error: { message: 'boom' } };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await move('stand');

    expect(response.status).toBe(200);
    expect(tables.players.update).toHaveBeenCalledWith({ balance: 1050 });
  });

  it("GET returns the player's own recent hands, newest first", async () => {
    signedIn();
    tables.blackjack_hands.listResult = {
      data: [
        { hand_id: 9, bet_amount: '100', result: 'Win', net_amount: '150', completed_at: '2026-10-27T18:05:00Z' },
        { hand_id: 8, bet_amount: 50, result: 'Bust', net_amount: -50, completed_at: '2026-10-27T18:01:00Z' },
      ],
      error: null,
    };

    const response = await history(req('/history'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      hands: [
        { handId: 9, bet: 100, result: 'Win', net: 150, completedAt: '2026-10-27T18:05:00Z' },
        { handId: 8, bet: 50, result: 'Bust', net: -50, completedAt: '2026-10-27T18:01:00Z' },
      ],
    });
    expect(tables.blackjack_hands.eq).toHaveBeenCalledWith('player_id', 1);
    expect(tables.blackjack_hands.order).toHaveBeenCalledWith('completed_at', { ascending: false });
    expect(tables.blackjack_hands.limit).toHaveBeenCalledWith(20);
  });

  it('GET returns 401 without a session', async () => {
    expect((await history(req('/history', undefined, null))).status).toBe(401);
  });

  it('GET returns 500 when the history cannot be read', async () => {
    signedIn();
    tables.blackjack_hands.listResult = { data: null, error: { message: 'boom' } };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect((await history(req('/history'))).status).toBe(500);
  });
});
