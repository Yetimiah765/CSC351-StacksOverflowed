import { getSupabaseClient } from '../../../../lib/supabase';
import {
  checkName,
  hashPassword,
  isAtLeast21,
  isValidPassword,
  isValidUsername,
  PASSWORD_RULES_MESSAGE,
} from '../../../../lib/auth';
import { serverError } from '../../../../lib/serverError';

interface RegisterBody {
  firstName?: string;
  lastName?: string;
  birthday?: string;
  username?: string;
  password?: string;
  confirmPassword?: string;
}

const CREATE_FAILED = 'Could not create your account. Please try again.';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RegisterBody;
    const { firstName, lastName, birthday, username, password, confirmPassword } = body;

    // SRS-101.1: first name, last name, birthday, username, and password are
    // all required. SRS-101.10: no email is collected.
    if (!firstName || !lastName || !birthday || !username || !password) {
      return Response.json(
        { error: 'First name, last name, birthday, username, and password are required.' },
        { status: 400 }
      );
    }

    // The same name rules as editing a name on the profile (SRS-112.3):
    // stored trimmed, and one too long for its column is refused here
    // rather than failing the insert.
    const first = checkName(firstName, 'First name');
    if (first.error !== null) return Response.json({ error: first.error }, { status: 400 });
    const last = checkName(lastName, 'Last name');
    if (last.error !== null) return Response.json({ error: last.error }, { status: 400 });

    if (!isValidUsername(username)) {
      return Response.json(
        { error: 'Usernames must be 6-10 characters long and contain only letters and numbers.' },
        { status: 400 }
      );
    }

    if (!isValidPassword(password)) {
      return Response.json({ error: PASSWORD_RULES_MESSAGE }, { status: 400 });
    }

    // SRS-101.14: the password is typed twice. There is no account recovery
    // (SRS-101.11), so a typo here would lock the player out for good.
    if (password !== confirmPassword) {
      return Response.json({ error: "The passwords don't match." }, { status: 400 });
    }

    if (!isAtLeast21(birthday)) {
      return Response.json({ error: 'You must be at least 21 years old to register.' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
    }

    // SRS-112.8: a previous username whose 24-hour reservation has run out
    // is free again, so delete that reservation before checking the name. If
    // this fails, the name just stays blocked a little longer, which is safe.
    await supabase
      .from('usernames')
      .delete()
      .ilike('username', username)
      .eq('is_current', false)
      .lte('reserved_until', new Date().toISOString());

    // SRS-101.6 / SRS-101.7: usernames are unique and reserved
    // case-insensitively, so check before creating a player row.
    const { data: existingUsername, error: lookupError } = await supabase
      .from('usernames')
      .select('username_id')
      .ilike('username', username)
      .maybeSingle();

    if (lookupError) {
      return serverError('register: username lookup', lookupError, CREATE_FAILED);
    }
    if (existingUsername) {
      return Response.json({ error: 'That username is already taken or reserved.' }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);

    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({ first_name: first.name, last_name: last.name, birthday, password_hash: passwordHash })
      .select('player_id, first_name, last_name, birthday, balance')
      .single();

    // SRS-102.1: the database checks the age too (chk_players_minimum_age).
    // isAtLeast21() uses the same New York date, but if the two ever disagree
    // the player is told why, not shown the database's error.
    if (playerError?.code === '23514' && playerError.message.includes('chk_players_minimum_age')) {
      return Response.json({ error: 'You must be at least 21 years old to register.' }, { status: 400 });
    }

    if (playerError || !player) {
      // Anything else the database refused (the fields were all checked
      // above): logged, never shown (SRS-NFR-111).
      return serverError('register: player insert', playerError ?? 'no row returned', CREATE_FAILED, 400);
    }

    const { error: usernameError } = await supabase
      .from('usernames')
      .insert({ player_id: player.player_id, username, is_current: true });

    if (usernameError) {
      // Two inserts can't share a transaction over PostgREST, so roll back
      // the player row by hand if the username insert loses a race.
      await supabase.from('players').delete().eq('player_id', player.player_id);
      console.error('register: username insert:', usernameError.message);
      return Response.json({ error: 'That username is already taken or reserved.' }, { status: 400 });
    }

    return Response.json({ player: { ...player, username } }, { status: 201 });
  } catch (error: unknown) {
    return serverError('register', error, CREATE_FAILED);
  }
}
