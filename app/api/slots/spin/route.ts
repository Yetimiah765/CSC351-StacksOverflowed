import { randomInt } from 'crypto';
import { getSupabaseClient } from '../../../../lib/supabase';
import { getPlayerIdForToken } from '../../../../lib/auth';
import { REEL_ROLLS, type SlotSymbolName } from '../../../../lib/slots';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

interface SpinResult {
  status: 'spun' | 'invalid_bet' | 'insufficient_balance' | 'busy' | 'not_active' | 'not_found';
  spin_id?: number;
  reels?: SlotSymbolName[];
  bet?: number;
  multiplier?: number;
  payout?: number;
  balance?: number;
}

// SRS-307.2: spins the slot machine for the logged-in player. Each reel's roll
// is drawn here with a cryptographically secure random number (SRS-307.1);
// the client sends only its bet, never symbols or a payout (SRS-307.3).
// fn_spin_slots then validates the bet, deducts it, settles the reels against
// the paytable, credits the payout, and records the spin in one transaction,
// so a failure saves nothing (SRS-307.5).
export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  // SRS-306.5: only logged-in players can spin.
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const playerId = await getPlayerIdForToken(supabase, token);
  if (playerId === null) return Response.json({ error: 'Invalid or expired session.' }, { status: 401 });

  // SRS-306.2: the database checks the amount is one of the allowed bets.
  const body = await request.json().catch(() => null);
  const bet = body?.bet;
  if (typeof bet !== 'number' || !Number.isInteger(bet)) {
    return Response.json({ error: 'Choose a bet before spinning.' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('fn_spin_slots', {
    p_player_id: playerId,
    p_bet: bet,
    p_rolls: [randomInt(REEL_ROLLS), randomInt(REEL_ROLLS), randomInt(REEL_ROLLS)],
  });

  if (error) {
    console.error('fn_spin_slots failed:', error.message);
    return Response.json({ error: 'The spin failed and no coins were taken. Please try again.' }, { status: 500 });
  }

  const result = data as SpinResult;
  switch (result.status) {
    case 'spun':
      return Response.json(
        {
          spinId: result.spin_id,
          reels: result.reels,
          bet: result.bet,
          multiplier: result.multiplier,
          payout: result.payout,
          balance: result.balance,
        },
        { status: 200 }
      );
    case 'invalid_bet':
      return Response.json({ error: 'That bet amount is not allowed.' }, { status: 400 });
    case 'insufficient_balance':
      return Response.json(
        { error: "You don't have enough coins for that bet.", balance: result.balance },
        { status: 409 }
      );
    case 'busy':
      return Response.json({ error: 'Your last spin is still being processed.' }, { status: 409 });
    case 'not_active':
      return Response.json({ error: 'Accounts pending deletion cannot play the slot machine.' }, { status: 403 });
    default:
      return Response.json({ error: 'Player not found.' }, { status: 404 });
  }
}
