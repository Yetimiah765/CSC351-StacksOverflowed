import { getSupabaseClient } from '../../../../lib/supabase';
import { generateSessionToken, hashSessionToken, verifyPassword } from '../../../../lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password } = body as { username?: string; password?: string };

    // SRS-103.1: players log in with a username and password (no email).
    if (!username || !password) {
      return Response.json({ error: 'Username and password are required.' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
    }

    // SRS-104.7: say which part was wrong, and offer sign-up when there's no
    // such account. Sign-up already says when a username is taken, so this
    // reveals nothing new about which usernames exist.
    const accountNotFound = () =>
      Response.json({ error: 'No account was found with that username.', accountNotFound: true }, { status: 404 });
    const incorrectPassword = () => Response.json({ error: 'Incorrect password.' }, { status: 401 });

    // SRS-101.7: username lookup is case-insensitive, and only the current
    // username (not a reserved former one) can be used to log in.
    const { data: usernameRow, error: usernameError } = await supabase
      .from('usernames')
      .select('player_id, username')
      .eq('is_current', true)
      .ilike('username', username)
      .maybeSingle();

    if (usernameError) {
      return Response.json({ error: usernameError.message }, { status: 500 });
    }
    if (!usernameRow) {
      return accountNotFound();
    }

    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('player_id, first_name, last_name, balance, password_hash, account_status')
      .eq('player_id', usernameRow.player_id)
      .maybeSingle();

    if (playerError || !player) {
      return accountNotFound();
    }

    // SRS-104.6: verify against the stored hash rather than plaintext.
    const passwordMatches = await verifyPassword(password, player.password_hash);
    if (!passwordMatches) {
      return incorrectPassword();
    }

    // Accounts are deleted immediately (SRS-106.6), so none is left pending
    // deletion any more, but the schema still allows the status, so a
    // pending-deletion account stays locked out (formerly SRS-106.7).
    if (player.account_status === 'Pending Deletion') {
      return Response.json(
        { error: 'This account is pending deletion and cannot be accessed.' },
        { status: 403 }
      );
    }

    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);

    // SRS-103.5: logging in replaces any existing session for this
    // player (player_sessions.player_id is UNIQUE), invalidating it.
    const { error: sessionError } = await supabase
      .from('player_sessions')
      .upsert({ player_id: player.player_id, token_hash: tokenHash }, { onConflict: 'player_id' });

    if (sessionError) {
      return Response.json({ error: sessionError.message }, { status: 500 });
    }

    return Response.json(
      {
        token,
        player: {
          playerId: player.player_id,
          firstName: player.first_name,
          lastName: player.last_name,
          username: usernameRow.username,
          balance: player.balance,
        },
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return Response.json({ error: message }, { status: 500 });
  }
}
