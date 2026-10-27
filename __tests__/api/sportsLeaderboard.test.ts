import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashSessionToken } from '../../lib/auth';

// Same session builder as __tests__/api/sportsShowdown.test.ts.
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

const mocks = vi.hoisted(() => ({ fetchLeaderboard: vi.fn() }));

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from: vi.fn(() => sessions) })),
}));
vi.mock('../../lib/sports/leaderboard', () => ({ fetchLeaderboard: mocks.fetchLeaderboard }));

import { GET } from '../../app/api/sports/leaderboard/route';

const get = (query = '', token: string | null = null) =>
  GET(new Request(`http://localhost/api/sports/leaderboard${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }));

const BOARD = { week: { start: 'a', end: 'b' }, topEarners: [], biggestWins: [], me: null, lastWeekChampion: null };

describe('GET /api/sports/leaderboard', () => {
  beforeEach(() => {
    mocks.fetchLeaderboard.mockReset();
    mocks.fetchLeaderboard.mockResolvedValue(BOARD);
  });

  it("is public, and shows this week's board to guests (SRS-216.1)", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(BOARD);
    expect(mocks.fetchLeaderboard).toHaveBeenCalledWith(expect.anything(), null, 0);
  });

  it("passes a logged-in player's id so their own rank is included (SRS-216.4)", async () => {
    await get('', 'good-token');
    expect(mocks.fetchLeaderboard).toHaveBeenCalledWith(expect.anything(), 7, 0);
  });

  it('treats an expired session like a guest instead of failing', async () => {
    expect((await get('', 'bad-token')).status).toBe(200);
    expect(mocks.fetchLeaderboard).toHaveBeenCalledWith(expect.anything(), null, 0);
  });

  it("returns last week's final board with ?week=last (SRS-216.6)", async () => {
    await get('?week=last');
    expect(mocks.fetchLeaderboard).toHaveBeenCalledWith(expect.anything(), null, 1);
  });

  it('returns 500 when loading fails', async () => {
    mocks.fetchLeaderboard.mockRejectedValue(new Error('timeout'));
    const response = await get();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Could not load the leaderboard.' });
  });
});
