import { describe, expect, it } from 'vitest';
import {
  SYNC_CLIENT_MAX_RTT_MS,
  SYNC_LATENCY_LIMIT_MS,
  SYNC_LATENCY_SHARE,
  judgeLatency,
  percentile,
} from '../../lib/pokerLatency';

// SRS-NFR-017: 95% of state updates within 500 ms, for clients within 200 ms.

describe('state sync latency (SRS-NFR-017)', () => {
  it('asks for 95% within 500 ms, for clients with a round trip of at most 200 ms', () => {
    expect(SYNC_LATENCY_LIMIT_MS).toBe(500);
    expect(SYNC_LATENCY_SHARE).toBe(0.95);
    expect(SYNC_CLIENT_MAX_RTT_MS).toBe(200);
  });

  it('works out the 95th percentile', () => {
    const samples = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100 ms
    expect(percentile(samples, 0.95)).toBe(95);
    expect(percentile([300], 0.95)).toBe(300);
    expect(percentile([], 0.95)).toBeNaN();
  });

  it('passes when at least 95% arrive in time, a few slow ones allowed', () => {
    const samples = [...Array(95).fill(120), ...Array(5).fill(900)];
    expect(judgeLatency(samples, 500, 0.95)).toMatchObject({ count: 100, shareWithin: 0.95, meets: true });
  });

  it('fails when more than 5% are late, or there is nothing to judge', () => {
    const samples = [...Array(94).fill(120), ...Array(6).fill(900)];
    expect(judgeLatency(samples, 500, 0.95).meets).toBe(false);
    expect(judgeLatency([], 500, 0.95).meets).toBe(false);
  });
});
