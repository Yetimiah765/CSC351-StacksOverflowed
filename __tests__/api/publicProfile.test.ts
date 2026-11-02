import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// See __tests__/api/auth.test.ts for the rationale behind this builder shape:
// chain methods return the same object, `.maybeSingle()` resolves via its own
// result, and a bare `await` (a list) resolves via defaultResult.
function makeTableMock() {
  const builder: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    then: (onResolve: (value: unknown) => unknown, onReject?: (reason: unknown) => unknown) => Promise<unknown>;
    defaultResult: { data: unknown; error: unknown };
    maybeSingleResult: { data: unknown; error: unknown };
  } = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(builder.maybeSingleResult)),
    then: (onResolve, onReject) => Promise.resolve(builder.defaultResult).then(onResolve, onReject),
    defaultResult: { data: [], error: null },
    maybeSingleResult: { data: null, error: null },
  };
  return builder;
}

const tables = {
  usernames: makeTableMock(),
  players: makeTableMock(),
};
const from = vi.fn((table: keyof typeof tables) => tables[table]);

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from })),
}));

import { getSupabaseClient } from '../../lib/supabase';
import { GET } from '../../app/api/players/[playerId]/profile/route';

// Anyone may ask: no Authorization header.
const get = (playerId: string) => GET(new Request(`http://localhost/api/players/${playerId}/profile`), { params: { playerId } });

describe('Public profile API route', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);
    from.mockClear();
    for (const table of Object.values(tables)) {
      table.select.mockClear();
      table.eq.mockClear();
      table.defaultResult = { data: [], error: null };
      table.maybeSingleResult = { data: null, error: null };
    }
    tables.usernames.maybeSingleResult = { data: { username: 'Ace777' }, error: null };
    tables.players.maybeSingleResult = { data: { bio: null, profile_photo: null }, error: null };
  });

  it("returns the player's current username to anyone (SRS-121.3)", async () => {
    const response = await get('7');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ playerId: 7, username: 'Ace777' });
    expect(tables.usernames.eq).toHaveBeenCalledWith('player_id', 7);
    expect(tables.usernames.eq).toHaveBeenCalledWith('is_current', true);
  });

  it("returns the player's bio (SRS-121.4)", async () => {
    tables.players.maybeSingleResult = { data: { bio: 'High roller from Tampa.\nPoker nights only.', profile_photo: null }, error: null };

    const response = await get('7');

    expect((await response.json()).bio).toBe('High roller from Tampa.\nPoker nights only.');
    expect(tables.players.select).toHaveBeenCalledWith('bio, profile_photo');
  });

  it('returns no bio when the player has not written one (SRS-121.4)', async () => {
    for (const bio of [null, '', '   ']) {
      tables.players.maybeSingleResult = { data: { bio, profile_photo: null }, error: null };
      expect((await (await get('7')).json()).bio, JSON.stringify(bio)).toBeNull();
    }
  });

  it("returns the player's photo, resized to 256px (SRS-121.5)", async () => {
    // A real 600x400 PNG, stored the way PostgREST returns bytea.
    const png = await sharp({ create: { width: 600, height: 400, channels: 3, background: '#2a9d8f' } }).png().toBuffer();
    tables.players.maybeSingleResult = { data: { bio: null, profile_photo: `\\x${png.toString('hex')}` }, error: null };

    const { photoUrl } = await (await get('7')).json();

    expect(photoUrl).toMatch(/^data:image\/png;base64,/);
    const resized = await sharp(Buffer.from(photoUrl.split(',')[1], 'base64')).metadata();
    expect([resized.format, resized.width, resized.height]).toEqual(['png', 256, 256]);
  });

  it('returns no photo, for the blank default icon, when there is none (SRS-121.5)', async () => {
    const { photoUrl } = await (await get('7')).json();

    expect(photoUrl).toBeNull();
  });

  it('returns 404 for a player who does not exist (SRS-121.3)', async () => {
    tables.usernames.maybeSingleResult = { data: null, error: null };
    tables.players.maybeSingleResult = { data: null, error: null };

    const response = await get('999');

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe('Player not found.');
  });

  it('returns 400 for an id that is not a player number', async () => {
    for (const bad of ['abc', '0', '-3', '1.5']) {
      expect((await get(bad)).status, bad).toBe(400);
    }
    expect(from).not.toHaveBeenCalled();
  });

  it('returns a 500 when the profile cannot be read', async () => {
    tables.usernames.maybeSingleResult = { data: null, error: { message: 'boom' } };

    expect((await get('7')).status).toBe(500);
  });

  it('returns a 500 when Supabase credentials are not configured', async () => {
    vi.mocked(getSupabaseClient).mockReturnValueOnce(null as never);

    expect((await get('7')).status).toBe(500);
  });
});
