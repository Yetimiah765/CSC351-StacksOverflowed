'use client';

import { useEffect, useState } from 'react';

/**
 * Whether a player is signed in (has a `player_token`), for the home page's
 * links: null until checked on the client, since localStorage isn't
 * available during server rendering.
 */
export function useSignedIn(): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    setSignedIn(Boolean(localStorage.getItem('player_token')));
  }, []);

  return signedIn;
}

/** SRS-108.2/108.3: logged-in players go to the game; guests go to log in. */
export function playHref(signedIn: boolean | null, href: string): string {
  return signedIn ? href : '/login';
}
