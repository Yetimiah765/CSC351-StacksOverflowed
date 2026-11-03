// The pages of the website visited in this browser tab, oldest first, so a
// back button knows whether there's an earlier page of ours to return to
// (SRS-108.7). NavigationTracker keeps it in sessionStorage under
// NAV_HISTORY_KEY; the rules are pure here, so they're unit-tested.

export const NAV_HISTORY_KEY = 'nav_history';

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
