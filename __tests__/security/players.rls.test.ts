/**
 * RLS attack tests for the players table ("RLS, JO, Secure the players table").
 *
 * `players` holds every account's password hash, balance, name and birthday;
 * its owner column is player_id. The rules (supabase/rls-players.sql): a
 * logged-in player may read, create, change and delete only the row whose
 * player_id is their auth.uid(); a visitor gets nothing.
 *
 * Alice and Bob are both players the tests create, and Bob is also logged in
 * through Supabase Auth, so every attack is one player going after another's
 * row. Each test asserts the secure outcome, so it FAILS while the attack
 * works, and its message says what got through.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  TARGET,
  type TestUser,
  adminClient,
  anonClient,
  clientSignedInAs,
  createAuthUser,
  newRunId,
  requireCredentials,
} from './rls-suite';

const TABLE = 'players';

// Shaped like bcrypt hashes, but they match no password.
const ALICE_HASH = `$2a$10$${'A'.repeat(53)}`;
const BOB_HASH = `$2a$10$${'B'.repeat(53)}`;
const STARTING_BALANCE = 1000;

describe(`RLS on ${TABLE} (${TARGET})`, () => {
  const runId = newRunId();
  // Every row these tests make, Alice's and any Bob manages to forge, carries
  // this bio, so afterAll can find and delete them all.
  const marker = `RLS test ${runId}`;

  let admin: SupabaseClient;
  let bob: TestUser;
  let asBob: SupabaseClient;
  let aliceId: number;

  async function aliceAsAdmin() {
    const { data } = await admin.from(TABLE).select('balance, password_hash').eq('player_id', aliceId).maybeSingle();
    return data;
  }

  async function seedPlayer(firstName: string, passwordHash: string): Promise<number> {
    const { data, error } = await admin
      .from(TABLE)
      .insert({
        first_name: firstName,
        last_name: 'Tester',
        birthday: '1990-01-15',
        password_hash: passwordHash,
        balance: STARTING_BALANCE,
        bio: marker,
      })
      .select('player_id')
      .single();
    if (error || !data) throw new Error(`Could not seed ${TABLE}: ${error?.message}. Has supabase/schema.sql been run?`);
    return data.player_id;
  }

  beforeAll(async () => {
    requireCredentials();
    admin = adminClient();

    aliceId = await seedPlayer('Alice', ALICE_HASH);
    await seedPlayer('Bob', BOB_HASH);

    bob = await createAuthUser(admin, 'bob', runId);
    asBob = await clientSignedInAs(bob);
  });

  afterAll(async () => {
    // Deleting a player cascades to every row that references it.
    if (admin) await admin.from(TABLE).delete().eq('bio', marker);
    if (bob) await admin.auth.admin.deleteUser(bob.id);
  });

  it("a visitor who is not logged in cannot read Alice's row", async () => {
    const { data } = await anonClient()
      .from(TABLE)
      .select('player_id, first_name, birthday, balance, password_hash')
      .eq('player_id', aliceId);

    expect(
      data ?? [],
      `LEAK: someone who isn't logged in, holding only the public anon key, read Alice's row, ` +
        `password hash included: ${JSON.stringify(data?.[0])}`,
    ).toHaveLength(0);
  });

  it("a visitor who is not logged in cannot change Alice's balance", async () => {
    await anonClient().from(TABLE).update({ balance: 1_000_000 }).eq('player_id', aliceId);

    expect(
      (await aliceAsAdmin())?.balance,
      `TAMPERING: someone who isn't logged in set Alice's balance to 1,000,000 coins.`,
    ).toBe(STARTING_BALANCE);
  });

  it("Bob cannot read Alice's row", async () => {
    const { data } = await asBob.from(TABLE).select('*').eq('player_id', aliceId);

    expect(data ?? [], `LEAK: Bob read Alice's row in ${TABLE}: ${JSON.stringify(data?.[0])}`).toHaveLength(0);
  });

  it("Bob cannot take over Alice's account by replacing her password hash", async () => {
    await asBob.from(TABLE).update({ password_hash: BOB_HASH }).eq('player_id', aliceId);

    expect(
      (await aliceAsAdmin())?.password_hash,
      `TAKEOVER: Bob replaced Alice's password hash with his own, so he could log in as her.`,
    ).toBe(ALICE_HASH);
  });

  it('Bob cannot create a player account', async () => {
    await asBob.from(TABLE).insert({
      first_name: 'Forged',
      last_name: 'Account',
      birthday: '1990-01-15',
      password_hash: BOB_HASH,
      balance: 1_000_000,
      bio: marker,
    });

    const { data: forged } = await admin.from(TABLE).select('player_id').eq('bio', marker).eq('first_name', 'Forged');
    expect(
      forged ?? [],
      `FORGERY: Bob created a player account with 1,000,000 coins, skipping sign-up.`,
    ).toHaveLength(0);
  });

  // Runs last because, while the table is open, it really deletes Alice's row.
  it("Bob cannot delete Alice's account", async () => {
    await asBob.from(TABLE).delete().eq('player_id', aliceId);

    expect(await aliceAsAdmin(), `DESTRUCTION: Bob deleted Alice's account in ${TABLE}.`).not.toBeNull();
  });
});
