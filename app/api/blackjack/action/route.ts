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
import { changeBalance, finishBusy, getHand, saveHand, startBusy } from '../hands';
import { recordRound, refundLostRounds } from '../record';

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
    const found = await getHand(supabase, playerId!);
    if (!found.ok) return Response.json({ error: 'Unable to load your hand. Please try again.' }, { status: 500 });
    const stored = found.hand;
    if (!stored) {
      // The server may have lost the hand: return its bets.
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
    // Saved only if the round is still where this request found it, so a
    // move that reached another copy of the server first wins and this one
    // is undone. A lost round returns everything staked on it, so the row's
    // bet includes any new bet.
    const fromStep = stored.state.step;
    const saved = outcome
      ? await recordRound(supabase, playerId!, handId, stored.bet, state, outcome, stored.startedAt, fromStep)
      : await saveHand(supabase, handId, fromStep, { bet: stored.bet, state }, totalStake(stored.bet, state));
    if (saved !== 'saved') {
      if (cost > 0) {
        const returned = await changeBalance(supabase, playerId!, cost);
        if (!returned.ok) console.error(`Blackjack: failed to return ${cost} to player ${playerId}: ${returned.error}`);
      }
      return saved === 'moved'
        ? Response.json({ error: 'That hand already moved on, maybe in another tab.' }, { status: 409 })
        : Response.json({ error: 'Your move could not be saved. Please try again.' }, { status: 500 });
    }
    if (!outcome) {
      return Response.json({ hand: handView(handId, stored.bet, state, null), balance }, { status: 200 });
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
