'use client';

import { useId, type CSSProperties } from 'react';

// SRS-101.13: playing cards and poker chips falling slowly behind the sign-up
// form, in three depths (far ones small, faint and slow), each swaying and
// turning as it falls; chips tilt like a coin catching the light and a few
// cards turn over now and then. The `drift-*` keyframes are in
// app/globals.css; with reduced motion they're paused, so every piece holds
// still wherever its negative delay put it. Everything is fixed here rather
// than random, so the server's HTML and the browser's first render match.

type ChipColor = 'red' | 'blue' | 'green' | 'orange' | 'black';

type Piece = {
  kind: 'card' | 'chip';
  left: number; // % across the page
  depth: 0 | 1 | 2; // 0 far, 2 near
  fall: number; // seconds per trip down the page
  delay: number; // seconds into its trip when the page opens
  sway: number; // px either side
  turn: number; // degrees turned per trip
  face?: string; // a card's rank and suit, e.g. 'A♠'
  back?: boolean; // a card shown back up
  flip?: boolean; // a card that turns over now and then
  color?: ChipColor;
};

const PIECES: Piece[] = [
  // Far
  { kind: 'card', face: 'A♠', left: 5, depth: 0, fall: 56, delay: 8, sway: 18, turn: 140 },
  { kind: 'chip', color: 'blue', left: 31, depth: 0, fall: 60, delay: 41, sway: 22, turn: -90 },
  { kind: 'card', back: true, left: 63, depth: 0, fall: 52, delay: 30, sway: 16, turn: -160 },
  { kind: 'chip', color: 'green', left: 91, depth: 0, fall: 58, delay: 15, sway: 20, turn: 80 },
  { kind: 'chip', color: 'black', left: 52, depth: 0, fall: 57, delay: 50, sway: 18, turn: 70 },
  // Middle
  { kind: 'card', face: 'K♥', flip: true, left: 13, depth: 1, fall: 40, delay: 27, sway: 30, turn: -200 },
  { kind: 'chip', color: 'red', left: 47, depth: 1, fall: 44, delay: 5, sway: 34, turn: 120 },
  { kind: 'card', face: '7♦', left: 79, depth: 1, fall: 38, delay: 21, sway: 28, turn: 180 },
  { kind: 'chip', color: 'black', left: 22, depth: 1, fall: 42, delay: 36, sway: 26, turn: -110 },
  { kind: 'card', face: '10♣', flip: true, left: 94, depth: 1, fall: 36, delay: 3, sway: 24, turn: -150 },
  { kind: 'card', face: 'A♥', flip: true, left: 88, depth: 1, fall: 39, delay: 33, sway: 26, turn: 160 },
  // Near
  { kind: 'chip', color: 'blue', left: 12, depth: 2, fall: 29, delay: 9, sway: 34, turn: -120 },
  { kind: 'chip', color: 'orange', left: 3, depth: 2, fall: 30, delay: 19, sway: 40, turn: 100 },
  { kind: 'card', face: 'Q♣', flip: true, left: 86, depth: 2, fall: 28, delay: 11, sway: 44, turn: 220 },
  { kind: 'chip', color: 'red', left: 70, depth: 2, fall: 32, delay: 25, sway: 36, turn: -130 },
  { kind: 'card', face: 'J♦', left: 38, depth: 2, fall: 26, delay: 2, sway: 38, turn: -190 },
];

// How each depth looks: size (card width / chip diameter), how clearly it shows, blur.
const DEPTH = [
  { card: 40, chip: 30, opacity: 0.3, blur: 1.5 },
  { card: 56, chip: 42, opacity: 0.5, blur: 0 },
  { card: 72, chip: 54, opacity: 0.7, blur: 0 },
] as const;

const CHIP_COLORS: Record<ChipColor, { body: string; center: string; spots: string; value: string }> = {
  red: { body: '#dc2626', center: '#b91c1c', spots: '#f8fafc', value: '5' },
  blue: { body: '#2563eb', center: '#1d4ed8', spots: '#f8fafc', value: '10' },
  green: { body: '#16a34a', center: '#15803d', spots: '#f8fafc', value: '25' },
  orange: { body: '#ea580c', center: '#c2410c', spots: '#f8fafc', value: '50' },
  black: { body: '#1f2937', center: '#111827', spots: '#fbbf24', value: '100' },
};

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
            <Chip color={piece.color ?? 'red'} size={width} />
          </div>
        ) : piece.flip ? (
          <div className="drift-flip relative" style={{ width, height: width * 1.4 }}>
            <div className="drift-face absolute inset-0">
              <CardFace face={piece.face ?? 'A♠'} width={width} />
            </div>
            <div className="drift-face drift-face-back absolute inset-0">
              <CardBack width={width} />
            </div>
          </div>
        ) : (
          <div className="drift-tilt">
            {piece.back ? <CardBack width={width} /> : <CardFace face={piece.face ?? 'A♠'} width={width} />}
          </div>
        )}
      </div>
    </div>
  );
}

function CardFace({ face, width }: { face: string; width: number }) {
  const suit = face.slice(-1);
  const rank = face.slice(0, -1);
  const color = suit === '♥' || suit === '♦' ? '#dc2626' : '#0f172a';
  return (
    <svg viewBox="0 0 50 70" width={width} height={width * 1.4} className="block drop-shadow-lg">
      <rect x="0.5" y="0.5" width="49" height="69" rx="5" fill="#f8fafc" stroke="#cbd5e1" />
      <g fill={color} fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700">
        <text x="5" y="13" fontSize="11">{rank}</text>
        <text x="5" y="22" fontSize="9">{suit}</text>
        <text x="25" y="44" fontSize="24" textAnchor="middle">{suit}</text>
        <g transform="rotate(180 25 35)">
          <text x="5" y="13" fontSize="11">{rank}</text>
          <text x="5" y="22" fontSize="9">{suit}</text>
        </g>
      </g>
    </svg>
  );
}

function CardBack({ width }: { width: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 50 70" width={width} height={width * 1.4} className="block drop-shadow-lg">
      <defs>
        <pattern id={`lattice-${id}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0H6M0 0V6" stroke="#fca5a5" strokeOpacity="0.35" strokeWidth="1" />
        </pattern>
      </defs>
      <rect x="0.5" y="0.5" width="49" height="69" rx="5" fill="#991b1b" stroke="#f8fafc" strokeOpacity="0.7" />
      <rect x="4" y="4" width="42" height="62" rx="3" fill={`url(#lattice-${id})`} stroke="#fde68a" strokeOpacity="0.6" />
      <circle cx="25" cy="35" r="8" fill="#7f1d1d" stroke="#fde68a" strokeOpacity="0.7" />
      <text x="25" y="39.5" fontSize="12" textAnchor="middle" fill="#fde68a">♠</text>
    </svg>
  );
}

function Chip({ color, size }: { color: ChipColor; size: number }) {
  const c = CHIP_COLORS[color];
  return (
    <svg viewBox="0 0 60 60" width={size} height={size} className="block drop-shadow-lg">
      <circle cx="30" cy="30" r="29" fill={c.body} />
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x="26.5" y="1" width="7" height="9" rx="1.5" fill={c.spots} transform={`rotate(${i * 45} 30 30)`} />
      ))}
      <circle cx="30" cy="30" r="19" fill="none" stroke={c.spots} strokeOpacity="0.8" strokeWidth="1.5" strokeDasharray="3 3" />
      <circle cx="30" cy="30" r="15" fill={c.center} />
      <text x="30" y="34.5" fontSize="12" fontWeight="700" textAnchor="middle" fill={c.spots} fontFamily="ui-sans-serif, system-ui, sans-serif">
        {c.value}
      </text>
    </svg>
  );
}
