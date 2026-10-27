import { describe, expect, it } from 'vitest';
import {
  canDouble,
  canSplit,
  checkBlackjackBet,
  chipsFor,
  createDeck,
  dealHand,
  handTotal,
  handView,
  isBlackjack,
  moveCost,
  nearestChipBet,
  playDealer,
  playMove,
  settleHand,
  totalStake,
  type BlackjackState,
  type PlayerHand,
} from '../../lib/blackjack';

// dealHand() deals player, dealer, player, dealer from the top of the deck,
// then draws from what's left. This builds a deck in that order with filler
// cards after it, so a hand's cards are known.
function stackDeck(player: [string, string], dealer: [string, string], draws: string[] = []): string[] {
  const top = [player[0], dealer[0], player[1], dealer[1], ...draws];
  return [...top, ...createDeck().filter((card) => !top.includes(card))];
}

const noShuffle = () => 0;

function hand(cards: string[], extra: Partial<PlayerHand> = {}): PlayerHand {
  return { cards, doubled: false, fromSplit: false, done: false, ...extra };
}

/** A round with one player hand in play. */
function state(playerCards: string[], dealerCards: string[], deck: string[] = []): BlackjackState {
  return { hands: [hand(playerCards)], active: 0, step: 0, dealerCards, deck };
}

describe('handTotal (SRS-905.1)', () => {
  it.each([
    [['Ts', '7h'], 17, false],
    [['Kd', 'Qc'], 20, false],
    [['As', '6h'], 17, true],
    [['As', '6h', 'Td'], 17, false],
    [['As', 'Ad'], 12, true],
    [['As', 'Ad', '9c'], 21, true],
    [['As', 'Ad', 'Ac', 'Ah', '7s'], 21, true],
    [['Ks', 'Qh', '5d'], 25, false],
  ])('%j totals %i (soft: %s)', (cards, total, soft) => {
    expect(handTotal(cards)).toEqual({ total, soft });
  });

  it('counts only a two-card 21 as blackjack', () => {
    expect(isBlackjack(['As', 'Kd'])).toBe(true);
    expect(isBlackjack(['7s', '7d', '7c'])).toBe(false);
  });
});

describe('checkBlackjackBet', () => {
  it('accepts whole coins at or above the minimum', () => {
    expect(checkBlackjackBet(10)).toEqual({ ok: true, amount: 10 });
    expect(checkBlackjackBet(235)).toEqual({ ok: true, amount: 235 });
  });

  it.each([0, -10, 5, 12.5, '50', null, undefined, Number.MAX_VALUE])('rejects %s', (bet) => {
    expect(checkBlackjackBet(bet).ok).toBe(false);
  });

  it.each([111, 37, 15, 12, 999])('rejects %s, which the chips cannot make, and suggests one they can', (bet) => {
    const check = checkBlackjackBet(bet);
    expect(check.ok).toBe(false);
    expect(!check.ok && check.error).toContain(nearestChipBet(bet).toLocaleString());
  });
});

describe('chipsFor', () => {
  it.each([
    [10, [10]],
    [20, [10, 10]],
    [25, [25]],
    [30, [10, 10, 10]],
    [35, [25, 10]],
    [110, [100, 10]],
    [115, [50, 25, 10, 10, 10, 10]],
    [235, [100, 100, 25, 10]],
  ])('makes %i from %j', (amount, chips) => {
    expect(chipsFor(amount)).toEqual(chips);
  });

  it('makes every multiple of 5 from 20 to 2,000, and 10, and the chips always add up', () => {
    for (let amount = 20; amount <= 2000; amount += 5) {
      expect(chipsFor(amount)?.reduce((sum, chip) => sum + chip, 0)).toBe(amount);
    }
    expect(chipsFor(10)).toEqual([10]);
  });

  it.each([0, 5, 15, 111, 37, 12.5])('cannot make %s', (amount) => {
    expect(chipsFor(amount)).toBeNull();
  });

  it('suggests the biggest amount the chips can make below an odd one', () => {
    expect(nearestChipBet(111)).toBe(110);
    expect(nearestChipBet(19)).toBe(10);
    expect(nearestChipBet(38)).toBe(35);
  });
});

describe('dealHand (SRS-902.1)', () => {
  it('deals two cards each, alternating, and keeps the rest of the deck', () => {
    const { state: dealt, outcome } = dealHand(50, noShuffle, stackDeck(['Ts', '7h'], ['Kd', '6c']));

    expect(dealt.hands).toEqual([hand(['Ts', '7h'])]);
    expect(dealt.dealerCards).toEqual(['Kd', '6c']);
    expect(dealt.deck).toHaveLength(48);
    expect(dealt.step).toBe(0);
    expect(outcome).toBeNull();
  });

  it('shuffles a full 52-card deck with the given random source', () => {
    const { state: dealt } = dealHand(50, (n) => n - 1);
    const all = [...dealt.hands[0]!.cards, ...dealt.dealerCards, ...dealt.deck];

    expect(new Set(all).size).toBe(52);
    expect(all.sort()).toEqual(createDeck().sort());
  });

  it('pays a player blackjack 3 to 2, rounded down, right away', () => {
    expect(dealHand(50, noShuffle, stackDeck(['As', 'Kh'], ['9d', '7c'])).outcome).toEqual({
      hands: [{ result: 'Win', net: 75 }],
      net: 75,
    });
    expect(dealHand(25, noShuffle, stackDeck(['As', 'Kh'], ['9d', '7c'])).outcome?.net).toBe(37);
  });

  it('ends the round when the dealer has blackjack', () => {
    expect(dealHand(50, noShuffle, stackDeck(['Ts', '9h'], ['Ad', 'Kc'])).outcome?.hands).toEqual([
      { result: 'Lose', net: -50 },
    ]);
  });

  it('pushes when both have blackjack', () => {
    expect(dealHand(50, noShuffle, stackDeck(['As', 'Kh'], ['Ad', 'Qc'])).outcome?.net).toBe(0);
  });
});

describe('Hit and Stand', () => {
  it('Hit deals one card and keeps the turn under 21 (SRS-903.1)', () => {
    const step = playMove(50, state(['Ts', '2h'], ['Kd', '6c'], ['5s', '9d']), 'hit');

    expect(step.state.hands[0]!.cards).toEqual(['Ts', '2h', '5s']);
    expect(step.state.dealerCards).toEqual(['Kd', '6c']);
    expect(step.state.deck).toEqual(['9d']);
    expect(step.state.step).toBe(1);
    expect(step.outcome).toBeNull();
  });

  it('Hit over 21 is a Bust, and the dealer does not draw', () => {
    const step = playMove(50, state(['Ts', '7h'], ['Kd', '6c'], ['8s', '5d']), 'hit');

    expect(step.outcome).toEqual({ hands: [{ result: 'Bust', net: -50 }], net: -50 });
    expect(step.state.dealerCards).toEqual(['Kd', '6c']);
  });

  it('Hit to exactly 21 stands automatically, and 21 in three cards pays 1 to 1', () => {
    const step = playMove(50, state(['Ts', '6h'], ['Kd', '6c'], ['5s', '9d']), 'hit');

    expect(step.state.dealerCards).toEqual(['Kd', '6c', '9d']);
    expect(step.outcome?.net).toBe(50);
  });

  it('Stand ends the turn without a card, then the dealer plays (SRS-904.1)', () => {
    const step = playMove(50, state(['Ts', '8h'], ['Kd', '6c'], ['3s', '9d']), 'stand');

    expect(step.state.hands[0]!.cards).toEqual(['Ts', '8h']);
    expect(step.state.dealerCards).toEqual(['Kd', '6c', '3s']);
    expect(step.outcome?.hands).toEqual([{ result: 'Lose', net: -50 }]);
  });
});

describe('Double (SRS-910)', () => {
  it('is only allowed on the first two cards (SRS-910.1)', () => {
    expect(canDouble(state(['5s', '6h'], []))).toBe(true);
    expect(canDouble(state(['2s', '3h', '6d'], []))).toBe(false);
    expect(() => playMove(50, state(['2s', '3h', '6d'], ['Kd', '6c'], ['5s']), 'double')).toThrow();
  });

  it('deals exactly one card, then the dealer plays, and pays on twice the bet (SRS-910.3, 910.4)', () => {
    const step = playMove(50, state(['5s', '6h'], ['Kd', '6c'], ['9d', '2c', '3s']), 'double');

    expect(step.state.hands[0]).toMatchObject({ cards: ['5s', '6h', '9d'], doubled: true });
    expect(step.state.dealerCards).toEqual(['Kd', '6c', '2c']);
    expect(step.outcome?.hands).toEqual([{ result: 'Win', net: 100 }]);
    expect(totalStake(50, step.state)).toBe(100);
  });

  it('stops after one card even on a low total', () => {
    const step = playMove(50, state(['2s', '3h'], ['Kd', '7c'], ['4d', '9c']), 'double');

    expect(step.state.hands[0]!.cards).toEqual(['2s', '3h', '4d']);
    expect(step.outcome?.hands).toEqual([{ result: 'Lose', net: -100 }]);
  });

  it('a doubled bust loses twice the bet and the dealer does not draw', () => {
    const step = playMove(50, state(['Ts', '6h'], ['Kd', '6c'], ['9d', '2c']), 'double');

    expect(step.outcome?.hands).toEqual([{ result: 'Bust', net: -100 }]);
    expect(step.state.dealerCards).toEqual(['Kd', '6c']);
  });

  it('a doubled 21 pays 1 to 1 on the doubled bet, not 3 to 2', () => {
    expect(playMove(50, state(['5s', '6h'], ['Kd', '7c'], ['Td']), 'double').outcome?.net).toBe(100);
  });
});

describe('Split (SRS-911)', () => {
  it('is only allowed once, on two cards of the same rank (SRS-911.1)', () => {
    expect(canSplit(state(['8s', '8h'], []))).toBe(true);
    expect(canSplit(state(['Ks', 'Kh'], []))).toBe(true);
    // Same value, different rank.
    expect(canSplit(state(['Ks', 'Qh'], []))).toBe(false);
    expect(canSplit(state(['8s', '8h', '2c'], []))).toBe(false);
    const alreadySplit: BlackjackState = {
      hands: [hand(['8s', '8d'], { fromSplit: true }), hand(['8h', '5c'], { fromSplit: true })],
      active: 0,
      step: 1,
      dealerCards: [],
      deck: [],
    };
    expect(canSplit(alreadySplit)).toBe(false);
    expect(() => playMove(50, state(['Ks', 'Qh'], ['9d', '7c'], ['2s', '3s']), 'split')).toThrow();
  });

  it('costs another bet, like Double', () => {
    expect(moveCost(50, 'split')).toBe(50);
    expect(moveCost(50, 'double')).toBe(50);
    expect(moveCost(50, 'hit')).toBe(0);
  });

  it('makes two hands, each dealt one more card, and plays the first one first (SRS-911.2, 911.3)', () => {
    const step = playMove(50, state(['8s', '8h'], ['9d', '7c'], ['3c', '2d', 'Td', '4s']), 'split');

    expect(step.outcome).toBeNull();
    expect(step.state.hands).toEqual([
      hand(['8s', '3c'], { fromSplit: true }),
      hand(['8h', '2d'], { fromSplit: true }),
    ]);
    expect(step.state.active).toBe(0);
    expect(totalStake(50, step.state)).toBe(100);
  });

  it('plays each hand in turn, then the dealer once, and settles each hand on its own bet (SRS-911.6)', () => {
    let step = playMove(50, state(['8s', '8h'], ['9d', '7c'], ['3c', '2d', 'Td', 'Kc', '4s']), 'split');
    // Hand 1: 8 3, hit to 21 (8 3 T), which finishes it.
    step = playMove(50, step.state, 'hit');
    expect(step.state.active).toBe(1);
    expect(step.outcome).toBeNull();
    // Hand 2: 8 2, double for one card (K) to 20.
    step = playMove(50, step.state, 'double');

    // The dealer had 16 and draws the 4 for 20.
    expect(step.state.dealerCards).toEqual(['9d', '7c', '4s']);
    expect(step.outcome).toEqual({
      hands: [
        { result: 'Win', net: 50 },
        { result: 'Push', net: 0 },
      ],
      net: 50,
    });
    expect(totalStake(50, step.state)).toBe(150);
  });

  it('Stand on the first hand moves on to the second', () => {
    let step = playMove(50, state(['8s', '8h'], ['9d', '7c'], ['Tc', '9d']), 'split');
    step = playMove(50, step.state, 'stand');

    expect(step.state.active).toBe(1);
    expect(step.state.step).toBe(2);
    expect(step.outcome).toBeNull();
  });

  it('split aces get one card each and the turn ends for both (SRS-911.4)', () => {
    const step = playMove(50, state(['As', 'Ah'], ['9d', '8c'], ['5c', '3d', '2s']), 'split');

    expect(step.state.hands.map((h) => h.cards)).toEqual([
      ['As', '5c'],
      ['Ah', '3d'],
    ]);
    expect(step.outcome).toEqual({
      hands: [
        { result: 'Lose', net: -50 },
        { result: 'Lose', net: -50 },
      ],
      net: -100,
    });
  });

  it('a two-card 21 after a split is not a blackjack and pays 1 to 1 (SRS-911.5)', () => {
    const step = playMove(50, state(['As', 'Ah'], ['9d', '8c'], ['Kc', '7d']), 'split');

    expect(step.outcome?.hands[0]).toEqual({ result: 'Win', net: 50 });
    expect(handView(1, 50, step.state, step.outcome).hands[0]!.blackjack).toBe(false);
  });

  it('when both hands bust, the dealer does not draw', () => {
    let step = playMove(50, state(['8s', '8h'], ['Td', '2c'], ['Kc', 'Qd', '9s', '9h', '5c']), 'split');
    step = playMove(50, step.state, 'hit');
    step = playMove(50, step.state, 'hit');

    expect(step.outcome?.net).toBe(-100);
    expect(step.state.dealerCards).toEqual(['Td', '2c']);
  });
});

describe('playDealer (SRS-906.1)', () => {
  it('draws on 16 or less', () => {
    expect(playDealer(state([], ['Ts', '6h'], ['2c', '5d', '9s'])).dealerCards).toEqual(['Ts', '6h', '2c']);
  });

  it('stands on a soft 17', () => {
    expect(playDealer(state([], ['As', '6h'], ['5d'])).dealerCards).toEqual(['As', '6h']);
  });

  it('keeps drawing when a soft hand turns hard', () => {
    expect(playDealer(state([], ['As', '5h'], ['Kd', '3c'])).dealerCards).toEqual(['As', '5h', 'Kd', '3c']);
  });
});

describe('settleHand (SRS-907.1)', () => {
  it.each([
    [['Ts', '9h'], ['Kd', '8c'], 'Win', 50],
    [['Ts', '7h'], ['Kd', '9c'], 'Lose', -50],
    [['Ts', '8h'], ['Kd', '8c'], 'Push', 0],
    [['Ts', '8h'], ['Kd', '6c', '9s'], 'Win', 50],
    [['Ts', '8h', '7c'], ['Kd', '6c', '9s'], 'Bust', -50],
  ] as const)('%j vs dealer %j is %s', (player, dealer, result, net) => {
    expect(settleHand(50, hand([...player]), [...dealer])).toEqual({ result, net });
  });
});

describe('handView', () => {
  it("hides the dealer's face-down card and the deck while the round is in play", () => {
    const view = handView(7, 50, state(['8s', '8h'], ['Kd', '6c'], ['2s']), null);

    expect(view).toEqual({
      handId: 7,
      bet: 50,
      totalBet: 50,
      hands: [{ cards: ['8s', '8h'], total: 16, bet: 50, doubled: false, blackjack: false, result: null, net: null }],
      active: 0,
      step: 0,
      dealerCards: ['Kd', null],
      dealerTotal: 10,
      canDouble: true,
      canSplit: true,
      finished: false,
      net: null,
    });
    expect(JSON.stringify(view)).not.toContain('6c');
    expect(JSON.stringify(view)).not.toContain('2s');
  });

  it('shows every dealer card and each hand result once the round is over', () => {
    const view = handView(7, 50, state(['Ts', '7h'], ['Kd', '6c', '5s']), {
      hands: [{ result: 'Lose', net: -50 }],
      net: -50,
    });

    expect(view.dealerCards).toEqual(['Kd', '6c', '5s']);
    expect(view.dealerTotal).toBe(21);
    expect(view.hands[0]).toMatchObject({ result: 'Lose', net: -50 });
    expect(view).toMatchObject({ active: null, finished: true, canDouble: false, canSplit: false, net: -50 });
  });
});
