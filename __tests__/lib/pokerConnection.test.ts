import { describe, expect, it } from 'vitest';
import { HEARTBEAT_INTERVAL_MS, PokerTable, SILENCE_DISCONNECT_MS } from '../../lib/pokerTable';

// Players' connections (SRS-10.x) and what a disconnection means for their
// seat (SRS-2.x, SRS-9.1-9.4). A 6-seat table with 5/10 blinds.

function tableWith(seatNumbers: number[], stacks: Record<number, number> = {}): PokerTable {
  const table = new PokerTable('table-1', 6, 10, 5);
  seatNumbers.forEach((seatNumber) => {
    table.join(`player-${seatNumber}`, `P${seatNumber}`, stacks[seatNumber] ?? 1000, null, seatNumber);
  });
  return table;
}

const p = (seatNumber: number) => `player-${seatNumber}`;
const seat = (table: PokerTable, seatNumber: number) => table.getState().seats[seatNumber - 1];

/** Every seated player heard from at `now`, as the server does on joining. */
function heardFromAll(table: PokerTable, seatNumbers: number[], now: number) {
  seatNumbers.forEach((seatNumber) => expect(table.heardFrom(p(seatNumber), now)).toBe(true));
}

describe('disconnection detected by silence (SRS-10.1)', () => {
  it('waits 30 seconds, with heartbeats coming three times as often', () => {
    expect(SILENCE_DISCONNECT_MS).toBe(30_000);
    expect(HEARTBEAT_INTERVAL_MS * 3).toBe(SILENCE_DISCONNECT_MS);
  });

  it('marks a player disconnected after 30 seconds without a word', () => {
    const table = tableWith([1, 2, 3]);
    heardFromAll(table, [1, 2, 3], 0);
    expect(table.nextSilenceDeadline()).toBe(SILENCE_DISCONNECT_MS);
    // Seats 1 and 2 keep sending heartbeats; seat 3 goes quiet.
    table.heardFrom(p(1), 20_000);
    table.heardFrom(p(2), 25_000);
    expect(table.markSilentDisconnected(SILENCE_DISCONNECT_MS - 1)).toEqual([]);
    expect(table.markSilentDisconnected(SILENCE_DISCONNECT_MS)).toEqual([p(3)]);
    expect(seat(table, 3)).toMatchObject({ playerId: p(3), disconnected: true });
    expect(seat(table, 1).disconnected).toBe(false);
    // Marked once; the next deadline is the earliest of the others'.
    expect(table.markSilentDisconnected(SILENCE_DISCONNECT_MS + 1)).toEqual([]);
    expect(table.nextSilenceDeadline()).toBe(20_000 + SILENCE_DISCONNECT_MS);
  });

  it('keeps the seat while they are disconnected', () => {
    const table = tableWith([1, 2, 3]);
    heardFromAll(table, [1, 2, 3], 0);
    table.markSilentDisconnected(SILENCE_DISCONNECT_MS);
    expect(table.getState().seatedCount).toBe(3);
    expect(seat(table, 2)).toMatchObject({ playerId: p(2), chipStack: 1000 });
  });

  it('does not watch a player until it has heard from them', () => {
    const table = tableWith([1, 2, 3]);
    expect(table.nextSilenceDeadline()).toBeNull();
    expect(table.markSilentDisconnected(10 * SILENCE_DISCONNECT_MS)).toEqual([]);
  });

  it('ignores word from someone not seated here', () => {
    const table = tableWith([1, 2, 3]);
    expect(table.heardFrom('someone-else', 0)).toBe(false);
  });
});
