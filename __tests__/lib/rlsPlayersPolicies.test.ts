import { readFileSync } from 'fs';
import { join } from 'path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// "RLS, JO, Secure the players table": checks supabase/rls-players.sql on a
// real Postgres engine (PGlite, in memory), so it needs no Supabase project
// and touches no shared data. The script's policies decide which rows a
// caller may touch, and its column permissions which parts of a row.
//
// The policies compare auth.uid() with player_id, assuming player_id holds
// the player's Supabase Auth user id. So this test builds the players table
// from supabase/schema.sql with player_id as a uuid, and copies the parts of
// Supabase the script relies on: the anon and authenticated roles, the table
// permissions Supabase gives them, and auth.uid(), which reads the caller's
// token.

const SUPABASE = join(__dirname, '../../supabase');

const ALICE = '00000000-0000-0000-0000-00000000000a';
const BOB = '00000000-0000-0000-0000-00000000000b';
const CAROL = '00000000-0000-0000-0000-00000000000c';

function playersTable(): string {
  const schema = readFileSync(join(SUPABASE, 'schema.sql'), 'utf8');
  const table = schema.match(/CREATE TABLE players \([\s\S]*?\n\);/)?.[0];
  if (!table) throw new Error('No CREATE TABLE players in schema.sql');
  const withUuid = table.replace(/player_id\s+SERIAL\s+PRIMARY KEY/, 'player_id UUID PRIMARY KEY');
  if (withUuid === table) throw new Error('players.player_id is no longer SERIAL PRIMARY KEY; update this test');
  return withUuid;
}

let db: PGlite;

/** Runs `sql` as a logged-in player whose auth.uid() is `uid`. */
function asPlayer(uid: string, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.exec('SET LOCAL ROLE authenticated');
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    return tx.query(sql, params);
  });
}

/** Runs `sql` as a visitor who is not logged in (only the anon key). */
function asVisitor(sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.exec('SET LOCAL ROLE anon');
    return tx.query(sql, params);
  });
}

/** What is really in the table (the test's own superuser bypasses RLS). */
async function rowAsAdmin(id: string) {
  const { rows } = await db.query<{ bio: string | null; balance: number; password_hash: string; account_status: string }>(
    'SELECT bio, balance, password_hash, account_status FROM players WHERE player_id = $1',
    [id],
  );
  return rows[0];
}

const INSERT_PLAYER = `
  INSERT INTO players (player_id, first_name, last_name, birthday, password_hash)
  VALUES ($1, 'Carol', 'Tester', '1990-01-15', 'not-a-real-hash')`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated;
    -- Supabase's auth.uid(): the "sub" claim of the caller's token, or NULL.
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
      )::uuid
    $$;
  `);
  await db.exec(playersTable());
  // What Supabase grants both roles on a new table, before the script narrows it.
  await db.exec('GRANT SELECT, INSERT, UPDATE, DELETE ON players TO anon, authenticated;');
  await db.exec(readFileSync(join(SUPABASE, 'rls-players.sql'), 'utf8'));
});

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec(`
    TRUNCATE players;
    INSERT INTO players (player_id, first_name, last_name, birthday, password_hash, balance, bio) VALUES
      ('${ALICE}', 'Alice', 'Tester', '1990-01-15', 'alice-hash', 1000, 'Alice''s bio'),
      ('${BOB}',   'Bob',   'Tester', '1990-01-15', 'bob-hash',   1000, 'Bob''s bio');
  `);
});

/** A script's statements, without comments, whitespace collapsed. */
function statements(sql: string): string[] {
  return sql
    .replace(/--.*$/gm, '')
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

describe('RLS on players (supabase/rls-players.sql)', () => {
  it('is built into schema.sql too, so a fresh database starts secure', () => {
    const schema = statements(readFileSync(join(SUPABASE, 'schema.sql'), 'utf8'));
    // DROP POLICY IF EXISTS only makes the script re-runnable; schema.sql
    // recreates the table, so it has no old policies to drop.
    const missing = statements(readFileSync(join(SUPABASE, 'rls-players.sql'), 'utf8'))
      .filter((statement) => !statement.startsWith('DROP POLICY IF EXISTS'))
      .filter((statement) => !schema.includes(statement));
    expect(missing).toEqual([]);
  });

  it('turns RLS on, with one policy per operation, all for logged-in players', async () => {
    const { rows: rls } = await db.query<{ relrowsecurity: boolean }>(
      "SELECT relrowsecurity FROM pg_class WHERE relname = 'players'",
    );
    expect(rls[0].relrowsecurity).toBe(true);

    const { rows: policies } = await db.query<{ cmd: string; roles: string; qual: string | null; with_check: string | null }>(
      "SELECT cmd, roles::text, qual, with_check FROM pg_policies WHERE tablename = 'players' ORDER BY cmd",
    );
    expect(policies.map((policy) => policy.cmd)).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
    expect(policies.every((policy) => policy.roles === '{authenticated}')).toBe(true);
    const update = policies.find((policy) => policy.cmd === 'UPDATE')!;
    expect(update.qual).toContain('auth.uid()');
    expect(update.with_check).toContain('auth.uid()');
  });

  describe('SELECT', () => {
    it('a player can read their own row', async () => {
      const { rows } = await asPlayer(ALICE, 'SELECT first_name, balance FROM players WHERE player_id = $1', [ALICE]);
      expect(rows).toEqual([{ first_name: 'Alice', balance: 1000 }]);
    });

    it("a player cannot read another player's row", async () => {
      const { rows } = await asPlayer(BOB, 'SELECT first_name, balance FROM players WHERE player_id = $1', [ALICE]);
      expect(rows).toEqual([]);
    });

    it('a player cannot read their own password hash', async () => {
      await expect(
        asPlayer(ALICE, 'SELECT password_hash FROM players WHERE player_id = $1', [ALICE]),
      ).rejects.toThrow(/permission denied/);
    });

    it('a visitor who is not logged in cannot read any row', async () => {
      await expect(asVisitor('SELECT first_name FROM players')).rejects.toThrow(/permission denied/);
    });
  });

  describe('INSERT (accounts are created only by sign-up on the server)', () => {
    it('a player cannot create a row, even with their own id', async () => {
      await expect(asPlayer(CAROL, INSERT_PLAYER, [CAROL])).rejects.toThrow(/permission denied/);
      expect(await rowAsAdmin(CAROL)).toBeUndefined();
    });

    it('a player cannot create a row for someone else', async () => {
      await expect(asPlayer(BOB, INSERT_PLAYER, [CAROL])).rejects.toThrow(/permission denied/);
      expect(await rowAsAdmin(CAROL)).toBeUndefined();
    });

    it('a visitor who is not logged in cannot create a row', async () => {
      await expect(asVisitor(INSERT_PLAYER, [CAROL])).rejects.toThrow(/permission denied/);
      expect(await rowAsAdmin(CAROL)).toBeUndefined();
    });
  });

  describe('UPDATE', () => {
    it('a player can change their own name, bio and photo', async () => {
      const { affectedRows } = await asPlayer(
        ALICE,
        "UPDATE players SET first_name = 'Alicia', bio = 'New bio', profile_photo = NULL WHERE player_id = $1",
        [ALICE],
      );
      expect(affectedRows).toBe(1);
      expect((await rowAsAdmin(ALICE)).bio).toBe('New bio');
    });

    it("a player cannot change another player's row", async () => {
      const { affectedRows } = await asPlayer(BOB, "UPDATE players SET bio = 'Hacked' WHERE player_id = $1", [ALICE]);
      expect(affectedRows).toBe(0);
      expect((await rowAsAdmin(ALICE)).bio).toBe("Alice's bio");
    });

    it('a player cannot change their own balance', async () => {
      await expect(
        asPlayer(ALICE, 'UPDATE players SET balance = 1000000 WHERE player_id = $1', [ALICE]),
      ).rejects.toThrow(/permission denied/);
      expect((await rowAsAdmin(ALICE)).balance).toBe(1000);
    });

    it('a player cannot change their own password hash', async () => {
      await expect(
        asPlayer(ALICE, "UPDATE players SET password_hash = 'known-hash' WHERE player_id = $1", [ALICE]),
      ).rejects.toThrow(/permission denied/);
      expect((await rowAsAdmin(ALICE)).password_hash).toBe('alice-hash');
    });

    it('a player cannot change their own account status', async () => {
      await expect(
        asPlayer(ALICE, "UPDATE players SET account_status = 'Pending Deletion' WHERE player_id = $1", [ALICE]),
      ).rejects.toThrow(/permission denied/);
      expect((await rowAsAdmin(ALICE)).account_status).toBe('Active');
    });

    it('a player cannot hand their row to someone else', async () => {
      await expect(
        asPlayer(ALICE, 'UPDATE players SET player_id = $1 WHERE player_id = $2', [CAROL, ALICE]),
      ).rejects.toThrow(/permission denied/);
      expect(await rowAsAdmin(ALICE)).toBeDefined();
    });

    it('a visitor who is not logged in cannot change any row', async () => {
      await expect(asVisitor("UPDATE players SET bio = 'Hacked'")).rejects.toThrow(/permission denied/);
      expect((await rowAsAdmin(ALICE)).bio).toBe("Alice's bio");
    });
  });

  describe('DELETE', () => {
    it("a player cannot delete another player's row", async () => {
      const { affectedRows } = await asPlayer(BOB, 'DELETE FROM players WHERE player_id = $1', [ALICE]);
      expect(affectedRows).toBe(0);
      expect(await rowAsAdmin(ALICE)).toBeDefined();
    });

    it('a player can delete their own row', async () => {
      const { affectedRows } = await asPlayer(ALICE, 'DELETE FROM players WHERE player_id = $1', [ALICE]);
      expect(affectedRows).toBe(1);
      expect(await rowAsAdmin(ALICE)).toBeUndefined();
    });

    it('a visitor who is not logged in cannot delete any row', async () => {
      const { affectedRows } = await asVisitor('DELETE FROM players');
      expect(affectedRows).toBe(0);
      expect(await rowAsAdmin(ALICE)).toBeDefined();
    });
  });
});
