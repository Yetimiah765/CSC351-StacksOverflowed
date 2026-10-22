import { randomInt } from 'crypto';
import { getSupabaseClient } from '../../../../lib/supabase';
import { getPlayerIdForToken } from '../../../../lib/auth';
import { pocketColor } from '../../../../lib/roulette/bets';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

interface SettledBet {
  type: string;
  number: number | null;
  amount: number;
  payout: number;
}

interface SpinResult {
  status: 'spun' | 'invalid_bets' | 'over_limit' | 'insufficient_balance' | 'busy' | 'not_active' | 'not_found';
  spin_id?: number;
  winning_number?: number;
  staked?: number;
  returned?: number;
  balance?: number;
  bets?: SettledBet[];
}

// SRS-302.2: spins the wheel for the logged-in player. The winning number is
// picked here with a cryptographically secure random number (SRS-302.1,
// SRS-NFR-5), never taken from the client (SRS-302.3). fn_spin_roulette then
// validates the bets, deducts them, settles them, credits the returns, and
// records the spin in one transaction, so a failure saves nothing (SRS-302.6).
export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  // SRS-301.10: only logged-in players can spin.
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const playerId = await getPlayerIdForToken(supabase, token);
  if (playerId === null) return Response.json({ error: 'Invalid or expired session.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.bets)) {
    return Response.json({ error: 'Place at least one bet before spinning.' }, { status: 400 });
  }

  // Only the bet itself is passed on; the database checks every value.
  const bets = body.bets.map((bet: Record<string, unknown>) => ({
    type: bet?.type,
    number: bet?.number,
    amount: bet?.amount,
  }));

  const { data, error } = await supabase.rpc('fn_spin_roulette', {
    p_player_id: playerId,
    p_bets: bets,
    p_winning_number: randomInt(37),
  });

  if (error) {
    console.error('fn_spin_roulette failed:', error.message);
    return Response.json({ error: 'The spin failed and no coins were taken. Please try again.' }, { status: 500 });
  }

  const result = data as SpinResult;
  switch (result.status) {
    case 'spun':
      return Response.json(
        {
          spinId: result.spin_id,
          number: result.winning_number,
          color: pocketColor(result.winning_number!),
          staked: result.staked,
          returned: result.returned,
          balance: result.balance,
          bets: result.bets,
        },
        { status: 200 }
      );
    case 'invalid_bets':
      return Response.json({ error: 'One or more bets are not valid.' }, { status: 400 });
    case 'over_limit':
      return Response.json({ error: 'The most you can bet on one spin is 500 coins.' }, { status: 400 });
    case 'insufficient_balance':
      return Response.json(
        { error: "You don't have enough coins for these bets.", balance: result.balance },
        { status: 409 }
      );
    case 'busy':
      return Response.json({ error: 'Your last spin is still being processed.' }, { status: 409 });
    case 'not_active':
      return Response.json({ error: 'Accounts pending deletion cannot play roulette.' }, { status: 403 });
    default:
      return Response.json({ error: 'Player not found.' }, { status: 404 });
  }
}
