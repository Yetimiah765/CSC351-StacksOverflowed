import { getSupabaseClient } from '../../../lib/supabase';
import { getPlayerIdForToken, isValidName, NAME_MAX_LENGTH } from '../../../lib/auth';
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
  const { bio, firstName, lastName } = body as { bio?: unknown; firstName?: unknown; lastName?: unknown };

  // SRS-112.1: the bio and first and last names are edited here, each by its
  // own pop-up. SRS-112.2: anything else in the body, such as a password, is
  // ignored; passwords change only through Change Password (UR-113).
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

  if (Object.keys(changes).length === 0) {
    return Response.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  const { error: updateError } = await supabase.from('players').update(changes).eq('player_id', playerId!);

  if (updateError) return Response.json({ error: updateError.message }, { status: 400 });

  const { profile, error } = await loadProfile(supabase, playerId!);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ profile }, { status: 200 });
}
