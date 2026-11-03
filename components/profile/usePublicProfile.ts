'use client';

import { useEffect, useState } from 'react';
import type { PublicProfile } from '../../app/api/players/[playerId]/profile/route';

export type PublicProfileStatus = 'loading' | 'ready' | 'not-found' | 'error';

// Another player's public profile (UR-121), from the public route that only
// ever returns the fields cleared for public viewing (SRS-NFR-106). Shared by
// the profile page and the window over the poker table (SRS-121.14).
export function usePublicProfile(playerId: string) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [status, setStatus] = useState<PublicProfileStatus>('loading');

  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    setStatus('loading');
    (async () => {
      try {
        const res = await fetch(`/api/players/${encodeURIComponent(playerId)}/profile`);
        if (cancelled) return;
        if (res.status === 404 || res.status === 400) {
          setStatus('not-found');
          return;
        }
        if (!res.ok) {
          setStatus('error');
          return;
        }
        setProfile(await res.json());
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  return { profile, status };
}
