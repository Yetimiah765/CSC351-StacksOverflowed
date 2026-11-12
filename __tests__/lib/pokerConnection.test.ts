import { describe, expect, it } from 'vitest';
import { DISCONNECT_REMOVAL_MS, HEARTBEAT_INTERVAL_MS, PokerTable, SILENCE_DISCONNECT_MS } from '../../lib/pokerTable';

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
  seatNumbers.forEach((seatNumber) => expect(table.heardFrom(p(seatNumber), now)).toBe('heard'));
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
    expect(table.heardFrom('someone-else', 0)).toBeNull();
  });
});

describe('disconnection detected when the connection ends (SRS-10.2)', () => {
  it('marks the player disconnected straight away', () => {
    const table = tableWith([1, 2, 3]);
    heardFromAll(table, [1, 2, 3], 0);
    expect(table.markDisconnected(p(2), 0)).toBe(true);
    expect(seat(table, 2)).toMatchObject({ playerId: p(2), disconnected: true });
    // Once is enough; and only for someone seated.
    expect(table.markDisconnected(p(2), 0)).toBe(false);
    expect(table.markDisconnected('someone-else', 0)).toBe(false);
  });

  it('stops watching them for silence once they are marked', () => {
    const table = tableWith([1, 2, 3]);
    heardFromAll(table, [1, 2, 3], 0);
    table.heardFrom(p(1), 5_000);
    table.heardFrom(p(3), 5_000);
    table.markDisconnected(p(2), 0);
    expect(table.nextSilenceDeadline()).toBe(5_000 + SILENCE_DISCONNECT_MS);
    expect(table.markSilentDisconnected(5_000 + SILENCE_DISCONNECT_MS - 1)).toEqual([]);
  });
});

describe('reconnection detected from a signed request (SRS-10.3)', () => {
  it('marks a disconnected player reconnected when they are next heard from', () => {
    const table = tableWith([1, 2, 3]);
    heardFromAll(table, [1, 2, 3], 0);
    table.markDisconnected(p(2), 0);
    expect(table.heardFrom(p(2), 40_000)).toBe('reconnected');
    expect(seat(table, 2).disconnected).toBe(false);
    // And watched for silence again from then.
    table.heardFrom(p(1), 40_000);
    table.heardFrom(p(3), 40_000);
    expect(table.nextSilenceDeadline()).toBe(40_000 + SILENCE_DISCONNECT_MS);
  });

  it('also after going silent', () => {
    const table = tableWith([1, 2, 3]);
    heardFromAll(table, [1, 2, 3], 0);
    expect(table.markSilentDisconnected(SILENCE_DISCONNECT_MS)).toEqual([p(1), p(2), p(3)]);
    expect(table.heardFrom(p(3), SILENCE_DISCONNECT_MS + 5)).toBe('reconnected');
    expect(seat(table, 3).disconnected).toBe(false);
    expect(seat(table, 1).disconnected).toBe(true);
  });

  it('says nothing new for a player who never left', () => {
    const table = tableWith([1, 2, 3]);
    expect(table.heardFrom(p(1), 0)).toBe('heard');
    expect(table.heardFrom(p(1), 1_000)).toBe('heard');
  });
});

describe('disconnected players are not dealt in (SRS-9.1)', () => {
  it('leaves a disconnected player out of the hand', () => {
    const table = tableWith([1, 2, 3, 4]);
    heardFromAll(table, [1, 2, 3, 4], 0);
    table.markDisconnected(p(4), 0);
    expect(table.startHand(() => 0)).toBe(true);
    const state = table.getState();
    expect(state.seats.slice(0, 4).map((s) => s.inHand)).toEqual([true, true, true, false]);
    // Not given the button or a blind either.
    expect([state.dealerSeat, state.smallBlindSeat, state.bigBlindSeat]).not.toContain(4);
  });

  it("doesn't start a hand that would be short because of it (SRS-20.1)", () => {
    const table = tableWith([1, 2, 3]);
    heardFromAll(table, [1, 2, 3], 0);
    table.markDisconnected(p(2), 0);
    expect(table.updateCountdown(0)).toBeNull();
    expect(table.getState().phase).toBe('waiting');
    expect(table.startHand(() => 0)).toBe(false);
  });

  it('a countdown already running stops if one of three disconnects', () => {
    const table = tableWith([1, 2, 3]);
    heardFromAll(table, [1, 2, 3], 0);
    expect(table.updateCountdown(0)).toBe('started');
    table.markDisconnected(p(3), 0);
    expect(table.updateCountdown(1_000)).toBe('cancelled');
  });

  it('a disconnected player keeps their cards in a hand already under way', () => {
    const table = tableWith([1, 2, 3]);
    heardFromAll(table, [1, 2, 3], 0);
    table.startHand(() => 0);
    table.markDisconnected(p(1), 0);
    expect(seat(table, 1).inHand).toBe(true);
  });
});

describe('the disconnection timer starts (SRS-9.2)', () => {
  it('starts when a player is marked disconnected', () => {
    const table = tableWith([1, 2, 3]);
    heardFromAll(table, [1, 2, 3], 0);
    expect(table.nextDisconnectDeadline()).toBeNull();
    expect(seat(table, 2).disconnectedMsRemaining).toBeNull();
    table.markDisconnected(p(2), 10_000);
    expect(table.nextDisconnectDeadline()).toBe(10_000 + DISCONNECT_REMOVAL_MS);
    expect(table.getState(10_000).seats[1].disconnectedMsRemaining).toBe(DISCONNECT_REMOVAL_MS);
    expect(table.getState(70_000).seats[1].disconnectedMsRemaining).toBe(DISCONNECT_REMOVAL_MS - 60_000);
  });

  it('starts from when silence marked them, too (SRS-10.1)', () => {
    const table = tableWith([1, 2, 3]);
    heardFromAll(table, [1, 2, 3], 0);
    table.heardFrom(p(1), 25_000);
    table.heardFrom(p(2), 25_000);
    table.markSilentDisconnected(SILENCE_DISCONNECT_MS);
    expect(table.nextDisconnectDeadline()).toBe(SILENCE_DISCONNECT_MS + DISCONNECT_REMOVAL_MS);
  });

  it('runs one timer per player; the next deadline is the earliest', () => {
    const table = tableWith([1, 2, 3]);
    heardFromAll(table, [1, 2, 3], 0);
    table.markDisconnected(p(3), 5_000);
    table.markDisconnected(p(1), 9_000);
    expect(table.nextDisconnectDeadline()).toBe(5_000 + DISCONNECT_REMOVAL_MS);
    // Marking someone again doesn't restart theirs.
    table.markDisconnected(p(3), 50_000);
    expect(table.nextDisconnectDeadline()).toBe(5_000 + DISCONNECT_REMOVAL_MS);
  });
});

describe('the disconnection timer resets on reconnection (SRS-9.3)', () => {
  it('goes back to zero when the player is back', () => {
    const table = tableWith([1, 2, 3]);
    heardFromAll(table, [1, 2, 3], 0);
    table.markDisconnected(p(2), 10_000);
    table.heardFrom(p(2), 100_000);
    expect(table.nextDisconnectDeadline()).toBeNull();
    expect(seat(table, 2).disconnectedMsRemaining).toBeNull();
  });

  it('starts from zero again the next time they disconnect', () => {
    const table = tableWith([1, 2, 3]);
    heardFromAll(table, [1, 2, 3], 0);
    table.markDisconnected(p(2), 10_000);
    table.heardFrom(p(2), 100_000);
    table.markDisconnected(p(2), 110_000);
    expect(table.nextDisconnectDeadline()).toBe(110_000 + DISCONNECT_REMOVAL_MS);
  });
});

describe('reconnecting to the held seat (SRS-2.1)', () => {
  it('gets the same seat and stack back', () => {
    const table = tableWith([1, 2, 3], { 2: 870 });
    heardFromAll(table, [1, 2, 3], 0);
    table.markDisconnected(p(2), 1_000);
    // Held meanwhile: nobody else can sit there.
    expect(table.checkSeat(2)).toBe('That seat is already taken.');
    expect(table.heardFrom(p(2), DISCONNECT_REMOVAL_MS)).toBe('reconnected');
    expect(seat(table, 2)).toMatchObject({ playerId: p(2), chipStack: 870, disconnected: false });
  });

  it('works mid-hand too: a player back in time plays on from where they were', () => {
    const table = tableWith([1, 2, 3]);
    heardFromAll(table, [1, 2, 3], 0);
    table.startHand(() => 0); // button 1, SB 2, BB 3; seat 1 first
    table.markDisconnected(p(1), 0);
    table.heardFrom(p(1), 5_000);
    expect(table.act(p(1), 'call')).toEqual({ ok: true });
  });

  it("isn't possible once they've been removed", () => {
    const table = tableWith([1, 2, 3]);
    heardFromAll(table, [1, 2, 3], 0);
    table.markDisconnected(p(2), 0);
    table.removeLongDisconnected(DISCONNECT_REMOVAL_MS);
    expect(table.heardFrom(p(2), DISCONNECT_REMOVAL_MS + 1)).toBeNull();
    expect(seat(table, 2).playerId).toBeNull();
  });
});

describe('checking for a disconnected player (SRS-2.2)', () => {
  /** A hand at seats 1-3 called round to the flop: seats 2, 3, 1 to act there. */
  function onTheFlop() {
    const table = tableWith([1, 2, 3]);
    heardFromAll(table, [1, 2, 3], 0);
    table.startHand(() => 0); // button 1, SB 2, BB 3
    table.act(p(1), 'call');
    table.act(p(2), 'call');
    table.act(p(3), 'check');
    expect(table.getState().street).toBe('flop');
    return table;
  }

  it('checks at once when the turn reaches them with nothing to call', () => {
    const table = onTheFlop();
    table.markDisconnected(p(3), 0);
    table.act(p(2), 'check');
    // Seat 3 is skipped over with a check; the turn goes straight to seat 1.
    const state = table.getState();
    expect(state.activeSeat).toBe(1);
    expect(state.seats[2]).toMatchObject({ inHand: true, lastAction: 'Check' });
  });

  it('starts no countdown for them (SRS-4.1)', () => {
    const table = onTheFlop();
    table.markDisconnected(p(3), 0);
    table.act(p(2), 'check');
    table.trackTurn(0);
    // The clock running is seat 1's, not seat 3's.
    expect(table.getState().activeSeat).toBe(1);
    expect(table.nextTurnDeadline()).not.toBeNull();
  });

  it("doesn't count it as one of their timeouts (SRS-9.5)", () => {
    const table = onTheFlop();
    table.markDisconnected(p(3), 0);
    table.act(p(2), 'check');
    expect(seat(table, 3).timeouts).toBe(0);
  });

  it('checks a hand through to the showdown when everyone left is disconnected', () => {
    const table = onTheFlop();
    table.markDisconnected(p(1), 0);
    table.markDisconnected(p(3), 0);
    table.act(p(2), 'check');
    // Seat 2 has to act for themselves each street; the others are checked for.
    table.act(p(2), 'check');
    table.act(p(2), 'check');
    expect(table.getState().lastHandResult?.reason).toBe('showdown');
  });
});

describe('folding for a disconnected player (SRS-2.3)', () => {
  it('folds at once when the turn reaches them facing a bet', () => {
    const table = tableWith([1, 2, 3]);
    heardFromAll(table, [1, 2, 3], 0);
    table.startHand(() => 0); // button 1, SB 2, BB 3; seat 1 first, facing the big blind
    table.markDisconnected(p(2), 0);
    table.act(p(1), 'raise', 40);
    // Seat 2 faces the raise: folded, and the turn goes to seat 3.
    const state = table.getState();
    expect(state.seats[1]).toMatchObject({ inHand: false, folded: true });
    expect(state.lastAction).toMatchObject({ seatNumber: 2, move: 'fold', automatic: true });
    expect(state.activeSeat).toBe(3);
  });

  it('can end the hand, if that leaves one player', () => {
    const table = tableWith([1, 2, 3]);
    heardFromAll(table, [1, 2, 3], 0);
    table.startHand(() => 0);
    table.markDisconnected(p(2), 0);
    table.markDisconnected(p(3), 0);
    table.act(p(1), 'raise', 40);
    const state = table.getState();
    expect(state.phase).not.toBe('in-hand');
    expect(state.lastHandResult?.awards).toEqual([expect.objectContaining({ seatNumber: 1 })]);
  });

  it("isn't counted as a timeout either (SRS-9.5)", () => {
    const table = tableWith([1, 2, 3]);
    heardFromAll(table, [1, 2, 3], 0);
    table.startHand(() => 0);
    table.markDisconnected(p(2), 0);
    table.act(p(1), 'raise', 40);
    expect(seat(table, 2).timeouts).toBe(0);
  });
});

describe('playing again after reconnecting (SRS-2.4)', () => {
  it('sits out the rest of a hand they missed the start of, then is dealt in', () => {
    const table = tableWith([1, 2, 3, 4]);
    heardFromAll(table, [1, 2, 3, 4], 0);
    table.markDisconnected(p(4), 0);
    table.startHand(() => 0); // seats 1-3 only
    table.heardFrom(p(4), 1_000); // back mid-hand
    expect(seat(table, 4).inHand).toBe(false);
    while (table.getState().phase === 'in-hand') {
      const { activeSeat } = table.getState();
      table.act(p(activeSeat as number), 'fold');
    }
    table.updateCountdown(2_000);
    table.startHand(() => 0);
    // Eligible again: dealt in, or (having been passed by a blind while
    // away) waiting to post or for the big blind like anyone else (SRS-11).
    const four = seat(table, 4);
    expect(four.inHand || four.missedBigBlind || four.missedSmallBlind).toBe(true);
  });

  it('can complete the players a hand needs (SRS-20.3)', () => {
    const table = tableWith([1, 2, 3]);
    heardFromAll(table, [1, 2, 3], 0);
    table.markDisconnected(p(3), 0);
    expect(table.updateCountdown(0)).toBeNull();
    table.heardFrom(p(3), 5_000);
    expect(table.updateCountdown(5_000)).toBe('started');
    expect(table.startHand(() => 0)).toBe(true);
    expect(seat(table, 3).inHand).toBe(true);
  });
});
