import { beforeEach, describe, expect, it, vi } from 'vitest';

// See __tests__/api/auth.test.ts for the rationale behind this builder shape:
// chain methods return the same object, `.maybeSingle()` resolves via its own
// result, and a bare `await` (a list or a count) resolves via defaultResult.
function makeTableMock() {
  const builder: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    then: (onResolve: (value: unknown) => unknown, onReject?: (reason: unknown) => unknown) => Promise<unknown>;
    defaultResult: { data?: unknown; error: unknown; count?: number | null };
    maybeSingleResult: { data: unknown; error: unknown };
  } = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(builder.maybeSingleResult)),
    then: (onResolve, onReject) => Promise.resolve(builder.defaultResult).then(onResolve, onReject),
    defaultResult: { data: null, error: null },
    maybeSingleResult: { data: null, error: null },
  };
  return builder;
}

const tables = {
  player_sessions: makeTableMock(),
  player_cosmetics: makeTableMock(),
  player_equipped_cosmetics: makeTableMock(),
  blind_boxes: makeTableMock(),
  blind_box_rewards: makeTableMock(),
};
const rpc = vi.fn();

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    from: vi.fn((table: keyof typeof tables) => tables[table]),
    rpc,
  })),
}));

// The "random" pick is fixed so tests know which index was sent.
const randomInt = vi.fn((n: number) => n - 1);
vi.mock('crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('crypto')>()),
  randomInt: (n: number) => randomInt(n),
}));

import { getSupabaseClient } from '../../lib/supabase';
import { GET as getCollection } from '../../app/api/cosmetics/route';
import { POST as equip } from '../../app/api/cosmetics/equip/route';
import { GET as getBoxes } from '../../app/api/shop/boxes/route';
import { POST as buy } from '../../app/api/shop/buy/route';

function req(url: string, method = 'GET', body?: object, token: string | null = 'valid-token') {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const row = (cosmetic_id: number, cosmetic_name: string, category: string, asset_path: string, is_default = false) => ({
  cosmetic_id, cosmetic_name, category, is_default, asset_path,
});
const NAVY = row(1, 'Classic Navy', 'Card', 'classic-navy', true);
const RED = row(2, 'Classic Red', 'Chip', 'classic-red', true);
const RING = row(3, 'Classic Ring', 'Profile Outline', 'classic-ring', true);
const HORIZON = row(4, 'Neon Horizon', 'Card', 'neon-horizon');
const VOLT = row(5, 'Neon Volt', 'Chip', 'neon-volt');
const HALO = row(6, 'Neon Halo', 'Profile Outline', 'neon-halo');
const PRISM = { ...row(46, 'Neon Prism', 'Card', 'holo-neon'), is_holographic: true };

beforeEach(() => {
  for (const table of Object.values(tables)) {
    table.select.mockClear();
    table.eq.mockClear();
    table.order.mockClear();
    table.upsert.mockClear();
    table.maybeSingle.mockClear();
    table.defaultResult = { data: null, error: null };
    table.maybeSingleResult = { data: null, error: null };
  }
  rpc.mockReset();
  randomInt.mockClear();
  tables.player_sessions.maybeSingleResult = { data: { player_id: 7 }, error: null };
});

describe('GET /api/cosmetics (collection)', () => {
  it('returns 401 without a token', async () => {
    expect((await getCollection(req('/api/cosmetics', 'GET', undefined, null))).status).toBe(401);
  });

  it('lists owned cosmetics, defaults first then oldest first, and what is equipped (SRS-119.2, SRS-120.1)', async () => {
    tables.player_cosmetics.defaultResult = {
      data: [
        { acquired_at: '2026-10-21T10:00:00Z', cosmetics: VOLT },
        { acquired_at: '2026-10-20T10:00:00Z', cosmetics: HORIZON },
        { acquired_at: '2026-09-01T10:00:00Z', cosmetics: RED },
        { acquired_at: '2026-09-01T10:00:00Z', cosmetics: NAVY },
      ],
      error: null,
    };
    tables.player_equipped_cosmetics.defaultResult = {
      data: [{ category: 'Card', cosmetic_id: 4 }, { category: 'Chip', cosmetic_id: 2 }],
      error: null,
    };

    const response = await getCollection(req('/api/cosmetics'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(tables.player_cosmetics.eq).toHaveBeenCalledWith('player_id', 7);
    expect(body.owned.map((c: { artKey: string }) => c.artKey)).toEqual(['classic-navy', 'classic-red', 'neon-horizon', 'neon-volt']);
    expect(body.owned[0]).toEqual({ cosmeticId: 1, name: 'Classic Navy', category: 'Card', artKey: 'classic-navy', isDefault: true, isHolographic: false });
    expect(body.equipped).toEqual({ Card: 4, Chip: 2 });
  });
});

describe('POST /api/cosmetics/equip', () => {
  it('requires a cosmeticId', async () => {
    expect((await equip(req('/api/cosmetics/equip', 'POST', {}))).status).toBe(400);
  });

  it("refuses a cosmetic the player doesn't own (SRS-120.4)", async () => {
    tables.player_cosmetics.maybeSingleResult = { data: null, error: null };

    const response = await equip(req('/api/cosmetics/equip', 'POST', { cosmeticId: 5 }));

    expect(response.status).toBe(404);
    expect(tables.player_equipped_cosmetics.upsert).not.toHaveBeenCalled();
  });

  it("equips an owned cosmetic in its own category, replacing that slot (SRS-120.4, SRS-120.5)", async () => {
    tables.player_cosmetics.maybeSingleResult = { data: { cosmetics: { category: 'Chip' } }, error: null };

    const response = await equip(req('/api/cosmetics/equip', 'POST', { cosmeticId: 5 }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ category: 'Chip', cosmeticId: 5 });
    expect(tables.player_cosmetics.eq).toHaveBeenCalledWith('cosmetic_id', 5);
    expect(tables.player_equipped_cosmetics.upsert).toHaveBeenCalledWith(
      { player_id: 7, category: 'Chip', cosmetic_id: 5 },
      { onConflict: 'player_id,category' }
    );
  });
});

describe('GET /api/shop/boxes', () => {
  const box = (box_id: number, box_name: string, price: number, rewards: object[], from: string | null = null, until: string | null = null) => ({
    box_id, box_name, description: `${box_name} description`, price, is_available: true,
    available_from: from, available_until: until, holographic_chance_bp: 300, blind_box_rewards: rewards.map((cosmetics) => ({ cosmetics })),
  });
  const DAY = 24 * 60 * 60 * 1000;
  const iso = (offset: number) => new Date(Date.now() + offset).toISOString();

  beforeEach(() => {
    tables.blind_boxes.defaultResult = {
      data: [
        box(6, 'Halloween Box', 625, [HALO, HORIZON], iso(-DAY), iso(DAY)),
        box(7, 'Thanksgiving Box', 625, [VOLT], iso(DAY), iso(30 * DAY)),
        box(8, 'Old Box', 625, [VOLT], iso(-30 * DAY), iso(-DAY)),
        box(1, 'Neon Box', 350, [PRISM, HALO, VOLT, HORIZON]),
        box(2, 'Empty Box', 350, []),
      ],
      error: null,
    };
  });

  it('shows only boxes on sale now, regular before limited, with price, refund and rewards (SRS-122.1 - SRS-122.3)', async () => {
    const response = await getBoxes(req('/api/shop/boxes', 'GET', undefined, null));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.signedIn).toBe(false);
    expect(body.boxes.map((b: { name: string }) => b.name)).toEqual(['Neon Box', 'Halloween Box']);
    const neon = body.boxes[0];
    expect([neon.price, neon.duplicateRefund, neon.limited]).toEqual([350, 175, false]);
    // Regular items in card, chip, outline order, then the holographic ones.
    expect(neon.rewards.map((r: { artKey: string }) => r.artKey)).toEqual(['neon-horizon', 'neon-volt', 'neon-halo', 'holo-neon']);
    expect(neon.rewards.map((r: { isHolographic: boolean }) => r.isHolographic)).toEqual([false, false, false, true]);
    // SRS-123.8 / SRS-123.9: one holographic item takes the whole 3%; the three regular ones share 97%.
    expect(neon.chances).toEqual({ regular: '32.33%', holographic: '3%' });
    expect(body.boxes[1]).toMatchObject({ price: 625, duplicateRefund: 313, limited: true, chances: { regular: '50%', holographic: null } });
    expect(neon.rewards.every((r: { owned: boolean }) => r.owned === false)).toBe(true);
  });

  it('marks the rewards a logged-in player already owns (SRS-122.6)', async () => {
    tables.player_cosmetics.defaultResult = { data: [{ cosmetic_id: 5 }], error: null };

    const body = await (await getBoxes(req('/api/shop/boxes'))).json();

    expect(body.signedIn).toBe(true);
    expect(body.boxes[0].rewards.find((r: { artKey: string }) => r.artKey === 'neon-volt').owned).toBe(true);
    expect(body.boxes[0].rewards.find((r: { artKey: string }) => r.artKey === 'neon-halo').owned).toBe(false);
  });
});

describe('POST /api/shop/buy', () => {
  const opened = {
    status: 'opened', cosmetic_id: 5, cosmetic_name: 'Neon Volt', category: 'Chip', art_key: 'neon-volt',
    was_duplicate: false, refund: 0, price: 350, balance: 650,
  };

  const reward = (is_holographic: boolean) => ({ cosmetics: { is_holographic } });
  const neonBox = { holographic_chance_bp: 300, blind_box_rewards: [...Array(6)].map(() => reward(false)).concat([reward(true), reward(true)]) };

  beforeEach(() => {
    tables.blind_boxes.maybeSingleResult = { data: neonBox, error: null };
  });

  it('returns 401 without a token (SRS-124.8)', async () => {
    expect((await buy(req('/api/shop/buy', 'POST', { boxId: 1 }, null))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('requires a boxId', async () => {
    expect((await buy(req('/api/shop/buy', 'POST', { boxId: 'x' }))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a box with no rewards, or no such box, without charging (SRS-123.6)', async () => {
    tables.blind_boxes.maybeSingleResult = { data: { holographic_chance_bp: 300, blind_box_rewards: [] }, error: null };
    expect((await buy(req('/api/shop/buy', 'POST', { boxId: 1 }))).status).toBe(409);
    tables.blind_boxes.maybeSingleResult = { data: null, error: null };
    expect((await buy(req('/api/shop/buy', 'POST', { boxId: 99 }))).status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rolls for the holographic tier, then picks a regular item, and returns the new cosmetic (SRS-123.8, SRS-124.4, SRS-125.1, SRS-125.2)', async () => {
    rpc.mockResolvedValue({ data: opened, error: null });

    const response = await buy(req('/api/shop/buy', 'POST', { boxId: 1 }));

    expect(response.status).toBe(200);
    // The roll (9,999) is above the 300 chance, so the pick is over the 6 regular items.
    expect(randomInt.mock.calls).toEqual([[10000], [6]]);
    expect(rpc).toHaveBeenCalledWith('fn_buy_blind_box', { p_player_id: 7, p_box_id: 1, p_roll: 9999, p_pick: 5 });
    expect(await response.json()).toEqual({
      cosmetic: { cosmeticId: 5, name: 'Neon Volt', category: 'Chip', artKey: 'neon-volt', isHolographic: false },
      wasDuplicate: false,
      refund: 0,
      price: 350,
      balance: 650,
    });
  });

  it('picks from the holographic items when the roll is under the chance (SRS-123.8, SRS-127.6)', async () => {
    randomInt.mockImplementationOnce(() => 0);
    rpc.mockResolvedValue({ data: { ...opened, cosmetic_id: 46, cosmetic_name: 'Neon Prism', category: 'Card', art_key: 'holo-neon', is_holographic: true }, error: null });

    const body = await (await buy(req('/api/shop/buy', 'POST', { boxId: 1 }))).json();

    expect(randomInt.mock.calls).toEqual([[10000], [2]]);
    expect(rpc).toHaveBeenCalledWith('fn_buy_blind_box', { p_player_id: 7, p_box_id: 1, p_roll: 0, p_pick: 1 });
    expect(body.cosmetic).toEqual({ cosmeticId: 46, name: 'Neon Prism', category: 'Card', artKey: 'holo-neon', isHolographic: true });
  });

  it("doesn't count the price as money lost (SRS-117.10)", async () => {
    const from = vi.fn((table: keyof typeof tables) => tables[table]);
    vi.mocked(getSupabaseClient).mockReturnValueOnce({ from, rpc } as never);
    rpc.mockResolvedValue({ data: opened, error: null });

    const response = await buy(req('/api/shop/buy', 'POST', { boxId: 1 }));

    expect(response.status).toBe(200);
    // Only the purchase function runs, and the route never writes statistics.
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['fn_buy_blind_box']);
    expect(from.mock.calls.map(([table]) => table)).not.toContain('player_game_stats');
  });

  it('passes a duplicate refund through (SRS-126.3)', async () => {
    rpc.mockResolvedValue({ data: { ...opened, was_duplicate: true, refund: 175, balance: 825 }, error: null });

    const body = await (await buy(req('/api/shop/buy', 'POST', { boxId: 1 }))).json();

    expect([body.wasDuplicate, body.refund, body.balance]).toEqual([true, 175, 825]);
  });

  it('draws again once, from the new counts, if the box changed', async () => {
    rpc
      .mockResolvedValueOnce({ data: { status: 'stale_pick', regular_count: 4, holographic_count: 2, reward_count: 4 }, error: null })
      .mockResolvedValueOnce({ data: opened, error: null });

    const response = await buy(req('/api/shop/buy', 'POST', { boxId: 1 }));

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenNthCalledWith(2, 'fn_buy_blind_box', { p_player_id: 7, p_box_id: 1, p_roll: 9999, p_pick: 3 });
  });

  it('explains a balance below the price (SRS-124.5)', async () => {
    rpc.mockResolvedValue({ data: { status: 'insufficient_balance', price: 350, balance: 100 }, error: null });

    const response = await buy(req('/api/shop/buy', 'POST', { boxId: 1 }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('This box costs 350 coins and you have 100.');
  });

  it('refuses an account pending deletion (SRS-124.8)', async () => {
    rpc.mockResolvedValue({ data: { status: 'not_active' }, error: null });

    const response = await buy(req('/api/shop/buy', 'POST', { boxId: 1 }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe('This account is pending deletion.');
  });

  it('refuses a box that is no longer on sale (SRS-122.4)', async () => {
    rpc.mockResolvedValue({ data: { status: 'unavailable' }, error: null });
    expect((await buy(req('/api/shop/buy', 'POST', { boxId: 6 }))).status).toBe(409);
  });

  it('reports a database failure as not charged', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await buy(req('/api/shop/buy', 'POST', { boxId: 1 }));

    expect(response.status).toBe(500);
    expect((await response.json()).error).toMatch(/not charged/);
  });
});
