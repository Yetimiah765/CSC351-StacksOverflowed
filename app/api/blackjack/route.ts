import { getSupabaseClient } from '../../../lib/supabase';
import { handView } from '../../../lib/blackjack';
import { requirePlayerId } from './auth';
import { finishBusy, getHand, startBusy } from './hands';
import { refundLostRounds } from './record';

// The player's hand in play, if any, so a refresh picks up where they left
// off: { hand: BlackjackHandView | null, refunded }. The dealer's face-down
// card and the deck are never sent. Any round the server lost (e.g. in a
// restart) has its bets returned first; `refunded` is how many coins.
export async function GET(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { playerId, errorResponse } = await requirePlayerId(request, supabase);
  if (errorResponse) return errorResponse;

  // Skipped while a deal or move is running: its round may not be in memory yet.
  let refunded = 0;
  if (startBusy(playerId!)) {
    try {
      refunded = await refundLostRounds(supabase, playerId!, getHand(playerId!)?.handId);
    } finally {
      finishBusy(playerId!);
    }
  }

  const stored = getHand(playerId!);
  const hand = stored ? handView(stored.handId, stored.bet, stored.state, null) : null;
  return Response.json({ hand, refunded }, { status: 200 });
}
