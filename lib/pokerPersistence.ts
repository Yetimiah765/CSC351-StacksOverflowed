// Saving and restoring poker seats and stacks (UR-007), for the poker
// realtime server (server/pokerRealtimeServer.ts). The server keeps each
// table in memory while it plays; poker_seats in the database is the record.
// Every write goes through a Postgres function that moves coins and seat
// rows together in one transaction (supabase/migrations/
// 2026-10-27_poker_persistent_stacks.sql):
//   * fn_poker_join / fn_poker_rebuy / fn_poker_leave — balance <-> seat
//   * fn_poker_hand_started — a hand is under way (so a restart voids it)
//   * fn_poker_hand_finished — every seat's stack after the hand (SRS-7.2)
// Stacks are never written mid-hand, so what's stored is always the value
// from before any hand in progress — which is what restoring after a
// restart needs (SRS-7.3, SRS-7.4).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SavedSeat, TableState } from './pokerTable';

export type PersistResult = { ok: true } | { ok: false; error: string };

const MIGRATION = 'supabase/migrations/2026-10-27_poker_persistent_stacks.sql';

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
      return `This table isn't set up in the database yet (run ${MIGRATION}).`;
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
 * table holds it now) into the player's balance. Tried twice, since there's
 * no ack to report a failure to; a failure is logged with the amount owed.
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

/** The seats to save after a hand: everyone still seated, with their stack and missed blinds. */
export function seatsToSave(state: Pick<TableState, 'seats'>) {
  return state.seats.flatMap((seat) =>
    seat.playerId && seat.chipStack !== null
      ? [
          {
            seatNumber: seat.seatNumber,
            playerId: Number(seat.playerId),
            chipStack: seat.chipStack,
            owesSmallBlind: seat.missedSmallBlind,
            owesBigBlind: seat.missedBigBlind,
          },
        ]
      : []
  );
}

/** SRS-7.2 / SRS-NFR-019: save every seat's stack once a hand has ended. Tried twice. */
export async function persistHandFinished(
  supabase: SupabaseClient,
  tableKey: string,
  seats: ReturnType<typeof seatsToSave>
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await callFunction(supabase, 'fn_poker_hand_finished', {
      p_table_key: tableKey,
      p_seats: seats,
    });
    if (reply?.status === 'saved') return;
  }
  // eslint-disable-next-line no-console
  console.error(`Could not save the stacks at ${tableKey} after a hand.`);
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
      'table_key, dealer_button_seat, last_small_blind_seat, last_big_blind_seat, hand_in_progress, poker_seats(seat_number, player_id, chip_stack, owes_small_blind, owes_big_blind)'
    )
    .in('table_key', tableKeys);
  if (error) return { ok: false, error: `${error.message} (has ${MIGRATION} been run?)` };

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
        // BIGINT comes back as a string from PostgREST when it's large.
        chipStack: Number(seat.chip_stack),
        missedSmallBlind: seat.owes_small_blind,
        missedBigBlind: seat.owes_big_blind,
      })),
    });
  }

  const missing = tableKeys.filter((key) => !tables.has(key));
  if (missing.length > 0) {
    return { ok: false, error: `poker_tables has no row for ${missing.join(', ')} (run ${MIGRATION}).` };
  }
  return { ok: true, tables };
}

/** After voiding an interrupted hand, the table is no longer mid-hand. */
export async function clearHandInProgress(supabase: SupabaseClient, tableKey: string): Promise<void> {
  const { error } = await supabase.from('poker_tables').update({ hand_in_progress: false }).eq('table_key', tableKey);
  // eslint-disable-next-line no-console
  if (error) console.error(`Could not clear hand_in_progress at ${tableKey}:`, error.message);
}
