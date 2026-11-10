import { getSupabaseClient } from '../../../lib/supabase';
import { handView } from '../../../lib/blackjack';
import { requirePlayerId } from './auth';
import { getHand } from './hands';
import { refundLostRounds } from './record';

/**
 * How old an open round with no cards saved must be to count as lost here:
 * an older copy of the app, still running during a deploy, saves its rounds'
 * cards only in memory, and may be dealing one right now.
 */
const LOST_AFTER_MS = 30_000;

// The player's hand in play, if any, so a refresh picks up where they left
// off: { hand: BlackjackHandView | null, refunded }. The dealer's face-down
// card and the deck are never sent. Any round the server lost has its bets
// returned first; `refunded` is how many coins.
export async function GET(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { playerId, errorResponse } = await requirePlayerId(request, supabase);
  if (errorResponse) return errorResponse;

  const refunded = await refundLostRounds(supabase, playerId!, LOST_AFTER_MS);

  const found = await getHand(supabase, playerId!);
  if (!found.ok) return Response.json({ error: 'Unable to load your hand.' }, { status: 500 });
  const stored = found.hand;
  const hand = stored ? handView(stored.handId, stored.bet, stored.state, null) : null;
  return Response.json({ hand, refunded }, { status: 200 });
}
