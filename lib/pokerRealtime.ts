// Shared wire contract for the poker room's Supabase Realtime channels, used
// by both server/pokerRealtimeServer.ts and the pages under app/poker/ so the
// two don't drift apart on channel names, event names, or payload shape.
//
// There's one channel per table (pokerTableChannelName) carrying that
// table's full state, its actions, and their acks, plus one lobby channel
// carrying a small summary of every table.
//
// These channels are public — anyone with the anon key can read and send on
// them — so nothing secret goes over them in the clear. A player's
// join/leave/act is POSTed to /api/poker/action (PokerActionRequest), which
// checks their session token and broadcasts it signed (lib/pokerSecure.ts);
// only 'sync' is sent on the channel directly. Hole cards go out sealed per
// player in `PokerTableBroadcast.holeCards`.

import type { BettingMove, TablePhase, TableState } from './pokerTable';
import type { RelayedActionType } from './pokerSecure';

export const POKER_LOBBY_CHANNEL_NAME = 'poker:lobby';

export function pokerTableChannelName(tableId: string): string {
  return `poker:table-${tableId}`;
}

export const POKER_EVENT_ACTION = 'action';
export const POKER_EVENT_STATE = 'state';
export const POKER_EVENT_ACK = 'ack';

/** Sent on a channel by any client to ask for the current state. */
export interface PokerSyncPayload {
  requestId: string;
  action: 'sync';
}

/** The JSON body of POST /api/poker/action (with an `Authorization: Bearer <token>` header). */
export interface PokerActionRequest {
  tableId: string;
  /** The client's id for matching the server's ack on the table channel. */
  requestId: string;
  action: RelayedActionType;
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

/** A table channel's `state` broadcast. */
export interface PokerTableBroadcast extends TableState {
  /**
   * player_id -> that player's two hole cards for this hand, sealed so only
   * POST /api/poker/hole-cards can open them, and only for their owner
   * (SRS-6.1). Empty between hands.
   */
  holeCards: Record<string, string>;
}

/** The JSON body of POST /api/poker/hole-cards. */
export interface PokerHoleCardsRequest {
  tableId: string;
  handNumber: number;
  /** The caller's entry from PokerTableBroadcast.holeCards. */
  sealed: string;
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
