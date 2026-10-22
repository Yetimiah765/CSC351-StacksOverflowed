// Blackjack rules, shared by the blackjack page (app/blackjack/page.tsx) and
// its API routes (app/api/blackjack/). Pure and DB-free: the routes keep each
// hand in the server's memory (app/api/blackjack/hands.ts) and pass it
// through these functions. Blackjack has its own deck and shuffle below
// rather than sharing the poker table's.
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
export type BlackjackMove = 'hit' | 'stand' | 'double';

export function isBlackjackMove(value: unknown): value is BlackjackMove {
  return value === 'hit' || value === 'stand' || value === 'double';
}

/** The cards of one hand in play. */
export interface BlackjackState {
  playerCards: Card[];
  /** The second card is the face-down one until the hand ends. */
  dealerCards: Card[];
  /** Cards still to be drawn, next card first. Never sent to the browser. */
  deck: Card[];
}

/** How a finished hand came out. `net` is the balance change (SRS-909.1). */
export interface BlackjackOutcome {
  result: BlackjackResult;
  /** Winnings (positive), the lost bet (negative), or 0 for a push. */
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

/**
 * Coins won on a winning hand. A blackjack pays 3 to 2, rounded down to whole
 * coins (a 25-coin blackjack wins 37); any other win pays 1 to 1.
 */
export function winnings(bet: number, playerCards: Card[]): number {
  return isBlackjack(playerCards) ? Math.floor((bet * 3) / 2) : bet;
}

function drawTo(cards: Card[], deck: Card[]): { cards: Card[]; deck: Card[] } {
  const [next, ...rest] = deck;
  if (!next) throw new Error('The deck ran out of cards.');
  return { cards: [...cards, next], deck: rest };
}

/** SRS-907.1: compares the final hands. */
export function settleHand(bet: number, state: BlackjackState): BlackjackOutcome {
  const player = handTotal(state.playerCards).total;
  const dealer = handTotal(state.dealerCards).total;
  const playerBlackjack = isBlackjack(state.playerCards);
  const dealerBlackjack = isBlackjack(state.dealerCards);

  if (player > 21) return { result: 'Bust', net: -bet };
  if (playerBlackjack && dealerBlackjack) return { result: 'Push', net: 0 };
  if (playerBlackjack) return { result: 'Win', net: winnings(bet, state.playerCards) };
  if (dealerBlackjack) return { result: 'Lose', net: -bet };
  if (dealer > 21 || player > dealer) return { result: 'Win', net: winnings(bet, state.playerCards) };
  if (player < dealer) return { result: 'Lose', net: -bet };
  return { result: 'Push', net: 0 };
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
  /** Set once the hand is over; null while it's still the player's turn. */
  outcome: BlackjackOutcome | null;
}

/**
 * SRS-902.1: shuffles a fresh 52-card deck and deals player, dealer, player,
 * dealer. `randomIndex(n)` must be uniform in [0, n) — the routes pass
 * crypto.randomInt (SRS-NFR-5). `presetDeck` replaces the shuffle in tests.
 *
 * If either side has blackjack the hand ends right away: the dealer checks
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

  const state = { playerCards, dealerCards, deck };
  const natural = isBlackjack(playerCards) || isBlackjack(dealerCards);
  return { state, outcome: natural ? settleHand(bet, state) : null };
}

/** SRS-910.1: Double is only allowed on the first two cards. */
export function canDouble(state: Pick<BlackjackState, 'playerCards'>): boolean {
  return state.playerCards.length === 2;
}

/**
 * Applies the player's move to a hand that is still in play. `bet` is the
 * hand's original bet.
 *   * Hit (SRS-903.1) deals one card. Going over 21 ends the hand as a Bust
 *     without the dealer drawing; reaching exactly 21 stands automatically,
 *     since no card can improve it.
 *   * Stand (SRS-904.1) ends the player's turn; the dealer then plays
 *     (SRS-906.1) and the hand is settled (SRS-907.1).
 *   * Double (SRS-910) deals exactly one card and then stands, or busts; the
 *     result is settled on twice the bet (SRS-910.4). The caller checks
 *     canDouble() and takes the second bet first (SRS-910.2).
 */
export function playMove(bet: number, state: BlackjackState, move: BlackjackMove): BlackjackStep {
  if (move === 'double' && !canDouble(state)) throw new Error('Double is only allowed on the first two cards.');
  const stake = move === 'double' ? bet * 2 : bet;

  let next = state;
  if (move === 'hit' || move === 'double') {
    const drawn = drawTo(state.playerCards, state.deck);
    next = { ...state, playerCards: drawn.cards, deck: drawn.deck };
    const total = handTotal(next.playerCards).total;
    if (total > 21) return { state: next, outcome: settleHand(stake, next) };
    if (move === 'hit' && total < 21) return { state: next, outcome: null };
  }

  const finished = playDealer(next);
  return { state: finished, outcome: settleHand(stake, finished) };
}

/** What the browser is allowed to see of a hand. */
export interface BlackjackHandView {
  handId: number;
  /** The hand's bet: twice the original once the player doubles. */
  bet: number;
  playerCards: Card[];
  playerTotal: number;
  /** null stands for the face-down card while the hand is in play. */
  dealerCards: (Card | null)[];
  /** The total of the dealer's face-up cards only. */
  dealerTotal: number;
  playerBlackjack: boolean;
  /** null while it's the player's turn. */
  result: BlackjackResult | null;
  net: number | null;
}

export function handView(
  handId: number,
  bet: number,
  state: Pick<BlackjackState, 'playerCards' | 'dealerCards'>,
  outcome: BlackjackOutcome | null
): BlackjackHandView {
  const visibleDealer = outcome ? state.dealerCards : state.dealerCards.slice(0, 1);
  return {
    handId,
    bet,
    playerCards: state.playerCards,
    playerTotal: handTotal(state.playerCards).total,
    dealerCards: outcome ? state.dealerCards : [...visibleDealer, null],
    dealerTotal: handTotal(visibleDealer).total,
    playerBlackjack: isBlackjack(state.playerCards),
    result: outcome?.result ?? null,
    net: outcome?.net ?? null,
  };
}
