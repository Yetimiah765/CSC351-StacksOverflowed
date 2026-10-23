import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../../../../lib/supabase';
import { getPlayerIdForToken } from '../../../../../lib/auth';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

// A list of up to 100 positive whole ids; [] when missing, null when malformed.
function idList(value: unknown): number[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100 || !value.every((id) => Number.isInteger(id) && id > 0)) return null;
  return value as number[];
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
// SRS-210.4). Body: { ids?: number[], showdownEntryIds?: number[] } (wager
// ids and Showdown entry ids). Marks them as seen so the pop-up never shows
// them again, on any device. Only the player's own, already-settled ones are
// touched.
export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { playerId, errorResponse } = await requirePlayerId(request, supabase);
  if (errorResponse) return errorResponse;

  const body = (await request.json().catch(() => null)) as { ids?: unknown; showdownEntryIds?: unknown } | null;
  const ids = idList(body?.ids);
  const showdownEntryIds = idList(body?.showdownEntryIds);
  if (ids === null || showdownEntryIds === null || ids.length + showdownEntryIds.length === 0) {
    return Response.json({ error: 'ids must be a list of wager ids.' }, { status: 400 });
  }

  const seenAt = new Date().toISOString();

  if (ids.length > 0) {
    const { error } = await supabase
      .from('wagers')
      .update({ result_seen_at: seenAt })
      .eq('player_id', playerId!)
      .in('wager_id', ids)
      .not('result', 'is', null)
      .is('result_seen_at', null);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  if (showdownEntryIds.length > 0) {
    // An entry's payout is set only when its Showdown settles.
    const { error } = await supabase
      .from('public_bet_entries')
      .update({ result_seen_at: seenAt })
      .eq('player_id', playerId!)
      .in('entry_id', showdownEntryIds)
      .not('payout', 'is', null)
      .is('result_seen_at', null);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true }, { status: 200 });
}
