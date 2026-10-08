import { getSupabaseClient } from '../../../lib/supabase';
import { getPlayerIdForToken } from '../../../lib/auth';
import { photoToDataUrl } from '../../../lib/playerDisplay';
import type { SupabaseClient } from '@supabase/supabase-js';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

interface ProfileRow {
  player_id: number;
  first_name: string;
  last_name: string;
  bio: string | null;
  balance: number;
  profile_photo: string | null;
}

async function loadProfile(supabase: SupabaseClient, playerId: number) {
  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('player_id, first_name, last_name, bio, balance, profile_photo')
    .eq('player_id', playerId)
    .maybeSingle();

  if (playerError) return { profile: null, error: playerError };
  if (!player) return { profile: null, error: null };

  const row = player as ProfileRow;

  const { data: usernameRow } = await supabase
    .from('usernames')
    .select('username')
    .eq('player_id', playerId)
    .eq('is_current', true)
    .maybeSingle();

  return {
    profile: {
      playerId: row.player_id,
      firstName: row.first_name,
      lastName: row.last_name,
      username: usernameRow?.username ?? null,
      bio: row.bio,
      balance: row.balance,
      profilePhotoDataUrl: photoToDataUrl(row.profile_photo),
    },
    error: null,
  };
}

async function requirePlayerId(request: Request, supabase: SupabaseClient) {
  const token = getToken(request);
  if (!token) return { playerId: null, errorResponse: Response.json({ error: 'Unauthorized' }, { status: 401 }) };

  const playerId = await getPlayerIdForToken(supabase, token);
  if (playerId === null) {
    return {
      playerId: null,
      errorResponse: Response.json({ error: 'Invalid or expired session.' }, { status: 401 }),
    };
  }

  return { playerId, errorResponse: null };
}

export async function GET(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { playerId, errorResponse } = await requirePlayerId(request, supabase);
  if (errorResponse) return errorResponse;

  const { profile, error } = await loadProfile(supabase, playerId!);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ profile }, { status: 200 });
}

export async function PATCH(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { playerId, errorResponse } = await requirePlayerId(request, supabase);
  if (errorResponse) return errorResponse;

  const body = await request.json();
  const { bio } = body as { bio?: string };

  // SRS-112.1: bio is an editable field; SRS-114.2: it may be cleared.
  if (bio === undefined) return Response.json({ error: 'bio is required.' }, { status: 400 });

  // SRS-114.1/114.2: at most 50 whitespace-separated words; an empty bio is
  // stored as NULL, matching chk_players_bio.
  const trimmedBio = bio.trim();
  if (trimmedBio && trimmedBio.split(/\s+/).length > 50) {
    return Response.json({ error: 'Bio must be 50 words or fewer.' }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from('players')
    .update({ bio: trimmedBio || null })
    .eq('player_id', playerId!);

  if (updateError) return Response.json({ error: updateError.message }, { status: 400 });

  const { profile, error } = await loadProfile(supabase, playerId!);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ profile }, { status: 200 });
}
