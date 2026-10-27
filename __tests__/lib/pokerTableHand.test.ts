import { describe, expect, it } from 'vitest';
import { HAND_START_COUNTDOWN_MS, NEXT_HAND_DELAY_MS, PokerTable, getBettingOptions } from '../../lib/pokerTable';
import { createDeck } from '../../lib/pokerCards';

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

/**
 * A deck order that deals `holes` (seat -> its two cards) to `dealOrder` (the
 * dealt-in seats from the small blind clockwise, SRS-16.3), then burns one
 * card before each of the flop, turn, and river (SRS-17.1-17.6) so the board
 * comes out as `board`.
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

  it('waits longer after a showdown, so everyone can see the result', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(pick(0));
    play(table, [
      [1, 'call'],
      [2, 'call'],
      [3, 'check'],
    ]);
    for (let street = 0; street < 3; street++) {
      play(table, [
        [2, 'check'],
        [3, 'check'],
        [1, 'check'],
      ]);
    }
    expect(table.getState().lastHandResult?.reason).toBe('showdown');

    expect(table.updateCountdown(0)).toBe('started');
    expect(table.getState(0).countdownMsRemaining).toBe(NEXT_HAND_DELAY_MS.showdown);
    expect(NEXT_HAND_DELAY_MS.showdown).toBe(10_000);
  });

  it('waits a little less after everyone else folds, and the usual time once players gather again', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(pick(0));
    play(table, [
      [1, 'fold'],
      [2, 'fold'],
    ]);

    table.leave(p(1));
    expect(table.updateCountdown(0)).toBeNull(); // two players: no countdown, and the longer delay is spent
    table.join(p(4), 'P4', 1000, null, 4);
    expect(table.updateCountdown(0)).toBe('started');
    expect(table.getState(0).countdownMsRemaining).toBe(HAND_START_COUNTDOWN_MS);

    const other = tableWith([1, 2, 3]);
    other.startHand(pick(0));
    play(other, [
      [1, 'fold'],
      [2, 'fold'],
    ]);
    other.updateCountdown(0);
    expect(other.getState(0).countdownMsRemaining).toBe(NEXT_HAND_DELAY_MS.fold);
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
      return n === 3 ? 1 : 0;
    });

    // The first call picks among the three seated players; the rest shuffle.
    expect(sizes[0]).toBe(3);
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

  it('deals two hole cards each, one at a time from the small blind clockwise (SRS-16.2/16.3)', () => {
    const table = tableWith([1, 3, 5]);
    // Button 1, so the small blind is seat 3: the deal goes 3, 5, 1, 3, 5, 1.
    table.startHand(pick(0), ['2c', '3c', '4c', '5c', '6c', '7c', ...createDeck().slice(20)]);

    expect(table.getHoleCards()).toEqual([
      { playerId: p(1), cards: ['4c', '7c'] },
      { playerId: p(3), cards: ['2c', '5c'] },
      { playerId: p(5), cards: ['3c', '6c'] },
    ]);
  });

  it('shuffles a full deck with no card dealt twice (SRS-16.1/16.4)', () => {
    const table = tableWith([1, 2, 3, 4, 5, 6]);
    table.startHand((n) => Math.floor(Math.random() * n));

    const dealt = table.getHoleCards().flatMap(({ cards }) => cards);
    expect(dealt).toHaveLength(12);
    expect(new Set(dealt).size).toBe(12);
  });

  it('keeps hole cards out of the public state (SRS-6.1)', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(pick(0), stackDeck([2, 3, 1], { 1: 'Ah Kh', 2: 'Qd Jd', 3: '9s 9c' }, '2c 7s Td 4h 3c'));

    const state = JSON.stringify(table.getState());
    for (const card of ['Ah', 'Kh', 'Qd', 'Jd', '9s', '9c']) expect(state).not.toContain(`"${card}"`);
    expect(table.getState().seats[0]).not.toHaveProperty('holeCards');
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

  it('deals the flop, turn, and river after burning a card before each (SRS-17.1-17.6)', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(pick(0), stackDeck([2, 3, 1], { 1: '6c 7d', 2: '2c 3d', 3: '4c 5d' }, 'As Kd Qh Jc Ts'));

    expect(table.getState().board).toEqual([]);
    play(table, [
      [1, 'call'],
      [2, 'call'],
      [3, 'check'],
    ]);
    const boards: string[][] = [];
    for (const street of ['flop', 'turn', 'river']) {
      expect(table.getState().street).toBe(street);
      boards.push(table.getState().board);
      play(table, [
        [2, 'check'],
        [3, 'check'],
        [1, 'check'],
      ]);
    }

    expect(boards).toEqual([
      ['As', 'Kd', 'Qh'],
      ['As', 'Kd', 'Qh', 'Jc'],
      ['As', 'Kd', 'Qh', 'Jc', 'Ts'],
    ]);
  });

  it('awards the pot to the best hand at showdown and reveals the hands (SRS-5.6/6.2)', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(pick(0), stackDeck([2, 3, 1], { 1: 'Ah Ad', 2: 'Kh Qc', 3: '8s 8c' }, 'As 7c 2d 9h Kd'));

    play(table, [
      [1, 'call'],
      [2, 'call'],
      [3, 'check'],
    ]);
    for (let round = 0; round < 3; round++) {
      play(table, [
        [2, 'check'],
        [3, 'check'],
        [1, 'check'],
      ]);
    }

    const state = table.getState();
    expect(state.phase).toBe('waiting');
    expect(state.board).toEqual([]);
    expect(state.seats.slice(0, 3).map((s) => s.chipStack)).toEqual([1020, 990, 990]);
    expect(state.lastHandResult).toEqual({
      handNumber: 1,
      reason: 'showdown',
      board: ['As', '7c', '2d', '9h', 'Kd'],
      ranOut: false,
      // SRS-6.5: no bet on the river, so the first player clockwise of the button shows first.
      shown: [
        { seatNumber: 2, playerId: p(2), username: 'P2', cards: ['Kh', 'Qc'], handName: 'Pair of Kings' },
        { seatNumber: 3, playerId: p(3), username: 'P3', cards: ['8s', '8c'], handName: 'Pair of Eights' },
        { seatNumber: 1, playerId: p(1), username: 'P1', cards: ['Ah', 'Ad'], handName: 'Three of a kind, Aces' },
      ],
      awards: [{ seatNumber: 1, username: 'P1', amount: 30, handName: 'Three of a kind, Aces' }],
    });
  });

  it('shows the last river bettor first (SRS-6.5)', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(pick(0), stackDeck([2, 3, 1], { 1: 'Ah Ad', 2: 'Kh Qc', 3: '8s 8c' }, 'As 7c 2d 9h Kd'));

    play(table, [
      [1, 'call'],
      [2, 'call'],
      [3, 'check'],
    ]);
    for (let round = 0; round < 2; round++) {
      play(table, [
        [2, 'check'],
        [3, 'check'],
        [1, 'check'],
      ]);
    }
    play(table, [
      [2, 'check'],
      [3, 'bet', 20],
      [1, 'call'],
      [2, 'call'],
    ]);

    expect(table.getState().lastHandResult?.shown.map((hand) => hand.seatNumber)).toEqual([3, 1, 2]);
  });

  it('splits a tied pot (SRS-5.7)', () => {
    const table = tableWith([1, 2, 3]);
    // The board is a straight nobody can beat, so all three tie.
    table.startHand(pick(0), stackDeck([2, 3, 1], { 1: '6c 7d', 2: '2c 3d', 3: '4c 5d' }, 'As Kd Qh Jc Ts'));

    play(table, [
      [1, 'call'],
      [2, 'call'],
      [3, 'check'],
    ]);
    for (let round = 0; round < 3; round++) {
      play(table, [
        [2, 'check'],
        [3, 'check'],
        [1, 'check'],
      ]);
    }

    expect(table.getState().seats.slice(0, 3).map((s) => s.chipStack)).toEqual([1000, 1000, 1000]);
    expect(table.getState().lastHandResult?.awards).toEqual([
      { seatNumber: 2, username: 'P2', amount: 10, handName: 'Straight, Ace-high' },
      { seatNumber: 3, username: 'P3', amount: 10, handName: 'Straight, Ace-high' },
      { seatNumber: 1, username: 'P1', amount: 10, handName: 'Straight, Ace-high' },
    ]);
  });

  it('gives odd chips one at a time clockwise from the button (SRS-5.8)', () => {
    const table = tableWith([1, 2, 3]);
    // Button 1; a board straight means seats 1 and 3 tie.
    table.startHand(pick(0), stackDeck([2, 3, 1], { 1: '6c 7d', 2: '2c 3d', 3: '4c 5d' }, 'As Kd Qh Jc Ts'));

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
    // Nobody is shown when everyone else folds.
    expect(state.lastHandResult).toEqual({
      handNumber: 1,
      reason: 'fold',
      board: [],
      ranOut: false,
      shown: [],
      awards: [{ seatNumber: 1, username: 'P1', amount: 25, handName: null }],
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

  it('runs out the board when fewer than two can act, and awards the main and side pots separately (SRS-17.8/19)', () => {
    // Button 1 (100 chips), SB 2 (300 chips), BB 3 (1000 chips).
    const table = tableWith([1, 2, 3], { 1: 100, 2: 300 });
    table.startHand(pick(0), stackDeck([2, 3, 1], { 1: 'Ah Ad', 2: 'Kh Kd', 3: 'Qh Qd' }, '2c 7s 9d 4h Jc'));

    play(table, [
      [1, 'raise', 100], // all-in
      [2, 'raise', 300], // all-in
      [3, 'call'],
    ]);

    // Only seat 3 can still act, so the board is run out with no more
    // betting. Main pot 300 (all three): seat 1's aces. Side pot 400 (seats 2
    // and 3 only): seat 2's kings beat seat 3's queens.
    const state = table.getState();
    expect(state.phase).toBe('waiting');
    expect(state.lastHandResult).toMatchObject({
      reason: 'showdown',
      ranOut: true,
      board: ['2c', '7s', '9d', '4h', 'Jc'],
    });
    // The last raiser (seat 2) shows first (SRS-6.5).
    expect(state.lastHandResult?.shown.map((hand) => hand.seatNumber)).toEqual([2, 3, 1]);
    expect(state.lastHandResult?.awards).toEqual(
      expect.arrayContaining([
        { seatNumber: 1, username: 'P1', amount: 300, handName: 'Pair of Aces' },
        { seatNumber: 2, username: 'P2', amount: 400, handName: 'Pair of Kings' },
      ])
    );
    expect(state.seats.slice(0, 3).map((s) => s.chipStack)).toEqual([300, 400, 700]);
  });

  it('never reveals a folded hand (SRS-6.3)', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(pick(0), stackDeck([2, 3, 1], { 1: 'Ah Ad', 2: 'Kh Qc', 3: '8s 8c' }, 'As 7c 2d 9h Kd'));

    play(table, [
      [1, 'call'],
      [2, 'fold'],
      [3, 'check'],
    ]);
    for (let round = 0; round < 3; round++) {
      play(table, [
        [3, 'check'],
        [1, 'check'],
      ]);
    }

    expect(table.getState().lastHandResult?.shown.map((hand) => hand.seatNumber)).toEqual([3, 1]);
    expect(JSON.stringify(table.getState())).not.toContain('"Qc"');
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
