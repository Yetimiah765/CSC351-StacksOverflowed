import { beforeEach, describe, expect, it, vi } from 'vitest';

// A slot_bet_amounts query: select().order() resolves to `result`.
const table = {
  select: vi.fn(() => table),
  order: vi.fn(() => Promise.resolve(table.result)),
  result: { data: null as unknown, error: null as unknown },
};

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}));

import { getSupabaseClient } from '../../lib/supabase';
import { GET } from '../../app/api/slots/bet-amounts/route';

describe('GET /api/slots/bet-amounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => table) } as never);
    table.result = {
      data: [{ bet_amount: 5 }, { bet_amount: 10 }, { bet_amount: 25 }, { bet_amount: 50 }, { bet_amount: 100 }],
      error: null,
    };
  });

  it('returns the five bet amounts with 5 coins selected (SRS-306.1)', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ betAmounts: [5, 10, 25, 50, 100], defaultBet: 5 });
  });

  it('reads them from slot_bet_amounts, smallest first', async () => {
    await GET();
    const client = vi.mocked(getSupabaseClient).mock.results[0].value;
    expect(client.from).toHaveBeenCalledWith('slot_bet_amounts');
    expect(table.select).toHaveBeenCalledWith('bet_amount');
    expect(table.order).toHaveBeenCalledWith('bet_amount', { ascending: true });
  });

  it('needs no session, so it never looks at a token', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const client = vi.mocked(getSupabaseClient).mock.results[0].value;
    expect(client.from).not.toHaveBeenCalledWith('player_sessions');
  });

  it('returns an empty list and no default when the table is empty', async () => {
    table.result = { data: [], error: null };
    const res = await GET();
    expect(await res.json()).toEqual({ betAmounts: [], defaultBet: null });
  });

  it('returns 500 when the query fails', async () => {
    table.result = { data: null, error: { message: 'boom' } };
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'boom' });
  });

  it('returns 500 when Supabase is not configured', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
