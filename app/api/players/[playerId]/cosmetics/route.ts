import { getSupabaseClient } from '../../../../../lib/supabase';
import type { CosmeticCategory } from '../../../../../lib/cosmetics';

// The art keys of the cosmetics a player has equipped (UR-120), so the poker
// table can show each seated player's card backs, chips and profile outline.
// Public for the same reason as ./avatar: anyone viewing the table sees
// them. A category with nothing equipped comes back as null.
//
// Never reads the request, so like ./avatar it must opt out of Next's
// static caching, or a newly equipped cosmetic would never show.
export const dynamic = 'force-dynamic';

export interface EquippedArt {
  card: string | null;
  chip: string | null;
  outline: string | null;
}

const KEY_BY_CATEGORY: Record<CosmeticCategory, keyof EquippedArt> = {
  Card: 'card',
  Chip: 'chip',
  'Profile Outline': 'outline',
};

export async function GET(_request: Request, { params }: { params: { playerId: string } }) {
  const playerId = Number(params.playerId);
  if (!Number.isInteger(playerId)) {
    return Response.json({ error: 'Invalid player id.' }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { data, error } = await supabase
    .from('player_equipped_cosmetics')
    .select('category, cosmetics(asset_path)')
    .eq('player_id', playerId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const equipped: EquippedArt = { card: null, chip: null, outline: null };
  for (const row of (data ?? []) as unknown as { category: CosmeticCategory; cosmetics: { asset_path: string } | null }[]) {
    const key = KEY_BY_CATEGORY[row.category];
    if (key && row.cosmetics) equipped[key] = row.cosmetics.asset_path;
  }
  return Response.json(equipped, { status: 200 });
}
