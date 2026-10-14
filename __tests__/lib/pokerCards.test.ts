import { describe, expect, it } from 'vitest';
import { compareScores, createDeck, evaluateHand, scoreFive, shuffleDeck } from '../../lib/pokerCards';

const hand = (cards: string) => cards.split(' ');
const best = (cards: string) => evaluateHand(hand(cards));

describe('createDeck / shuffleDeck', () => {
  it('builds 52 distinct cards', () => {
    const deck = createDeck();

    expect(deck).toHaveLength(52);
    expect(new Set(deck).size).toBe(52);
  });

  it('shuffles into a permutation of the deck without changing the original', () => {
    const deck = createDeck();
    let seed = 7;
    const shuffled = shuffleDeck(deck, (n) => (seed = (seed * 31 + 11) % 997) % n);

    expect(shuffled).not.toEqual(deck);
    expect([...shuffled].sort()).toEqual([...deck].sort());
    expect(deck).toEqual(createDeck());
  });

  it('asks randomIndex for each position from the top down (Fisher-Yates)', () => {
    const sizes: number[] = [];
    shuffleDeck(createDeck(), (n) => {
      sizes.push(n);
      return 0;
    });

    expect(sizes).toEqual(Array.from({ length: 51 }, (_, i) => 52 - i));
  });
});

describe('hand categories (SRS-5.2)', () => {
  it.each([
    ['Royal flush', 'As Ks Qs Js Ts'],
    ['Straight flush, Nine-high', '9h 8h 7h 6h 5h'],
    ['Four of a kind, Sevens', '7s 7h 7d 7c Kd'],
    ['Full house, Queens over Fours', 'Qs Qh Qd 4c 4d'],
    ['Flush, Ace-high', 'Ad Jd 8d 4d 2d'],
    ['Straight, Ten-high', 'Ts 9h 8d 7c 6s'],
    ['Three of a kind, Twos', '2s 2h 2d Kc 9s'],
    ['Two pair, Jacks and Fives', 'Js Jh 5d 5c As'],
    ['Pair of Aces', 'As Ah 9d 6c 3s'],
    ['King high', 'Ks Jh 9d 6c 3s'],
  ])('names %s', (name, cards) => {
    expect(best(cards).name).toBe(name);
  });

  it('ranks each category above the next', () => {
    const ladder = [
      'As Ks Qs Js Ts',
      '7s 7h 7d 7c Kd',
      'Qs Qh Qd 4c 4d',
      'Ad Jd 8d 4d 2d',
      'Ts 9h 8d 7c 6s',
      '2s 2h 2d Kc 9s',
      'Js Jh 5d 5c As',
      'As Ah 9d 6c 3s',
      'Ks Jh 9d 6c 3s',
    ].map((cards) => scoreFive(hand(cards)));

    for (let i = 0; i < ladder.length - 1; i++) {
      expect(compareScores(ladder[i] as number[], ladder[i + 1] as number[])).toBeGreaterThan(0);
    }
  });
});

describe('ties and kickers (SRS-5.3)', () => {
  it('compares a full house by its trips before its pair', () => {
    expect(compareScores(scoreFive(hand('5s 5h 5d 2c 2d')), scoreFive(hand('4s 4h 4d Ac Ad')))).toBeGreaterThan(0);
  });

  it('breaks a pair tie on kickers from highest down', () => {
    expect(compareScores(scoreFive(hand('Ks Kh 9d 6c 3s')), scoreFive(hand('Kd Kc 9s 6h 2s')))).toBeGreaterThan(0);
  });

  it('breaks two pair on the second pair, then the kicker', () => {
    expect(compareScores(scoreFive(hand('Js Jh 6d 6c 2s')), scoreFive(hand('Jd Jc 5s 5h As')))).toBeGreaterThan(0);
    expect(compareScores(scoreFive(hand('Js Jh 6d 6c 3s')), scoreFive(hand('Jd Jc 6s 6h 2s')))).toBeGreaterThan(0);
  });

  it('treats identical ranks in different suits as a tie (SRS-5.5)', () => {
    expect(compareScores(scoreFive(hand('Ad Jd 8d 4d 2d')), scoreFive(hand('As Js 8s 4s 2s')))).toBe(0);
    expect(compareScores(scoreFive(hand('Ks Qh 9d 6c 3s')), scoreFive(hand('Kh Qd 9c 6s 3h')))).toBe(0);
  });
});

describe('straights and the ace (SRS-5.4)', () => {
  it('plays the ace low in A-2-3-4-5, the lowest straight', () => {
    expect(best('As 2h 3d 4c 5s').name).toBe('Straight, Five-high');
    expect(compareScores(scoreFive(hand('2s 3h 4d 5c 6s')), scoreFive(hand('As 2h 3d 4c 5s')))).toBeGreaterThan(0);
  });

  it('plays the ace high in 10-J-Q-K-A', () => {
    expect(best('Ts Jh Qd Kc As').name).toBe('Straight, Ace-high');
  });

  it('does not recognize wraparound straights', () => {
    expect(best('Qs Kh Ad 2c 3s').name).toBe('Ace high');
  });

  it('recognizes a five-high straight flush', () => {
    expect(best('Ah 2h 3h 4h 5h').name).toBe('Straight flush, Five-high');
  });
});

describe('best five of seven (SRS-5.1)', () => {
  it('finds the best five-card hand', () => {
    const value = best('Kh Kd Ks 2c 2d 9s 4h');

    expect(value.name).toBe('Full house, Kings over Twos');
    expect(value.cards.sort()).toEqual(['2c', '2d', 'Kd', 'Kh', 'Ks']);
  });

  it('prefers a flush hiding among seven cards over a straight', () => {
    expect(best('9h 8h 7c 6h 5d 2h Kh').name).toBe('Flush, King-high');
  });

  it('uses the best kickers from the board', () => {
    expect(compareScores(best('As Ad 7c 6h 2d Kc Qd').score, best('Ah Ac 7d 6s 2c Kd Jd').score)).toBeGreaterThan(0);
  });

  it('rejects fewer than five cards', () => {
    expect(() => evaluateHand(hand('As Ad 7c 6h'))).toThrow();
  });
});
