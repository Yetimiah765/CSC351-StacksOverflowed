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

describe('auto-check when time runs out (SRS-4.2)', () => {
  /** Preflop called round to the big blind (seat 3), who has nothing to call. */
  function bigBlindToCheck() {
    const table = handUnderWay();
    expect(table.act(p(1), 'call')).toEqual({ ok: true });
    expect(table.act(p(2), 'call')).toEqual({ ok: true });
    expect(table.getState().activeSeat).toBe(3);
    table.trackTurn(10_000);
    return table;
  }

  it('does nothing before the time is up', () => {
    const table = bigBlindToCheck();
    expect(table.timeOutTurn(10_000 + TURN_TIME_LIMIT_MS - 1)).toBeNull();
    expect(table.getState().activeSeat).toBe(3);
    expect(table.getState().street).toBe('preflop');
  });

  it('checks for a player who does not face a bet', () => {
    const table = bigBlindToCheck();
    expect(table.timeOutTurn(10_000 + TURN_TIME_LIMIT_MS)).toEqual({ playerId: p(3), move: 'check' });
    const state = table.getState();
    expect(state.lastAction).toMatchObject({ seatNumber: 3, move: 'check', automatic: true });
    // The check closed the round: the flop is out.
    expect(state.street).toBe('flop');
    expect(state.board).toHaveLength(3);
  });

  it('only marks the automatic actions as automatic', () => {
    const table = bigBlindToCheck();
    expect(table.getState().lastAction?.automatic).toBeUndefined();
  });
});

describe('auto-fold when time runs out (SRS-4.3)', () => {
  it('folds for a player who faces a bet', () => {
    // Preflop, seat 1 (first to act) faces the big blind.
    const table = handUnderWay();
    table.trackTurn(0);
    expect(table.timeOutTurn(TURN_TIME_LIMIT_MS)).toEqual({ playerId: p(1), move: 'fold' });
    const state = table.getState();
    expect(state.seats[0]).toMatchObject({ inHand: false, folded: true, lastAction: 'Fold' });
    expect(state.lastAction).toMatchObject({ seatNumber: 1, move: 'fold', automatic: true });
    // The turn moves on to the small blind.
    expect(state.activeSeat).toBe(2);
  });

  it('folds a player facing a bet after the flop too', () => {
    const table = handUnderWay();
    table.act(p(1), 'call');
    table.act(p(2), 'call');
    table.act(p(3), 'check');
    // Flop: seat 2 bets, seat 3 runs out of time facing it.
    expect(table.act(p(2), 'bet', 20)).toEqual({ ok: true });
    table.trackTurn(50_000);
    expect(table.timeOutTurn(50_000 + TURN_TIME_LIMIT_MS)).toEqual({ playerId: p(3), move: 'fold' });
    expect(table.getState().activeSeat).toBe(1);
  });

  it("ends the hand when the fold leaves one player", () => {
    const table = handUnderWay();
    table.act(p(1), 'fold');
    // The small blind faces the big blind and runs out of time.
    table.trackTurn(0);
    expect(table.timeOutTurn(TURN_TIME_LIMIT_MS)).toEqual({ playerId: p(2), move: 'fold' });
    const state = table.getState();
    expect(state.phase).not.toBe('in-hand');
    expect(state.lastHandResult).toMatchObject({ reason: 'fold', awards: [{ seatNumber: 3, amount: 10 }] }); // the blinds, less the big blind's uncalled 5 (SRS-19.5)
  });
});

describe('the hand moves on after an automatic action (SRS-4.4)', () => {
  /** What the server does when the turn's timer fires: start the clock, wait it out, time out. */
  function runOutTheClock(table: PokerTable, now: number) {
    table.trackTurn(now);
    const deadline = table.nextTurnDeadline() as number;
    expect(deadline).not.toBeNull();
    return { result: table.timeOutTurn(deadline), at: deadline };
  }

  it('passes the turn on, with a fresh clock for the next player', () => {
    const table = handUnderWay();
    const { at } = runOutTheClock(table, 0);
    expect(table.getState().activeSeat).toBe(2);
    table.trackTurn(at);
    expect(table.nextTurnDeadline()).toBe(at + TURN_TIME_LIMIT_MS);
  });

  it('skips players who can no longer act (SRS-18.5)', () => {
    // Seat 2 is all-in, so when seat 1 times out the turn goes to seat 3.
    const table = tableWith([1, 2, 3, 4]);
    table.startHand(pick(0)); // button 1, SB 2, BB 3, seat 4 first
    table.act(p(4), 'call');
    table.act(p(1), 'call');
    table.act(p(2), 'raise', 1000); // all-in
    table.act(p(3), 'fold');
    // Seat 4 faces the all-in and runs out of time.
    expect(runOutTheClock(table, 0).result).toEqual({ playerId: p(4), move: 'fold' });
    expect(table.getState().activeSeat).toBe(1);
  });

  it('closes the round and deals the next street (SRS-18.3)', () => {
    const table = handUnderWay();
    table.act(p(1), 'call');
    table.act(p(2), 'call');
    runOutTheClock(table, 0); // the big blind checks
    expect(table.getState().street).toBe('flop');
    expect(table.getState().activeSeat).toBe(2);
  });

  it('can carry a hand through to the showdown on its own', () => {
    const table = handUnderWay();
    table.act(p(1), 'call');
    table.act(p(2), 'call');
    // Nobody acts again: every turn times out as a check.
    let now = 0;
    for (let turns = 0; table.getState().phase === 'in-hand' && turns < 20; turns++) {
      const { result, at } = runOutTheClock(table, now);
      expect(result?.move).toBe('check');
      now = at;
    }
    const state = table.getState();
    expect(state.phase).not.toBe('in-hand');
    expect(state.lastHandResult?.reason).toBe('showdown');
    // And the table goes on to count down to the next hand.
    expect(table.updateCountdown(now)).toBe('started');
  });
});
