import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../../lib/supabase';
import { getPlayerIdForToken } from '../../../lib/auth';
import { msUntil, nextWishAt, wishDay } from '../../../lib/wishingFountain';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

// SRS-129.1: only logged-in players can make a wish.
async function requirePlayerId(request: Request, supabase: SupabaseClient) {
  const token = getToken(request);
  if (!token) return { playerId: null, errorResponse: Response.json({ error: 'Unauthorized' }, { status: 401 }) };

  const playerId = await getPlayerIdForToken(supabase, token);
  if (playerId === null) {
    return {
      playerId: null,
      errorResponse: Response.json({ error: 'Invalid or expired session.' }, { status: 401 }),
    };
  }

  return { playerId, errorResponse: null };
}

// SRS-129.2: whether the player has made today's wish (midnight to midnight
// Eastern time), and if so, how long until the next one. msRemaining is
// worked out here so the page's countdown doesn't depend on the browser's
// clock.
export async function GET(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { playerId, errorResponse } = await requirePlayerId(request, supabase);
  if (errorResponse) return errorResponse;

  const now = Date.now();
  const { data, error } = await supabase
    .from('fountain_wishes')
    .select('wish_id')
    .eq('player_id', playerId!)
    .eq('wish_day', wishDay(now))
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (!data) return Response.json({ wishedToday: false, nextWishAt: null, msRemaining: 0 }, { status: 200 });
  const next = nextWishAt(now);
  return Response.json({ wishedToday: true, nextWishAt: new Date(next).toISOString(), msRemaining: msUntil(next, now) }, { status: 200 });
}

interface WishResult {
  status: 'wished' | 'already_wished' | 'insufficient_balance' | 'busy' | 'not_active' | 'not_found';
  reward?: number;
  balance?: number;
  next_wish_at?: string;
}

// SRS-129.1: makes a wish at the lobby's fountain for 1 coin.
// fn_make_wish takes the coin and records the wish in one transaction, and
// refuses a player with no coins, or one who has already wished today
// (SRS-129.2), saying when they can wish next.
export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { playerId, errorResponse } = await requirePlayerId(request, supabase);
  if (errorResponse) return errorResponse;

  // Nothing comes back for the coin.
  const { data, error } = await supabase.rpc('fn_make_wish', {
    p_player_id: playerId,
    p_reward: 0,
  });

  // Nothing was saved, so the player keeps their coin.
  if (error) {
    console.error('fn_make_wish failed:', error.message);
    return Response.json({ error: 'Could not make your wish. Please try again.' }, { status: 500 });
  }

  const result = data as WishResult;
  switch (result.status) {
    case 'wished':
      return Response.json(
        { reward: result.reward, balance: result.balance, nextWishAt: result.next_wish_at, msRemaining: msUntil(result.next_wish_at ?? null) },
        { status: 200 }
      );
    case 'already_wished':
      return Response.json(
        { error: "You've already made today's wish.", nextWishAt: result.next_wish_at, msRemaining: msUntil(result.next_wish_at ?? null) },
        { status: 409 }
      );
    case 'insufficient_balance':
      return Response.json({ error: 'You need 1 coin to make a wish.' }, { status: 409 });
    case 'busy':
      return Response.json({ error: 'Your last wish is still being made.' }, { status: 409 });
    case 'not_active':
      return Response.json({ error: 'Accounts pending deletion cannot make a wish.' }, { status: 403 });
    default:
      return Response.json({ error: 'Player not found.' }, { status: 404 });
  }
}
