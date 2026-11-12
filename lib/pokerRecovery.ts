// Getting the poker tables back after the poker server stops (SRS-NFR-025).
// The host restarts the process with nobody acting (railway.json:
// restartPolicyType ALWAYS); a crash exits the process rather than leaving a
// half-working server running (server/pokerRealtimeServer.ts). On the way back
// up it waits for the lease (SRS-NFR-026), restores every table from the
// database (SRS-7.3), voiding a hand the stop interrupted (SRS-7.4), and
// subscribes to the channels — and then the tables accept joins again.

import { LEASE_RENEW_MS, LEASE_TTL_MS } from './pokerLease';

/** SRS-NFR-025: every table must accept joins again within this long of the server stopping. */
export const RECOVERY_LIMIT_MS = 60_000;

/**
 * The longest a restarted server can wait for the lease of one that crashed
 * without releasing it: until that lease runs out, plus one retry.
 */
export const LONGEST_LEASE_WAIT_MS = LEASE_TTL_MS + LEASE_RENEW_MS;

/** Whether a start-up that took `readyMs` (from the process starting to every table's channel subscribed) is within the limit. */
export function recoveredInTime(readyMs: number): boolean {
  return readyMs <= RECOVERY_LIMIT_MS;
}
