import { beforeEach, describe, expect, it, vi } from 'vitest';

// SRS-9.12: a player removed from a poker seat while disconnected is told
// why the next time they open the site. See __tests__/api/auth.test.ts for
// the fake query builder's shape.

type Result = { data: unknown; error: unknown };

function builder(result: Result) {
  const b: Record<string, unknown> = {};
  for (const name of ['select', 'eq', 'is', 'order', 'in', 'update', 'insert', 'maybeSingle']) {
    b[name] = vi.fn(() => b);
  }
  b.maybeSingle = vi.fn(() => Promise.resolve(result));
  b.then = (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve);
  return b as Record<string, ReturnType<typeof vi.fn>> & PromiseLike<Result>;
}

const tables: Record<string, ReturnType<typeof builder>[]> = {};
const from = vi.fn((table: string) => {
  const queue = tables[table] ?? [];
  const next = queue.shift();
  if (!next) throw new Error(`unexpected query on ${table}`);
  return next;
});

vi.mock('../../lib/supabase', () => ({ getSupabaseClient: vi.fn() }));

import { getSupabaseClient } from '../../lib/supabase';
import { POST } from '../../app/api/poker/notices/route';
import { recordRemovalNotice, takeRemovalNotices } from '../../lib/pokerPersistence';

function req(token: string | null = 'valid-token') {
  return new Request('http://localhost/api/poker/notices', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  for (const key of Object.keys(tables)) delete tables[key];
  from.mockClear();
  vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);
});

describe('recording a removal (SRS-9.11 / SRS-9.12)', () => {
  it('saves a disconnected player\'s notice as not yet shown, with the reason as the table stores it', async () => {
    tables.poker_tables = [builder({ data: { table_id: 4 }, error: null })];
    const insert = builder({ data: null, error: null });
    tables.poker_removal_notices = [insert];
    await recordRemovalNotice({ from } as never, 'low-1', 7, 'disconnected', false);
    expect(insert.insert).toHaveBeenCalledWith(
      expect.objectContaining({ player_id: 7, table_id: 4, removal_reason: 'Disconnection timeout', delivered_at: null })
    );
  });

  it('saves a connected player\'s as already shown, since they were told there and then', async () => {
    tables.poker_tables = [builder({ data: { table_id: 4 }, error: null })];
    const insert = builder({ data: null, error: null });
    tables.poker_removal_notices = [insert];
    await recordRemovalNotice({ from } as never, 'low-1', 7, 'timeouts', true);
    const row = insert.insert.mock.calls[0]?.[0] as { removal_reason: string; delivered_at: string | null };
    expect(row.removal_reason).toBe('Consecutive turn timeouts');
    expect(row.delivered_at).not.toBeNull();
  });
});

describe('POST /api/poker/notices (SRS-9.12)', () => {
  it('hands over the notices not yet shown, oldest first, and marks them shown', async () => {
    tables.player_sessions = [builder({ data: { player_id: 7 }, error: null })];
    const list = builder({
      data: [
        { notice_id: 1, removal_reason: 'Disconnection timeout', removed_at: '2026-11-12T10:00:00Z', poker_tables: { table_name: 'Low Stakes 1' } },
        { notice_id: 2, removal_reason: 'No busted-player response', removed_at: '2026-11-12T11:00:00Z', poker_tables: null },
      ],
      error: null,
    });
    const mark = builder({ data: null, error: null });
    tables.poker_removal_notices = [list, mark];

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      notices: [
        { reason: 'disconnected', tableName: 'Low Stakes 1', removedAt: '2026-11-12T10:00:00Z' },
        { reason: 'busted', tableName: null, removedAt: '2026-11-12T11:00:00Z' },
      ],
    });
    expect(list.eq).toHaveBeenCalledWith('player_id', 7);
    expect(list.is).toHaveBeenCalledWith('delivered_at', null);
    expect(mark.in).toHaveBeenCalledWith('notice_id', [1, 2]);
  });

  it('has nothing to hand over most of the time', async () => {
    tables.player_sessions = [builder({ data: { player_id: 7 }, error: null })];
    tables.poker_removal_notices = [builder({ data: [], error: null })];
    expect(await (await POST(req())).json()).toEqual({ notices: [] });
  });

  it('needs a signed-in player', async () => {
    expect((await POST(req(null))).status).toBe(401);
    tables.player_sessions = [builder({ data: null, error: null })];
    expect((await POST(req())).status).toBe(401);
  });

  it('keeps the notices for next time if they could not be marked shown', async () => {
    tables.player_sessions = [builder({ data: { player_id: 7 }, error: null })];
    tables.poker_removal_notices = [
      builder({ data: [{ notice_id: 1, removal_reason: 'Disconnection timeout', removed_at: 'x', poker_tables: null }], error: null }),
      builder({ data: null, error: { message: 'down' } }),
    ];
    expect((await POST(req())).status).toBe(500);
    expect(await takeRemovalNotices({ from: () => builder({ data: null, error: { message: 'down' } }) } as never, 7)).toBeNull();
  });
});
