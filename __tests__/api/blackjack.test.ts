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

// blackjack_hands as a small in-memory table, so tests can check the rows
// themselves. It runs the query shapes the routes use: insert (optionally
// .select().single()), update / select with .eq() .is() .not() filters, and
// .order() .limit(). A kind in `fail` makes the next such query return an error.
type HandRow = {
  hand_id: number;
  player_id: number;
  bet_amount: number;
  result: string | null;
  net_amount: number | null;
  started_at: string;
  completed_at: string | null;
};
type HandsQuery = 'insert' | 'update' | 'select';

function makeHandsTable() {
  const table = {
    rows: [] as HandRow[],
    nextId: 100,
    fail: new Set<HandsQuery>(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    from() {
      let kind: HandsQuery = 'select';
      let values: Record<string, unknown> = {};
      let inserting: Record<string, unknown>[] = [];
      let single = false;
      const filters: ((row: HandRow) => boolean)[] = [];
      const sorts: [keyof HandRow, boolean][] = [];
      let max = Infinity;

      const run = () => {
        if (table.fail.delete(kind)) return { data: null, error: { message: 'boom' } };
        let result: HandRow[];
        if (kind === 'insert') {
          result = inserting.map(
            (row) =>
              ({ result: null, net_amount: null, completed_at: null, ...row, hand_id: table.nextId++ }) as HandRow
          );
          table.rows.push(...result);
        } else {
          result = table.rows.filter((row) => filters.every((keep) => keep(row)));
          if (kind === 'update') result.forEach((row) => Object.assign(row, values));
        }
        result = [...result].sort((a, b) => {
          for (const [column, ascending] of sorts) {
            if (a[column] !== b[column]) return (a[column]! < b[column]! ? -1 : 1) * (ascending ? 1 : -1);
          }
          return 0;
        });
        const data = result.slice(0, max).map((row) => ({ ...row }));
        return { data: single ? (data[0] ?? null) : data, error: null };
      };

      const query = {
        insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
          kind = 'insert';
          inserting = Array.isArray(rows) ? rows : [rows];
          return query;
        },
        update(next: Record<string, unknown>) {
          kind = 'update';
          values = next;
          return query;
        },
        select: () => query,
        single() {
          single = true;
          return query;
        },
        eq(column: keyof HandRow, value: unknown) {
          table.eq(column, value);
          filters.push((row) => row[column] === value);
          return query;
        },
        lte(column: keyof HandRow, value: string) {
          filters.push((row) => new Date(row[column] as string) <= new Date(value));
          return query;
        },
        is(column: keyof HandRow, value: null) {
          filters.push((row) => row[column] === value);
          return query;
        },
        not(column: keyof HandRow, _op: 'is', value: null) {
          filters.push((row) => row[column] !== value);
          return query;
        },
        order(column: keyof HandRow, options: { ascending: boolean }) {
          table.order(column, options);
          sorts.push([column, options.ascending]);
          return query;
        },
        limit(n: number) {
          table.limit(n);
          max = n;
          return query;
        },
        then<T>(resolve: (value: ReturnType<typeof run>) => T, reject?: (reason: unknown) => T) {
          return Promise.resolve().then(run).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return table;
}

const tables = {
  player_sessions: makeTableMock(),
  players: makeTableMock(),
};
const handsTable = makeHandsTable();

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

/** A blackjack_hands row; by default player 1's open row for a 50-coin round. */
function handRow(row: Partial<HandRow>): HandRow {
  return {
    hand_id: 4,
    player_id: 1,
    bet_amount: 50,
    result: null,
    net_amount: null,
    started_at: '2026-10-01T18:00:00.000Z',
    completed_at: null,
    ...row,
  };
}

// A round already in play for player 1, with one hand of known cards, and
// its open blackjack_hands row.
function handInPlay(playerCards: string[], dealerCards: string[], deck: string[]) {
  handsTable.rows.push(handRow({}));
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
    from: vi.fn((table: string) =>
      table === 'blackjack_hands' ? handsTable.from() : tables[table as keyof typeof tables]
    ),
  } as never);
  resetTable(tables.player_sessions);
  resetTable(tables.players);
  handsTable.rows = [];
  handsTable.nextId = 100;
  handsTable.fail.clear();
  handsTable.eq.mockClear();
  handsTable.order.mockClear();
  handsTable.limit.mockClear();
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

    expect(await (await GET(req(''))).json()).toEqual({ hand: null, refunded: 0 });
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

  it('waits 5 seconds after a hand ends before dealing the next, taking nothing', async () => {
    signedIn();
    handInPlay(['Ts', '7h'], ['Kd', '6c'], ['8s']);
    await act(req('/action', { handId: 4, move: 'hit', step: 0 }));
    signedIn();

    const response = await deal(req('/deal', { bet: 50 }));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toMatch(/Wait 5 seconds before the next hand/);
    expect(body.wait).toBeGreaterThan(4_000);
    expect(tables.players.update).not.toHaveBeenCalled();
    expect(handsTable.rows).toHaveLength(1);
  });

  it('deals again once the 5 seconds are up', async () => {
    signedIn();
    handInPlay(['Ts', '7h'], ['Kd', '6c'], ['8s']);
    await act(req('/action', { handId: 4, move: 'hit', step: 0 }));
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 5_001);
    signedIn();
    hasBalance(1000);
    hasBalance(950);

    try {
      expect((await deal(req('/deal', { bet: 50 }))).status).toBe(200);
    } finally {
      clock.mockRestore();
    }
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

  it('opens a row when a round is dealt, with no result yet, and uses its id as the hand id', async () => {
    signedIn();
    hasBalance(1000);
    hasBalance(950);

    const body = await (await deal(req('/deal', { bet: 50 }))).json();

    expect(body.hand.handId).toBe(100);
    expect(handsTable.rows[0]).toMatchObject({ hand_id: 100, player_id: 1, bet_amount: 50 });
    if (!body.hand.finished) expect(handsTable.rows[0]).toMatchObject({ result: null, completed_at: null });
  });

  it('gives the bet back when the round cannot be saved', async () => {
    signedIn();
    hasBalance(1000);
    hasBalance(950);
    handsTable.fail.add('insert');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await deal(req('/deal', { bet: 50 }));

    expect(response.status).toBe(500);
    expect(tables.players.update).toHaveBeenLastCalledWith({ balance: 1000 });
    expect(getHand(1)).toBeUndefined();
  });

  it('closes a finished hand with its bet, result, and coins won', async () => {
    signedIn();
    handInPlay(['Ts', '9h'], ['Kd', '6c'], ['2s']);
    hasBalance(950);

    await move('stand');

    expect(handsTable.rows).toEqual([
      handRow({ result: 'Win', net_amount: 50, completed_at: expect.any(String) }),
    ]);
  });

  it('saves a lost or busted hand as minus its bet, as the table requires', async () => {
    signedIn();
    handInPlay(['Ts', '7h'], ['Kd', '6c'], ['8s']);

    await move('hit');

    expect(handsTable.rows).toEqual([expect.objectContaining({ bet_amount: 50, result: 'Bust', net_amount: -50 })]);
  });

  it('saves a doubled hand on its doubled bet', async () => {
    signedIn();
    handInPlay(['5s', '6h'], ['Kd', '7c'], ['4d']);
    hasBalance(950);

    await move('double');

    expect(handsTable.rows).toEqual([expect.objectContaining({ bet_amount: 100, result: 'Lose', net_amount: -100 })]);
  });

  it('saves the two hands of a split round as two rows, each on its own bet', async () => {
    signedIn();
    handInPlay(['8s', '8h'], ['9d', '7c'], ['3c', '2d', 'Td', 'Kc', '4s']);
    hasBalance(950);
    await move('split');
    // While in play, the open row holds both bets.
    expect(handsTable.rows[0]).toMatchObject({ bet_amount: 100, completed_at: null });
    signedIn();
    await move('hit', 1);
    signedIn();
    hasBalance(900);
    hasBalance(850);
    await move('double', 2);

    expect(handsTable.rows).toEqual([
      expect.objectContaining({ hand_id: 4, bet_amount: 50, result: 'Win', net_amount: 50 }),
      expect.objectContaining({ player_id: 1, bet_amount: 100, result: 'Push', net_amount: 0 }),
    ]);
  });

  it('leaves the row open while the round is still in play', async () => {
    signedIn();
    handInPlay(['Ts', '2h'], ['Kd', '6c'], ['5s']);

    await move('hit');

    expect(handsTable.rows).toEqual([handRow({})]);
  });

  it('pays nothing when the finished round cannot be saved: its bet is returned instead', async () => {
    signedIn();
    handInPlay(['Ts', '9h'], ['Kd', '6c'], ['2s']);
    handsTable.fail.add('update');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await move('stand');

    expect(response.status).toBe(500);
    expect(tables.players.update).not.toHaveBeenCalled();
    // Still open, so the next load returns the bet.
    expect(handsTable.rows[0]).toMatchObject({ completed_at: null });
    signedIn();
    hasBalance(950);
    expect(await (await GET(req(''))).json()).toEqual({ hand: null, refunded: 50 });
    expect(tables.players.update).toHaveBeenCalledWith({ balance: 1000 });
  });

  it("GET returns the player's own finished hands, newest first", async () => {
    signedIn();
    handsTable.rows.push(
      handRow({ hand_id: 8, result: 'Bust', net_amount: -50, completed_at: '2026-10-27T18:01:00Z' }),
      handRow({ hand_id: 9, bet_amount: 100, result: 'Win', net_amount: 150, completed_at: '2026-10-27T18:05:00Z' }),
      handRow({ hand_id: 10 }),
      handRow({ hand_id: 11, player_id: 2, result: 'Win', net_amount: 50, completed_at: '2026-10-27T18:09:00Z' })
    );

    const response = await history(req('/history'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      hands: [
        { handId: 9, bet: 100, result: 'Win', net: 150, completedAt: '2026-10-27T18:05:00Z' },
        { handId: 8, bet: 50, result: 'Bust', net: -50, completedAt: '2026-10-27T18:01:00Z' },
      ],
    });
    expect(handsTable.eq).toHaveBeenCalledWith('player_id', 1);
    expect(handsTable.order).toHaveBeenCalledWith('completed_at', { ascending: false });
    expect(handsTable.limit).toHaveBeenCalledWith(20);
  });

  it('GET returns 401 without a session', async () => {
    expect((await history(req('/history', undefined, null))).status).toBe(401);
  });

  it('GET returns 500 when the history cannot be read', async () => {
    signedIn();
    handsTable.fail.add('select');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect((await history(req('/history'))).status).toBe(500);
  });
});

describe('Returning the bets of lost hands', () => {
  it('returns the bet of a round the server forgot (e.g. a restart), saved as a Push', async () => {
    signedIn();
    // An open row, but no round in memory.
    handsTable.rows.push(handRow({ bet_amount: 100 }));
    hasBalance(900);

    const body = await (await GET(req(''))).json();

    expect(body).toEqual({ hand: null, refunded: 100 });
    expect(tables.players.update).toHaveBeenCalledWith({ balance: 1000 });
    expect(handsTable.rows[0]).toMatchObject({ result: 'Push', net_amount: 0, completed_at: expect.any(String) });
  });

  it('returns it only once', async () => {
    signedIn();
    handsTable.rows.push(handRow({}));
    hasBalance(950);
    await GET(req(''));
    signedIn();

    expect(await (await GET(req(''))).json()).toEqual({ hand: null, refunded: 0 });
    expect(tables.players.update).toHaveBeenCalledTimes(1);
  });

  it('leaves the round still in play alone', async () => {
    signedIn();
    handInPlay(['Ts', '7h'], ['Kd', '6c'], ['2s']);

    const body = await (await GET(req(''))).json();

    expect(body).toMatchObject({ hand: { handId: 4 }, refunded: 0 });
    expect(tables.players.update).not.toHaveBeenCalled();
    expect(handsTable.rows[0]).toMatchObject({ completed_at: null });
  });

  it('returns the lost bet when the player tries to move on a forgotten hand', async () => {
    signedIn();
    handsTable.rows.push(handRow({}));
    hasBalance(950);

    const response = await act(req('/action', { handId: 4, move: 'hit', step: 0 }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'You have no hand in play.', refunded: 50 });
    expect(tables.players.update).toHaveBeenCalledWith({ balance: 1000 });
  });

  it('returns a lost bet before dealing the next hand', async () => {
    signedIn();
    handsTable.rows.push(handRow({ hand_id: 3 }));
    hasBalance(950);
    hasBalance(1000);
    hasBalance(950);

    const response = await deal(req('/deal', { bet: 50 }));

    expect(response.status).toBe(200);
    expect(tables.players.update).toHaveBeenNthCalledWith(1, { balance: 1000 });
    expect(tables.players.update).toHaveBeenNthCalledWith(2, { balance: 950 });
    expect(handsTable.rows[0]).toMatchObject({ hand_id: 3, result: 'Push' });
  });

  it('GET leaves a round dealt in the last 30 seconds alone: it may still be being dealt', async () => {
    signedIn();
    handsTable.rows.push(handRow({ started_at: new Date(Date.now() - 5_000).toISOString() }));

    expect(await (await GET(req(''))).json()).toEqual({ hand: null, refunded: 0 });
    expect(handsTable.rows[0]).toMatchObject({ completed_at: null });
  });

  it("GET doesn't hold up a move played at the same time", async () => {
    signedIn();
    signedIn();
    handInPlay(['Ts', '2h'], ['Kd', '6c'], ['5s', '9d']);

    const [load, hit] = await Promise.all([GET(req('')), act(req('/action', { handId: 4, move: 'hit', step: 0 }))]);

    expect(load.status).toBe(200);
    expect(hit.status).toBe(200);
  });

  it("doesn't return another player's bets", async () => {
    signedIn();
    handsTable.rows.push(handRow({ player_id: 2 }));

    expect(await (await GET(req(''))).json()).toEqual({ hand: null, refunded: 0 });
    expect(tables.players.update).not.toHaveBeenCalled();
  });
});
