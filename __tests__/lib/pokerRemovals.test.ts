import { describe, expect, it } from 'vitest';
import { PokerTable } from '../../lib/pokerTable';
import { noticeReason, payOutRemovals, removalNotice } from '../../lib/pokerRemovals';

// SRS-9.9: a removed player's stack, less anything already in a pot, goes
// back into their balance.

function tableWith(seatNumbers: number[], stacks: Record<number, number> = {}): PokerTable {
  const table = new PokerTable('table-1', 6, 10, 5);
  seatNumbers.forEach((seatNumber) => {
    table.join(`${seatNumber}`, `P${seatNumber}`, stacks[seatNumber] ?? 1000, null, seatNumber);
  });
  return table;
}

function payments() {
  const paid: [number, number][] = [];
  return { paid, pay: async (playerId: number, chips: number) => void paid.push([playerId, chips]) };
}

describe('paying out removed players (SRS-9.9)', () => {
  it('pays each removed player their whole stack between hands', async () => {
    const table = tableWith([1, 2, 3], { 2: 750 });
    table.removePlayer('2', 'disconnected');
    const { paid, pay } = payments();
    const removals = await payOutRemovals(table, pay);
    expect(paid).toEqual([[2, 750]]);
    expect(removals).toEqual([{ playerId: '2', chipStack: 750, reason: 'disconnected' }]);
  });

  it('leaves chips already in the pot out of it', async () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(() => 0); // button 1, SB 2, BB 3
    table.act('1', 'call');
    table.act('2', 'fold'); // the small blind's 5 stays in the pot
    table.removePlayer('2', 'timeouts');
    const { paid, pay } = payments();
    await payOutRemovals(table, pay);
    expect(paid).toEqual([[2, 995]]);
  });

  it('pays a player removed at the end of a hand what they ended it with', async () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(() => 0);
    table.removePlayer('1', 'timeouts'); // in the hand: put off (SRS-9.13)
    const { paid, pay } = payments();
    await payOutRemovals(table, pay);
    expect(paid).toEqual([]);
    table.act('1', 'raise', 100);
    table.act('2', 'fold');
    table.act('3', 'fold');
    await payOutRemovals(table, pay);
    // Their 1000, plus the blinds they won.
    expect(paid).toEqual([[1, 1015]]);
  });

  it('pays someone who asked to leave during the hand (SRS-21.3)', async () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(() => 0);
    table.leave('3'); // the big blind, still in the hand
    table.act('1', 'fold');
    table.act('2', 'fold');
    const { paid, pay } = payments();
    const removals = await payOutRemovals(table, pay);
    expect(removals.map((removal) => removal.reason)).toEqual(['left']);
    expect(paid).toEqual([[3, 1005]]);
  });

  it('has nothing to pay a player with no chips', async () => {
    const table = tableWith([1, 2, 3]);
    const removals = [{ playerId: '2', chipStack: 0, reason: 'left' as const }];
    const { paid, pay } = payments();
    await payOutRemovals({ drainRemovals: () => removals }, pay);
    expect(paid).toEqual([]);
    expect(table.getState().seatedCount).toBe(3);
  });
});

describe('the seat is open again after a removal (SRS-9.10)', () => {
  function expectOpen(table: PokerTable, seatNumber: number, seatedBefore: number) {
    const state = table.getState();
    expect(state.seats[seatNumber - 1]).toMatchObject({ playerId: null, username: null, chipStack: null });
    expect(state.seatedCount).toBe(seatedBefore - 1);
    // Someone else can sit there now.
    expect(table.checkSeat(seatNumber)).toBeNull();
    expect(table.join('9', 'P9', 500, null, seatNumber)).toEqual({ ok: true, seatNumber });
  }

  it('after a removal between hands', () => {
    const table = tableWith([1, 2, 3, 4]);
    table.removePlayer('4', 'timeouts');
    expectOpen(table, 4, 4);
  });

  it('after a removal put off until the hand ended', () => {
    const table = tableWith([1, 2, 3, 4]);
    table.startHand(() => 0); // button 1, SB 2, BB 3; seat 4 first
    table.removePlayer('4', 'disconnected');
    expect(table.getState().seats[3].playerId).toBe('4');
    table.act('4', 'fold');
    table.act('1', 'fold');
    table.act('2', 'fold');
    expectOpen(table, 4, 4);
  });

  it('after a busted player runs out of time to choose (SRS-12.10)', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(() => 0);
    table.act('1', 'raise', 1000); // all-in
    table.act('2', 'call');
    table.act('3', 'fold');
    // Whoever lost the all-in is busted; remove them when their time is up.
    const busted = table.getState().seats.find((seat) => seat.playerId !== null && seat.chipStack === 0);
    expect(busted).toBeDefined();
    table.trackBusted(0);
    expect(table.removeTimedOutBusted(Number.MAX_SAFE_INTEGER)).toEqual([busted?.playerId]);
    expectOpen(table, busted?.seatNumber as number, 3);
  });
});

describe('telling a removed player why (SRS-9.11)', () => {
  it('says why for each of the table\'s own removals', () => {
    expect(removalNotice('timeouts')).toMatch(/timed out in 4 hands in a row/);
    expect(removalNotice('disconnected')).toMatch(/disconnected/);
    expect(removalNotice('busted')).toMatch(/within 60 seconds of running out of chips/);
    // Chips are mentioned only where there were chips to return.
    expect(removalNotice('timeouts')).toMatch(/returned to your balance/);
    expect(removalNotice('busted')).not.toMatch(/returned/);
  });

  it('tells everyone removed except those who chose to leave', () => {
    expect(noticeReason({ playerId: '1', chipStack: 0, reason: 'left' })).toBeNull();
    expect(noticeReason({ playerId: '1', chipStack: 10, reason: 'timeouts' })).toBe('timeouts');
    expect(noticeReason({ playerId: '1', chipStack: 10, reason: 'disconnected' })).toBe('disconnected');
  });
});
