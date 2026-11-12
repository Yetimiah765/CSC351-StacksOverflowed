// SRS-NFR-023: npm run test:shuffle. Shuffles a deck 1,000,000 times with the
// poker server's own random source (crypto.randomInt, as startHand() is
// given) and runs the chi-square test in lib/shuffleUniformity.ts. Exits 1 if
// the shuffle isn't uniform at the 0.01 level. Takes a minute or two.

import { randomInt } from 'crypto';
import { SHUFFLE_TEST_COUNT, SIGNIFICANCE, testShuffleUniformity } from '../lib/shuffleUniformity';

const started = Date.now();
const result = testShuffleUniformity(SHUFFLE_TEST_COUNT, (n) => randomInt(n));
const seconds = ((Date.now() - started) / 1000).toFixed(1);

// eslint-disable-next-line no-console
console.log(
  `${result.shuffles.toLocaleString()} shuffles in ${seconds} s: chi-square ${result.statistic.toFixed(1)} on ` +
    `${result.degreesOfFreedom} degrees of freedom; critical value at ${SIGNIFICANCE} is ${result.critical.toFixed(1)}.`
);
// eslint-disable-next-line no-console
console.log(result.uniform ? 'Uniform (SRS-NFR-023 met).' : 'NOT uniform (SRS-NFR-023 not met).');
process.exit(result.uniform ? 0 : 1);
