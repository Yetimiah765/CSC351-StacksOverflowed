import { getSupabaseClient } from '../../../../lib/supabase';
import { requirePlayerId } from '../auth';
import type { BlackjackHistoryEntry } from '../../../../lib/blackjack';
import { HISTORY_LIMIT } from '../record';

// SRS-909.1: the player's most recent finished blackjack hands, newest first,
// each with its bet, result, and coins won or lost. Returns
// { hands: BlackjackHistoryEntry[] }; only the logged-in player's own hands.
export async function GET(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { playerId, errorResponse } = await requirePlayerId(request, supabase);
  if (errorResponse) return errorResponse;

  const { data, error } = await supabase
    .from('blackjack_hands')
    .select('hand_id, bet_amount, result, net_amount, completed_at')
    .eq('player_id', playerId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .order('hand_id', { ascending: false })
    .limit(HISTORY_LIMIT);

  if (error) {
    console.error('Loading the blackjack history failed:', error.message);
    return Response.json({ error: 'Could not load your hand history. Please try again.' }, { status: 500 });
  }

  const hands: BlackjackHistoryEntry[] = (data ?? []).map((row) => ({
    handId: row.hand_id,
    bet: Number(row.bet_amount),
    result: row.result,
    net: Number(row.net_amount),
    completedAt: row.completed_at,
  }));
  return Response.json({ hands }, { status: 200 });
}
