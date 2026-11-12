import { describe, expect, it } from 'vitest';
import {
  SHUFFLE_TEST_COUNT,
  SIGNIFICANCE,
  chiSquare,
  criticalValue,
  positionCounts,
  testShuffleUniformity,
} from '../../lib/shuffleUniformity';

// SRS-NFR-023. The real run is npm run test:shuffle (1,000,000 shuffles with
// crypto.randomInt); these check the test itself on a seeded generator, so
// they're quick and can't fail by chance.

/** A seeded generator (mulberry32) returning integers in [0, n). */
function seeded(seed: number) {
  let a = seed >>> 0;
  return (n: number) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

describe('the shuffle uniformity test (SRS-NFR-023)', () => {
  it('is over 1,000,000 shuffles at the 0.01 level', () => {
    expect(SHUFFLE_TEST_COUNT).toBe(1_000_000);
    expect(SIGNIFICANCE).toBe(0.01);
  });

  it('uses the right critical values', () => {
    // From chi-square tables: the 0.99 quantile.
    expect(criticalValue(100)).toBeCloseTo(135.807, 0);
    expect(criticalValue(2601)).toBeCloseTo(2771.96, 0);
  });

  it('counts every card in every position, each shuffle once', () => {
    const counts = positionCounts(500, seeded(1));
    expect(counts).toHaveLength(52);
    counts.forEach((row) => expect(row.reduce((a, b) => a + b, 0)).toBe(500));
    expect(chiSquare(counts).degreesOfFreedom).toBe(51 * 51);
  });

  it('passes the poker shuffle', () => {
    const result = testShuffleUniformity(20_000, seeded(7));
    expect(result.uniform).toBe(true);
    expect(result.statistic).toBeLessThan(result.critical);
  });

  it('catches a shuffle that is not uniform', () => {
    // The classic mistake: at each step, swapping with any of the 52 cards
    // rather than only those not yet placed. Some orders come up more often.
    const random = seeded(7);
    const result = testShuffleUniformity(20_000, () => random(52));
    expect(result.uniform).toBe(false);
    expect(result.statistic).toBeGreaterThan(result.critical);
  });
});
