// SRS-NFR-017 / SRS-NFR-020 (npm run test:latency [tableId] [samples]): how quickly the poker
// server's table state reaches a client. Connects to the table's Realtime
// channel the way a browser does (the public anon key), asks for the state
// (`sync`) `samples` times one after another, times each until the state
// arrives, and judges the round trips against lib/pokerLatency.ts. Needs
// NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (from .env.local)
// and a poker server running (npm run realtime, or the hosted one). Run it
// from a computer whose round trip to Supabase is at most 200 ms, as the SRS
// says. Exits 1 if the requirement isn't met.

import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { POKER_EVENT_ACTION, POKER_EVENT_STATE, pokerTableChannelName } from '../lib/pokerRealtime';
import { MESSAGE_LATENCY_LIMIT_MS, SYNC_LATENCY_LIMIT_MS, SYNC_LATENCY_SHARE, judgeLatency } from '../lib/pokerLatency';

loadEnv();
loadEnv({ path: '.env.local', override: true });

const tableId = process.argv[2] ?? 'low-1';
const samples = Number(process.argv[3] ?? 100);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example).');
  process.exit(1);
}

async function main() {
  const supabase = createClient(url as string, anonKey as string);
  const channel = supabase.channel(pokerTableChannelName(tableId), { config: { broadcast: { self: false } } });
  let waiting: ((at: number) => void) | null = null;
  channel.on('broadcast', { event: POKER_EVENT_STATE }, () => waiting?.(performance.now()));
  await new Promise<void>((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve();
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(`Channel ${status}`));
    });
  });

  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    const arrived = new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('No state within 10 s: is the poker server running?')), 10_000);
      waiting = (at) => {
        clearTimeout(timeout);
        resolve(at);
      };
    });
    const sent = performance.now();
    await channel.send({ type: 'broadcast', event: POKER_EVENT_ACTION, payload: { requestId: `latency-${i}`, action: 'sync' } });
    times.push((await arrived) - sent);
    waiting = null;
  }
  await supabase.removeAllChannels();

  const result = judgeLatency(times, SYNC_LATENCY_LIMIT_MS, SYNC_LATENCY_SHARE);
  // eslint-disable-next-line no-console
  console.log(
    `${result.count} state updates at ${tableId}: 95th percentile ${result.p95.toFixed(0)} ms; ` +
      `${(result.shareWithin * 100).toFixed(1)}% within ${SYNC_LATENCY_LIMIT_MS} ms (needs ${SYNC_LATENCY_SHARE * 100}%).`
  );
  // eslint-disable-next-line no-console
  console.log(result.meets ? 'SRS-NFR-017 met.' : 'SRS-NFR-017 NOT met.');
  // SRS-NFR-020: the warnings and notices ride on the same broadcasts.
  const slowest = Math.max(...times);
  const messages = slowest <= MESSAGE_LATENCY_LIMIT_MS;
  // eslint-disable-next-line no-console
  console.log(
    `Slowest ${slowest.toFixed(0)} ms against ${MESSAGE_LATENCY_LIMIT_MS} ms for player messages: ` +
      (messages ? 'SRS-NFR-020 met.' : 'SRS-NFR-020 NOT met.')
  );
  process.exit(result.meets && messages ? 0 : 1);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
