import { readFileSync } from 'fs';
import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';

// A minimal stand-in for the Supabase/PostgREST query builder. Each table
// gets its own builder instance so a test can set up the result for
// whichever terminal call the route under test actually makes:
//   - `.maybeSingle()` / `.single()` resolve via their own configured result
//   - a bare `await` on `.insert()/.update()/.upsert()/.delete()` (no
//     `.select()` chained after it) resolves via the builder's default
//     result, through the `.then()` the builder implements itself.
function makeTableMock() {
  const builder: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    ilike: ReturnType<typeof vi.fn>;
    lte: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
    then: (onResolve: (value: unknown) => unknown, onReject?: (reason: unknown) => unknown) => Promise<unknown>;
    defaultResult: { data: unknown; error: unknown };
    maybeSingleResult: { data: unknown; error: unknown };
    singleResult: { data: unknown; error: unknown };
  } = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(builder.maybeSingleResult)),
    single: vi.fn(() => Promise.resolve(builder.singleResult)),
    then: (onResolve, onReject) => Promise.resolve(builder.defaultResult).then(onResolve, onReject),
    defaultResult: { data: null, error: null },
    maybeSingleResult: { data: null, error: null },
    singleResult: { data: null, error: null },
  };
  return builder;
}

const tables = {
  usernames: makeTableMock(),
  players: makeTableMock(),
  player_sessions: makeTableMock(),
};

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    from: vi.fn((table: keyof typeof tables) => tables[table]),
  })),
}));

import { getSupabaseClient } from '../../lib/supabase';
import { POST as registerPost } from '../../app/api/auth/register/route';
import { POST as loginPost } from '../../app/api/auth/login/route';

function resetTable(table: ReturnType<typeof makeTableMock>) {
  table.select.mockClear();
  table.eq.mockClear();
  table.ilike.mockClear();
  table.lte.mockClear();
  table.insert.mockClear();
  table.update.mockClear();
  table.upsert.mockClear();
  table.delete.mockClear();
  table.maybeSingle.mockClear();
  table.single.mockClear();
  table.defaultResult = { data: null, error: null };
  table.maybeSingleResult = { data: null, error: null };
  table.singleResult = { data: null, error: null };
}

function registerRequest(body: object) {
  return new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function loginRequest(body: object) {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validRegistration = {
  firstName: 'New',
  lastName: 'User',
  birthday: '1990-01-01',
  username: 'newuser123',
  password: 'secret123',
};

// Lets a registration through: the name is free and the new player row comes back.
function acceptRegistration() {
  tables.players.singleResult = {
    data: { player_id: 1, first_name: 'New', last_name: 'User', birthday: '1990-01-01', balance: 1000 },
    error: null,
  };
}

// The row the register route handed to players.insert().
function insertedPlayer() {
  return tables.players.insert.mock.calls[0][0] as Record<string, unknown>;
}

describe('Auth API routes', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn((table: keyof typeof tables) => tables[table]),
    } as never);
    resetTable(tables.usernames);
    resetTable(tables.players);
    resetTable(tables.player_sessions);
  });

  describe('register', () => {
    it('creates a new player and their current username (SRS-101.1)', async () => {
      tables.usernames.maybeSingleResult = { data: null, error: null }; // username not taken
      tables.players.singleResult = {
        data: { player_id: 1, first_name: 'New', last_name: 'User', birthday: '1990-01-01', balance: 1000 },
        error: null,
      };
      tables.usernames.defaultResult = { data: null, error: null }; // username insert succeeds

      const response = await registerPost(registerRequest(validRegistration));

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({
        player: {
          player_id: 1,
          first_name: 'New',
          last_name: 'User',
          birthday: '1990-01-01',
          balance: 1000,
          username: 'newuser123',
        },
      });
    });

    it('rejects a username that is already taken or reserved (SRS-101.6)', async () => {
      tables.usernames.maybeSingleResult = { data: { username_id: 5 }, error: null };

      const response = await registerPost(registerRequest(validRegistration));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'That username is already taken or reserved.' });
    });

    it('checks whether a username is taken without regard to capitals (SRS-101.7)', async () => {
      tables.usernames.maybeSingleResult = { data: { username_id: 5 }, error: null }; // 'newuser123' exists

      const response = await registerPost(registerRequest({ ...validRegistration, username: 'NewUser123' }));

      expect(response.status).toBe(400);
      // ILIKE with no wildcards (usernames are letters and digits only) is a
      // case-insensitive equals; the unique index on LOWER(username) backs it up.
      expect(tables.usernames.ilike).toHaveBeenCalledWith('username', 'NewUser123');
      expect(tables.usernames.eq).not.toHaveBeenCalledWith('username', expect.anything());
    });

    it('stores the birthday given at registration (SRS-102.2)', async () => {
      acceptRegistration();

      await registerPost(registerRequest({ ...validRegistration, birthday: '1985-07-04' }));

      expect(insertedPlayer().birthday).toBe('1985-07-04');
    });

    it('stores a one-way hash of the password, never the password itself (SRS-104.5)', async () => {
      acceptRegistration();

      await registerPost(registerRequest(validRegistration));

      const row = insertedPlayer();
      expect(row.password_hash).not.toBe(validRegistration.password);
      expect(JSON.stringify(row)).not.toContain(validRegistration.password);
      expect(JSON.stringify(tables.usernames.insert.mock.calls)).not.toContain(validRegistration.password);
      expect(await bcrypt.compare(validRegistration.password, row.password_hash as string)).toBe(true);
    });

    it('hashes with salted bcrypt at cost 10 or more and never logs the password (SRS-NFR-101)', async () => {
      const logs = (['log', 'info', 'warn', 'error'] as const).map((level) =>
        vi.spyOn(console, level).mockImplementation(() => {})
      );
      acceptRegistration();
      await registerPost(registerRequest(validRegistration));
      const firstHash = insertedPlayer().password_hash as string;

      const [, cost] = firstHash.match(/^\$2[aby]\$(\d{2})\$/) ?? [];
      expect(Number(cost)).toBeGreaterThanOrEqual(10);

      // Salted: the same password hashes differently for a second account.
      resetTable(tables.players);
      acceptRegistration();
      await registerPost(registerRequest({ ...validRegistration, username: 'other1234' }));
      expect(insertedPlayer().password_hash).not.toBe(firstHash);

      // Then log in against the stored hash.
      tables.usernames.maybeSingleResult = { data: { player_id: 1, username: 'newuser123' }, error: null };
      tables.players.maybeSingleResult = {
        data: { player_id: 1, first_name: 'New', last_name: 'User', balance: 1000, password_hash: firstHash, account_status: 'Active' },
        error: null,
      };
      const login = await loginPost(loginRequest({ username: 'newuser123', password: validRegistration.password }));
      expect(login.status).toBe(200);

      for (const spy of logs) {
        expect(JSON.stringify(spy.mock.calls)).not.toContain(validRegistration.password);
        spy.mockRestore();
      }
    });

    it('starts a new account at the 1,000-coin database default (SRS-110.1)', async () => {
      acceptRegistration();

      // A balance sent by the browser is ignored.
      const response = await registerPost(registerRequest({ ...validRegistration, balance: 999999 }));

      expect(response.status).toBe(201);
      expect(insertedPlayer()).not.toHaveProperty('balance');
      const schema = readFileSync(join(__dirname, '../../supabase/schema.sql'), 'utf8');
      expect(schema).toMatch(/\bbalance\s+BIGINT\s+NOT NULL DEFAULT 1000\b/);
    });

    it('releases an expired reservation of the name before checking it (SRS-112.8)', async () => {
      tables.players.singleResult = {
        data: { player_id: 7, first_name: 'Ada', last_name: 'Lovelace', birthday: '1990-01-01', balance: 1000 },
        error: null,
      };

      const response = await registerPost(registerRequest(validRegistration));

      expect(response.status).toBe(201);
      expect(tables.usernames.delete).toHaveBeenCalled();
      expect(tables.usernames.ilike).toHaveBeenCalledWith('username', 'newuser123');
      expect(tables.usernames.eq).toHaveBeenCalledWith('is_current', false);
      expect(tables.usernames.lte).toHaveBeenCalledWith('reserved_until', expect.any(String));
      // The delete runs before the taken-or-reserved lookup.
      expect(tables.usernames.delete.mock.invocationCallOrder[0]).toBeLessThan(
        tables.usernames.maybeSingle.mock.invocationCallOrder[0]
      );
    });

    it('rejects missing fields (SRS-101.1)', async () => {
      const response = await registerPost(registerRequest({ firstName: 'New' }));
      expect(response.status).toBe(400);
    });

    it.each([
      ["O'Brien", 'User'],
      ['New', 'Smith-Jones'],
      ['Mary Ann', 'Van Dyke'],
    ])('accepts the name "%s %s" with spaces, apostrophes, or hyphens (SRS-101.2)', async (firstName, lastName) => {
      acceptRegistration();

      const response = await registerPost(registerRequest({ ...validRegistration, firstName, lastName }));

      expect(response.status).toBe(201);
      expect(tables.players.insert).toHaveBeenCalledWith(
        expect.objectContaining({ first_name: firstName, last_name: lastName })
      );
    });

    it('rejects a name containing digits (SRS-101.3)', async () => {
      const response = await registerPost(registerRequest({ ...validRegistration, firstName: 'New1' }));
      expect(response.status).toBe(400);
    });

    it('rejects a username outside 6-10 alphanumeric characters (SRS-101.4/101.5)', async () => {
      const response = await registerPost(registerRequest({ ...validRegistration, username: 'ab' }));
      expect(response.status).toBe(400);
    });

    it('rejects a password without both a letter and a number (SRS-101.8)', async () => {
      const response = await registerPost(registerRequest({ ...validRegistration, password: 'allletters' }));
      expect(response.status).toBe(400);
    });

    it('rejects a player under 21 years old (SRS-102.1)', async () => {
      const recentBirthday = new Date();
      recentBirthday.setFullYear(recentBirthday.getFullYear() - 18);

      const response = await registerPost(
        registerRequest({ ...validRegistration, birthday: recentBirthday.toISOString().slice(0, 10) })
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'You must be at least 21 years old to register.' });
    });

    it('rolls back the player row when the username insert loses a race', async () => {
      tables.usernames.maybeSingleResult = { data: null, error: null };
      tables.players.singleResult = {
        data: { player_id: 7, first_name: 'New', last_name: 'User', birthday: '1990-01-01', balance: 1000 },
        error: null,
      };
      tables.usernames.defaultResult = {
        data: null,
        error: { message: 'duplicate key value violates unique constraint', code: '23505' },
      };

      const response = await registerPost(registerRequest(validRegistration));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: 'That username is already taken or reserved.',
        code: '23505',
      });
      expect(tables.players.delete).toHaveBeenCalled();
      expect(tables.players.eq).toHaveBeenCalledWith('player_id', 7);
    });

    it('returns a 500 when Supabase credentials are not configured', async () => {
      vi.mocked(getSupabaseClient).mockReturnValueOnce(null as never);

      const response = await registerPost(registerRequest(validRegistration));

      expect(response.status).toBe(500);
    });
  });

  describe('login', () => {
    const password = 'secret123';

    async function seedPlayer(overrides: Partial<{ accountStatus: string; password: string }> = {}) {
      const passwordHash = await bcrypt.hash(overrides.password ?? password, 10);
      tables.usernames.maybeSingleResult = { data: { player_id: 1, username: 'gooduser1' }, error: null };
      tables.players.maybeSingleResult = {
        data: {
          player_id: 1,
          first_name: 'Good',
          last_name: 'User',
          balance: 1000,
          password_hash: passwordHash,
          account_status: overrides.accountStatus ?? 'Active',
        },
        error: null,
      };
      tables.player_sessions.defaultResult = { data: null, error: null };
    }

    it('logs in with a valid username and password (SRS-103.1)', async () => {
      await seedPlayer();

      const response = await loginPost(loginRequest({ username: 'gooduser1', password }));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(typeof body.token).toBe('string');
      expect(body.token.length).toBeGreaterThan(20);
      expect(body.player).toEqual({
        playerId: 1,
        firstName: 'Good',
        lastName: 'User',
        username: 'gooduser1',
        balance: 1000,
      });
    });

    it('replaces any existing session on login (SRS-103.5)', async () => {
      await seedPlayer();

      await loginPost(loginRequest({ username: 'gooduser1', password }));

      expect(tables.player_sessions.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ player_id: 1 }),
        { onConflict: 'player_id' }
      );
    });

    it('rejects an unknown username with a generic message (SRS-104.2/104.4)', async () => {
      tables.usernames.maybeSingleResult = { data: null, error: null };

      const response = await loginPost(loginRequest({ username: 'ghostuser', password }));

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Invalid username or password.' });
    });

    it('rejects an incorrect password with the same generic message (SRS-104.2/104.4)', async () => {
      await seedPlayer();

      const response = await loginPost(loginRequest({ username: 'gooduser1', password: 'wrongpass1' }));

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Invalid username or password.' });
    });

    it('finds the account whatever capitals the username is typed in (SRS-101.7)', async () => {
      await seedPlayer();

      const response = await loginPost(loginRequest({ username: 'GoodUser1', password }));

      expect(response.status).toBe(200);
      expect(tables.usernames.ilike).toHaveBeenCalledWith('username', 'GoodUser1');
      expect((await response.json()).player.username).toBe('gooduser1');
    });

    it('treats capitals in the password as different characters (SRS-101.9)', async () => {
      await seedPlayer({ password: 'Secret123' });

      for (const attempt of ['secret123', 'SECRET123']) {
        const response = await loginPost(loginRequest({ username: 'gooduser1', password: attempt }));
        expect(response.status).toBe(401);
      }
      const response = await loginPost(loginRequest({ username: 'gooduser1', password: 'Secret123' }));
      expect(response.status).toBe(200);
    });

    it('never adds coins for logging in (SRS-110.4)', async () => {
      await seedPlayer();

      const response = await loginPost(loginRequest({ username: 'gooduser1', password }));

      expect(response.status).toBe(200);
      expect(tables.players.update).not.toHaveBeenCalled();
      expect(tables.players.upsert).not.toHaveBeenCalled();
      expect(tables.players.insert).not.toHaveBeenCalled();
      expect((await response.json()).player.balance).toBe(1000);
    });

    it('rejects a pending-deletion account (SRS-106.7)', async () => {
      await seedPlayer({ accountStatus: 'Pending Deletion' });

      const response = await loginPost(loginRequest({ username: 'gooduser1', password }));

      expect(response.status).toBe(403);
    });
  });
});
