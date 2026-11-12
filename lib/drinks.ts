// Drinks at the casino floor's bar: the meter that fills as the player
// drinks and goes down slowly over time, and when it makes their view
// slosh about. Pure (no drawing, no storage), so it's unit-tested; the page keeps
// the meter in sessionStorage under DRINK_KEY, so it carries on across a
// game's page and a reload, still going down while they're away.

/** sessionStorage key for the meter. */
export const DRINK_KEY = 'casino-drink-meter';

/** Sips in one drink; each fills SIP_AMOUNT of the meter (0 to 1). */
export const SIPS_PER_DRINK = 3;
export const SIP_AMOUNT = 0.1;
/** One whole drink's worth of the meter: about four drinks fill it. */
export const DRINK_AMOUNT = SIPS_PER_DRINK * SIP_AMOUNT;
/** How long a full meter takes to go all the way down, seconds: ten minutes. */
export const EMPTY_SECONDS = 600;
/**
 * Once the meter is full ("maxed"), the view sloshes about until it has
 * gone back down to here (about two and a half minutes), and the bartender won't serve
 * another drink until then.
 */
export const CLEAR_HEAD_AT = 0.75;

export interface DrinkMeter {
  /** How full, 0 to 1, as of `at`. */
  level: number;
  /** When `level` was right, ms since the epoch. */
  at: number;
  /** Filled to the top, and not yet back down to CLEAR_HEAD_AT. */
  maxed: boolean;
}

export const EMPTY_METER: DrinkMeter = { level: 0, at: 0, maxed: false };

/** The meter as it stands at `now`, having gone down since `at`. */
export function meterAt(meter: DrinkMeter, now: number): DrinkMeter {
  const seconds = Math.max(0, now - meter.at) / 1000;
  const level = Math.max(0, meter.level - seconds / EMPTY_SECONDS);
  return { level, at: Math.max(now, meter.at), maxed: meter.maxed && level >= CLEAR_HEAD_AT };
}

/** A sip (or `amount` of the meter), at `now`: never over full, and full makes it maxed. */
export function addSip(meter: DrinkMeter, now: number, amount = SIP_AMOUNT): DrinkMeter {
  const current = meterAt(meter, now);
  const level = Math.min(1, current.level + amount);
  return { level, at: current.at, maxed: current.maxed || level >= 1 - 1e-9 };
}

/** Whether the bartender will pour another: not while the player's maxed out. */
export function canOrder(meter: DrinkMeter, now: number): boolean {
  return !meterAt(meter, now).maxed;
}

/** How sloshed the view is, 0 to 1: 1 just maxed out, easing to 0 as the meter goes back down to CLEAR_HEAD_AT. */
export function sloshAmount(meter: DrinkMeter, now: number): number {
  const current = meterAt(meter, now);
  if (!current.maxed) return 0;
  return Math.min(1, Math.max(0, (current.level - CLEAR_HEAD_AT) / (1 - CLEAR_HEAD_AT)));
}

/** Seconds until the meter is empty, from `now`. */
export function secondsUntilEmpty(meter: DrinkMeter, now: number): number {
  return meterAt(meter, now).level * EMPTY_SECONDS;
}

export function serializeMeter(meter: DrinkMeter): string {
  return JSON.stringify({ level: meter.level, at: meter.at, maxed: meter.maxed });
}

/** The stored meter, or the empty one if there's nothing (or nothing sensible) stored. */
export function parseMeter(raw: string | null): DrinkMeter {
  if (!raw) return EMPTY_METER;
  try {
    const value = JSON.parse(raw) as Partial<DrinkMeter>;
    const { level, at, maxed } = value;
    if (typeof level !== 'number' || !Number.isFinite(level) || level < 0 || level > 1) return EMPTY_METER;
    if (typeof at !== 'number' || !Number.isFinite(at) || at < 0) return EMPTY_METER;
    return { level, at, maxed: maxed === true };
  } catch {
    return EMPTY_METER;
  }
}

// ---------- stumbling ----------
// While the view sloshes (maxed out), walking now and then turns into a
// stumble: a lurch to one side, slowing them down, the body leaning into it.
// The scene runs stepStumble() each frame and moves and leans the player by
// what it says.

/** How long a stumble lasts, seconds; and how far apart they come while walking (between the two, at random). */
export const STUMBLE_SECONDS = 0.9;
export const STUMBLE_EVERY_MIN = 2.5;
export const STUMBLE_EVERY_MAX = 7;
/** How fast a stumble pushes them sideways at its worst, metres a second; and how far they lean, radians. */
export const STUMBLE_SPEED = 1.2;
export const STUMBLE_LEAN = 0.22;

export interface Stumble {
  /** Seconds of walking until the next one. */
  wait: number;
  /** Seconds into the one under way, or null for none. */
  t: number | null;
  /** Which way it lurches: 1 or -1 (the player's left or right). */
  side: 1 | -1;
}

export function noStumble(random: () => number = Math.random): Stumble {
  return { wait: nextStumbleWait(random), t: null, side: 1 };
}

export function nextStumbleWait(random: () => number = Math.random): number {
  return STUMBLE_EVERY_MIN + random() * (STUMBLE_EVERY_MAX - STUMBLE_EVERY_MIN);
}

/**
 * One frame: `drunk` is how sloshed they are (0 to 1, from sloshAmount), and
 * `walking` whether they're walking. Returns the next state, and for this
 * frame how hard they're pushed sideways (-1 to 1, times STUMBLE_SPEED and
 * `drunk` already counted in), how much of their speed they keep, and their lean.
 */
export function stepStumble(
  state: Stumble,
  delta: number,
  walking: boolean,
  drunk: number,
  random: () => number = Math.random
): { state: Stumble; push: number; keep: number; lean: number } {
  const steady = { push: 0, keep: 1, lean: 0 };
  if (drunk <= 0) return { state: state.t === null ? state : { ...state, t: null, wait: nextStumbleWait(random) }, ...steady };
  if (state.t !== null) {
    const t = state.t + delta;
    if (t >= STUMBLE_SECONDS) return { state: { wait: nextStumbleWait(random), t: null, side: state.side }, ...steady };
    const bump = Math.sin((Math.PI * t) / STUMBLE_SECONDS);
    return {
      state: { ...state, t },
      push: state.side * bump * drunk,
      keep: 1 - 0.6 * bump * drunk,
      lean: state.side * bump * STUMBLE_LEAN * drunk,
    };
  }
  if (!walking) return { state, ...steady };
  const wait = state.wait - delta;
  if (wait > 0) return { state: { ...state, wait }, ...steady };
  return { state: { wait: 0, t: 0, side: random() < 0.5 ? -1 : 1 }, ...steady };
}
