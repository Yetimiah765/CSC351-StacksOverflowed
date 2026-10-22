// Live updates for The Showdown over Supabase Realtime, the same approach as
// the poker room (lib/pokerRealtime.ts). The server broadcasts a small
// "changed" ping whenever a Showdown's pool or result changes, and every
// open Showdown page reloads the pools from GET /api/sports/showdown when it
// hears one.
//
// The channel is public (anyone with the anon key can listen and send), so a
// ping carries no amounts, players, or anything else private: only which
// Showdown changed and why. The real numbers always come from the API. A
// fake ping can only make pages reload.

import type { SupabaseClient } from '@supabase/supabase-js';

export const SHOWDOWN_CHANNEL_NAME = 'sports:showdown';
export const SHOWDOWN_EVENT_CHANGED = 'changed';

export type ShowdownChangedPayload = {
  // The Showdown that changed, or null when several did (after a sync).
  showdownId: number | null;
  reason: 'bet' | 'settled' | 'picked';
};

// Broadcasts a ping over REST (no subscription needed, like
// app/api/poker/action/route.ts). Best effort: by the time this runs the
// change is already saved, so a failed ping only means pages update on their
// next regular check instead of instantly. Never throws.
export async function notifyShowdownChanged(supabase: SupabaseClient, payload: ShowdownChangedPayload): Promise<boolean> {
  const channel = supabase.channel(SHOWDOWN_CHANNEL_NAME);
  try {
    await channel.httpSend(SHOWDOWN_EVENT_CHANGED, payload);
    return true;
  } catch (error) {
    console.error('Showdown ping failed:', error instanceof Error ? error.message : error);
    return false;
  } finally {
    await supabase.removeChannel(channel);
  }
}
