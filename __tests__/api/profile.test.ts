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

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    from: vi.fn((table: keyof typeof tables) => tables[table]),
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

  it('PATCH returns 400 when bio is absent', async () => {
    const response = await PATCH(req('PATCH', {}));
    expect(response.status).toBe(400);
  });

  it('PATCH returns 400 when bio exceeds 50 words (SRS-114.1)', async () => {
    const longBio = Array.from({ length: 51 }, (_, i) => `word${i}`).join(' ');
    const response = await PATCH(req('PATCH', { bio: longBio }));
    expect(response.status).toBe(400);
  });

  it('PATCH returns 401 without a token', async () => {
    const response = await PATCH(req('PATCH', { bio: 'x' }, null));
    expect(response.status).toBe(401);
  });
});
