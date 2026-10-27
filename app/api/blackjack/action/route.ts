import { getSupabaseClient } from '../../../../lib/supabase';
import {
  canDouble,
  canSplit,
  handView,
  isBlackjackMove,
  moveCost,
  playMove,
  totalStake,
} from '../../../../lib/blackjack';
import { requirePlayerId } from '../auth';
import { changeBalance, finishBusy, getHand, removeHand, saveHand, startBusy } from '../hands';
import { recordRound, refundLostRounds, saveStake } from '../record';

// Hit, Stand, Double, or Split (SRS-903.1, SRS-904.1, SRS-910, SRS-911) on
// the hand being played. Body: { handId, move, step }, where `step` is the
// round's step from the view the player clicked on: if the round has moved on
// since (a double click), the move is refused instead of being played twice.
// Double and Split first take another bet equal to the original (SRS-910.2,
// SRS-911.2). When the last hand is done the dealer plays and every hand is
// settled (SRS-906.1, SRS-907.1, SRS-911.6); the round's winnings and pushed
// bets are then paid back in one balance change (SRS-908.1), and the
// round is saved to the hand history (SRS-909.1). Returns { hand, balance? }
// — balance only when it changed. With no round in play (404), any round the
// server lost has its bets returned: { error, refunded }.
export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { playerId, errorResponse } = await requirePlayerId(request, supabase);
  if (errorResponse) return errorResponse;

  let body: { handId?: unknown; move?: unknown; step?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { handId, move, step } = body ?? {};
  if (typeof handId !== 'number' || typeof step !== 'number' || !Number.isSafeInteger(handId) || !isBlackjackMove(move)) {
    return Response.json(
      { error: 'Send a handId, the step, and a move of "hit", "stand", "double", or "split".' },
      { status: 400 }
    );
  }

  if (!startBusy(playerId!)) {
    return Response.json({ error: 'Your last move is still being played.' }, { status: 409 });
  }

  try {
    const stored = getHand(playerId!);
    if (!stored) {
      // The server may have lost the hand (e.g. in a restart): return its bets.
      const refunded = await refundLostRounds(supabase, playerId!);
      return Response.json({ error: 'You have no hand in play.', refunded }, { status: 404 });
    }
    if (stored.handId !== handId || stored.state.step !== step) {
      return Response.json({ error: 'That hand already moved on, maybe in another tab.' }, { status: 409 });
    }
    if (move === 'double' && !canDouble(stored.state)) {
      return Response.json({ error: 'You can only double on a hand’s first two cards.' }, { status: 409 });
    }
    if (move === 'split' && !canSplit(stored.state)) {
      return Response.json({ error: 'You can only split a pair, once.' }, { status: 409 });
    }

    // SRS-910.1 / 911.1: refused, with nothing taken, without enough coins.
    let balance: number | undefined;
    const cost = moveCost(stored.bet, move);
    if (cost > 0) {
      const taken = await changeBalance(supabase, playerId!, -cost);
      if (!taken.ok) {
        const error = taken.status === 409 ? `You need another ${cost.toLocaleString()} coins to ${move}.` : taken.error;
        return Response.json({ error }, { status: taken.status });
      }
      balance = taken.balance;
    }

    const { state, outcome } = playMove(stored.bet, stored.state, move);
    // A lost round returns everything staked on it, the new bet included.
    if (cost > 0) await saveStake(supabase, handId, totalStake(stored.bet, state));
    if (!outcome) {
      saveHand(playerId!, { ...stored, state });
      return Response.json({ hand: handView(handId, stored.bet, state, null), balance }, { status: 200 });
    }

    removeHand(playerId!);
    // If the round can't be saved, its open row returns the bets instead.
    if (!(await recordRound(supabase, playerId!, handId, stored.bet, state, outcome, stored.startedAt))) {
      return Response.json({ error: 'The hand could not be saved, so your bets will be returned.' }, { status: 500 });
    }
    const view = handView(handId, stored.bet, state, outcome);
    const payout = totalStake(stored.bet, state) + outcome.net;
    if (payout <= 0) return Response.json({ hand: view, balance }, { status: 200 });

    const paid = await changeBalance(supabase, playerId!, payout);
    if (!paid.ok) {
      console.error(`Blackjack: failed to pay ${payout} to player ${playerId}: ${paid.error}`);
      return Response.json({ error: 'Your winnings could not be paid. Please contact support.' }, { status: 500 });
    }
    return Response.json({ hand: view, balance: paid.balance }, { status: 200 });
  } finally {
    finishBusy(playerId!);
  }
}
