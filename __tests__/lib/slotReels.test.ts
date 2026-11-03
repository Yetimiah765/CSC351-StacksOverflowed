import { describe, expect, it } from 'vitest';
import { REEL_CYCLES, REEL_STOP_MS, reelStopOffset, reelStrip } from '../../lib/slotReels';

describe('reel animation (SRS-307.6)', () => {
  it('stops the reels from left to right', () => {
    expect(REEL_STOP_MS[0]).toBeLessThan(REEL_STOP_MS[1]);
    expect(REEL_STOP_MS[1]).toBeLessThan(REEL_STOP_MS[2]);
  });

  it('stops the last reel no later than 1.5 seconds after the result arrives', () => {
    expect(Math.max(...REEL_STOP_MS)).toBeLessThanOrEqual(1500);
  });

  it('has one stop time and one cycle count per reel', () => {
    expect(REEL_STOP_MS).toHaveLength(3);
    expect(REEL_CYCLES).toHaveLength(3);
  });

  it('starts each reel on what it showed and stops it on the generated symbol', () => {
    const strip = reelStrip('Bell', 'Seven', 3);
    expect(strip[0]).toBe('Bell');
    expect(strip[strip.length - 1]).toBe('Seven');
    // Three times round all six symbols, then the stopping symbol.
    expect(strip).toHaveLength(3 * 6 + 1);
  });

  it('stops on every symbol, from every symbol', () => {
    const symbols = ['Cherry', 'Lemon', 'Orange', 'Bell', 'Bar', 'Seven'] as const;
    for (const from of symbols) {
      for (const to of symbols) {
        const strip = reelStrip(from, to, 4);
        expect(strip[0]).toBe(from);
        expect(strip.at(-1)).toBe(to);
      }
    }
  });

  it('moves the strip so its last symbol fills the window', () => {
    expect(reelStopOffset(1)).toBe('-0%');
    expect(reelStopOffset(4)).toBe('-75%');
    expect(reelStopOffset(19)).toBe(`-${(18 / 19) * 100}%`);
  });
});
