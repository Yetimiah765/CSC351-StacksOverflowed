import type { SupabaseClient } from '@supabase/supabase-js';
import type { BlackjackState } from '../../../lib/blackjack';

// The round in play lives in its open blackjack_hands row (round_state:
// { bet, state }), so every copy of the server, as on the live site, plays
// the same round. Only the server reads it, so the face-down card and the
// deck never reach the browser. A move is saved only if the round is still
// at the step it was read at, so two copies can't both play the same round.

export interface StoredHand {
  /** The round's blackjack_hands row (./record.ts). */
  handId: number;
  bet: number;
  state: BlackjackState;
  /** When the round was dealt (ISO time), for the hand history. */
  startedAt: string;
}

/** What round_state holds. */
export interface RoundState {
  bet: number;
  state: BlackjackState;
}

export type HandLookup = { ok: true; hand: StoredHand | null } | { ok: false };

/** The player's round in play, if any; not ok if it could not be read. */
export async function getHand(supabase: SupabaseClient, playerId: number): Promise<HandLookup> {
  const { data, error } = await supabase
    .from('blackjack_hands')
    .select('hand_id, round_state, started_at')
    .eq('player_id', playerId)
    .is('completed_at', null)
    .not('round_state', 'is', null)
    .maybeSingle();
  if (error) {
    console.error(`Blackjack: could not read the hand of player ${playerId}: ${error.message}`);
    return { ok: false };
  }
  if (!data) return { ok: true, hand: null };
  const round = data.round_state as RoundState;
  return {
    ok: true,
    hand: { handId: data.hand_id, bet: round.bet, state: round.state, startedAt: data.started_at },
  };
}

/**
 * Saves the round's next state and everything staked on it (bet_amount, so a
 * lost round returns all of it), only if the round is still open at
 * `fromStep`. 'moved' if another request moved it first.
 */
export async function saveHand(
  supabase: SupabaseClient,
  handId: number,
  fromStep: number,
  round: RoundState,
  stake: number
): Promise<'saved' | 'moved' | 'error'> {
  const { data, error } = await supabase
    .from('blackjack_hands')
    .update({ round_state: round, bet_amount: stake })
    .eq('hand_id', handId)
    .is('completed_at', null)
    .eq('round_state->state->>step', String(fromStep))
    .select('hand_id');
  if (error) {
    console.error(`Blackjack: could not save hand ${handId}: ${error.message}`);
    return 'error';
  }
  return data?.length ? 'saved' : 'moved';
}

const memory = globalThis as typeof globalThis & { __blackjackBusy?: Set<number> };
// Players with a Deal or a move in flight on this copy of the server, so a
// double click is turned away at once. Requests reaching different copies
// are kept apart by the database (saveHand, and one open row per player).
const busy = (memory.__blackjackBusy ??= new Set<number>());

/** Marks a request as started; false if one is already running for the player. */
export function startBusy(playerId: number): boolean {
  if (busy.has(playerId)) return false;
  busy.add(playerId);
  return true;
}

export function finishBusy(playerId: number) {
  busy.delete(playerId);
}

/** For tests: forget every request in flight. */
export function clearBusy() {
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
