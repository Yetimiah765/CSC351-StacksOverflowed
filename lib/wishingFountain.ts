// Wishing fountain rules shared by the API route and the home page (UR-129).
// Kept free of Node-only imports so the page can use them too.

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
