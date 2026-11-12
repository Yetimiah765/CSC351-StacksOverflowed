// SRS-NFR-023: is the poker shuffle uniform? Over SHUFFLE_TEST_COUNT
// shuffles, count how often each card lands in each deck position; a uniform
// shuffle puts every card in every position about 1/52 of the time. A
// chi-square test over the 52 x 52 table of counts says whether the counts
// stray from that more than chance allows, at the 0.01 significance level.
//
// scripts/shuffleUniformity.ts runs it for real (npm run test:shuffle) with
// the server's random source, crypto.randomInt; the unit tests check the
// statistics on a seeded generator, so they can't fail by chance.

import { createDeck, shuffleDeck, type Card } from './pokerCards';

/** How many shuffles SRS-NFR-023 asks for. */
export const SHUFFLE_TEST_COUNT = 1_000_000;
/** The significance level it asks for. */
export const SIGNIFICANCE = 0.01;
/** The standard normal quantile for 1 - SIGNIFICANCE (0.99). */
const Z_99 = 2.326347874;

/** counts[position][card index in createDeck()] after `shuffles` shuffles. */
export function positionCounts(shuffles: number, randomIndex: (n: number) => number): number[][] {
  const deck = createDeck();
  const indexOf = new Map<Card, number>(deck.map((card, index) => [card, index]));
  const counts = deck.map(() => deck.map(() => 0));
  for (let i = 0; i < shuffles; i++) {
    shuffleDeck(deck, randomIndex).forEach((card, position) => {
      (counts[position] as number[])[indexOf.get(card) as number] += 1;
    });
  }
  return counts;
}

/**
 * The chi-square statistic for a table of counts against every cell being
 * equally likely, and its degrees of freedom: (rows - 1) x (columns - 1),
 * since every row and every column adds up to the number of shuffles.
 */
export function chiSquare(counts: number[][]): { statistic: number; degreesOfFreedom: number } {
  const rows = counts.length;
  const columns = counts[0]?.length ?? 0;
  const total = counts.reduce((sum, row) => sum + row.reduce((a, b) => a + b, 0), 0);
  const expected = total / (rows * columns);
  let statistic = 0;
  for (const row of counts) for (const observed of row) statistic += (observed - expected) ** 2 / expected;
  return { statistic, degreesOfFreedom: (rows - 1) * (columns - 1) };
}

/**
 * The value a chi-square statistic with `degreesOfFreedom` exceeds only 1% of
 * the time by chance (Wilson-Hilferty, accurate to well under 0.1% this large).
 */
export function criticalValue(degreesOfFreedom: number): number {
  const k = degreesOfFreedom;
  return k * (1 - 2 / (9 * k) + Z_99 * Math.sqrt(2 / (9 * k))) ** 3;
}

/** The whole test: shuffle `shuffles` times and judge the counts. */
export function testShuffleUniformity(shuffles: number, randomIndex: (n: number) => number) {
  const { statistic, degreesOfFreedom } = chiSquare(positionCounts(shuffles, randomIndex));
  const critical = criticalValue(degreesOfFreedom);
  return { shuffles, statistic, degreesOfFreedom, critical, uniform: statistic <= critical };
}
