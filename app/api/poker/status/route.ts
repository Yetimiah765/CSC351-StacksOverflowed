import { getSupabaseClient } from '../../../../lib/supabase';
import { isServerUp } from '../../../../lib/pokerLease';

// SRS-NFR-024: whether the poker tables are up — the poker realtime server
// holds the lease and has renewed it in the last 15 seconds
// (lib/pokerLease.ts). Public and cheap, for an uptime monitor to call every
// minute: 200 when up, 503 when down, so it can count the month's downtime
// against the 99% the SRS asks for. Never cached.
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ up: false, error: 'Supabase credentials are not configured.' }, { status: 503 });

  const { data, error } = await supabase
    .from('poker_server_lease')
    .select('renewed_at, expires_at')
    .eq('lease_key', 'poker')
    .maybeSingle();
  if (error) return Response.json({ up: false, error: 'Unable to check the poker server.' }, { status: 503 });

  const lease = data as { renewed_at: string; expires_at: string } | null;
  const up = isServerUp(lease, Date.now());
  return Response.json({ up, lastHeartbeat: lease?.renewed_at ?? null }, { status: up ? 200 : 503 });
}
