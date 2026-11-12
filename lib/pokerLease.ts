// One poker server at a time (SRS-NFR-026). The poker realtime server
// (server/pokerRealtimeServer.ts) holds every table's state in memory, so two
// running at once — a second copy started by mistake, or a new deploy coming
// up before the old one has gone — would each keep their own copy of each
// table. So a server must hold the lease in poker_server_lease before it
// handles anything (fn_poker_claim_lease, migration
// 2026-11-12_poker_server_lease.sql):
//   * it claims the lease on start-up, waiting (as a standby) while another
//     server holds it, until that one releases it or stops renewing it;
//   * it renews the lease every LEASE_RENEW_MS for LEASE_TTL_MS;
//   * if a renewal finds the lease gone to someone else, or it can't renew
//     before its lease runs out, it stops at once (and the host restarts it
//     as a standby, SRS-NFR-025);
//   * shutting down, it releases the lease, so the next one takes over at once.

import type { SupabaseClient } from '@supabase/supabase-js';

/** How long a claim lasts, and how often the holder renews it. */
export const LEASE_TTL_MS = 15_000;
export const LEASE_RENEW_MS = 5_000;

export interface LeaseReply {
  held: boolean;
  holder: string;
  expires_at: string;
}

/** Claims or renews the lease for `holder`; null if the database couldn't be asked. */
export async function claimLease(supabase: SupabaseClient, holder: string, ttlMs = LEASE_TTL_MS): Promise<LeaseReply | null> {
  const { data, error } = await supabase.rpc('fn_poker_claim_lease', {
    p_holder: holder,
    p_ttl_seconds: Math.ceil(ttlMs / 1000),
  });
  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error('Could not claim the poker server lease:', error?.message ?? 'no reply');
    return null;
  }
  return data as LeaseReply;
}

/** Gives the lease up (shutting down), so the next server needn't wait for it to run out. */
export async function releaseLease(supabase: SupabaseClient, holder: string): Promise<void> {
  await supabase.rpc('fn_poker_release_lease', { p_holder: holder });
}

/**
 * What a holder does after a renewal attempt at `now`: carry on, or stop.
 * It stops if the lease went to someone else, or if it couldn't renew and
 * its own lease (last good one at `heldUntil`) has run out — by then another
 * server may have it.
 */
export function afterRenewal(reply: LeaseReply | null, holder: string, heldUntil: number, now: number): 'keep' | 'stop' {
  if (reply) return reply.held && reply.holder === holder ? 'keep' : 'stop';
  return now < heldUntil ? 'keep' : 'stop';
}

/**
 * Waits until `holder` has the lease, trying every `retryMs`, and resolves
 * with when it runs out. `onWaiting` hears who holds it meanwhile.
 */
export async function waitForLease(
  supabase: SupabaseClient,
  holder: string,
  {
    retryMs = LEASE_RENEW_MS,
    onWaiting,
    sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    now = Date.now,
  }: {
    retryMs?: number;
    onWaiting?: (heldBy: string | null) => void;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  } = {}
): Promise<number> {
  for (;;) {
    const started = now();
    const reply = await claimLease(supabase, holder);
    if (reply?.held && reply.holder === holder) return started + LEASE_TTL_MS;
    onWaiting?.(reply?.holder ?? null);
    await sleep(retryMs);
  }
}

/**
 * SRS-NFR-024: whether a poker server is up, from the lease row: someone
 * holds it and has renewed it within the last LEASE_TTL_MS. The renewal is
 * the server's heartbeat, so a stopped server shows as down within 15 seconds.
 */
export function isServerUp(lease: { renewed_at: string; expires_at: string } | null, now: number): boolean {
  if (!lease) return false;
  const renewed = Date.parse(lease.renewed_at);
  const expires = Date.parse(lease.expires_at);
  return Number.isFinite(renewed) && Number.isFinite(expires) && expires > now && now - renewed <= LEASE_TTL_MS;
}
