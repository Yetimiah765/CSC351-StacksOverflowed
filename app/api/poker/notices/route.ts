import { getSupabaseClient } from '../../../../lib/supabase';
import { getPlayerIdForToken } from '../../../../lib/auth';
import { takeRemovalNotices } from '../../../../lib/pokerPersistence';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

// SRS-9.12: the signed-in player's poker removal notices they haven't seen —
// removed from a seat (too long disconnected, too many timeouts, or busted
// without choosing) while they weren't there to be told — handed over once:
// they're marked delivered as they're returned. POST, since it changes them.
export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const token = getToken(request);
  if (!token) return Response.json({ error: 'You must be signed in.' }, { status: 401 });

  const playerId = await getPlayerIdForToken(supabase, token);
  if (playerId === null) {
    return Response.json({ error: 'Your session has expired. Please log in again.' }, { status: 401 });
  }

  const notices = await takeRemovalNotices(supabase, playerId);
  if (notices === null) return Response.json({ error: 'Unable to load your notices.' }, { status: 500 });
  return Response.json({ notices });
}
