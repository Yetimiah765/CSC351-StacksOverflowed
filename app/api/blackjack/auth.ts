import type { SupabaseClient } from '@supabase/supabase-js';
import { getPlayerIdForToken } from '../../../lib/auth';

// Shared by the blackjack routes: only logged-in players can play.
export async function requirePlayerId(request: Request, supabase: SupabaseClient) {
  const auth = request.headers.get('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return { playerId: null, errorResponse: Response.json({ error: 'Log in to play blackjack.' }, { status: 401 }) };
  }

  const playerId = await getPlayerIdForToken(supabase, token);
  if (playerId === null) {
    return {
      playerId: null,
      errorResponse: Response.json({ error: 'Your session has expired. Log in again.' }, { status: 401 }),
    };
  }

  return { playerId, errorResponse: null };
}
