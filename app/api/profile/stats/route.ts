import { getSupabaseClient } from '../../../../lib/supabase';
import { requirePlayerId } from '../../../../lib/auth';
import { GAMES } from '../../../../lib/games';

// SRS-117.2 / SRS-117.5 / SRS-118.2: the logged-in player's money won and
// money lost, overall and for each game, for the profile's statistics
// section. Results are kept in player_game_stats, one row per game, and the
// overall totals are the sums of those rows rather than stored figures.
export async function GET(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { playerId, errorResponse } = await requirePlayerId(request, supabase);
  if (errorResponse) return errorResponse;

  const { data, error } = await supabase
    .from('player_game_stats')
    .select('game_code, money_won, money_lost')
    .eq('player_id', playerId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as { game_code: string; money_won: number; money_lost: number }[];
  const moneyWon = rows.reduce((total, row) => total + Number(row.money_won), 0);
  const moneyLost = rows.reduce((total, row) => total + Number(row.money_lost), 0);

  // Every game, keyed by its code; a game with no results yet has 0.
  const games: Record<string, { moneyWon: number }> = {};
  for (const game of GAMES) {
    const row = rows.find((candidate) => candidate.game_code === game.statsCode);
    games[game.statsCode] = { moneyWon: Number(row?.money_won ?? 0) };
  }

  return Response.json({ moneyWon, moneyLost, games }, { status: 200 });
}
