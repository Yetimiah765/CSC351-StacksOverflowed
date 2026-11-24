import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../../../lib/supabase';
import { getPlayerIdForToken } from '../../../../lib/auth';
import { MIN_WAGER, checkWagerAmount } from '../../../../lib/sports/wagers';
import { MAX_PARLAY_LEGS, MIN_PARLAY_LEGS, SAME_GAME_ERROR, legCountProblem } from '../../../../lib/sports/parlays';
import { fetchMyParlays } from '../../../../lib/sports/myParlays';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

// Only logged-in players can place or view parlays.
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

// SRS-219.3: the player's own parlays for My bets, open and settled.
export async function GET(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { playerId, errorResponse } = await requirePlayerId(request, supabase);
  if (errorResponse) return errorResponse;

  try {
    return Response.json(await fetchMyParlays(supabase, playerId!), { status: 200 });
  } catch (error: unknown) {
    console.error('Loading parlays failed:', error instanceof Error ? error.message : error);
    return Response.json({ error: 'Could not load your parlays. Please try again.' }, { status: 500 });
  }
}

type Leg = { optionId: number; odds: number };

interface PlaceResult {
  status:
    | 'placed'
    | 'invalid_amount'
    | 'invalid_legs'
    | 'not_found'
    | 'not_active'
    | 'option_not_found'
    | 'closed'
    | 'same_game'
    | 'odds_changed'
    | 'no_profit'
    | 'insufficient_balance';
  parlay_id?: number;
  amount?: number;
  combined_odds?: number | string;
  potential_payout?: number;
  placed_at?: string;
  balance?: number;
  option_id?: number;
  changes?: { option_id: number; current_odds: number | string }[];
}

// The legs as sent, or an error. Only the option and the odds the player saw
// are taken; which game each option belongs to comes from the database.
function readLegs(input: unknown): { ok: true; legs: Leg[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'Pick the outcomes for your parlay first.' };
  const sizeProblem = legCountProblem(input.length);
  if (sizeProblem) return { ok: false, error: sizeProblem };

  const legs: Leg[] = [];
  for (const item of input) {
    const optionId = (item as { optionId?: unknown } | null)?.optionId;
    const odds = (item as { odds?: unknown } | null)?.odds;
    if (typeof optionId !== 'number' || !Number.isInteger(optionId) || optionId <= 0) {
      return { ok: false, error: 'One of your picks is missing. Refresh the page and try again.' };
    }
    if (typeof odds !== 'number' || !(odds > 1)) {
      return { ok: false, error: 'The odds for one of your picks are missing. Refresh the page and try again.' };
    }
    legs.push({ optionId, odds });
  }
  if (new Set(legs.map((l) => l.optionId)).size !== legs.length) {
    return { ok: false, error: 'Each outcome can be in a parlay only once.' };
  }
  return { ok: true, legs };
}

// SRS-219.3: places a parlay. Body: { amount, legs: [{ optionId, odds }] },
// where odds are what the player's bet slip showed for each pick.
// fn_place_parlay takes the stake and records the parlay and its legs in one
// transaction, and checks every rule again there (SRS-219.1, SRS-219.2,
// SRS-219.5), since a game can start or the odds move at any moment.
export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { playerId, errorResponse } = await requirePlayerId(request, supabase);
  if (errorResponse) return errorResponse;

  const body = (await request.json().catch(() => null)) as { amount?: unknown; legs?: unknown } | null;
  const legsCheck = readLegs(body?.legs);
  if (!legsCheck.ok) return Response.json({ error: legsCheck.error }, { status: 400 });

  const amountCheck = checkWagerAmount(body?.amount);
  if (!amountCheck.ok) return Response.json({ error: amountCheck.error }, { status: 400 });

  const { legs } = legsCheck;
  const { data, error } = await supabase.rpc('fn_place_parlay', {
    p_player_id: playerId,
    p_amount: amountCheck.amount,
    p_option_ids: legs.map((l) => l.optionId),
    p_expected_odds: legs.map((l) => l.odds),
  });

  // Nothing was saved, so the player's balance is unchanged.
  if (error) {
    console.error('fn_place_parlay failed:', error.message);
    return Response.json({ error: 'Could not place your parlay. Your coins were not taken. Please try again.' }, { status: 500 });
  }

  const result = data as PlaceResult;
  switch (result.status) {
    case 'placed':
      return Response.json(
        {
          parlay: {
            id: result.parlay_id,
            amount: result.amount,
            combinedOdds: Number(result.combined_odds),
            potentialPayout: result.potential_payout,
            placedAt: result.placed_at,
            legs,
          },
          balance: result.balance,
        },
        { status: 201 },
      );
    case 'insufficient_balance':
      return Response.json({ error: "You don't have enough coins for this parlay.", balance: result.balance }, { status: 400 });
    case 'invalid_amount':
      return Response.json({ error: `The minimum bet is ${MIN_WAGER} coins.` }, { status: 400 });
    case 'invalid_legs':
      return Response.json(
        { error: `A parlay needs ${MIN_PARLAY_LEGS} to ${MAX_PARLAY_LEGS} different picks.` },
        { status: 400 },
      );
    case 'same_game':
      return Response.json({ error: SAME_GAME_ERROR, optionId: result.option_id }, { status: 400 });
    case 'no_profit':
      return Response.json({ error: "This parlay can't win any coins at these odds. Try a larger amount." }, { status: 400 });
    case 'odds_changed': {
      const changes = (result.changes ?? []).map((c) => ({ optionId: c.option_id, currentOdds: Number(c.current_odds) }));
      return Response.json(
        {
          error: `The odds changed on ${changes.length === 1 ? 'one of your picks' : `${changes.length} of your picks`}. Check the new payout and place your parlay again.`,
          changes,
        },
        { status: 409 },
      );
    }
    case 'closed':
      return Response.json(
        { error: "Betting has closed on one of your picks' games. Take it out and try again.", optionId: result.option_id },
        { status: 409 },
      );
    case 'option_not_found':
      return Response.json(
        { error: 'One of your picks no longer exists. Refresh the page.', optionId: result.option_id },
        { status: 404 },
      );
    case 'not_active':
      return Response.json({ error: 'Accounts pending deletion cannot place bets.' }, { status: 403 });
    default:
      return Response.json({ error: 'Player not found.' }, { status: 404 });
  }
}
