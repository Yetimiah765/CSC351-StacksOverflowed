import { getSupabaseClient } from '../../../../lib/supabase';
import { getBearerToken, getPlayerIdForToken } from '../../../../lib/auth';
import { byCategory, duplicateRefund, isBoxOnSale, rewardChances, toCosmetic, type CosmeticRow } from '../../../../lib/cosmetics';

interface BoxRow {
  box_id: number;
  box_name: string;
  description: string;
  price: number;
  is_available: boolean;
  available_from: string | null;
  available_until: string | null;
  holographic_chance_bp: number;
  blind_box_rewards: { cosmetics: CosmeticRow }[];
}

// SRS-122.1 / SRS-122.2: every blind box on sale right now, with its
// description, price and possible rewards, regular items first and the
// holographic ones last, and the chance of each kind (SRS-123.9).
// Limited-time boxes appear only inside their window (SRS-122.3). Anyone can
// browse; a logged-in player also sees which rewards they already own.
export async function GET(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const token = getBearerToken(request);
  const playerId = token ? await getPlayerIdForToken(supabase, token) : null;

  const { data, error } = await supabase
    .from('blind_boxes')
    .select('box_id, box_name, description, price, is_available, available_from, available_until, holographic_chance_bp, blind_box_rewards(cosmetics(cosmetic_id, cosmetic_name, category, is_default, asset_path, is_holographic))')
    .eq('is_available', true)
    .order('box_id');
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let ownedIds = new Set<number>();
  if (playerId !== null) {
    const { data: owned, error: ownedError } = await supabase.from('player_cosmetics').select('cosmetic_id').eq('player_id', playerId);
    if (ownedError) return Response.json({ error: ownedError.message }, { status: 500 });
    ownedIds = new Set((owned ?? []).map((row: { cosmetic_id: number }) => row.cosmetic_id));
  }

  const now = Date.now();
  const boxes = ((data ?? []) as unknown as BoxRow[])
    .filter((box) => isBoxOnSale(box, now) && box.blind_box_rewards.length > 0)
    .map((box) => {
      const rewards = box.blind_box_rewards
        .map((reward) => toCosmetic(reward.cosmetics))
        .sort((a, b) => Number(a.isHolographic) - Number(b.isHolographic) || byCategory(a, b))
        .map((cosmetic) => ({ ...cosmetic, owned: ownedIds.has(cosmetic.cosmeticId) }));
      const holographic = rewards.filter((reward) => reward.isHolographic).length;
      return {
        boxId: box.box_id,
        name: box.box_name,
        description: box.description,
        price: box.price,
        duplicateRefund: duplicateRefund(box.price),
        limited: box.available_until !== null,
        availableUntil: box.available_until,
        chances: rewardChances(rewards.length - holographic, holographic, box.holographic_chance_bp ?? 0),
        rewards,
      };
    })
    // Always-available boxes first, then limited-time ones.
    .sort((a, b) => Number(a.limited) - Number(b.limited) || a.boxId - b.boxId);

  return Response.json({ boxes, signedIn: playerId !== null }, { status: 200 });
}
