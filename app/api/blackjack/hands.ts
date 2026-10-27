import type { SupabaseClient } from '@supabase/supabase-js';
import { NEXT_HAND_DELAY_MS, type BlackjackState } from '../../../lib/blackjack';

// Hands in play, kept in this server's memory and keyed by player_id, until
// the database gets somewhere to store them (blackjack_hands has no columns
// for cards yet). Only the server ever sees the face-down card and the deck.
// A server restart forgets every hand in play; their bets are then returned
// to the players (refundLostRounds in ./record.ts). Kept on globalThis so a
// dev-server hot reload doesn't wipe it.

export interface StoredHand {
  /** The round's blackjack_hands row (./record.ts). */
  handId: number;
  bet: number;
  state: BlackjackState;
  /** When the round was dealt (ISO time), for the hand history. */
  startedAt: string;
}

const memory = globalThis as typeof globalThis & {
  __blackjackHands?: Map<number, StoredHand>;
  __blackjackBusy?: Set<number>;
  __blackjackNextDeal?: Map<number, number>;
};
const hands = (memory.__blackjackHands ??= new Map<number, StoredHand>());
// Players with a Deal or a move in flight, so two quick requests (two
// Deals, or a double click) can't both run.
const busy = (memory.__blackjackBusy ??= new Set<number>());
// When each player may be dealt their next hand (ms since the epoch).
const nextDeal = (memory.__blackjackNextDeal ??= new Map<number, number>());

/** Starts the wait before the player's next hand, after one ends. */
export function startNextHandDelay(playerId: number) {
  nextDeal.set(playerId, Date.now() + NEXT_HAND_DELAY_MS);
}

/** Milliseconds left before the player's next hand can be dealt; 0 if none. */
export function nextHandWait(playerId: number): number {
  return Math.max(0, (nextDeal.get(playerId) ?? 0) - Date.now());
}

export function getHand(playerId: number): StoredHand | undefined {
  return hands.get(playerId);
}

export function saveHand(playerId: number, hand: StoredHand) {
  hands.set(playerId, hand);
}

export function removeHand(playerId: number) {
  hands.delete(playerId);
}

/** Marks a request as started; false if one is already running for the player. */
export function startBusy(playerId: number): boolean {
  if (busy.has(playerId)) return false;
  busy.add(playerId);
  return true;
}

export function isBusy(playerId: number): boolean {
  return busy.has(playerId);
}

export function finishBusy(playerId: number) {
  busy.delete(playerId);
}

/** For tests: forget every hand. */
export function clearHands() {
  hands.clear();
  busy.clear();
  nextDeal.clear();
}

// PostgREST calls can't share a transaction, so balance changes are an
// optimistic-lock read-then-conditional-update (matching the balance just
// read), retried on a lost race — the same approach as the poker buy-in's
// deductBalance() in server/pokerRealtimeServer.ts.
const BALANCE_WRITE_ATTEMPTS = 3;

export type BalanceChange = { ok: true; balance: number } | { ok: false; status: number; error: string };

/**
 * Adds `delta` coins to the player's balance (negative to take a bet).
 * Taking coins requires an Active account and enough balance (SRS-901.2).
 */
export async function changeBalance(supabase: SupabaseClient, playerId: number, delta: number): Promise<BalanceChange> {
  for (let attempt = 0; attempt < BALANCE_WRITE_ATTEMPTS; attempt++) {
    const { data: player, error: readError } = await supabase
      .from('players')
      .select('balance, account_status')
      .eq('player_id', playerId)
      .maybeSingle();

    if (readError) return { ok: false, status: 500, error: 'Unable to read your balance.' };
    if (!player) return { ok: false, status: 404, error: 'Player not found.' };
    if (delta < 0 && player.account_status !== 'Active') {
      return { ok: false, status: 403, error: 'Accounts pending deletion cannot play.' };
    }
    if (player.balance + delta < 0) return { ok: false, status: 409, error: 'That bet is more than your balance.' };

    const { data: updated, error: updateError } = await supabase
      .from('players')
      .update({ balance: player.balance + delta })
      .eq('player_id', playerId)
      .eq('balance', player.balance)
      .select('balance');

    if (updateError) return { ok: false, status: 500, error: 'Unable to update your balance.' };
    if (updated && updated.length > 0) return { ok: true, balance: updated[0].balance };
    // Balance changed between the read and the write — try again.
  }
  return { ok: false, status: 409, error: 'Your balance just changed. Please try again.' };
}
