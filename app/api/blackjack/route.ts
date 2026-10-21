import { getSupabaseClient } from '../../../lib/supabase';
import { handView } from '../../../lib/blackjack';
import { requirePlayerId } from './auth';
import { getHand } from './hands';

// The player's hand in play, if any, so a refresh picks up where they left
// off: { hand: BlackjackHandView | null }. The dealer's face-down card and
// the deck are never sent.
export async function GET(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { playerId, errorResponse } = await requirePlayerId(request, supabase);
  if (errorResponse) return errorResponse;

  const stored = getHand(playerId!);
  const hand = stored ? handView(stored.handId, stored.bet, stored.state, null) : null;
  return Response.json({ hand }, { status: 200 });
}
