import type { SupabaseClient } from '@supabase/supabase-js';
import type { BlackjackState } from '../../../lib/blackjack';

// Hands in play, kept in this server's memory and keyed by player_id, until
// the database gets somewhere to store them (blackjack_hands has no columns
// for cards yet). Only the server ever sees the face-down card and the deck.
// A server restart forgets every hand in play, and the bets already taken
// for them are lost. Kept on globalThis so a dev-server hot reload doesn't
// wipe it.

export interface StoredHand {
  handId: number;
  bet: number;
  state: BlackjackState;
}

const memory = globalThis as typeof globalThis & {
  __blackjackHands?: Map<number, StoredHand>;
  __blackjackBusy?: Set<number>;
  __blackjackNextHandId?: number;
};
const hands = (memory.__blackjackHands ??= new Map<number, StoredHand>());
// Players with a Deal or a move in flight, so two quick requests (two
// Deals, or a double click) can't both run.
const busy = (memory.__blackjackBusy ??= new Set<number>());

export function getHand(playerId: number): StoredHand | undefined {
  return hands.get(playerId);
}

export function saveHand(playerId: number, hand: StoredHand) {
  hands.set(playerId, hand);
}

export function removeHand(playerId: number) {
  hands.delete(playerId);
}

export function nextHandId(): number {
  memory.__blackjackNextHandId = (memory.__blackjackNextHandId ?? 0) + 1;
  return memory.__blackjackNextHandId;
}

/** Marks a request as started; false if one is already running for the player. */
export function startBusy(playerId: number): boolean {
  if (busy.has(playerId)) return false;
  busy.add(playerId);
  return true;
}

export function finishBusy(playerId: number) {
  busy.delete(playerId);
}

/** For tests: forget every hand. */
export function clearHands() {
  hands.clear();
  busy.clear();
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
