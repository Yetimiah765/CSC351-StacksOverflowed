import { getSupabaseClient } from '../../../../lib/supabase';
import { getPlayerIdForToken } from '../../../../lib/auth';
import { getPokerTableConfig } from '../../../../lib/pokerTables';
import { getPokerServerSecret, signPresenceTicket } from '../../../../lib/pokerSecure';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

// SRS-10.2: a presence ticket for one table, for the signed-in player. Their
// page tracks it on the table's Realtime channel while they're seated, so the
// poker server sees the moment that page's connection ends and can mark them
// disconnected. The ticket names the player (from the session token, never
// the request) and the table, and is signed with POKER_SERVER_SECRET
// (lib/pokerSecure.ts), so a page can't track presence as somebody else.
export async function POST(request: Request) {
  const secret = getPokerServerSecret();
  if (!secret) return Response.json({ error: 'POKER_SERVER_SECRET is not configured.' }, { status: 500 });

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const token = getToken(request);
  if (!token) return Response.json({ error: 'You must be signed in to play.' }, { status: 401 });

  const playerId = await getPlayerIdForToken(supabase, token);
  if (playerId === null) {
    return Response.json({ error: 'Your session has expired. Please log in again.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { tableId?: unknown } | null;
  if (!body || typeof body.tableId !== 'string' || !getPokerTableConfig(body.tableId)) {
    return Response.json({ error: 'Unknown poker table.' }, { status: 400 });
  }

  return Response.json({ ticket: signPresenceTicket(body.tableId, playerId, Date.now(), secret) });
}
