import { describe, expect, it } from 'vitest';
import { RESULT_BANNER_MS, spinButtonLabel, spinOutcome } from '../../lib/roulette/result';

describe('spinOutcome (SRS-303.5)', () => {
  it('is a win, with the amount won, when the bets returned more than was staked', () => {
    expect(spinOutcome(60, 1800)).toEqual({ mood: 'win', amount: 1740 });
  });

  it('is a loss, with the amount lost, when they returned less', () => {
    expect(spinOutcome(60, 0)).toEqual({ mood: 'loss', amount: 60 });
    // Some bets won, but not enough to cover the rest.
    expect(spinOutcome(30, 20)).toEqual({ mood: 'loss', amount: 10 });
  });

  it('breaks even, with neither animation, when they returned exactly the stake', () => {
    // e.g. 10 on Red and 10 on Black when a red number comes up.
    expect(spinOutcome(20, 20)).toEqual({ mood: 'even', amount: 0 });
  });

  it('shows the animation long enough to see', () => {
    expect(RESULT_BANNER_MS).toBeGreaterThanOrEqual(2000);
  });
});

describe('spinButtonLabel (SRS-302.4)', () => {
  it('says why Spin is disabled when there are no bets', () => {
    expect(spinButtonLabel(false, false)).toBe('Place a bet to spin');
  });

  it('says Spin when there are bets to spin', () => {
    expect(spinButtonLabel(false, true)).toBe('Spin');
  });

  it('says Spinning while a spin is in progress', () => {
    expect(spinButtonLabel(true, true)).toBe('Spinning…');
    expect(spinButtonLabel(true, false)).toBe('Spinning…');
  });
});
