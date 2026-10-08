import { getSupabaseClient } from '../../../../lib/supabase';
import { getPlayerIdForToken } from '../../../../lib/auth';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

// SRS-109.1: the nav bar shows the player's balance on every page, so this
// returns just that number rather than the full profile from GET
// /api/profile, whose profile photo can be several MB.
export async function GET(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const playerId = await getPlayerIdForToken(supabase, token);
  if (playerId === null) return Response.json({ error: 'Invalid or expired session.' }, { status: 401 });

  const { data, error } = await supabase
    .from('players')
    .select('balance')
    .eq('player_id', playerId)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: 'Player not found.' }, { status: 404 });

  return Response.json({ balance: data.balance }, { status: 200 });
}
