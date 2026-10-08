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

    it('rejects a username that is already taken or reserved (SRS-101.5)', async () => {
      tables.usernames.maybeSingleResult = { data: { username_id: 5 }, error: null };

      const response = await registerPost(registerRequest(validRegistration));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'That username is already taken or reserved.' });
    });

    it('rejects missing fields (SRS-101.1)', async () => {
      const response = await registerPost(registerRequest({ firstName: 'New' }));
      expect(response.status).toBe(400);
    });

    it('rejects a name containing digits (SRS-101.2)', async () => {
      const response = await registerPost(registerRequest({ ...validRegistration, firstName: 'New1' }));
      expect(response.status).toBe(400);
    });

    it('rejects a username outside 6-10 alphanumeric characters (SRS-101.3/101.4)', async () => {
      const response = await registerPost(registerRequest({ ...validRegistration, username: 'ab' }));
      expect(response.status).toBe(400);
    });

    it('rejects a password without both a letter and a number (SRS-101.7)', async () => {
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

    it('replaces any existing session on login (SRS-103.4/103.5)', async () => {
      await seedPlayer();

      await loginPost(loginRequest({ username: 'gooduser1', password }));

      expect(tables.player_sessions.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ player_id: 1 }),
        { onConflict: 'player_id' }
      );
    });

    it('rejects an unknown username with a generic message (SRS-104.2/104.3)', async () => {
      tables.usernames.maybeSingleResult = { data: null, error: null };

      const response = await loginPost(loginRequest({ username: 'ghostuser', password }));

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Invalid username or password.' });
    });

    it('rejects an incorrect password with the same generic message (SRS-104.2/104.3)', async () => {
      await seedPlayer();

      const response = await loginPost(loginRequest({ username: 'gooduser1', password: 'wrongpass1' }));

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Invalid username or password.' });
    });

    it('rejects a pending-deletion account (SRS-106.7)', async () => {
      await seedPlayer({ accountStatus: 'Pending Deletion' });

      const response = await loginPost(loginRequest({ username: 'gooduser1', password }));

      expect(response.status).toBe(403);
    });
  });
});
