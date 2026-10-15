import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashSessionToken } from '../../lib/auth';
import { MIN_WAGER, canWinCoins, checkWagerAmount } from '../../lib/sports/wagers';
import { splitBets, toMyBet, type WagerRow } from '../../lib/sports/myBets';

// Same builder shape as __tests__/api/dailyLoginBox.test.ts: chain methods
// return the builder and `.maybeSingle()` resolves to the configured result.
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

// The wagers query used by GET; `.limit()` ends the chain.
const wagers = {
  select: vi.fn(() => wagers),
  eq: vi.fn(() => wagers),
  order: vi.fn(() => wagers),
  limit: vi.fn(() => Promise.resolve(wagers.result)),
  result: { data: [] as unknown, error: null as { message: string } | null },
};

// fn_place_wager's reply; each test sets it.
const rpc = vi.fn();

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    from: vi.fn((table: string) => (table === 'wagers' ? wagers : sessions)),
    rpc,
  })),
}));

import { GET, POST } from '../../app/api/sports/wagers/route';

function placeBet(body: unknown, token: string | null = 'good-token') {
  return POST(
    new Request('http://localhost/api/sports/wagers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

const VALID = { optionId: 12, amount: 100, odds: 1.85 };

describe('checkWagerAmount', () => {
  it('accepts whole numbers at or above the minimum', () => {
    expect(checkWagerAmount('100')).toEqual({ ok: true, amount: 100 });
    expect(checkWagerAmount(MIN_WAGER)).toEqual({ ok: true, amount: MIN_WAGER });
    expect(checkWagerAmount(' 250 ')).toEqual({ ok: true, amount: 250 });
  });

  it('rejects zero, negative, decimal, and non-numeric amounts (SRS-206.3)', () => {
    for (const bad of ['0', '-5', '12.5', 'abc', '', null, undefined, 1.5]) {
      expect(checkWagerAmount(bad)).toEqual({ ok: false, error: 'Enter a whole number of coins greater than 0.' });
    }
  });

  it('rejects amounts under the minimum', () => {
    expect(checkWagerAmount(MIN_WAGER - 1)).toEqual({ ok: false, error: `The minimum bet is ${MIN_WAGER} coins.` });
  });
});

describe('canWinCoins', () => {
  it('is false when the payout rounds down to the stake', () => {
    expect(canWinCoins(50, 1.01)).toBe(false);
    expect(canWinCoins(50, 1.02)).toBe(true);
    expect(canWinCoins(100, 1.01)).toBe(true);
  });
});

describe('POST /api/sports/wagers', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('requires a logged-in player', async () => {
    expect((await placeBet(VALID, null)).status).toBe(401);
    expect((await placeBet(VALID, 'bad-token')).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects invalid amounts before touching the database', async () => {
    const response = await placeBet({ ...VALID, amount: 'abc' });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Enter a whole number of coins greater than 0.' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects a missing option or odds', async () => {
    expect((await placeBet({ ...VALID, optionId: undefined })).status).toBe(400);
    expect((await placeBet({ ...VALID, odds: 1 })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('places the wager through fn_place_wager and returns the new balance', async () => {
    rpc.mockResolvedValue({
      data: {
        status: 'placed',
        wager_id: 31,
        amount: 100,
        odds: 1.85,
        potential_payout: 185,
        placed_at: '2026-10-14T18:00:00Z',
        balance: 900,
      },
      error: null,
    });

    const response = await placeBet(VALID);

    expect(rpc).toHaveBeenCalledWith('fn_place_wager', {
      p_player_id: 7,
      p_option_id: 12,
      p_amount: 100,
      p_expected_odds: 1.85,
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      wager: { id: 31, optionId: 12, amount: 100, odds: 1.85, potentialPayout: 185, placedAt: '2026-10-14T18:00:00Z' },
      balance: 900,
    });
  });

  it('says when the player cannot afford the bet (SRS-206.1)', async () => {
    rpc.mockResolvedValue({ data: { status: 'insufficient_balance', balance: 40 }, error: null });

    const response = await placeBet(VALID);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "You don't have enough coins for this bet.", balance: 40 });
  });

  it('says when betting has closed (SRS-206.2)', async () => {
    rpc.mockResolvedValue({ data: { status: 'closed' }, error: null });

    const response = await placeBet(VALID);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Betting on this game has closed.' });
  });

  it('returns the new odds when they changed', async () => {
    rpc.mockResolvedValue({ data: { status: 'odds_changed', current_odds: '1.910' }, error: null });

    const response = await placeBet(VALID);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'The odds changed. Check the new odds and place your bet again.',
      currentOdds: 1.91,
    });
  });

  it('refuses a bet that could not win any coins', async () => {
    rpc.mockResolvedValue({ data: { status: 'no_profit' }, error: null });
    expect((await placeBet(VALID)).status).toBe(400);
  });

  it('blocks accounts pending deletion', async () => {
    rpc.mockResolvedValue({ data: { status: 'not_active' }, error: null });
    expect((await placeBet(VALID)).status).toBe(403);
  });

  it('reports a database failure without claiming coins were taken', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } });

    const response = await placeBet(VALID);

    expect(response.status).toBe(500);
    expect((await response.json()).error).toMatch(/coins were not taken/);
  });
});

function wagerRow(overrides: Partial<WagerRow> = {}): WagerRow {
  return {
    wager_id: 31,
    amount: 100,
    odds_at_placement: '1.850',
    placed_at: '2026-10-14T18:00:00Z',
    result: null,
    payout: null,
    settled_at: null,
    option: {
      option_label: 'Over 48.5',
      winning_condition: 'Combined score is more than 48.5',
      market: {
        market_type_code: 'total',
        market_types: { display_name: 'Over/Under' },
        event: {
          event_id: 5,
          start_time: '2026-10-16T00:15:00Z',
          status: 'Upcoming',
          home_score: null,
          away_score: null,
          league: { league_name: 'NFL' },
          home: { team_name: 'Denver Broncos' },
          away: { team_name: 'Seattle Seahawks' },
        },
      },
    },
    ...overrides,
  };
}

const BEFORE_KICKOFF = new Date('2026-10-15T12:00:00Z');

describe('toMyBet', () => {
  it('shows an open bet as Pending with what it pays if it wins (SRS-207.1, SRS-208.1)', () => {
    expect(toMyBet(wagerRow(), BEFORE_KICKOFF)).toEqual({
      id: 31,
      placedAt: '2026-10-14T18:00:00Z',
      amount: 100,
      odds: 1.85,
      potentialPayout: 185,
      decision: 'Pending',
      result: null,
      payout: null,
      settledAt: null,
      canCancel: true,
      cancelUntil: '2026-10-15T23:15:00.000Z',
      resultSeen: false,
      selection: 'Over 48.5',
      winningCondition: 'Combined score is more than 48.5',
      market: 'Over/Under',
      event: {
        id: 5,
        league: 'NFL',
        homeTeam: 'Denver Broncos',
        awayTeam: 'Seattle Seahawks',
        startTime: '2026-10-16T00:15:00Z',
        status: 'Upcoming',
        homeScore: null,
        awayScore: null,
      },
    });
  });

  it('includes the game status and live score (SRS-208.2)', () => {
    const row = wagerRow();
    row.option!.market!.event = { ...row.option!.market!.event!, status: 'In Progress', home_score: 14, away_score: 10 };

    const bet = toMyBet(row, new Date('2026-10-16T01:30:00Z'));

    expect(bet.event).toMatchObject({ status: 'In Progress', homeScore: 14, awayScore: 10 });
  });

  it('stops offering cancel within 1 hour of the game and once settled', () => {
    expect(toMyBet(wagerRow(), new Date('2026-10-15T23:30:00Z')).canCancel).toBe(false);
    expect(toMyBet(wagerRow({ result: 'Cancelled', payout: 100, settled_at: '2026-10-15T12:00:00Z' }), BEFORE_KICKOFF)).toMatchObject({
      canCancel: false,
      decision: 'Decided',
      result: 'Cancelled',
    });
  });

  it('marks a settled bet Decided with its result and payout (SRS-211.1)', () => {
    const bet = toMyBet(
      wagerRow({ result: 'Won', payout: 185, settled_at: '2026-10-16T04:00:00Z' }),
      new Date('2026-10-16T05:00:00Z'),
    );

    expect(bet).toMatchObject({ decision: 'Decided', result: 'Won', payout: 185 });
  });
});

describe('splitBets', () => {
  it('lists open bets by game start and settled bets newest first', () => {
    const early = toMyBet(wagerRow({ wager_id: 1 }), BEFORE_KICKOFF);
    const late = { ...toMyBet(wagerRow({ wager_id: 2 }), BEFORE_KICKOFF), event: { ...early.event, startTime: '2026-10-20T00:00:00Z' } };
    const settledOld = toMyBet(wagerRow({ wager_id: 3, result: 'Lost', payout: 0, settled_at: '2026-10-10T00:00:00Z' }));
    const settledNew = toMyBet(wagerRow({ wager_id: 4, result: 'Refunded', payout: 100, settled_at: '2026-10-12T00:00:00Z' }));

    const { open, settled } = splitBets([late, settledOld, early, settledNew]);

    expect(open.map((b) => b.id)).toEqual([1, 2]);
    expect(settled.map((b) => b.id)).toEqual([4, 3]);
  });

  it('lists settled results the player has not seen yet for the pop-up, except cancellations', () => {
    const won = toMyBet(wagerRow({ wager_id: 5, result: 'Won', payout: 185, settled_at: '2026-10-16T06:00:00Z' }));
    const seen = toMyBet(
      wagerRow({ wager_id: 6, result: 'Lost', payout: 0, settled_at: '2026-10-16T06:00:00Z', result_seen_at: '2026-10-16T07:00:00Z' }),
    );
    const cancelled = toMyBet(wagerRow({ wager_id: 7, result: 'Cancelled', payout: 100, settled_at: '2026-10-15T12:00:00Z' }));
    const open = toMyBet(wagerRow({ wager_id: 8 }), BEFORE_KICKOFF);

    expect(splitBets([won, seen, cancelled, open]).unseen.map((b) => b.id)).toEqual([5]);
  });
});

describe('GET /api/sports/wagers', () => {
  const getBets = (token: string | null = 'good-token') =>
    GET(new Request('http://localhost/api/sports/wagers', { headers: token ? { Authorization: `Bearer ${token}` } : {} }));

  beforeEach(() => {
    wagers.result = { data: [wagerRow()], error: null };
    wagers.eq.mockClear();
  });

  it('requires a logged-in player', async () => {
    expect((await getBets(null)).status).toBe(401);
  });

  it("returns only the player's own bets, split into open and settled", async () => {
    const response = await getBets();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(wagers.eq).toHaveBeenCalledWith('player_id', 7);
    expect(body.open).toHaveLength(1);
    expect(body.settled).toEqual([]);
  });

  it('returns 500 when the query fails', async () => {
    wagers.result = { data: null, error: { message: 'relation does not exist' } };

    const response = await getBets();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Could not load your bets. Please try again.' });
  });
});
