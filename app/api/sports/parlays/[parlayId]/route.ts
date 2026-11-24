import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../../../../lib/supabase';
import { getPlayerIdForToken } from '../../../../../lib/auth';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

// Only logged-in players can cancel their parlays.
async function requirePlayerId(request: Request, supabase: SupabaseClient) {
  const token = getToken(request);
  if (!token) return { playerId: null, errorResponse: Response.json({ error: 'Log in to cancel bets.' }, { status: 401 }) };

  const playerId = await getPlayerIdForToken(supabase, token);
  if (playerId === null) {
    return {
      playerId: null,
      errorResponse: Response.json({ error: 'Your session has expired. Log in again.' }, { status: 401 }),
    };
  }
  return { playerId, errorResponse: null };
}

interface CancelResult {
  status: 'cancelled' | 'not_found' | 'parlay_not_found' | 'already_settled' | 'too_late';
  parlay_id?: number;
  refund?: number;
  balance?: number;
  result?: string;
}

// SRS-219.6: cancels one of the player's open parlays, the whole parlay, and
// returns the whole stake, up to 1 hour before the earliest of its games
// starts. fn_cancel_parlay checks ownership, that the parlay is still open,
// and the cutoff, and does the refund in one transaction.
export async function DELETE(request: Request, { params }: { params: { parlayId: string } }) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { playerId, errorResponse } = await requirePlayerId(request, supabase);
  if (errorResponse) return errorResponse;

  if (!/^\d+$/.test(params.parlayId)) return Response.json({ error: 'That parlay does not exist.' }, { status: 404 });

  const { data, error } = await supabase.rpc('fn_cancel_parlay', {
    p_player_id: playerId,
    p_parlay_id: Number(params.parlayId),
  });

  if (error) {
    console.error('fn_cancel_parlay failed:', error.message);
    return Response.json({ error: 'Could not cancel your parlay. It is still active. Please try again.' }, { status: 500 });
  }

  const result = data as CancelResult;
  switch (result.status) {
    case 'cancelled':
      return Response.json({ parlayId: result.parlay_id, refund: result.refund, balance: result.balance }, { status: 200 });
    case 'too_late':
      return Response.json(
        { error: 'Parlays can only be cancelled until 1 hour before their first game starts.' },
        { status: 409 },
      );
    case 'already_settled':
      return Response.json({ error: 'This parlay has already been settled.' }, { status: 409 });
    case 'parlay_not_found':
      return Response.json({ error: 'That parlay does not exist.' }, { status: 404 });
    default:
      return Response.json({ error: 'Player not found.' }, { status: 404 });
  }
}
