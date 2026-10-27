'use client';

import { useEffect, useState, type CSSProperties, type RefObject } from 'react';
import { PlayingCard } from './pokerUi';

// The dealer's side of the table animations (app/poker/[tableId]/page.tsx):
// a deck to the left of the board that gathers the last hand's cards and
// riffle-shuffles at the start of each hand, and a muck pile to the right
// that collects folded hands. Cards are dealt from the deck and folded into
// the muck, so the page needs both positions in pixels — measured from the
// table, since flight paths are CSS transforms. On a narrow table there's no
// room beside the board, so both sit (unseen) in the middle.

/** How long the gather + shuffle runs before the first card leaves the deck. */
export const SHUFFLE_MS = 1300;
/** Time between consecutive hole cards in the deal. */
export const DEAL_STAGGER_MS = 90;
/** Board cards are 40px wide (PlayingCard md) with a 6px gap. */
const BOARD_CARD_PITCH = 46;
const WIDE_TABLE_PX = 560;

const DECK_POS = { left: 26, top: 50 };
const MUCK_POS = { left: 74, top: 50 };

export const cssVars = (vars: Record<string, string>) => vars as CSSProperties;

export function useElementSize(ref: RefObject<HTMLElement>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

export interface TableGeometry {
  /** Room for the deck and muck beside the board. */
  wide: boolean;
  deck: { x: number; y: number };
  muck: { x: number; y: number };
  /** Where a seat's hole cards sit, in pixels from the table's top left. */
  seatCards: (left: number, top: number) => { x: number; y: number };
  /** Offset from board slot `index` back to the deck. */
  boardFromDeck: (index: number) => { x: number; y: number };
}

export function tableGeometry({ width, height }: { width: number; height: number }): TableGeometry {
  const wide = width >= WIDE_TABLE_PX;
  const at = (pos: { left: number; top: number }) =>
    wide ? { x: (pos.left / 100) * width, y: (pos.top / 100) * height } : { x: width / 2, y: height / 2 };
  const deck = at(DECK_POS);
  return {
    wide,
    deck,
    muck: at(MUCK_POS),
    // Hole cards hang off the top right of the seat's photo.
    seatCards: (left, top) => ({ x: (left / 100) * width + 24, y: (top / 100) * height - 22 }),
    // The board row sits a little above the middle of the table.
    boardFromDeck: (index) => ({ x: deck.x - (width / 2 + (index - 2) * BOARD_CARD_PITCH), y: deck.y - (height / 2 - 8) }),
  };
}

/** A pixel offset as the CSS variables an animation reads. */
export const offsetVars = (prefix: string, offset: { x: number; y: number }) => ({
  [`--${prefix}-x`]: `${Math.round(offset.x)}px`,
  [`--${prefix}-y`]: `${Math.round(offset.y)}px`,
});

const STACK = [0, 1, 2, 3, 4, 5];

/**
 * The deck. Re-keyed per hand: the previous hand's cards fly in from the
 * muck and the board, then it riffle-shuffles twice.
 */
export function DeckStack({ geometry, handNumber }: { geometry: TableGeometry; handNumber: number }) {
  if (!geometry.wide) return null;
  const fromMuck = { x: geometry.muck.x - geometry.deck.x, y: geometry.muck.y - geometry.deck.y };
  const fromBoard = { x: (geometry.muck.x + geometry.deck.x) / 2 - geometry.deck.x, y: -8 };
  return (
    <div
      key={handNumber}
      aria-hidden="true"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
      style={{ left: geometry.deck.x, top: geometry.deck.y }}
    >
      <div className="relative h-14 w-10">
        {/* The last hand's cards being gathered in. */}
        {handNumber > 0
          ? [fromMuck, fromBoard, fromMuck, fromBoard].map((from, index) => (
              <span
                key={`gather-${index}`}
                className="poker-gather absolute inset-0"
                style={cssVars({ ...offsetVars('from', from), '--delay': `${index * 70}ms` })}
              >
                <PlayingCard />
              </span>
            ))
          : null}
        {STACK.map((index) => (
          <span
            key={index}
            className={`poker-deck-card absolute inset-0 ${handNumber > 0 ? (index % 2 === 0 ? 'poker-riffle-left' : 'poker-riffle-right') : ''}`}
            style={cssVars({ '--stack': `${-index}px`, '--delay': `${450 + index * 20}ms` })}
          >
            <PlayingCard />
          </span>
        ))}
      </div>
    </div>
  );
}

// Fixed tilts, so the pile looks tossed but doesn't change between renders.
const MUCK_TILTS = [-14, 9, -4, 17, -20, 6, 12, -9];

/** The folded cards collected so far this hand. */
export function MuckPile({ geometry, count }: { geometry: TableGeometry; count: number }) {
  if (!geometry.wide || count === 0) return null;
  const shown = Math.min(count, MUCK_TILTS.length);
  return (
    <div
      aria-label={`${count} folded cards`}
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
      style={{ left: geometry.muck.x, top: geometry.muck.y }}
    >
      <div className="relative h-9 w-[26px]">
        {MUCK_TILTS.slice(0, shown).map((tilt, index) => (
          <span
            key={index}
            className="absolute inset-0"
            style={{ transform: `rotate(${tilt}deg) translate(${(index % 3) - 1}px, ${-index}px)` }}
          >
            {/* The newest card lands once its flight from the seat (poker-muck) arrives. */}
            <span className="poker-muck-land block">
              <PlayingCard size="sm" />
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------- Cards landing with an impact ----------
// Board cards and showdown hands rise, flip over and slam down; at the moment
// they land (IMPACT_AT of the way through) the page shakes the table and an
// ImpactBurst goes off. One timeline drives both the CSS delays and the
// shakes, so they line up.

/** Fraction of a slam animation at which the card hits the felt. */
export const IMPACT_AT = 0.72;

export interface Slam {
  /** When this card's animation starts, in ms. */
  delay: number;
  /** How long it takes. */
  duration: number;
  /** How hard it lands: 1 (a showdown card) to 3 (the river). */
  power: 1 | 2 | 3;
}

export const impactTime = (slam: Slam) => slam.delay + slam.duration * IMPACT_AT;

/** A table shake (and, for the river, a flash) at `at` ms. */
export interface Hit {
  at: number;
  strength: number;
  flash?: boolean;
}

const STREET_OF = (index: number) => (index < 3 ? 0 : index - 2); // flop 0, turn 1, river 2
const SLAM_MS = [1000, 1150, 1400];
const FLOP_STAGGER_MS = 220;
const STREET_GAP_MS = 1500;
const QUAKE = [5, 7, 11];

/** A board card dealt during the hand: the flop one after another, the turn and river alone. */
export function boardSlam(index: number): Slam {
  const street = STREET_OF(index);
  return { delay: street === 0 ? index * FLOP_STAGGER_MS : 0, duration: SLAM_MS[street] ?? 1000, power: (street + 1) as 1 | 2 | 3 };
}

export function boardHits(fromIndex: number, toIndex: number): Hit[] {
  const hits: Hit[] = [];
  for (let index = fromIndex; index < toIndex; index++) {
    const street = STREET_OF(index);
    hits.push({ at: impactTime(boardSlam(index)), strength: QUAKE[street] ?? 5, flash: street === 2 });
  }
  return hits;
}

const REVEAL_STAGGER_MS = 600;
const REVEAL_CARD_STAGGER_MS = 120;
const REVEAL_MS = 900;

export interface ShowdownTimeline {
  /** Hand `handIndex` (in reveal order), card `cardIndex`. */
  reveal: (handIndex: number, cardIndex: number) => Slam;
  /** Board cards dealt after the hand ended (an all-in run-out), or null for the ones already out. */
  runout: (index: number) => Slam | null;
  /** When the pot starts moving to the winners. */
  winnerStart: number;
  hits: Hit[];
}

/**
 * The end of a hand, in order: each shown hand slams down one after another
 * (winners hardest), then any board an all-in left undealt runs out street
 * by street, then the pot goes to the winners. `boardBefore` is how many
 * board cards were out before the hand ended.
 */
export function showdownTimeline(
  result: { reason: 'fold' | 'showdown'; ranOut: boolean; board: unknown[]; shown: { seatNumber: number }[]; awards: { seatNumber: number }[] },
  boardBefore: number
): ShowdownTimeline {
  const winners = new Set(result.awards.map((award) => award.seatNumber));
  const reveal = (handIndex: number, cardIndex: number): Slam => ({
    delay: handIndex * REVEAL_STAGGER_MS + cardIndex * REVEAL_CARD_STAGGER_MS,
    duration: REVEAL_MS,
    power: 1,
  });
  const hits: Hit[] = result.shown.map((hand, handIndex) => ({
    at: impactTime(reveal(handIndex, 1)),
    strength: winners.has(hand.seatNumber) ? 9 : 4,
  }));
  const revealEnd = result.shown.length ? impactTime(reveal(result.shown.length - 1, 1)) + 300 : 0;

  // Run-out: whichever streets weren't dealt yet, each STREET_GAP_MS apart.
  const runFrom = result.ranOut ? Math.min(boardBefore, result.board.length) : result.board.length;
  const firstStreet = runFrom < result.board.length ? STREET_OF(runFrom) : 0;
  const runoutStart = revealEnd + 300;
  const runout = (index: number): Slam | null => {
    if (index < runFrom) return null;
    const street = STREET_OF(index);
    const streetStart = runoutStart + (street - firstStreet) * STREET_GAP_MS;
    const within = street === 0 ? (index - Math.max(runFrom, 0)) * FLOP_STAGGER_MS : 0;
    return { delay: streetStart + within, duration: SLAM_MS[street] ?? 1000, power: (street + 1) as 1 | 2 | 3 };
  };
  let runoutEnd = 0;
  for (let index = runFrom; index < result.board.length; index++) {
    const slam = runout(index) as Slam;
    const street = STREET_OF(index);
    hits.push({ at: impactTime(slam), strength: QUAKE[street] ?? 5, flash: street === 2 });
    runoutEnd = Math.max(runoutEnd, impactTime(slam) + 400);
  }

  return {
    reveal,
    runout,
    winnerStart: result.reason === 'showdown' ? Math.max(revealEnd, runoutEnd) + 200 : 0,
    hits,
  };
}

/** CSS variables for a slam: its timing, and how high and big it lifts. */
export const slamVars = (slam: Slam) => ({
  '--delay': `${Math.round(slam.delay)}ms`,
  '--slam-ms': `${slam.duration}ms`,
  '--lift': `${[-50, -80, -120][slam.power - 1]}px`,
  '--lift-scale': `${[1.5, 1.75, 2.2][slam.power - 1]}`,
});

/** The card's back, covering its face until it flips over mid-slam. */
export function CardBackCover({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <span aria-hidden="true" className="poker-back-cover pointer-events-none absolute inset-0">
      <PlayingCard size={size} />
    </span>
  );
}

const SPARK_ANGLES = [0, 36, 72, 108, 144, 180, 216, 252, 288, 324];

/**
 * What goes off where a card lands: a shockwave ring (two, for the bigger
 * hits), sparks flying out and a puff of dust. Starts at `at` ms.
 */
export function ImpactBurst({ at, power, gold = false }: { at: number; power: 1 | 2 | 3; gold?: boolean }) {
  const ring = [2.4, 3.2, 4.6][power - 1] as number;
  const spark = [26, 40, 64][power - 1] as number;
  const color = gold ? '253, 224, 71' : '255, 255, 255';
  return (
    <span
      aria-hidden="true"
      // Behind the card (the slam is its own stacking context), so it bursts out from under it.
      className="pointer-events-none absolute inset-0 -z-10"
      style={cssVars({ '--impact': `${Math.round(at)}ms`, '--ring': `${ring}`, '--spark': `${spark}px`, '--burst': color })}
    >
      <span className="poker-impact-dust absolute left-1/2 top-1/2 h-16 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full" />
      <span className="poker-impact-ring absolute left-1/2 top-1/2 -ml-5 -mt-5 h-10 w-10 rounded-full" />
      {power > 1 ? <span className="poker-impact-ring poker-impact-ring-late absolute left-1/2 top-1/2 -ml-5 -mt-5 h-10 w-10 rounded-full" /> : null}
      {SPARK_ANGLES.map((angle) => (
        <span
          key={angle}
          className="poker-impact-spark absolute left-1/2 top-1/2 -ml-[1.5px] h-3 w-[3px] rounded-full"
          style={cssVars({ '--angle': `${angle + (power === 3 ? 18 : 0)}deg` })}
        />
      ))}
    </span>
  );
}
