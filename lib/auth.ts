// Password hashing, session tokens, and the registration field validators
// that mirror the CHECK constraints in supabase/schema.sql. Centralizing
// them here keeps the API routes and the schema's rules from drifting apart
// again the way the old Supabase-Auth-based routes did.
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

// SRS-NFR (password storage): bcrypt with a minimum cost factor of 10.
const BCRYPT_COST_FACTOR = 10;

// bcrypt reads only the first 72 bytes of what it's given, so a longer
// password would match any other with the same first 72 characters
// (SRS-104.4). So bcrypt is given the password's SHA-256 instead, which is
// always 44 characters, and every character of the password counts. Those
// hashes start with PREHASHED; older ones are plain bcrypt of the password.
const PREHASHED = 'sha256$';
const BCRYPT_MAX_BYTES = 72;

function sha256(password: string): string {
  return createHash('sha256').update(password, 'utf8').digest('base64');
}

export async function hashPassword(password: string): Promise<string> {
  return PREHASHED + (await bcrypt.hash(sha256(password), BCRYPT_COST_FACTOR));
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  if (passwordHash.startsWith(PREHASHED)) {
    return bcrypt.compare(sha256(password), passwordHash.slice(PREHASHED.length));
  }
  // An older hash covers only the first 72 bytes, so a password of 72 or more
  // can't be told apart from a different one that starts the same way.
  // Shorter ones were hashed in full, so they're checked exactly.
  if (Buffer.byteLength(password, 'utf8') >= BCRYPT_MAX_BYTES) return false;
  return bcrypt.compare(password, passwordHash);
}

// Session tokens are high-entropy random values, so a fast hash (not a slow
// password hash) is appropriate for looking them up in player_sessions.
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// SRS-101.2 / SRS-101.3: first/last names allow letters, spaces, apostrophes,
// and hyphens, matching chk_players_first_name / chk_players_last_name.
// Letters include accented ones, as in José, García, Zoë or Nguyễn: A-Z and
// a-z plus the Latin-1 Supplement letters (not × or ÷), Latin Extended-A and
// -B, and Latin Extended Additional.
const NAME_LETTERS = 'A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u024F\\u1E00-\\u1EFF';
const NAME_PATTERN = new RegExp(`^[${NAME_LETTERS}][${NAME_LETTERS}' -]*$`);

// players.first_name / last_name are VARCHAR(50).
export const NAME_MAX_LENGTH = 50;

// SRS-101.4 / SRS-101.5: usernames are 6-10 characters, letters and numbers
// only, matching the CHECK on usernames.username.
const USERNAME_PATTERN = /^[A-Za-z0-9]{6,10}$/;

// SRS-101.8: passwords are at least 8 characters, letters and numbers only,
// with at least one of each.
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9]{8,}$/;

// Shown when a password breaks PASSWORD_PATTERN, at registration and when
// changing it (SRS-113.3), so both always state the same rules.
export const PASSWORD_RULES_MESSAGE =
  'Passwords must be at least 8 characters, contain only letters and numbers, and include at least one letter and one number.';

export function isValidName(value: string): boolean {
  return NAME_PATTERN.test(value);
}

// A first or last name as typed, at registration (SRS-104.1) and on the
// profile (SRS-112.3), so both apply the same rules: trimmed, required, the
// allowed characters (SRS-101.2, SRS-101.3), and short enough for its column.
// Returns the trimmed name to store, or the error to show.
export function checkName(value: unknown, label: string): { name: string; error: null } | { error: string } {
  if (typeof value !== 'string' || !value.trim()) return { error: `${label} is required.` };
  // NFC: an accent typed as a separate mark (e + ´) becomes the one letter é.
  const name = value.trim().normalize('NFC');
  if (name.length > NAME_MAX_LENGTH) return { error: `${label} must be ${NAME_MAX_LENGTH} characters or fewer.` };
  if (!isValidName(name)) return { error: 'Names may only contain letters, spaces, apostrophes, and hyphens.' };
  return { name, error: null };
}

export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value);
}

export function isValidPassword(value: string): boolean {
  return PASSWORD_PATTERN.test(value);
}

// SRS-102.1: the player must be at least 21 years old. This is a friendly
// pre-check on the client-provided date; chk_players_minimum_age in the
// database (evaluated in America/New_York against created_at) is the
// authoritative check. So it counts from today's date in New York too, not
// the server's own (UTC on Vercel), or the two disagree for the hours each
// evening when the dates differ.
export function isAtLeast21(birthday: string, now: Date = new Date()): boolean {
  const birthDate = new Date(birthday);
  if (Number.isNaN(birthDate.getTime())) return false;

  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(now)
    .split('-')
    .map(Number);
  // The same day 21 years ago, or the month's last day if that year's month
  // is shorter (29 February), as Postgres's date - INTERVAL '21 years' does.
  const lastDay = new Date(Date.UTC(year - 21, month, 0)).getUTCDate();
  const cutoff = Date.UTC(year - 21, month - 1, Math.min(day, lastDay));
  return birthDate.getTime() <= cutoff;
}

/**
 * Resolves a bearer token to a player_id via player_sessions, or null if the
 * token is missing/expired/unknown. Used by every route that requires a
 * logged-in player (profile, avatar, and future player-scoped routes).
 */
export async function getPlayerIdForToken(
  supabase: SupabaseClient,
  token: string
): Promise<number | null> {
  const tokenHash = hashSessionToken(token);

  const { data, error } = await supabase
    .from('player_sessions')
    .select('player_id')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error || !data) return null;
  return data.player_id as number;
}

export function getBearerToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * The logged-in player's id from the request's bearer token, or a 401
 * response for the route to return.
 */
export async function requirePlayerId(
  request: Request,
  supabase: SupabaseClient
): Promise<{ playerId: number; errorResponse: null } | { playerId: null; errorResponse: Response }> {
  const token = getBearerToken(request);
  if (!token) return { playerId: null, errorResponse: Response.json({ error: 'Unauthorized' }, { status: 401 }) };

  const playerId = await getPlayerIdForToken(supabase, token);
  if (playerId === null) {
    return { playerId: null, errorResponse: Response.json({ error: 'Invalid or expired session.' }, { status: 401 }) };
  }
  return { playerId, errorResponse: null };
}
