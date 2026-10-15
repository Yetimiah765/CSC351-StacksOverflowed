import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../../../../lib/supabase';
import { getPlayerIdForToken } from '../../../../../lib/auth';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

// Only logged-in players can cancel their wagers.
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
  status: 'cancelled' | 'not_found' | 'wager_not_found' | 'already_settled' | 'too_late';
  wager_id?: number;
  refund?: number;
  balance?: number;
  result?: string;
}

// SRS-205.6: cancels one of the player's open wagers and returns the stake, up to 1 hour
// before its game starts. fn_cancel_wager checks ownership, that the wager is
// still open, and the cutoff, and does the refund in one transaction.
export async function DELETE(request: Request, { params }: { params: { wagerId: string } }) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { playerId, errorResponse } = await requirePlayerId(request, supabase);
  if (errorResponse) return errorResponse;

  if (!/^\d+$/.test(params.wagerId)) return Response.json({ error: 'That bet does not exist.' }, { status: 404 });

  const { data, error } = await supabase.rpc('fn_cancel_wager', {
    p_player_id: playerId,
    p_wager_id: Number(params.wagerId),
  });

  if (error) {
    console.error('fn_cancel_wager failed:', error.message);
    return Response.json({ error: 'Could not cancel your bet. It is still active. Please try again.' }, { status: 500 });
  }

  const result = data as CancelResult;
  switch (result.status) {
    case 'cancelled':
      return Response.json({ wagerId: result.wager_id, refund: result.refund, balance: result.balance }, { status: 200 });
    case 'too_late':
      return Response.json(
        { error: 'Bets can only be cancelled until 1 hour before the game starts.' },
        { status: 409 },
      );
    case 'already_settled':
      return Response.json({ error: 'This bet has already been settled.' }, { status: 409 });
    case 'wager_not_found':
      return Response.json({ error: 'That bet does not exist.' }, { status: 404 });
    default:
      return Response.json({ error: 'Player not found.' }, { status: 404 });
  }
}
