import { beforeEach, describe, expect, it, vi } from 'vitest';

// See __tests__/api/auth.test.ts for the rationale behind this builder shape:
// chain methods return the same object, and the object is itself thenable so
// a bare `await` after `.delete().eq()` still resolves via `defaultResult`.
function makeTableMock() {
  const builder: {
    delete: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    then: (onResolve: (value: unknown) => unknown, onReject?: (reason: unknown) => unknown) => Promise<unknown>;
    defaultResult: { data: unknown; error: unknown };
  } = {
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    then: (onResolve, onReject) => Promise.resolve(builder.defaultResult).then(onResolve, onReject),
    defaultResult: { data: null, error: null },
  };
  return builder;
}

const tables = {
  player_sessions: makeTableMock(),
};

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    from: vi.fn((table: keyof typeof tables) => tables[table]),
  })),
}));

import { getSupabaseClient } from '../../lib/supabase';
import { hashSessionToken } from '../../lib/auth';
import { POST } from '../../app/api/auth/logout/route';

function req(token: string | null = 'session-token') {
  return new Request('http://localhost/api/auth/logout', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe('Logout API route', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn((table: keyof typeof tables) => tables[table]),
    } as never);
    tables.player_sessions.delete.mockClear();
    tables.player_sessions.eq.mockClear();
    tables.player_sessions.defaultResult = { data: null, error: null };
  });

  it('deletes the session whose hash matches the token (SRS-105.1)', async () => {
    const response = await POST(req('session-token'));

    expect(response.status).toBe(200);
    expect(tables.player_sessions.delete).toHaveBeenCalled();
    expect(tables.player_sessions.eq).toHaveBeenCalledWith('token_hash', hashSessionToken('session-token'));
  });

  it('returns 401 and deletes nothing without a token', async () => {
    const response = await POST(req(null));

    expect(response.status).toBe(401);
    expect(tables.player_sessions.delete).not.toHaveBeenCalled();
  });

  it('returns 500 when the session delete fails', async () => {
    tables.player_sessions.defaultResult = { data: null, error: { message: 'connection lost' } };

    const response = await POST(req());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'connection lost' });
  });

  it('returns a 500 when Supabase credentials are not configured', async () => {
    vi.mocked(getSupabaseClient).mockReturnValueOnce(null as never);

    const response = await POST(req());

    expect(response.status).toBe(500);
  });
});
