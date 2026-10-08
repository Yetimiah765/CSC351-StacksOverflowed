import { getSupabaseClient } from '../../../../lib/supabase';
import { buildListing, fetchEvents } from '../../../../lib/sports/events';

// SRS-201.1 - SRS-204.1, SRS-215: lists sports events with their markets,
// current odds, and market rules. Public: odds are not player data, and a
// guest still has to log in before placing a wager.
export async function GET(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  }

  const params = new URL(request.url).searchParams;
  const sport = params.get('sport');
  const league = params.get('league');

  if (league && !/^\d+$/.test(league)) {
    return Response.json({ error: 'league must be a numeric id.' }, { status: 400 });
  }

  try {
    const events = await fetchEvents(supabase);
    return Response.json(buildListing(events, { sport, leagueId: league ? Number(league) : null }), { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return Response.json({ error: message }, { status: 500 });
  }
}
