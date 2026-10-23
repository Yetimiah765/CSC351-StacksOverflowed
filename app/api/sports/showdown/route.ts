import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../../../lib/supabase';
import { getPlayerIdForToken } from '../../../../lib/auth';
import { checkWagerAmount } from '../../../../lib/sports/wagers';
import { fetchShowdowns } from '../../../../lib/sports/showdown';
import { notifyShowdownChanged } from '../../../../lib/sports/showdownRealtime';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

async function playerIdFrom(request: Request, supabase: SupabaseClient): Promise<number | null> {
  const token = getToken(request);
  return token ? getPlayerIdForToken(supabase, token) : null;
}

// SRS-213.1 / SRS-213.2: every sport's Showdown with its pool totals. Anyone
// can look; a logged-in player also gets their own entry and projected payout.
export async function GET(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  try {
    const playerId = await playerIdFrom(request, supabase);
    return Response.json({ showdowns: await fetchShowdowns(supabase, playerId) }, { status: 200 });
  } catch (error: unknown) {
    console.error('Loading Showdowns failed:', error instanceof Error ? error.message : error);
    return Response.json({ error: 'Could not load the Showdowns. Please try again.' }, { status: 500 });
  }
}

interface JoinResult {
  status:
    | 'joined'
    | 'invalid_amount'
    | 'showdown_not_found'
    | 'closed'
    | 'invalid_team'
    | 'not_found'
    | 'not_active'
    | 'other_side'
    | 'insufficient_balance';
  team_id?: number;
  added?: number;
  entry_amount?: number;
  balance?: number;
}

// SRS-212.1 - SRS-212.3: backs a team in a Showdown, or tops up the player's
// existing entry on the same team. Body: { showdownId, teamId, amount }.
// fn_join_showdown takes the coins and records the entry in one transaction.
export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const token = getToken(request);
  if (!token) return Response.json({ error: 'Log in to join the Showdown.' }, { status: 401 });
  const playerId = await getPlayerIdForToken(supabase, token);
  if (playerId === null) return Response.json({ error: 'Your session has expired. Log in again.' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { showdownId?: unknown; teamId?: unknown; amount?: unknown } | null;
  const showdownId = body?.showdownId;
  const teamId = body?.teamId;
  if (typeof showdownId !== 'number' || !Number.isInteger(showdownId) || showdownId <= 0) {
    return Response.json({ error: 'That Showdown does not exist.' }, { status: 404 });
  }
  if (typeof teamId !== 'number' || !Number.isInteger(teamId) || teamId <= 0) {
    return Response.json({ error: 'Pick a team first.' }, { status: 400 });
  }

  const amountCheck = checkWagerAmount(body?.amount);
  if (!amountCheck.ok) return Response.json({ error: amountCheck.error }, { status: 400 });

  const { data, error } = await supabase.rpc('fn_join_showdown', {
    p_player_id: playerId,
    p_public_bet_id: showdownId,
    p_team_id: teamId,
    p_amount: amountCheck.amount,
  });

  if (error) {
    console.error('fn_join_showdown failed:', error.message);
    return Response.json({ error: 'Could not place your bet. Your coins were not taken. Please try again.' }, { status: 500 });
  }

  const result = data as JoinResult;
  switch (result.status) {
    case 'joined':
      // Tell every open Showdown page to reload the pools right away.
      await notifyShowdownChanged(supabase, { showdownId, reason: 'bet' });
      return Response.json(
        { teamId: result.team_id, added: result.added, entryAmount: result.entry_amount, balance: result.balance },
        { status: 200 },
      );
    case 'other_side':
      return Response.json(
        { error: "You've already backed the other team. You can only add to your side.", teamId: result.team_id },
        { status: 409 },
      );
    case 'closed':
      return Response.json({ error: 'Betting on this Showdown has closed.' }, { status: 409 });
    case 'insufficient_balance':
      return Response.json({ error: "You don't have enough coins for this bet.", balance: result.balance }, { status: 400 });
    case 'invalid_team':
      return Response.json({ error: 'That team is not in this Showdown.' }, { status: 400 });
    case 'invalid_amount':
      return Response.json({ error: 'The minimum bet is 50 coins.' }, { status: 400 });
    case 'not_active':
      return Response.json({ error: 'Accounts pending deletion cannot place bets.' }, { status: 403 });
    case 'showdown_not_found':
      return Response.json({ error: 'That Showdown does not exist.' }, { status: 404 });
    default:
      return Response.json({ error: 'Player not found.' }, { status: 404 });
  }
}
