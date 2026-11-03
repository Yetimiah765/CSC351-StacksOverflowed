// What the roulette page shows once a spin's result is displayed: whether it
// was a win, a loss, or broke even (SRS-303.5), and what the Spin controls
// say. Pure and DB-free.

export type SpinMood = 'win' | 'loss' | 'even';

// SRS-303.5: how long the win or loss animation stays over the wheel.
export const RESULT_BANNER_MS = 2800;

/** A spin's net result: what its bets returned minus what was staked (SRS-303.5). */
export function spinOutcome(staked: number, returned: number): { mood: SpinMood; amount: number } {
  const net = returned - staked;
  if (net > 0) return { mood: 'win', amount: net };
  if (net < 0) return { mood: 'loss', amount: -net };
  return { mood: 'even', amount: 0 };
}

/**
 * The Spin button's label. It stays disabled with no bets (SRS-302.4) but
 * says why, rather than only looking greyed out.
 */
export function spinButtonLabel(spinning: boolean, hasBets: boolean): string {
  if (spinning) return 'Spinning…';
  return hasBets ? 'Spin' : 'Place a bet to spin';
}
