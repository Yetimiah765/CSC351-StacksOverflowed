import { beforeEach, describe, expect, it, vi } from 'vitest';

// See __tests__/api/auth.test.ts for the rationale behind this builder shape:
// chain methods return the same object and `.maybeSingle()` resolves via its
// own configured result.
function makeTableMock() {
  const builder: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    maybeSingleResult: { data: unknown; error: unknown };
  } = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(builder.maybeSingleResult)),
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

import { getSupabaseClient } from '../../lib/supabase';
import { GET } from '../../app/api/profile/balance/route';

function resetTable(table: ReturnType<typeof makeTableMock>) {
  table.select.mockClear();
  table.eq.mockClear();
  table.maybeSingle.mockClear();
  table.maybeSingleResult = { data: null, error: null };
}

function req(token: string | null = 'valid-token') {
  return new Request('http://localhost/api/profile/balance', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe('Balance API route', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn((table: keyof typeof tables) => tables[table]),
    } as never);
    resetTable(tables.player_sessions);
    resetTable(tables.players);
  });

  it("returns the logged-in player's balance (SRS-109.1)", async () => {
    tables.player_sessions.maybeSingleResult = { data: { player_id: 1 }, error: null };
    tables.players.maybeSingleResult = { data: { balance: 1250 }, error: null };

    const response = await GET(req());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ balance: 1250 });
    expect(tables.players.select).toHaveBeenCalledWith('balance');
    expect(tables.players.eq).toHaveBeenCalledWith('player_id', 1);
  });

  it('returns 401 without a token', async () => {
    const response = await GET(req(null));

    expect(response.status).toBe(401);
    expect(tables.players.select).not.toHaveBeenCalled();
  });

  it('returns 401 for a session that no longer exists (SRS-103.5)', async () => {
    tables.player_sessions.maybeSingleResult = { data: null, error: null };

    const response = await GET(req('replaced-token'));

    expect(response.status).toBe(401);
    expect(tables.players.select).not.toHaveBeenCalled();
  });

  it('returns 404 when the session points at a missing player', async () => {
    tables.player_sessions.maybeSingleResult = { data: { player_id: 99 }, error: null };
    tables.players.maybeSingleResult = { data: null, error: null };

    const response = await GET(req());

    expect(response.status).toBe(404);
  });

  it('returns a 500 when Supabase credentials are not configured', async () => {
    vi.mocked(getSupabaseClient).mockReturnValueOnce(null as never);

    const response = await GET(req());

    expect(response.status).toBe(500);
  });
});
