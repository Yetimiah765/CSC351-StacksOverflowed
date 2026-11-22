import { getSupabaseClient } from '../../../../lib/supabase';
import { requirePlayerId } from '../../../../lib/auth';
import type { CosmeticCategory } from '../../../../lib/cosmetics';
import { serverError } from '../../../../lib/serverError';

const EQUIP_FAILED = 'Could not equip that cosmetic. Please try again.';

// SRS-120.4 - SRS-120.6: equips one of the player's own cosmetics in its
// category, replacing whatever was equipped there. The replaced cosmetic
// stays in the collection, since only the equipped row changes.
export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { playerId, errorResponse } = await requirePlayerId(request, supabase);
  if (errorResponse) return errorResponse;

  let cosmeticId: unknown;
  try {
    ({ cosmeticId } = await request.json());
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  if (!Number.isInteger(cosmeticId)) return Response.json({ error: 'cosmeticId is required.' }, { status: 400 });

  // Only an owned cosmetic can be equipped; its own category decides the slot.
  const { data: owned, error: ownedError } = await supabase
    .from('player_cosmetics')
    .select('cosmetics(category)')
    .eq('player_id', playerId)
    .eq('cosmetic_id', cosmeticId)
    .maybeSingle();
  if (ownedError) return serverError('equip: ownership', ownedError, EQUIP_FAILED);
  if (!owned) return Response.json({ error: "You don't own that cosmetic." }, { status: 404 });

  const category = (owned as unknown as { cosmetics: { category: CosmeticCategory } }).cosmetics.category;

  const { error: equipError } = await supabase
    .from('player_equipped_cosmetics')
    .upsert({ player_id: playerId, category, cosmetic_id: cosmeticId }, { onConflict: 'player_id,category' });
  if (equipError) return serverError('equip: save', equipError, EQUIP_FAILED);

  return Response.json({ category, cosmeticId }, { status: 200 });
}
