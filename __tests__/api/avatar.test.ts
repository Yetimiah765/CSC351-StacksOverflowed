import { beforeEach, describe, expect, it, vi } from 'vitest';

// See __tests__/api/auth.test.ts for the rationale behind this builder shape.
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
};

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    from: vi.fn((table: keyof typeof tables) => tables[table]),
  })),
}));

import { POST } from '../../app/api/profile/avatar/route';

function resetTable(table: ReturnType<typeof makeTableMock>) {
  table.select.mockClear();
  table.eq.mockClear();
  table.update.mockClear();
  table.maybeSingle.mockClear();
  table.defaultResult = { data: null, error: null };
  table.maybeSingleResult = { data: null, error: null };
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function makeRequest(file?: Blob, token: string | null = 'valid-token') {
  const formData = new FormData();
  if (file) formData.append('image', file, 'avatar.png');
  return new Request('http://localhost/api/profile/avatar', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: formData,
  });
}

describe('Avatar upload route', () => {
  beforeEach(() => {
    resetTable(tables.player_sessions);
    resetTable(tables.players);
    tables.player_sessions.maybeSingleResult = { data: { player_id: 1 }, error: null };
  });

  it('stores a valid PNG and returns a data URL (SRS-115.1)', async () => {
    const buffer = Buffer.concat([PNG_SIGNATURE, Buffer.from('rest-of-png-data')]);
    const file = new Blob([buffer], { type: 'image/png' });

    const response = await POST(makeRequest(file));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.profilePhotoDataUrl).toBe(`data:image/png;base64,${buffer.toString('base64')}`);
    expect(tables.players.update).toHaveBeenCalledWith({
      profile_photo: `\\x${buffer.toString('hex')}`,
    });
  });

  it('returns 401 without a token', async () => {
    const file = new Blob([PNG_SIGNATURE], { type: 'image/png' });
    const response = await POST(makeRequest(file, null));
    expect(response.status).toBe(401);
  });

  it('returns 401 for a token with no matching session', async () => {
    tables.player_sessions.maybeSingleResult = { data: null, error: null };
    const file = new Blob([PNG_SIGNATURE], { type: 'image/png' });
    const response = await POST(makeRequest(file, 'bad-token'));
    expect(response.status).toBe(401);
  });

  it('returns 400 when no image is provided', async () => {
    const response = await POST(makeRequest(undefined));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'image file is required.' });
  });

  it('rejects a non-PNG file by signature, not filename (SRS-115.1)', async () => {
    const file = new Blob([Buffer.from('not-a-png-file')], { type: 'image/jpeg' });
    const response = await POST(makeRequest(file));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Profile photos must be PNG images.' });
  });

  it('rejects a PNG larger than 5 MB (SRS-115.3)', async () => {
    const oversized = Buffer.concat([PNG_SIGNATURE, Buffer.alloc(5 * 1024 * 1024)]);
    const file = new Blob([oversized], { type: 'image/png' });
    const response = await POST(makeRequest(file));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Profile photos must be 5 MB or smaller.' });
  });

  it('returns 400 when the database update fails', async () => {
    tables.players.defaultResult = { data: null, error: { message: 'Update failed' } };
    const file = new Blob([PNG_SIGNATURE], { type: 'image/png' });
    const response = await POST(makeRequest(file));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Update failed' });
  });
});
