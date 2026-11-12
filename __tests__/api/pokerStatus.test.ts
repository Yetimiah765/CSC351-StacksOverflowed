import { beforeEach, describe, expect, it, vi } from 'vitest';

// SRS-NFR-024: an uptime monitor can tell whether the poker tables are up.

let leaseResult: { data: unknown; error: unknown } = { data: null, error: null };
const query = {
  select: vi.fn(() => query),
  eq: vi.fn(() => query),
  maybeSingle: vi.fn(() => Promise.resolve(leaseResult)),
};

vi.mock('../../lib/supabase', () => ({ getSupabaseClient: vi.fn() }));

import { getSupabaseClient } from '../../lib/supabase';
import { GET } from '../../app/api/poker/status/route';
import { isServerUp } from '../../lib/pokerLease';

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();

beforeEach(() => {
  vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => query) } as never);
});

describe('GET /api/poker/status (SRS-NFR-024)', () => {
  it('says up while the server keeps renewing its lease', async () => {
    leaseResult = { data: { renewed_at: ago(3_000), expires_at: ahead(12_000) }, error: null };
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ up: true });
  });

  it('says down once it stops renewing, or there is no server', async () => {
    leaseResult = { data: { renewed_at: ago(40_000), expires_at: ago(25_000) }, error: null };
    expect((await GET()).status).toBe(503);
    leaseResult = { data: null, error: null };
    expect((await GET()).status).toBe(503);
  });

  it('says down when it cannot check', async () => {
    leaseResult = { data: null, error: { message: 'down' } };
    expect((await GET()).status).toBe(503);
  });
});

describe('telling whether the server is up from its lease', () => {
  const now = Date.parse('2026-11-12T12:00:00Z');
  it('needs a renewal within the last 15 seconds and a lease not yet run out', () => {
    expect(isServerUp({ renewed_at: '2026-11-12T11:59:50Z', expires_at: '2026-11-12T12:00:05Z' }, now)).toBe(true);
    expect(isServerUp({ renewed_at: '2026-11-12T11:59:40Z', expires_at: '2026-11-12T12:00:05Z' }, now)).toBe(false);
    expect(isServerUp({ renewed_at: '2026-11-12T11:59:55Z', expires_at: '2026-11-12T11:59:59Z' }, now)).toBe(false);
    expect(isServerUp(null, now)).toBe(false);
  });
});
