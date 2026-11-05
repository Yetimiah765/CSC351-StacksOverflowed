import { describe, expect, it } from 'vitest';
import { WISH_REWARD, WISH_WIN_PERCENT, msUntil, nextWishAt, parseCoinSpot, pickWishReward, serializeCoinSpot, wishDay } from '../../lib/wishingFountain';

const at = (iso: string) => Date.parse(iso);
const iso = (ms: number) => new Date(ms).toISOString();

describe('one wish a day, midnight to midnight Eastern time (SRS-129.2)', () => {
  it("counts a wish for the day it is in Eastern time, not UTC's", () => {
    // 7:20 pm Eastern on the 4th is already the 5th in UTC.
    expect(wishDay(at('2026-11-04T23:20:00Z'))).toBe('2026-11-04');
    expect(wishDay(at('2026-11-05T04:59:59Z'))).toBe('2026-11-04');
    expect(wishDay(at('2026-11-05T05:00:00Z'))).toBe('2026-11-05');
  });

  it('makes the next wish available at the next midnight Eastern, in standard and daylight time', () => {
    expect(iso(nextWishAt(at('2026-11-04T23:20:00Z')))).toBe('2026-11-05T05:00:00.000Z');
    expect(iso(nextWishAt(at('2026-07-04T16:00:00Z')))).toBe('2026-07-05T04:00:00.000Z');
    expect(iso(nextWishAt(at('2026-12-31T23:00:00Z')))).toBe('2027-01-01T05:00:00.000Z');
  });

  it('gets midnight right across the days the clocks change', () => {
    // The clocks went back at 2 am on 1 November 2026, and go forward at 2 am on 8 March 2026.
    expect(iso(nextWishAt(at('2026-10-31T12:00:00Z')))).toBe('2026-11-01T04:00:00.000Z');
    expect(iso(nextWishAt(at('2026-11-01T12:00:00Z')))).toBe('2026-11-02T05:00:00.000Z');
    expect(iso(nextWishAt(at('2026-03-07T12:00:00Z')))).toBe('2026-03-08T05:00:00.000Z');
    expect(iso(nextWishAt(at('2026-03-08T12:00:00Z')))).toBe('2026-03-09T04:00:00.000Z');
  });

  it('counts down to a time, and stops at 0 once it has passed', () => {
    const now = at('2026-11-04T23:20:00Z');
    expect(msUntil('2026-11-05T05:00:00+00:00', now)).toBe((5 * 60 + 40) * 60 * 1000);
    expect(msUntil(now - 1000, now)).toBe(0);
    expect(msUntil(null, now)).toBe(0);
  });
});

describe('the wish reward (SRS-129.3)', () => {
  it('gives 2 coins back for 60 of the 100 equally likely rolls, and nothing for the other 40', () => {
    const rewards = Array.from({ length: 100 }, (_, roll) => pickWishReward(roll));
    expect(rewards.filter((reward) => reward === WISH_REWARD)).toHaveLength(WISH_WIN_PERCENT);
    expect(rewards.filter((reward) => reward === 0)).toHaveLength(100 - WISH_WIN_PERCENT);
    expect(WISH_REWARD).toBe(2);
    expect(WISH_WIN_PERCENT).toBe(60);
  });

  it('refuses a roll outside 0-99', () => {
    for (const roll of [-1, 100, 2.5, Number.NaN]) expect(() => pickWishReward(roll)).toThrow(RangeError);
  });
});

describe("today's coin on the bottom of the fountain (SRS-129.4)", () => {
  it('remembers where it lies, for the day it was tossed only', () => {
    const raw = serializeCoinSpot({ x: -0.7, z: 0.3 }, '2026-11-04');
    expect(parseCoinSpot(raw, '2026-11-04')).toEqual({ x: -0.7, z: 0.3 });
    expect(parseCoinSpot(raw, '2026-11-05')).toBeNull();
  });

  it('ignores anything that is not a remembered coin', () => {
    for (const raw of [null, '', 'not json', '{}', '{"day":"2026-11-04","x":"left","z":0}', '{"day":"2026-11-04","x":1}']) {
      expect(parseCoinSpot(raw, '2026-11-04'), String(raw)).toBeNull();
    }
  });
});
