import { beforeEach, describe, expect, it, vi } from 'vitest';

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

function resetTable(table: ReturnType<typeof makeTableMock>) {
  for (const fn of [table.select, table.eq, table.delete, table.maybeSingle]) fn.mockClear();
  table.defaultResult = { data: null, error: null };
  table.maybeSingleResult = { data: null, error: null };
}

function deleteRequest(body: object = {}, token: string | null = 'valid-token') {
  return new Request('http://localhost/api/profile', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

describe('Deleting an account (UR-106)', () => {
  beforeEach(() => {
    resetTable(tables.player_sessions);
    resetTable(tables.players);
    // The bearer token belongs to player 1.
    tables.player_sessions.maybeSingleResult = { data: { player_id: 1 }, error: null };
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
    await DELETE(deleteRequest({ playerId: 2, player_id: 2 }));

    expect(tables.players.eq).toHaveBeenCalledTimes(1);
    expect(tables.players.eq).toHaveBeenCalledWith('player_id', 1);
  });

  it('refuses without a session, deleting nothing', async () => {
    expect((await DELETE(deleteRequest({}, null))).status).toBe(401);

    tables.player_sessions.maybeSingleResult = { data: null, error: null };
    expect((await DELETE(deleteRequest({}, 'expired-token'))).status).toBe(401);

    expect(tables.players.delete).not.toHaveBeenCalled();
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
