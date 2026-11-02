import { describe, expect, it } from 'vitest';
import { DEFAULT_SLOT_BET, PAYTABLE, REEL_ROLLS, initialSlotBet, payoutMultiplier, slotPayout, symbolForRoll } from '../../lib/slots';

describe('initialSlotBet', () => {
  it('selects 5 coins when the page loads (SRS-306.1)', () => {
    expect(DEFAULT_SLOT_BET).toBe(5);
    expect(initialSlotBet([5, 10, 25, 50, 100])).toBe(5);
    expect(initialSlotBet([100, 50, 5])).toBe(5);
  });

  it('falls back to the smallest bet if 5 is not offered', () => {
    expect(initialSlotBet([25, 10, 50])).toBe(10);
  });

  it('selects nothing when there are no bets', () => {
    expect(initialSlotBet([])).toBeNull();
  });
});

describe('reel odds (SRS-307.1)', () => {
  it('gives each symbol its share of the 32 rolls', () => {
    const counts: Record<string, number> = {};
    for (let roll = 0; roll < REEL_ROLLS; roll++) {
      const symbol = symbolForRoll(roll);
      counts[symbol] = (counts[symbol] ?? 0) + 1;
    }
    expect(counts).toEqual({ Cherry: 10, Lemon: 8, Orange: 6, Bell: 4, Bar: 3, Seven: 1 });
  });

  it('uses the same roll ranges as fn_spin_slots', () => {
    expect([0, 9, 10, 17, 18, 23, 24, 27, 28, 30, 31].map(symbolForRoll)).toEqual([
      'Cherry', 'Cherry', 'Lemon', 'Lemon', 'Orange', 'Orange', 'Bell', 'Bell', 'Bar', 'Bar', 'Seven',
    ]);
  });

  it('rejects rolls outside 0-31', () => {
    for (const roll of [-1, 32, 1.5]) expect(() => symbolForRoll(roll)).toThrow();
  });
});

describe('paytable (SRS-309.2, SRS-309.3)', () => {
  it('pays each three of a kind', () => {
    expect(payoutMultiplier(['Seven', 'Seven', 'Seven'])).toBe(200);
    expect(payoutMultiplier(['Bar', 'Bar', 'Bar'])).toBe(100);
    expect(payoutMultiplier(['Bell', 'Bell', 'Bell'])).toBe(50);
    expect(payoutMultiplier(['Orange', 'Orange', 'Orange'])).toBe(20);
    expect(payoutMultiplier(['Lemon', 'Lemon', 'Lemon'])).toBe(10);
    expect(payoutMultiplier(['Cherry', 'Cherry', 'Cherry'])).toBe(6);
  });

  it('pays 4x for Cherry on reels 1 and 2 with anything else on reel 3, and only one row', () => {
    expect(payoutMultiplier(['Cherry', 'Cherry', 'Seven'])).toBe(4);
    expect(payoutMultiplier(['Cherry', 'Cherry', 'Lemon'])).toBe(4);
  });

  it('pays nothing for anything else', () => {
    expect(payoutMultiplier(['Seven', 'Cherry', 'Cherry'])).toBe(0);
    expect(payoutMultiplier(['Cherry', 'Seven', 'Cherry'])).toBe(0);
    expect(payoutMultiplier(['Seven', 'Seven', 'Bar'])).toBe(0);
  });

  it('pays the bet times the multiplier (SRS-309.1)', () => {
    expect(slotPayout(25, ['Bar', 'Bar', 'Bar'])).toBe(2500);
    expect(slotPayout(100, ['Lemon', 'Bar', 'Cherry'])).toBe(0);
  });

  it('lists the paytable rows best first, matching the multipliers', () => {
    expect(PAYTABLE.map((row) => row.multiplier)).toEqual([200, 100, 50, 20, 10, 6, 4]);
  });
});
