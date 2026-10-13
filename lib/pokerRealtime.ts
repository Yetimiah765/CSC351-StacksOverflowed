// Shared wire contract for the poker room's Supabase Realtime channels, used
// by both server/pokerRealtimeServer.ts and the pages under app/poker/ so the
// two don't drift apart on channel names, event names, or payload shape.
//
// There's one channel per table (pokerTableChannelName) carrying that
// table's full state and its join/leave/sync actions, plus one lobby channel
// carrying a small summary of every table.

export const POKER_LOBBY_CHANNEL_NAME = 'poker:lobby';

export function pokerTableChannelName(tableId: string): string {
  return `poker:table-${tableId}`;
}

export const POKER_EVENT_ACTION = 'action';
export const POKER_EVENT_STATE = 'state';
export const POKER_EVENT_ACK = 'ack';

/** The lobby channel only answers 'sync'; table channels answer all three. */
export type PokerAction = 'join' | 'leave' | 'sync';

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
}

export interface PokerAckPayload {
  requestId: string;
  ok: boolean;
  error?: string;
  seatNumber?: number;
}

/** One table's entry in the lobby channel's `state` broadcast. */
export interface PokerLobbyTable {
  tableId: string;
  name: string;
  smallBlind: number;
  bigBlind: number;
  maxSeats: number;
  seatedCount: number;
  /**
   * Who is seated, so the lobby can send a player who is already seated
   * somewhere straight to that table. Already public on the table channel.
   */
  playerIds: string[];
}

export interface PokerLobbyState {
  tables: PokerLobbyTable[];
}
