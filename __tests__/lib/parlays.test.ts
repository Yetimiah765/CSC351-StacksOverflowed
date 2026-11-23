import { describe, expect, it } from 'vitest';
import { MAX_PARLAY_LEGS, MIN_PARLAY_LEGS, isParlaySize, legCountProblem, removeLeg, toggleLeg } from '../../lib/sports/parlays';

const leg = (optionId: number) => ({ optionId, label: `Pick ${optionId}` });
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
