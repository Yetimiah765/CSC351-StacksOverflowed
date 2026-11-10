import type { SupabaseClient } from '@supabase/supabase-js';
import { handStake, type BlackjackOutcome, type BlackjackState } from '../../../lib/blackjack';
import { changeBalance, type RoundState } from './hands';

// SRS-909.1: every round is saved to blackjack_hands. Its row is opened when
// the round is dealt (result, net_amount and completed_at still NULL, which
// the table allows for a hand in progress), holding the round's cards in
// round_state while it is played (./hands.ts), and closed with the result
// when it ends; a split round adds a row for its second hand, so each hand
// is saved with its own bet. An open row with no round_state is a round the
// server lost (dealt by an older copy of the app that kept the cards in
// memory, or a blackjack on the deal that could not be closed): its bets
// are returned to the player (refundLostRounds).

/** How many past hands GET /api/blackjack/history returns. */
export const HISTORY_LIMIT = 20;

/**
 * Opens the row for a round just dealt; its hand_id is the round's id.
 * `round` is the round to keep playing, or null for one already over.
 * 'taken' if the player already has a round open (dealt at the same moment
 * on another copy of the server); null if it could not be saved.
 */
export async function openRound(
  supabase: SupabaseClient,
  playerId: number,
  bet: number,
  startedAt: string,
  round: RoundState | null
): Promise<number | 'taken' | null> {
  const { data, error } = await supabase
    .from('blackjack_hands')
    .insert({ player_id: playerId, bet_amount: bet, started_at: startedAt, round_state: round })
    .select('hand_id')
    .single();
  // 23505: the one-open-round-per-player index.
  if (error?.code === '23505') return 'taken';
  if (error || !data) {
    console.error(`Blackjack: could not save a new hand for player ${playerId}: ${error?.message}`);
    return null;
  }
  return data.hand_id;
}

/**
 * Closes a finished round's row with its first hand's result, and saves a
 * split round's second hand as a row of its own. `fromStep` is the step the
 * round was read at (null for a round never saved with its cards); the row
 * is closed only if it is still there. 'moved' if another request moved the
 * round first, 'error' if the database failed; either way the round stays
 * open and nothing is paid.
 */
export async function recordRound(
  supabase: SupabaseClient,
  playerId: number,
  handId: number,
  bet: number,
  state: BlackjackState,
  outcome: BlackjackOutcome,
  startedAt: string,
  fromStep: number | null
): Promise<'saved' | 'moved' | 'error'> {
  const completedAt = new Date().toISOString();
  const [first, ...rest] = state.hands.map((hand, index) => ({
    bet_amount: handStake(bet, hand),
    result: outcome.hands[index]!.result,
    net_amount: outcome.hands[index]!.net,
    completed_at: completedAt,
  }));

  let close = supabase
    .from('blackjack_hands')
    .update({ ...first!, round_state: null })
    .eq('hand_id', handId)
    .is('completed_at', null);
  close = fromStep === null ? close.is('round_state', null) : close.eq('round_state->state->>step', String(fromStep));
  const { data, error } = await close.select('hand_id');
  if (error || !data?.length) {
    console.error(`Blackjack: could not save hand ${handId} for player ${playerId}: ${error?.message ?? 'moved on'}`);
    return error ? 'error' : 'moved';
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
  return 'saved';
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
 * with no round_state), saving each as a Push. `minAgeMs` skips rounds
 * dealt more recently than that, which an older copy of the app, still
 * running while a new one is deployed, may be dealing right now. Returns the
 * coins given back.
 */
export async function refundLostRounds(supabase: SupabaseClient, playerId: number, minAgeMs = 0): Promise<number> {
  const { data: open, error } = await supabase
    .from('blackjack_hands')
    .select('hand_id, bet_amount')
    .eq('player_id', playerId)
    .is('completed_at', null)
    .is('round_state', null)
    .lte('started_at', new Date(Date.now() - minAgeMs).toISOString());
  if (error) {
    console.error(`Blackjack: could not look for lost hands of player ${playerId}: ${error.message}`);
    return 0;
  }

  let refunded = 0;
  for (const row of open ?? []) {
    // Closed first, and only if still open, so a bet is never returned twice.
    const { data: closed, error: closeError } = await supabase
      .from('blackjack_hands')
      .update({ result: 'Push', net_amount: 0, completed_at: new Date().toISOString() })
      .eq('hand_id', row.hand_id)
      .is('completed_at', null)
      .is('round_state', null)
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
