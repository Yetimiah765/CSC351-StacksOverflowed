import { describe, expect, it } from 'vitest';
import { msUntil, nextWishAt, wishDay } from '../../lib/wishingFountain';

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
