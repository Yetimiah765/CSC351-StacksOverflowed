import { getSupabaseClient } from '../../../../lib/supabase';
import { canDouble, handView, isBlackjackMove, playMove } from '../../../../lib/blackjack';
import { requirePlayerId } from '../auth';
import { changeBalance, finishBusy, getHand, removeHand, saveHand, startBusy } from '../hands';

// Hit, Stand, or Double (SRS-903.1, SRS-904.1, SRS-910). Body:
// { handId, move, cards }, where `cards` is how many cards the player's hand
// had when they clicked: if the hand has moved on since (a double click), the
// move is refused instead of being played twice. Plays the move on the hand
// in memory, including the dealer's turn and the result once the hand ends
// (SRS-906.1, SRS-907.1), and pays out a win or push (SRS-908.1). Double
// first takes a second bet equal to the first (SRS-910.2). Returns
// { hand, balance? } — balance only when it changed.
export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { playerId, errorResponse } = await requirePlayerId(request, supabase);
  if (errorResponse) return errorResponse;

  let body: { handId?: unknown; move?: unknown; cards?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { handId, move, cards } = body ?? {};
  if (
    typeof handId !== 'number' ||
    typeof cards !== 'number' ||
    !Number.isSafeInteger(handId) ||
    !isBlackjackMove(move)
  ) {
    return Response.json(
      { error: 'Send a handId, the number of cards, and a move of "hit", "stand", or "double".' },
      { status: 400 }
    );
  }

  if (!startBusy(playerId!)) {
    return Response.json({ error: 'Your last move is still being played.' }, { status: 409 });
  }

  try {
    const stored = getHand(playerId!);
    if (!stored) return Response.json({ error: 'You have no hand in play.' }, { status: 404 });
    if (stored.handId !== handId || stored.state.playerCards.length !== cards) {
      return Response.json({ error: 'That hand already moved on. Refresh to see it.' }, { status: 409 });
    }

    let balance: number | undefined;
    let bet = stored.bet;
    if (move === 'double') {
      if (!canDouble(stored.state)) {
        return Response.json({ error: 'You can only double on your first two cards.' }, { status: 409 });
      }
      // SRS-910.1 / 910.2: refused, with nothing taken, without enough coins.
      const taken = await changeBalance(supabase, playerId!, -stored.bet);
      if (!taken.ok) {
        const error = taken.status === 409 ? 'You need another bet of coins to double.' : taken.error;
        return Response.json({ error }, { status: taken.status });
      }
      balance = taken.balance;
      bet = stored.bet * 2;
    }

    const { state, outcome } = playMove(stored.bet, stored.state, move);
    if (!outcome) {
      saveHand(playerId!, { ...stored, state });
      return Response.json({ hand: handView(handId, bet, state, null) }, { status: 200 });
    }

    removeHand(playerId!);
    const view = handView(handId, bet, state, outcome);
    const payout = bet + outcome.net;
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
