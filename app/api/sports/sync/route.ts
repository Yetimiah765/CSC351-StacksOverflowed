import { getSupabaseClient } from '../../../../lib/supabase';
import { getOddsApiClient } from '../../../../lib/oddsApi';
import { syncSports } from '../../../../lib/sports/sync';

// Called by a scheduler, not by players. Requires
// "Authorization: Bearer <SPORTS_SYNC_SECRET>" (Vercel Cron sends CRON_SECRET
// the same way, so either variable works).
function isAuthorized(request: Request): boolean {
  const secret = process.env.SPORTS_SYNC_SECRET || process.env.CRON_SECRET || '';
  if (!secret) return false;
  return request.headers.get('Authorization') === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  }

  const oddsApi = getOddsApiClient();
  if (!oddsApi) {
    return Response.json({ error: 'ODDS_API_KEY is not configured.' }, { status: 500 });
  }

  try {
    const summary = await syncSports(supabase, oddsApi);
    return Response.json(summary, { status: summary.errors.length > 0 ? 207 : 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return Response.json({ error: message }, { status: 502 });
  }
}

// Vercel Cron issues GET requests.
export const GET = POST;
