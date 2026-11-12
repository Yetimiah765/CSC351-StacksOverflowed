import { describe, expect, it } from 'vitest';
import { PokerTable, TURN_TIME_LIMIT_MS } from '../../lib/pokerTable';

// The turn clock and what happens when it runs out (SRS-4.x, SRS-NFR-018).
// Same set-up as pokerTableHand.test.ts: a 6-seat table with 5/10 blinds.

function tableWith(seatNumbers: number[], stacks: Record<number, number> = {}): PokerTable {
  const table = new PokerTable('table-1', 6, 10, 5);
  seatNumbers.forEach((seatNumber) => {
    table.join(`player-${seatNumber}`, `P${seatNumber}`, stacks[seatNumber] ?? 1000, null, seatNumber);
  });
  return table;
}

const pick = (index: number) => () => index;
const p = (seatNumber: number) => `player-${seatNumber}`;

/** A hand under way at seats 1-3: button 1, SB 2, BB 3, so seat 1 acts first. */
function handUnderWay() {
  const table = tableWith([1, 2, 3]);
  table.startHand(pick(0));
  return table;
}

describe('the turn clock (SRS-NFR-018)', () => {
  it('gives each player 20 seconds', () => {
    expect(TURN_TIME_LIMIT_MS).toBe(20_000);
  });

  it('starts when the caller first sees the turn, and counts down from there', () => {
    const table = handUnderWay();
    expect(table.getState().activeSeat).toBe(1);
    // Not timed until the caller starts it.
    expect(table.getState(0).turnMsRemaining).toBeNull();
    expect(table.nextTurnDeadline()).toBeNull();

    table.trackTurn(1_000);
    expect(table.nextTurnDeadline()).toBe(1_000 + TURN_TIME_LIMIT_MS);
    expect(table.getState(1_000).turnMsRemaining).toBe(TURN_TIME_LIMIT_MS);
    expect(table.getState(6_000).turnMsRemaining).toBe(TURN_TIME_LIMIT_MS - 5_000);
    // Never below zero.
    expect(table.getState(60_000).turnMsRemaining).toBe(0);
  });

  it('keeps running across repeated tracking of the same turn', () => {
    const table = handUnderWay();
    table.trackTurn(1_000);
    table.trackTurn(5_000);
    expect(table.nextTurnDeadline()).toBe(1_000 + TURN_TIME_LIMIT_MS);
  });

  it('starts afresh for the next player', () => {
    const table = handUnderWay();
    table.trackTurn(1_000);
    expect(table.act(p(1), 'call')).toEqual({ ok: true });
    expect(table.getState().activeSeat).toBe(2);
    // The new turn isn't timed until the caller sees it.
    expect(table.getState(3_000).turnMsRemaining).toBeNull();
    table.trackTurn(3_000);
    expect(table.nextTurnDeadline()).toBe(3_000 + TURN_TIME_LIMIT_MS);
  });

  it('times nothing between hands', () => {
    const table = handUnderWay();
    table.trackTurn(1_000);
    table.act(p(1), 'fold');
    table.act(p(2), 'fold');
    expect(table.getState().phase).not.toBe('in-hand');
    table.trackTurn(2_000);
    expect(table.nextTurnDeadline()).toBeNull();
    expect(table.getState(2_000).turnMsRemaining).toBeNull();
  });
});
