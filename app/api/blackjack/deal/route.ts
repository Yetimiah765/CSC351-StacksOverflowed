import { randomInt } from 'crypto';
import { getSupabaseClient } from '../../../../lib/supabase';
import { checkBlackjackBet, dealHand, handView } from '../../../../lib/blackjack';
import { requirePlayerId } from '../auth';
import { changeBalance, finishBusy, getHand, saveHand, startBusy } from '../hands';
import { openRound, recordRound, refundLostRounds } from '../record';

// Deal (SRS-901.1, SRS-902.1). Body: { bet }. Returns any bets of rounds the
// server lost, takes the bet out of the balance, opens the round's
// blackjack_hands row, then shuffles with crypto.randomInt (SRS-NFR-5) and
// deals. A deal that is already a blackjack for either side is settled and
// paid at once; otherwise the hand is kept in memory (../hands.ts) for the
// player's moves. Returns { hand, balance }.
export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { playerId, errorResponse } = await requirePlayerId(request, supabase);
  if (errorResponse) return errorResponse;

  let body: { bet?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const check = checkBlackjackBet(body?.bet);
  if (!check.ok) return Response.json({ error: check.error }, { status: 400 });
  const bet = check.amount;

  if (getHand(playerId!) || !startBusy(playerId!)) {
    return Response.json({ error: 'Finish your current hand first.' }, { status: 409 });
  }

  try {
    await refundLostRounds(supabase, playerId!);

    // SRS-901.2: refused, with nothing taken, if the bet is above the balance.
    const taken = await changeBalance(supabase, playerId!, -bet);
    if (!taken.ok) return Response.json({ error: taken.error }, { status: taken.status });

    const startedAt = new Date().toISOString();
    const handId = await openRound(supabase, playerId!, bet, startedAt);
    if (handId === null) {
      const returned = await changeBalance(supabase, playerId!, bet);
      if (!returned.ok) console.error(`Blackjack: failed to return a bet of ${bet} to player ${playerId}: ${returned.error}`);
      return Response.json({ error: 'Could not deal the hand. Please try again.' }, { status: 500 });
    }

    const { state, outcome } = dealHand(bet, (n) => randomInt(n));
    if (!outcome) {
      saveHand(playerId!, { handId, bet, state, startedAt });
      return Response.json({ hand: handView(handId, bet, state, null), balance: taken.balance }, { status: 200 });
    }

    // A blackjack on the deal: save it to the history (SRS-909.1) and pay
    // back the bet plus any winnings now. If it can't be saved, the open
    // row returns the bet instead.
    if (!(await recordRound(supabase, playerId!, handId, bet, state, outcome, startedAt))) {
      return Response.json({ error: 'The hand could not be saved, so your bet will be returned.' }, { status: 500 });
    }
    let balance = taken.balance;
    if (bet + outcome.net > 0) {
      const paid = await changeBalance(supabase, playerId!, bet + outcome.net);
      if (!paid.ok) {
        console.error(`Blackjack: failed to pay ${bet + outcome.net} to player ${playerId}: ${paid.error}`);
        return Response.json({ error: 'Your winnings could not be paid. Please contact support.' }, { status: 500 });
      }
      balance = paid.balance;
    }
    return Response.json({ hand: handView(handId, bet, state, outcome), balance }, { status: 200 });
  } finally {
    finishBusy(playerId!);
  }
}
