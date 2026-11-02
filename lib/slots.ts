// Slot machine rules from the SRS, shared by the slot machine page and its
// API routes. Pure and DB-free.

// SRS-306.1: the bet selected when the page loads.
export const DEFAULT_SLOT_BET = 5;

/** The bet to select on page load: 5 coins, or the smallest amount if 5 isn't offered. */
export function initialSlotBet(betAmounts: number[]): number | null {
  if (betAmounts.includes(DEFAULT_SLOT_BET)) return DEFAULT_SLOT_BET;
  return betAmounts.length > 0 ? Math.min(...betAmounts) : null;
}
