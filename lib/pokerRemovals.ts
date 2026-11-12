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
//
// The table has already opened the seat by then (SRS-9.10): a removal
// empties it, so it's free for anyone to sit in, and the server's next
// table and lobby broadcasts show it open.

import { BUSTED_DECISION_TIMEOUT_MS, CONSECUTIVE_TIMEOUT_LIMIT, type PokerTable, type Removal } from './pokerTable';

/**
 * Why a player was removed, as they're told it (SRS-9.11): the table's own
 * removals (but not leaving, which they chose), plus a busted player who
 * didn't buy back in or leave in time (SRS-12.10).
 */
export type RemovalNoticeReason = 'timeouts' | 'disconnected' | 'busted';

/** What a removed player is told (SRS-9.11). */
export function removalNotice(reason: RemovalNoticeReason): string {
  switch (reason) {
    case 'timeouts':
      return `You were removed from the table because your turn timed out in ${CONSECUTIVE_TIMEOUT_LIMIT} hands in a row. Your chips have been returned to your balance.`;
    case 'disconnected':
      return 'You were removed from the table because you were disconnected for too long. Your chips have been returned to your balance.';
    case 'busted':
      return `You were removed from your seat because you didn't buy back in or leave within ${BUSTED_DECISION_TIMEOUT_MS / 1000} seconds of running out of chips.`;
  }
}

/** The removals a player is told about: all but leaving, which they asked for. */
export function noticeReason(removal: Removal): RemovalNoticeReason | null {
  return removal.reason === 'left' ? null : removal.reason;
}

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
