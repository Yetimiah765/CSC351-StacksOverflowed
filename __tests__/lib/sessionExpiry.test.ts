import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPlayerIdForToken } from '../../lib/auth';
import { SESSION_HOURS, SESSION_MS, sessionAction, sessionExpired } from '../../lib/session';

const HOUR = 60 * 60 * 1000;

// A stand-in for the one query getPlayerIdForToken makes.
function sessionsWith(row: { player_id: number; created_at?: string } | null) {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: row, error: null }) };
  return { from: () => query } as unknown as SupabaseClient;
}

describe('session expiry (SRS-105.7)', () => {
  it('lasts 3 hours', () => {
    expect(SESSION_HOURS).toBe(3);
    expect(SESSION_MS).toBe(3 * HOUR);
  });

  it('is over 3 hours after it started, not before', () => {
    const started = Date.parse('2026-11-21T12:00:00Z');
    expect(sessionExpired(started, started + 3 * HOUR - 1)).toBe(false);
    expect(sessionExpired(started, started + 3 * HOUR)).toBe(true);
    expect(sessionExpired('2026-11-21T12:00:00+00:00', started + 5 * HOUR)).toBe(true);
  });

  it('is refused by the server once over (every logged-in route checks this way)', async () => {
    const fresh = new Date(Date.now() - 2 * HOUR).toISOString();
    const stale = new Date(Date.now() - 3 * HOUR - 1000).toISOString();
    expect(await getPlayerIdForToken(sessionsWith({ player_id: 7, created_at: fresh }), 'token')).toBe(7);
    expect(await getPlayerIdForToken(sessionsWith({ player_id: 7, created_at: stale }), 'token')).toBeNull();
    expect(await getPlayerIdForToken(sessionsWith(null), 'token')).toBeNull();
  });

  it('tells each tab to sign the player out once the login has ended', () => {
    const ends = '2026-11-21T15:00:00.000Z';
    const at = (iso: string) => Date.parse(iso);
    expect(sessionAction('tok', ends, at('2026-11-21T14:59:59Z'))).toBe('wait');
    expect(sessionAction('tok', ends, at('2026-11-21T15:00:00Z'))).toBe('sign-out');
    // Nothing to do for a guest, or a login with no known end.
    expect(sessionAction(null, ends, at('2026-11-21T16:00:00Z'))).toBe('none');
    expect(sessionAction('tok', null, at('2026-11-21T16:00:00Z'))).toBe('none');
    expect(sessionAction('tok', 'garbage', at('2026-11-21T16:00:00Z'))).toBe('none');
  });
});
