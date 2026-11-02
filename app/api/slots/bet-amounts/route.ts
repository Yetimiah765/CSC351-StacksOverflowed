import { getSupabaseClient } from '../../../../lib/supabase';
import { initialSlotBet } from '../../../../lib/slots';

// Never read the request, so without this Next would build the reply once at
// build time and serve it forever.
export const dynamic = 'force-dynamic';

// SRS-306.1: the bets a player may choose before a spin, smallest first, and
// the one to select when the page loads. The list isn't private, so no session
// is needed to read it.
export async function GET() {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { data, error } = await supabase
    .from('slot_bet_amounts')
    .select('bet_amount')
    .order('bet_amount', { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const betAmounts = (data ?? []).map((row: { bet_amount: number }) => Number(row.bet_amount));
  return Response.json({ betAmounts, defaultBet: initialSlotBet(betAmounts) }, { status: 200 });
}
