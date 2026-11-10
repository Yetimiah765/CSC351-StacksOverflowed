import { randomInt } from 'crypto';
import { getSupabaseClient } from '../../../../lib/supabase';
import { checkBlackjackBet, dealHand, handView } from '../../../../lib/blackjack';
import { requirePlayerId } from '../auth';
import { changeBalance, finishBusy, getHand, startBusy } from '../hands';
import { openRound, recordRound, refundLostRounds } from '../record';

// Deal (SRS-901.1, SRS-902.1). Body: { bet }. Returns any bets of rounds the
// server lost, takes the bet out of the balance, shuffles with
// crypto.randomInt (SRS-NFR-5) and deals, then opens the round's
// blackjack_hands row. A deal that is already a blackjack for either side is
// settled and paid at once; otherwise the row keeps the round's cards
// (../hands.ts) for the player's moves. Returns { hand, balance }.
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

  // One round at a time per player, whether it's still in play (maybe in
  // another tab) or a Deal/move is still being handled (e.g. a double click).
  // Each refusal says which check fired (`reason`) and logs what the server
  // holds, to tell the two apart when debugging.
  const found = await getHand(supabase, playerId!);
  if (!found.ok) return Response.json({ error: 'Could not deal the hand. Please try again.' }, { status: 500 });
  const inPlay = found.hand;
  if (inPlay) {
    const ageSeconds = Math.round((Date.now() - Date.parse(inPlay.startedAt)) / 1000);
    console.warn(
      `Blackjack deal refused (hand_in_play): player ${playerId} asked to deal a bet of ${bet}, ` +
        `but hand ${inPlay.handId} (bet ${inPlay.bet}, step ${inPlay.state.step}, ` +
        `hand ${inPlay.state.active + 1} of ${inPlay.state.hands.length}) was dealt ${ageSeconds}s ago and isn't finished.`
    );
    return Response.json(
      {
        error:
          `Finish your current hand first: you already have a hand in play (hand #${inPlay.handId}, bet ${inPlay.bet}), ` +
          'maybe in another tab. Hit, Stand, Double or Split to finish it, then deal again. ' +
          "Refresh the page if you can't see it.",
        reason: 'hand_in_play',
        handId: inPlay.handId,
      },
      { status: 409 }
    );
  }
  if (!startBusy(playerId!)) {
    console.warn(
      `Blackjack deal refused (request_in_progress): player ${playerId} asked to deal a bet of ${bet} ` +
        'while another Deal or move of theirs was still being handled (e.g. a double click).'
    );
    return Response.json(
      {
        error: 'Finish your current hand first: your last Deal or move is still being played. Wait a moment, then try again.',
        reason: 'request_in_progress',
      },
      { status: 409 }
    );
  }

  try {
    await refundLostRounds(supabase, playerId!);

    // SRS-901.2: refused, with nothing taken, if the bet is above the balance.
    const taken = await changeBalance(supabase, playerId!, -bet);
    if (!taken.ok) return Response.json({ error: taken.error }, { status: taken.status });

    const { state, outcome } = dealHand(bet, (n) => randomInt(n));

    // The round's row, with its cards for the moves to come. A blackjack on
    // the deal is over already, so its row keeps none: if it then can't be
    // closed, it counts as a lost round and its bet is returned.
    const startedAt = new Date().toISOString();
    const handId = await openRound(supabase, playerId!, bet, startedAt, outcome ? null : { bet, state });
    if (typeof handId !== 'number') {
      const returned = await changeBalance(supabase, playerId!, bet);
      if (!returned.ok) console.error(`Blackjack: failed to return a bet of ${bet} to player ${playerId}: ${returned.error}`);
      if (handId === 'taken') {
        console.warn(`Blackjack deal refused (hand_in_play): player ${playerId} was dealt a hand at the same moment elsewhere.`);
        return Response.json(
          {
            error: 'Finish your current hand first: you already have a hand in play, maybe in another tab. Refresh the page to see it.',
            reason: 'hand_in_play',
          },
          { status: 409 }
        );
      }
      return Response.json({ error: 'Could not deal the hand. Please try again.' }, { status: 500 });
    }

    if (!outcome) {
      return Response.json({ hand: handView(handId, bet, state, null), balance: taken.balance }, { status: 200 });
    }

    // A blackjack on the deal: save it to the history (SRS-909.1) and pay
    // back the bet plus any winnings now. If it can't be saved, the open
    // row returns the bet instead.
    if ((await recordRound(supabase, playerId!, handId, bet, state, outcome, startedAt, null)) !== 'saved') {
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
