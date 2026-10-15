// Wager rules shared by the bet slip (app/sports/page.tsx) and the place-bet
// route (app/api/sports/wagers/route.ts), so both give the same answer.
// fn_place_wager in supabase/schema.sql checks the same rules again inside
// the transaction.

import { potentialPayout } from './payout';

// Smallest bet a player can place, in coins. Keep in sync with the
// p_amount < 50 check in fn_place_wager.
export const MIN_WAGER = 50;

export type AmountCheck = { ok: true; amount: number } | { ok: false; error: string };

// SRS-206.3: rejects zero, negative, decimal, non-numeric, and below-minimum
// amounts. Accepts a number or the text typed into the bet slip.
export function checkWagerAmount(input: unknown): AmountCheck {
  const text = typeof input === 'number' ? String(input) : typeof input === 'string' ? input.trim() : '';
  if (!/^\d+$/.test(text) || Number(text) <= 0) {
    return { ok: false, error: 'Enter a whole number of coins greater than 0.' };
  }

  const amount = Number(text);
  if (!Number.isSafeInteger(amount)) return { ok: false, error: 'That amount is too large.' };
  if (amount < MIN_WAGER) return { ok: false, error: `The minimum bet is ${MIN_WAGER} coins.` };
  return { ok: true, amount };
}

// A winning bet must pay back more than its stake. At very short odds the
// payout can round down to the stake itself, so such a bet couldn't win
// anything.
export function canWinCoins(amount: number, decimalOdds: number): boolean {
  return potentialPayout(amount, decimalOdds) > amount;
}
