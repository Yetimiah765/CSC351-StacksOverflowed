'use client';

import type { CSSProperties } from 'react';
import { CardFace, chipColors, type ChipColor } from './CasinoPieces';
import { at, Bubble, display, Headline, Place, SANS, SceneDefs, SlideIn, TurnOver, useSvgId } from './sceneParts';

// The login page's header (SRS-103.10): one continuous animation, with no
// camera, of a won poker hand. We sit at the table holding K♠ K♥; the
// opponent has already shown four eights. The river comes face down and
// turns over the K♣, the four kings light up, and the pot's chips arc across
// the felt one at a time onto three towers while a counter adds up the win.
// Then it rests, with sparkles and a sheen across the towers now and then.
//
// Everything is CSS (the `moment-*` keyframes in app/globals.css), so it
// starts with the page's first paint, and every move rests at its end state:
// with reduced motion the hand shows won and the towers built. None of its
// cards, its one card back (red) or its chip colours (red, green, black) is
// among the falling pieces behind the page (CardsAndChipsBackground), so
// nothing is on screen twice apart from the header's own piles and stacks.

const W = 880;
const H = 280;
const PACE = 1.1;

const CARD_W = 46;
const BOARD_X = [309, 363, 417, 471, 525];
const BOARD_Y = 22;
const BOARD = ['K♦', '8♣', '8♥', '3♠'];
const RIVER = 'K♣';
const KINGS_AT = 1.65;

// Chips are drawn in three-quarter view: a top ellipse over a curved rim.
const CHIP_W = 46;
const CHIP_RY = 9.5;
const CHIP_T = 5.6;

const TOWER_BASE = 220;
const TOWERS: { x: number; color: ChipColor }[] = [
  { x: 672, color: 'green' },
  { x: 732, color: 'black' },
  { x: 792, color: 'red' },
];

// The pot: stacks of one to three chips, back row first (the order they're
// drawn in), each chip bottom first. A stack never holds two chips for the
// same tower, so a stack's chips can leave top first while the towers still
// fill bottom first in the order they're drawn.
const POT: { x: number; y: number; chips: ChipColor[] }[] = [
  { x: 356, y: 166, chips: ['red', 'black', 'green'] },
  { x: 397, y: 164, chips: ['green', 'black'] },
  { x: 430, y: 167, chips: ['black', 'red', 'green'] },
  { x: 471, y: 165, chips: ['black'] },
  { x: 505, y: 168, chips: ['green', 'red', 'black'] },
  { x: 548, y: 166, chips: ['black', 'green'] },
  { x: 337, y: 183, chips: ['black', 'green', 'red'] },
  { x: 374, y: 181, chips: ['black'] },
  { x: 413, y: 184, chips: ['red', 'green', 'black'] },
  { x: 450, y: 182, chips: ['green', 'black', 'red'] },
  { x: 487, y: 180, chips: ['green', 'black'] },
  { x: 527, y: 183, chips: ['black', 'red', 'green'] },
  { x: 565, y: 181, chips: ['black'] },
  { x: 352, y: 197, chips: ['green', 'red', 'black'] },
  { x: 391, y: 199, chips: ['black'] },
  { x: 427, y: 198, chips: ['red', 'black', 'green'] },
  { x: 466, y: 200, chips: ['black', 'green'] },
  { x: 505, y: 197, chips: ['black', 'green', 'red'] },
  { x: 543, y: 198, chips: ['black'] },
  { x: 581, y: 199, chips: ['green', 'black', 'red'] },
];

const FLIGHTS_AT = 2.6;

type Flight = { color: ChipColor; dx: number; dy: number; peak: number; x: number; y: number; launch: number; dur: number };

// Every chip's trip from the pot to its tower. Chips leave the pot back row
// first, each stack from the top, faster and faster like a dealer pushing a
// pot; each lands on top of its tower.
const FLIGHTS: Flight[] = (() => {
  const level = TOWERS.map(() => 0);
  let launch = FLIGHTS_AT;
  let n = 0;
  return POT.flatMap((stack) => {
    const leaving = stack.chips.map((color, k) => ({ color, k })).reverse().map(({ color, k }) => {
      const tower = TOWERS.findIndex((t) => t.color === color);
      const slot = level[tower]++;
      const x = TOWERS[tower].x;
      const y = TOWER_BASE - slot * CHIP_T;
      const dx = stack.x - x;
      const dy = stack.y - k * CHIP_T - y;
      const flight = {
        color, x, y, dx, dy, launch,
        dur: 0.42 + Math.abs(dx) / 1500,
        peak: Math.min(dy, 0) - 22 - (n % 3) * 5,
      };
      launch += Math.max(0.045, 0.13 - n * 0.002);
      n++;
      return flight;
    });
    return leaving.reverse();
  });
})();

const LANDED = [...FLIGHTS].sort((a, b) => a.launch + a.dur - (b.launch + b.dur));
const DONE_AT = LANDED[LANDED.length - 1].launch + LANDED[LANDED.length - 1].dur;
const POT_EMPTY_AT = Math.max(...FLIGHTS.map((f) => f.launch));
const valueOf = (color: ChipColor) => Number(chipColors(color).value);
const POT_TOTAL = FLIGHTS.reduce((sum, f) => sum + valueOf(f.color), 0);

// The counter's readings: after the first chip lands, then each quarter.
const COUNTS = [1, Math.round(LANDED.length / 4), Math.round(LANDED.length / 2), Math.round((LANDED.length * 3) / 4), LANDED.length].map((n) => ({
  at: LANDED[n - 1].launch + LANDED[n - 1].dur,
  value: LANDED.slice(0, n).reduce((sum, f) => sum + valueOf(f.color), 0),
}));

// When the first chip lands on each tower (its shadow shows then).
const FIRST_LANDING = TOWERS.map((tower) => Math.min(...FLIGHTS.filter((f) => f.color === tower.color).map((f) => f.launch + f.dur)));

// A four-point sparkle.
const STAR = 'M 0 -6 L 1.4 -1.4 L 6 0 L 1.4 1.4 L 0 6 L -1.4 1.4 L -6 0 L -1.4 -1.4 Z';

const TOWER_TOPS = TOWERS.map((tower) => TOWER_BASE - (FLIGHTS.filter((f) => f.color === tower.color).length - 1) * CHIP_T);

export default function PokerWinHeader() {
  const id = useSvgId();
  const tallest = Math.min(...TOWER_TOPS);
  return (
    <div
      aria-hidden="true"
      className={`${display.className} relative aspect-[880/280] w-full overflow-hidden bg-slate-950`}
      style={{ '--pace': String(PACE) } as CSSProperties}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="moment-scene absolute inset-0 h-full w-full" style={{ '--moment-delay': '0.3s' } as CSSProperties}>
        <SceneDefs id={id} />
        <defs>
          <radialGradient id={`${id}-felt`} cx="0.55" cy="0.45" r="0.75">
            <stop offset="0" stopColor="#1f9d55" />
            <stop offset="0.6" stopColor="#11683a" />
            <stop offset="1" stopColor="#063b20" />
          </radialGradient>
          <pattern id={`${id}-weave`} width="4" height="4" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.6" fill="#ffffff" opacity="0.06" />
          </pattern>
          <linearGradient id={`${id}-leather`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4a2412" />
            <stop offset="0.35" stopColor="#2b140a" />
            <stop offset="1" stopColor="#120804" />
          </linearGradient>
          <linearGradient id={`${id}-wood`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d97706" />
            <stop offset="1" stopColor="#7c2d12" />
          </linearGradient>
          {/* Round shading across a chip's rim: dark at the sides, a highlight left of middle. */}
          <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#000000" stopOpacity="0.5" />
            <stop offset="0.25" stopColor="#000000" stopOpacity="0.08" />
            <stop offset="0.42" stopColor="#ffffff" stopOpacity="0.22" />
            <stop offset="0.75" stopColor="#000000" stopOpacity="0.12" />
            <stop offset="1" stopColor="#000000" stopOpacity="0.5" />
          </linearGradient>
          <radialGradient id={`${id}-shadow`}>
            <stop offset="0" stopColor="#000000" stopOpacity="0.45" />
            <stop offset="1" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}-vignette`} cx="0.5" cy="0.45" r="0.75">
            <stop offset="0.6" stopColor="#000000" stopOpacity="0" />
            <stop offset="1" stopColor="#000000" stopOpacity="0.55" />
          </radialGradient>
          <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.3" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          {/* The finished towers, which the sheen is kept inside. */}
          <clipPath id={`${id}-towers`}>
            {TOWERS.map((tower, i) => (
              <rect key={tower.color} x={tower.x - CHIP_W / 2} y={TOWER_TOPS[i] - CHIP_RY} width={CHIP_W} height={TOWER_BASE - TOWER_TOPS[i] + CHIP_T + 2 * CHIP_RY} rx={CHIP_W / 2} ry={CHIP_RY} />
            ))}
          </clipPath>
        </defs>

        {/* The felt under an overhead lamp. */}
        <rect width={W} height={H} fill={`url(#${id}-felt)`} />
        <rect width={W} height={H} fill={`url(#${id}-weave)`} />
        <ellipse cx={560} cy={120} rx={380} ry={170} fill={`url(#${id}-light)`} opacity="0.35" />
        <path d="M 40 214 Q 440 246 840 214" fill="none" stroke="#fde68a" strokeOpacity="0.28" strokeDasharray="6 5" />

        {/* The near rail: a wooden racetrack, then padded leather with its stitching. */}
        <path d="M 0 229 Q 440 253 880 229 L 880 280 L 0 280 Z" fill={`url(#${id}-wood)`} />
        <path d="M 0 238 Q 440 262 880 238 L 880 280 L 0 280 Z" fill={`url(#${id}-leather)`} />
        <path d="M 0 238 Q 440 262 880 238" fill="none" stroke="#a16207" strokeOpacity="0.55" strokeWidth="1.5" />
        <path d="M 0 247 Q 440 271 880 247" fill="none" stroke="#d6a35a" strokeOpacity="0.4" strokeDasharray="4 3" />

        {/* The opponent's four eights, beaten once the kings light up. */}
        <Place x={70} y={20} r={-7}>
          <CardFace flat face="8♠" width={38} />
          <rect className="moment-in" style={at(KINGS_AT + 0.2)} width={38} height={53.2} rx={4} fill="#020617" fillOpacity="0.5" />
        </Place>
        <Place x={108} y={24} r={5}>
          <CardFace flat face="8♦" width={38} />
          <rect className="moment-in" style={at(KINGS_AT + 0.2)} width={38} height={53.2} rx={4} fill="#020617" fillOpacity="0.5" />
        </Place>
        <Bubble x={108} y={98} text="FOUR EIGHTS" t={0.3} size={10} fill="#1e293b" />

        {/* The board: the river comes face down and turns over the K♣. */}
        {BOARD.map((face, i) => (
          <Place key={face} x={BOARD_X[i]} y={BOARD_Y}>
            <CardFace flat face={face} width={CARD_W} />
          </Place>
        ))}
        <SlideIn x={BOARD_X[4]} y={BOARD_Y} from={[440, -90]} t={0.7} spin={0}>
          <TurnOver x={0} y={0} w={CARD_W} face={RIVER} t={1.25} />
        </SlideIn>
        <KingGlow x={BOARD_X[0]} y={BOARD_Y} w={CARD_W} />
        <KingGlow x={BOARD_X[4]} y={BOARD_Y} w={CARD_W} />

        {/* Our hand by the rail. */}
        <Place x={150} y={150} r={-8}>
          <CardFace flat face="K♠" width={54} />
          <KingGlow x={0} y={0} w={54} />
        </Place>
        <Place x={198} y={154} r={6}>
          <CardFace flat face="K♥" width={54} />
          <KingGlow x={0} y={0} w={54} />
        </Place>

        <circle cx={600} cy={124} r={11} fill="#f8fafc" stroke="#94a3b8" />
        <text x={600} y={128} textAnchor="middle" fontSize={11} fontWeight={900} fill="#0f172a" fontFamily={SANS}>D</text>

        {/* The felt's printed ring of suits, under the pot until it's pushed. */}
        <g opacity="0.22">
          <ellipse cx={458} cy={186} rx={128} ry={30} fill="none" stroke="#fde68a" strokeWidth="1.5" />
          <ellipse cx={458} cy={186} rx={116} ry={24} fill="none" stroke="#fde68a" strokeDasharray="5 4" />
          {[['♠', 330], ['♥', 412], ['♦', 504], ['♣', 586]].map(([suit, x]) => (
            <text key={suit} x={x} y={192} textAnchor="middle" fontSize={16} fill="#fde68a" fontFamily="Georgia, serif">{suit}</text>
          ))}
        </g>

        {/* Shadows under the pot (gone once it's pushed) and under each tower. */}
        <g className="moment-out" style={at(POT_EMPTY_AT + 0.2)}>
          <ellipse cx={458} cy={192} rx={150} ry={36} fill={`url(#${id}-shadow)`} />
          <text x={458} y={228} textAnchor="middle" fontSize={11} fontWeight={800} letterSpacing={1.5} fill="#fde68a" fillOpacity="0.8" fontFamily={SANS}>
            POT {POT_TOTAL.toLocaleString('en-US')}
          </text>
        </g>
        {TOWERS.map((tower, i) => (
          <ellipse key={tower.color} className="moment-in" style={at(FIRST_LANDING[i])} cx={tower.x + 3} cy={TOWER_BASE + CHIP_T + 3} rx={30} ry={10} fill={`url(#${id}-shadow)`} />
        ))}

        {/* Every chip, drawn in the pot until its turn, then arcing onto its
            tower and settling with a small bounce. */}
        {FLIGHTS.map((f, i) => (
          <g key={i} transform={`translate(${f.x} ${f.y})`}>
            <g className="moment-fly-x" style={at(f.launch, { '--dx': `${f.dx}px`, '--dur': `${f.dur}s` })}>
              <g className="moment-fly-y" style={at(f.launch, { '--dy': `${f.dy}px`, '--peak': `${f.peak}px`, '--dur': `${f.dur}s` })}>
                <g className="moment-settle" style={at(f.launch + f.dur)}>
                  <Chip3D id={id} color={f.color} />
                </g>
              </g>
            </g>
          </g>
        ))}

        <Headline id={id} x={440} y={130} size={34} t={KINGS_AT + 0.1}>FOUR KINGS!</Headline>

        {/* A sheen across the finished towers every few seconds. */}
        <g clipPath={`url(#${id}-towers)`}>
          <polygon
            className="moment-sweep"
            style={{ animationDelay: `${(DONE_AT + 0.6) * PACE + 0.3}s` }}
            points={`570,${tallest - 20} 610,${tallest - 20} 580,${TOWER_BASE + 30} 540,${TOWER_BASE + 30}`}
            fill={`url(#${id}-sheen)`}
          />
        </g>

        {/* The winnings, counted up as the chips land. */}
        <Place x={TOWERS[1].x} y={58}>
          <g className="moment-pop" style={at(COUNTS[0].at)}>
            <rect x={-62} y={-17} width={124} height={34} rx={17} fill="#0f172a" fillOpacity="0.92" stroke="#fbbf24" strokeOpacity="0.7" strokeWidth="1.5" />
          </g>
          {COUNTS.map((c, i) => {
            const reading = (
              <g className="moment-pop" style={at(c.at, { '--ds': i === COUNTS.length - 1 ? '0.4' : '0.8', '--dur': '0.3s' })}>
                <text y={7} textAnchor="middle" fontSize={i === COUNTS.length - 1 ? 21 : 19} fontWeight={700} letterSpacing={1} fill={`url(#${id}-gold)`} stroke="#78350f" strokeWidth="0.8" paintOrder="stroke" style={{ fontFamily: 'inherit' }}>
                  +{c.value.toLocaleString('en-US')}
                </text>
              </g>
            );
            return i === COUNTS.length - 1 ? <g key={i}>{reading}</g> : <g key={i} className="moment-out" style={at(COUNTS[i + 1].at - 0.12)}>{reading}</g>;
          })}
        </Place>

        {/* Sparkles: a burst when the last chip lands, then a twinkle now and then. */}
        {[
          [TOWERS[0].x - 6, tallest + 16], [TOWERS[1].x - 18, tallest - 10], [TOWERS[1].x + 20, tallest - 2], [TOWERS[2].x + 16, tallest + 34],
          [TOWERS[0].x - 22, 44], [TOWERS[2].x + 24, 48], [TOWERS[1].x + 6, 26], [TOWERS[0].x + 14, 82],
        ].map(([x, y], i) => (
          <g key={i}>
            <path className="moment-sparkle moment-sparkle-burst" style={at(DONE_AT + (i % 4) * 0.07)} transform={`translate(${x} ${y})`} d={STAR} fill="#ffffff" />
            <path className="moment-sparkle" style={{ animationDelay: `${(DONE_AT + 1) * PACE + 0.3 + i * 0.53}s` }} transform={`translate(${x + 7} ${y + 5}) scale(0.7)`} d={STAR} fill="#fef3c7" />
          </g>
        ))}

        <rect width={W} height={H} fill={`url(#${id}-vignette)`} pointerEvents="none" />
      </svg>
    </div>
  );
}

// Gold outline around one of the four kings, lit when the river turns.
function KingGlow({ x, y, w }: { x: number; y: number; w: number }) {
  const h = w * 1.4;
  return (
    <Place x={x} y={y}>
      <g className="moment-in" style={at(KINGS_AT, { '--ds': '1.15' })}>
        <rect x={-4} y={-4} width={w + 8} height={h + 8} rx={7} fill="none" stroke="#fbbf24" strokeOpacity="0.3" strokeWidth={7} />
        <rect x={-2} y={-2} width={w + 4} height={h + 4} rx={6} fill="none" stroke="#fcd34d" strokeWidth={2.5} />
      </g>
    </Place>
  );
}

// One chip in three-quarter view, its top face centred on (0, 0): the curved
// rim with its edge spots and round shading, then the face with its ring of
// spots, inlay and value.
function Chip3D({ id, color }: { id: string; color: ChipColor }) {
  const c = chipColors(color);
  const r = CHIP_W / 2;
  const rim = `M ${-r} 0 A ${r} ${CHIP_RY} 0 0 0 ${r} 0 L ${r} ${CHIP_T} A ${r} ${CHIP_RY} 0 0 1 ${-r} ${CHIP_T} Z`;
  return (
    <g>
      <path d={rim} fill={c.body} />
      {[-0.36, -0.12, 0.12, 0.36].map((f) => {
        const across = Math.sqrt(1 - 4 * f * f);
        return <rect key={f} x={f * CHIP_W - 2.4 * across} y={CHIP_RY * across + 0.6} width={4.8 * across} height={CHIP_T - 1.2} fill={c.spots} opacity="0.9" />;
      })}
      <path d={rim} fill={`url(#${id}-rim)`} />
      <ellipse rx={r} ry={CHIP_RY} fill={c.body} stroke="#000000" strokeOpacity="0.25" strokeWidth="0.6" />
      <ellipse rx={r - 2.5} ry={CHIP_RY - 1.1} fill="none" stroke={c.spots} strokeWidth="2.2" strokeDasharray="3.2 3.6" opacity="0.9" />
      <ellipse rx={r * 0.58} ry={CHIP_RY * 0.58} fill={c.center} stroke={c.spots} strokeOpacity="0.6" strokeWidth="0.6" />
      <g transform={`scale(1 ${CHIP_RY / r})`}>
        <text y={3.5} textAnchor="middle" fontSize={10} fontWeight={800} fill={c.ink} fontFamily={SANS}>{c.value}</text>
      </g>
      <ellipse cx={-r * 0.25} cy={-CHIP_RY * 0.3} rx={r * 0.45} ry={CHIP_RY * 0.4} fill="#ffffff" opacity="0.1" />
    </g>
  );
}
