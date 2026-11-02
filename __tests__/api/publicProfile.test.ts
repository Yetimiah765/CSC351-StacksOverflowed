import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  usernames: makeTableMock(),
  players: makeTableMock(),
  player_game_stats: makeTableMock(),
  player_equipped_cosmetics: makeTableMock(),
  player_cosmetics: makeTableMock(),
};
const from = vi.fn((table: keyof typeof tables) => tables[table]);

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({ from })),
}));

import { getSupabaseClient } from '../../lib/supabase';
import { GET } from '../../app/api/players/[playerId]/profile/route';

// Anyone may ask: no Authorization header.
const get = (playerId: string) => GET(new Request(`http://localhost/api/players/${playerId}/profile`), { params: { playerId } });

describe('Public profile API route', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);
    from.mockClear();
    for (const table of Object.values(tables)) {
      table.select.mockClear();
      table.eq.mockClear();
      table.defaultResult = { data: [], error: null };
      table.maybeSingleResult = { data: null, error: null };
    }
    tables.usernames.maybeSingleResult = { data: { username: 'Ace777' }, error: null };
    tables.players.maybeSingleResult = { data: { bio: null, profile_photo: null }, error: null };
  });

  it("returns the player's current username to anyone (SRS-121.3)", async () => {
    const response = await get('7');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ playerId: 7, username: 'Ace777' });
    expect(tables.usernames.eq).toHaveBeenCalledWith('player_id', 7);
    expect(tables.usernames.eq).toHaveBeenCalledWith('is_current', true);
  });

  it("returns the player's bio (SRS-121.4)", async () => {
    tables.players.maybeSingleResult = { data: { bio: 'High roller from Tampa.\nPoker nights only.', profile_photo: null }, error: null };

    const response = await get('7');

    expect((await response.json()).bio).toBe('High roller from Tampa.\nPoker nights only.');
    expect(tables.players.select).toHaveBeenCalledWith('bio, profile_photo');
  });

  it('returns no bio when the player has not written one (SRS-121.4)', async () => {
    for (const bio of [null, '', '   ']) {
      tables.players.maybeSingleResult = { data: { bio, profile_photo: null }, error: null };
      expect((await (await get('7')).json()).bio, JSON.stringify(bio)).toBeNull();
    }
  });

  it("returns the player's photo, resized to 256px (SRS-121.5)", async () => {
    // A real 600x400 PNG, stored the way PostgREST returns bytea.
    const png = await sharp({ create: { width: 600, height: 400, channels: 3, background: '#2a9d8f' } }).png().toBuffer();
    tables.players.maybeSingleResult = { data: { bio: null, profile_photo: `\\x${png.toString('hex')}` }, error: null };

    const { photoUrl } = await (await get('7')).json();

    expect(photoUrl).toMatch(/^data:image\/png;base64,/);
    const resized = await sharp(Buffer.from(photoUrl.split(',')[1], 'base64')).metadata();
    expect([resized.format, resized.width, resized.height]).toEqual(['png', 256, 256]);
  });

  it('returns no photo, for the blank default icon, when there is none (SRS-121.5)', async () => {
    const { photoUrl } = await (await get('7')).json();

    expect(photoUrl).toBeNull();
  });

  it("returns the player's overall money won across every game (SRS-121.7)", async () => {
    tables.player_game_stats.defaultResult = {
      data: [{ money_won: 300 }, { money_won: 45 }, { money_won: 0 }],
      error: null,
    };

    const response = await get('7');

    expect((await response.json()).moneyWon).toBe(345);
    expect(tables.player_game_stats.eq).toHaveBeenCalledWith('player_id', 7);
  });

  it('shows 0 money won for a player with no results (SRS-121.7)', async () => {
    expect((await (await get('7')).json()).moneyWon).toBe(0);
  });

  it("returns the player's overall money lost across every game (SRS-121.8)", async () => {
    tables.player_game_stats.defaultResult = {
      data: [
        { money_won: 300, money_lost: 120 },
        { money_won: 45, money_lost: 0 },
        { money_won: 0, money_lost: 80 },
      ],
      error: null,
    };

    const body = await (await get('7')).json();

    expect([body.moneyWon, body.moneyLost]).toEqual([345, 200]);
    expect(tables.player_game_stats.select).toHaveBeenCalledWith('money_won, money_lost');
  });

  it('shows 0 money lost for a player with no results (SRS-121.8)', async () => {
    expect((await (await get('7')).json()).moneyLost).toBe(0);
  });

  it("returns the player's equipped card, chip and profile outline (SRS-121.13)", async () => {
    const cosmetic = (cosmetic_id: number, cosmetic_name: string, category: string, asset_path: string, is_holographic = false) => ({
      cosmetic_id, cosmetic_name, category, is_default: false, asset_path, is_holographic,
    });
    tables.player_equipped_cosmetics.defaultResult = {
      data: [
        { category: 'Card', cosmetics: cosmetic(46, 'Neon Prism', 'Card', 'holo-neon', true) },
        { category: 'Chip', cosmetics: cosmetic(5, 'Neon Volt', 'Chip', 'neon-volt') },
        { category: 'Profile Outline', cosmetics: cosmetic(6, 'Neon Halo', 'Profile Outline', 'neon-halo') },
      ],
      error: null,
    };

    const { equipped } = await (await get('7')).json();

    expect(equipped.Card).toEqual({ cosmeticId: 46, name: 'Neon Prism', category: 'Card', artKey: 'holo-neon', isDefault: false, isHolographic: true });
    expect(equipped.Chip.artKey).toBe('neon-volt');
    expect(equipped['Profile Outline'].artKey).toBe('neon-halo');
    expect(tables.player_equipped_cosmetics.eq).toHaveBeenCalledWith('player_id', 7);
  });

  it('returns null for an empty slot (SRS-121.13)', async () => {
    const { equipped } = await (await get('7')).json();

    expect(equipped).toEqual({ Card: null, Chip: null, 'Profile Outline': null });
  });

  it('returns every cosmetic the player owns, in the same order as their own profile (SRS-121.9)', async () => {
    const cosmetic = (cosmetic_id: number, category: string, asset_path: string, is_default = false, is_holographic = false) => ({
      cosmetic_id, cosmetic_name: asset_path, category, is_default, asset_path, is_holographic,
    });
    tables.player_cosmetics.defaultResult = {
      data: [
        { acquired_at: '2026-10-21T10:00:00Z', cosmetics: cosmetic(5, 'Chip', 'neon-volt') },
        { acquired_at: '2026-10-20T10:00:00Z', cosmetics: cosmetic(46, 'Card', 'holo-neon', false, true) },
        { acquired_at: '2026-09-01T10:00:00Z', cosmetics: cosmetic(2, 'Chip', 'classic-red', true) },
        { acquired_at: '2026-09-01T10:00:00Z', cosmetics: cosmetic(1, 'Card', 'classic-navy', true) },
      ],
      error: null,
    };

    const { owned } = await (await get('7')).json();

    // Defaults first, then the rest in the order they were won.
    expect(owned.map((c: { artKey: string }) => c.artKey)).toEqual(['classic-navy', 'classic-red', 'holo-neon', 'neon-volt']);
    expect(owned[2]).toMatchObject({ cosmeticId: 46, isHolographic: true, isDefault: false });
    expect(tables.player_cosmetics.eq).toHaveBeenCalledWith('player_id', 7);
  });

  it("never returns another player's per-game money won or lost (SRS-121.11)", async () => {
    // A player with results in three games.
    tables.player_game_stats.defaultResult = {
      data: [
        { game_code: 'sports_betting', money_won: 300, money_lost: 120 },
        { game_code: 'roulette', money_won: 45, money_lost: 0 },
        { game_code: 'blackjack', money_won: 0, money_lost: 80 },
      ],
      error: null,
    };

    const response = await get('7');
    const body = await response.json();

    // Only the two overall totals...
    expect([body.moneyWon, body.moneyLost]).toEqual([345, 200]);
    expect(body).not.toHaveProperty('games');
    // ...with no game named anywhere and no single game's figure on its own.
    const text = JSON.stringify(body);
    for (const code of ['sports_betting', 'roulette', 'blackjack', 'poker', 'slots']) expect(text).not.toContain(code);
    for (const figure of [300, 120, 45, 80]) expect(Object.values(body)).not.toContain(figure);
    // The route never even asks which game a figure came from.
    expect(tables.player_game_stats.select).toHaveBeenCalledWith('money_won, money_lost');
  });

  it('never asks for or returns private account information (SRS-121.12)', async () => {
    // Even if the database handed back whole rows, private fields included...
    tables.players.maybeSingleResult = {
      data: {
        bio: 'Hi', profile_photo: null, player_id: 7, first_name: 'Ada', last_name: 'Lovelace', birthday: '1990-12-10',
        password_hash: '$2a$10$abcdefghijklmnopqrstuv', balance: 98765, account_status: 'Active',
      },
      error: null,
    };
    tables.usernames.maybeSingleResult = { data: { username: 'Ace777', player_id: 7, reserved_until: null }, error: null };

    const body = await (await get('7')).json();

    // ...the answer holds only the public fields.
    expect(Object.keys(body).sort()).toEqual(['bio', 'equipped', 'moneyLost', 'moneyWon', 'owned', 'photoUrl', 'playerId', 'username']);
    const text = JSON.stringify(body);
    for (const secret of ['Ada', 'Lovelace', '1990-12-10', '$2a$', '98765', 'password', 'balance', 'birthday', 'first_name', 'last_name']) {
      expect(text, secret).not.toContain(secret);
    }

    // And it never asks the database for them in the first place.
    expect(tables.players.select.mock.calls).toEqual([['bio, profile_photo']]);
    expect(tables.usernames.select.mock.calls).toEqual([['username']]);
    const tablesRead = from.mock.calls.map(([table]) => table);
    expect(tablesRead).not.toContain('player_sessions');
    for (const [columns] of Object.values(tables).flatMap((table) => table.select.mock.calls)) {
      expect(columns, columns).not.toMatch(/\*|first_name|last_name|birthday|password|balance|token/);
    }
  });

  it('returns 404 for a player who does not exist (SRS-121.3)', async () => {
    tables.usernames.maybeSingleResult = { data: null, error: null };
    tables.players.maybeSingleResult = { data: null, error: null };

    const response = await get('999');

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe('Player not found.');
  });

  it('returns 400 for an id that is not a player number', async () => {
    for (const bad of ['abc', '0', '-3', '1.5']) {
      expect((await get(bad)).status, bad).toBe(400);
    }
    expect(from).not.toHaveBeenCalled();
  });

  it('returns a 500 when the profile cannot be read', async () => {
    tables.usernames.maybeSingleResult = { data: null, error: { message: 'boom' } };

    expect((await get('7')).status).toBe(500);
  });

  it('returns a 500 when Supabase credentials are not configured', async () => {
    vi.mocked(getSupabaseClient).mockReturnValueOnce(null as never);

    expect((await get('7')).status).toBe(500);
  });
});
