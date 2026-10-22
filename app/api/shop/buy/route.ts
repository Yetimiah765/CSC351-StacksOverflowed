import { randomInt } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../../../lib/supabase';
import { requirePlayerId } from '../../../../lib/auth';
import type { CosmeticCategory } from '../../../../lib/cosmetics';

interface BuyResult {
  status: 'opened' | 'insufficient_balance' | 'unavailable' | 'stale_pick' | 'not_active' | 'not_found';
  cosmetic_id?: number;
  cosmetic_name?: string;
  category?: CosmeticCategory;
  art_key?: string;
  was_duplicate?: boolean;
  refund?: number;
  price?: number;
  balance?: number;
  reward_count?: number;
}

const FAILED = 'Could not buy the box. You were not charged. Please try again.';

async function buy(supabase: SupabaseClient, playerId: number, boxId: number, rewardCount: number) {
  // SRS-125.1 / SRS-123.1: a cryptographically secure, uniformly random
  // index over the box's rewards, so each one is exactly 1/n likely.
  return supabase.rpc('fn_buy_blind_box', { p_player_id: playerId, p_box_id: boxId, p_pick: randomInt(rewardCount) });
}

// SRS-124.4 - SRS-126.5: buys and opens one blind box. The purchase
// confirmation (SRS-124.1) happens on the page before this is called.
// fn_buy_blind_box deducts the price, picks the reward, stores it or refunds
// a duplicate, and records the purchase in one transaction, so the result is
// saved even if the player leaves before seeing it (SRS-125.3).
export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { playerId, errorResponse } = await requirePlayerId(request, supabase);
  if (errorResponse) return errorResponse;

  let boxId: unknown;
  try {
    ({ boxId } = await request.json());
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  if (!Number.isInteger(boxId)) return Response.json({ error: 'boxId is required.' }, { status: 400 });

  const { count, error: countError } = await supabase
    .from('blind_box_rewards')
    .select('cosmetic_id', { count: 'exact', head: true })
    .eq('box_id', boxId);
  if (countError) return Response.json({ error: FAILED }, { status: 500 });
  if (!count) return Response.json({ error: 'This box is not in the shop right now.' }, { status: 409 });

  let { data, error } = await buy(supabase, playerId, boxId as number, count);
  // The box's rewards changed between the count and the purchase: pick again
  // from the new count, once.
  if (!error && (data as BuyResult).status === 'stale_pick' && (data as BuyResult).reward_count) {
    ({ data, error } = await buy(supabase, playerId, boxId as number, (data as BuyResult).reward_count!));
  }

  // Nothing was saved, so the player was not charged.
  if (error) {
    console.error('fn_buy_blind_box failed:', error.message);
    return Response.json({ error: FAILED }, { status: 500 });
  }

  const result = data as BuyResult;
  switch (result.status) {
    case 'opened':
      return Response.json(
        {
          cosmetic: { cosmeticId: result.cosmetic_id, name: result.cosmetic_name, category: result.category, artKey: result.art_key },
          wasDuplicate: result.was_duplicate,
          refund: result.refund,
          price: result.price,
          balance: result.balance,
        },
        { status: 200 }
      );
    case 'insufficient_balance':
      return Response.json(
        { error: `This box costs ${result.price} coins and you have ${result.balance}.`, price: result.price, balance: result.balance },
        { status: 400 }
      );
    case 'unavailable':
      return Response.json({ error: 'This box is not in the shop right now.' }, { status: 409 });
    case 'not_active':
      return Response.json({ error: 'This account is pending deletion.' }, { status: 403 });
    case 'not_found':
      return Response.json({ error: 'Player not found.' }, { status: 404 });
    default:
      return Response.json({ error: FAILED }, { status: 409 });
  }
}
