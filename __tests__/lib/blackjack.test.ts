import { describe, expect, it } from 'vitest';
import {
  canDouble,
  checkBlackjackBet,
  createDeck,
  dealHand,
  handTotal,
  handView,
  isBlackjack,
  playDealer,
  playMove,
  settleHand,
  type BlackjackState,
} from '../../lib/blackjack';

// dealHand() deals player, dealer, player, dealer from the top of the deck,
// then draws from what's left. This builds a deck in that order with filler
// cards after it, so a hand's cards are known.
function stackDeck(player: [string, string], dealer: [string, string], draws: string[] = []): string[] {
  const top = [player[0], dealer[0], player[1], dealer[1], ...draws];
  return [...top, ...createDeck().filter((card) => !top.includes(card))];
}

const noShuffle = () => 0;

function state(playerCards: string[], dealerCards: string[], deck: string[] = []): BlackjackState {
  return { playerCards, dealerCards, deck };
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
});

describe('dealHand (SRS-902.1)', () => {
  it('deals two cards each, alternating, and keeps the rest of the deck', () => {
    const { state: dealt, outcome } = dealHand(50, noShuffle, stackDeck(['Ts', '7h'], ['Kd', '6c']));

    expect(dealt.playerCards).toEqual(['Ts', '7h']);
    expect(dealt.dealerCards).toEqual(['Kd', '6c']);
    expect(dealt.deck).toHaveLength(48);
    expect(outcome).toBeNull();
  });

  it('shuffles a full 52-card deck with the given random source', () => {
    const { state: dealt } = dealHand(50, (n) => n - 1);
    const all = [...dealt.playerCards, ...dealt.dealerCards, ...dealt.deck];

    expect(new Set(all).size).toBe(52);
    expect(all.sort()).toEqual(createDeck().sort());
  });

  it('pays a player blackjack 3 to 2, rounded down, right away', () => {
    expect(dealHand(50, noShuffle, stackDeck(['As', 'Kh'], ['9d', '7c'])).outcome).toEqual({ result: 'Win', net: 75 });
    expect(dealHand(25, noShuffle, stackDeck(['As', 'Kh'], ['9d', '7c'])).outcome).toEqual({ result: 'Win', net: 37 });
  });

  it('ends the hand when the dealer has blackjack', () => {
    expect(dealHand(50, noShuffle, stackDeck(['Ts', '9h'], ['Ad', 'Kc'])).outcome).toEqual({ result: 'Lose', net: -50 });
  });

  it('pushes when both have blackjack', () => {
    expect(dealHand(50, noShuffle, stackDeck(['As', 'Kh'], ['Ad', 'Qc'])).outcome).toEqual({ result: 'Push', net: 0 });
  });
});

describe('playMove', () => {
  it('Hit deals one card and keeps the turn under 21 (SRS-903.1)', () => {
    const step = playMove(50, state(['Ts', '2h'], ['Kd', '6c'], ['5s', '9d']), 'hit');

    expect(step.state.playerCards).toEqual(['Ts', '2h', '5s']);
    expect(step.state.dealerCards).toEqual(['Kd', '6c']);
    expect(step.state.deck).toEqual(['9d']);
    expect(step.outcome).toBeNull();
  });

  it('Hit over 21 is a Bust, and the dealer does not draw', () => {
    const step = playMove(50, state(['Ts', '7h'], ['Kd', '6c'], ['8s', '5d']), 'hit');

    expect(step.outcome).toEqual({ result: 'Bust', net: -50 });
    expect(step.state.dealerCards).toEqual(['Kd', '6c']);
  });

  it('Hit to exactly 21 stands automatically, and 21 in three cards pays 1 to 1', () => {
    const step = playMove(50, state(['Ts', '6h'], ['Kd', '6c'], ['5s', '9d']), 'hit');

    expect(step.state.dealerCards).toEqual(['Kd', '6c', '9d']);
    expect(step.outcome).toEqual({ result: 'Win', net: 50 });
  });

  it('Stand ends the turn without a card, then the dealer plays (SRS-904.1)', () => {
    const step = playMove(50, state(['Ts', '8h'], ['Kd', '6c'], ['3s', '9d']), 'stand');

    expect(step.state.playerCards).toEqual(['Ts', '8h']);
    expect(step.state.dealerCards).toEqual(['Kd', '6c', '3s']);
    expect(step.outcome).toEqual({ result: 'Lose', net: -50 });
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

    // One card to 20, even though another card could still be taken.
    expect(step.state.playerCards).toEqual(['5s', '6h', '9d']);
    expect(step.state.dealerCards).toEqual(['Kd', '6c', '2c']);
    expect(step.outcome).toEqual({ result: 'Win', net: 100 });
  });

  it('stops after one card even on a low total', () => {
    const step = playMove(50, state(['2s', '3h'], ['Kd', '7c'], ['4d', '9c']), 'double');

    expect(step.state.playerCards).toEqual(['2s', '3h', '4d']);
    expect(step.outcome).toEqual({ result: 'Lose', net: -100 });
  });

  it('a doubled bust loses twice the bet and the dealer does not draw', () => {
    const step = playMove(50, state(['Ts', '6h'], ['Kd', '6c'], ['9d', '2c']), 'double');

    expect(step.outcome).toEqual({ result: 'Bust', net: -100 });
    expect(step.state.dealerCards).toEqual(['Kd', '6c']);
  });

  it('a doubled 21 pays 1 to 1 on the doubled bet, not 3 to 2', () => {
    const step = playMove(50, state(['5s', '6h'], ['Kd', '7c'], ['Td']), 'double');

    expect(step.outcome).toEqual({ result: 'Win', net: 100 });
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
    expect(settleHand(50, state([...player], [...dealer]))).toEqual({ result, net });
  });
});

describe('handView', () => {
  it("hides the dealer's face-down card and the deck while the hand is in play", () => {
    const view = handView(7, 50, state(['Ts', '7h'], ['Kd', '6c'], ['2s']), null);

    expect(view).toEqual({
      handId: 7,
      bet: 50,
      playerCards: ['Ts', '7h'],
      playerTotal: 17,
      dealerCards: ['Kd', null],
      dealerTotal: 10,
      playerBlackjack: false,
      result: null,
      net: null,
    });
    expect(JSON.stringify(view)).not.toContain('6c');
    expect(JSON.stringify(view)).not.toContain('2s');
  });

  it('shows every dealer card once the hand is over', () => {
    const view = handView(7, 50, state(['Ts', '7h'], ['Kd', '6c', '5s']), { result: 'Lose', net: -50 });

    expect(view.dealerCards).toEqual(['Kd', '6c', '5s']);
    expect(view.dealerTotal).toBe(21);
    expect(view.result).toBe('Lose');
  });
});
