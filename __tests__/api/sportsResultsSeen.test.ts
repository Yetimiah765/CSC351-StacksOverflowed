import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashSessionToken } from '../../lib/auth';

// Same builder shape as __tests__/api/sportsWagers.test.ts.
const sessions = {
  select: vi.fn(() => sessions),
  eq: vi.fn((_column: string, tokenHash: string) => {
    sessions.lastHash = tokenHash;
    return sessions;
  }),
  maybeSingle: vi.fn(() =>
    Promise.resolve({
      data: sessions.lastHash === hashSessionToken('good-token') ? { player_id: 7 } : null,
      error: null,
    }),
  ),
  lastHash: '',
};

// The update query; awaiting the last filter resolves it.
const wagers = {
  calls: [] as unknown[][],
  update: vi.fn((values: unknown) => {
    wagers.calls.push(['update', values]);
    return wagers;
  }),
  eq: vi.fn((...args: unknown[]) => {
    wagers.calls.push(['eq', ...args]);
    return wagers;
  }),
  in: vi.fn((...args: unknown[]) => {
    wagers.calls.push(['in', ...args]);
    return wagers;
  }),
  not: vi.fn((...args: unknown[]) => {
    wagers.calls.push(['not', ...args]);
    return wagers;
  }),
  is: vi.fn((...args: unknown[]) => {
    wagers.calls.push(['is', ...args]);
    return Promise.resolve({ error: null });
  }),
};

const tablesUpdated: string[] = [];

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'player_sessions') return sessions;
      tablesUpdated.push(table);
      return wagers;
    }),
  })),
}));

import { POST } from '../../app/api/sports/wagers/seen/route';

function markSeen(body: unknown, token: string | null = 'good-token') {
  return POST(
    new Request('http://localhost/api/sports/wagers/seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

describe('POST /api/sports/wagers/seen', () => {
  beforeEach(() => {
    wagers.calls = [];
    tablesUpdated.length = 0;
  });

  it('requires a logged-in player', async () => {
    expect((await markSeen({ ids: [1] }, null)).status).toBe(401);
    expect(wagers.calls).toEqual([]);
  });

  it('rejects a missing or malformed id list', async () => {
    for (const body of [{}, { ids: [] }, { ids: ['1'] }, { ids: [1.5] }, { ids: [-2] }]) {
      expect((await markSeen(body)).status).toBe(400);
    }
    expect(wagers.calls).toEqual([]);
  });

  it("marks the player's own settled Showdown entries as seen too", async () => {
    const response = await markSeen({ showdownEntryIds: [4] });

    expect(response.status).toBe(200);
    expect(tablesUpdated).toEqual(['public_bet_entries']);
    expect(wagers.calls.slice(1)).toEqual([
      ['eq', 'player_id', 7],
      ['in', 'entry_id', [4]],
      ['not', 'payout', 'is', null],
      ['is', 'result_seen_at', null],
    ]);
  });

  it('rejects a malformed Showdown id list', async () => {
    expect((await markSeen({ ids: [1], showdownEntryIds: ['x'] })).status).toBe(400);
  });

  it("marks only the player's own settled, unseen wagers as seen", async () => {
    const response = await markSeen({ ids: [3, 5] });

    expect(response.status).toBe(200);
    expect(wagers.calls[0][0]).toBe('update');
    expect(wagers.calls.slice(1)).toEqual([
      ['eq', 'player_id', 7],
      ['in', 'wager_id', [3, 5]],
      ['not', 'result', 'is', null],
      ['is', 'result_seen_at', null],
    ]);
  });
});
