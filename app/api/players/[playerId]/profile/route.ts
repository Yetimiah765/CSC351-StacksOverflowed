import { getSupabaseClient } from '../../../../../lib/supabase';

// A player's public profile (UR-121): what other players and guests may see
// (SRS-NFR-106). It reads only the columns it returns, so private account
// fields never leave the database: SRS-121.3, the username.
//
// Never reads the request, so like ./avatar it must opt out of Next's static
// caching, or a changed profile would never show.
export const dynamic = 'force-dynamic';

export interface PublicProfile {
  playerId: number;
  username: string;
}

export async function GET(_request: Request, { params }: { params: { playerId: string } }) {
  // Profiles are opened by player id only.
  if (!/^[1-9]\d*$/.test(params.playerId)) {
    return Response.json({ error: 'Invalid player id.' }, { status: 400 });
  }
  const playerId = Number(params.playerId);

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { data: usernameRow, error } = await supabase
    .from('usernames')
    .select('username')
    .eq('player_id', playerId)
    .eq('is_current', true)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  // Every account has a current username, so none means no such player.
  if (!usernameRow) return Response.json({ error: 'Player not found.' }, { status: 404 });

  const profile: PublicProfile = { playerId, username: usernameRow.username };
  return Response.json(profile, { status: 200 });
}
