'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { NAV_HISTORY_KEY, NAV_LOADED_KEY, nextLoadMark, parseLoadMark, parseTrail, recordVisit } from '../lib/navHistory';

// Whether a page has been recorded since this page loaded. A module's
// variables start over on every page load, and only then.
let recordedSinceLoad = false;

// Records each page of the website visited in this tab (SRS-108.7), so the
// back buttons (BackToHome) know whether there's an earlier page to return to,
// and how long the trail was when the page loaded (NAV_LOADED_KEY), so they
// know whether the browser's Back would get there or might leave the site.
// Rendered once, by app/layout.tsx; it draws nothing.
export default function NavigationTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    try {
      const trail = recordVisit(parseTrail(sessionStorage.getItem(NAV_HISTORY_KEY)), pathname);
      const mark = nextLoadMark(parseLoadMark(sessionStorage.getItem(NAV_LOADED_KEY)), trail, !recordedSinceLoad);
      recordedSinceLoad = true;
      sessionStorage.setItem(NAV_HISTORY_KEY, JSON.stringify(trail));
      sessionStorage.setItem(NAV_LOADED_KEY, String(mark));
    } catch {
      // Storage blocked (a private window, say): the back buttons just go home.
    }
  }, [pathname]);

  return null;
}
