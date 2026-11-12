import { describe, expect, it, vi } from 'vitest';
import { PokerTable } from '../../lib/pokerTable';
import {
  POKER_MIGRATION,
  STACK_SAVE_LIMIT_MS,
  saveHandOnTime,
  clearHandInProgress,
  loadSavedTables,
  persistHandFinished,
  persistHandStarted,
  persistJoin,
  persistLeave,
  persistRebuy,
  seatsToSave,
} from '../../lib/pokerPersistence';

// Chip stacks that last (UR-007): from hand to hand at a table (SRS-7.1),
// saved after every hand (SRS-7.2), and restored after a restart, voiding a
// hand it interrupted (SRS-7.3, SRS-7.4).

function tableWith(seatNumbers: number[], stacks: Record<number, number> = {}): PokerTable {
  const table = new PokerTable('table-1', 6, 10, 5);
  seatNumbers.forEach((seatNumber) => {
    table.join(`${seatNumber}`, `P${seatNumber}`, stacks[seatNumber] ?? 1000, null, seatNumber);
  });
  return table;
}

const stacks = (table: PokerTable) => table.getState().seats.map((seat) => seat.chipStack);

describe('the stack carries forward between hands (SRS-7.1)', () => {
  it('starts the next hand with the stack the last one ended with', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(() => 0); // button 1, SB 2, BB 3
    table.act('1', 'raise', 100);
    table.act('2', 'call');
    table.act('3', 'fold');
    // Flop: seat 2 checks, seat 1 bets, seat 2 folds; seat 1 wins 210.
    table.act('2', 'check');
    table.act('1', 'bet', 50);
    table.act('2', 'fold');
    const after = stacks(table);
    expect(after.slice(0, 3)).toEqual([1110, 900, 990]);

    table.updateCountdown(0);
    table.startHand(() => 0); // button 2, SB 3, BB 1
    const second = table.getState();
    // Each starts from where they ended, less any blind now posted.
    expect(second.seats[0].chipStack).toBe(1110 - 10);
    expect(second.seats[1].chipStack).toBe(900);
    expect(second.seats[2].chipStack).toBe(990 - 5);
  });

  it('keeps a stack through a hand the player sat out', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(() => 0);
    // Seat 4 joins mid-hand: not dealt in, stack untouched.
    table.join('4', 'P4', 640, null, 4);
    while (table.getState().phase === 'in-hand') {
      table.act(`${table.getState().activeSeat}`, 'fold');
    }
    expect(table.getState().seats[3].chipStack).toBe(640);
  });
});

// The poker server's database calls. The Postgres functions themselves live
// in the migration; these check the calls made to them and what their replies
// mean to players.
function fakeSupabase(replies: unknown[]) {
  const rpc = vi.fn(async () => {
    const next = replies.shift();
    return next instanceof Error ? { data: null, error: { message: next.message } } : { data: next, error: null };
  });
  return { client: { rpc } as never, rpc };
}

describe('saving seats as players sit down, buy back in and leave (SRS-7.2)', () => {
  it('passes the table, player, seat and buy-in to fn_poker_join', async () => {
    const { client, rpc } = fakeSupabase([{ status: 'joined', balance: 4500 }]);
    expect(await persistJoin(client, 'low-1', 7, 3, 500)).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('fn_poker_join', { p_table_key: 'low-1', p_player_id: 7, p_seat_number: 3, p_buy_in: 500 });
  });

  it.each([
    [{ status: 'invalid_buy_in', min: 250, max: 1000 }, 'Buy-in must be between 250 and 1000.'],
    [{ status: 'insufficient_balance', balance: 100 }, 'That buy-in exceeds your balance.'],
    [{ status: 'seat_taken' }, 'That seat is already taken.'],
    [{ status: 'already_seated', table_key: 'mid-1' }, 'You are already seated at another table. Leave that table first.'],
  ])('says why a join was refused: %j', async (reply, message) => {
    const { client } = fakeSupabase([reply]);
    expect(await persistJoin(client, 'low-1', 7, 3, 500)).toEqual({ ok: false, error: message });
  });

  it('points at the migration when the table is not in the database', async () => {
    const { client } = fakeSupabase([{ status: 'no_table' }]);
    const result = await persistJoin(client, 'low-1', 7, 3, 500);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain(POKER_MIGRATION);
  });

  it('refuses rather than seating anyone when the database call fails', async () => {
    const { client } = fakeSupabase([new Error('connection reset')]);
    expect((await persistJoin(client, 'low-1', 7, 3, 500)).ok).toBe(false);
  });

  it('passes a buy-back to fn_poker_rebuy', async () => {
    const { client, rpc } = fakeSupabase([{ status: 'not_busted' }, { status: 'rebought' }]);
    expect(await persistRebuy(client, 'low-1', 7, 400)).toEqual({
      ok: false,
      error: 'You can only buy back in once you are out of chips.',
    });
    expect(await persistRebuy(client, 'low-1', 7, 400)).toEqual({ ok: true });
    expect(rpc).toHaveBeenLastCalledWith('fn_poker_rebuy', { p_table_key: 'low-1', p_player_id: 7, p_amount: 400 });
  });

  it('pays out the stack the table holds on leaving', async () => {
    const { client, rpc } = fakeSupabase([{ status: 'left', balance: 5300 }]);
    expect(await persistLeave(client, 'low-1', 7, 800)).toBe(true);
    expect(rpc).toHaveBeenCalledWith('fn_poker_leave', { p_table_key: 'low-1', p_player_id: 7, p_chip_stack: 800 });
  });

  it('tries a leave again once if the first call fails', async () => {
    const { client, rpc } = fakeSupabase([new Error('timeout'), { status: 'left' }]);
    expect(await persistLeave(client, 'low-1', 7, 800)).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('treats "not seated" as already done, so nothing is paid twice', async () => {
    const { client, rpc } = fakeSupabase([{ status: 'not_seated' }]);
    expect(await persistLeave(client, 'low-1', 7, 800)).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe('saving every stack after a hand (SRS-7.2)', () => {
  it('saves everyone seated, with their stack, missed blinds and timeouts', () => {
    const table = new PokerTable('low-1', 6, 5, 2);
    table.join('1', 'P1', 500, null, 1);
    table.join('3', 'P3', 300, null, 3);
    expect(seatsToSave(table.getState())).toEqual([
      { seatNumber: 1, playerId: 1, chipStack: 500, owesSmallBlind: false, owesBigBlind: false, consecutiveTimeouts: 0 },
      { seatNumber: 3, playerId: 3, chipStack: 300, owesSmallBlind: false, owesBigBlind: false, consecutiveTimeouts: 0 },
    ]);
  });

  it('saves the stacks as the hand left them, winnings included', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(() => 0);
    table.act('1', 'raise', 100);
    table.act('2', 'fold');
    table.act('3', 'fold');
    expect(seatsToSave(table.getState()).map((seat) => seat.chipStack)).toEqual([1015, 995, 990]);
  });

  it('sends the seats to fn_poker_hand_finished', async () => {
    const { client, rpc } = fakeSupabase([{ status: 'saved', seats: 1 }]);
    const seats = [{ seatNumber: 1, playerId: 1, chipStack: 500, owesSmallBlind: false, owesBigBlind: false, consecutiveTimeouts: 0 }];
    expect(await persistHandFinished(client, 'low-1', seats)).toBe(true);
    expect(rpc).toHaveBeenCalledWith('fn_poker_hand_finished', { p_table_key: 'low-1', p_seats: seats });
  });

  it('tries again once, and says so if the save failed', async () => {
    const { client, rpc } = fakeSupabase([new Error('timeout'), new Error('timeout')]);
    expect(await persistHandFinished(client, 'low-1', [])).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});

describe('restoring the saved stacks when the server starts (SRS-7.3)', () => {
  const saved = {
    dealerSeat: 2,
    smallBlindSeat: 3,
    bigBlindSeat: 4,
    seats: [
      { seatNumber: 2, playerId: '7', username: 'Ann', chipStack: 1250, missedBigBlind: true, timeouts: 2 },
      { seatNumber: 3, playerId: '8', username: 'Bo', chipStack: 400 },
      { seatNumber: 4, playerId: '9', username: 'Cy', chipStack: 0 },
    ],
  };

  it('puts each player back in their seat with the stack saved after the last hand', () => {
    const table = new PokerTable('low-1', 6, 5, 2);
    table.restore(saved, 1_000);
    const state = table.getState(1_000);
    expect(state.seatedCount).toBe(3);
    expect(state.seats[1]).toMatchObject({ playerId: '7', username: 'Ann', chipStack: 1250, missedBigBlind: true, timeouts: 2 });
    expect(state.seats[2]).toMatchObject({ playerId: '8', chipStack: 400 });
    // The button carries on from the last hand.
    expect(state.dealerSeat).toBe(2);
  });

  it('starts everyone disconnected until they are back (SRS-10.3), on the removal clock (SRS-9.2)', () => {
    const table = new PokerTable('low-1', 6, 5, 2);
    table.restore(saved, 1_000);
    expect(table.getState(1_000).seats[1]).toMatchObject({ disconnected: true });
    expect(table.nextDisconnectDeadline()).not.toBeNull();
    // Nobody's dealt in while they're away.
    expect(table.updateCountdown(1_000)).toBeNull();
    // Back: the same seat and stack.
    expect(table.heardFrom('7', 2_000)).toBe('reconnected');
    expect(table.getState().seats[1]).toMatchObject({ chipStack: 1250, disconnected: false });
  });

  it('keeps a busted player busted, with their decision to make (SRS-12.1)', () => {
    const table = new PokerTable('low-1', 6, 5, 2);
    table.restore(saved, 1_000);
    expect(table.getState().seats[3]).toMatchObject({ playerId: '9', chipStack: 0 });
    table.trackBusted(1_000);
    expect(table.nextBustedDeadline()).not.toBeNull();
  });
});

describe('reading the saved tables (SRS-7.3)', () => {
  const row = (tableKey: string, seats: unknown[] = [], handInProgress = false) => ({
    table_key: tableKey,
    dealer_button_seat: seats.length ? 2 : null,
    last_small_blind_seat: seats.length ? 3 : null,
    last_big_blind_seat: seats.length ? 4 : null,
    hand_in_progress: handInProgress,
    poker_seats: seats,
  });
  function fakeTables(rows: unknown[]) {
    const builder = { select: vi.fn(() => builder), in: vi.fn(async () => ({ data: rows, error: null })) };
    return { from: vi.fn(() => builder) } as never;
  }

  it('reads every table with its saved seats, stacks, markers and timeouts', async () => {
    const loaded = await loadSavedTables(
      fakeTables([
        row('low-1', [
          { seat_number: 2, player_id: 7, chip_stack: '1250', owes_small_blind: false, owes_big_blind: true, consecutive_timeouts: 1 },
        ]),
        row('low-2'),
      ]),
      ['low-1', 'low-2']
    );
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.tables.get('low-1')).toEqual({
      dealerSeat: 2,
      smallBlindSeat: 3,
      bigBlindSeat: 4,
      handInProgress: false,
      seats: [{ seatNumber: 2, playerId: '7', chipStack: 1250, missedSmallBlind: false, missedBigBlind: true, timeouts: 1 }],
    });
    expect(loaded.tables.get('low-2')?.seats).toEqual([]);
  });

  it('says which tables are missing when the migration has not been run', async () => {
    const loaded = await loadSavedTables(fakeTables([row('low-1')]), ['low-1', 'mid-1']);
    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.error).toContain('mid-1');
    expect(loaded.error).toContain(POKER_MIGRATION);
  });
});

describe('voiding a hand a restart interrupted (SRS-7.4)', () => {
  it('marks each hand under way, with its button and blinds', async () => {
    const { client, rpc } = fakeSupabase([{ status: 'started' }]);
    await persistHandStarted(client, 'low-1', { dealerSeat: 1, smallBlindSeat: 2, bigBlindSeat: 3 });
    expect(rpc).toHaveBeenCalledWith('fn_poker_hand_started', {
      p_table_key: 'low-1',
      p_dealer_seat: 1,
      p_small_blind_seat: 2,
      p_big_blind_seat: 3,
    });
  });

  it('gives every dealt-in player back their stack from before the hand', () => {
    // Saved when the last hand ended (stacks are never written mid-hand).
    const table = tableWith([1, 2, 3]);
    const beforeHand = seatsToSave(table.getState());
    // A hand starts and chips go in; then the server stops.
    table.startHand(() => 0);
    table.act('1', 'raise', 300);
    table.act('2', 'call');
    expect(table.getState().seats.slice(0, 3).map((seat) => seat.chipStack)).toEqual([700, 700, 990]);
    // Restarted from what was saved: the hand is gone, and so is everything bet in it.
    const restarted = new PokerTable('table-1', 6, 10, 5);
    restarted.restore(
      {
        dealerSeat: 1,
        smallBlindSeat: 2,
        bigBlindSeat: 3,
        seats: beforeHand.map((seat) => ({ ...seat, playerId: String(seat.playerId), username: `P${seat.playerId}` })),
      },
      0
    );
    const state = restarted.getState();
    expect(state.phase).not.toBe('in-hand');
    expect(state.pot).toBe(0);
    expect(state.seats.slice(0, 3).map((seat) => seat.chipStack)).toEqual([1000, 1000, 1000]);
  });

  it('reads the hand-in-progress mark, and clears it once the hand is voided', async () => {
    const builder = {
      select: vi.fn(() => builder),
      in: vi.fn(async () => ({
        data: [
          {
            table_key: 'low-1',
            dealer_button_seat: 1,
            last_small_blind_seat: 2,
            last_big_blind_seat: 3,
            hand_in_progress: true,
            poker_seats: [],
          },
        ],
        error: null,
      })),
      update: vi.fn(() => builder),
      eq: vi.fn(async () => ({ error: null })),
    };
    const client = { from: vi.fn(() => builder) } as never;
    const loaded = await loadSavedTables(client, ['low-1']);
    expect(loaded.ok && loaded.tables.get('low-1')?.handInProgress).toBe(true);
    await clearHandInProgress(client, 'low-1');
    expect(builder.update).toHaveBeenCalledWith({ hand_in_progress: false });
    expect(builder.eq).toHaveBeenCalledWith('table_key', 'low-1');
  });
});

describe('saving within a second of the hand ending (SRS-NFR-019)', () => {
  it('is one second', () => {
    expect(STACK_SAVE_LIMIT_MS).toBe(1_000);
  });

  it('times the save from when the hand ended, including any wait before it', async () => {
    let clock = 5_000;
    const save = async () => {
      clock += 300; // the database call
      return true;
    };
    // Ended at 4,800 (it waited 200 ms behind an earlier write), saved at 5,300.
    expect(await saveHandOnTime(save, 4_800, () => clock)).toEqual({ saved: true, ms: 500, onTime: true });
  });

  it('says when it was too slow, or did not save at all', async () => {
    let clock = 0;
    const slow = async () => {
      clock += 1_500;
      return true;
    };
    expect(await saveHandOnTime(slow, 0, () => clock)).toEqual({ saved: true, ms: 1_500, onTime: false });
    expect((await saveHandOnTime(async () => false, clock, () => clock)).onTime).toBe(false);
  });

  it('saves the real thing quickly against a database answering at once', async () => {
    const { client } = fakeSupabase([{ status: 'saved', seats: 3 }]);
    const table = tableWith([1, 2, 3]);
    const started = Date.now();
    const result = await saveHandOnTime(() => persistHandFinished(client, 'low-1', seatsToSave(table.getState())), started);
    expect(result.saved).toBe(true);
    expect(result.onTime).toBe(true);
  });
});
