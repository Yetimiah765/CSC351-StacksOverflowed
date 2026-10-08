// Shared helpers for turning a player_id into the public-facing display
// info (username + profile photo) used anywhere a player's identity needs
// to be shown to other users — currently the profile page and the poker
// table's seats (SRS-8.1/8.2). Centralized so the two don't drift apart.
import type { SupabaseClient } from '@supabase/supabase-js';

// profile_photo comes back from PostgREST as a Postgres hex-encoded bytea
// string (\x89504e47...). Convert it to a data URL an <img> tag can use
// directly, or null for the default icon (SRS-115.5 / SRS-8.2).
export function photoToDataUrl(hexBytea: string | null): string | null {
  if (!hexBytea) return null;
  const hex = hexBytea.startsWith('\\x') ? hexBytea.slice(2) : hexBytea;
  return `data:image/png;base64,${Buffer.from(hex, 'hex').toString('base64')}`;
}

export interface PlayerDisplay {
  username: string | null;
  profilePhotoDataUrl: string | null;
}

/**
 * Looks up the current username and profile photo for a player_id. Used by
 * the profile route and the players' avatar endpoint. Avoid calling this
 * where only the username is needed (e.g. the poker realtime server's join
 * handler) — it pulls the full photo bytea, which can be several MB.
 */
export async function getPlayerDisplay(
  supabase: SupabaseClient,
  playerId: number
): Promise<PlayerDisplay | null> {
  const { data: player, error } = await supabase
    .from('players')
    .select('profile_photo')
    .eq('player_id', playerId)
    .maybeSingle();

  if (error || !player) return null;

  const { data: usernameRow } = await supabase
    .from('usernames')
    .select('username')
    .eq('player_id', playerId)
    .eq('is_current', true)
    .maybeSingle();

  return {
    username: usernameRow?.username ?? null,
    profilePhotoDataUrl: photoToDataUrl(player.profile_photo),
  };
}

/**
 * Looks up just the current username for a player_id, without touching the
 * profile_photo column. Used by the poker realtime server's join handler —
 * the seat only needs a username, and avatars are fetched separately by
 * clients (GET /api/players/[playerId]/avatar) rather than carried through
 * Realtime broadcasts, which have a payload size limit a multi-MB photo can
 * exceed.
 */
export async function getPlayerUsername(
  supabase: SupabaseClient,
  playerId: number
): Promise<string | null> {
  const { data: usernameRow } = await supabase
    .from('usernames')
    .select('username')
    .eq('player_id', playerId)
    .eq('is_current', true)
    .maybeSingle();

  return usernameRow?.username ?? null;
}
