'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { NAV_HISTORY_KEY, parseTrail, recordVisit } from '../lib/navHistory';

// Records each page of the website visited in this tab (SRS-108.7), so the
// back buttons (BackToHome) know whether there's an earlier page to return to.
// Rendered once, by app/layout.tsx; it draws nothing.
export default function NavigationTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    try {
      const trail = parseTrail(sessionStorage.getItem(NAV_HISTORY_KEY));
      sessionStorage.setItem(NAV_HISTORY_KEY, JSON.stringify(recordVisit(trail, pathname)));
    } catch {
      // Storage blocked (a private window, say): the back buttons just go home.
    }
  }, [pathname]);

  return null;
}
