import { describe, expect, it } from 'vitest';
import { HAND_START_COUNTDOWN_MS, PokerTable, getBettingOptions } from '../../lib/pokerTable';

// Seats players by seat number at a 6-seat table with 5/10 blinds. `stacks`
// gives each seat's chips (default 1000).
function tableWith(seatNumbers: number[], stacks: Record<number, number> = {}): PokerTable {
  const table = new PokerTable('table-1', 6, 10, 5);
  seatNumbers.forEach((seatNumber) => {
    table.join(`player-${seatNumber}`, `P${seatNumber}`, stacks[seatNumber] ?? 1000, null, seatNumber);
  });
  return table;
}

// randomIndex stand-in that always picks the given index — pick(0) puts the
// first hand's button on the lowest occupied seat.
const pick = (index: number) => () => index;

const p = (seatNumber: number) => `player-${seatNumber}`;

function seat(table: PokerTable, seatNumber: number) {
  return table.getState().seats[seatNumber - 1];
}

/** Plays `moves` in order, failing the test on the first rejected one. */
function play(table: PokerTable, moves: [number, Parameters<PokerTable['act']>[1], number?][]) {
  for (const [seatNumber, move, amount] of moves) {
    const result = table.act(p(seatNumber), move, amount);
    expect(result, `seat ${seatNumber} ${move} ${amount ?? ''}`).toEqual({ ok: true });
  }
}

describe('PokerTable pre-hand countdown', () => {
  it('starts out waiting with no hand state', () => {
    const state = new PokerTable('table-1', 6, 10, 5).getState();

    expect(state.phase).toBe('waiting');
    expect(state.countdownMsRemaining).toBeNull();
    expect(state.handNumber).toBe(0);
    expect(state.dealerSeat).toBeNull();
    expect(state.pot).toBe(0);
    expect(state.street).toBeNull();
    expect(state.activeSeat).toBeNull();
  });

  it('does not start a countdown with fewer than three players (SRS-20.1)', () => {
    const table = tableWith([1, 2]);

    expect(table.updateCountdown(0)).toBeNull();
    expect(table.getState().phase).toBe('waiting');
  });

  it('starts a countdown once three players are seated', () => {
    const table = tableWith([1, 2, 3]);

    expect(table.updateCountdown(1_000)).toBe('started');
    const state = table.getState(1_000 + 2_000);
    expect(state.phase).toBe('countdown');
    expect(state.countdownMsRemaining).toBe(HAND_START_COUNTDOWN_MS - 2_000);
  });

  it('does not restart a countdown that is already running', () => {
    const table = tableWith([1, 2, 3]);
    table.updateCountdown(0);
    table.join('player-4', 'P4', 1000, null, 4);

    expect(table.updateCountdown(1_000)).toBeNull();
    expect(table.getState(1_000).countdownMsRemaining).toBe(HAND_START_COUNTDOWN_MS - 1_000);
  });

  it('cancels the countdown if a player leaves and fewer than three remain', () => {
    const table = tableWith([1, 2, 3]);
    table.updateCountdown(0);
    table.leave(p(2));

    expect(table.updateCountdown(1_000)).toBe('cancelled');
    expect(table.getState().phase).toBe('waiting');
    expect(table.getState().countdownMsRemaining).toBeNull();
  });
});

describe('PokerTable.startHand', () => {
  it('refuses to start with fewer than three players and posts nothing (SRS-20.7)', () => {
    const table = tableWith([1, 2]);

    expect(table.startHand(pick(0))).toBe(false);
    const state = table.getState();
    expect(state.phase).toBe('waiting');
    expect(state.dealerSeat).toBeNull();
    expect(state.seats[0].chipStack).toBe(1000);
  });

  it('gives the first button to a randomly picked seated player (SRS-13.1)', () => {
    const table = tableWith([2, 4, 6]);
    const sizes: number[] = [];

    table.startHand((n) => {
      sizes.push(n);
      return 1;
    });

    expect(sizes).toEqual([3]);
    expect(table.getState().dealerSeat).toBe(4);
  });

  it('puts the blinds on the next occupied seats clockwise of the button (SRS-14.1/14.2)', () => {
    const table = tableWith([2, 4, 6]);
    table.startHand(pick(1)); // button on seat 4

    const state = table.getState();
    expect(state.smallBlindSeat).toBe(6);
    expect(state.bigBlindSeat).toBe(2); // wraps around past seat 6
  });

  it('posts the blinds in front of the blind seats, not into the pot (SRS-14.3/14.4/14.7)', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(pick(0)); // button 1, SB 2, BB 3

    const state = table.getState();
    expect(state.phase).toBe('in-hand');
    expect(state.street).toBe('preflop');
    expect(state.handNumber).toBe(1);
    expect(state.seats[1]).toMatchObject({ chipStack: 995, bet: 5, inHand: true, hasActed: false });
    expect(state.seats[2]).toMatchObject({ chipStack: 990, bet: 10, inHand: true, hasActed: false });
    expect(state.pot).toBe(0);
    expect(state.currentBet).toBe(10);
    expect(state.minRaise).toBe(10);
  });

  it('gives the first turn to the player after the big blind (SRS-18.1)', () => {
    const threeHanded = tableWith([1, 2, 3]);
    threeHanded.startHand(pick(0));
    expect(threeHanded.getState().activeSeat).toBe(1); // button acts first three-handed

    const fourHanded = tableWith([1, 2, 3, 4]);
    fourHanded.startHand(pick(0));
    expect(fourHanded.getState().activeSeat).toBe(4);
  });

  it('posts a short stack whole and marks it all-in (SRS-14.5/14.6)', () => {
    const table = tableWith([1, 2, 3], { 3: 7 });
    table.startHand(pick(0)); // BB is seat 3

    expect(seat(table, 3)).toMatchObject({ chipStack: 0, bet: 7, allIn: true });
    expect(table.getState().currentBet).toBe(10);
  });

  it('does not deal in a player who sits down mid-hand (SRS-20.6)', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(pick(0));
    table.join(p(4), 'P4', 1000, null, 4);

    expect(seat(table, 4).inHand).toBe(false);
  });
});

describe('getBettingOptions', () => {
  const table = { currentBet: 40, minRaise: 30, bigBlind: 10 };

  it('offers check and bet (from the big blind) when no bet is faced (SRS-15.1/15.3)', () => {
    expect(getBettingOptions({ bet: 0, chipStack: 500, canRaise: true }, { ...table, currentBet: 0, minRaise: 10 })).toEqual({
      canCheck: true,
      canCall: false,
      callAmount: 0,
      aggressive: 'bet',
      minTo: 10,
      maxTo: 500,
    });
  });

  it('offers call and raise to at least currentBet + minRaise when facing a bet (SRS-15.2/15.4/15.5)', () => {
    expect(getBettingOptions({ bet: 10, chipStack: 500, canRaise: true }, table)).toEqual({
      canCheck: false,
      canCall: true,
      callAmount: 30,
      aggressive: 'raise',
      minTo: 70,
      maxTo: 510,
    });
  });

  it('only allows an all-in raise when the stack is short of a full raise', () => {
    const options = getBettingOptions({ bet: 0, chipStack: 55, canRaise: true }, table);

    expect(options.aggressive).toBe('raise');
    expect(options.minTo).toBe(55);
    expect(options.maxTo).toBe(55);
  });

  it('caps a call at the stack and offers no raise when the stack cannot cover the bet (SRS-15.7)', () => {
    const options = getBettingOptions({ bet: 0, chipStack: 25, canRaise: true }, table);

    expect(options.callAmount).toBe(25);
    expect(options.aggressive).toBeNull();
  });

  it('offers no raise to a player whose raising was closed (SRS-15.8)', () => {
    expect(getBettingOptions({ bet: 10, chipStack: 500, canRaise: false }, table).aggressive).toBeNull();
  });
});

describe('PokerTable betting actions', () => {
  it('rejects an action from anyone but the active player, changing nothing (SRS-3.1)', () => {
    const table = tableWith([1, 2, 3, 4]);
    table.startHand(pick(0)); // seat 4 to act
    const before = table.getState();

    expect(table.act(p(1), 'call')).toEqual({ ok: false, error: "It's not your turn." });
    expect(table.getState()).toEqual(before);
  });

  it('rejects a check when facing a bet and leaves the turn in place', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(pick(0));

    expect(table.act(p(1), 'check')).toEqual({ ok: false, error: "You can't check — it's 10 to call." });
    expect(table.getState().activeSeat).toBe(1);
  });

  it('moves call chips in front of the caller and passes the turn clockwise', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(pick(0));

    play(table, [[1, 'call']]);

    expect(seat(table, 1)).toMatchObject({ chipStack: 990, bet: 10, lastAction: 'Call' });
    expect(table.getState().activeSeat).toBe(2);
    expect(table.getState().lastAction).toMatchObject({ seatNumber: 1, move: 'call', amount: 10 });
  });

  it('gives the big blind the option when everyone just calls (SRS-18.4)', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(pick(0));

    play(table, [
      [1, 'call'],
      [2, 'call'],
    ]);

    expect(table.getState().activeSeat).toBe(3);
    expect(table.getState().street).toBe('preflop');
  });

  it('rejects a raise below the minimum with the allowed range (SRS-15.4/15.9/15.10)', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(pick(0));

    expect(table.act(p(1), 'raise', 15)).toEqual({ ok: false, error: 'Raise must be to between 20 and 1000.' });
    expect(table.act(p(1), 'raise', 1001)).toEqual({ ok: false, error: 'Raise must be to between 20 and 1000.' });
    expect(seat(table, 1).chipStack).toBe(1000);
  });

  it('sets the next minimum raise to the size of the last full raise (SRS-15.5)', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(pick(0));

    play(table, [[1, 'raise', 35]]); // a 25 raise over 10

    expect(table.getState().minRaise).toBe(25);
    expect(table.act(p(2), 'raise', 59)).toEqual({ ok: false, error: 'Raise must be to between 60 and 1000.' });
    play(table, [[2, 'raise', 60]]);
  });

  it('rejects bet vs raise used the wrong way round', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(pick(0));

    expect(table.act(p(1), 'bet', 20)).toEqual({ ok: false, error: 'There is already a bet — raise instead.' });
  });

  it('requires an opening bet of at least the big blind (SRS-15.3)', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(pick(0));
    play(table, [
      [1, 'call'],
      [2, 'call'],
      [3, 'check'],
    ]); // flop; seat 2 first

    expect(table.act(p(2), 'raise', 20)).toEqual({ ok: false, error: 'There is no bet to raise — bet instead.' });
    expect(table.act(p(2), 'bet', 5)).toEqual({ ok: false, error: 'Bet must be to between 10 and 990.' });
    play(table, [[2, 'bet', 10]]);
  });

  it('only allows call or fold after an incomplete all-in raise to players who already acted (SRS-15.8)', () => {
    // Button 1, SB 2 (50 chips), BB 3, seat 4 first to act.
    const table = tableWith([1, 2, 3, 4], { 2: 50 });
    table.startHand(pick(0));

    play(table, [
      [4, 'raise', 40], // full raise: minRaise 30
      [1, 'call'],
      [2, 'raise', 50], // all-in for only 10 more: incomplete
    ]);

    // The big blind hadn't acted yet, so may still raise.
    expect(seat(table, 3).canRaise).toBe(true);
    play(table, [[3, 'call']]);

    // Seat 4 had already acted since the last full raise.
    expect(seat(table, 4).canRaise).toBe(false);
    expect(table.act(p(4), 'raise', 100)).toEqual({
      ok: false,
      error: "You can't raise right now — you can only call or fold.",
    });
    play(table, [[4, 'call']]);
  });
});

describe('PokerTable betting rounds', () => {
  it('collects bets into the pot and starts the flop once a round is complete (SRS-18.3/18.7/18.8)', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(pick(0));

    play(table, [
      [1, 'raise', 30],
      [2, 'call'],
      [3, 'call'],
    ]);

    const state = table.getState();
    expect(state.street).toBe('flop');
    expect(state.pot).toBe(90);
    expect(state.seats.map((s) => s.bet)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(state.currentBet).toBe(0);
    expect(state.minRaise).toBe(10);
    // SRS-18.2: postflop action starts after the button.
    expect(state.activeSeat).toBe(2);
    expect(state.seats[0].lastAction).toBeNull();
  });

  it('plays through all four rounds and splits the pot at showdown (SRS-18.9, stand-in for SRS-5)', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(pick(0));

    play(table, [
      [1, 'call'],
      [2, 'call'],
      [3, 'check'],
    ]);
    for (const street of ['flop', 'turn', 'river']) {
      expect(table.getState().street).toBe(street);
      play(table, [
        [2, 'check'],
        [3, 'check'],
        [1, 'check'],
      ]);
    }

    const state = table.getState();
    expect(state.phase).toBe('waiting');
    expect(state.street).toBeNull();
    expect(state.seats.slice(0, 3).map((s) => s.chipStack)).toEqual([1000, 1000, 1000]);
    expect(state.lastHandResult).toEqual({
      handNumber: 1,
      reason: 'showdown',
      awards: [
        { seatNumber: 2, username: 'P2', amount: 10 },
        { seatNumber: 3, username: 'P3', amount: 10 },
        { seatNumber: 1, username: 'P1', amount: 10 },
      ],
    });
  });

  it('gives odd chips one at a time clockwise from the button (SRS-5.8)', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(pick(0)); // button 1

    play(table, [
      [1, 'call'],
      [2, 'fold'], // 5 dead chips: pot is 25 between seats 1 and 3
      [3, 'check'],
    ]);
    for (let round = 0; round < 3; round++) {
      play(table, [
        [3, 'check'],
        [1, 'check'],
      ]);
    }

    // Seat 3 is first clockwise of the button, so it gets the odd chip.
    expect(seat(table, 3).chipStack).toBe(1003);
    expect(seat(table, 1).chipStack).toBe(1002);
    expect(seat(table, 2).chipStack).toBe(995);
  });

  it('ends the hand as soon as everyone else folds, returning the uncalled bet (SRS-17.7/18.6/19.5)', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(pick(0));

    play(table, [
      [1, 'raise', 100],
      [2, 'fold'],
      [3, 'fold'],
    ]);

    const state = table.getState();
    expect(state.phase).toBe('waiting');
    // 90 of the raise was never called and comes back; the 25 pot (seat 1's
    // own 10 plus the 15 in blinds) is won: 1000 - 10 + 25.
    expect(state.seats[0].chipStack).toBe(1015);
    expect(state.lastHandResult).toEqual({
      handNumber: 1,
      reason: 'fold',
      awards: [{ seatNumber: 1, username: 'P1', amount: 25 }],
    });
  });

  it('skips all-in players when passing the turn (SRS-18.5)', () => {
    const table = tableWith([1, 2, 3, 4], { 1: 50 });
    table.startHand(pick(0)); // seat 4 first, then 1, 2, 3

    play(table, [
      [4, 'call'],
      [1, 'raise', 50], // all-in
      [2, 'call'],
      [3, 'call'],
      [4, 'call'],
    ]);
    // Flop: seat 1 is all-in, so seat 2 starts and seat 1 never gets the turn.
    play(table, [
      [2, 'check'],
      [3, 'check'],
      [4, 'check'],
    ]);
    expect(table.getState().street).toBe('turn');
  });

  it('builds side pots for all-in players and skips to showdown when fewer than two can act (SRS-17.8/19)', () => {
    // Button 1 (100 chips), SB 2 (300 chips), BB 3 (1000 chips).
    const table = tableWith([1, 2, 3], { 1: 100, 2: 300 });
    table.startHand(pick(0));

    play(table, [
      [1, 'raise', 100], // all-in
      [2, 'raise', 300], // all-in
      [3, 'call'],
    ]);

    // Only seat 3 can still act, so no flop/turn/river betting: straight to
    // showdown. Main pot 300 (all three), side pot 400 (seats 2 and 3).
    const state = table.getState();
    expect(state.phase).toBe('waiting');
    expect(state.lastHandResult?.reason).toBe('showdown');
    expect(state.lastHandResult?.awards).toEqual(
      expect.arrayContaining([
        { seatNumber: 1, username: 'P1', amount: 100 },
        { seatNumber: 2, username: 'P2', amount: 300 },
        { seatNumber: 3, username: 'P3', amount: 300 },
      ])
    );
    expect(state.seats.slice(0, 3).map((s) => s.chipStack)).toEqual([100, 300, 1000]);
  });

  it('shows the main pot and side pot while the hand continues (SRS-19.1-19.4)', () => {
    const table = tableWith([1, 2, 3], { 1: 100 });
    table.startHand(pick(0));

    play(table, [
      [1, 'raise', 100], // all-in
      [2, 'call'],
      [3, 'call'],
      // Flop: seats 2 and 3 keep betting.
      [2, 'bet', 50],
      [3, 'call'],
    ]);

    expect(table.getState().street).toBe('turn');
    expect(table.getState().pots).toEqual([
      { amount: 300, eligibleSeats: [1, 2, 3] },
      { amount: 100, eligibleSeats: [2, 3] },
    ]);
    expect(table.getState().pot).toBe(400);
  });

  it('moves the button to the next seat with chips for the next hand (SRS-13.2)', () => {
    const table = tableWith([1, 3, 5]);
    table.startHand(pick(0)); // button 1, SB 3, BB 5

    play(table, [
      [1, 'fold'],
      [3, 'fold'],
    ]);
    table.startHand(pick(0));

    const state = table.getState();
    expect(state.handNumber).toBe(2);
    expect(state.dealerSeat).toBe(3);
    expect(state.smallBlindSeat).toBe(5);
    expect(state.bigBlindSeat).toBe(1);
  });
});

describe('PokerTable leaving during a hand', () => {
  it('folds a player who asked to leave when action reaches them, and removes them after the hand (SRS-21.2/21.3)', () => {
    const table = tableWith([1, 2, 3, 4]);
    table.startHand(pick(0)); // seat 4 to act, then 1, 2 (SB), 3 (BB)

    expect(table.leave(p(2))).toEqual({ ok: true, pending: true, seatNumber: 2 });
    expect(seat(table, 2)).toMatchObject({ playerId: p(2), inHand: true, leaveRequested: true });

    play(table, [
      [4, 'call'],
      [1, 'call'],
    ]);
    // Seat 2 was folded automatically; the turn went straight to the big blind.
    expect(seat(table, 2)).toMatchObject({ inHand: false, folded: true, lastAction: 'Fold' });
    expect(table.getState().activeSeat).toBe(3);
    expect(table.drainRemovals()).toEqual([]);

    play(table, [
      [3, 'fold'],
      // Flop between seats 4 and 1: seat 4 bets, seat 1 folds.
      [4, 'bet', 10],
      [1, 'fold'],
    ]);

    expect(table.getState().phase).toBe('waiting');
    expect(seat(table, 2).playerId).toBeNull();
    expect(table.drainRemovals()).toEqual([{ playerId: p(2), chipStack: 995 }]);
    expect(table.drainRemovals()).toEqual([]);
  });

  it('folds right away when the leaving player already has the turn', () => {
    const table = tableWith([1, 2, 3, 4]);
    table.startHand(pick(0)); // seat 4 to act

    expect(table.leave(p(4))).toEqual({ ok: true, pending: true, seatNumber: 4 });
    expect(seat(table, 4).folded).toBe(true);
    expect(table.getState().activeSeat).toBe(1);
  });

  it('removes a player who already folded right away, leaving their chips in the pot', () => {
    const table = tableWith([1, 2, 3, 4]);
    table.startHand(pick(0));
    play(table, [
      [4, 'call'],
      [1, 'call'],
      [2, 'fold'], // the small blind's 5 stays in
    ]);

    expect(table.leave(p(2))).toEqual({ ok: true, seatNumber: 2, chipStack: 995 });
    play(table, [[3, 'check']]);

    expect(table.getState().street).toBe('flop');
    expect(table.getState().pot).toBe(35);
  });

  it('removes a player who was not dealt in right away', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(pick(0));
    table.join(p(4), 'P4', 500, null, 4);

    expect(table.leave(p(4))).toEqual({ ok: true, seatNumber: 4, chipStack: 500 });
    expect(table.getState().phase).toBe('in-hand');
  });
});
