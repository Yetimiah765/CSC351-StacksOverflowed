import { getSupabaseClient } from '../../../../lib/supabase';
import { hashSessionToken } from '../../../../lib/auth';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

// SRS-105.1: logging out deletes the session row, so the token stops working
// even if a copy of it is still sitting in some browser. Matching on the
// token's hash (not player_id) means an old token can't end a newer session
// the player started elsewhere (SRS-103.5).
export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase.from('player_sessions').delete().eq('token_hash', hashSessionToken(token));
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ success: true }, { status: 200 });
}
