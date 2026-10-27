import { getSupabaseClient } from '../../../lib/supabase';
import { requirePlayerId } from '../../../lib/auth';
import { toCosmetic, type CosmeticCategory, type CosmeticRow } from '../../../lib/cosmetics';

// SRS-119.1 / SRS-119.2 / SRS-120.1: the logged-in player's cosmetics and
// what they have equipped in each category. Defaults come first (the
// leftmost item in each profile row), then the rest in the order they were
// won.
export async function GET(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { playerId, errorResponse } = await requirePlayerId(request, supabase);
  if (errorResponse) return errorResponse;

  const { data: ownedRows, error: ownedError } = await supabase
    .from('player_cosmetics')
    .select('acquired_at, cosmetics(cosmetic_id, cosmetic_name, category, is_default, asset_path, is_holographic)')
    .eq('player_id', playerId);
  if (ownedError) return Response.json({ error: ownedError.message }, { status: 500 });

  const { data: equippedRows, error: equippedError } = await supabase
    .from('player_equipped_cosmetics')
    .select('category, cosmetic_id')
    .eq('player_id', playerId);
  if (equippedError) return Response.json({ error: equippedError.message }, { status: 500 });

  const owned = ((ownedRows ?? []) as unknown as { acquired_at: string; cosmetics: CosmeticRow }[])
    .map((row) => ({ ...toCosmetic(row.cosmetics), acquiredAt: row.acquired_at }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.acquiredAt.localeCompare(b.acquiredAt) || a.cosmeticId - b.cosmeticId)
    .map(({ acquiredAt: _acquiredAt, ...cosmetic }) => cosmetic);

  const equipped: Partial<Record<CosmeticCategory, number>> = {};
  for (const row of (equippedRows ?? []) as { category: CosmeticCategory; cosmetic_id: number }[]) {
    equipped[row.category] = row.cosmetic_id;
  }

  return Response.json({ owned, equipped }, { status: 200 });
}
