import { getSupabaseClient } from '../../../../lib/supabase';
import { getPlayerIdForToken } from '../../../../lib/auth';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

// SRS-115.1: PNG is verified by file signature, not filename.
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// SRS-115.3: 5 MB maximum, matching chk_players_profile_photo.
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const playerId = await getPlayerIdForToken(supabase, token);
  if (playerId === null) return Response.json({ error: 'Invalid or expired session.' }, { status: 401 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: 'Invalid form data.' }, { status: 400 });
  }

  const file = formData.get('image');
  if (!file || !(file instanceof Blob)) {
    return Response.json({ error: 'image file is required.' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return Response.json({ error: 'Profile photos must be PNG images.' }, { status: 400 });
  }

  if (buffer.byteLength > MAX_PHOTO_BYTES) {
    return Response.json({ error: 'Profile photos must be 5 MB or smaller.' }, { status: 400 });
  }

  // PostgREST accepts bytea input as a Postgres hex-escaped string.
  const { error: updateError } = await supabase
    .from('players')
    .update({ profile_photo: `\\x${buffer.toString('hex')}` })
    .eq('player_id', playerId);

  if (updateError) return Response.json({ error: updateError.message }, { status: 400 });

  return Response.json(
    { profilePhotoDataUrl: `data:image/png;base64,${buffer.toString('base64')}` },
    { status: 200 }
  );
}
