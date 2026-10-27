import { beforeEach, describe, expect, it, vi } from 'vitest';

// See __tests__/api/auth.test.ts for the rationale behind this builder shape:
// chain methods return the same object, `.maybeSingle()`/`.single()` resolve
// via their own configured result, and the object is itself thenable so a
// bare `await` after `.update()` (no `.select()` chained) still resolves.
function makeTableMock() {
  const builder: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    then: (onResolve: (value: unknown) => unknown, onReject?: (reason: unknown) => unknown) => Promise<unknown>;
    defaultResult: { data: unknown; error: unknown };
    maybeSingleResult: { data: unknown; error: unknown };
  } = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    update: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(builder.maybeSingleResult)),
    then: (onResolve, onReject) => Promise.resolve(builder.defaultResult).then(onResolve, onReject),
    defaultResult: { data: null, error: null },
    maybeSingleResult: { data: null, error: null },
  };
  return builder;
}

const tables = {
  player_sessions: makeTableMock(),
  players: makeTableMock(),
  usernames: makeTableMock(),
};

const rpc = vi.fn();

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    from: vi.fn((table: keyof typeof tables) => tables[table]),
    rpc,
  })),
}));

import { GET, PATCH } from '../../app/api/profile/route';

function resetTable(table: ReturnType<typeof makeTableMock>) {
  table.select.mockClear();
  table.eq.mockClear();
  table.update.mockClear();
  table.maybeSingle.mockClear();
  table.defaultResult = { data: null, error: null };
  table.maybeSingleResult = { data: null, error: null };
}

function req(method: string, body?: object, token: string | null = 'valid-token') {
  return new Request('http://localhost/api/profile', {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const playerRow = {
  player_id: 1,
  first_name: 'Test',
  last_name: 'User',
  bio: 'Hello!',
  balance: 1000,
  profile_photo: null,
};

describe('Profile API routes', () => {
  beforeEach(() => {
    resetTable(tables.player_sessions);
    resetTable(tables.players);
    resetTable(tables.usernames);
    rpc.mockReset();

    // A session row present means the bearer token resolves to player_id 1.
    tables.player_sessions.maybeSingleResult = { data: { player_id: 1 }, error: null };
    tables.players.maybeSingleResult = { data: playerRow, error: null };
    tables.usernames.maybeSingleResult = { data: { username: 'testuser1' }, error: null };
  });

  it('GET returns the profile for an authenticated player', async () => {
    const response = await GET(req('GET'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      profile: {
        playerId: 1,
        firstName: 'Test',
        lastName: 'User',
        username: 'testuser1',
        bio: 'Hello!',
        balance: 1000,
        profilePhotoDataUrl: null,
      },
    });
  });

  it('GET returns 401 without a token', async () => {
    const response = await GET(req('GET', undefined, null));
    expect(response.status).toBe(401);
  });

  it('GET returns 401 for a token with no matching session', async () => {
    tables.player_sessions.maybeSingleResult = { data: null, error: null };
    const response = await GET(req('GET', undefined, 'bad-token'));
    expect(response.status).toBe(401);
  });

  it('GET returns a data URL for a stored profile photo', async () => {
    tables.players.maybeSingleResult = {
      data: { ...playerRow, profile_photo: '\\x89504e470d0a1a0a' },
      error: null,
    };

    const response = await GET(req('GET'));
    const body = await response.json();

    expect(body.profile.profilePhotoDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('PATCH updates the bio and returns the refreshed profile', async () => {
    tables.players.defaultResult = { data: null, error: null };
    // Simulate the row loadProfile re-reads after the update commits.
    tables.players.maybeSingleResult = { data: { ...playerRow, bio: 'Updated bio' }, error: null };

    const response = await PATCH(req('PATCH', { bio: 'Updated bio' }));

    expect(response.status).toBe(200);
    expect(tables.players.update).toHaveBeenCalledWith({ bio: 'Updated bio' });
    expect((await response.json()).profile.bio).toBe('Updated bio');
  });

  it('PATCH stores an empty bio as null (SRS-114.2)', async () => {
    tables.players.defaultResult = { data: null, error: null };

    await PATCH(req('PATCH', { bio: '   ' }));

    expect(tables.players.update).toHaveBeenCalledWith({ bio: null });
  });

  it('PATCH returns 400 when there is nothing to update', async () => {
    const response = await PATCH(req('PATCH', {}));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Nothing to update.' });
  });

  it('PATCH returns 400 when bio exceeds 50 words (SRS-114.1)', async () => {
    const longBio = Array.from({ length: 51 }, (_, i) => `word${i}`).join(' ');
    const response = await PATCH(req('PATCH', { bio: longBio }));
    expect(response.status).toBe(400);
  });

  it('PATCH updates the first name, trimmed, and returns the refreshed profile (SRS-112.1)', async () => {
    tables.players.maybeSingleResult = { data: { ...playerRow, first_name: 'Jamie' }, error: null };

    const response = await PATCH(req('PATCH', { firstName: '  Jamie ' }));

    expect(response.status).toBe(200);
    expect(tables.players.update).toHaveBeenCalledWith({ first_name: 'Jamie' });
    expect((await response.json()).profile.firstName).toBe('Jamie');
  });

  it("PATCH accepts a last name with spaces, apostrophes, and hyphens (SRS-112.3)", async () => {
    const response = await PATCH(req('PATCH', { lastName: "O'Neil-De La Cruz" }));

    expect(response.status).toBe(200);
    expect(tables.players.update).toHaveBeenCalledWith({ last_name: "O'Neil-De La Cruz" });
  });

  it.each([
    ['a number', { firstName: 'Jam3s' }],
    ['a special character', { lastName: 'Ortiz!' }],
    ['a leading apostrophe', { firstName: "'James" }],
  ])('PATCH rejects a name with %s, like registration does (SRS-112.3)', async (_, body) => {
    const response = await PATCH(req('PATCH', body));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Names may only contain letters, spaces, apostrophes, and hyphens.' });
    expect(tables.players.update).not.toHaveBeenCalled();
  });

  it('PATCH rejects an empty name (SRS-112.3)', async () => {
    const response = await PATCH(req('PATCH', { lastName: '   ' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Last name is required.' });
    expect(tables.players.update).not.toHaveBeenCalled();
  });

  it('PATCH rejects a name longer than 50 characters', async () => {
    const response = await PATCH(req('PATCH', { firstName: 'A'.repeat(51) }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'First name must be 50 characters or fewer.' });
    expect(tables.players.update).not.toHaveBeenCalled();
  });

  it('PATCH never changes the password (SRS-112.2)', async () => {
    const onlyPassword = await PATCH(req('PATCH', { password: 'newPass123' }));
    expect(onlyPassword.status).toBe(400);
    expect(tables.players.update).not.toHaveBeenCalled();

    await PATCH(req('PATCH', { bio: 'Hi', password: 'newPass123', password_hash: 'x' }));
    expect(tables.players.update).toHaveBeenCalledWith({ bio: 'Hi' });
  });

  it('PATCH never changes the birthday (SRS-102.3)', async () => {
    const onlyBirthday = await PATCH(req('PATCH', { birthday: '2000-01-01' }));
    expect(onlyBirthday.status).toBe(400);
    expect(tables.players.update).not.toHaveBeenCalled();

    await PATCH(req('PATCH', { bio: 'Hi', birthday: '2000-01-01' }));
    expect(tables.players.update).toHaveBeenCalledWith({ bio: 'Hi' });
  });

  describe('PATCH username', () => {
    it('changes it through fn_change_username without asking for a password (SRS-112.4, SRS-112.5)', async () => {
      rpc.mockResolvedValue({ data: { status: 'changed', username: 'newname1' }, error: null });
      tables.usernames.maybeSingleResult = { data: { username: 'newname1' }, error: null };

      const response = await PATCH(req('PATCH', { username: ' newname1 ' }));

      expect(response.status).toBe(200);
      expect(rpc).toHaveBeenCalledWith('fn_change_username', { p_player_id: 1, p_username: 'newname1' });
      expect(tables.players.update).not.toHaveBeenCalled();
      expect((await response.json()).profile.username).toBe('newname1');
    });

    it.each(['short', 'toolongname1', 'has_under'])(
      'rejects %s with the registration rules before calling the database (SRS-112.4)',
      async (username) => {
        const response = await PATCH(req('PATCH', { username }));

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
          error: 'Usernames must be 6-10 characters long and contain only letters and numbers.',
        });
        expect(rpc).not.toHaveBeenCalled();
      }
    );

    it('reports a name that is taken or reserved (SRS-112.4, SRS-112.7)', async () => {
      rpc.mockResolvedValue({ data: { status: 'taken' }, error: null });

      const response = await PATCH(req('PATCH', { username: 'someone1' }));

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'That username is already taken or reserved.' });
    });

    it('says when the next change is allowed during the 24-hour limit (SRS-112.6)', async () => {
      const nextChangeAt = new Date(Date.now() + 4.5 * 60 * 60 * 1000).toISOString();
      rpc.mockResolvedValue({ data: { status: 'cooldown', next_change_at: nextChangeAt }, error: null });

      const response = await PATCH(req('PATCH', { username: 'newname2' }));

      expect(response.status).toBe(429);
      expect(await response.json()).toEqual({
        error: 'You can change your username once every 24 hours. Try again in 5 hours.',
        nextChangeAt,
      });
    });

    it('returns 403 for an account pending deletion', async () => {
      rpc.mockResolvedValue({ data: { status: 'not_active' }, error: null });
      const response = await PATCH(req('PATCH', { username: 'newname3' }));
      expect(response.status).toBe(403);
    });

    it('returns 500 when the database call fails, e.g. before the migration is run', async () => {
      rpc.mockResolvedValue({ data: null, error: { message: 'function fn_change_username does not exist' } });
      const response = await PATCH(req('PATCH', { username: 'newname4' }));
      expect(response.status).toBe(500);
    });
  });

  it('PATCH returns 401 without a token', async () => {
    const response = await PATCH(req('PATCH', { bio: 'x' }, null));
    expect(response.status).toBe(401);
  });
});
