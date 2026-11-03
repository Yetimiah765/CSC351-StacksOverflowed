import { describe, expect, it } from 'vitest';
import { MAX_PAGES, parseTrail, previousPage, recordVisit } from '../../lib/navHistory';

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
