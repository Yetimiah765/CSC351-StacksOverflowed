import { getSupabaseClient } from '../../../../lib/supabase';
import { hashPassword, isAtLeast21, isValidName, isValidPassword, isValidUsername } from '../../../../lib/auth';

interface RegisterBody {
  firstName?: string;
  lastName?: string;
  birthday?: string;
  username?: string;
  password?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RegisterBody;
    const { firstName, lastName, birthday, username, password } = body;

    // SRS-101.1: first name, last name, birthday, username, and password are
    // all required. SRS-101.9: no email is collected.
    if (!firstName || !lastName || !birthday || !username || !password) {
      return Response.json(
        { error: 'First name, last name, birthday, username, and password are required.' },
        { status: 400 }
      );
    }

    if (!isValidName(firstName) || !isValidName(lastName)) {
      return Response.json(
        { error: 'Names may only contain letters, spaces, apostrophes, and hyphens.' },
        { status: 400 }
      );
    }

    if (!isValidUsername(username)) {
      return Response.json(
        { error: 'Usernames must be 6-10 characters long and contain only letters and numbers.' },
        { status: 400 }
      );
    }

    if (!isValidPassword(password)) {
      return Response.json(
        {
          error:
            'Passwords must be at least 8 characters, contain only letters and numbers, and include at least one letter and one number.',
        },
        { status: 400 }
      );
    }

    if (!isAtLeast21(birthday)) {
      return Response.json({ error: 'You must be at least 21 years old to register.' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
    }

    // SRS-101.5 / SRS-101.6: usernames are unique and reserved
    // case-insensitively, so check before creating a player row.
    const { data: existingUsername, error: lookupError } = await supabase
      .from('usernames')
      .select('username_id')
      .ilike('username', username)
      .maybeSingle();

    if (lookupError) {
      return Response.json({ error: lookupError.message, code: lookupError.code }, { status: 500 });
    }
    if (existingUsername) {
      return Response.json({ error: 'That username is already taken or reserved.' }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);

    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({ first_name: firstName, last_name: lastName, birthday, password_hash: passwordHash })
      .select('player_id, first_name, last_name, birthday, balance')
      .single();

    if (playerError || !player) {
      // Surfaces the underlying constraint violation (e.g. the minimum-age
      // check) instead of a generic message.
      return Response.json(
        { error: playerError?.message ?? 'Failed to create account.', code: playerError?.code },
        { status: 400 }
      );
    }

    const { error: usernameError } = await supabase
      .from('usernames')
      .insert({ player_id: player.player_id, username, is_current: true });

    if (usernameError) {
      // Two inserts can't share a transaction over PostgREST, so roll back
      // the player row by hand if the username insert loses a race.
      await supabase.from('players').delete().eq('player_id', player.player_id);
      return Response.json(
        { error: 'That username is already taken or reserved.', code: usernameError.code },
        { status: 400 }
      );
    }

    return Response.json({ player: { ...player, username } }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    const name = error instanceof Error ? error.name : undefined;
    return Response.json({ error: message, name }, { status: 500 });
  }
}
