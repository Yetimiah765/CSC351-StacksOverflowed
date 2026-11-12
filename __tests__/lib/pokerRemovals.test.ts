import { describe, expect, it } from 'vitest';
import { PokerTable } from '../../lib/pokerTable';
import { payOutRemovals } from '../../lib/pokerRemovals';

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
