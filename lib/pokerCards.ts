// Cards for the poker table: a 52-card deck, a uniform shuffle, and Texas
// Hold'em hand ranking. Pure and dependency-free, so lib/pokerTable.ts can
// use it on the server and the table page can use it to name a player's own
// current hand.
//
// Traceability (docs/requirements/SRS):
//   SRS-5.1 Best five-card hand from seven cards
//   SRS-5.2 Hand category order
//   SRS-5.3 Tiebreaks within a category, then kickers
//   SRS-5.4 Ace high or low in straights, no wraparound
//   SRS-5.5 Suits never rank
//   SRS-16.1 Shuffle with every ordering equally likely (Fisher-Yates, given
//            a uniform randomIndex — the server passes crypto.randomInt)

/** Rank then suit, e.g. 'As' (ace of spades), 'Td' (ten of diamonds), '9h'. */
export type Card = string;

export const RANKS = '23456789TJQKA';
export const SUITS = 'shdc';

export function createDeck(): Card[] {
  return [...SUITS].flatMap((suit) => [...RANKS].map((rank) => `${rank}${suit}`));
}

/**
 * Fisher-Yates shuffle into a new array. `randomIndex(n)` must return a
 * uniformly random integer in [0, n) for every ordering to be equally likely.
 */
export function shuffleDeck(deck: Card[], randomIndex: (n: number) => number): Card[] {
  const shuffled = deck.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j] as Card, shuffled[i] as Card];
  }
  return shuffled;
}

/** 2-14, ace high. */
export function cardRank(card: Card): number {
  return RANKS.indexOf(card[0] as string) + 2;
}

export function cardSuit(card: Card): string {
  return card[1] as string;
}

/**
 * A hand's strength as [category, ...tiebreak ranks], compared element by
 * element (SRS-5.3). Categories, high to low (SRS-5.2): 8 straight flush,
 * 7 four of a kind, 6 full house, 5 flush, 4 straight, 3 three of a kind,
 * 2 two pair, 1 one pair, 0 high card.
 */
export type HandScore = number[];

export interface HandValue {
  score: HandScore;
  /** e.g. 'Full house, Kings over Fours'. */
  name: string;
  /** The five cards that make the hand. */
  cards: Card[];
}

/** Negative if a < b, positive if a > b, 0 for a tie (suits never break ties, SRS-5.5). */
export function compareScores(a: HandScore, b: HandScore): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** Scores exactly five cards. */
export function scoreFive(cards: Card[]): HandScore {
  const ranks = cards.map(cardRank).sort((a, b) => b - a);
  const isFlush = cards.every((card) => cardSuit(card) === cardSuit(cards[0] as Card));

  // SRS-5.4: A-2-3-4-5 is the lowest straight (five-high); no wraparounds.
  const distinct = [...new Set(ranks)];
  let straightHigh: number | null = null;
  if (distinct.length === 5) {
    if ((distinct[0] as number) - (distinct[4] as number) === 4) straightHigh = distinct[0] as number;
    else if (distinct.join() === '14,5,4,3,2') straightHigh = 5;
  }

  // Ranks grouped by how many of each, biggest group first, then highest rank.
  const counts = new Map<number, number>();
  ranks.forEach((rank) => counts.set(rank, (counts.get(rank) ?? 0) + 1));
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const groupRanks = groups.map(([rank]) => rank);
  const shape = groups.map(([, count]) => count).join('');

  if (straightHigh !== null && isFlush) return [8, straightHigh];
  if (shape === '41') return [7, ...groupRanks];
  if (shape === '32') return [6, ...groupRanks];
  if (isFlush) return [5, ...ranks];
  if (straightHigh !== null) return [4, straightHigh];
  if (shape === '311') return [3, ...groupRanks];
  if (shape === '221') return [2, ...groupRanks];
  if (shape === '2111') return [1, ...groupRanks];
  return [0, ...ranks];
}

const RANK_NAMES: Record<number, [string, string]> = {
  2: ['Two', 'Twos'],
  3: ['Three', 'Threes'],
  4: ['Four', 'Fours'],
  5: ['Five', 'Fives'],
  6: ['Six', 'Sixes'],
  7: ['Seven', 'Sevens'],
  8: ['Eight', 'Eights'],
  9: ['Nine', 'Nines'],
  10: ['Ten', 'Tens'],
  11: ['Jack', 'Jacks'],
  12: ['Queen', 'Queens'],
  13: ['King', 'Kings'],
  14: ['Ace', 'Aces'],
};

const one = (rank: number | undefined) => RANK_NAMES[rank as number]?.[0] ?? '';
const many = (rank: number | undefined) => RANK_NAMES[rank as number]?.[1] ?? '';

export function describeScore(score: HandScore): string {
  const [category, first, second] = score;
  switch (category) {
    case 8:
      return first === 14 ? 'Royal flush' : `Straight flush, ${one(first)}-high`;
    case 7:
      return `Four of a kind, ${many(first)}`;
    case 6:
      return `Full house, ${many(first)} over ${many(second)}`;
    case 5:
      return `Flush, ${one(first)}-high`;
    case 4:
      return `Straight, ${one(first)}-high`;
    case 3:
      return `Three of a kind, ${many(first)}`;
    case 2:
      return `Two pair, ${many(first)} and ${many(second)}`;
    case 1:
      return `Pair of ${many(first)}`;
    default:
      return `${one(first)} high`;
  }
}

/** SRS-5.1: the best five-card hand from five to seven cards. */
export function evaluateHand(cards: Card[]): HandValue {
  if (cards.length < 5) throw new Error('A poker hand needs at least five cards.');

  let best: { score: HandScore; cards: Card[] } | null = null;
  const pick = (start: number, chosen: Card[]) => {
    if (chosen.length === 5) {
      const score = scoreFive(chosen);
      if (!best || compareScores(score, best.score) > 0) best = { score, cards: chosen.slice() };
      return;
    }
    for (let i = start; i <= cards.length - (5 - chosen.length); i++) {
      chosen.push(cards[i] as Card);
      pick(i + 1, chosen);
      chosen.pop();
    }
  };
  pick(0, []);

  const { score, cards: bestCards } = best as unknown as { score: HandScore; cards: Card[] };
  return { score, name: describeScore(score), cards: bestCards };
}
