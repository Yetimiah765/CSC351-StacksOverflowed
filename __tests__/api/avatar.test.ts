import { randomBytes } from 'crypto';
import sharp from 'sharp';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { DELETE, POST } from '../../app/api/profile/avatar/route';

function resetTable(table: ReturnType<typeof makeTableMock>) {
  table.select.mockClear();
  table.eq.mockClear();
  table.update.mockClear();
  table.maybeSingle.mockClear();
  table.defaultResult = { data: null, error: null };
  table.maybeSingleResult = { data: null, error: null };
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// A real PNG, width x height, of random pixels, which hardly compress, so its
// size can be chosen: about 3 bytes a pixel.
function noisePng(width: number, height: number) {
  return sharp(randomBytes(width * height * 3), { raw: { width, height, channels: 3 } }).png().toBuffer();
}

// The size of the PNG in a data URL the route sent back.
async function shownSize(dataUrl: string) {
  const { width, height } = await sharp(Buffer.from(dataUrl.split(',')[1], 'base64')).metadata();
  return { width, height };
}

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

  let photo: Buffer;
  beforeAll(async () => {
    photo = await noisePng(300, 200);
  });

  it('stores a valid PNG as it was sent and returns a data URL (SRS-115.1)', async () => {
    const file = new Blob([photo], { type: 'image/png' });

    const response = await POST(makeRequest(file));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.profilePhotoDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(tables.players.update).toHaveBeenCalledWith({
      profile_photo: `\\x${photo.toString('hex')}`,
    });
  });

  it("replies with the profile's 256px copy, small enough for Vercel's 4.5 MB limit (SRS-115.3)", async () => {
    // About 3.9 MB: as base64 the photo itself would be about 5.2 MB.
    const big = await noisePng(1150, 1150);
    expect(big.byteLength).toBeGreaterThan(3.5 * 1024 * 1024);

    const response = await POST(makeRequest(new Blob([big], { type: 'image/png' })));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text.length).toBeLessThan(1024 * 1024);
    expect(await shownSize(JSON.parse(text).profilePhotoDataUrl)).toEqual({ width: 256, height: 256 });
    expect(tables.players.update).toHaveBeenCalledWith({ profile_photo: `\\x${big.toString('hex')}` });
  });

  it('rejects a file that starts like a PNG but is not an image, storing nothing (SRS-115.1)', async () => {
    const file = new Blob([Buffer.concat([PNG_SIGNATURE, Buffer.from('rest-of-png-data')])], { type: 'image/png' });

    const response = await POST(makeRequest(file));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Profile photos must be PNG images.' });
    expect(tables.players.update).not.toHaveBeenCalled();
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

  it('rejects a non-PNG file by signature, not filename (SRS-115.1, SRS-115.2)', async () => {
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
    const file = new Blob([photo], { type: 'image/png' });
    const response = await POST(makeRequest(file));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Update failed' });
  });
});

function makeDeleteRequest(token: string | null = 'valid-token') {
  return new Request('http://localhost/api/profile/avatar', {
    method: 'DELETE',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe('Avatar remove route', () => {
  beforeEach(() => {
    resetTable(tables.player_sessions);
    resetTable(tables.players);
    tables.player_sessions.maybeSingleResult = { data: { player_id: 1 }, error: null };
  });

  it("clears the player's photo, returning them to the default icon (SRS-115.5, SRS-115.6)", async () => {
    const response = await DELETE(makeDeleteRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ profilePhotoDataUrl: null });
    expect(tables.players.update).toHaveBeenCalledWith({ profile_photo: null });
    expect(tables.players.eq).toHaveBeenCalledWith('player_id', 1);
  });

  it('returns 401 without a token', async () => {
    const response = await DELETE(makeDeleteRequest(null));
    expect(response.status).toBe(401);
    expect(tables.players.update).not.toHaveBeenCalled();
  });

  it('returns 401 for a token with no matching session', async () => {
    tables.player_sessions.maybeSingleResult = { data: null, error: null };
    const response = await DELETE(makeDeleteRequest('bad-token'));
    expect(response.status).toBe(401);
    expect(tables.players.update).not.toHaveBeenCalled();
  });

  it('returns 400 when the database update fails', async () => {
    tables.players.defaultResult = { data: null, error: { message: 'Update failed' } };
    const response = await DELETE(makeDeleteRequest());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Update failed' });
  });
});
