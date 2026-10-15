import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../../../lib/supabase';
import { getPlayerIdForToken } from '../../../../lib/auth';
import { MIN_WAGER, checkWagerAmount } from '../../../../lib/sports/wagers';
import { fetchMyBets } from '../../../../lib/sports/myBets';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

// Only logged-in players can place or view wagers.
async function requirePlayerId(request: Request, supabase: SupabaseClient) {
  const token = getToken(request);
  if (!token) return { playerId: null, errorResponse: Response.json({ error: 'Log in to see and place bets.' }, { status: 401 }) };

  const playerId = await getPlayerIdForToken(supabase, token);
  if (playerId === null) {
    return {
      playerId: null,
      errorResponse: Response.json({ error: 'Your session has expired. Log in again.' }, { status: 401 }),
    };
  }

  return { playerId, errorResponse: null };
}

// SRS-207.1, SRS-208.1, SRS-208.2, SRS-211.1: the player's own wagers, split
// into open (Pending) bets and settled (Decided) history, each with its
// game's status and score.
export async function GET(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { playerId, errorResponse } = await requirePlayerId(request, supabase);
  if (errorResponse) return errorResponse;

  try {
    return Response.json(await fetchMyBets(supabase, playerId!), { status: 200 });
  } catch (error: unknown) {
    console.error('Loading wagers failed:', error instanceof Error ? error.message : error);
    return Response.json({ error: 'Could not load your bets. Please try again.' }, { status: 500 });
  }
}

interface PlaceResult {
  status:
    | 'placed'
    | 'invalid_amount'
    | 'not_found'
    | 'not_active'
    | 'option_not_found'
    | 'closed'
    | 'odds_changed'
    | 'no_profit'
    | 'insufficient_balance';
  wager_id?: number;
  amount?: number;
  odds?: number | string;
  potential_payout?: number;
  placed_at?: string;
  balance?: number;
  current_odds?: number | string;
}

// SRS-205.1 - SRS-205.4, SRS-206.1 - SRS-206.3: places a wager on one betting
// option. Body: { optionId, amount, odds }, where odds are the decimal odds
// shown on the player's bet slip. fn_place_wager takes the stake and records
// the wager in one transaction (SRS-NFR-4) and re-checks every rule there,
// since the market can close or the odds can move at any moment.
export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { playerId, errorResponse } = await requirePlayerId(request, supabase);
  if (errorResponse) return errorResponse;

  const body = (await request.json().catch(() => null)) as { optionId?: unknown; amount?: unknown; odds?: unknown } | null;
  const optionId = body?.optionId;
  const odds = body?.odds;

  if (typeof optionId !== 'number' || !Number.isInteger(optionId) || optionId <= 0) {
    return Response.json({ error: 'Pick a betting option first.' }, { status: 400 });
  }
  if (typeof odds !== 'number' || !(odds > 1)) {
    return Response.json({ error: 'The odds for this bet are missing. Refresh the page and try again.' }, { status: 400 });
  }

  const amountCheck = checkWagerAmount(body?.amount);
  if (!amountCheck.ok) return Response.json({ error: amountCheck.error }, { status: 400 });

  const { data, error } = await supabase.rpc('fn_place_wager', {
    p_player_id: playerId,
    p_option_id: optionId,
    p_amount: amountCheck.amount,
    p_expected_odds: odds,
  });

  // Nothing was saved, so the player's balance is unchanged.
  if (error) {
    console.error('fn_place_wager failed:', error.message);
    return Response.json({ error: 'Could not place your bet. Your coins were not taken. Please try again.' }, { status: 500 });
  }

  const result = data as PlaceResult;
  switch (result.status) {
    case 'placed':
      return Response.json(
        {
          wager: {
            id: result.wager_id,
            optionId,
            amount: result.amount,
            odds: Number(result.odds),
            potentialPayout: result.potential_payout,
            placedAt: result.placed_at,
          },
          balance: result.balance,
        },
        { status: 201 },
      );
    case 'insufficient_balance':
      return Response.json(
        { error: "You don't have enough coins for this bet.", balance: result.balance },
        { status: 400 },
      );
    case 'invalid_amount':
      // Only reachable if MIN_WAGER and fn_place_wager's minimum drift apart.
      return Response.json({ error: `The minimum bet is ${MIN_WAGER} coins.` }, { status: 400 });
    case 'no_profit':
      return Response.json({ error: "This bet can't win any coins at these odds. Try a larger amount." }, { status: 400 });
    case 'odds_changed':
      return Response.json(
        { error: 'The odds changed. Check the new odds and place your bet again.', currentOdds: Number(result.current_odds) },
        { status: 409 },
      );
    case 'closed':
      return Response.json({ error: 'Betting on this game has closed.' }, { status: 409 });
    case 'option_not_found':
      return Response.json({ error: 'That betting option no longer exists. Refresh the page.' }, { status: 404 });
    case 'not_active':
      return Response.json({ error: 'Accounts pending deletion cannot place bets.' }, { status: 403 });
    default:
      return Response.json({ error: 'Player not found.' }, { status: 404 });
  }
}
