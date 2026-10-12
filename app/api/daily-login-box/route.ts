import { randomInt } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../../lib/supabase';
import { getPlayerIdForToken } from '../../../lib/auth';
import { msUntilAvailable, pickDailyLoginBoxReward } from '../../../lib/dailyLoginBox';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

// SRS-128.20: only logged-in players can see or open their Daily Login Box.
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

// SRS-128.13 / SRS-128.18: whether the box can be opened, and if not, how
// long until it can, from the saved next-available time. msRemaining is
// computed here so the page's countdown doesn't depend on the browser's clock.
export async function GET(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { playerId, errorResponse } = await requirePlayerId(request, supabase);
  if (errorResponse) return errorResponse;

  const { data, error } = await supabase
    .from('daily_login_box_claims')
    .select('next_available_at')
    .eq('player_id', playerId!)
    .order('next_available_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // SRS-110.2 / SRS-128.3: a player who has never opened a box can open one now.
  const msRemaining = msUntilAvailable(data?.next_available_at ?? null);
  return Response.json(
    {
      available: msRemaining === 0,
      nextAvailableAt: msRemaining === 0 ? null : data!.next_available_at,
      msRemaining,
    },
    { status: 200 }
  );
}

interface OpenResult {
  status: 'opened' | 'cooldown' | 'not_active' | 'not_found';
  reward?: number;
  balance?: number;
  next_available_at?: string;
}

// SRS-128.4: opens the box. The reward is picked here with a
// cryptographically secure random number (SRS-128.5, SRS-128.6), then
// fn_open_daily_login_box saves the credit, the claim, and the next-available
// time in one transaction (SRS-128.9) and rejects a second claim during the
// cooldown (SRS-128.12, SRS-128.19).
export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { playerId, errorResponse } = await requirePlayerId(request, supabase);
  if (errorResponse) return errorResponse;

  const reward = pickDailyLoginBoxReward(randomInt(100));
  const { data, error } = await supabase.rpc('fn_open_daily_login_box', {
    p_player_id: playerId,
    p_reward: reward,
  });

  // SRS-128.21: nothing was saved, so the box stays available to try again.
  if (error) {
    console.error('fn_open_daily_login_box failed:', error.message);
    return Response.json({ error: 'Could not open the Daily Login Box. Please try again.' }, { status: 500 });
  }

  const result = data as OpenResult;
  switch (result.status) {
    case 'opened':
      return Response.json(
        {
          reward: result.reward,
          balance: result.balance,
          nextAvailableAt: result.next_available_at,
          msRemaining: msUntilAvailable(result.next_available_at ?? null),
        },
        { status: 200 }
      );
    case 'cooldown':
      return Response.json(
        {
          error: 'Your next Daily Login Box is not ready yet.',
          nextAvailableAt: result.next_available_at,
          msRemaining: msUntilAvailable(result.next_available_at ?? null),
        },
        { status: 409 }
      );
    case 'not_active':
      return Response.json(
        { error: 'Accounts pending deletion cannot open the Daily Login Box.' },
        { status: 403 }
      );
    default:
      return Response.json({ error: 'Player not found.' }, { status: 404 });
  }
}
