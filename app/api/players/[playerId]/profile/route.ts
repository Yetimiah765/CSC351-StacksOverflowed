import { getSupabaseClient } from '../../../../../lib/supabase';
import { photoToAvatarDataUrl } from '../../../../../lib/playerDisplay';
import { sumMoney } from '../../../../../lib/playerStats';

// A player's public profile (UR-121): what other players and guests may see
// (SRS-NFR-106). It reads only the columns it returns, so private account
// fields never leave the database: the username (SRS-121.3), bio
// (SRS-121.4), photo (SRS-121.5), and overall money won and lost
// (SRS-121.7, SRS-121.8).
//
// Never reads the request, so like ./avatar it must opt out of Next's static
// caching, or a changed profile would never show.
export const dynamic = 'force-dynamic';

// The photo shows at 112px, so this is sharp on high-density screens while
// staying far smaller than an upload can be (up to 5MB, SRS-115.3).
const PHOTO_SIZE = 256;

export interface PublicProfile {
  playerId: number;
  username: string;
  // Null when the player hasn't written one.
  bio: string | null;
  // A resized PNG data URL, or null for the blank default icon.
  photoUrl: string | null;
  // Overall only, added up the same way as the owner's own statistics.
  moneyWon: number;
  moneyLost: number;
}

export async function GET(_request: Request, { params }: { params: { playerId: string } }) {
  // Profiles are opened by player id only.
  if (!/^[1-9]\d*$/.test(params.playerId)) {
    return Response.json({ error: 'Invalid player id.' }, { status: 400 });
  }
  const playerId = Number(params.playerId);

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const [
    { data: usernameRow, error: usernameError },
    { data: player, error: playerError },
    { data: stats, error: statsError },
  ] = await Promise.all([
    supabase.from('usernames').select('username').eq('player_id', playerId).eq('is_current', true).maybeSingle(),
    supabase.from('players').select('bio, profile_photo').eq('player_id', playerId).maybeSingle(),
    supabase.from('player_game_stats').select('money_won, money_lost').eq('player_id', playerId),
  ]);
  const error = usernameError ?? playerError ?? statsError;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  // Every account has a current username, so none means no such player.
  if (!usernameRow || !player) return Response.json({ error: 'Player not found.' }, { status: 404 });

  const profile: PublicProfile = {
    playerId,
    username: usernameRow.username,
    bio: player.bio?.trim() ? player.bio : null,
    photoUrl: await photoToAvatarDataUrl(player.profile_photo, PHOTO_SIZE),
    moneyWon: sumMoney(stats ?? [], 'money_won'),
    moneyLost: sumMoney(stats ?? [], 'money_lost'),
  };
  return Response.json(profile, { status: 200 });
}
