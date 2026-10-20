import { describe, expect, it } from 'vitest';
import { WHEEL_ORDER, betReturn, pocketColor, spotWins, type BetSpot } from '../../lib/roulette/bets';

const OUTSIDE: BetSpot[] = [
  { type: 'Red' },
  { type: 'Black' },
  { type: 'Odd' },
  { type: 'Even' },
  { type: 'Low' },
  { type: 'High' },
  { type: 'Dozen1' },
  { type: 'Dozen2' },
  { type: 'Dozen3' },
  { type: 'Column1' },
  { type: 'Column2' },
  { type: 'Column3' },
];

function winners(spot: BetSpot): number[] {
  return Array.from({ length: 37 }, (_, n) => n).filter((n) => spotWins(spot, n));
}

describe('roulette wheel', () => {
  it('has each of the 37 pockets exactly once', () => {
    expect([...WHEEL_ORDER].sort((a, b) => a - b)).toEqual(Array.from({ length: 37 }, (_, n) => n));
  });

  it('colors 0 green and splits 1–36 into 18 red and 18 black', () => {
    expect(pocketColor(0)).toBe('green');
    const colors = Array.from({ length: 36 }, (_, i) => pocketColor(i + 1));
    expect(colors.filter((c) => c === 'red')).toHaveLength(18);
    expect(colors.filter((c) => c === 'black')).toHaveLength(18);
    expect(pocketColor(1)).toBe('red');
    expect(pocketColor(2)).toBe('black');
    expect(pocketColor(36)).toBe('red');
  });
});

describe('roulette bets (SRS-301.3, SRS-301.4)', () => {
  it('covers the right numbers for each outside bet', () => {
    expect(winners({ type: 'Low' })).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    expect(winners({ type: 'Dozen2' })).toEqual(Array.from({ length: 12 }, (_, i) => i + 13));
    expect(winners({ type: 'Column1' })).toEqual(Array.from({ length: 12 }, (_, i) => 3 * i + 1));
    expect(winners({ type: 'Column3' })).toEqual(Array.from({ length: 12 }, (_, i) => 3 * i + 3));
    expect(winners({ type: 'Even' })).not.toContain(0);
  });

  it('loses every outside bet on 0, but pays a straight-up bet on 0', () => {
    for (const spot of OUTSIDE) expect(spotWins(spot, 0)).toBe(false);
    expect(betReturn({ type: 'Number', number: 0 }, 10, 0)).toBe(360);
  });

  it('returns the stake plus the payout on a win, and nothing on a loss', () => {
    expect(betReturn({ type: 'Number', number: 17 }, 5, 17)).toBe(180); // 35:1
    expect(betReturn({ type: 'Red' }, 25, 1)).toBe(50); // 1:1
    expect(betReturn({ type: 'Dozen3' }, 10, 30)).toBe(30); // 2:1
    expect(betReturn({ type: 'Column2' }, 10, 3)).toBe(0);
  });
});
