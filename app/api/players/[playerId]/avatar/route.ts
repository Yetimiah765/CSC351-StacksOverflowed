import { getSupabaseClient } from '../../../../../lib/supabase';
import { photoToDataUrl } from '../../../../../lib/playerDisplay';

// Public by design: a seated player's avatar is visible to anyone viewing
// the poker table (SRS-8.1), the same as their username. Fetched on demand
// by the poker page rather than carried through the Realtime state
// broadcast, since a profile photo as base64 can exceed Realtime's
// broadcast payload size limit.
export async function GET(_request: Request, { params }: { params: { playerId: string } }) {
  const playerId = Number(params.playerId);
  if (!Number.isInteger(playerId)) {
    return Response.json({ error: 'Invalid player id.' }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { data: player, error } = await supabase
    .from('players')
    .select('profile_photo')
    .eq('player_id', playerId)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!player) return Response.json({ error: 'Player not found.' }, { status: 404 });

  return Response.json({ avatarUrl: photoToDataUrl(player.profile_photo) }, { status: 200 });
}
