// Saving poker seats and stacks (UR-007), for the poker realtime server
// (server/pokerRealtimeServer.ts). The server keeps each table in memory
// while it plays; poker_seats in the database is the record. Every write goes
// through a Postgres function that moves coins and seat rows together in one
// transaction (supabase/migrations/2026-11-12_poker_persistent_stacks.sql):
//   * fn_poker_join / fn_poker_rebuy / fn_poker_leave — balance <-> seat
//   * fn_poker_hand_started — a hand is under way (so a restart voids it, SRS-7.4)
//   * fn_poker_hand_finished — every seat's stack after the hand (SRS-7.2)
// and loadSavedTables() reads it all back when the server starts (SRS-7.3).
// Stacks are never written mid-hand, so what's stored is always the value
// from before any hand in progress.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SavedSeat, TableState } from './pokerTable';
import type { RemovalNoticeReason } from './pokerRemovals';

export type PersistResult = { ok: true } | { ok: false; error: string };

export const POKER_MIGRATION = 'supabase/migrations/2026-11-12_poker_persistent_stacks.sql';

interface FunctionReply {
  status: string;
  min?: number;
  max?: number;
  balance?: number;
}

async function callFunction(
  supabase: SupabaseClient,
  name: string,
  args: Record<string, unknown>
): Promise<FunctionReply | null> {
  const { data, error } = await supabase.rpc(name, args);
  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error(`${name} failed:`, error?.message ?? 'no reply');
    return null;
  }
  return data as FunctionReply;
}

// What a refused buy-in means to the player (SRS-1.6, SRS-12.8).
function refusal(reply: FunctionReply | null): string {
  switch (reply?.status) {
    case 'invalid_buy_in':
      return `Buy-in must be between ${reply.min} and ${reply.max}.`;
    case 'insufficient_balance':
      return 'That buy-in exceeds your balance.';
    case 'seat_taken':
      return 'That seat is already taken.';
    case 'invalid_seat':
      return 'That seat does not exist.';
    case 'already_seated':
      return 'You are already seated at another table. Leave that table first.';
    case 'not_seated':
      return 'You are not seated at this table.';
    case 'not_busted':
      return 'You can only buy back in once you are out of chips.';
    case 'not_active':
      return 'Your account cannot play right now.';
    case 'not_found':
      return 'Unable to load your profile.';
    case 'no_table':
      return `This table isn't set up in the database yet (run ${POKER_MIGRATION}).`;
    default:
      return 'Unable to update your balance. Please try again.';
  }
}

/** SRS-1.2: take the buy-in from the player's balance and give them the seat. */
export async function persistJoin(
  supabase: SupabaseClient,
  tableKey: string,
  playerId: number,
  seatNumber: number,
  buyIn: number
): Promise<PersistResult> {
  const reply = await callFunction(supabase, 'fn_poker_join', {
    p_table_key: tableKey,
    p_player_id: playerId,
    p_seat_number: seatNumber,
    p_buy_in: buyIn,
  });
  return reply?.status === 'joined' ? { ok: true } : { ok: false, error: refusal(reply) };
}

/** SRS-12.4: a busted player's buy-back, from their balance to their stack. */
export async function persistRebuy(
  supabase: SupabaseClient,
  tableKey: string,
  playerId: number,
  amount: number
): Promise<PersistResult> {
  const reply = await callFunction(supabase, 'fn_poker_rebuy', {
    p_table_key: tableKey,
    p_player_id: playerId,
    p_amount: amount,
  });
  return reply?.status === 'rebought' ? { ok: true } : { ok: false, error: refusal(reply) };
}

/**
 * SRS-9.9 / SRS-9.10: free the seat and pay `chipStack` (the stack as the
 * table holds it now, never chips already in a pot) into the player's
 * balance. Tried twice, since there's no ack to report a failure to; a
 * failure is logged with the amount owed.
 */
export async function persistLeave(
  supabase: SupabaseClient,
  tableKey: string,
  playerId: number,
  chipStack: number
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await callFunction(supabase, 'fn_poker_leave', {
      p_table_key: tableKey,
      p_player_id: playerId,
      p_chip_stack: chipStack,
    });
    // 'not_seated' means there was nothing to pay out (already left).
    if (reply?.status === 'left' || reply?.status === 'not_seated') return true;
  }
  // eslint-disable-next-line no-console
  console.error(`Could not pay ${chipStack} back to player ${playerId} leaving ${tableKey}.`);
  return false;
}

/** SRS-7.4: a hand is under way at this table, with these button and blind seats. */
export async function persistHandStarted(
  supabase: SupabaseClient,
  tableKey: string,
  state: Pick<TableState, 'dealerSeat' | 'smallBlindSeat' | 'bigBlindSeat'>
): Promise<void> {
  await callFunction(supabase, 'fn_poker_hand_started', {
    p_table_key: tableKey,
    p_dealer_seat: state.dealerSeat,
    p_small_blind_seat: state.smallBlindSeat,
    p_big_blind_seat: state.bigBlindSeat,
  });
}

/** SRS-7.4: once a hand a restart interrupted has been voided, the table is no longer mid-hand. */
export async function clearHandInProgress(supabase: SupabaseClient, tableKey: string): Promise<void> {
  const { error } = await supabase.from('poker_tables').update({ hand_in_progress: false }).eq('table_key', tableKey);
  // eslint-disable-next-line no-console
  if (error) console.error(`Could not clear hand_in_progress at ${tableKey}:`, error.message);
}

/** What's saved about a seat after a hand. */
export interface SeatToSave {
  seatNumber: number;
  playerId: number;
  chipStack: number;
  owesSmallBlind: boolean;
  owesBigBlind: boolean;
  consecutiveTimeouts: number;
}

/** The seats to save after a hand: everyone still seated, with their stack, missed blinds and timeouts. */
export function seatsToSave(state: Pick<TableState, 'seats'>): SeatToSave[] {
  return state.seats.flatMap((seat) =>
    seat.playerId && seat.chipStack !== null
      ? [
          {
            seatNumber: seat.seatNumber,
            playerId: Number(seat.playerId),
            chipStack: seat.chipStack,
            owesSmallBlind: seat.missedSmallBlind,
            owesBigBlind: seat.missedBigBlind,
            consecutiveTimeouts: seat.timeouts,
          },
        ]
      : []
  );
}

/** SRS-NFR-019: a hand's stacks must be saved within this long of it ending. */
export const STACK_SAVE_LIMIT_MS = 1_000;

/**
 * SRS-NFR-019: runs a hand's save (persistHandFinished()) and times it from
 * when the hand ended, `endedAt`, to when the save was done — which includes
 * any wait behind the table's earlier writes. `now` is the clock, for tests.
 */
export async function saveHandOnTime(
  save: () => Promise<boolean>,
  endedAt: number,
  now: () => number = Date.now
): Promise<{ saved: boolean; ms: number; onTime: boolean }> {
  const saved = await save();
  const ms = now() - endedAt;
  return { saved, ms, onTime: saved && ms <= STACK_SAVE_LIMIT_MS };
}

/** SRS-7.2: save every seat's stack once a hand has ended. Tried twice; resolves with whether it was saved. */
export async function persistHandFinished(supabase: SupabaseClient, tableKey: string, seats: SeatToSave[]): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await callFunction(supabase, 'fn_poker_hand_finished', {
      p_table_key: tableKey,
      p_seats: seats,
    });
    if (reply?.status === 'saved') return true;
  }
  // eslint-disable-next-line no-console
  console.error(`Could not save the stacks at ${tableKey} after a hand.`);
  return false;
}

export interface SavedTable {
  dealerSeat: number | null;
  smallBlindSeat: number | null;
  bigBlindSeat: number | null;
  /** The server stopped during a hand: it's void, and the stacks are from before it (SRS-7.4). */
  handInProgress: boolean;
  seats: Omit<SavedSeat, 'username'>[];
}

/**
 * SRS-7.3: every lobby table's saved seats, keyed by table key. A key with
 * no row means the migration hasn't been run.
 */
export async function loadSavedTables(
  supabase: SupabaseClient,
  tableKeys: string[]
): Promise<{ ok: true; tables: Map<string, SavedTable> } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('poker_tables')
    .select(
      'table_key, dealer_button_seat, last_small_blind_seat, last_big_blind_seat, hand_in_progress, poker_seats(seat_number, player_id, chip_stack, owes_small_blind, owes_big_blind, consecutive_timeouts)'
    )
    .in('table_key', tableKeys);
  if (error) return { ok: false, error: `${error.message} (has ${POKER_MIGRATION} been run?)` };

  const tables = new Map<string, SavedTable>();
  for (const row of (data ?? []) as {
    table_key: string;
    dealer_button_seat: number | null;
    last_small_blind_seat: number | null;
    last_big_blind_seat: number | null;
    hand_in_progress: boolean;
    poker_seats: {
      seat_number: number;
      player_id: number;
      chip_stack: number | string;
      owes_small_blind: boolean;
      owes_big_blind: boolean;
      consecutive_timeouts: number | null;
    }[];
  }[]) {
    tables.set(row.table_key, {
      dealerSeat: row.dealer_button_seat,
      smallBlindSeat: row.last_small_blind_seat,
      bigBlindSeat: row.last_big_blind_seat,
      handInProgress: row.hand_in_progress,
      seats: (row.poker_seats ?? []).map((seat) => ({
        seatNumber: seat.seat_number,
        playerId: String(seat.player_id),
        // BIGINT can come back from PostgREST as a string.
        chipStack: Number(seat.chip_stack),
        missedSmallBlind: seat.owes_small_blind,
        missedBigBlind: seat.owes_big_blind,
        timeouts: seat.consecutive_timeouts ?? 0,
      })),
    });
  }

  const missing = tableKeys.filter((key) => !tables.has(key));
  if (missing.length > 0) {
    return { ok: false, error: `poker_tables has no row for ${missing.join(', ')} (run ${POKER_MIGRATION}).` };
  }
  return { ok: true, tables };
}

// ---------- removal notices (SRS-9.11, SRS-9.12) ----------

/** poker_removal_notices.removal_reason for each reason a player is told about. */
export const NOTICE_REASONS: Record<RemovalNoticeReason, string> = {
  disconnected: 'Disconnection timeout',
  timeouts: 'Consecutive turn timeouts',
  busted: 'No busted-player response',
};

/**
 * Records that the table removed a player, and why. A player who was
 * connected was told there and then (SRS-9.11), so theirs is saved as
 * delivered; a disconnected player's waits until they next open the site
 * (SRS-9.12, takeRemovalNotices()).
 */
export async function recordRemovalNotice(
  supabase: SupabaseClient,
  tableKey: string,
  playerId: number,
  reason: RemovalNoticeReason,
  delivered: boolean
): Promise<void> {
  const { data: table } = await supabase.from('poker_tables').select('table_id').eq('table_key', tableKey).maybeSingle();
  const now = new Date().toISOString();
  const { error } = await supabase.from('poker_removal_notices').insert({
    player_id: playerId,
    table_id: (table as { table_id: number } | null)?.table_id ?? null,
    removal_reason: NOTICE_REASONS[reason],
    removed_at: now,
    delivered_at: delivered ? now : null,
  });
  // eslint-disable-next-line no-console
  if (error) console.error(`Could not record the removal notice for player ${playerId}:`, error.message);
}

/** A removal notice as the player is shown it. */
export interface RemovalNoticeView {
  reason: RemovalNoticeReason;
  tableName: string | null;
  removedAt: string;
}

/**
 * SRS-9.12: the player's notices they haven't been shown (removed while
 * disconnected), oldest first, marked shown as they're handed over.
 */
export async function takeRemovalNotices(supabase: SupabaseClient, playerId: number): Promise<RemovalNoticeView[] | null> {
  const { data, error } = await supabase
    .from('poker_removal_notices')
    .select('notice_id, removal_reason, removed_at, poker_tables(table_name)')
    .eq('player_id', playerId)
    .is('delivered_at', null)
    .order('removed_at', { ascending: true });
  if (error) return null;
  const rows = (data ?? []) as unknown as {
    notice_id: number;
    removal_reason: string;
    removed_at: string;
    poker_tables: { table_name: string } | null;
  }[];
  if (rows.length === 0) return [];
  const { error: markError } = await supabase
    .from('poker_removal_notices')
    .update({ delivered_at: new Date().toISOString() })
    .in(
      'notice_id',
      rows.map((row) => row.notice_id)
    );
  if (markError) return null;
  const byText = Object.fromEntries(Object.entries(NOTICE_REASONS).map(([reason, text]) => [text, reason])) as Record<
    string,
    RemovalNoticeReason
  >;
  return rows.flatMap((row) =>
    byText[row.removal_reason]
      ? [{ reason: byText[row.removal_reason] as RemovalNoticeReason, tableName: row.poker_tables?.table_name ?? null, removedAt: row.removed_at }]
      : []
  );
}
