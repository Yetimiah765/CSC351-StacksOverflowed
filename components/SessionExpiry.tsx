'use client';

import { useEffect } from 'react';
import { SESSION_EXPIRED_KEY, SESSION_EXPIRES_KEY, sessionAction } from '../lib/session';

// How often each tab looks at the clock. A timer set for the exact end could
// be held back in a background tab, so the tab checks every so often, and
// again when it comes back into view.
const CHECK_MS = 15_000;

// SRS-105.7: a login lasts 3 hours. When it ends, every open tab of the site
// forgets the token and goes to the login form, which says the login has
// expired (SESSION_EXPIRED_KEY). The server refuses the old token anyway
// (getPlayerIdForToken). Rendered once, by app/layout.tsx; it draws nothing.
export default function SessionExpiry() {
  useEffect(() => {
    let signedOut = false;
    const check = () => {
      if (signedOut) return;
      let action: ReturnType<typeof sessionAction> = 'none';
      try {
        action = sessionAction(localStorage.getItem('player_token'), localStorage.getItem(SESSION_EXPIRES_KEY));
      } catch {
        return; // Storage blocked: the server still refuses an old token.
      }
      if (action !== 'sign-out') return;
      signedOut = true;
      try {
        localStorage.removeItem('player_token');
        localStorage.removeItem(SESSION_EXPIRES_KEY);
        sessionStorage.setItem(SESSION_EXPIRED_KEY, '1');
      } catch {
        // Nothing more to clear.
      }
      window.location.assign('/login');
    };

    check();
    const timer = window.setInterval(check, CHECK_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('storage', check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('storage', check);
    };
  }, []);

  return null;
}
