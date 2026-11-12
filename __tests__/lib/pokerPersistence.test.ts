import { describe, expect, it } from 'vitest';
import { PokerTable } from '../../lib/pokerTable';

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
