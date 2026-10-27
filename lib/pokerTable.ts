// Seating plus the betting side of a hand. A player can join an open seat (one
// they pick, or the first open one) and leave it again, subject to a
// configurable seat cap. Once three players with chips are seated the table
// counts down and starts a hand: it places the dealer button, posts the
// blinds, deals the cards, and runs the betting rounds (preflop, flop, turn,
// river) — whose turn it is, which moves are legal, when a round is over,
// collecting bets into the pot(s) — and at showdown ranks the hands
// (lib/pokerCards.ts) and awards each pot. One instance is one
// table; the lobby's tables are listed in lib/pokerTables.ts. This module is
// intentionally decoupled from any transport (Socket.io, Supabase Realtime, or
// otherwise) — and from the clock: the caller passes `now` in and owns the
// countdown timer — so the rules can be unit tested without standing up a
// real server.
//
// Hole cards never appear in getState(): the public table state is
// broadcast to everyone, so getHoleCards() hands them to the server, which
// sends each player only their own, encrypted (SRS-6.1). They're revealed in
// the public state only at showdown (lastHandResult.shown, SRS-6.2/6.4), and
// folded hands never are (SRS-6.3).
//
// Traceability (docs/requirements/SRS):
//   SRS-1.1  Join open seat (optionally a specific one)
//   SRS-1.4  Reject join on full table
//   SRS-1.6  Join rejection message
//   SRS-1.7  Public table state contents (everything but cards and the
//            blind-owed indicator)
//   SRS-3.1  Reject out-of-turn actions
//   SRS-3.2  Active turn (activeSeat) in the public state
//   SRS-5.1-5.5 Best five of seven cards, ranked (lib/pokerCards.ts)
//   SRS-5.6 Each pot goes to the best hand among the players eligible for it
//   SRS-5.7/5.8 Ties split in whole chips, odd chips clockwise from the button
//   SRS-6.1-6.5 Hole cards kept out of the public state; revealed at
//            showdown (and before an all-in run-out) in SRS-6.5's order
//   SRS-8.1/8.2 Seated players' profile pictures (fetched by the client)
//   SRS-13.1/13.2 Random first button, then the next eligible seat clockwise
//   SRS-13.4 Dealt-in players (simplified: every seated player with chips —
//            missed-blind tracking, SRS-11.x, isn't built, so all are "clear")
//   SRS-14.1-14.7 Blind designation and posting, partial blinds all-in, and
//            the preflop current bet is the full big blind
//   SRS-15.1/15.2 Check/bet/fold, or fold/call/raise when facing a bet
//   SRS-15.3 Minimum opening bet is the big blind unless all-in
//   SRS-15.4/15.5 Minimum raise increment is the last full bet/raise
//   SRS-15.6 No-limit: up to the whole stack
//   SRS-15.7 All-in call for less
//   SRS-15.8 An incomplete all-in raise doesn't reopen raising
//   SRS-15.9/15.10 Invalid amounts are rejected with the allowed range
//   SRS-16.1-16.4 Shuffle, then two hole cards each, one at a time from the
//            small blind clockwise, from one deck
//   SRS-17.1-17.6 Burn a card, then deal the flop, turn, and river
//   SRS-17.7 Award without showdown when one player is left
//   SRS-17.8/17.9 Fewer than two able-to-act players: run out the rest of the
//            board with no more betting, then showdown
//   SRS-18.1/18.2 First to act preflop (after the big blind) and postflop
//            (after the button)
//   SRS-18.3/18.4 Round completion (blinds aren't actions)
//   SRS-18.5 The turn passes only to able-to-act players
//   SRS-18.6 Immediate hand end when one player is left
//   SRS-18.7/18.8 Current bet and minimum raise reset each round
//   SRS-18.9 Advance to the next round, or showdown after the river
//   SRS-19.1-19.4 Side pots for all-in players, and pot eligibility
//   SRS-19.5 Uncalled bets are returned at the end of each round
//   SRS-20.1/20.2/20.5 At least three players to start; otherwise waiting
//   SRS-20.4 A hand in progress finishes even if players leave
//   SRS-20.6 Joins permitted while waiting (and mid-hand, dealt in next hand)
//   SRS-21.1 Leave between hands (or when not in the hand) right away
//   SRS-21.2 Leave during a hand folds when action next reaches that player
//   SRS-21.3 ...and removes them once the hand ends (drainRemovals())
//   SRS-NFR-022 Maximum seat count (3-9 seats)
//
// playerId identifies the signed-in account (the players.player_id from
// supabase/schema.sql, as a string), not a transport-level connection id —
// the server layer maps each connection to the player_id it authenticated as.
//
// Buy-ins (SRS-1.2, SRS-1.3) deduct/refund against players.balance at the
// transport layer (server/pokerRealtimeServer.ts), which computes the
// allowed buy-in range from this table's bigBlind (50x-200x) and passes an
// already-validated chip count in here — this class just stores and returns
// it. A player whose stack hits 0 at the end of a hand is busted (SRS-12.1,
// isBustedSeat()): they sit out (SRS-12.9) until they buy back in with
// rebuy() (SRS-12.4/12.5) or leave (SRS-12.3), or are removed after
// BUSTED_DECISION_TIMEOUT_MS (SRS-12.10; like the countdown, the caller
// passes `now` and owns the timer). Missed blinds (SRS-11): a seated player
// the small or big blind passes while they aren't dealt in — busted or
// sitting out — owes it, and is dealt back in only when the big blind
// reaches them (SRS-11.5) or after electing to post what they owe
// (SRS-11.6-11.9, setPostMissedBlinds()). A newly seated player is dealt in
// free (SRS-11.3), unless the button
// would land on them next hand: the button skips them, and they either post
// both blinds to play that hand or sit it out (waitingForButton,
// SRS-11.13-11.16). Reconnection grace periods (SRS-10.x,
// SRS-9.x) and turn timers (SRS-4.x) are deferred to later sprints.

import { createDeck, evaluateHand, shuffleDeck, type Card, type HandScore, compareScores } from './pokerCards';

export const MIN_TABLE_SEATS = 3;
export const MAX_TABLE_SEATS = 9;
export const DEFAULT_TABLE_SEATS = 6;
export const DEFAULT_BIG_BLIND = 5;
// SRS-NFR-021: the buy-in range is 50x-200x a table's big blind. Shared by the server
// (which enforces it) and the table page (which clamps its input to it).
export const MIN_BUY_IN_MULTIPLIER = 50;
export const MAX_BUY_IN_MULTIPLIER = 200;
// SRS-20.1: a hand needs at least this many dealt-in players.
export const MIN_PLAYERS_TO_START = 3;
// How long a table counts down once it has enough players, before the hand
// starts — long enough for one more player to grab a seat.
export const HAND_START_COUNTDOWN_MS = 5_000;
// SRS-NFR-015 / SRS-12.10: how long a busted player has to buy back in or
// leave before they're removed from their seat.
export const BUSTED_DECISION_TIMEOUT_MS = 60_000;

/**
 * waiting: fewer than MIN_PLAYERS_TO_START seated with chips (SRS-20.2/20.5).
 * countdown: enough players; the hand starts when the countdown ends.
 * in-hand: a hand is in progress.
 */
export type TablePhase = 'waiting' | 'countdown' | 'in-hand';

export type Street = 'preflop' | 'flop' | 'turn' | 'river';

const STREET_ORDER: Street[] = ['preflop', 'flop', 'turn', 'river'];

/**
 * 'bet' and 'raise' carry the amount the player's round contribution goes
 * *to* (not the amount added) — "raise to 40".
 */
export type BettingMove = 'fold' | 'check' | 'call' | 'bet' | 'raise';

export interface Seat {
  seatNumber: number;
  playerId: string | null;
  username: string | null;
  avatarUrl: string | null;
  chipStack: number | null;
  /** Dealt into the current hand and hasn't folded ("in-hand player"). */
  inHand: boolean;
  /** Dealt into the current hand and has folded. */
  folded: boolean;
  /** Chips put in during the current betting round ("round contribution"). */
  bet: number;
  /** Chips put in during the whole hand, including `bet`. */
  totalBet: number;
  /** No chips left behind (SRS-14.6, SRS-15.7, or an all-in bet/raise). */
  allIn: boolean;
  /** Has acted in the current round — posting a blind doesn't count (SRS-18.4). */
  hasActed: boolean;
  /** False after an incomplete all-in raise this player can only call or fold to (SRS-15.8). */
  canRaise: boolean;
  /** Asked to leave mid-hand; folds when action reaches them, removed after the hand (SRS-21.2/21.3). */
  leaveRequested: boolean;
  /** What this seat did most recently this round ('Check', 'Call', 'Raise', 'All-in', 'Fold'). */
  lastAction: string | null;
  /**
   * SRS-12.10: ms a busted player has left to buy back in or leave before
   * they're removed; null when not busted. Relative, like countdownMsRemaining.
   */
  bustedMsRemaining: number | null;
  /** SRS-11.2: the small blind passed this seat while the player wasn't dealt in. */
  missedSmallBlind: boolean;
  /**
   * SRS-11.1/11.3: the big blind passed this seat while the player wasn't
   * dealt in, or they sat down after the table's first hand.
   */
  missedBigBlind: boolean;
  /** SRS-11.6: elected to post their missed blinds and be dealt into the next hand. */
  postingMissedBlinds: boolean;
  /**
   * Newly seated where the button would land next hand. The button skips
   * them: they post both blinds to play that hand (postingMissedBlinds), or
   * sit it out and are dealt in free from the hand after.
   */
  waitingForButton: boolean;
}

/** A main or side pot built from chips already collected (SRS-19). */
export interface Pot {
  amount: number;
  /** Seats of the in-hand players who can win it (SRS-19.4). */
  eligibleSeats: number[];
}

export interface LastAction {
  seatNumber: number;
  username: string | null;
  move: BettingMove;
  /** The round contribution after the move (0 for check/fold). */
  amount: number;
  allIn: boolean;
}

export interface HandResult {
  handNumber: number;
  /** 'fold': everyone else folded (SRS-17.7). 'showdown': hands compared (SRS-5). */
  reason: 'fold' | 'showdown';
  /** The board as it ended — all five cards after a showdown. */
  board: Card[];
  /** True when the board was run out with no betting because of all-ins (SRS-17.8). */
  ranOut: boolean;
  /** Hands revealed at showdown, in SRS-6.5's order. Empty when everyone else folded. */
  shown: { seatNumber: number; playerId: string; username: string | null; cards: Card[]; handName: string }[];
  /** Chips won per seat, across every pot; handName is null when the pot was won without a showdown. */
  awards: { seatNumber: number; username: string | null; amount: number; handName: string | null }[];
}

export interface TableState {
  tableId: string;
  maxSeats: number;
  /** The table's configured big blind — the buy-in range is 50x-200x this. */
  bigBlind: number;
  smallBlind: number;
  seatedCount: number;
  seats: Seat[];
  phase: TablePhase;
  /**
   * Time left before the hand starts, while phase is 'countdown'. Relative
   * rather than a timestamp so clients don't depend on their own clock
   * agreeing with the server's.
   */
  countdownMsRemaining: number | null;
  /** 0 until the table's first hand starts. */
  handNumber: number;
  /** Null between hands. */
  street: Street | null;
  /** Community cards dealt so far this hand (empty between hands). */
  board: Card[];
  /** Whose turn it is (SRS-3.2); null between hands. */
  activeSeat: number | null;
  /** Seat numbers; null before the first hand. dealerSeat stays set between hands. */
  dealerSeat: number | null;
  smallBlindSeat: number | null;
  bigBlindSeat: number | null;
  /**
   * Chips collected from finished betting rounds, split into the main pot
   * and side pots. Chips bet in the current round sit in front of each seat
   * (`seat.bet`) until the round ends and they're collected.
   */
  pots: Pot[];
  /** Total of `pots`. */
  pot: number;
  /** The highest round contribution this round — what everyone must match. */
  currentBet: number;
  /** The smallest allowed raise increment over currentBet (SRS-15.5/18.8). */
  minRaise: number;
  /** The most recent player action (SRS-1.7). */
  lastAction: LastAction | null;
  /** How the previous hand ended; kept until the next hand starts. */
  lastHandResult: HandResult | null;
}

export interface JoinResult {
  ok: boolean;
  error?: string;
  seatNumber?: number;
}

export interface LeaveResult {
  ok: boolean;
  error?: string;
  seatNumber?: number;
  /** The chip stack the freed seat held, so the caller can refund it. */
  chipStack?: number;
  /**
   * The player is in the current hand, so they'll fold when action reaches
   * them and be removed when the hand ends (SRS-21.2/21.3) — see
   * drainRemovals() for when that happens.
   */
  pending?: boolean;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** A player removed at the end of a hand after asking to leave during it. */
export interface Removal {
  playerId: string;
  chipStack: number;
}

/** What the acting player may do right now; shared with the client to draw its buttons. */
export interface BettingOptions {
  canCheck: boolean;
  canCall: boolean;
  /** Chips a call puts in — the amount owed, or the whole stack if that's less (SRS-15.7). */
  callAmount: number;
  /** Whether a bet or raise is allowed, and which one it is. */
  aggressive: 'bet' | 'raise' | null;
  /** The allowed range for the bet/raise-to amount (equal when only all-in is allowed). */
  minTo: number;
  maxTo: number;
}

/**
 * SRS-15.1-15.8: the legal moves for a seat given the round's current bet
 * and minimum raise. Fold is always allowed. A bet or raise must reach at
 * least the big blind (opening) or currentBet + minRaise (raising) unless it's
 * the player's whole stack.
 */
export function getBettingOptions(
  seat: Pick<Seat, 'bet' | 'chipStack' | 'canRaise'>,
  table: Pick<TableState, 'currentBet' | 'minRaise' | 'bigBlind'>
): BettingOptions {
  const stack = seat.chipStack ?? 0;
  const owed = Math.max(0, table.currentBet - seat.bet);
  const maxTo = seat.bet + stack;
  const fullMinTo = table.currentBet === 0 ? table.bigBlind : table.currentBet + table.minRaise;
  const canAggress = seat.canRaise && maxTo > table.currentBet;

  return {
    canCheck: owed === 0,
    canCall: owed > 0,
    callAmount: Math.min(owed, stack),
    aggressive: canAggress ? (table.currentBet === 0 ? 'bet' : 'raise') : null,
    minTo: Math.min(fullMinTo, maxTo),
    maxTo,
  };
}

/**
 * SRS-12.1: busted — seated with no chips left after a hand. A player who
 * went all-in is still in the hand (inHand) until it ends, so they only
 * count as busted once it's over. Shared with the table page, which offers
 * a busted player the choice to buy back in or leave (SRS-12.2).
 */
export function isBustedSeat(seat: Pick<Seat, 'playerId' | 'chipStack' | 'inHand'>): boolean {
  return seat.playerId !== null && seat.chipStack === 0 && !seat.inHand;
}

// Internal bookkeeping that clients don't need to see.
interface SeatRecord extends Omit<Seat, 'bustedMsRemaining' | 'waitingForButton'> {
  /** Sat down after the first hand and hasn't been through a hand start yet. */
  newcomer: boolean;
  /** When this player was first seen busted (trackBusted()); null when not busted. */
  bustedAt: number | null;
  /** Acted since the last full bet/raise — who loses raising rights under SRS-15.8. */
  actedSinceFullRaise: boolean;
  /** Private: never part of getState() (SRS-6.1). Empty when not dealt in. */
  holeCards: Card[];
}

function emptySeat(seatNumber: number): SeatRecord {
  return {
    seatNumber,
    playerId: null,
    username: null,
    avatarUrl: null,
    chipStack: null,
    inHand: false,
    folded: false,
    bet: 0,
    totalBet: 0,
    allIn: false,
    hasActed: false,
    canRaise: true,
    leaveRequested: false,
    lastAction: null,
    actedSinceFullRaise: false,
    holeCards: [],
    bustedAt: null,
    missedSmallBlind: false,
    missedBigBlind: false,
    postingMissedBlinds: false,
    newcomer: false,
  };
}

/** Clears everything about the current hand from a seat, keeping who sits there. */
function resetHandFields(seat: SeatRecord) {
  seat.inHand = false;
  seat.folded = false;
  seat.bet = 0;
  seat.totalBet = 0;
  seat.allIn = false;
  seat.hasActed = false;
  seat.canRaise = true;
  seat.leaveRequested = false;
  seat.lastAction = null;
  seat.actedSinceFullRaise = false;
  seat.holeCards = [];
}

export class PokerTable {
  readonly tableId: string;
  readonly bigBlind: number;
  readonly smallBlind: number;
  private readonly maxSeats: number;
  private seats: SeatRecord[];
  private phase: TablePhase = 'waiting';
  private countdownEndsAt: number | null = null;
  private handNumber = 0;
  private street: Street | null = null;
  private deck: Card[] = [];
  private board: Card[] = [];
  private activeSeat: number | null = null;
  /** Who made the last bet or raise this round — first to show at showdown (SRS-6.5). */
  private lastAggressorSeat: number | null = null;
  private dealerSeat: number | null = null;
  private smallBlindSeat: number | null = null;
  private bigBlindSeat: number | null = null;
  /** The previous hand's blind seats (the public ones are cleared between hands), for SRS-11.1/11.2. */
  private previousSmallBlindSeat: number | null = null;
  private previousBigBlindSeat: number | null = null;
  private currentBet = 0;
  private minRaise: number;
  private lastAction: LastAction | null = null;
  private lastHandResult: HandResult | null = null;
  /** Total contributions of players who left mid-hand after folding — dead money in the pot. */
  private deadContributions: number[] = [];
  /** The current-round part of those, so SRS-19.5 can compare against them. */
  private deadRoundBets: number[] = [];
  private pendingRemovals: Removal[] = [];

  /** smallBlind defaults to half the big blind, rounded down (minimum 1). */
  constructor(
    tableId: string,
    maxSeats: number = DEFAULT_TABLE_SEATS,
    bigBlind: number = DEFAULT_BIG_BLIND,
    smallBlind: number = Math.max(1, Math.floor(bigBlind / 2))
  ) {
    if (maxSeats < MIN_TABLE_SEATS || maxSeats > MAX_TABLE_SEATS) {
      throw new Error(
        `Table max seats must be between ${MIN_TABLE_SEATS} and ${MAX_TABLE_SEATS} (SRS-NFR-022).`
      );
    }

    if (!Number.isInteger(bigBlind) || bigBlind <= 0) {
      throw new Error('Table big blind must be a positive integer.');
    }

    if (!Number.isInteger(smallBlind) || smallBlind <= 0 || smallBlind > bigBlind) {
      throw new Error('Table small blind must be a positive integer no larger than the big blind.');
    }

    this.tableId = tableId;
    this.bigBlind = bigBlind;
    this.smallBlind = smallBlind;
    this.minRaise = bigBlind;
    this.maxSeats = maxSeats;
    this.seats = Array.from({ length: maxSeats }, (_, index) => emptySeat(index + 1));
  }

  /** `now` (ms since the epoch) is only used to compute countdownMsRemaining. */
  getState(now: number = Date.now()): TableState {
    const pots = this.buildPots();
    const waitingForButton = this.newcomersInButtonPath();
    return {
      tableId: this.tableId,
      maxSeats: this.maxSeats,
      bigBlind: this.bigBlind,
      smallBlind: this.smallBlind,
      seatedCount: this.seats.filter((seat) => seat.playerId !== null).length,
      // Hole cards stay out of the public state (SRS-6.1).
      seats: this.seats.map((record) => {
        const { actedSinceFullRaise: _internal, holeCards: _private, bustedAt, newcomer: _newcomer, ...seat } = record;
        return {
          ...seat,
          bustedMsRemaining: bustedAt === null ? null : Math.max(0, bustedAt + BUSTED_DECISION_TIMEOUT_MS - now),
          waitingForButton: waitingForButton.includes(record),
        };
      }),
      phase: this.phase,
      countdownMsRemaining: this.countdownEndsAt === null ? null : Math.max(0, this.countdownEndsAt - now),
      handNumber: this.handNumber,
      street: this.street,
      board: this.board.slice(),
      activeSeat: this.activeSeat,
      dealerSeat: this.dealerSeat,
      smallBlindSeat: this.smallBlindSeat,
      bigBlindSeat: this.bigBlindSeat,
      pots,
      pot: pots.reduce((sum, pot) => sum + pot.amount, 0),
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      lastAction: this.lastAction,
      lastHandResult: this.lastHandResult,
    };
  }

  getPhase(): TablePhase {
    return this.phase;
  }

  private findSeatByPlayerId(playerId: string): SeatRecord | undefined {
    return this.seats.find((seat) => seat.playerId === playerId);
  }

  /** The seat number this player holds here, or null if they aren't seated. */
  getSeatNumber(playerId: string): number | null {
    return this.findSeatByPlayerId(playerId)?.seatNumber ?? null;
  }

  /** Seated with chips — able to be dealt in. Busted players (0 chips) sit out. */
  private isEligible(seat: SeatRecord): boolean {
    return seat.playerId !== null && (seat.chipStack ?? 0) > 0;
  }

  /** Eligible with no missed-blind marker, so dealt into every hand (SRS-13.4). */
  private isClear(seat: SeatRecord): boolean {
    return this.isEligible(seat) && !seat.missedSmallBlind && !seat.missedBigBlind;
  }

  /**
   * SRS-14.1/14.2: the small blind is the next clear player after the
   * button, the big blind the next eligible player after that. Null if the
   * three seats wouldn't all be different.
   */
  private blindsAfter(
    dealer: SeatRecord,
    isClear: (seat: SeatRecord) => boolean
  ): { smallBlind: SeatRecord; bigBlind: SeatRecord } | null {
    const smallBlind = this.nextSeatClockwise(dealer.seatNumber, isClear);
    const bigBlind = smallBlind && this.nextSeatClockwise(smallBlind.seatNumber, (seat) => this.isEligible(seat));
    if (!smallBlind || !bigBlind || new Set([dealer, smallBlind, bigBlind]).size < 3) return null;
    return { smallBlind, bigBlind };
  }

  /** Who can take the button: a clear player who has already been through a hand start. */
  private canTakeButton(seat: SeatRecord): boolean {
    return this.isClear(seat) && !seat.newcomer;
  }

  /**
   * Newly seated players the button will skip next hand: between the
   * current button and the next seat that can take it. Each posts both
   * blinds to play that hand, or sits it out.
   */
  private newcomersInButtonPath(): SeatRecord[] {
    if (this.dealerSeat === null) return [];
    const next = this.nextSeatClockwise(this.dealerSeat, (seat) => this.canTakeButton(seat));
    if (!next) return [];
    const passed: SeatRecord[] = [];
    for (let offset = 1; offset < this.maxSeats; offset++) {
      const seat = this.seats[(this.dealerSeat - 1 + offset) % this.maxSeats] as SeatRecord;
      if (seat === next) break;
      if (seat.newcomer && this.isEligible(seat)) passed.push(seat);
    }
    return passed;
  }

  /**
   * SRS-11.9: a player may not post their way in when, counted as clear,
   * their seat would get the button or a blind next hand.
   */
  private postingBlockedFor(seat: SeatRecord): boolean {
    if (this.dealerSeat === null) return true;
    const isClear = (candidate: SeatRecord) =>
      candidate === seat ? this.isEligible(candidate) : this.isClear(candidate);
    const dealer = this.nextSeatClockwise(this.dealerSeat, (candidate) =>
      candidate === seat ? this.isEligible(candidate) : this.canTakeButton(candidate)
    );
    const blinds = dealer && this.blindsAfter(dealer, isClear);
    return !dealer || !blinds || [dealer, blinds.smallBlind, blinds.bigBlind].includes(seat);
  }

  /**
   * SRS-13.3 hand setup: the button (SRS-13.1/13.2), the blinds
   * (SRS-14.1/14.2), then who's dealt in (SRS-13.4): every clear player, the
   * big blind, and every player whose election to post is still allowed
   * (SRS-11.6/11.9). The button never lands on a newcomer; newcomers it
   * skips are dealt in only if they post. Null when that's fewer than
   * MIN_PLAYERS_TO_START (SRS-20.1). Calls randomIndex only for the first
   * hand's button.
   */
  private planHand(randomIndex: (n: number) => number): {
    dealer: SeatRecord;
    smallBlind: SeatRecord;
    bigBlind: SeatRecord;
    dealtIn: SeatRecord[];
    posters: SeatRecord[];
  } | null {
    const isClear = (seat: SeatRecord) => this.isClear(seat);
    const clear = this.seats.filter(isClear);
    if (clear.length === 0) return null;
    const dealer =
      this.dealerSeat === null
        ? (clear[randomIndex(clear.length)] as SeatRecord)
        : this.nextSeatClockwise(this.dealerSeat, (seat) => this.canTakeButton(seat));
    if (!dealer) return null;
    const blinds = this.blindsAfter(dealer, isClear);
    if (!blinds) return null;

    const skippedNewcomers = this.newcomersInButtonPath();
    const posters = this.seats.filter(
      (seat) =>
        seat.postingMissedBlinds &&
        (skippedNewcomers.includes(seat) ||
          (!isClear(seat) && this.isEligible(seat) && seat !== blinds.bigBlind && !this.postingBlockedFor(seat)))
    );
    const dealtIn = this.seats.filter(
      (seat) =>
        (isClear(seat) && !skippedNewcomers.includes(seat)) || seat === blinds.bigBlind || posters.includes(seat)
    );
    if (dealtIn.length < MIN_PLAYERS_TO_START) return null;
    return { dealer, ...blinds, dealtIn, posters };
  }

  /**
   * SRS-11.11: a table in the waiting state forgets every missed blind — and
   * who's new, so a newcomer the button would skip can't hold up the restart.
   */
  private clearMissedBlinds() {
    for (const seat of this.seats) {
      seat.newcomer = false;
      seat.missedSmallBlind = false;
      seat.missedBigBlind = false;
      seat.postingMissedBlinds = false;
    }
  }

  /**
   * Whether a hand could start now (SRS-20.3). If hand setup would come up
   * short, the table is waiting, which clears missed blinds (SRS-11.11) —
   * and that may be enough to start after all.
   */
  private canStartHand(): boolean {
    if (this.planHand(() => 0)) return true;
    this.clearMissedBlinds();
    return this.planHand(() => 0) !== null;
  }

  /** In the hand and not all-in, so they still have decisions to make. */
  private isAbleToAct(seat: SeatRecord): boolean {
    return seat.inHand && !seat.allIn;
  }

  /**
   * The first seat clockwise (increasing seat number, wrapping) after
   * `seatNumber` that matches `predicate`, possibly `seatNumber` itself last.
   */
  private nextSeatClockwise(seatNumber: number, predicate: (seat: SeatRecord) => boolean): SeatRecord | null {
    for (let offset = 1; offset <= this.maxSeats; offset++) {
      const seat = this.seats[(seatNumber - 1 + offset) % this.maxSeats] as SeatRecord;
      if (predicate(seat)) return seat;
    }
    return null;
  }

  /**
   * Why `seatNumber` can't be sat in right now, or null if it can. Lets the
   * server reject a bad seat choice before taking the buy-in from the
   * player's balance; join() re-checks it regardless.
   */
  checkSeat(seatNumber: number): string | null {
    const seat = this.seats.find((candidate) => candidate.seatNumber === seatNumber);
    if (!seat) return 'That seat does not exist.';
    if (seat.playerId !== null) return 'That seat is already taken.';
    return null;
  }

  /**
   * Starts or cancels the pre-hand countdown to match whether hand setup
   * would deal in enough players (SRS-20.1/20.3). Call after every change
   * (join, leave, buy-back, posting election) and after a hand ends; the
   * caller starts or clears its timer (and calls startHand() when it fires)
   * based on the return value.
   */
  updateCountdown(now: number): 'started' | 'cancelled' | null {
    if (this.phase === 'in-hand') return null;
    const canStart = this.canStartHand();

    if (this.phase === 'waiting' && canStart) {
      this.phase = 'countdown';
      this.countdownEndsAt = now + HAND_START_COUNTDOWN_MS;
      return 'started';
    }

    if (this.phase === 'countdown' && !canStart) {
      this.phase = 'waiting';
      this.countdownEndsAt = null;
      return 'cancelled';
    }

    return null;
  }

  /**
   * SRS-13.3 hand setup, blind posting (SRS-14), the deal (SRS-16), then
   * hands the turn to the first player to act preflop (SRS-18.1).
   * `randomIndex(n)` returns a uniformly random integer in [0, n); it picks
   * the first hand's dealer (SRS-13.1) and shuffles the deck (SRS-16.1) — the
   * server passes crypto.randomInt. `presetDeck` replaces the shuffle with a
   * fixed deck order, for tests. Returns false, leaving the table waiting,
   * when setup would deal in fewer than MIN_PLAYERS_TO_START (SRS-20.7: the
   * button doesn't move, no missed blinds are recorded, and no blinds are
   * posted).
   */
  startHand(
    randomIndex: (n: number) => number = (n) => Math.floor(Math.random() * n),
    presetDeck?: Card[]
  ): boolean {
    if (this.phase === 'in-hand') return false;

    this.countdownEndsAt = null;
    let plan = this.planHand(randomIndex);
    if (!plan) {
      // Waiting: missed blinds are cleared (SRS-11.11), which may be enough.
      this.clearMissedBlinds();
      plan = this.planHand(randomIndex);
    }
    if (!plan) {
      this.phase = 'waiting';
      return false;
    }
    const { dealer, smallBlind, bigBlind, dealtIn, posters } = plan;

    // SRS-11.1/11.2: every seated player left out of this hand whose seat
    // the big (or small) blind moved past — after the previous hand's blind
    // seat, up to and including this hand's — owes that blind. Kept until
    // they're dealt in (SRS-11.4).
    const markPassed = (previous: number | null, current: number, mark: (seat: SeatRecord) => void) => {
      if (previous === null || previous === current) return;
      for (let offset = 1; offset <= this.maxSeats; offset++) {
        const seat = this.seats[(previous - 1 + offset) % this.maxSeats] as SeatRecord;
        if (seat.playerId !== null && !dealtIn.includes(seat)) mark(seat);
        if (seat.seatNumber === current) break;
      }
    };
    markPassed(this.previousBigBlindSeat, bigBlind.seatNumber, (seat) => {
      seat.missedBigBlind = true;
    });
    markPassed(this.previousSmallBlindSeat, smallBlind.seatNumber, (seat) => {
      seat.missedSmallBlind = true;
    });
    this.previousSmallBlindSeat = smallBlind.seatNumber;
    this.previousBigBlindSeat = bigBlind.seatNumber;

    // What each poster owes, read before re-entry clears it (SRS-11.10). A
    // newcomer the button skipped posts both blinds.
    const owed = posters.map((seat) =>
      seat.newcomer
        ? { seat, big: true, small: true }
        : { seat, big: seat.missedBigBlind, small: seat.missedSmallBlind }
    );
    this.seats.forEach((seat) => {
      resetHandFields(seat);
      seat.inHand = dealtIn.includes(seat);
      if (seat.inHand) {
        seat.missedSmallBlind = false;
        seat.missedBigBlind = false;
      }
      // An election is for one hand: used now, or refused (SRS-11.9).
      seat.postingMissedBlinds = false;
      // A newcomer the button skipped has now sat out (or posted for) a hand.
      seat.newcomer = false;
    });

    this.phase = 'in-hand';
    this.handNumber += 1;
    this.street = 'preflop';
    this.dealerSeat = dealer.seatNumber;
    this.smallBlindSeat = smallBlind.seatNumber;
    this.bigBlindSeat = bigBlind.seatNumber;
    this.lastAction = null;
    this.lastHandResult = null;
    this.deadContributions = [];
    this.deadRoundBets = [];
    this.putIn(smallBlind, Math.min(this.smallBlind, smallBlind.chipStack ?? 0));
    this.putIn(bigBlind, Math.min(this.bigBlind, bigBlind.chipStack ?? 0));
    // SRS-11.7/11.8: posters put in a live big blind (it counts toward their
    // bet, so they get the option like the big blind) and a dead small blind
    // (straight into the pot, not part of their bet). A short stack posts
    // what it has (SRS-14.5/14.6).
    for (const { seat, big, small } of owed) {
      if (big) this.putIn(seat, Math.min(this.bigBlind, seat.chipStack ?? 0));
      if (small) {
        const dead = Math.min(this.smallBlind, seat.chipStack ?? 0);
        seat.chipStack = (seat.chipStack ?? 0) - dead;
        if (seat.chipStack === 0) seat.allIn = true;
        if (dead > 0) this.deadContributions.push(dead);
      }
    }
    this.currentBet = this.bigBlind;
    this.minRaise = this.bigBlind;
    this.lastAggressorSeat = null;

    // SRS-16: shuffle, then two cards each, one at a time in two passes,
    // starting from the small blind and going clockwise.
    this.deck = presetDeck ? presetDeck.slice() : shuffleDeck(createDeck(), randomIndex);
    this.board = [];
    const dealOrder = Array.from(
      { length: this.maxSeats },
      (_, offset) => this.seats[(smallBlind.seatNumber - 1 + offset) % this.maxSeats] as SeatRecord
    ).filter((seat) => seat.inHand);
    for (let pass = 0; pass < 2; pass++) {
      dealOrder.forEach((seat) => seat.holeCards.push(this.drawCard()));
    }

    // SRS-18.1: action starts with the first able-to-act player after the big blind.
    this.activeSeat = bigBlind.seatNumber;
    this.advance();
    return true;
  }

  private drawCard(): Card {
    const card = this.deck.shift();
    if (!card) throw new Error('The deck ran out of cards.');
    return card;
  }

  /**
   * Each dealt-in player's hole cards, folded or not, for the server to
   * deliver privately to their owner (SRS-6.1). Empty between hands.
   */
  getHoleCards(): { playerId: string; cards: Card[] }[] {
    if (this.phase !== 'in-hand') return [];
    return this.seats
      .filter((seat) => seat.playerId !== null && seat.holeCards.length === 2)
      .map((seat) => ({ playerId: seat.playerId as string, cards: seat.holeCards.slice() }));
  }

  /** Moves chips from a seat's stack into its round contribution; an empty stack is all-in. */
  private putIn(seat: SeatRecord, chips: number) {
    seat.chipStack = (seat.chipStack ?? 0) - chips;
    seat.bet += chips;
    seat.totalBet += chips;
    if (seat.chipStack === 0) seat.allIn = true;
  }

  /**
   * A betting action from `playerId`. Rejected (with nothing changed) when
   * it isn't their turn (SRS-3.1) or the move/amount isn't legal (SRS-15.9,
   * with the allowed range in the error per SRS-15.10). On success the turn
   * moves on, and the round or the whole hand may end.
   */
  act(playerId: string, move: BettingMove, amount?: number): ActionResult {
    if (this.phase !== 'in-hand') return { ok: false, error: 'No hand is in progress.' };

    const seat = this.findSeatByPlayerId(playerId);
    if (!seat) return { ok: false, error: 'You are not seated at this table.' };
    if (seat.seatNumber !== this.activeSeat) return { ok: false, error: "It's not your turn." };

    const options = getBettingOptions(seat, {
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      bigBlind: this.bigBlind,
    });

    if (move === 'fold') {
      this.fold(seat);
    } else if (move === 'check') {
      if (!options.canCheck) {
        return { ok: false, error: `You can't check — it's ${options.callAmount} to call.` };
      }
      this.recordAction(seat, 'check');
    } else if (move === 'call') {
      if (!options.canCall) return { ok: false, error: 'There is no bet to call.' };
      this.putIn(seat, options.callAmount);
      this.recordAction(seat, 'call');
    } else if (move === 'bet' || move === 'raise') {
      if (options.aggressive === null) {
        return { ok: false, error: "You can't raise right now — you can only call or fold." };
      }
      if (options.aggressive !== move) {
        return {
          ok: false,
          error: move === 'bet' ? 'There is already a bet — raise instead.' : 'There is no bet to raise — bet instead.',
        };
      }
      const label = move === 'bet' ? 'Bet' : 'Raise';
      if (!Number.isInteger(amount) || (amount as number) < options.minTo || (amount as number) > options.maxTo) {
        return {
          ok: false,
          error:
            options.minTo === options.maxTo
              ? `${label} must be all-in for ${options.maxTo}.`
              : `${label} must be to between ${options.minTo} and ${options.maxTo}.`,
        };
      }
      this.raiseTo(seat, amount as number);
      this.recordAction(seat, move);
    } else {
      return { ok: false, error: 'Unknown action.' };
    }

    this.advance();
    return { ok: true };
  }

  private fold(seat: SeatRecord) {
    seat.inHand = false;
    seat.folded = true;
    this.recordAction(seat, 'fold');
  }

  /** SRS-15.4/15.5/15.8: a bet or raise to `to`, and what it does to everyone's raising rights. */
  private raiseTo(seat: SeatRecord, to: number) {
    const increment = to - this.currentBet;
    this.putIn(seat, to - seat.bet);
    this.lastAggressorSeat = seat.seatNumber;

    if (increment >= this.minRaise) {
      // A full bet/raise: it sets the next minimum and reopens raising for all.
      this.minRaise = increment;
      this.seats.forEach((other) => {
        if (other === seat || !this.isAbleToAct(other)) return;
        other.canRaise = true;
        other.actedSinceFullRaise = false;
      });
    } else {
      // An incomplete all-in raise: whoever already acted since the last
      // full raise may only call or fold to it (SRS-15.8).
      this.seats.forEach((other) => {
        if (other !== seat && other.actedSinceFullRaise) other.canRaise = false;
      });
    }
    this.currentBet = to;
  }

  private recordAction(seat: SeatRecord, move: BettingMove) {
    seat.hasActed = true;
    seat.actedSinceFullRaise = true;
    seat.lastAction =
      move === 'fold'
        ? 'Fold'
        : seat.allIn && move !== 'check'
          ? 'All-in'
          : move === 'check'
            ? 'Check'
            : move === 'call'
              ? 'Call'
              : move === 'bet'
                ? 'Bet'
                : 'Raise';
    this.lastAction = {
      seatNumber: seat.seatNumber,
      username: seat.username,
      move,
      amount: move === 'fold' || move === 'check' ? 0 : seat.bet,
      allIn: seat.allIn,
    };
  }

  /** SRS-18.3: every able-to-act player has acted this round and matched the current bet. */
  private isRoundComplete(): boolean {
    return this.seats
      .filter((seat) => this.isAbleToAct(seat))
      .every((seat) => seat.hasActed && seat.bet === this.currentBet);
  }

  /**
   * Runs the hand forward after something changed: ends it if one player is
   * left (SRS-18.6), ends the round when it's complete (SRS-18.3) and starts
   * the next one or goes to showdown (SRS-18.9, SRS-17.8), and otherwise
   * passes the turn to the next able-to-act player still owing an action
   * (SRS-18.5) — folding them first if they asked to leave (SRS-21.2).
   */
  private advance() {
    for (;;) {
      const inHand = this.seats.filter((seat) => seat.inHand);
      if (inHand.length <= 1) {
        this.finishHand('fold');
        return;
      }

      if (this.isRoundComplete()) {
        this.collectBets();
        if (this.street === 'river') {
          this.finishHand('showdown');
          return;
        }
        const ableCount = inHand.filter((seat) => !seat.allIn).length;
        if (ableCount < 2) {
          // SRS-17.8/17.9 (and SRS-6.4: the hands are revealed in the result
          // along with the finished board).
          this.runOutBoard();
          this.finishHand('showdown', true);
          return;
        }
        this.startNextStreet();
        continue;
      }

      const next = this.nextSeatClockwise(
        this.activeSeat as number,
        (seat) => this.isAbleToAct(seat) && (!seat.hasActed || seat.bet < this.currentBet)
      ) as SeatRecord;
      this.activeSeat = next.seatNumber;

      if (next.leaveRequested) {
        this.fold(next);
        continue;
      }
      return;
    }
  }

  /** SRS-17.1-17.6: burn one, then deal the next street's community cards. */
  private dealNextStreet() {
    this.street = STREET_ORDER[STREET_ORDER.indexOf(this.street as Street) + 1] as Street;
    this.drawCard();
    const count = this.street === 'flop' ? 3 : 1;
    for (let i = 0; i < count; i++) this.board.push(this.drawCard());
  }

  /** SRS-17.8: deal every remaining street, with burns, and no betting rounds. */
  private runOutBoard() {
    while (this.street !== 'river') this.dealNextStreet();
  }

  /** SRS-18.2/18.7/18.8: a fresh round; action starts after the button. */
  private startNextStreet() {
    this.dealNextStreet();
    this.lastAggressorSeat = null;
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.seats.forEach((seat) => {
      seat.hasActed = false;
      seat.actedSinceFullRaise = false;
      seat.canRaise = true;
      seat.lastAction = null;
    });
    this.activeSeat = this.dealerSeat;
  }

  /**
   * End of a betting round: return any uncalled part of the biggest bet
   * (SRS-19.5), then everyone's round contributions count as collected —
   * buildPots() splits them into pots from each seat's totalBet.
   */
  private collectBets() {
    const roundBets = [
      ...this.seats.map((seat) => seat.bet),
      ...this.deadRoundBets,
    ].sort((a, b) => b - a);
    const [largest = 0, nextLargest = 0] = roundBets;

    if (largest > nextLargest) {
      const top = this.seats.find((seat) => seat.bet === largest);
      if (top) {
        const uncalled = largest - nextLargest;
        top.bet -= uncalled;
        top.totalBet -= uncalled;
        top.chipStack = (top.chipStack ?? 0) + uncalled;
        if (top.allIn && top.chipStack > 0) top.allIn = false;
      }
    }

    this.seats.forEach((seat) => {
      seat.bet = 0;
    });
    this.deadRoundBets = [];
    this.currentBet = 0;
  }

  /**
   * SRS-19.1-19.4: layers the collected chips into a main pot and side
   * pots, one per distinct all-in amount. Each pot is open to the in-hand
   * players who put in at least its full layer; chips from folded players
   * (and players who left) fill the pots but can't win them.
   */
  private buildPots(): Pot[] {
    const contributions = [
      ...this.seats
        .filter((seat) => seat.totalBet - seat.bet > 0)
        .map((seat) => ({ amount: seat.totalBet - seat.bet, seat })),
      ...this.deadContributions.map((amount) => ({ amount, seat: null })),
    ];
    if (contributions.length === 0) return [];

    const allInLevels = contributions
      .filter(({ seat }) => seat?.inHand && seat.allIn)
      .map(({ amount }) => amount);
    const top = Math.max(...contributions.map(({ amount }) => amount));
    const levels = [...new Set([...allInLevels, top])].sort((a, b) => a - b);

    const pots: Pot[] = [];
    let previous = 0;
    for (const level of levels) {
      const amount = contributions.reduce(
        (sum, contribution) => sum + Math.min(contribution.amount, level) - Math.min(contribution.amount, previous),
        0
      );
      const eligibleSeats = contributions
        .filter(({ seat, amount: contributed }) => seat?.inHand && contributed >= level)
        .map(({ seat }) => (seat as SeatRecord).seatNumber);

      const last = pots[pots.length - 1];
      if (amount > 0 && eligibleSeats.length === 0 && last) {
        // Nobody still in the hand reached this layer — fold it into the pot below.
        last.amount += amount;
      } else if (amount > 0) {
        pots.push({ amount, eligibleSeats });
      }
      previous = level;
    }
    return pots;
  }

  /**
   * Ends the hand: returns any uncalled bet and collects the round
   * (SRS-19.5, also for a round cut short by SRS-18.6), awards the pots,
   * removes anyone who asked to leave during it (SRS-21.3), and goes back to
   * waiting — the caller's next updateCountdown() starts another countdown
   * if enough players are still seated with chips.
   */
  private finishHand(reason: 'fold' | 'showdown', ranOut = false) {
    this.collectBets();
    const pots = this.buildPots();
    const awards = new Map<SeatRecord, number>();
    const award = (seat: SeatRecord, amount: number) => awards.set(seat, (awards.get(seat) ?? 0) + amount);
    const dealer = this.dealerSeat as number;
    const clockwiseFromButton = (seatNumber: number) => (seatNumber - dealer - 1 + this.maxSeats) % this.maxSeats;
    const hands = new Map<SeatRecord, { score: HandScore; name: string }>();
    let shown: HandResult['shown'] = [];

    if (reason === 'fold') {
      // SRS-17.7: the last player in the hand takes every pot, unseen.
      const winner = this.seats.find((seat) => seat.inHand) as SeatRecord;
      award(winner, pots.reduce((sum, pot) => sum + pot.amount, 0));
    } else {
      const inHand = this.seats.filter((seat) => seat.inHand);
      inHand.forEach((seat) => hands.set(seat, evaluateHand([...seat.holeCards, ...this.board])));

      // SRS-5.6/5.7/5.8: each pot to the best hand(s) among its eligible
      // players, ties split in whole chips with odd chips going one at a
      // time clockwise from the button.
      for (const pot of pots) {
        const contenders = pot.eligibleSeats.map((seatNumber) => this.seats[seatNumber - 1] as SeatRecord);
        const bestScore = contenders
          .map((seat) => (hands.get(seat) as { score: HandScore }).score)
          .reduce((best, score) => (compareScores(score, best) > 0 ? score : best));
        const winners = contenders
          .filter((seat) => compareScores((hands.get(seat) as { score: HandScore }).score, bestScore) === 0)
          .sort((a, b) => clockwiseFromButton(a.seatNumber) - clockwiseFromButton(b.seatNumber));
        const share = Math.floor(pot.amount / winners.length);
        const oddChips = pot.amount - share * winners.length;
        winners.forEach((seat, index) => award(seat, share + (index < oddChips ? 1 : 0)));
      }

      // SRS-6.5: the last bettor/raiser in the final round shows first;
      // otherwise the first player in the hand clockwise of the button. Then
      // clockwise from there.
      const first =
        this.lastAggressorSeat !== null && (this.seats[this.lastAggressorSeat - 1] as SeatRecord).inHand
          ? this.lastAggressorSeat
          : (inHand.slice().sort((a, b) => clockwiseFromButton(a.seatNumber) - clockwiseFromButton(b.seatNumber))[0] as SeatRecord)
              .seatNumber;
      shown = inHand
        .slice()
        .sort(
          (a, b) =>
            ((a.seatNumber - first + this.maxSeats) % this.maxSeats) -
            ((b.seatNumber - first + this.maxSeats) % this.maxSeats)
        )
        .map((seat) => ({
          seatNumber: seat.seatNumber,
          playerId: seat.playerId as string,
          username: seat.username,
          cards: seat.holeCards.slice(),
          handName: (hands.get(seat) as { name: string }).name,
        }));
    }

    awards.forEach((amount, seat) => {
      seat.chipStack = (seat.chipStack ?? 0) + amount;
    });
    this.lastHandResult = {
      handNumber: this.handNumber,
      reason,
      board: this.board.slice(),
      ranOut,
      shown,
      awards: [...awards].map(([seat, amount]) => ({
        seatNumber: seat.seatNumber,
        username: seat.username,
        amount,
        handName: hands.get(seat)?.name ?? null,
      })),
    };

    this.seats.forEach((seat) => {
      if (seat.leaveRequested && seat.playerId !== null) {
        this.pendingRemovals.push({ playerId: seat.playerId, chipStack: seat.chipStack ?? 0 });
        Object.assign(seat, emptySeat(seat.seatNumber));
      } else {
        resetHandFields(seat);
      }
    });

    this.phase = 'waiting';
    this.street = null;
    this.deck = [];
    this.board = [];
    this.activeSeat = null;
    this.lastAggressorSeat = null;
    this.smallBlindSeat = null;
    this.bigBlindSeat = null;
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.deadContributions = [];
    this.deadRoundBets = [];
  }

  /**
   * Players removed when a hand ended because they asked to leave during it
   * (SRS-21.3), since the last call. The caller refunds each chipStack to
   * the player's balance. Call after anything that can end a hand: act(),
   * leave(), and startHand().
   */
  drainRemovals(): Removal[] {
    const removals = this.pendingRemovals;
    this.pendingRemovals = [];
    return removals;
  }

  /**
   * SRS-1.1: occupy the chosen open seat, or the first open seat when
   * `seatNumber` is omitted; SRS-1.4: reject when no seats are open.
   */
  join(
    playerId: string,
    username: string,
    chipStack: number,
    avatarUrl: string | null = null,
    seatNumber?: number
  ): JoinResult {
    const trimmedUsername = username.trim();

    if (!trimmedUsername) {
      return { ok: false, error: 'A username is required to join the table.' };
    }

    if (!Number.isInteger(chipStack) || chipStack <= 0) {
      return { ok: false, error: 'A valid buy-in amount is required to join the table.' };
    }

    const existingSeat = this.findSeatByPlayerId(playerId);
    if (existingSeat) {
      return {
        ok: false,
        error: 'You are already seated at this table.',
        seatNumber: existingSeat.seatNumber,
      };
    }

    const openSeat = this.seats.find((seat) => seat.playerId === null);
    if (!openSeat) {
      return { ok: false, error: 'This table is full.' };
    }

    if (seatNumber !== undefined) {
      const seatError = this.checkSeat(seatNumber);
      if (seatError) return { ok: false, error: seatError };
    }
    const seat = seatNumber === undefined ? openSeat : (this.seats[seatNumber - 1] as SeatRecord);

    // A fresh seat: sitting down mid-hand waits for the next one (SRS-20.6).
    // SRS-11.3: a new player owes no blinds, but the button won't land on
    // them before their first hand (SRS-13.2, newcomersInButtonPath()).
    Object.assign(seat, emptySeat(seat.seatNumber), {
      playerId,
      username: trimmedUsername,
      avatarUrl,
      chipStack,
      newcomer: this.dealerSeat !== null,
    });

    return { ok: true, seatNumber: seat.seatNumber };
  }

  /**
   * SRS-21.1: remove a seated player who isn't in the current hand right
   * away and return their stack to refund. A player still in the hand
   * (SRS-21.2/21.3) is folded as soon as it's their turn — immediately if it
   * already is — and removed when the hand ends; the result is `pending`.
   */
  leave(playerId: string): LeaveResult {
    const seat = this.findSeatByPlayerId(playerId);
    if (!seat) {
      return { ok: false, error: 'You are not seated at this table.' };
    }

    if (this.phase === 'in-hand' && seat.inHand) {
      if (!seat.leaveRequested) {
        seat.leaveRequested = true;
        if (seat.seatNumber === this.activeSeat) {
          this.fold(seat);
          this.advance();
        }
      }
      return { ok: true, pending: true, seatNumber: seat.seatNumber };
    }

    // Leaving after folding: what they put in stays in the pot as dead money.
    if (this.phase === 'in-hand' && seat.totalBet > 0) {
      this.deadContributions.push(seat.totalBet);
      this.deadRoundBets.push(seat.bet);
    }

    const seatNumber = seat.seatNumber;
    const chipStack = seat.chipStack ?? 0;
    Object.assign(seat, emptySeat(seatNumber));

    return { ok: true, seatNumber, chipStack };
  }

  /**
   * Why this player can't buy back in right now, or null if they can. Lets
   * the server refuse before taking the buy-in from their balance; rebuy()
   * re-checks it regardless.
   */
  checkRebuy(playerId: string): string | null {
    const seat = this.findSeatByPlayerId(playerId);
    if (!seat) return 'You are not seated at this table.';
    if (!isBustedSeat(seat)) return 'You can only buy back in once you are out of chips.';
    return null;
  }

  /**
   * SRS-12.4/12.5: a busted player buys back in, keeping their seat. The
   * caller has already validated the amount (SRS-12.6/12.7) and taken it
   * from their balance. With chips again they're no longer busted, so
   * they're dealt into the next hand (SRS-12.9) — not the one in progress,
   * if any.
   */
  rebuy(playerId: string, chipStack: number): ActionResult {
    if (!Number.isInteger(chipStack) || chipStack <= 0) {
      return { ok: false, error: 'A valid buy-in amount is required.' };
    }
    const error = this.checkRebuy(playerId);
    if (error) return { ok: false, error };

    const seat = this.findSeatByPlayerId(playerId) as SeatRecord;
    seat.chipStack = chipStack;
    seat.bustedAt = null;
    return { ok: true };
  }

  /**
   * SRS-11.6: a player who owes blinds elects to post them and be dealt into
   * the next hand (`post` true), or goes back to waiting for the big blind
   * (`post` false). Refused when they have no chips or owe nothing, or under
   * SRS-11.9 when the button or a blind would reach their seat next hand —
   * then they wait (and if it's the big blind, they're dealt in anyway). A
   * newcomer the button is about to skip may always post both blinds, or
   * (`post` false) sit that hand out. Re-checked at hand start, and used for
   * that one hand only.
   */
  setPostMissedBlinds(playerId: string, post: boolean): ActionResult {
    const seat = this.findSeatByPlayerId(playerId);
    if (!seat) return { ok: false, error: 'You are not seated at this table.' };
    if (!post) {
      seat.postingMissedBlinds = false;
      return { ok: true };
    }
    if (this.newcomersInButtonPath().includes(seat)) {
      seat.postingMissedBlinds = true;
      return { ok: true };
    }
    if (!seat.missedSmallBlind && !seat.missedBigBlind) return { ok: false, error: "You don't owe any blinds." };
    if (!this.isEligible(seat)) return { ok: false, error: 'You need chips to post the blinds. Buy back in first.' };
    if (this.postingBlockedFor(seat)) {
      return {
        ok: false,
        error:
          "You can't post while the button or a blind is about to reach your seat. You'll be dealt in when the big blind gets to you.",
      };
    }
    seat.postingMissedBlinds = true;
    return { ok: true };
  }

  /**
   * SRS-12.10: starts each newly busted player's decision clock at `now`,
   * and stops it for anyone no longer busted. The caller calls this after
   * every change (a hand ending is what busts players), then schedules a
   * timer for nextBustedDeadline().
   */
  trackBusted(now: number): void {
    for (const seat of this.seats) {
      if (!isBustedSeat(seat)) seat.bustedAt = null;
      else if (seat.bustedAt === null) seat.bustedAt = now;
    }
  }

  /** When the next busted player runs out of time, or null if nobody is busted. */
  nextBustedDeadline(): number | null {
    const deadlines = this.seats
      .filter((seat) => seat.bustedAt !== null)
      .map((seat) => (seat.bustedAt as number) + BUSTED_DECISION_TIMEOUT_MS);
    return deadlines.length > 0 ? Math.min(...deadlines) : null;
  }

  /**
   * SRS-12.10: removes busted players whose time ran out by `now` and
   * returns their player ids. They have no chips and aren't in a hand, so
   * there is nothing to refund and no hand to disturb.
   */
  removeTimedOutBusted(now: number): string[] {
    const removed: string[] = [];
    for (const seat of this.seats) {
      if (seat.bustedAt === null || !isBustedSeat(seat)) continue;
      if (seat.bustedAt + BUSTED_DECISION_TIMEOUT_MS > now) continue;
      removed.push(seat.playerId as string);
      Object.assign(seat, emptySeat(seat.seatNumber));
    }
    return removed;
  }
}
