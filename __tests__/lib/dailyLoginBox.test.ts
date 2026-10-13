import { describe, expect, it } from 'vitest';
import {
  DAILY_LOGIN_BOX_REWARDS,
  formatCountdown,
  msUntilAvailable,
  pickDailyLoginBoxReward,
} from '../../lib/dailyLoginBox';

describe('Daily Login Box rules', () => {
  it('offers exactly 25, 50, 75, and 100 coins (SRS-128.5)', () => {
    expect(DAILY_LOGIN_BOX_REWARDS.map((reward) => reward.amount)).toEqual([25, 50, 75, 100]);
  });

  it('has percentages that add up to 100', () => {
    expect(DAILY_LOGIN_BOX_REWARDS.reduce((sum, reward) => sum + reward.percent, 0)).toBe(100);
  });

  it('maps rolls to rewards at the right boundaries', () => {
    expect(pickDailyLoginBoxReward(0)).toBe(25);
    expect(pickDailyLoginBoxReward(39)).toBe(25);
    expect(pickDailyLoginBoxReward(40)).toBe(50);
    expect(pickDailyLoginBoxReward(69)).toBe(50);
    expect(pickDailyLoginBoxReward(70)).toBe(75);
    expect(pickDailyLoginBoxReward(89)).toBe(75);
    expect(pickDailyLoginBoxReward(90)).toBe(100);
    expect(pickDailyLoginBoxReward(99)).toBe(100);
  });

  it('gives each reward exactly its share of the 100 possible rolls (SRS-128.6)', () => {
    const counts: Record<number, number> = {};
    for (let roll = 0; roll < 100; roll++) {
      const reward = pickDailyLoginBoxReward(roll);
      counts[reward] = (counts[reward] ?? 0) + 1;
    }
    expect(counts).toEqual({ 25: 40, 50: 30, 75: 20, 100: 10 });
  });

  it('rejects rolls outside 0-99', () => {
    expect(() => pickDailyLoginBoxReward(-1)).toThrow(RangeError);
    expect(() => pickDailyLoginBoxReward(100)).toThrow(RangeError);
    expect(() => pickDailyLoginBoxReward(1.5)).toThrow(RangeError);
  });

  it('reports the time left until the next box', () => {
    const now = Date.parse('2026-10-12T12:00:00Z');
    expect(msUntilAvailable(null, now)).toBe(0);
    expect(msUntilAvailable('2026-10-12T11:00:00Z', now)).toBe(0);
    expect(msUntilAvailable('2026-10-12T13:30:00Z', now)).toBe(90 * 60 * 1000);
  });

  it('formats the countdown as HH:MM:SS (SRS-128.13)', () => {
    expect(formatCountdown(0)).toBe('00:00:00');
    expect(formatCountdown(-5000)).toBe('00:00:00');
    expect(formatCountdown(1500)).toBe('00:00:02');
    expect(formatCountdown(3_661_000)).toBe('01:01:01');
    expect(formatCountdown(24 * 60 * 60 * 1000)).toBe('24:00:00');
  });
});
