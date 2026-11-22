// The pages of the website visited in this browser tab, oldest first, so a
// back button knows whether there's an earlier page of ours to return to
// (SRS-108.7). NavigationTracker keeps it in sessionStorage under
// NAV_HISTORY_KEY; the rules are pure here, so they're unit-tested.

export const NAV_HISTORY_KEY = 'nav_history';

// How long the trail was when the page in the tab last loaded (lowered if the
// trail gets shorter than that). The pages after it were reached inside the
// website since then, so the browser's history has each one right after the
// one before. The pages up to it may have another website between them: the
// trail outlives a visit elsewhere in the same tab.
export const NAV_LOADED_KEY = 'nav_history_loaded';

// Plenty for going back and forth; older pages drop off the front.
export const MAX_PAGES = 50;

/** The trail after arriving at `path`: one page shorter if it's the page
 * before the current one (going back, with the browser's button or one of
 * ours), unchanged if it's the current page again (a refresh), otherwise one
 * page longer. */
export function recordVisit(trail: string[], path: string): string[] {
  if (trail[trail.length - 1] === path) return trail;
  if (trail.length >= 2 && trail[trail.length - 2] === path) return trail.slice(0, -1);
  return [...trail, path].slice(-MAX_PAGES);
}

/** The page before the current one, or null when this is the first page of
 * the website opened in the tab. */
export function previousPage(trail: string[]): string | null {
  return trail.length >= 2 ? trail[trail.length - 2] : null;
}

/** The stored trail, or an empty one if it's missing or not a list of paths. */
export function parseTrail(raw: string | null): string[] {
  try {
    const value: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(value) && value.every((page) => typeof page === 'string') ? value : [];
  } catch {
    return [];
  }
}

/** The trail's length at the last page load, from NAV_LOADED_KEY, or
 * Infinity if it's missing or damaged, so the back button never trusts the
 * browser's history without it. */
export function parseLoadMark(raw: string | null): number {
  const mark = Number(raw ?? NaN);
  return Number.isInteger(mark) && mark >= 0 ? mark : Infinity;
}

/** The load mark after arriving at a page: the new trail's length on the
 * first page since the page loaded, otherwise the mark, lowered if the trail
 * is now shorter than it. */
export function nextLoadMark(mark: number, trail: string[], firstSinceLoad: boolean): number {
  return firstSinceLoad ? trail.length : Math.min(mark, trail.length);
}

/** How the back button gets to the page before this one (SRS-108.7): with the
 * browser's Back when that page is the one before this in the browser's
 * history, which is certain only for a page reached inside the website since
 * the page loaded; otherwise by going to it, since the browser's previous page
 * may be another website. Home when there's no page before. */
export function backStep(trail: string[], loadMark: number): { by: 'history' } | { by: 'link'; path: string } {
  const previous = previousPage(trail);
  if (!previous) return { by: 'link', path: '/' };
  return trail.length > loadMark ? { by: 'history' } : { by: 'link', path: previous };
}
