import { randomInt } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../../../lib/supabase';
import { requirePlayerId } from '../../../../lib/auth';
import { HOLOGRAPHIC_ROLLS, type CosmeticCategory } from '../../../../lib/cosmetics';

interface BuyResult {
  status: 'opened' | 'insufficient_balance' | 'unavailable' | 'stale_pick' | 'not_active' | 'not_found';
  cosmetic_id?: number;
  cosmetic_name?: string;
  category?: CosmeticCategory;
  art_key?: string;
  is_holographic?: boolean;
  was_duplicate?: boolean;
  refund?: number;
  price?: number;
  balance?: number;
  regular_count?: number;
  holographic_count?: number;
}

interface BoxDraw {
  holographic_chance_bp: number;
  blind_box_rewards: { cosmetics: { is_holographic: boolean } | null }[];
}

const FAILED = 'Could not buy the box. You were not charged. Please try again.';

async function buy(supabase: SupabaseClient, playerId: number, boxId: number, regular: number, holographic: number, chanceBp: number) {
  // SRS-123.8 / SRS-125.1: a cryptographically secure roll for the
  // holographic tier, then a uniformly random index into the group it lands
  // in, so each regular item is equally likely and so is each holographic
  // one. fn_buy_blind_box makes the same choice from the same roll.
  const roll = randomInt(HOLOGRAPHIC_ROLLS);
  const rare = holographic > 0 && (regular === 0 || roll < chanceBp);
  const pick = randomInt(rare ? holographic : regular);
  return supabase.rpc('fn_buy_blind_box', { p_player_id: playerId, p_box_id: boxId, p_roll: roll, p_pick: pick });
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

  const { data: box, error: boxError } = await supabase
    .from('blind_boxes')
    .select('holographic_chance_bp, blind_box_rewards(cosmetics(is_holographic))')
    .eq('box_id', boxId)
    .maybeSingle();
  if (boxError) return Response.json({ error: FAILED }, { status: 500 });
  const draw = box as unknown as BoxDraw | null;
  const rewards = draw?.blind_box_rewards ?? [];
  if (!draw || rewards.length === 0) return Response.json({ error: 'This box is not in the shop right now.' }, { status: 409 });
  const chanceBp = draw.holographic_chance_bp;
  const holographic = rewards.filter((reward) => reward.cosmetics?.is_holographic).length;

  let { data, error } = await buy(supabase, playerId, boxId as number, rewards.length - holographic, holographic, chanceBp);
  // The box's rewards changed between reading them and the purchase: draw
  // again from the new counts, once.
  const stale = data as BuyResult | null;
  if (!error && stale?.status === 'stale_pick' && stale.regular_count !== undefined && stale.holographic_count !== undefined) {
    ({ data, error } = await buy(supabase, playerId, boxId as number, stale.regular_count, stale.holographic_count, chanceBp));
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
          cosmetic: {
            cosmeticId: result.cosmetic_id,
            name: result.cosmetic_name,
            category: result.category,
            artKey: result.art_key,
            isHolographic: result.is_holographic ?? false,
          },
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
