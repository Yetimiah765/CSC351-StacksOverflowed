import { describe, expect, it } from 'vitest';
import { CONSECUTIVE_TIMEOUT_LIMIT, PokerTable, TURN_TIME_LIMIT_MS, timedOutHandsBeforeRemoval } from '../../lib/pokerTable';
import { createDeck } from '../../lib/pokerCards';

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

describe('the consecutive-timeout threshold (SRS-NFR-014)', () => {
  it('is four hands', () => {
    expect(CONSECUTIVE_TIMEOUT_LIMIT).toBe(4);
  });
});

/** Starts the turn's clock at `now` and lets it run out; returns when it did. */
function timeOut(table: PokerTable, now = 0) {
  table.trackTurn(now);
  const at = table.nextTurnDeadline() as number;
  expect(table.timeOutTurn(at)).not.toBeNull();
  return at;
}

describe('the timeout counter (SRS-9.5)', () => {
  it('starts at zero', () => {
    const table = handUnderWay();
    expect(table.getState().seats.slice(0, 3).map((seat) => seat.timeouts)).toEqual([0, 0, 0]);
  });

  it('counts a hand in which the player timed out, once however many times', () => {
    const table = handUnderWay();
    table.act(p(1), 'call');
    table.act(p(2), 'call');
    timeOut(table); // seat 3 (big blind) checks
    expect(table.getState().seats[2].timeouts).toBe(1);
    // Flop: seats 2 and 1 check, seat 3 times out again.
    table.act(p(2), 'check');
    table.act(p(1), 'check');
    expect(table.getState().activeSeat).toBe(3);
    timeOut(table);
    expect(table.getState().seats[2].timeouts).toBe(1);
    // Only the player who timed out.
    expect(table.getState().seats[0].timeouts).toBe(0);
  });

  it('adds one for each hand in a row', () => {
    const table = tableWith([1, 2, 3]);
    for (let hand = 1; hand <= 2; hand++) {
      table.updateCountdown(0);
      table.startHand(pick(0));
      // Seat 1 is first to act in the first hand; time them out whenever it's them.
      while (table.getState().phase === 'in-hand') {
        const { activeSeat } = table.getState();
        if (activeSeat === 1) timeOut(table);
        else table.act(p(activeSeat as number), table.getState().currentBet > (table.getState().seats[(activeSeat as number) - 1].bet) ? 'call' : 'check');
      }
      expect(table.getState().seats[0].timeouts).toBe(hand);
    }
  });
});

describe('resetting the timeout counter (SRS-9.6)', () => {
  it('goes back to zero when the player acts for themselves', () => {
    const table = handUnderWay();
    table.act(p(1), 'call');
    table.act(p(2), 'call');
    timeOut(table); // seat 3 checks automatically
    expect(table.getState().seats[2].timeouts).toBe(1);
    table.act(p(2), 'check');
    table.act(p(1), 'check');
    expect(table.act(p(3), 'check')).toEqual({ ok: true });
    expect(table.getState().seats[2].timeouts).toBe(0);
  });

  it('is not reset by an action the table refused', () => {
    const table = handUnderWay();
    table.act(p(1), 'call');
    table.act(p(2), 'call');
    timeOut(table);
    // Seat 3 tries to act out of turn.
    expect(table.act(p(3), 'check').ok).toBe(false);
    expect(table.getState().seats[2].timeouts).toBe(1);
  });
});

describe('putting off removing a player in the hand (SRS-9.13)', () => {
  it('keeps a player who is still in the hand until it ends', () => {
    const table = handUnderWay();
    expect(table.removePlayer(p(1), 'timeouts')).toBe(true);
    let state = table.getState();
    expect(state.seats[0]).toMatchObject({ playerId: p(1), inHand: true, removalPending: 'timeouts' });
    expect(table.drainRemovals()).toEqual([]);
    // They keep playing it.
    expect(table.act(p(1), 'call')).toEqual({ ok: true });
    table.act(p(2), 'fold');
    table.act(p(3), 'fold');
    state = table.getState();
    expect(state.phase).not.toBe('in-hand');
    expect(state.seats[0].playerId).toBeNull();
    expect(table.drainRemovals()).toEqual([{ playerId: p(1), chipStack: 1015, reason: 'timeouts' }]);
  });

  it('removes a player who has folded straight away, their bets staying in the pot', () => {
    const table = handUnderWay();
    table.act(p(1), 'call');
    table.act(p(2), 'fold');
    // Seat 2 put in the small blind (5) before folding.
    expect(table.removePlayer(p(2), 'timeouts')).toBe(true);
    expect(table.getState().seats[1].playerId).toBeNull();
    expect(table.drainRemovals()).toEqual([{ playerId: p(2), chipStack: 995, reason: 'timeouts' }]);
    table.act(p(3), 'check');
    // The flop pot still has seat 2's small blind in it.
    expect(table.getState().pot).toBe(25);
  });

  it('removes a player straight away between hands', () => {
    const table = tableWith([1, 2, 3]);
    expect(table.removePlayer(p(2), 'disconnected')).toBe(true);
    expect(table.getState().seats[1].playerId).toBeNull();
    expect(table.drainRemovals()).toEqual([{ playerId: p(2), chipStack: 1000, reason: 'disconnected' }]);
    expect(table.removePlayer(p(2), 'disconnected')).toBe(false);
  });
});

/**
 * A deck that deals `holes` to the dealt-in seats in `dealOrder` (from the
 * small blind, SRS-16.3), then burns before each street so the board is `board`.
 */
function stackDeck(dealOrder: number[], holes: Record<number, string>, board: string): string[] {
  const holeCards = Object.fromEntries(Object.entries(holes).map(([seatNumber, cards]) => [seatNumber, cards.split(' ')]));
  const boardCards = board.split(' ');
  const used = new Set([...Object.values(holeCards).flat(), ...boardCards]);
  const spare = createDeck().filter((card) => !used.has(card));
  const burn = () => spare.shift() as string;
  return [
    ...dealOrder.map((seatNumber) => holeCards[seatNumber][0]),
    ...dealOrder.map((seatNumber) => holeCards[seatNumber][1]),
    burn(),
    ...boardCards.slice(0, 3),
    burn(),
    boardCards[3],
    burn(),
    boardCards[4],
    ...spare,
  ];
}

describe('a player whose removal is put off stays in the running (SRS-9.14)', () => {
  // Button 1, SB 2, BB 3; seat 1 holds aces and wins any showdown.
  const deck = () => stackDeck([2, 3, 1], { 1: 'As Ad', 2: '7c 2d', 3: '8h 3s' }, 'Kc Qd 9s 5h 4c');

  it('can win the pot, and is removed with their winnings', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(pick(0), deck());
    table.removePlayer(p(1), 'timeouts');
    table.act(p(1), 'call');
    table.act(p(2), 'call');
    table.act(p(3), 'check');
    for (let street = 0; street < 3; street++) {
      table.act(p(2), 'check');
      table.act(p(3), 'check');
      table.act(p(1), 'check');
    }
    const result = table.getState().lastHandResult;
    expect(result?.reason).toBe('showdown');
    expect(result?.awards).toEqual([expect.objectContaining({ seatNumber: 1, amount: 30 })]);
    expect(table.drainRemovals()).toEqual([{ playerId: p(1), chipStack: 1020, reason: 'timeouts' }]);
  });

  it('is eligible for every pot they put chips into, side pots included', () => {
    // Seat 1 is short (100) and all-in; seats 2 and 3 build a side pot.
    const table = tableWith([1, 2, 3], { 1: 100 });
    table.startHand(pick(0), deck());
    table.removePlayer(p(1), 'disconnected');
    table.act(p(1), 'raise', 100); // all-in
    table.act(p(2), 'raise', 300);
    table.act(p(3), 'call');
    for (let street = 0; street < 3; street++) {
      table.act(p(2), 'check');
      table.act(p(3), 'check');
    }
    const result = table.getState().lastHandResult;
    // Seat 1 wins the main pot (3 x 100); the side pot goes to the better of seats 2 and 3 (eights).
    expect(result?.awards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ seatNumber: 1, amount: 300 }),
        expect.objectContaining({ seatNumber: 3, amount: 400 }),
      ])
    );
    expect(table.drainRemovals()).toEqual([{ playerId: p(1), chipStack: 300, reason: 'disconnected' }]);
  });

  it('loses that right only by folding', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(pick(0), deck());
    table.removePlayer(p(1), 'timeouts');
    table.act(p(1), 'fold');
    // Folded and pending: out of the hand, so removed straight away is not
    // what happens — they're removed when the hand ends, having won nothing.
    table.act(p(2), 'call');
    table.act(p(3), 'check');
    for (let street = 0; street < 3; street++) {
      table.act(p(2), 'check');
      table.act(p(3), 'check');
    }
    const result = table.getState().lastHandResult;
    expect(result?.awards.map((award) => award.seatNumber)).not.toContain(1);
    expect(table.drainRemovals()).toEqual([{ playerId: p(1), chipStack: 1000, reason: 'timeouts' }]);
  });
});

describe('removal after too many timeouts in a row (SRS-9.7)', () => {
  /**
   * Plays hands at seats 1-3, timing out seat 1 whenever it's their turn and
   * having everyone else call or check, until `hands` hands have been dealt.
   */
  function playHands(table: PokerTable, hands: number) {
    for (let hand = 0; hand < hands; hand++) {
      table.updateCountdown(0);
      if (!table.startHand(pick(0))) return;
      while (table.getState().phase === 'in-hand') {
        const state = table.getState();
        const active = state.activeSeat as number;
        if (active === 1) timeOut(table);
        else table.act(p(active), state.currentBet > state.seats[active - 1].bet ? 'call' : 'check');
      }
    }
  }

  it('keeps the player seated below the threshold', () => {
    const table = tableWith([1, 2, 3]);
    playHands(table, CONSECUTIVE_TIMEOUT_LIMIT - 1);
    expect(table.getState().seats[0]).toMatchObject({ playerId: p(1), timeouts: CONSECUTIVE_TIMEOUT_LIMIT - 1 });
    expect(table.drainRemovals()).toEqual([]);
  });

  it('removes the player when the counter reaches the threshold', () => {
    const table = tableWith([1, 2, 3]);
    playHands(table, CONSECUTIVE_TIMEOUT_LIMIT);
    expect(table.getState().seats[0].playerId).toBeNull();
    expect(table.drainRemovals()).toEqual([expect.objectContaining({ playerId: p(1), reason: 'timeouts' })]);
  });

  it('waits for the hand to end if the player is still in it (SRS-9.13)', () => {
    const table = tableWith([1, 2, 3]);
    // Hand 1: everyone acts for themselves.
    table.updateCountdown(0);
    table.startHand(pick(0));
    while (table.getState().phase === 'in-hand') {
      const state = table.getState();
      const active = state.activeSeat as number;
      table.act(p(active), state.currentBet > state.seats[active - 1].bet ? 'call' : 'check');
    }
    // Hands 2-4: seat 1 times out.
    playHands(table, CONSECUTIVE_TIMEOUT_LIMIT - 1);
    expect(table.getState().seats[0].timeouts).toBe(CONSECUTIVE_TIMEOUT_LIMIT - 1);
    // Hand 5: seat 1 is the big blind; the others call, and seat 1's time
    // runs out with nothing to call, so they're checked and still in the hand.
    table.updateCountdown(0);
    table.startHand(pick(0));
    expect(table.getState().bigBlindSeat).toBe(1);
    while (table.getState().activeSeat !== 1) table.act(p(table.getState().activeSeat as number), 'call');
    expect(timeOut(table)).toBeGreaterThan(0);
    expect(table.getState().seats[0]).toMatchObject({ playerId: p(1), inHand: true, removalPending: 'timeouts' });
    expect(table.drainRemovals()).toEqual([]);
    // The hand plays out; then they're removed.
    while (table.getState().phase === 'in-hand') {
      const state = table.getState();
      const active = state.activeSeat as number;
      if (active === 1) timeOut(table);
      else table.act(p(active), state.currentBet > state.seats[active - 1].bet ? 'call' : 'check');
    }
    expect(table.getState().seats[0].playerId).toBeNull();
    expect(table.drainRemovals()).toEqual([expect.objectContaining({ playerId: p(1), reason: 'timeouts' })]);
  });

  it('a voluntary action in between starts the count again (SRS-9.6)', () => {
    const table = tableWith([1, 2, 3]);
    playHands(table, CONSECUTIVE_TIMEOUT_LIMIT - 1);
    // One hand where seat 1 acts for themselves.
    table.updateCountdown(0);
    table.startHand(pick(0));
    while (table.getState().phase === 'in-hand') {
      const state = table.getState();
      const active = state.activeSeat as number;
      table.act(p(active), state.currentBet > state.seats[active - 1].bet ? 'call' : 'check');
    }
    playHands(table, CONSECUTIVE_TIMEOUT_LIMIT - 1);
    expect(table.getState().seats[0].playerId).toBe(p(1));
  });
});

describe('the near-removal warning (SRS-9.8)', () => {
  it('is given one timed-out hand before removal, saying how many are left', () => {
    expect(timedOutHandsBeforeRemoval({ timeouts: 0 })).toBeNull();
    expect(timedOutHandsBeforeRemoval({ timeouts: CONSECUTIVE_TIMEOUT_LIMIT - 2 })).toBeNull();
    expect(timedOutHandsBeforeRemoval({ timeouts: CONSECUTIVE_TIMEOUT_LIMIT - 1 })).toBe(1);
  });

  it('shows in the state as soon as the hand that brings it times out', () => {
    // The state is broadcast straight after the timeout, so the warning
    // reaches the player's page with it (SRS-NFR-020).
    const table = tableWith([1, 2, 3]);
    for (let hand = 0; hand < CONSECUTIVE_TIMEOUT_LIMIT - 1; hand++) {
      table.updateCountdown(0);
      table.startHand(pick(0));
      while (table.getState().phase === 'in-hand') {
        const state = table.getState();
        const active = state.activeSeat as number;
        if (active === 1) timeOut(table);
        else table.act(p(active), state.currentBet > state.seats[active - 1].bet ? 'call' : 'check');
      }
    }
    expect(timedOutHandsBeforeRemoval(table.getState().seats[0])).toBe(1);
    expect(timedOutHandsBeforeRemoval(table.getState().seats[1])).toBeNull();
  });
});
