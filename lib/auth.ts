// Password hashing, session tokens, and the registration field validators
// that mirror the CHECK constraints in supabase/schema.sql. Centralizing
// them here keeps the API routes and the schema's rules from drifting apart
// again the way the old Supabase-Auth-based routes did.
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

// SRS-NFR (password storage): bcrypt with a minimum cost factor of 10.
const BCRYPT_COST_FACTOR = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST_FACTOR);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
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

// SRS-101.2: first/last names allow letters, spaces, apostrophes, and
// hyphens, matching chk_players_first_name / chk_players_last_name.
const NAME_PATTERN = /^[A-Za-z][A-Za-z' -]*$/;

// SRS-101.3 / SRS-101.4: usernames are 6-10 characters, letters and numbers
// only, matching the CHECK on usernames.username.
const USERNAME_PATTERN = /^[A-Za-z0-9]{6,10}$/;

// SRS-101.7: passwords are at least 8 characters, letters and numbers only,
// with at least one of each.
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9]{8,}$/;

export function isValidName(value: string): boolean {
  return NAME_PATTERN.test(value);
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
// authoritative check.
export function isAtLeast21(birthday: string): boolean {
  const birthDate = new Date(birthday);
  if (Number.isNaN(birthDate.getTime())) return false;

  const today = new Date();
  const cutoff = new Date(today.getFullYear() - 21, today.getMonth(), today.getDate());
  return birthDate <= cutoff;
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
