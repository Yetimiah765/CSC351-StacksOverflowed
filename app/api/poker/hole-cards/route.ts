import { getSupabaseClient } from '../../../../lib/supabase';
import { getPlayerIdForToken } from '../../../../lib/auth';
import { getPokerServerSecret, openHoleCards } from '../../../../lib/pokerSecure';
import type { PokerHoleCardsRequest } from '../../../../lib/pokerRealtime';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

// SRS-6.1: opens the caller's own sealed hole cards from the table's `state`
// broadcast. The key comes from the player_id the session token resolves to
// — never from anything in the request — so sending someone else's sealed
// cards just fails to open. Nothing is stored; the cards only exist sealed
// in the broadcast and in the poker server's memory.
export async function POST(request: Request) {
  const secret = getPokerServerSecret();
  if (!secret) return Response.json({ error: 'POKER_SERVER_SECRET is not configured.' }, { status: 500 });

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const playerId = await getPlayerIdForToken(supabase, token);
  if (playerId === null) return Response.json({ error: 'Invalid or expired session.' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Partial<PokerHoleCardsRequest> | null;
  if (
    !body ||
    typeof body.tableId !== 'string' ||
    typeof body.handNumber !== 'number' ||
    typeof body.sealed !== 'string'
  ) {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const cards = openHoleCards(secret, body.tableId, body.handNumber, String(playerId), body.sealed);
  if (!cards) return Response.json({ error: 'Those cards are not yours.' }, { status: 403 });

  return Response.json({ cards }, { status: 200 });
}
