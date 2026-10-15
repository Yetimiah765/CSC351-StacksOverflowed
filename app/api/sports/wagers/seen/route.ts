import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../../../../lib/supabase';
import { getPlayerIdForToken } from '../../../../../lib/auth';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

async function requirePlayerId(request: Request, supabase: SupabaseClient) {
  const token = getToken(request);
  if (!token) return { playerId: null, errorResponse: Response.json({ error: 'Unauthorized' }, { status: 401 }) };

  const playerId = await getPlayerIdForToken(supabase, token);
  if (playerId === null) {
    return { playerId: null, errorResponse: Response.json({ error: 'Your session has expired. Log in again.' }, { status: 401 }) };
  }

  return { playerId, errorResponse: null };
}

// Called when the player closes the results pop-up (SRS-209.1, SRS-210.2,
// SRS-210.4). Body: { ids: number[] }. Marks those settled wagers as seen so
// the pop-up never shows them again, on any device. Only the player's own,
// already-settled wagers are touched.
export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { playerId, errorResponse } = await requirePlayerId(request, supabase);
  if (errorResponse) return errorResponse;

  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body!.ids : null;
  if (!ids || ids.length === 0 || ids.length > 100 || !ids.every((id) => Number.isInteger(id) && (id as number) > 0)) {
    return Response.json({ error: 'ids must be a list of wager ids.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('wagers')
    .update({ result_seen_at: new Date().toISOString() })
    .eq('player_id', playerId!)
    .in('wager_id', ids as number[])
    .not('result', 'is', null)
    .is('result_seen_at', null);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true }, { status: 200 });
}
