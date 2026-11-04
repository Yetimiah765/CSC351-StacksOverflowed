import { describe, expect, it } from 'vitest';
import { ENTRANCE_KEY, SEAT_KEY, SPOT_KEY, VISITED_KEY } from '../../lib/casinoFloor';
import { CHECK_IN_KEY, parseCheckInForm } from '../../lib/checkIn';

describe('checking in from the page (SRS-103.16)', () => {
  it('reads back the form a login or registration page handed over', () => {
    expect(parseCheckInForm('signup')).toBe('signup');
    expect(parseCheckInForm('login')).toBe('login');
  });

  it('ignores anything else left in the tab, opening no tablet for it', () => {
    for (const raw of [null, '', 'Login', 'register', '1', '{"form":"login"}']) expect(parseCheckInForm(raw)).toBeNull();
  });

  it("is kept under a key of its own, apart from everything else the home page remembers in the tab", () => {
    expect([ENTRANCE_KEY, VISITED_KEY, SEAT_KEY, SPOT_KEY]).not.toContain(CHECK_IN_KEY);
  });
});
