import { getSupabaseClient } from '../../../../lib/supabase';
import { getPlayerIdForToken } from '../../../../lib/auth';
import { fetchLeaderboard } from '../../../../lib/sports/leaderboard';

// SRS-216.1 – 216.6: the weekly sports leaderboard. Anyone can see it; a
// logged-in player (optional Bearer token) also gets their own standing.
// `?week=last` returns the previous week's final board.
export async function GET(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const auth = request.headers.get('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  const playerId = token ? await getPlayerIdForToken(supabase, token) : null;
  const weeksAgo = new URL(request.url).searchParams.get('week') === 'last' ? 1 : 0;

  try {
    return Response.json(await fetchLeaderboard(supabase, playerId, weeksAgo));
  } catch {
    return Response.json({ error: 'Could not load the leaderboard.' }, { status: 500 });
  }
}
