import { describe, expect, it, vi } from 'vitest';
import {
  loadSavedTables,
  persistHandFinished,
  persistJoin,
  persistLeave,
  persistRebuy,
  seatsToSave,
} from '../../lib/pokerPersistence';
import { PokerTable } from '../../lib/pokerTable';

// The poker server's database calls (UR-007). The Postgres functions
// themselves are tested against a real Postgres; these check the calls made
// to them and what their replies mean to players.

function fakeSupabase(replies: unknown[], tableRows?: unknown) {
  const rpc = vi.fn(async () => {
    const next = replies.shift();
    return next instanceof Error ? { data: null, error: { message: next.message } } : { data: next, error: null };
  });
  const builder = {
    select: vi.fn(() => builder),
    in: vi.fn(async () => ({ data: tableRows ?? [], error: null })),
  };
  return { client: { rpc, from: vi.fn(() => builder) } as never, rpc, builder };
}

describe('joining and buying back in', () => {
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
});

describe('leaving', () => {
  it('pays out the stack the table holds', async () => {
    const { client, rpc } = fakeSupabase([{ status: 'left', balance: 5300 }]);
    expect(await persistLeave(client, 'low-1', 7, 800)).toBe(true);
    expect(rpc).toHaveBeenCalledWith('fn_poker_leave', { p_table_key: 'low-1', p_player_id: 7, p_chip_stack: 800 });
  });

  it('tries again once if the first call fails', async () => {
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

describe('saving a hand (SRS-7.2)', () => {
  it('saves everyone seated, with their stack and missed blinds', () => {
    const table = new PokerTable('low-1', 6, 5, 2);
    table.join('1', 'P1', 500, null, 1);
    table.join('3', 'P3', 300, null, 3);

    expect(seatsToSave(table.getState())).toEqual([
      { seatNumber: 1, playerId: 1, chipStack: 500, owesSmallBlind: false, owesBigBlind: false },
      { seatNumber: 3, playerId: 3, chipStack: 300, owesSmallBlind: false, owesBigBlind: false },
    ]);
  });

  it('sends the seats to fn_poker_hand_finished', async () => {
    const { client, rpc } = fakeSupabase([{ status: 'saved', seats: 1 }]);
    const seats = [{ seatNumber: 1, playerId: 1, chipStack: 500, owesSmallBlind: false, owesBigBlind: false }];
    await persistHandFinished(client, 'low-1', seats);
    expect(rpc).toHaveBeenCalledWith('fn_poker_hand_finished', { p_table_key: 'low-1', p_seats: seats });
  });
});

describe('restoring after a restart (SRS-7.3)', () => {
  const row = (tableKey: string, seats: unknown[] = [], handInProgress = false) => ({
    table_key: tableKey,
    dealer_button_seat: seats.length ? 2 : null,
    last_small_blind_seat: seats.length ? 3 : null,
    last_big_blind_seat: seats.length ? 4 : null,
    hand_in_progress: handInProgress,
    poker_seats: seats,
  });

  it('reads every table with its saved seats and stacks', async () => {
    const { client } = fakeSupabase(
      [],
      [
        row('low-1', [{ seat_number: 2, player_id: 7, chip_stack: '1250', owes_small_blind: false, owes_big_blind: true }], true),
        row('low-2'),
      ]
    );
    const loaded = await loadSavedTables(client, ['low-1', 'low-2']);

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.tables.get('low-1')).toEqual({
      dealerSeat: 2,
      smallBlindSeat: 3,
      bigBlindSeat: 4,
      handInProgress: true,
      seats: [{ seatNumber: 2, playerId: '7', chipStack: 1250, missedSmallBlind: false, missedBigBlind: true }],
    });
    expect(loaded.tables.get('low-2')?.seats).toEqual([]);
  });

  it('says which tables are missing when the migration has not been run', async () => {
    const { client } = fakeSupabase([], [row('low-1')]);
    const loaded = await loadSavedTables(client, ['low-1', 'mid-1']);
    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.error).toContain('mid-1');
    expect(loaded.error).toContain('2026-10-27_poker_persistent_stacks.sql');
  });
});
