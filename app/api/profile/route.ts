import { getSupabaseClient } from '../../../lib/supabase';
import { getPlayerIdForToken, isValidName, isValidUsername, NAME_MAX_LENGTH } from '../../../lib/auth';
import { photoToDataUrl } from '../../../lib/playerDisplay';
import { BIO_MAX_WORDS, countBioWords } from '../../../lib/bio';
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

// SRS-112.3: an edited name follows the registration rules (SRS-101.2,
// SRS-101.3) and must fit its column. Returns the trimmed name or an error.
function checkName(value: unknown, label: string): { name: string; error: null } | { error: string } {
  if (typeof value !== 'string' || !value.trim()) return { error: `${label} is required.` };
  const name = value.trim();
  if (name.length > NAME_MAX_LENGTH) return { error: `${label} must be ${NAME_MAX_LENGTH} characters or fewer.` };
  if (!isValidName(name)) return { error: 'Names may only contain letters, spaces, apostrophes, and hyphens.' };
  return { name, error: null };
}

// "in 5 hours" / "in 12 minutes", for the username cooldown message.
function timeUntil(iso: string): string {
  const minutes = Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 60_000));
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.ceil(minutes / 60);
  return `in ${hours} hour${hours === 1 ? '' : 's'}`;
}

// SRS-112.4 - SRS-112.8: fn_change_username checks the name is free (ignoring
// case, including reserved names), allows one change per 24 hours, and
// reserves the old name for 24 hours, all in one transaction. No password is
// needed (SRS-112.5). Returns an error response, or null once changed.
async function changeUsername(supabase: SupabaseClient, playerId: number, value: unknown) {
  const username = typeof value === 'string' ? value.trim() : '';
  if (!isValidUsername(username)) {
    return Response.json(
      { error: 'Usernames must be 6-10 characters long and contain only letters and numbers.' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase.rpc('fn_change_username', {
    p_player_id: playerId,
    p_username: username,
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const result = data as { status: string; next_change_at?: string };
  switch (result.status) {
    case 'changed':
    case 'unchanged':
      return null;
    case 'taken':
      return Response.json({ error: 'That username is already taken or reserved.' }, { status: 409 });
    case 'cooldown':
      return Response.json(
        {
          error: `You can change your username once every 24 hours. Try again ${timeUntil(result.next_change_at!)}.`,
          nextChangeAt: result.next_change_at,
        },
        { status: 429 }
      );
    case 'not_active':
      return Response.json({ error: 'This account is pending deletion.' }, { status: 403 });
    case 'not_found':
      return Response.json({ error: 'Player not found.' }, { status: 404 });
    default:
      return Response.json(
        { error: 'Usernames must be 6-10 characters long and contain only letters and numbers.' },
        { status: 400 }
      );
  }
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
  const { bio, firstName, lastName, username } = body as {
    bio?: unknown;
    firstName?: unknown;
    lastName?: unknown;
    username?: unknown;
  };

  // SRS-112.1: the bio, first and last names, and username are edited here,
  // each by its own pop-up. SRS-112.2: anything else in the body, such as a
  // password, is ignored; passwords change only through Change Password
  // (UR-113).
  const changes: { bio?: string | null; first_name?: string; last_name?: string } = {};

  if (bio !== undefined) {
    if (typeof bio !== 'string') return Response.json({ error: 'bio must be text.' }, { status: 400 });
    // SRS-114.1/114.2: at most 50 whitespace-separated words; an empty bio is
    // stored as NULL, matching chk_players_bio.
    const trimmedBio = bio.trim();
    if (countBioWords(trimmedBio) > BIO_MAX_WORDS) {
      return Response.json({ error: `Bio must be ${BIO_MAX_WORDS} words or fewer.` }, { status: 400 });
    }
    changes.bio = trimmedBio || null;
  }

  if (firstName !== undefined) {
    const checked = checkName(firstName, 'First name');
    if (checked.error !== null) return Response.json({ error: checked.error }, { status: 400 });
    changes.first_name = checked.name;
  }

  if (lastName !== undefined) {
    const checked = checkName(lastName, 'Last name');
    if (checked.error !== null) return Response.json({ error: checked.error }, { status: 400 });
    changes.last_name = checked.name;
  }

  if (Object.keys(changes).length === 0 && username === undefined) {
    return Response.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  if (username !== undefined) {
    const usernameError = await changeUsername(supabase, playerId!, username);
    if (usernameError) return usernameError;
  }

  if (Object.keys(changes).length > 0) {
    const { error: updateError } = await supabase.from('players').update(changes).eq('player_id', playerId!);
    if (updateError) return Response.json({ error: updateError.message }, { status: 400 });
  }

  const { profile, error } = await loadProfile(supabase, playerId!);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ profile }, { status: 200 });
}
