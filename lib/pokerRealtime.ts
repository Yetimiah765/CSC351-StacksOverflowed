// Shared wire contract for the poker table's Supabase Realtime channel, used
// by both server/pokerRealtimeServer.ts and app/poker/page.tsx so the two
// don't drift apart on event names or payload shape.

export const POKER_CHANNEL_NAME = 'poker:table-1';

export const POKER_EVENT_ACTION = 'action';
export const POKER_EVENT_STATE = 'state';
export const POKER_EVENT_ACK = 'ack';

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
}

export interface PokerAckPayload {
  requestId: string;
  ok: boolean;
  error?: string;
  seatNumber?: number;
}
