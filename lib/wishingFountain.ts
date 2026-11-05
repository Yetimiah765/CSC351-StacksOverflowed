// Wishing fountain rules shared by the API route and the home page (UR-129).
// Kept free of Node-only imports so the page can use them too.

// SRS-129.3: a wish returns 2 coins with a 60% chance, otherwise nothing.
// The database accepts only these two rewards.
export const WISH_REWARD = 2;
export const WISH_WIN_PERCENT = 60;

/**
 * Maps a uniformly random whole number from 0 to 99 to a wish's reward, so
 * the 2 coins come back for exactly WISH_WIN_PERCENT of that range: 0-59
 * gives 2 coins, 60-99 nothing.
 */
export function pickWishReward(roll: number): number {
  if (!Number.isInteger(roll) || roll < 0 || roll >= 100) {
    throw new RangeError(`roll must be a whole number from 0 to 99, got ${roll}`);
  }
  return roll < WISH_WIN_PERCENT ? WISH_REWARD : 0;
}

// SRS-129.2: one wish per calendar day, midnight to midnight Eastern time,
// like the holiday blind boxes. The database enforces this too.
export const WISH_TIME_ZONE = 'America/New_York';

/** The date and time an instant shows on a clock in Eastern time. */
function easternClock(instant: number) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: WISH_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)!.value);
  return { year: part('year'), month: part('month'), day: part('day'), hour: part('hour'), minute: part('minute'), second: part('second') };
}

/** Today's date in Eastern time, as YYYY-MM-DD: the day a wish made now counts for. */
export function wishDay(now: number = Date.now()): string {
  const { year, month, day } = easternClock(now);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** When the next calendar day starts in Eastern time, and with it the next wish (ms since 1970). */
export function nextWishAt(now: number = Date.now()): number {
  const { year, month, day } = easternClock(now);
  // Midnight starting tomorrow as if Eastern time were UTC, then moved by
  // how far Eastern time is behind UTC then (worked out twice, in case the
  // clocks change in between).
  const midnight = Date.UTC(year, month - 1, day + 1);
  const behind = (instant: number) => {
    const clock = easternClock(instant);
    return Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second) - Math.floor(instant / 1000) * 1000;
  };
  const first = midnight - behind(midnight);
  return midnight - behind(first);
}

/** Milliseconds until a time, or 0 if it has passed. */
export function msUntil(at: string | number | null, now: number = Date.now()): number {
  if (at === null) return 0;
  return Math.max(0, (typeof at === 'number' ? at : Date.parse(at)) - now);
}

// SRS-129.4: where today's coin lies in the fountain once tossed, metres from
// its middle, kept for the browser tab (sessionStorage) as { day, x, z }, so
// coming back to the home page shows it where it sank.
export const WISH_COIN_KEY = 'wishing-fountain-coin';

export function serializeCoinSpot(spot: { x: number; z: number }, day: string): string {
  return JSON.stringify({ day, x: spot.x, z: spot.z });
}

/** The remembered coin, if it was tossed on `day`. */
export function parseCoinSpot(raw: string | null, day: string): { x: number; z: number } | null {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as { day?: unknown; x?: unknown; z?: unknown };
    if (saved.day !== day || typeof saved.x !== 'number' || typeof saved.z !== 'number' || !Number.isFinite(saved.x) || !Number.isFinite(saved.z)) return null;
    return { x: saved.x, z: saved.z };
  } catch {
    return null;
  }
}
