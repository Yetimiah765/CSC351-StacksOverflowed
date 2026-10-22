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
    expect(body.owned[0]).toEqual({ cosmeticId: 1, name: 'Classic Navy', category: 'Card', artKey: 'classic-navy', isDefault: true });
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
    available_from: from, available_until: until, blind_box_rewards: rewards.map((cosmetics) => ({ cosmetics })),
  });
  const DAY = 24 * 60 * 60 * 1000;
  const iso = (offset: number) => new Date(Date.now() + offset).toISOString();

  beforeEach(() => {
    tables.blind_boxes.defaultResult = {
      data: [
        box(6, 'Halloween Box', 625, [HALO, HORIZON], iso(-DAY), iso(DAY)),
        box(7, 'Thanksgiving Box', 625, [VOLT], iso(DAY), iso(30 * DAY)),
        box(8, 'Old Box', 625, [VOLT], iso(-30 * DAY), iso(-DAY)),
        box(1, 'Neon Box', 350, [HALO, VOLT, HORIZON]),
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
    expect(neon.rewards.map((r: { artKey: string }) => r.artKey)).toEqual(['neon-horizon', 'neon-volt', 'neon-halo']);
    expect(body.boxes[1]).toMatchObject({ price: 625, duplicateRefund: 313, limited: true });
    expect(neon.rewards.every((r: { owned: boolean }) => r.owned === false)).toBe(true);
  });

  it('marks the rewards a logged-in player already owns', async () => {
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

  beforeEach(() => {
    tables.blind_box_rewards.defaultResult = { error: null, count: 6 };
  });

  it('returns 401 without a token', async () => {
    expect((await buy(req('/api/shop/buy', 'POST', { boxId: 1 }, null))).status).toBe(401);
  });

  it('requires a boxId', async () => {
    expect((await buy(req('/api/shop/buy', 'POST', { boxId: 'x' }))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a box with no rewards without charging (SRS-123.6)', async () => {
    tables.blind_box_rewards.defaultResult = { error: null, count: 0 };

    const response = await buy(req('/api/shop/buy', 'POST', { boxId: 1 }));

    expect(response.status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('picks a random index over the rewards and returns the new cosmetic (SRS-124.4, SRS-125.1, SRS-125.2)', async () => {
    rpc.mockResolvedValue({ data: opened, error: null });

    const response = await buy(req('/api/shop/buy', 'POST', { boxId: 1 }));

    expect(response.status).toBe(200);
    expect(randomInt).toHaveBeenCalledWith(6);
    expect(rpc).toHaveBeenCalledWith('fn_buy_blind_box', { p_player_id: 7, p_box_id: 1, p_pick: 5 });
    expect(await response.json()).toEqual({
      cosmetic: { cosmeticId: 5, name: 'Neon Volt', category: 'Chip', artKey: 'neon-volt' },
      wasDuplicate: false,
      refund: 0,
      price: 350,
      balance: 650,
    });
  });

  it('passes a duplicate refund through (SRS-126.3)', async () => {
    rpc.mockResolvedValue({ data: { ...opened, was_duplicate: true, refund: 175, balance: 825 }, error: null });

    const body = await (await buy(req('/api/shop/buy', 'POST', { boxId: 1 }))).json();

    expect([body.wasDuplicate, body.refund, body.balance]).toEqual([true, 175, 825]);
  });

  it('picks again once if the box changed size', async () => {
    rpc
      .mockResolvedValueOnce({ data: { status: 'stale_pick', reward_count: 4 }, error: null })
      .mockResolvedValueOnce({ data: opened, error: null });

    const response = await buy(req('/api/shop/buy', 'POST', { boxId: 1 }));

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenNthCalledWith(2, 'fn_buy_blind_box', { p_player_id: 7, p_box_id: 1, p_pick: 3 });
  });

  it('explains a balance below the price (SRS-124.5)', async () => {
    rpc.mockResolvedValue({ data: { status: 'insufficient_balance', price: 350, balance: 100 }, error: null });

    const response = await buy(req('/api/shop/buy', 'POST', { boxId: 1 }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('This box costs 350 coins and you have 100.');
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
