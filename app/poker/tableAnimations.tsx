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
