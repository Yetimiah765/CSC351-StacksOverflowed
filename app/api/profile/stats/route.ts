import { getSupabaseClient } from '../../../../lib/supabase';
import { requirePlayerId } from '../../../../lib/auth';

// SRS-117.2: the logged-in player's money won, for the profile's statistics
// section. Results are kept in player_game_stats, one row per game, and the
// overall total is the sum of those rows rather than a stored figure.
export async function GET(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { playerId, errorResponse } = await requirePlayerId(request, supabase);
  if (errorResponse) return errorResponse;

  const { data, error } = await supabase
    .from('player_game_stats')
    .select('game_code, money_won')
    .eq('player_id', playerId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as { game_code: string; money_won: number }[];
  const moneyWon = rows.reduce((total, row) => total + Number(row.money_won), 0);

  return Response.json({ moneyWon }, { status: 200 });
}
