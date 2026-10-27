// The poker lobby's tables. The realtime server (server/pokerRealtimeServer.ts)
// builds one in-memory PokerTable per entry, and the pages read the same list
// to label tables and to reject an unknown /poker/[tableId]. Each also has a
// poker_tables row with the same id as its table_key, where its seats and
// stacks are saved (lib/pokerPersistence.ts); keep the two in step — the
// migration 2026-10-27_poker_persistent_stacks.sql and schema.sql seed them.

import { DEFAULT_TABLE_SEATS } from './pokerTable';

export interface PokerTableConfig {
  /** URL-safe; used in /poker/[tableId] and the table's Realtime channel name. */
  id: string;
  name: string;
  /** The lobby groups tables under this heading. */
  stakes: 'Low' | 'Mid' | 'High';
  smallBlind: number;
  bigBlind: number;
  maxSeats: number;
}

export const POKER_TABLES: PokerTableConfig[] = [
  { id: 'low-1', name: 'Low Stakes 1', stakes: 'Low', smallBlind: 2, bigBlind: 5, maxSeats: DEFAULT_TABLE_SEATS },
  { id: 'low-2', name: 'Low Stakes 2', stakes: 'Low', smallBlind: 2, bigBlind: 5, maxSeats: DEFAULT_TABLE_SEATS },
  { id: 'mid-1', name: 'Mid Stakes 1', stakes: 'Mid', smallBlind: 5, bigBlind: 10, maxSeats: DEFAULT_TABLE_SEATS },
  { id: 'mid-2', name: 'Mid Stakes 2', stakes: 'Mid', smallBlind: 5, bigBlind: 10, maxSeats: DEFAULT_TABLE_SEATS },
  { id: 'high-1', name: 'High Stakes 1', stakes: 'High', smallBlind: 10, bigBlind: 20, maxSeats: DEFAULT_TABLE_SEATS },
  { id: 'high-2', name: 'High Stakes 2', stakes: 'High', smallBlind: 10, bigBlind: 20, maxSeats: DEFAULT_TABLE_SEATS },
];

export function getPokerTableConfig(tableId: string): PokerTableConfig | undefined {
  return POKER_TABLES.find((table) => table.id === tableId);
}
