// How long a login lasts (SRS-105.7), shared by the server, which refuses an
// older session, and the browser, which signs the player out in every open
// tab when it ends. Kept free of Node-only imports.

export const SESSION_HOURS = 3;
export const SESSION_MS = SESSION_HOURS * 60 * 60 * 1000;

// localStorage: when this browser's login ends (an ISO time, from login).
export const SESSION_EXPIRES_KEY = 'player_token_expires_at';
// sessionStorage: set when a login has just expired, so the login form can say so.
export const SESSION_EXPIRED_KEY = 'session-expired';

/** Whether a session that started at `startedAt` has run out. */
export function sessionExpired(startedAt: string | number | Date, now: number = Date.now()): boolean {
  const started = new Date(startedAt).getTime();
  return Number.isFinite(started) && now - started >= SESSION_MS;
}

/** What a tab should do about its login now: nothing (no login, or no known
 * end), keep waiting, or sign the player out because it has ended. */
export function sessionAction(token: string | null, expiresAt: string | null, now: number = Date.now()): 'none' | 'wait' | 'sign-out' {
  if (!token || !expiresAt) return 'none';
  const ends = Date.parse(expiresAt);
  if (!Number.isFinite(ends)) return 'none';
  return now >= ends ? 'sign-out' : 'wait';
}
