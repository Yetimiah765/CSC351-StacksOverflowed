import { beforeEach, describe, expect, it, vi } from 'vitest';

// See __tests__/api/auth.test.ts for the rationale behind this builder shape:
// chain methods return the same object, and awaiting it resolves to `result`.
function makeTableMock() {
  const builder: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    then: (onResolve: (value: unknown) => unknown, onReject?: (reason: unknown) => unknown) => Promise<unknown>;
    result: { data: unknown; error: unknown };
  } = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    then: (onResolve, onReject) => Promise.resolve(builder.result).then(onResolve, onReject),
    result: { data: [], error: null },
  };
  return builder;
}

const tables = {
  player_equipped_cosmetics: makeTableMock(),
};

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    from: vi.fn((table: keyof typeof tables) => tables[table]),
  })),
}));

import { GET } from '../../app/api/players/[playerId]/cosmetics/route';

function get(playerId: string) {
  return GET(new Request(`http://localhost/api/players/${playerId}/cosmetics`), { params: { playerId } });
}

describe("A player's equipped cosmetics (shown at the poker table)", () => {
  beforeEach(() => {
    const table = tables.player_equipped_cosmetics;
    table.select.mockClear();
    table.eq.mockClear();
    table.result = { data: [], error: null };
  });

  it("returns the art key equipped in each category, for any player (SRS-120.1)", async () => {
    tables.player_equipped_cosmetics.result = {
      data: [
        { category: 'Card', cosmetics: { asset_path: 'neon-horizon' } },
        { category: 'Chip', cosmetics: { asset_path: 'classic-red' } },
        { category: 'Profile Outline', cosmetics: { asset_path: 'golden-laurel' } },
      ],
      error: null,
    };

    const response = await get('7');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ card: 'neon-horizon', chip: 'classic-red', outline: 'golden-laurel' });
    expect(tables.player_equipped_cosmetics.eq).toHaveBeenCalledWith('player_id', 7);
  });

  it('returns null for a category with nothing equipped', async () => {
    tables.player_equipped_cosmetics.result = {
      data: [{ category: 'Chip', cosmetics: { asset_path: 'ocean-tide' } }],
      error: null,
    };

    expect(await (await get('7')).json()).toEqual({ card: null, chip: 'ocean-tide', outline: null });
  });

  it('rejects a player id that is not a whole number', async () => {
    const response = await get('abc');
    expect(response.status).toBe(400);
    expect(tables.player_equipped_cosmetics.select).not.toHaveBeenCalled();
  });

  it('returns 500 when the lookup fails', async () => {
    tables.player_equipped_cosmetics.result = { data: null, error: { message: 'boom' } };
    const response = await get('7');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'boom' });
  });
});
