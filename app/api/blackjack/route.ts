import { getSupabaseClient } from '../../../lib/supabase';
import { handView } from '../../../lib/blackjack';
import { requirePlayerId } from './auth';
import { getHand, isBusy } from './hands';
import { refundLostRounds } from './record';

/** How old an open round with no hand in memory must be to count as lost here. */
const LOST_AFTER_MS = 30_000;

// The player's hand in play, if any, so a refresh picks up where they left
// off: { hand: BlackjackHandView | null, refunded }. The dealer's face-down
// card and the deck are never sent. Any round the server lost (e.g. in a
// restart) has its bets returned first; `refunded` is how many coins.
export async function GET(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { playerId, errorResponse } = await requirePlayerId(request, supabase);
  if (errorResponse) return errorResponse;

  // Without holding up the player's moves: skipped while a deal or move is
  // running, and only for rounds dealt a while ago, so a round being dealt
  // right now (its row saved, not yet in memory) isn't taken for a lost one.
  const refunded = isBusy(playerId!)
    ? 0
    : await refundLostRounds(supabase, playerId!, getHand(playerId!)?.handId, LOST_AFTER_MS);

  const stored = getHand(playerId!);
  const hand = stored ? handView(stored.handId, stored.bet, stored.state, null) : null;
  return Response.json({ hand, refunded }, { status: 200 });
}
