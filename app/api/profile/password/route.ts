import { getSupabaseClient } from '../../../../lib/supabase';
import {
  getPlayerIdForToken,
  hashPassword,
  isValidPassword,
  PASSWORD_RULES_MESSAGE,
  verifyPassword,
} from '../../../../lib/auth';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

// Change Password (UR-113), the only way a password changes (SRS-112.2).
// The new password is typed twice, since there is no password reset to
// recover from a typo.
export async function POST(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const playerId = await getPlayerIdForToken(supabase, token);
  if (playerId === null) return Response.json({ error: 'Invalid or expired session.' }, { status: 401 });

  let body: { currentPassword?: unknown; newPassword?: unknown; confirmPassword?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const { currentPassword, newPassword, confirmPassword } = body;

  // SRS-113.1: the current password is required.
  if (typeof currentPassword !== 'string' || !currentPassword) {
    return Response.json({ error: 'Enter your current password.' }, { status: 400 });
  }

  // SRS-113.3: the registration rules, unchanged (case-sensitive, since the
  // hash is of exactly what was typed).
  if (typeof newPassword !== 'string' || !isValidPassword(newPassword)) {
    return Response.json({ error: PASSWORD_RULES_MESSAGE }, { status: 400 });
  }

  if (newPassword !== confirmPassword) {
    return Response.json({ error: "The new passwords don't match." }, { status: 400 });
  }

  const { data: player, error: lookupError } = await supabase
    .from('players')
    .select('password_hash')
    .eq('player_id', playerId)
    .maybeSingle();

  if (lookupError) return Response.json({ error: lookupError.message }, { status: 500 });
  if (!player) return Response.json({ error: 'Player not found.' }, { status: 404 });

  // SRS-113.2: nothing is saved unless the current password checks out. 403,
  // not 401, so the page doesn't mistake it for an expired session.
  if (!(await verifyPassword(currentPassword, player.password_hash))) {
    return Response.json({ error: 'Your current password is incorrect.' }, { status: 403 });
  }

  const { error: updateError } = await supabase
    .from('players')
    .update({ password_hash: await hashPassword(newPassword) })
    .eq('player_id', playerId);

  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

  return Response.json({ success: true }, { status: 200 });
}
