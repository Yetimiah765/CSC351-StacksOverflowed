import { readFileSync } from 'fs';
import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GAMES } from '../../lib/games';

// See __tests__/api/auth.test.ts for the rationale behind this builder shape:
// chain methods return the same object, `.maybeSingle()` resolves via its own
// result, and a bare `await` (a list) resolves via defaultResult.
function makeTableMock() {
  const builder: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    then: (onResolve: (value: unknown) => unknown, onReject?: (reason: unknown) => unknown) => Promise<unknown>;
    defaultResult: { data: unknown; error: unknown };
    maybeSingleResult: { data: unknown; error: unknown };
  } = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(builder.maybeSingleResult)),
    then: (onResolve, onReject) => Promise.resolve(builder.defaultResult).then(onResolve, onReject),
    defaultResult: { data: [], error: null },
    maybeSingleResult: { data: null, error: null },
  };
  return builder;
}

const tables = {
  player_sessions: makeTableMock(),
  player_game_stats: makeTableMock(),
};
const from = vi.fn((table: keyof typeof tables) => tables[table]);

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from })),
}));

import { getSupabaseClient } from '../../lib/supabase';
import { GET } from '../../app/api/profile/stats/route';

function req(token: string | null = 'valid-token') {
  return new Request('http://localhost/api/profile/stats', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

// One player_game_stats row, as PostgREST returns it.
const stat = (game_code: string, money_won: number, money_lost: number) => ({ game_code, money_won, money_lost });

describe('Statistics API route', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);
    from.mockClear();
    for (const table of Object.values(tables)) {
      table.select.mockClear();
      table.eq.mockClear();
      table.defaultResult = { data: [], error: null };
      table.maybeSingleResult = { data: null, error: null };
    }
    tables.player_sessions.maybeSingleResult = { data: { player_id: 7 }, error: null };
  });

  it("returns the player's total money won across every game (SRS-117.2)", async () => {
    tables.player_game_stats.defaultResult = {
      data: [stat('sports_betting', 300, 120), stat('roulette', 45, 0), stat('blackjack', 0, 80)],
      error: null,
    };

    const response = await GET(req());

    expect(response.status).toBe(200);
    expect((await response.json()).moneyWon).toBe(345);
    expect(tables.player_game_stats.eq).toHaveBeenCalledWith('player_id', 7);
  });

  it('reports 0 money won for a player with no recorded results (SRS-117.2)', async () => {
    const response = await GET(req());

    expect(response.status).toBe(200);
    expect((await response.json()).moneyWon).toBe(0);
  });

  it("returns the player's total money lost across every game (SRS-117.5)", async () => {
    tables.player_game_stats.defaultResult = {
      data: [stat('sports_betting', 300, 120), stat('roulette', 45, 0), stat('blackjack', 0, 80)],
      error: null,
    };

    const response = await GET(req());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ moneyWon: 345, moneyLost: 200 });
  });

  it('reports 0 money lost for a player with no recorded results (SRS-117.5)', async () => {
    const response = await GET(req());

    expect((await response.json()).moneyLost).toBe(0);
  });

  it("returns each game's money won separately, 0 for a game with no results (SRS-118.2)", async () => {
    tables.player_game_stats.defaultResult = {
      data: [stat('sports_betting', 300, 120), stat('roulette', 45, 0), stat('blackjack', 0, 80)],
      error: null,
    };

    const { games } = await (await GET(req())).json();

    expect(games.sports_betting.moneyWon).toBe(300);
    expect(games.roulette.moneyWon).toBe(45);
    expect(games.blackjack.moneyWon).toBe(0);
    expect(games.poker.moneyWon).toBe(0);
    expect(games.slots.moneyWon).toBe(0);
  });

  it("returns each game's money lost separately, 0 for a game with no results (SRS-118.4)", async () => {
    tables.player_game_stats.defaultResult = {
      data: [stat('sports_betting', 300, 120), stat('roulette', 45, 0), stat('blackjack', 0, 80)],
      error: null,
    };

    const { games } = await (await GET(req())).json();

    expect(games.sports_betting).toEqual({ moneyWon: 300, moneyLost: 120 });
    expect(games.roulette.moneyLost).toBe(0);
    expect(games.blackjack.moneyLost).toBe(80);
    expect(games.poker.moneyLost).toBe(0);
    expect(games.slots.moneyLost).toBe(0);
  });

  it('covers every casino game and sports betting in the database (SRS-118.2, SRS-118.4)', async () => {
    // The game codes seeded into the games table, which player_game_stats uses.
    const schema = readFileSync(join(__dirname, '../../supabase/schema.sql'), 'utf8');
    const seeded = schema.match(/INSERT INTO games \(game_code, display_name\) VALUES([^;]+);/)![1];
    const codes = [...seeded.matchAll(/\('([a-z_]+)'/g)].map((match) => match[1]);

    const { games } = await (await GET(req())).json();

    expect(GAMES.map((game) => game.statsCode).sort()).toEqual([...codes].sort());
    expect(Object.keys(games).sort()).toEqual([...codes].sort());
  });

  it('returns 401 without a token', async () => {
    const response = await GET(req(null));

    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalledWith('player_game_stats');
  });

  it('returns 401 for a session that no longer exists (SRS-103.5)', async () => {
    tables.player_sessions.maybeSingleResult = { data: null, error: null };

    const response = await GET(req('replaced-token'));

    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalledWith('player_game_stats');
  });

  it('returns a 500 when the statistics cannot be read', async () => {
    tables.player_game_stats.defaultResult = { data: null, error: { message: 'boom' } };

    const response = await GET(req());

    expect(response.status).toBe(500);
  });

  it('returns a 500 when Supabase credentials are not configured', async () => {
    vi.mocked(getSupabaseClient).mockReturnValueOnce(null as never);

    const response = await GET(req());

    expect(response.status).toBe(500);
  });
});
