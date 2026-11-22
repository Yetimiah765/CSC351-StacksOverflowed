import { describe, expect, it } from 'vitest';
import { isAtLeast21 } from '../../lib/auth';

// SRS-102.1: sign-up checks the age by today's date in New York, the date the
// database's chk_players_minimum_age uses, whatever the server's time zone.
describe('the sign-up age check (SRS-102.1)', () => {
  it('counts from the New York date while the UTC date is already the next day', () => {
    // 02:00 UTC on 22 Nov 2026 is 21:00 on 21 Nov in New York.
    const evening = new Date('2026-11-22T02:00:00Z');
    expect(isAtLeast21('2005-11-21', evening)).toBe(true);
    // Turns 21 on the 22nd: not yet, in New York (bug #1121).
    expect(isAtLeast21('2005-11-22', evening)).toBe(false);
  });

  it('lets them in once it is their birthday in New York', () => {
    expect(isAtLeast21('2005-11-22', new Date('2026-11-22T05:00:00Z'))).toBe(true); // 00:00 in New York
    expect(isAtLeast21('2005-11-22', new Date('2026-11-22T04:59:59Z'))).toBe(false); // 23:59:59 the day before
  });

  it("follows New York's summer time too", () => {
    // 03:30 UTC on 2 July is 23:30 on 1 July in New York (UTC-4).
    expect(isAtLeast21('2005-07-02', new Date('2026-07-02T03:30:00Z'))).toBe(false);
    expect(isAtLeast21('2005-07-02', new Date('2026-07-02T04:00:00Z'))).toBe(true);
  });

  it('treats 29 February like the database does, as the last day of February 21 years back', () => {
    // On 29 Feb 2028 the cutoff is 28 Feb 2007 (Postgres: date - interval '21 years').
    const leapDay = new Date('2028-02-29T17:00:00Z');
    expect(isAtLeast21('2007-02-28', leapDay)).toBe(true);
    expect(isAtLeast21('2007-03-01', leapDay)).toBe(false);
  });

  it('refuses a date that is not a date', () => {
    expect(isAtLeast21('not-a-date', new Date('2026-11-22T12:00:00Z'))).toBe(false);
  });
});
