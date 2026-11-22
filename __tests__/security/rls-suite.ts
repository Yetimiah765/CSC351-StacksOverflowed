/**
 * Shared setup for the Row Level Security (RLS) attack tests, adapted from
 * the class starter (brockenbrough/security-starter-rls-v1). Each
 * `<table>.rls.test.ts` file in this folder attacks one table with it.
 *
 * These tests talk to a REAL Supabase project (nothing is mocked). They act
 * the way an attacker would: with only the public anon key, the same key
 * every browser gets, they try to read and change rows they have no right to.
 * Each test asserts what SHOULD happen, so it FAILS while the attack works.
 *
 * Run with:  npm run test:security
 * By default they attack the project in .env.local / .env. To attack another
 * project (e.g. a throwaway copy built from supabase/schema.sql), put its
 * SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in a file and
 * name it in RLS_ENV_FILE:  RLS_ENV_FILE=.env.rls-copy npm run test:security
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// --- Load credentials (real values, not mocks) --------------------------------
// With RLS_ENV_FILE only that file is read, so a copy's URL is never mixed
// with the team project's keys.
const envFiles = process.env.RLS_ENV_FILE ? [process.env.RLS_ENV_FILE] : ['.env.local', '.env'];
for (const file of envFiles) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/** The project under attack, shown in each suite's title (e.g. "abcd.supabase.co"). */
export const TARGET = SUPABASE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '') || '(no project set)';

const PASSWORD = 'Rls-Demo-Password-123!';

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

export type TestUser = { id: string; email: string };

/** Which Postgres role a Supabase key acts as: 'anon', 'service_role', ... */
function keyRole(key: string): string | undefined {
  if (key.startsWith('sb_publishable_')) return 'anon';
  if (key.startsWith('sb_secret_')) return 'service_role';
  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role;
  } catch {
    return undefined;
  }
}

/** Call first in beforeAll: stops the run unless the attacks really use the anon key. */
export function requireCredentials() {
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    throw new Error(
      `Missing Supabase credentials in ${envFiles.join(' / ')}. Set SUPABASE_URL, ` +
        'SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.',
    );
  }
  // The service-role key bypasses RLS, so attacks made with it prove nothing.
  if (keyRole(ANON_KEY) !== 'anon') {
    throw new Error(`SUPABASE_ANON_KEY is a "${keyRole(ANON_KEY)}" key. The attacks must use the anon key.`);
  }
}

/** Client with only the public anon key, logged in as nobody. */
export function anonClient() {
  return createClient(SUPABASE_URL, ANON_KEY, noSession);
}

/**
 * The service-role client BYPASSES RLS. Tests use it only to set up rows and
 * to check what is really in the table, never to attack.
 */
export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, noSession);
}

/** Creates a Supabase Auth user, so the tests can attack as someone logged in. */
export async function createAuthUser(admin: SupabaseClient, name: string, runId: string): Promise<TestUser> {
  const email = `rls-test-${name}-${runId}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw new Error(`Could not create ${name}: ${error?.message}`);
  return { id: data.user.id, email };
}

/** Client with the public anon key, logged in as `user` (what their browser would have). */
export async function clientSignedInAs(user: TestUser) {
  const { data, error } = await anonClient().auth.signInWithPassword({ email: user.email, password: PASSWORD });
  if (error || !data.session) throw new Error(`Could not sign in ${user.email}: ${error?.message}`);
  return createClient(SUPABASE_URL, ANON_KEY, {
    ...noSession,
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
}

/** A short random id, so test rows and users from different runs never clash. */
export function newRunId() {
  return Math.random().toString(36).slice(2, 8);
}
