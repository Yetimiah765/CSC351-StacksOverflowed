// Daily Login Box rules shared by the API route and the shop page (UR-128).
// Kept free of Node-only imports so the page can show the odds too.

// SRS-128.5 / SRS-128.6: the four possible rewards and their chances, in
// percent. The percentages must add up to 100.
export const DAILY_LOGIN_BOX_REWARDS = [
  { amount: 250, percent: 40 },
  { amount: 500, percent: 30 },
  { amount: 750, percent: 20 },
  { amount: 1000, percent: 10 },
] as const;

// SRS-128.11: one box per 24 hours. The database enforces this too.
export const DAILY_LOGIN_BOX_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Maps a uniformly random whole number from 0 to 99 to a reward, so each
 * amount covers exactly its percentage of that range: 0-39 gives 250 coins,
 * 40-69 gives 500, 70-89 gives 750, and 90-99 gives 1,000.
 */
export function pickDailyLoginBoxReward(roll: number): number {
  if (!Number.isInteger(roll) || roll < 0 || roll >= 100) {
    throw new RangeError(`roll must be a whole number from 0 to 99, got ${roll}`);
  }

  let threshold = 0;
  for (const reward of DAILY_LOGIN_BOX_REWARDS) {
    threshold += reward.percent;
    if (roll < threshold) return reward.amount;
  }
  throw new Error('Daily Login Box percentages must add up to 100.');
}

/** Milliseconds until the next box, or 0 if it is available now. */
export function msUntilAvailable(nextAvailableAt: string | null, now: number = Date.now()): number {
  if (!nextAvailableAt) return 0;
  return Math.max(0, Date.parse(nextAvailableAt) - now);
}

/** Formats a countdown as HH:MM:SS (SRS-128.13). */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}
