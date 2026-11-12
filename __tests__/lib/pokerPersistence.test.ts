import { describe, expect, it, vi } from 'vitest';
import { PokerTable } from '../../lib/pokerTable';
import {
  POKER_MIGRATION,
  persistHandFinished,
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
