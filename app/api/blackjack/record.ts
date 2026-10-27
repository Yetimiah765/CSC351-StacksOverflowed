import type { SupabaseClient } from '@supabase/supabase-js';
import { handStake, type BlackjackOutcome, type BlackjackState } from '../../../lib/blackjack';

// SRS-909.1: each finished hand is saved to blackjack_hands for the player's
// hand history — its bet, result, and coins won or lost. A split round saves
// its two hands as two rows, each with its own bet. Only finished hands are
// saved; the cards and hands in play stay in memory (./hands.ts).

/** How many past hands GET /api/blackjack/history returns. */
export const HISTORY_LIMIT = 20;

/**
 * Saves a finished round's hands. The coins have already moved by now, so a
 * failure here is logged rather than reported to the player: it can only
 * leave a gap in the history, never a wrong balance.
 */
export async function recordRound(
  supabase: SupabaseClient,
  playerId: number,
  bet: number,
  state: BlackjackState,
  outcome: BlackjackOutcome,
  startedAt: string
): Promise<void> {
  const completedAt = new Date().toISOString();
  const rows = state.hands.map((hand, index) => ({
    player_id: playerId,
    bet_amount: handStake(bet, hand),
    result: outcome.hands[index]!.result,
    net_amount: outcome.hands[index]!.net,
    started_at: startedAt,
    completed_at: completedAt,
  }));

  try {
    const { error } = await supabase.from('blackjack_hands').insert(rows);
    if (error) console.error(`Blackjack: could not save the hand history for player ${playerId}: ${error.message}`);
  } catch (error) {
    console.error(`Blackjack: could not save the hand history for player ${playerId}:`, error);
  }
}
