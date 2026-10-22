import { randomInt } from 'crypto';
import { getSupabaseClient } from '../../../../lib/supabase';
import { checkBlackjackBet, dealHand, handView } from '../../../../lib/blackjack';
import { requirePlayerId } from '../auth';
import { changeBalance, finishBusy, getHand, nextHandId, saveHand, startBusy } from '../hands';

// Deal (SRS-901.1, SRS-902.1). Body: { bet }. Takes the bet out of the
// balance, then shuffles with crypto.randomInt (SRS-NFR-5) and deals. A deal
// that is already a blackjack for either side is settled and paid at once;
// otherwise the hand is kept in memory (../hands.ts) for the player's moves.
// Returns { hand, balance }.
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
    // SRS-901.2: refused, with nothing taken, if the bet is above the balance.
    const taken = await changeBalance(supabase, playerId!, -bet);
    if (!taken.ok) return Response.json({ error: taken.error }, { status: taken.status });

    const handId = nextHandId();
    const { state, outcome } = dealHand(bet, (n) => randomInt(n));
    if (!outcome) {
      saveHand(playerId!, { handId, bet, state });
      return Response.json({ hand: handView(handId, bet, state, null), balance: taken.balance }, { status: 200 });
    }

    // A blackjack on the deal: pay back the bet plus any winnings now.
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
