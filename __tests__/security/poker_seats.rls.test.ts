/**
 * Row Level Security attack tests for poker_seats, adapted from the starter
 * repo's rls-suite.ts (github.com/brockenbrough/security-starter-rls-v1).
 *
 * These talk to the REAL Supabase project in .env.local / .env (nothing is
 * mocked) and attack the way a browser could: with only the public anon key,
 * logged in as nobody or as another player. The service-role client is used
 * only to set up test data and to look at what is really in the table.
 *
 * Each test asserts what SHOULD happen, so while poker_seats is open (see
 * supabase/rls-poker-seats-reset.sql) they FAIL, and each failure says what
 * leaked. After supabase/rls-poker-seats.sql they PASS.
 *
 * The tests make their own poker table, players and Supabase Auth users and
 * delete them all at the end; the lobby's real tables are never touched.
 *
 * Run with:  npm run test:security
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: ['.env.local', '.env'], quiet: true });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const TABLE = 'poker_seats';
const PASSWORD = 'Rls-Demo-Password-123!';
const STACK = 1000; // a legal buy-in at the test table (50x - 200x its big blind of 10)

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

/** A player in `players` with a Supabase Auth login linked to them. */
type TestPlayer = { name: string; email: string; authId: string; playerId: number };

/** Client with only the public anon key, logged in as nobody. */
function anonClient() {
  return createClient(SUPABASE_URL, ANON_KEY, noSession);
}

/** Client with the public anon key, logged in as `player` (what their browser would have). */
async function clientSignedInAs(player: TestPlayer) {
  const { data, error } = await anonClient().auth.signInWithPassword({
    email: player.email,
    password: PASSWORD,
  });
  if (error || !data.session) throw new Error(`Could not sign in ${player.name}: ${error?.message}`);
  return createClient(SUPABASE_URL, ANON_KEY, {
    ...noSession,
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
}

const runId = Math.random().toString(36).slice(2, 8);

// The admin client (service role) BYPASSES RLS. Setup and checking only.
let admin: SupabaseClient;
let tableId: number;
let alice: TestPlayer; // the victim, seated
let bob: TestPlayer; // the attacker, seated
let carol: TestPlayer; // not seated
const created: TestPlayer[] = [];

async function createPlayer(name: string): Promise<TestPlayer> {
  const email = `rls-poker-seats-${name.toLowerCase()}-${runId}@example.com`;
  const { data: auth, error: authError } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (authError || !auth.user) throw new Error(`Could not create auth user ${name}: ${authError?.message}`);

  const { data: row, error: playerError } = await admin
    .from('players')
    // 'not-a-bcrypt-hash' can never match a password, so nobody can log in to it.
    .insert({ first_name: 'Rls', last_name: name, birthday: '1990-01-01', password_hash: 'not-a-bcrypt-hash' })
    .select('player_id')
    .single();
  if (playerError || !row) {
    await admin.auth.admin.deleteUser(auth.user.id);
    throw new Error(`Could not create player ${name}: ${playerError?.message}`);
  }

  const player = { name, email, authId: auth.user.id, playerId: row.player_id as number };
  created.push(player);

  // The link exists only once supabase/rls-poker-seats.sql has been run. Before
  // that the table is wide open anyway, so the tests don't need it.
  const { error: linkError } = await admin
    .from('player_auth_links')
    .insert({ auth_user_id: player.authId, player_id: player.playerId });
  if (linkError && !/player_auth_links/.test(linkError.message)) {
    throw new Error(`Could not link ${name}: ${linkError.message}`);
  }
  return player;
}

/** What is really in the table for `player` at the test table. */
async function seatAsAdmin(player: TestPlayer) {
  const { data } = await admin
    .from(TABLE)
    .select('*')
    .eq('table_id', tableId)
    .eq('player_id', player.playerId)
    .maybeSingle();
  return data;
}

describe(`RLS on "${TABLE}": players must not be able to read or touch each other's seats`, () => {
  beforeAll(async () => {
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
      throw new Error(
        'Missing Supabase credentials. Set SUPABASE_URL, SUPABASE_ANON_KEY and ' +
          'SUPABASE_SERVICE_ROLE_KEY in .env.local (see .env.example).',
      );
    }
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, noSession);

    // A table of its own, so the poker server's lobby tables are never touched
    // (the server only loads the table_keys in lib/pokerTables.ts).
    const { data: table, error: tableError } = await admin
      .from('poker_tables')
      .insert({ table_name: `RLS test ${runId}`, table_key: `rls-${runId}`, max_seats: 6, small_blind: 5, big_blind: 10 })
      .select('table_id')
      .single();
    if (tableError || !table) throw new Error(`Could not create the test poker table: ${tableError?.message}`);
    tableId = table.table_id as number;

    alice = await createPlayer('Alice');
    bob = await createPlayer('Bob');
    carol = await createPlayer('Carol');

    const { error } = await admin.from(TABLE).insert([
      { table_id: tableId, seat_number: 1, player_id: alice.playerId, chip_stack: STACK },
      { table_id: tableId, seat_number: 2, player_id: bob.playerId, chip_stack: STACK },
    ]);
    if (error) throw new Error(`Could not seed ${TABLE}: ${error.message}`);
  });

  afterAll(async () => {
    // Deleting a player removes their seats and link; deleting the auth user its link too.
    for (const player of created) {
      await admin.from('players').delete().eq('player_id', player.playerId);
      await admin.auth.admin.deleteUser(player.authId);
    }
    if (tableId) await admin.from('poker_tables').delete().eq('table_id', tableId);
  });

  it('an anonymous visitor (not logged in) cannot list seats', async () => {
    const { data } = await anonClient().from(TABLE).select('*').eq('table_id', tableId);

    expect(
      data ?? [],
      `LEAK: someone who isn't logged in, holding only the public anon key, read ` +
        `${data?.length} seat row(s) from ${TABLE}.`,
    ).toHaveLength(0);
  });

  it("Bob cannot read Alice's seat", async () => {
    const asBob = await clientSignedInAs(bob);
    const { data } = await asBob.from(TABLE).select('*').eq('player_id', alice.playerId);

    expect(data ?? [], `LEAK: Bob read Alice's row in ${TABLE}: ${JSON.stringify(data?.[0])}`).toHaveLength(0);
  });

  it("Bob cannot change Alice's chip stack", async () => {
    const asBob = await clientSignedInAs(bob);
    await asBob.from(TABLE).update({ chip_stack: 1 }).eq('player_id', alice.playerId);

    const after = await seatAsAdmin(alice);
    expect(Number(after?.chip_stack), `TAMPERING: Bob changed Alice's chip stack in ${TABLE}.`).toBe(STACK);
  });

  it('Alice cannot give herself more chips', async () => {
    const asAlice = await clientSignedInAs(alice);
    await asAlice.from(TABLE).update({ chip_stack: STACK * 2 }).eq('player_id', alice.playerId);

    const after = await seatAsAdmin(alice);
    expect(
      Number(after?.chip_stack),
      `FREE CHIPS: Alice raised her own chip stack in ${TABLE} without paying for it.`,
    ).toBe(STACK);
  });

  it('Bob cannot seat another player (Carol) at a table', async () => {
    const asBob = await clientSignedInAs(bob);
    await asBob.from(TABLE).insert({ table_id: tableId, seat_number: 3, player_id: carol.playerId, chip_stack: STACK });

    const carolSeat = await seatAsAdmin(carol);
    expect(carolSeat, `IMPERSONATION: Bob created a row in ${TABLE} for Carol.`).toBeNull();
  });

  it('Alice can still read her own seat', async () => {
    const asAlice = await clientSignedInAs(alice);
    const { data } = await asAlice.from(TABLE).select('player_id, chip_stack').eq('table_id', tableId);

    expect(
      (data ?? []).map((row) => row.player_id),
      `Alice should see exactly her own seat in ${TABLE}.`,
    ).toEqual([alice.playerId]);
  });

  // Runs last because, while the table is open, it really deletes Alice's seat.
  it("Bob cannot delete Alice's seat", async () => {
    const asBob = await clientSignedInAs(bob);
    await asBob.from(TABLE).delete().eq('player_id', alice.playerId);

    const after = await seatAsAdmin(alice);
    expect(after, `DESTRUCTION: Bob deleted Alice's row in ${TABLE}.`).not.toBeNull();
  });
});
