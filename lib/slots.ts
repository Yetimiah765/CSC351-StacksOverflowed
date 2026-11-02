// Slot machine rules from the SRS, shared by the slot machine page and its
// API routes. Pure and DB-free. fn_spin_slots in supabase/schema.sql settles
// spins with the same odds and paytable; keep the two in step.

// SRS-306.1: the bet selected when the page loads.
export const DEFAULT_SLOT_BET = 5;

/** The bet to select on page load: 5 coins, or the smallest amount if 5 isn't offered. */
export function initialSlotBet(betAmounts: number[]): number | null {
  if (betAmounts.includes(DEFAULT_SLOT_BET)) return DEFAULT_SLOT_BET;
  return betAmounts.length > 0 ? Math.min(...betAmounts) : null;
}

export type SlotSymbolName = 'Cherry' | 'Lemon' | 'Orange' | 'Bell' | 'Bar' | 'Seven';

// The SRS's per-reel odds, out of 32 (SRS-307.1). Each reel draws a roll from
// 0 to 31; the first 10 are Cherry, the next 8 Lemon, and so on.
export const REEL_ROLLS = 32;
export const SYMBOL_WEIGHTS: readonly [SlotSymbolName, number][] = [
  ['Cherry', 10],
  ['Lemon', 8],
  ['Orange', 6],
  ['Bell', 4],
  ['Bar', 3],
  ['Seven', 1],
];

/** The symbol a reel shows for a roll from 0 to REEL_ROLLS - 1. */
export function symbolForRoll(roll: number): SlotSymbolName {
  if (!Number.isInteger(roll) || roll < 0 || roll >= REEL_ROLLS) throw new Error(`Not a reel roll: ${roll}`);
  let left = roll;
  for (const [symbol, weight] of SYMBOL_WEIGHTS) {
    if (left < weight) return symbol;
    left -= weight;
  }
  throw new Error('Unreachable');
}

// SRS-309.2: the paytable, best row first, as bet multipliers.
export const PAYTABLE: readonly { label: string; multiplier: number }[] = [
  { label: 'Seven, Seven, Seven', multiplier: 200 },
  { label: 'Bar, Bar, Bar', multiplier: 100 },
  { label: 'Bell, Bell, Bell', multiplier: 50 },
  { label: 'Orange, Orange, Orange', multiplier: 20 },
  { label: 'Lemon, Lemon, Lemon', multiplier: 10 },
  { label: 'Cherry, Cherry, Cherry', multiplier: 6 },
  { label: 'Cherry on reels 1 and 2, any other symbol on reel 3', multiplier: 4 },
];

const THREE_OF_A_KIND: Record<SlotSymbolName, number> = {
  Seven: 200,
  Bar: 100,
  Bell: 50,
  Orange: 20,
  Lemon: 10,
  Cherry: 6,
};

/** The multiplier of the one paytable row the reels match, or 0 (SRS-309.2, SRS-309.3). */
export function payoutMultiplier(reels: readonly SlotSymbolName[]): number {
  const [a, b, c] = reels;
  if (a === b && b === c) return THREE_OF_A_KIND[a];
  if (a === 'Cherry' && b === 'Cherry') return 4;
  return 0;
}

/** Coins a spin pays: the bet times the matched row's multiplier, or 0 (SRS-309.1). */
export function slotPayout(bet: number, reels: readonly SlotSymbolName[]): number {
  return bet * payoutMultiplier(reels);
}
