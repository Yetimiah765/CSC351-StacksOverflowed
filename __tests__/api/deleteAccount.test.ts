import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// See __tests__/api/auth.test.ts for the rationale behind this builder shape.
function makeTableMock() {
  const builder: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    then: (onResolve: (value: unknown) => unknown, onReject?: (reason: unknown) => unknown) => Promise<unknown>;
    defaultResult: { data: unknown; error: unknown };
    maybeSingleResult: { data: unknown; error: unknown };
  } = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    delete: vi.fn(() => builder),
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

import { DELETE } from '../../app/api/profile/route';
import { hashPassword } from '../../lib/auth';

const PASSWORD = 'Secret123';
let passwordHash: string;

function resetTable(table: ReturnType<typeof makeTableMock>) {
  for (const fn of [table.select, table.eq, table.delete, table.maybeSingle]) fn.mockClear();
  table.defaultResult = { data: null, error: null };
  table.maybeSingleResult = { data: null, error: null };
}

function deleteRequest(body: object = { password: PASSWORD }, token: string | null = 'valid-token') {
  return new Request('http://localhost/api/profile', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

describe('Deleting an account (UR-106)', () => {
  beforeAll(async () => {
    passwordHash = await hashPassword(PASSWORD);
  });

  beforeEach(() => {
    resetTable(tables.player_sessions);
    resetTable(tables.players);
    // The bearer token belongs to player 1.
    tables.player_sessions.maybeSingleResult = { data: { player_id: 1 }, error: null };
    tables.players.maybeSingleResult = { data: { password_hash: passwordHash }, error: null };
    tables.players.defaultResult = { data: [{ player_id: 1 }], error: null };
  });

  it("deletes the logged-in player's account, and with it everything tied to it (SRS-106.3)", async () => {
    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
    expect(tables.players.delete).toHaveBeenCalledTimes(1);
    expect(tables.players.eq).toHaveBeenCalledWith('player_id', 1);
  });

  it('deletes only the account the session belongs to, whatever the request names', async () => {
    await DELETE(deleteRequest({ password: PASSWORD, playerId: 2, player_id: 2 }));

    expect(tables.players.delete).toHaveBeenCalledTimes(1);
    expect(tables.players.eq.mock.calls.every(([column, value]) => column === 'player_id' && value === 1)).toBe(true);
  });

  it('refuses without a session, deleting nothing', async () => {
    expect((await DELETE(deleteRequest({}, null))).status).toBe(401);

    tables.player_sessions.maybeSingleResult = { data: null, error: null };
    expect((await DELETE(deleteRequest({}, 'expired-token'))).status).toBe(401);

    expect(tables.players.delete).not.toHaveBeenCalled();
  });

  it('requires the player\'s password, deleting nothing without it (SRS-106.2)', async () => {
    for (const body of [{}, { password: '' }, { password: 123 }]) {
      const response = await DELETE(deleteRequest(body));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Enter your password to delete your account.' });
    }
    expect(tables.players.delete).not.toHaveBeenCalled();
  });

  it('refuses a wrong password, deleting nothing (SRS-106.2)', async () => {
    for (const password of ['Wrong1234', 'secret123', 'SECRET123']) {
      const response = await DELETE(deleteRequest({ password }));
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'Incorrect password.' });
    }
    expect(tables.players.delete).not.toHaveBeenCalled();
  });

  it('checks the password against the stored hash before deleting (SRS-106.2, SRS-104.6)', async () => {
    const order: string[] = [];
    tables.players.maybeSingle.mockImplementationOnce(() => {
      order.push('password checked');
      return Promise.resolve(tables.players.maybeSingleResult);
    });
    tables.players.delete.mockImplementationOnce(() => {
      order.push('deleted');
      return tables.players;
    });

    expect((await DELETE(deleteRequest())).status).toBe(200);
    expect(order).toEqual(['password checked', 'deleted']);
  });

  it('says so when the account is already gone', async () => {
    tables.players.defaultResult = { data: [], error: null };

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(404);
  });

  it('reports a database failure without claiming the account was deleted', async () => {
    tables.players.defaultResult = { data: null, error: { message: 'connection lost' } };

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Could not delete your account. Please try again.' });
  });
});
