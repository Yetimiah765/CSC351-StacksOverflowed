import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';

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

import { POST } from '../../app/api/profile/password/route';

function resetTable(table: ReturnType<typeof makeTableMock>) {
  table.select.mockClear();
  table.eq.mockClear();
  table.update.mockClear();
  table.maybeSingle.mockClear();
  table.defaultResult = { data: null, error: null };
  table.maybeSingleResult = { data: null, error: null };
}

function req(body: object, token: string | null = 'valid-token') {
  return new Request('http://localhost/api/profile/password', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const RULES =
  'Passwords must be at least 8 characters, contain only letters and numbers, and include at least one letter and one number.';

let currentHash: string;

// The hash written by the last update, if any.
function savedHash(): string | undefined {
  return tables.players.update.mock.calls[0]?.[0]?.password_hash;
}

describe('Change password route', () => {
  beforeAll(async () => {
    currentHash = await bcrypt.hash('OldPass123', 4);
  });

  beforeEach(() => {
    resetTable(tables.player_sessions);
    resetTable(tables.players);
    tables.player_sessions.maybeSingleResult = { data: { player_id: 1 }, error: null };
    tables.players.maybeSingleResult = { data: { password_hash: currentHash }, error: null };
  });

  it('saves a hash of the new password when the current one is right (SRS-113.1 - SRS-113.3)', async () => {
    const response = await POST(
      req({ currentPassword: 'OldPass123', newPassword: 'NewPass456', confirmPassword: 'NewPass456' })
    );

    expect(response.status).toBe(200);
    expect(tables.players.eq).toHaveBeenCalledWith('player_id', 1);
    const hash = savedHash()!;
    expect(hash).not.toBe('NewPass456');
    expect(await bcrypt.compare('NewPass456', hash)).toBe(true);
    // Case-sensitive, like at registration (SRS-113.3).
    expect(await bcrypt.compare('newpass456', hash)).toBe(false);
  });

  it('requires the current password (SRS-113.1)', async () => {
    const response = await POST(req({ newPassword: 'NewPass456', confirmPassword: 'NewPass456' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Enter your current password.' });
    expect(tables.players.update).not.toHaveBeenCalled();
  });

  it.each(['oldpass123', 'OldPass12', 'WrongPass1'])(
    'saves nothing when the current password is wrong: %s (SRS-113.2)',
    async (currentPassword) => {
      const response = await POST(
        req({ currentPassword, newPassword: 'NewPass456', confirmPassword: 'NewPass456' })
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'Your current password is incorrect.' });
      expect(tables.players.update).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['too short', 'Short12'],
    ['letters only', 'lettersonly'],
    ['numbers only', '12345678'],
    ['a space', 'has space1'],
    ['a symbol', 'Symbol!123'],
  ])('rejects a new password with %s, like registration does (SRS-113.3)', async (_, newPassword) => {
    const response = await POST(req({ currentPassword: 'OldPass123', newPassword, confirmPassword: newPassword }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: RULES });
    expect(tables.players.update).not.toHaveBeenCalled();
  });

  it("rejects a confirmation that doesn't match", async () => {
    const response = await POST(
      req({ currentPassword: 'OldPass123', newPassword: 'NewPass456', confirmPassword: 'NewPass457' })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "The new passwords don't match." });
    expect(tables.players.update).not.toHaveBeenCalled();
  });

  it('returns 401 without a token', async () => {
    const response = await POST(
      req({ currentPassword: 'OldPass123', newPassword: 'NewPass456', confirmPassword: 'NewPass456' }, null)
    );
    expect(response.status).toBe(401);
  });

  it('returns 401 for a token with no matching session', async () => {
    tables.player_sessions.maybeSingleResult = { data: null, error: null };
    const response = await POST(
      req({ currentPassword: 'OldPass123', newPassword: 'NewPass456', confirmPassword: 'NewPass456' }, 'bad-token')
    );
    expect(response.status).toBe(401);
    expect(tables.players.update).not.toHaveBeenCalled();
  });

  it('returns 500 when saving fails', async () => {
    tables.players.defaultResult = { data: null, error: { message: 'Update failed' } };
    const response = await POST(
      req({ currentPassword: 'OldPass123', newPassword: 'NewPass456', confirmPassword: 'NewPass456' })
    );
    expect(response.status).toBe(500);
  });
});
