import type { SupabaseClient } from '@supabase/supabase-js';
import { handStake, type BlackjackOutcome, type BlackjackState } from '../../../lib/blackjack';
import { changeBalance } from './hands';

// SRS-909.1: every round is saved to blackjack_hands. Its row is opened when
// the round is dealt (result, net_amount and completed_at still NULL, which
// the table allows for a hand in progress) and closed with the result when
// it ends; a split round adds a row for its second hand, so each hand is
// saved with its own bet. The cards stay in memory (./hands.ts), so a server
// restart forgets the round, but its open row remains: that is how a lost
// round's bets are found and returned to the player (refundLostRounds).

/** How many past hands GET /api/blackjack/history returns. */
export const HISTORY_LIMIT = 20;

/** Opens the row for a round just dealt; its hand_id is the round's id. Null if it could not be saved. */
export async function openRound(
  supabase: SupabaseClient,
  playerId: number,
  bet: number,
  startedAt: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from('blackjack_hands')
    .insert({ player_id: playerId, bet_amount: bet, started_at: startedAt })
    .select('hand_id')
    .single();
  if (error || !data) {
    console.error(`Blackjack: could not save a new hand for player ${playerId}: ${error?.message}`);
    return null;
  }
  return data.hand_id;
}

/**
 * Keeps an open round's bet_amount equal to everything staked on it, after a
 * Double or Split took another bet, so a lost round returns all of it.
 */
export async function saveStake(supabase: SupabaseClient, handId: number, stake: number): Promise<void> {
  const { error } = await supabase
    .from('blackjack_hands')
    .update({ bet_amount: stake })
    .eq('hand_id', handId)
    .is('completed_at', null);
  if (error) console.error(`Blackjack: could not save the stake of hand ${handId}: ${error.message}`);
}

/**
 * Closes a finished round's row with its first hand's result, and saves a
 * split round's second hand as a row of its own. False if the round could not
 * be closed: its row stays open, so it is returned as a lost round instead of
 * being paid (never both).
 */
export async function recordRound(
  supabase: SupabaseClient,
  playerId: number,
  handId: number,
  bet: number,
  state: BlackjackState,
  outcome: BlackjackOutcome,
  startedAt: string
): Promise<boolean> {
  const completedAt = new Date().toISOString();
  const [first, ...rest] = state.hands.map((hand, index) => ({
    bet_amount: handStake(bet, hand),
    result: outcome.hands[index]!.result,
    net_amount: outcome.hands[index]!.net,
    completed_at: completedAt,
  }));

  const { data, error } = await supabase
    .from('blackjack_hands')
    .update(first!)
    .eq('hand_id', handId)
    .is('completed_at', null)
    .select('hand_id');
  if (error || !data?.length) {
    console.error(`Blackjack: could not save hand ${handId} for player ${playerId}: ${error?.message ?? 'not open'}`);
    return false;
  }

  if (rest.length > 0) {
    // The coins are settled by the first row, so a failure here only leaves
    // a gap in the history.
    const { error: insertError } = await supabase
      .from('blackjack_hands')
      .insert(rest.map((row) => ({ ...row, player_id: playerId, started_at: startedAt })));
    if (insertError) console.error(`Blackjack: could not save a split hand for player ${playerId}: ${insertError.message}`);
  }

  await addToStats(supabase, playerId, outcome);
  return true;
}

const STATS_WRITE_ATTEMPTS = 3;

/**
 * SRS-117.1 / 117.4 / 118.1 / 118.3: adds a finished round to the player's
 * blackjack money won and money lost in player_game_stats, which the profile
 * shows. Each hand counts on its own, like the hand history: a split round
 * that wins one hand and loses the other adds to both. Winnings are what the
 * hand won, without the bet that came back. Like the balance, the row is
 * changed only if it still holds the figures just read, retried on a lost
 * race. The coins have already moved, so a failure is only logged.
 */
async function addToStats(supabase: SupabaseClient, playerId: number, outcome: BlackjackOutcome): Promise<void> {
  const won = outcome.hands.reduce((total, hand) => total + Math.max(hand.net, 0), 0);
  const lost = outcome.hands.reduce((total, hand) => total + Math.max(-hand.net, 0), 0);
  if (won === 0 && lost === 0) return;

  for (let attempt = 0; attempt < STATS_WRITE_ATTEMPTS; attempt++) {
    const { data: row, error: readError } = await supabase
      .from('player_game_stats')
      .select('money_won, money_lost')
      .eq('player_id', playerId)
      .eq('game_code', 'blackjack')
      .maybeSingle();
    if (readError) break;

    if (!row) {
      const { error } = await supabase
        .from('player_game_stats')
        .insert({ player_id: playerId, game_code: 'blackjack', money_won: won, money_lost: lost });
      if (!error) return;
      // 23505: another round made the row first; add to it instead.
      if (error.code !== '23505') break;
      continue;
    }

    const { data: updated, error } = await supabase
      .from('player_game_stats')
      .update({ money_won: Number(row.money_won) + won, money_lost: Number(row.money_lost) + lost })
      .eq('player_id', playerId)
      .eq('game_code', 'blackjack')
      .eq('money_won', row.money_won)
      .eq('money_lost', row.money_lost)
      .select('player_id');
    if (error) break;
    if (updated?.length) return;
  }
  console.error(`Blackjack: could not add won ${won} / lost ${lost} to the stats of player ${playerId}`);
}

/**
 * Returns the bets of the player's rounds that the server lost (an open row
 * with no round in memory, e.g. after a restart), saving each as a Push.
 * `keepHandId` is the round still in memory, if any. A round being dealt
 * has its row before it is in memory, so call this while the player is
 * marked busy, or pass `minAgeMs` to skip rounds dealt more recently than
 * that. Returns the coins given back.
 */
export async function refundLostRounds(
  supabase: SupabaseClient,
  playerId: number,
  keepHandId?: number,
  minAgeMs = 0
): Promise<number> {
  const { data: open, error } = await supabase
    .from('blackjack_hands')
    .select('hand_id, bet_amount')
    .eq('player_id', playerId)
    .is('completed_at', null)
    .lte('started_at', new Date(Date.now() - minAgeMs).toISOString());
  if (error) {
    console.error(`Blackjack: could not look for lost hands of player ${playerId}: ${error.message}`);
    return 0;
  }

  let refunded = 0;
  for (const row of open ?? []) {
    if (row.hand_id === keepHandId) continue;
    // Closed first, and only if still open, so a bet is never returned twice.
    const { data: closed, error: closeError } = await supabase
      .from('blackjack_hands')
      .update({ result: 'Push', net_amount: 0, completed_at: new Date().toISOString() })
      .eq('hand_id', row.hand_id)
      .is('completed_at', null)
      .select('hand_id');
    if (closeError || !closed?.length) continue;

    const amount = Number(row.bet_amount);
    const paid = await changeBalance(supabase, playerId, amount);
    if (!paid.ok) {
      console.error(`Blackjack: failed to return ${amount} for lost hand ${row.hand_id} to player ${playerId}: ${paid.error}`);
      continue;
    }
    refunded += amount;
  }
  return refunded;
}
