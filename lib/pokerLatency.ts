// How quickly table changes reach players (SRS-NFR-017, SRS-NFR-020). The
// poker server broadcasts the whole table state on its Realtime channel after
// every change; scripts/pokerSyncLatency.ts (npm run test:latency) times how
// long a client waits for one, and these judge the samples.
//
// The script asks for the state (`sync`) and times until it arrives: a full
// round trip, client -> Realtime -> poker server -> Realtime -> client. That
// includes the one-way delivery the SRS measures (server change -> client),
// so a round trip within the limit means the delivery is too.

/** SRS-NFR-017: at least this share of state updates within SYNC_LATENCY_LIMIT_MS. */
export const SYNC_LATENCY_LIMIT_MS = 500;
export const SYNC_LATENCY_SHARE = 0.95;
/** ...for clients whose round trip to the server is at most this. */
export const SYNC_CLIENT_MAX_RTT_MS = 200;

/** The value at or under which `share` of the samples fall (nearest rank). */
export function percentile(samples: number[], share: number): number {
  if (samples.length === 0) return Number.NaN;
  const sorted = samples.slice().sort((a, b) => a - b);
  const rank = Math.ceil(share * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1] as number;
}

/** Whether `samples` (ms) meet a "share within limit" requirement, with the figures to report. */
export function judgeLatency(samples: number[], limitMs: number, share: number) {
  const within = samples.filter((ms) => ms <= limitMs).length;
  return {
    count: samples.length,
    p95: percentile(samples, 0.95),
    shareWithin: samples.length === 0 ? 0 : within / samples.length,
    meets: samples.length > 0 && within / samples.length >= share,
  };
}
