// Shared wire contract for the poker room's Supabase Realtime channels, used
// by both server/pokerRealtimeServer.ts and the pages under app/poker/ so the
// two don't drift apart on channel names, event names, or payload shape.
//
// There's one channel per table (pokerTableChannelName) carrying that
// table's full state and its join/leave/sync actions, plus one lobby channel
// carrying a small summary of every table.

import type { BettingMove, TablePhase } from './pokerTable';

export const POKER_LOBBY_CHANNEL_NAME = 'poker:lobby';

export function pokerTableChannelName(tableId: string): string {
  return `poker:table-${tableId}`;
}

export const POKER_EVENT_ACTION = 'action';
export const POKER_EVENT_STATE = 'state';
export const POKER_EVENT_ACK = 'ack';

/** The lobby channel only answers 'sync'; table channels answer all four. */
export type PokerAction = 'join' | 'leave' | 'sync' | 'act';

export interface PokerActionPayload {
  requestId: string;
  action: PokerAction;
  /**
   * Both 'join' and 'leave' carry this — the server resolves identity from
   * the token itself (never from which connection sent the message), so a
   * seat survives a dropped connection and can be left again later from a
   * different tab/session.
   */
  token?: string;
  /** Chosen buy-in amount; only meaningful for a 'join' action. */
  buyIn?: number;
  /** The seat the player picked; only meaningful for a 'join' action. */
  seatNumber?: number;
  /** The betting move, for an 'act' action. */
  move?: BettingMove;
  /** For a 'bet' or 'raise' move: the amount the player's round contribution goes to. */
  amount?: number;
}

export interface PokerAckPayload {
  requestId: string;
  ok: boolean;
  error?: string;
  seatNumber?: number;
  /**
   * On a 'leave' ack: the player is still in the hand, so they'll be folded
   * when it's their turn and removed (and refunded) when the hand ends.
   */
  pending?: boolean;
}

/** One table's entry in the lobby channel's `state` broadcast. */
export interface PokerLobbyTable {
  tableId: string;
  name: string;
  smallBlind: number;
  bigBlind: number;
  maxSeats: number;
  seatedCount: number;
  /** Whether the table is waiting for players, counting down, or mid-hand. */
  phase: TablePhase;
  /**
   * Who is seated, so the lobby can send a player who is already seated
   * somewhere straight to that table. Already public on the table channel.
   */
  playerIds: string[];
}

export interface PokerLobbyState {
  tables: PokerLobbyTable[];
}
