// Paying players out when they're removed from a poker seat (SRS-9.9). The
// table (lib/pokerTable.ts) queues every removal — a player who left
// (SRS-21.1/21.3), timed out too often (SRS-9.7) or stayed disconnected too
// long (SRS-9.4) — with the stack they had left, which never includes chips
// already put into a pot (those stay in it for the hand). The poker server
// (server/pokerRealtimeServer.ts) calls payOutRemovals() after anything that
// can remove a player, with a `pay` that credits the player's balance.
//
// A busted player removed for not choosing in time (SRS-12.10) or choosing
// to leave (SRS-12.3) has no chips, so there's nothing to pay.

import type { PokerTable, Removal } from './pokerTable';

/**
 * Takes every removal the table has queued since last time and pays each
 * player's remaining stack into their balance (skipping empty stacks).
 * Returns the removals, for the caller to tell each player why (SRS-9.11).
 */
export async function payOutRemovals(
  table: Pick<PokerTable, 'drainRemovals'>,
  pay: (playerId: number, chips: number) => Promise<void>
): Promise<Removal[]> {
  const removals = table.drainRemovals();
  for (const removal of removals) {
    if (removal.chipStack > 0) await pay(Number(removal.playerId), removal.chipStack);
  }
  return removals;
}
