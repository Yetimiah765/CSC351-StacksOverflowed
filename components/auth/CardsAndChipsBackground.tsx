'use client';

import { type CSSProperties } from 'react';
import { CardBack, CardFace, Chip, type BackColor, type ChipColor } from './CasinoPieces';

// SRS-101.13: the sign-up page's background. In front of two slow glows,
// playing cards and poker chips fall slowly in three depths (far ones small,
// faint and slow), each swaying and turning as it falls; chips tilt like a
// coin catching the light and a few cards turn over now and then. No card
// face, chip or card back here appears twice, or in the header's scenes
// (CasinoMoments). The
// `drift-*` keyframes are in app/globals.css; with reduced motion they're
// paused, so every piece holds still wherever its negative delay put it.
// Everything is fixed here rather than random, so the server's HTML and the
// browser's first render match.

type Piece = {
  kind: 'card' | 'chip';
  left: number; // % across the page
  depth: 0 | 1 | 2; // 0 far, 2 near
  fall: number; // seconds per trip down the page
  delay: number; // seconds into its trip when the page opens
  sway: number; // px either side
  turn: number; // degrees turned per trip
  face?: string; // a card's rank and suit, e.g. 'A♠'
  back?: BackColor; // a card shown back up, or the back of one that turns over
  flip?: boolean; // a card that turns over now and then
  color?: ChipColor;
};

const PIECES: Piece[] = [
  // Far
  { kind: 'card', face: '9♠', left: 5, depth: 0, fall: 56, delay: 8, sway: 18, turn: 140 },
  { kind: 'chip', color: 'blue', left: 31, depth: 0, fall: 60, delay: 41, sway: 22, turn: -90 },
  { kind: 'card', back: 'teal', left: 63, depth: 0, fall: 52, delay: 30, sway: 16, turn: -160 },
  { kind: 'chip', color: 'teal', left: 91, depth: 0, fall: 58, delay: 15, sway: 20, turn: 80 },
  { kind: 'chip', color: 'purple', left: 52, depth: 0, fall: 57, delay: 50, sway: 18, turn: 70 },
  // Middle
  { kind: 'card', face: 'Q♥', back: 'navy', flip: true, left: 13, depth: 1, fall: 40, delay: 27, sway: 30, turn: -200 },
  { kind: 'chip', color: 'orange', left: 47, depth: 1, fall: 44, delay: 5, sway: 34, turn: 120 },
  { kind: 'card', face: '7♦', left: 79, depth: 1, fall: 38, delay: 21, sway: 28, turn: 180 },
  { kind: 'chip', color: 'gold', left: 22, depth: 1, fall: 42, delay: 36, sway: 26, turn: -110 },
  { kind: 'card', face: '10♣', back: 'purple', flip: true, left: 94, depth: 1, fall: 36, delay: 3, sway: 24, turn: -150 },
  { kind: 'card', face: 'A♥', back: 'green', flip: true, left: 88, depth: 1, fall: 39, delay: 33, sway: 26, turn: 160 },
  // Near
  { kind: 'chip', color: 'white', left: 12, depth: 2, fall: 29, delay: 9, sway: 34, turn: -120 },
  { kind: 'chip', color: 'pink', left: 3, depth: 2, fall: 30, delay: 19, sway: 40, turn: 100 },
  { kind: 'card', face: 'Q♣', back: 'black', flip: true, left: 86, depth: 2, fall: 28, delay: 11, sway: 44, turn: 220 },
  { kind: 'card', face: 'J♦', left: 38, depth: 2, fall: 26, delay: 2, sway: 38, turn: -190 },
];

// How each depth looks: size (card width / chip diameter), how clearly it shows, blur.
const DEPTH = [
  { card: 40, chip: 30, opacity: 0.3, blur: 1.5 },
  { card: 56, chip: 42, opacity: 0.5, blur: 0 },
  { card: 72, chip: 54, opacity: 0.7, blur: 0 },
] as const;

export default function CardsAndChipsBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="drift-glow absolute -left-40 top-1/4 h-[30rem] w-[30rem] rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="drift-glow absolute -right-32 bottom-[-6rem] h-[26rem] w-[26rem] rounded-full bg-amber-400/10 blur-3xl [animation-delay:-13s]" />
      {PIECES.map((piece, index) => (
        <FallingPiece key={index} piece={piece} />
      ))}
    </div>
  );
}

function FallingPiece({ piece }: { piece: Piece }) {
  const look = DEPTH[piece.depth];
  const width = piece.kind === 'card' ? look.card : look.chip;
  const vars = {
    left: `${piece.left}%`,
    opacity: look.opacity,
    filter: look.blur ? `blur(${look.blur}px)` : undefined,
    '--fall': `${piece.fall}s`,
    // A negative delay starts the piece partway down, so the page opens full.
    '--delay': `-${piece.delay}s`,
    '--turn': `${piece.turn}deg`,
    '--sway': `${piece.sway}px`,
    '--sway-time': `${6 + (piece.delay % 5)}s`,
    '--tilt-time': `${4 + (piece.fall % 4)}s`,
    '--flip-time': `${11 + (piece.delay % 6)}s`,
  } as CSSProperties;

  return (
    <div className="drift-fall absolute top-0" style={vars}>
      <div className="drift-sway">
        {piece.kind === 'chip' ? (
          <div className="drift-tilt">
            <Chip color={piece.color ?? 'blue'} size={width} />
          </div>
        ) : piece.flip ? (
          <div className="drift-flip relative" style={{ width, height: width * 1.4 }}>
            <div className="drift-face absolute inset-0">
              <CardFace face={piece.face ?? 'A♠'} width={width} />
            </div>
            <div className="drift-face drift-face-back absolute inset-0">
              <CardBack width={width} color={piece.back} />
            </div>
          </div>
        ) : (
          <div className="drift-tilt">
            {piece.face ? <CardFace face={piece.face} width={width} /> : <CardBack width={width} color={piece.back} />}
          </div>
        )}
      </div>
    </div>
  );
}
