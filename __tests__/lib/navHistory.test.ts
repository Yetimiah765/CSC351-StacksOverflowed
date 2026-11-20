import { describe, expect, it } from 'vitest';
import {
  backStep,
  MAX_PAGES,
  nextLoadMark,
  parseLoadMark,
  parseTrail,
  previousPage,
  recordVisit,
} from '../../lib/navHistory';

const visit = (...paths: string[]) => paths.reduce<string[]>(recordVisit, []);

describe('the trail the back buttons go by (SRS-108.7)', () => {
  it('knows the game a player came to their profile from', () => {
    const trail = visit('/', '/blackjack', '/profile');
    expect(previousPage(trail)).toBe('/blackjack');
  });

  it('has no earlier page for the first page opened in the tab', () => {
    expect(previousPage(visit('/shop'))).toBeNull();
    expect(previousPage([])).toBeNull();
  });

  it('steps back when the player goes back, by our button or the browser', () => {
    const trail = visit('/', '/blackjack', '/profile', '/blackjack');
    expect(trail).toEqual(['/', '/blackjack']);
    expect(previousPage(trail)).toBe('/');
  });

  it('leaves the trail alone on a refresh', () => {
    expect(visit('/', '/profile', '/profile')).toEqual(['/', '/profile']);
  });

  it('keeps only the last pages', () => {
    const many = Array.from({ length: MAX_PAGES + 10 }, (_, i) => `/page-${i}`);
    const trail = visit(...many);
    expect(trail).toHaveLength(MAX_PAGES);
    expect(trail[trail.length - 1]).toBe(`/page-${MAX_PAGES + 9}`);
  });

  it('reads a missing or damaged trail as empty', () => {
    expect(parseTrail(null)).toEqual([]);
    expect(parseTrail('not json')).toEqual([]);
    expect(parseTrail('{"a":1}')).toEqual([]);
    expect(parseTrail('["/", 3]')).toEqual([]);
    expect(parseTrail('["/", "/shop"]')).toEqual(['/', '/shop']);
  });
});

// A tab as NavigationTracker keeps it: each page is reached either by loading
// it (typed in the address bar, a bookmark, a refresh: 'load') or by a link
// inside the website ('link'). A visit to another website records nothing.
function tab(...steps: [path: string, how: 'load' | 'link'][]) {
  let trail: string[] = [];
  let mark = parseLoadMark(null);
  for (const [path, how] of steps) {
    trail = recordVisit(trail, path);
    mark = nextLoadMark(mark, trail, how === 'load');
  }
  return backStep(trail, mark);
}

describe("how the back button gets there, staying on the website (SRS-108.7)", () => {
  it("goes to the page instead of the browser's Back when another website came in between (bug #1000)", () => {
    // Home, then example.com, then the shop typed into the address bar: the
    // browser's Back from the shop would go to example.com.
    expect(tab(['/', 'load'], ['/shop', 'load'])).toEqual({ by: 'link', path: '/' });
  });

  it("uses the browser's Back for a page reached by a link since the page loaded", () => {
    expect(tab(['/', 'load'], ['/shop', 'link'])).toEqual({ by: 'history' });
    expect(tab(['/shop', 'load'], ['/profile', 'link'])).toEqual({ by: 'history' });
    expect(tab(['/', 'load'], ['/blackjack', 'link'], ['/profile', 'link'])).toEqual({ by: 'history' });
  });

  it("doesn't trust the browser's Back past the page that loaded", () => {
    // Loaded at the shop (with Home from an earlier visit), on to the profile
    // and back: the page before the shop in the browser's history is from
    // before the load, maybe another website.
    expect(tab(['/', 'load'], ['/shop', 'load'], ['/profile', 'link'], ['/shop', 'link'])).toEqual({
      by: 'link',
      path: '/',
    });
  });

  it("uses the browser's Back again once the trail is back inside this load", () => {
    // From the shop to Home by our button (a link), then on to the profile:
    // Home is right behind it now.
    expect(tab(['/', 'load'], ['/shop', 'load'], ['/', 'link'], ['/profile', 'link'])).toEqual({ by: 'history' });
  });

  it('goes home from the first page opened in the tab', () => {
    expect(tab(['/shop', 'load'])).toEqual({ by: 'link', path: '/' });
  });

  it("never trusts the browser's Back without a load mark", () => {
    expect(parseLoadMark(null)).toBe(Infinity);
    expect(parseLoadMark('abc')).toBe(Infinity);
    expect(parseLoadMark('-1')).toBe(Infinity);
    expect(parseLoadMark('2')).toBe(2);
    expect(backStep(['/', '/shop'], Infinity)).toEqual({ by: 'link', path: '/' });
  });
});
