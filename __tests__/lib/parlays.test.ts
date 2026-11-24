import { describe, expect, it } from 'vitest';
import {
  MAX_PARLAY_LEGS,
  MIN_PARLAY_LEGS,
  SAME_GAME_ERROR,
  allDifferentEvents,
  canParlayWinCoins,
  decideParlay,
  hasPickFromEvent,
  isParlaySize,
  legCountProblem,
  parlayOdds,
  parlayPayout,
  removeLeg,
  toggleLeg,
} from '../../lib/sports/parlays';

// Each pick is from its own game unless a test says otherwise.
const leg = (optionId: number, eventId = optionId * 100) => ({ optionId, eventId, label: `Pick ${optionId}` });
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe('parlay size (SRS-219.1)', () => {
  it('allows 2 to 10 picks', () => {
    expect(MIN_PARLAY_LEGS).toBe(2);
    expect(MAX_PARLAY_LEGS).toBe(10);
    for (const count of range(2, 10)) expect(isParlaySize(count)).toBe(true);
    for (const count of [0, 1, 11]) expect(isParlaySize(count)).toBe(false);
  });

  it('says how many more picks a parlay needs', () => {
    expect(legCountProblem(0)).toBe('Add 2 more picks to make a parlay (2 to 10).');
    expect(legCountProblem(1)).toBe('Add 1 more pick to make a parlay (2 to 10).');
    expect(legCountProblem(2)).toBeNull();
    expect(legCountProblem(10)).toBeNull();
    expect(legCountProblem(11)).toBe('A parlay can have at most 10 picks.');
  });
});

describe('adding and removing picks (SRS-219.1)', () => {
  it('adds a new pick at the end', () => {
    const result = toggleLeg([leg(1)], leg(2));
    expect(result.ok).toBe(true);
    expect(result.legs.map((l) => l.optionId)).toEqual([1, 2]);
  });

  it('takes a pick out when it is picked again', () => {
    const result = toggleLeg([leg(1), leg(2), leg(3)], leg(2));
    expect(result.ok).toBe(true);
    expect(result.legs.map((l) => l.optionId)).toEqual([1, 3]);
  });

  it('accepts a tenth pick', () => {
    const result = toggleLeg(range(1, 9).map(leg), leg(10));
    expect(result.ok).toBe(true);
    expect(result.legs).toHaveLength(10);
  });

  it('refuses an eleventh pick and leaves the parlay as it was', () => {
    const full = range(1, 10).map(leg);
    const result = toggleLeg(full, leg(11));
    expect(result.ok).toBe(false);
    expect(result.legs).toBe(full);
    if (!result.ok) expect(result.error).toBe('A parlay can have at most 10 picks.');
  });

  it('still lets a full parlay drop one of its picks', () => {
    const full = range(1, 10).map(leg);
    expect(toggleLeg(full, leg(10)).legs).toHaveLength(9);
  });

  it('removes a pick by its option', () => {
    expect(removeLeg([leg(1), leg(2)], 1).map((l) => l.optionId)).toEqual([2]);
    expect(removeLeg([leg(1)], 9).map((l) => l.optionId)).toEqual([1]);
  });
});

describe('one pick per game (SRS-219.5)', () => {
  it('refuses a second pick from the same game and leaves the parlay as it was', () => {
    const legs = [leg(1, 7), leg(2, 8)];
    // Option 3 is another outcome of game 7, e.g. its spread after its moneyline.
    const result = toggleLeg(legs, leg(3, 7));
    expect(result.ok).toBe(false);
    expect(result.legs).toBe(legs);
    if (!result.ok) expect(result.error).toBe(SAME_GAME_ERROR);
  });

  it('still takes a pick out when that same pick is chosen again', () => {
    const result = toggleLeg([leg(1, 7), leg(2, 8)], leg(1, 7));
    expect(result.ok).toBe(true);
    expect(result.legs.map((l) => l.optionId)).toEqual([2]);
  });

  it('allows a pick from that game again once the first one is removed', () => {
    const without = removeLeg([leg(1, 7), leg(2, 8)], 1);
    const result = toggleLeg(without, leg(3, 7));
    expect(result.ok).toBe(true);
    expect(result.legs.map((l) => l.optionId)).toEqual([2, 3]);
  });

  it('says the same-game rule before the parlay-is-full rule', () => {
    const full = range(1, 10).map((n) => leg(n));
    const result = toggleLeg(full, leg(99, 100));
    if (!result.ok) expect(result.error).toBe(SAME_GAME_ERROR);
    expect(result.ok).toBe(false);
  });

  it('tells whether a game already has a pick, and whether every pick is from a different game', () => {
    expect(hasPickFromEvent([leg(1, 7)], 7)).toBe(true);
    expect(hasPickFromEvent([leg(1, 7)], 8)).toBe(false);
    expect(allDifferentEvents([leg(1, 7), leg(2, 8)])).toBe(true);
    expect(allDifferentEvents([leg(1, 7), leg(2, 7)])).toBe(false);
    expect(allDifferentEvents([])).toBe(true);
  });
});

describe('combined odds and payout (SRS-219.2)', () => {
  it('multiplies the picks\' odds', () => {
    expect(parlayOdds([1.33, 2.24])).toBeCloseTo(2.9792, 6);
    expect(parlayOdds([2, 2, 2])).toBe(8);
    expect(parlayOdds([1.68, 2.1, 2.7])).toBeCloseTo(9.5256, 6);
  });

  it('pays the stake times the combined odds, rounded down to a whole coin', () => {
    expect(parlayPayout(100, [1.33, 2.24])).toBe(297); // 297.92
    expect(parlayPayout(50, [2, 2, 2])).toBe(400);
    expect(parlayPayout(250, [1.68, 2.1, 2.7])).toBe(2381); // 2381.4
  });

  it('works out the payout exactly, where multiplying decimals would lose a coin', () => {
    // 50 x 1.15 x 2 is exactly 115, but in floating point it's 114.999…
    expect(Math.floor(50 * 1.15 * 2)).toBe(114);
    expect(parlayPayout(50, [1.15, 2])).toBe(115);
  });

  it('stays exact for a 10-pick parlay with large odds', () => {
    const odds = Array(10).fill(3.333);
    // 3.333^10 = 166,333.9…, so 1,000 coins pay 166,333,9xx.
    expect(parlayPayout(1000, odds)).toBe(Math.floor(1000 * 3.333 ** 10));
    expect(parlayOdds(odds)).toBeCloseTo(3.333 ** 10, 3);
  });

  it('pays nothing for an amount or odds that are not valid', () => {
    expect(parlayPayout(0, [2, 2])).toBe(0);
    expect(parlayPayout(-50, [2, 2])).toBe(0);
    expect(parlayPayout(50.5, [2, 2])).toBe(0);
    expect(parlayPayout(50, [])).toBe(0);
    expect(parlayPayout(50, [2, 1])).toBe(0);
  });

  it('only lets a parlay through if it can win more than its stake', () => {
    expect(canParlayWinCoins(50, [1.01, 1.01])).toBe(true); // pays 51
    expect(canParlayWinCoins(1, [1.01, 1.01])).toBe(false); // pays 1
  });
});

describe('settling a parlay (SRS-219.4)', () => {
  const W = (odds: number) => ({ result: 'Won' as const, odds });
  const L = (odds: number) => ({ result: 'Lost' as const, odds });
  const R = (odds: number) => ({ result: 'Refunded' as const, odds });
  const open = (odds: number) => ({ result: null, odds });

  it('wins only when every pick wins, paying the stake times the combined odds', () => {
    expect(decideParlay(100, [W(1.33), W(2.24)])).toEqual({ result: 'Won', payout: 297 });
    expect(decideParlay(50, [W(1.15), W(2)])).toEqual({ result: 'Won', payout: 115 });
  });

  it('loses as soon as any pick loses, even with games still to play', () => {
    expect(decideParlay(100, [W(2), L(2), W(2)])).toEqual({ result: 'Lost', payout: 0 });
    expect(decideParlay(100, [open(2), L(2)])).toEqual({ result: 'Lost', payout: 0 });
  });

  it('waits while a pick is undecided and none has lost', () => {
    expect(decideParlay(100, [W(2), open(2)])).toBeNull();
    expect(decideParlay(100, [R(2), open(2)])).toBeNull();
  });

  it('drops refunded picks and works the payout out from the rest', () => {
    // 2.00 x 3.00 without the refunded 5.00 pick: 100 pays 600, not 3,000.
    expect(decideParlay(100, [W(2), R(5), W(3)])).toEqual({ result: 'Won', payout: 600 });
    // One pick left is paid like a single bet.
    expect(decideParlay(100, [R(2), W(1.85)])).toEqual({ result: 'Won', payout: 185 });
  });

  it('gives the stake back when every pick is refunded', () => {
    expect(decideParlay(100, [R(2), R(3)])).toEqual({ result: 'Refunded', payout: 100 });
  });

  it('gives the stake back when what is left after refunds would win nothing', () => {
    // 50 x 1.01 = 50.5, which rounds down to the stake.
    expect(decideParlay(50, [W(1.01), R(3)])).toEqual({ result: 'Refunded', payout: 50 });
  });
});
