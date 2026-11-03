// How the slot machine's reels move (SRS-307.6), kept out of the component so
// the timing can be tested. Pure and DB-free.

import { SYMBOL_WEIGHTS, type SlotSymbolName } from './slots';

// SRS-307.6: the reels stop left to right, the last within 1.5 s of the result.
export const REEL_STOP_MS = [900, 1200, 1500] as const;

// How many times round each reel goes before it stops; later reels go further.
export const REEL_CYCLES = [3, 4, 5] as const;

const SYMBOLS = SYMBOL_WEIGHTS.map(([symbol]) => symbol);

/** The symbols one reel scrolls past: from what it showed, round `cycles` times, to where it stops. */
export function reelStrip(from: SlotSymbolName, to: SlotSymbolName, cycles: number): SlotSymbolName[] {
  const start = SYMBOLS.indexOf(from);
  const strip = Array.from({ length: cycles * SYMBOLS.length }, (_, i) => SYMBOLS[(start + i) % SYMBOLS.length]);
  return [...strip, to];
}

/** How far up a strip of `length` symbols moves so its last symbol fills the window, as a CSS percentage. */
export function reelStopOffset(length: number): string {
  return `-${((length - 1) / length) * 100}%`;
}
