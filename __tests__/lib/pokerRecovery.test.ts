import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { LONGEST_LEASE_WAIT_MS, RECOVERY_LIMIT_MS, recoveredInTime } from '../../lib/pokerRecovery';

// SRS-NFR-025: the poker server comes back by itself, within a minute.

describe('automatic poker server recovery (SRS-NFR-025)', () => {
  it('gives the tables a minute to take joins again', () => {
    expect(RECOVERY_LIMIT_MS).toBe(60_000);
    expect(recoveredInTime(45_000)).toBe(true);
    expect(recoveredInTime(61_000)).toBe(false);
  });

  it("leaves most of that minute after waiting out a crashed server's lease (SRS-NFR-026)", () => {
    expect(LONGEST_LEASE_WAIT_MS).toBeLessThanOrEqual(RECOVERY_LIMIT_MS / 2);
  });

  it('is restarted by the host whenever it stops, with nobody acting', () => {
    const railway = JSON.parse(readFileSync('railway.json', 'utf8')) as {
      deploy: { startCommand: string; restartPolicyType: string; sleepApplication: boolean };
    };
    expect(railway.deploy.startCommand).toBe('npm run realtime');
    expect(railway.deploy.restartPolicyType).toBe('ALWAYS');
    expect(railway.deploy.sleepApplication).toBe(false);
  });

  it('stops on an unexpected error, so a fresh one restores the tables', () => {
    const server = readFileSync('server/pokerRealtimeServer.ts', 'utf8');
    expect(server).toMatch(/process\.on\('uncaughtException'[\s\S]*?process\.exit\(1\)/);
    expect(server).toMatch(/process\.on\('unhandledRejection'[\s\S]*?process\.exit\(1\)/);
  });
});
