import { describe, expect, it } from 'vitest';
import { DEFAULT_SLOT_BET, initialSlotBet } from '../../lib/slots';

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
