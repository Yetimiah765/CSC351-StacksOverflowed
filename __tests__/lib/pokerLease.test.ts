import { describe, expect, it, vi } from 'vitest';
import { LEASE_RENEW_MS, LEASE_TTL_MS, afterRenewal, claimLease, waitForLease } from '../../lib/pokerLease';

// SRS-NFR-026: at most one poker server runs the tables at a time.

function fakeSupabase(replies: unknown[]) {
  const rpc = vi.fn(async () => {
    const next = replies.shift();
    return next instanceof Error ? { data: null, error: { message: next.message } } : { data: next, error: null };
  });
  return { client: { rpc } as never, rpc };
}

const mine = (holder: string) => ({ held: true, holder, expires_at: 'later' });
const theirs = (holder: string) => ({ held: false, holder, expires_at: 'later' });

describe('one poker server at a time (SRS-NFR-026)', () => {
  it('renews well within the lease, so a running holder never lets it lapse', () => {
    expect(LEASE_RENEW_MS * 3).toBe(LEASE_TTL_MS);
  });

  it('claims the lease for its holder', async () => {
    const { client, rpc } = fakeSupabase([mine('a')]);
    expect(await claimLease(client, 'a')).toEqual(mine('a'));
    expect(rpc).toHaveBeenCalledWith('fn_poker_claim_lease', { p_holder: 'a', p_ttl_seconds: 15 });
  });

  it('waits as a standby while another server holds it, then takes over', async () => {
    const { client } = fakeSupabase([theirs('a'), theirs('a'), mine('b')]);
    const waited: (string | null)[] = [];
    let clock = 0;
    const heldUntil = await waitForLease(client, 'b', {
      onWaiting: (heldBy) => waited.push(heldBy),
      sleep: async (ms) => {
        clock += ms;
      },
      now: () => clock,
    });
    expect(waited).toEqual(['a', 'a']);
    expect(heldUntil).toBe(2 * LEASE_RENEW_MS + LEASE_TTL_MS);
  });

  it('keeps waiting, rather than starting, when the database cannot be asked', async () => {
    const { client } = fakeSupabase([new Error('down'), mine('b')]);
    const waited: (string | null)[] = [];
    await waitForLease(client, 'b', { onWaiting: (heldBy) => waited.push(heldBy), sleep: async () => {} });
    expect(waited).toEqual([null]);
  });

  it('carries on after renewing its own lease', () => {
    expect(afterRenewal(mine('a'), 'a', 10_000, 5_000)).toBe('keep');
  });

  it('stops at once if the lease has gone to someone else', () => {
    expect(afterRenewal(theirs('b'), 'a', 10_000, 5_000)).toBe('stop');
  });

  it('rides out a failed renewal while its lease lasts, and stops once it has run out', () => {
    expect(afterRenewal(null, 'a', 10_000, 9_999)).toBe('keep');
    expect(afterRenewal(null, 'a', 10_000, 10_000)).toBe('stop');
  });
});
