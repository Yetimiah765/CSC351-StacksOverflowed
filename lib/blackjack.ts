// Blackjack rules, shared by the blackjack page (app/blackjack/page.tsx) and
// its API routes (app/api/blackjack/). Pure and DB-free: the routes keep each
// round in the server's memory (app/api/blackjack/hands.ts) and pass it
// through these functions. Blackjack has its own deck and shuffle below
// rather than sharing the poker table's.
//
// A round is one Deal: the dealer's cards plus one player hand, or two after
// a split. Each player hand is played in turn, then the dealer plays once and
// every hand is settled against the dealer.
//
// Traceability (docs/requirements/SRS):
//   SRS-901.1 / 901.2  Bet from the available balance, never above it
//   SRS-902.1          Two cards each, one dealer card face down
//   SRS-903.1          Hit deals one card
//   SRS-904.1          Stand ends the player's turn
//   SRS-905.1          Aces count 11 unless that would bust, then 1
//   SRS-906.1          Dealer draws on 16 or less, stops on 17 or more
//   SRS-907.1          Result is Win, Lose, Bust, or Push
//   SRS-910.1 - 910.4  Double: first two cards only, twice the bet, one card
//   SRS-911.1 - 911.6  Split: a pair, once, into two hands with a bet each
//   SRS-NFR-5          The server shuffles with crypto.randomInt

/** Rank then suit, e.g. 'As' (ace of spades), 'Td' (ten of diamonds), '9h'. */
export type Card = string;

const RANKS = '23456789TJQKA';
const SUITS = 'shdc';

/** A standard 52-card deck, unshuffled. */
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

// The chip values the bet panel offers, in coins.
export const BLACKJACK_CHIPS = [10, 25, 50, 100] as const;

// Smallest bet a hand can be dealt with: the smallest chip.
export const MIN_BLACKJACK_BET = BLACKJACK_CHIPS[0];

export type BetCheck = { ok: true; amount: number } | { ok: false; error: string };

// Rejects anything that isn't a whole number of coins at or above the minimum.
export function checkBlackjackBet(input: unknown): BetCheck {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input <= 0) {
    return { ok: false, error: 'Bet a whole number of coins greater than 0.' };
  }
  if (input < MIN_BLACKJACK_BET) return { ok: false, error: `The minimum bet is ${MIN_BLACKJACK_BET} coins.` };
  return { ok: true, amount: input };
}

export type BlackjackResult = 'Win' | 'Lose' | 'Bust' | 'Push';
export type BlackjackMove = 'hit' | 'stand' | 'double' | 'split';

export function isBlackjackMove(value: unknown): value is BlackjackMove {
  return value === 'hit' || value === 'stand' || value === 'double' || value === 'split';
}

/** One of the player's hands: the dealt one, or one of two after a split. */
export interface PlayerHand {
  cards: Card[];
  /** This hand's bet is twice the original (SRS-910.2). */
  doubled: boolean;
  /** Made by a split, so a two-card 21 here isn't a blackjack (SRS-911.5). */
  fromSplit: boolean;
  /** No more moves for this hand: stood, doubled, 21, bust, or split aces. */
  done: boolean;
}

/** A round in play. */
export interface BlackjackState {
  hands: PlayerHand[];
  /** The hand being played. */
  active: number;
  /** How many moves the player has made, so a stale click can be refused. */
  step: number;
  /** The second card is the face-down one until the round ends. */
  dealerCards: Card[];
  /** Cards still to be drawn, next card first. Never sent to the browser. */
  deck: Card[];
}

/** How one finished hand came out. `net` is its balance change (SRS-909.1). */
export interface HandOutcome {
  result: BlackjackResult;
  /** Winnings (positive), the lost bet (negative), or 0 for a push. */
  net: number;
}

/** How a finished round came out. */
export interface BlackjackOutcome {
  /** One per player hand, in order. */
  hands: HandOutcome[];
  /** The round's total balance change. */
  net: number;
}

/** A card's blackjack value: aces 11 (handTotal() lowers them), faces 10. */
export function cardPoints(card: Card): number {
  const rank = card[0] as string;
  if (rank === 'A') return 11;
  if ('TJQK'.includes(rank)) return 10;
  return Number(rank);
}

/**
 * SRS-905.1: each ace counts 11 unless that would take the hand over 21.
 * `soft` means an ace is still being counted as 11.
 */
export function handTotal(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let acesAsEleven = 0;
  for (const card of cards) {
    total += cardPoints(card);
    if (card[0] === 'A') acesAsEleven++;
  }
  while (total > 21 && acesAsEleven > 0) {
    total -= 10;
    acesAsEleven--;
  }
  return { total, soft: acesAsEleven > 0 };
}

/** 21 with the first two cards. */
export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handTotal(cards).total === 21;
}

/** A blackjack that pays 3 to 2: never on a hand made by a split (SRS-911.5). */
function isNatural(hand: PlayerHand): boolean {
  return !hand.fromSplit && isBlackjack(hand.cards);
}

/** One hand's bet: the original, or twice it once doubled. */
export function handStake(bet: number, hand: PlayerHand): number {
  return hand.doubled ? bet * 2 : bet;
}

/** Everything the player has bet on the round, across its hands. */
export function totalStake(bet: number, state: Pick<BlackjackState, 'hands'>): number {
  return state.hands.reduce((sum, hand) => sum + handStake(bet, hand), 0);
}

/** The extra coins a move takes from the balance: another bet for Double and Split. */
export function moveCost(bet: number, move: BlackjackMove): number {
  return move === 'double' || move === 'split' ? bet : 0;
}

function drawTo(cards: Card[], deck: Card[]): { cards: Card[]; deck: Card[] } {
  const [next, ...rest] = deck;
  if (!next) throw new Error('The deck ran out of cards.');
  return { cards: [...cards, next], deck: rest };
}

/**
 * SRS-907.1: compares one finished hand with the dealer's. A blackjack wins
 * 3 to 2, rounded down to whole coins (a 25-coin blackjack wins 37); any
 * other win pays 1 to 1 on the hand's own bet.
 */
export function settleHand(bet: number, hand: PlayerHand, dealerCards: Card[]): HandOutcome {
  const stake = handStake(bet, hand);
  const player = handTotal(hand.cards).total;
  const dealer = handTotal(dealerCards).total;
  const playerBlackjack = isNatural(hand);
  const dealerBlackjack = isBlackjack(dealerCards);

  if (player > 21) return { result: 'Bust', net: -stake };
  if (playerBlackjack && dealerBlackjack) return { result: 'Push', net: 0 };
  if (playerBlackjack) return { result: 'Win', net: Math.floor((stake * 3) / 2) };
  if (dealerBlackjack) return { result: 'Lose', net: -stake };
  if (dealer > 21 || player > dealer) return { result: 'Win', net: stake };
  if (player < dealer) return { result: 'Lose', net: -stake };
  return { result: 'Push', net: 0 };
}

function settleRound(bet: number, state: BlackjackState): BlackjackOutcome {
  const hands = state.hands.map((hand) => settleHand(bet, hand, state.dealerCards));
  return { hands, net: hands.reduce((sum, hand) => sum + hand.net, 0) };
}

/** SRS-906.1: the dealer draws on 16 or less and stops on any 17 or more. */
export function playDealer(state: BlackjackState): BlackjackState {
  let { dealerCards, deck } = state;
  while (handTotal(dealerCards).total <= 16) {
    ({ cards: dealerCards, deck } = drawTo(dealerCards, deck));
  }
  return { ...state, dealerCards, deck };
}

export interface BlackjackStep {
  state: BlackjackState;
  /** Set once the round is over; null while it's still the player's turn. */
  outcome: BlackjackOutcome | null;
}

/**
 * Moves on to the next hand that still needs a move. Once every hand is
 * done the dealer plays (SRS-906.1, SRS-911.6) — unless every hand busted,
 * since then nothing the dealer draws can matter — and the round is settled.
 */
function advance(bet: number, state: BlackjackState): BlackjackStep {
  const next = state.hands.findIndex((hand, index) => index >= state.active && !hand.done);
  if (next !== -1) return { state: { ...state, active: next }, outcome: null };

  const allBust = state.hands.every((hand) => handTotal(hand.cards).total > 21);
  const finished = allBust ? state : playDealer(state);
  return { state: finished, outcome: settleRound(bet, finished) };
}

/**
 * SRS-902.1: shuffles a fresh 52-card deck and deals player, dealer, player,
 * dealer. `randomIndex(n)` must be uniform in [0, n) — the routes pass
 * crypto.randomInt (SRS-NFR-5). `presetDeck` replaces the shuffle in tests.
 *
 * If either side has blackjack the round ends right away: the dealer checks
 * their face-down card, as at a real table.
 */
export function dealHand(bet: number, randomIndex: (n: number) => number, presetDeck?: Card[]): BlackjackStep {
  let deck = presetDeck ? presetDeck.slice() : shuffleDeck(createDeck(), randomIndex);
  let playerCards: Card[] = [];
  let dealerCards: Card[] = [];
  ({ cards: playerCards, deck } = drawTo(playerCards, deck));
  ({ cards: dealerCards, deck } = drawTo(dealerCards, deck));
  ({ cards: playerCards, deck } = drawTo(playerCards, deck));
  ({ cards: dealerCards, deck } = drawTo(dealerCards, deck));

  const natural = isBlackjack(playerCards) || isBlackjack(dealerCards);
  const state: BlackjackState = {
    hands: [{ cards: playerCards, doubled: false, fromSplit: false, done: natural }],
    active: 0,
    step: 0,
    dealerCards,
    deck,
  };
  return { state, outcome: natural ? settleRound(bet, state) : null };
}

function activeHand(state: Pick<BlackjackState, 'hands' | 'active'>): PlayerHand | undefined {
  const hand = state.hands[state.active];
  return hand && !hand.done ? hand : undefined;
}

/** SRS-910.1: Double is only allowed on a hand's first two cards. */
export function canDouble(state: Pick<BlackjackState, 'hands' | 'active'>): boolean {
  return activeHand(state)?.cards.length === 2;
}

/** SRS-911.1: Split is allowed once, on a first two cards of the same rank. */
export function canSplit(state: Pick<BlackjackState, 'hands' | 'active'>): boolean {
  const hand = activeHand(state);
  return state.hands.length === 1 && hand?.cards.length === 2 && hand.cards[0]![0] === hand.cards[1]![0];
}

/**
 * Applies the player's move to the hand being played. `bet` is the round's
 * original bet; Double and Split each cost another one, which the caller
 * checks for (canDouble(), canSplit()) and takes first (moveCost()).
 *   * Hit (SRS-903.1) deals one card. Going over 21 is a Bust; reaching
 *     exactly 21 stands automatically, since no card can improve it.
 *   * Stand (SRS-904.1) ends that hand's turn.
 *   * Double (SRS-910) deals exactly one card to the hand, doubles its bet,
 *     and ends its turn.
 *   * Split (SRS-911) makes two hands from the pair and deals each one more
 *     card; they're then played in order. Split aces take just that one card
 *     each (SRS-911.4).
 * After the last hand is done the dealer plays and the round is settled.
 */
export function playMove(bet: number, state: BlackjackState, move: BlackjackMove): BlackjackStep {
  const hand = activeHand(state);
  if (!hand) throw new Error('There is no hand to play.');
  if (move === 'double' && !canDouble(state)) throw new Error('Double is only allowed on the first two cards.');
  if (move === 'split' && !canSplit(state)) throw new Error('Split is only allowed once, on a pair.');

  let deck = state.deck;
  let hands = state.hands.slice();

  if (move === 'split') {
    const [first, second] = hand.cards as [Card, Card];
    const aces = first[0] === 'A';
    const made: PlayerHand[] = [];
    for (const card of [first, second]) {
      let cards: Card[];
      ({ cards, deck } = drawTo([card], deck));
      made.push({ cards, doubled: false, fromSplit: true, done: aces || handTotal(cards).total === 21 });
    }
    hands = made;
  } else if (move === 'stand') {
    hands[state.active] = { ...hand, done: true };
  } else {
    let cards: Card[];
    ({ cards, deck } = drawTo(hand.cards, deck));
    const doubled = move === 'double';
    hands[state.active] = { ...hand, cards, doubled, done: doubled || handTotal(cards).total >= 21 };
  }

  return advance(bet, { ...state, hands, deck, step: state.step + 1 });
}

/** What the browser is allowed to see of one player hand. */
export interface PlayerHandView {
  cards: Card[];
  total: number;
  /** This hand's bet: twice the original once doubled. */
  bet: number;
  doubled: boolean;
  /** A blackjack that pays 3 to 2. */
  blackjack: boolean;
  /** null until the round is over. */
  result: BlackjackResult | null;
  net: number | null;
}

/** What the browser is allowed to see of a round. */
export interface BlackjackHandView {
  handId: number;
  /** The original bet; Double and Split each cost this again. */
  bet: number;
  /** Everything bet on the round so far. */
  totalBet: number;
  hands: PlayerHandView[];
  /** The hand being played; null once the round is over. */
  active: number | null;
  /** Sent back with each move so a stale click can be refused. */
  step: number;
  /** null stands for the face-down card while the round is in play. */
  dealerCards: (Card | null)[];
  /** The total of the dealer's face-up cards only. */
  dealerTotal: number;
  /** The rules allow these moves now (the balance is checked separately). */
  canDouble: boolean;
  canSplit: boolean;
  finished: boolean;
  /** The round's total balance change; null while in play. */
  net: number | null;
}

export function handView(
  handId: number,
  bet: number,
  state: Omit<BlackjackState, 'deck'>,
  outcome: BlackjackOutcome | null
): BlackjackHandView {
  const visibleDealer = outcome ? state.dealerCards : state.dealerCards.slice(0, 1);
  return {
    handId,
    bet,
    totalBet: totalStake(bet, state),
    hands: state.hands.map((hand, index) => ({
      cards: hand.cards,
      total: handTotal(hand.cards).total,
      bet: handStake(bet, hand),
      doubled: hand.doubled,
      blackjack: isNatural(hand),
      result: outcome?.hands[index]?.result ?? null,
      net: outcome?.hands[index]?.net ?? null,
    })),
    active: outcome ? null : state.active,
    step: state.step,
    dealerCards: outcome ? state.dealerCards : [...visibleDealer, null],
    dealerTotal: handTotal(visibleDealer).total,
    canDouble: !outcome && canDouble(state),
    canSplit: !outcome && canSplit(state),
    finished: outcome !== null,
    net: outcome?.net ?? null,
  };
}
