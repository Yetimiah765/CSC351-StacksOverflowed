import { describe, expect, it } from 'vitest';
import { ENTRANCE_KEY, SEAT_KEY, SPOT_KEY, VISITED_KEY } from '../../lib/casinoFloor';
import { CHECK_IN_KEY, isPlayPage, parseCheckInForm, parseHandOver, serializeHandOver, turnedAwayFrom } from '../../lib/checkIn';
import { GAMES } from '../../lib/games';

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

describe('checking in to play (SRS-108.8)', () => {
  it("counts every playable game's pages, and the shop's, as somewhere to go on to", () => {
    for (const game of GAMES) if (game.href) expect(isPlayPage(game.href), game.href).toBe(true);
    expect(isPlayPage('/shop')).toBe(true);
    expect(isPlayPage('/poker/table-1')).toBe(true);
    expect(isPlayPage('/sports/showdown')).toBe(true);
    for (const page of ['/', '/profile', '/login', '/register', '/players/12', '/pokerface', '/shopping']) expect(isPlayPage(page), page).toBe(false);
  });

  it('finds the game page a guest was turned away from, past the login and registration pages', () => {
    expect(turnedAwayFrom(['/', '/blackjack', '/login'])).toBe('/blackjack');
    expect(turnedAwayFrom(['/', '/poker/table-2', '/register', '/login'])).toBe('/poker/table-2');
    // Opened straight on the login page, or sent there from somewhere that isn't a game.
    expect(turnedAwayFrom(['/login'])).toBeNull();
    expect(turnedAwayFrom(['/', '/profile', '/login'])).toBeNull();
    expect(turnedAwayFrom([])).toBeNull();
  });

  it('hands over the form and the page to go on to, and drops a page that is not a game', () => {
    expect(parseHandOver(serializeHandOver({ form: 'login', play: '/roulette' }))).toEqual({ form: 'login', play: '/roulette' });
    expect(parseHandOver(serializeHandOver({ form: 'signup', play: null }))).toEqual({ form: 'signup', play: null });
    expect(parseHandOver(JSON.stringify({ form: 'login', play: 'https://example.com/' }))).toEqual({ form: 'login', play: null });
    expect(parseHandOver(JSON.stringify({ form: 'login', play: '/profile' }))).toEqual({ form: 'login', play: null });
    for (const raw of [null, '', 'login', '[]', '{"play":"/slots"}', '{"form":"register"}']) expect(parseHandOver(raw), String(raw)).toBeNull();
  });
});
