'use client';

import { Oswald } from 'next/font/google';
import { useEffect, useId, useState, type CSSProperties, type ComponentType, type ReactNode } from 'react';
import { CardBack, CardFace, Chip, chipColors, type ChipColor } from './CasinoPieces';

const display = Oswald({ weight: ['700'], subsets: ['latin'], display: 'swap' });

// SRS-101.13: the sign-up box's header, a wide banner where scenes from the
// site's games play one after another and lead into each other like a
// cinema ad: the camera pushes into one thing until it fills the frame, then
// pulls back out of the same thing in the next scene. Poker's A♠ becomes
// blackjack's A♠, the blackjack bet chip becomes the chip on roulette's 17,
// the roulette ball becomes the football, the stadium's jumbotron becomes the
// sportsbook's live-score panel, the payout coin becomes a coin in the slot
// tray, and the slot reel becomes the poker table's 10♠. Each pair is drawn
// the same (or is the same plain colour where the camera stops), so the
// frame never cuts. Every scene is one SVG drawn on an 880 x 300 canvas that
// scales to the banner. The falling cards and chips behind the page use none
// of these cards or chips. The `moment-*` keyframes are in app/globals.css;
// each scene is keyed by its step so its animations play from the start, and
// every move rests at its end state, so with reduced motion (animations off,
// no cycling) the first scene shows finished and still.

const W = 880;
const H = 300;

// A scene takes over every STEP_MS. The camera pushes into its exit over
// EXIT_MS, reaching full depth 85% of the way and holding there; the next
// scene fades in during that hold at ENTER_AT_MS (both frames filled by the
// same thing at the same depth, and fully in before the old scene stops
// being drawn) and pulls back over ENTER_MS. Its own action then starts, at
// PACE (1 = as the `at` times say; higher is slower).
const PACE = 1.4;
const STEP_MS = 10900;
const EXIT_MS = 1900;
const ENTER_AT_MS = 1630;
const ENTER_MS = 2000;
const ACTION_AT = (ENTER_AT_MS + ENTER_MS * 0.85) / 1000;

// Where the camera pushes in or pulls out from, on the canvas, and how far.
type Focus = { x: number; y: number; k: number };
type Scene = { label: string; Draw: ComponentType; enter: Focus; exit: Focus };

// The points the transitions use, shared with the drawings below.
const BJ_ACE = { x: 398, y: 176 }; // blackjack A♠ (40 wide)
const BJ_CHIP = { x: 440, y: 262 }; // the blackjack bet, a 44px red chip
const RL_CHIP = { x: 595, y: 111 }; // the same chip on roulette's 17
const RL_BALL = { x: 170, y: 57 }; // where the roulette ball comes to rest
const FB_BALL = { x: 322, y: 228 }; // the football at the striker's feet
const JUMBOTRON = { x: 330, y: 4 }; // a 220 x 56 score panel
const LIVE_SCORE = { x: 40, y: 30 }; // the same panel on the bet slip
const SLIP_COIN = { x: 346, y: 252 }; // the payout coin (28px)
const TRAY_COIN = { x: 440, y: 280 }; // the same coin in the slot tray
const REEL_WHITE = { x: 414, y: 135 }; // plain white on the middle reel
const PK_BOARD = { x: 305, y: 98 }; // the poker board's first card, the 10♠ (50 wide)
const PK_ACE = { x: 398, y: 210 }; // the poker hero's A♠ (40 wide)

const SCENES: Scene[] = [
  {
    label: 'Blackjack', Draw: BlackjackScene,
    enter: { x: BJ_ACE.x + 12, y: BJ_ACE.y + 48, k: 80 },
    exit: { x: BJ_CHIP.x, y: BJ_CHIP.y, k: 80 },
  },
  {
    label: 'Roulette', Draw: RouletteScene,
    enter: { x: RL_CHIP.x, y: RL_CHIP.y, k: 80 },
    exit: { x: RL_BALL.x, y: RL_BALL.y, k: 100 },
  },
  {
    label: 'Sports', Draw: GoalScene,
    enter: { x: FB_BALL.x, y: FB_BALL.y, k: 100 },
    exit: { x: JUMBOTRON.x + 110, y: JUMBOTRON.y + 50, k: 80 },
  },
  {
    label: 'Sports', Draw: BetSlipScene,
    enter: { x: LIVE_SCORE.x + 110, y: LIVE_SCORE.y + 50, k: 80 },
    exit: { x: SLIP_COIN.x, y: SLIP_COIN.y, k: 80 },
  },
  {
    label: 'Slots', Draw: SlotsScene,
    enter: { x: TRAY_COIN.x, y: TRAY_COIN.y, k: 80 },
    exit: { x: REEL_WHITE.x, y: REEL_WHITE.y, k: 100 },
  },
  {
    label: 'Poker', Draw: PokerScene,
    enter: { x: PK_BOARD.x + 8, y: PK_BOARD.y + 35, k: 100 },
    exit: { x: PK_ACE.x + 12, y: PK_ACE.y + 48, k: 80 },
  },
];

// Inline style for one move: when it starts (seconds into the scene's action)
// plus any of its CSS variables (--dx, --dy, --dr, --ds, --dur, ...).
function at(seconds: number, vars: Record<string, string> = {}): CSSProperties {
  return { '--at': `${seconds}s`, ...vars } as CSSProperties;
}

// The camera move for a focus: the point stays put while the frame scales
// around it and drifts until it's centred; --k1..--k step the scale evenly.
function zoomVars({ x, y, k }: Focus): CSSProperties {
  const fx = (x / W) * 100;
  const fy = (y / H) * 100;
  return {
    transformOrigin: `${fx}% ${fy}%`,
    '--tx': `${50 - fx}%`,
    '--ty': `${50 - fy}%`,
    '--k1': `${k ** 0.25}`,
    '--k2': `${k ** 0.5}`,
    '--k3': `${k ** 0.75}`,
    '--k': `${k}`,
  } as CSSProperties;
}

export default function CasinoMoments() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setStep((s) => s + 1), STEP_MS);
    return () => window.clearInterval(timer);
  }, []);

  // The scene coming in, and the one before it that the camera is pushing into.
  const steps = step === 0 ? [0] : [step - 1, step];
  const { label } = SCENES[step % SCENES.length];
  return (
    <div
      aria-hidden="true"
      className={`${display.className} relative aspect-[880/300] w-full overflow-hidden bg-slate-950`}
      style={{ '--pace': String(PACE) } as CSSProperties}
    >
      {steps.map((n) => (
        <SceneLayer key={n} step={n} />
      ))}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_45%,transparent_62%,rgba(0,0,0,0.5))]" />
      <span
        key={step}
        className="moment-in absolute bottom-2 left-3 rounded-full bg-black/60 px-2.5 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-white/85"
        style={at(step === 0 ? 0.2 : ACTION_AT / PACE)}
      >
        {label}
      </span>
    </div>
  );
}

// One scene: it pulls back out of its entry (inner layer) and, STEP_MS after
// it took over, the camera pushes into its exit (outer layer).
function SceneLayer({ step }: { step: number }) {
  const scene = SCENES[step % SCENES.length];
  const first = step === 0;
  const outer = { ...zoomVars(scene.exit), '--exit-at': `${STEP_MS}ms`, '--exit-ms': `${EXIT_MS}ms` } as CSSProperties;
  const inner = {
    ...zoomVars(scene.enter),
    // The first scene is already in place when the page opens.
    '--enter-at': first ? `-${ENTER_MS}ms` : `${ENTER_AT_MS}ms`,
    '--enter-ms': `${ENTER_MS}ms`,
    '--moment-delay': first ? '0.3s' : `${ACTION_AT}s`,
  } as CSSProperties;
  const { Draw } = scene;
  return (
    <div className="moment-exit absolute inset-0" style={outer}>
      <div className="moment-enter absolute inset-0" style={inner}>
        <svg viewBox={`0 0 ${W} ${H}`} className="moment-scene absolute inset-0 h-full w-full">
          <Draw />
        </svg>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drawing helpers (SVG, canvas units).

function useSvgId() {
  return useId().replace(/:/g, '');
}

function Place({ x, y, r, s, children }: { x: number; y: number; r?: number; s?: number; children: ReactNode }) {
  return <g transform={`translate(${x} ${y})${r ? ` rotate(${r})` : ''}${s ? ` scale(${s})` : ''}`}>{children}</g>;
}

// Something dealt or slid in from `from` to (x, y), arriving at `t`.
function SlideIn({ x, y, r, from, t, spin = -25, children }: { x: number; y: number; r?: number; from: [number, number]; t: number; spin?: number; children: ReactNode }) {
  return (
    <Place x={x} y={y} r={r}>
      <g className="moment-in" style={at(t, { '--dx': `${from[0] - x}px`, '--dy': `${from[1] - y}px`, '--dr': `${spin}deg`, '--ds': '0.55', '--dur': '0.4s' })}>
        {children}
      </g>
    </Place>
  );
}

// A card turned over at `t`: its back folds away, then its face opens.
function TurnOver({ x, y, w, face, t }: { x: number; y: number; w: number; face: string; t: number }) {
  return (
    <Place x={x} y={y}>
      <g className="moment-flip-away" style={at(t)}>
        <CardBack width={w} />
      </g>
      <g className="moment-flip-show" style={at(t)}>
        <CardFace face={face} width={w} />
      </g>
    </Place>
  );
}

function SceneDefs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fffbeb" />
        <stop offset="0.45" stopColor="#fcd34d" />
        <stop offset="1" stopColor="#d97706" />
      </linearGradient>
      <filter id={`${id}-glow`} x="-30%" y="-80%" width="160%" height="260%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="b" />
        <feFlood floodColor="#fbbf24" floodOpacity="0.7" />
        <feComposite in2="b" operator="in" result="g" />
        <feMerge>
          <feMergeNode in="g" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id={`${id}-blur`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="16" />
      </filter>
    </defs>
  );
}

// Big gold lettering that pops in at `t` (BLACKJACK!, GOAL!, ...), and fades
// at `until` if it would be in the way of the camera's push into the next scene.
function Headline({ id, x, y, size, t, ds, until, children }: { id: string; x: number; y: number; size: number; t: number; ds?: number; until?: number; children: ReactNode }) {
  const lettering = (
    <g className="moment-pop" style={at(t, ds ? { '--ds': String(ds) } : {})}>
      <text
        textAnchor="middle"
        fontSize={size}
        fontWeight={700}
        letterSpacing={size * 0.04}
        fill={`url(#${id}-gold)`}
        stroke="#78350f"
        strokeWidth={size * 0.07}
        paintOrder="stroke"
        filter={`url(#${id}-glow)`}
        style={{ fontFamily: 'inherit' }}
      >
        {children}
      </text>
    </g>
  );
  return (
    <Place x={x} y={y}>
      {until === undefined ? lettering : <g className="moment-out" style={at(until)}>{lettering}</g>}
    </Place>
  );
}

const SANS = 'ui-sans-serif, system-ui, sans-serif';

// A small rounded label (hand totals, names), popping in at `t` if given.
function Bubble({ x, y, text, t, fill = '#0f172a', ink = '#f8fafc', size = 12, out }: { x: number; y: number; text: string; t?: number; fill?: string; ink?: string; size?: number; out?: number }) {
  const w = Math.max(24, text.length * size * 0.62 + 14);
  const body = (
    <g>
      <rect x={-w / 2} y={-size} width={w} height={size * 1.7} rx={size * 0.85} fill={fill} stroke="#ffffff" strokeOpacity="0.25" />
      <text y={size * 0.33} textAnchor="middle" fontSize={size} fontWeight={800} fill={ink} fontFamily={SANS}>
        {text}
      </text>
    </g>
  );
  const shown = t === undefined ? body : <g className="moment-pop" style={at(t)}>{body}</g>;
  return <Place x={x} y={y}>{out === undefined ? shown : <g className="moment-out" style={at(out)}>{shown}</g>}</Place>;
}

// Chips seen side on, bottom first.
function ChipStack({ x, y, colors, w = 30 }: { x: number; y: number; colors: ChipColor[]; w?: number }) {
  const top = chipColors(colors[colors.length - 1]);
  return (
    <Place x={x} y={y}>
      {colors.map((color, i) => {
        const c = chipColors(color);
        return (
          <g key={i} transform={`translate(0 ${-i * 4.5})`}>
            <rect x={-w / 2} y={-2.5} width={w} height={6} rx={3} fill="#000" opacity="0.35" />
            <rect x={-w / 2} y={-4.5} width={w} height={6} rx={3} fill={c.body} />
            {[-0.32, 0, 0.32].map((f) => (
              <rect key={f} x={f * w - 2} y={-4.2} width={4} height={5.4} rx={1} fill={c.spots} opacity="0.9" />
            ))}
          </g>
        );
      })}
      <ellipse cy={-colors.length * 4.5 - 0.5} rx={w / 2} ry={w * 0.16} fill={top.body} stroke={top.spots} strokeWidth="1.2" strokeDasharray="2.5 2.5" />
    </Place>
  );
}

// A gold coin seen from above.
function GoldCoin({ x, y, size }: { x: number; y: number; size: number }) {
  const id = useSvgId();
  const r = size / 2;
  return (
    <Place x={x} y={y}>
      <defs>
        <radialGradient id={`${id}-coin`} cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#fef08a" />
          <stop offset="0.6" stopColor="#facc15" />
          <stop offset="1" stopColor="#ca8a04" />
        </radialGradient>
      </defs>
      <circle cx={r} cy={r} r={r} fill={`url(#${id}-coin)`} stroke="#a16207" strokeWidth={size * 0.05} />
      <circle cx={r} cy={r} r={r * 0.72} fill="none" stroke="#a16207" strokeWidth={size * 0.04} strokeOpacity="0.7" />
      <path
        transform={`translate(${r} ${r}) scale(${size / 60})`}
        d="M0 -14 L4 -4.5 L14 -4.3 L6 2.2 L8.8 12 L0 6.3 L-8.8 12 L-6 2.2 L-14 -4.3 L-4 -4.5 Z"
        fill="#a16207"
        opacity="0.85"
      />
    </Place>
  );
}

// A 220 x 56 score panel: a label, the score, and a plain dark strip along
// the bottom (where the camera stops between the stadium and the bet slip).
function ScorePanel({ x, y, label, children }: { x: number; y: number; label: string; children: ReactNode }) {
  return (
    <Place x={x} y={y}>
      <rect width={220} height={56} rx={8} fill="#0b1120" stroke="#334155" strokeWidth="2" />
      <text x={110} y={14} textAnchor="middle" fontSize={9} fontWeight={700} letterSpacing={2} fill="#94a3b8" fontFamily={SANS}>
        {label}
      </text>
      {children}
    </Place>
  );
}

// ---------------------------------------------------------------------------
// Blackjack: five seats dealt from the shoe; seat four hits to 21, the dealer
// turns over 17, and you have blackjack: paid 3 to 2, losing bets swept.

type BjSeat = { x: number; y: number; cards: string[]; total: string; bet: ChipColor[]; loses?: boolean };

const BJ_SEATS: BjSeat[] = [
  { x: 120, y: 219, cards: ['10♥', '6♦'], total: '16', bet: ['green', 'black', 'green'], loses: true },
  { x: 280, y: 253, cards: ['8♠', '8♦'], total: '16', bet: ['black', 'green'], loses: true },
  { x: 600, y: 253, cards: ['5♣', '9♦'], total: '14', bet: ['red', 'black', 'red', 'black'] },
  { x: 760, y: 219, cards: ['K♣', '3♥'], total: '13', bet: ['black', 'red'], loses: true },
];

function BlackjackScene() {
  const id = useSvgId();
  const shoe: [number, number] = [612, 34];
  const rack: [number, number] = [440, 26];
  const rackColors: ChipColor[] = ['red', 'black', 'green', 'red', 'black', 'green', 'red', 'black'];
  return (
    <g>
      <SceneDefs id={id} />
      <defs>
        <radialGradient id={`${id}-felt`} cx="0.5" cy="0.25" r="0.85">
          <stop offset="0" stopColor="#1f9d55" />
          <stop offset="0.55" stopColor="#11683a" />
          <stop offset="1" stopColor="#063b20" />
        </radialGradient>
        <pattern id={`${id}-weave`} width="4" height="4" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.6" fill="#ffffff" opacity="0.06" />
        </pattern>
        <path id={`${id}-arc1`} d="M 210 100 Q 440 180 670 100" />
        <path id={`${id}-arc2`} d="M 188 123 Q 440 214 692 123" />
      </defs>
      <rect width={W} height={H} fill={`url(#${id}-felt)`} />
      <rect width={W} height={H} fill={`url(#${id}-weave)`} />
      <rect width={W} height={9} fill="#3f1d0b" />
      <rect y={8} width={W} height={2} fill="#a16207" opacity="0.6" />

      {/* The printed felt. */}
      <text fontSize={17} fontWeight={700} letterSpacing={3} fill="#fde68a" fillOpacity="0.55" style={{ fontFamily: 'inherit' }}>
        <textPath href={`#${id}-arc1`} startOffset="50%" textAnchor="middle">BLACKJACK PAYS 3 TO 2</textPath>
      </text>
      <path d="M 190 116 Q 440 206 690 116" fill="none" stroke="#fde68a" strokeOpacity="0.4" />
      <path d="M 186 132 Q 440 224 694 132" fill="none" stroke="#fde68a" strokeOpacity="0.4" />
      <text fontSize={9} fontWeight={700} letterSpacing={2} fill="#fde68a" fillOpacity="0.5" fontFamily={SANS}>
        <textPath href={`#${id}-arc2`} startOffset="50%" textAnchor="middle">INSURANCE PAYS 2 TO 1</textPath>
      </text>

      {/* Dealer's chip rack, discard holder and shoe. */}
      <Place x={340} y={12}>
        <rect width={200} height={30} rx={5} fill="#0f172a" stroke="#475569" />
        {rackColors.map((color, i) => {
          const c = chipColors(color);
          return (
            <g key={i} transform={`translate(${8 + i * 24} 4)`}>
              <rect width={20} height={22} rx={3} fill={c.body} />
              {[3, 8, 13, 18].map((yy) => (
                <rect key={yy} x={0} y={yy} width={20} height={1.2} fill={c.spots} opacity="0.55" />
              ))}
            </g>
          );
        })}
      </Place>
      <Place x={250} y={14}>
        <rect width={46} height={34} rx={4} fill="#ffffff" fillOpacity="0.06" stroke="#ffffff" strokeOpacity="0.3" />
        {[6, 10, 14, 18, 22, 26].map((yy) => (
          <rect key={yy} x={5} y={yy} width={36} height={2} rx={1} fill="#e2e8f0" opacity="0.5" />
        ))}
      </Place>
      <Place x={580} y={12}>
        <path d="M0 8 L52 0 L64 6 L64 34 L0 34 Z" fill="#7f1d1d" stroke="#450a0a" />
        <path d="M8 30 L56 24" stroke="#f8fafc" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
        <path d="M0 8 L52 0 L64 6 L12 14 Z" fill="#991b1b" />
      </Place>

      {/* Dealer: the hole card, the up card, and later the hole card turned over. */}
      <TurnOver x={398} y={54} w={38} face="Q♦" t={2.35} />
      <SlideIn x={440} y={54} from={shoe} t={0.48}>
        <CardFace face="7♣" width={38} />
      </SlideIn>
      <Bubble x={508} y={82} text="7" t={0.75} out={2.35} />
      <Bubble x={508} y={82} text="17" t={2.7} />

      {/* Betting circles. */}
      {[...BJ_SEATS, { x: BJ_CHIP.x, y: BJ_CHIP.y }].map((s) => (
        <circle key={s.x} cx={s.x} cy={s.y} r={25} fill="none" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="2" />
      ))}

      {/* The other four seats: bets, two cards each, totals; seat four hits. */}
      {BJ_SEATS.map((s, i) => {
        const tilt = (s.x - 440) / 40;
        return (
          <g key={s.x}>
            {s.loses ? (
              <g className="moment-away" style={at(3.6, { '--dx': `${rack[0] - s.x}px`, '--dy': `${rack[1] - s.y}px` })}>
                <ChipStack x={s.x} y={s.y + 8} colors={s.bet} />
              </g>
            ) : (
              <ChipStack x={s.x} y={s.y + 8} colors={s.bet} />
            )}
            <SlideIn x={s.x - 30} y={s.y - 94} r={tilt - 6} from={shoe} t={[0, 0.12, 0.24, 0.36][i]}>
              <CardFace face={s.cards[0]} width={38} />
            </SlideIn>
            <SlideIn x={s.x - 10} y={s.y - 98} r={tilt + 6} from={shoe} t={[0.6, 0.72, 0.96, 1.08][i]}>
              <CardFace face={s.cards[1]} width={38} />
            </SlideIn>
            <Bubble x={s.x} y={s.y - 108} text={s.total} t={1.35} out={s.cards[0] === '5♣' ? 1.95 : undefined} />
          </g>
        );
      })}
      <SlideIn x={612} y={150} r={16} from={shoe} t={1.7}>
        <CardFace face="7♠" width={38} />
      </SlideIn>
      <Bubble x={600} y={145} text="21" t={2.0} fill="#065f46" />

      {/* You: A♠ already in front of you, K♥ dealt, your bet a red chip. */}
      <Place x={BJ_ACE.x} y={BJ_ACE.y}>
        <CardFace face="A♠" width={40} />
      </Place>
      <SlideIn x={430} y={172} r={8} from={shoe} t={0.84}>
        <CardFace face="K♥" width={40} />
      </SlideIn>
      <Place x={BJ_CHIP.x - 22} y={BJ_CHIP.y - 22}>
        <Chip color="red" size={44} />
      </Place>
      <Bubble x={440} y={160} text="21" t={1.35} fill="#065f46" />
      <g className="moment-pop" style={at(2.9)}>
        <circle className="moment-blink" style={at(3.3)} cx={BJ_CHIP.x} cy={BJ_CHIP.y} r={31} fill="none" stroke="#fbbf24" strokeWidth="3" />
      </g>
      <Headline id={id} x={440} y={144} size={50} t={2.9}>BLACKJACK!</Headline>
      <SlideIn x={486} y={270} from={rack} t={3.25} spin={0}>
        <ChipStack x={0} y={0} colors={['black', 'green', 'black']} w={28} />
      </SlideIn>
      <Place x={520} y={240}>
        <g className="moment-pop" style={at(3.5)}>
          <text fontSize={20} fontWeight={800} fill="#6ee7b7" stroke="#022c22" strokeWidth="3" paintOrder="stroke" fontFamily={SANS}>+150</text>
        </g>
      </Place>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Roulette: the wheel and ball spin down; the ball drops into 17; the marker
// lands on the red chip, the winning bets light up and are paid.

const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const pocketFill = (n: number) => (n === 0 ? '#15803d' : REDS.has(n) ? '#b91c1c' : '#111827');

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

function RouletteScene() {
  const id = useSvgId();
  const [cx, cy] = [170, 150];
  const step = 360 / 37;
  // Pocket 17 sits at the top when the wheel comes to rest.
  const angleOf = (i: number) => (i - WHEEL_ORDER.indexOf(17)) * step;
  const grid = Array.from({ length: 36 }, (_, i) => i + 1);
  const cell = (n: number) => ({ x: 386 + Math.floor((n - 1) / 3) * 38, y: 36 + (2 - ((n - 1) % 3)) * 50 });
  return (
    <g>
      <SceneDefs id={id} />
      <defs>
        <radialGradient id={`${id}-wood`} cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor="#7c3a12" />
          <stop offset="1" stopColor="#2a1206" />
        </radialGradient>
        <radialGradient id={`${id}-cone`} cx="0.45" cy="0.4" r="0.6">
          <stop offset="0" stopColor="#b45309" />
          <stop offset="1" stopColor="#451a03" />
        </radialGradient>
        <radialGradient id={`${id}-gilt`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fef3c7" />
          <stop offset="1" stopColor="#b45309" />
        </radialGradient>
        <radialGradient id={`${id}-ball`} cx="0.35" cy="0.3" r="0.7">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.7" stopColor="#f8fafc" />
          <stop offset="1" stopColor="#cbd5e1" />
        </radialGradient>
        <linearGradient id={`${id}-felt`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#16803d" />
          <stop offset="1" stopColor="#0b4d27" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="#1c0d05" />
      <rect width={W} height={H} fill="#000" opacity="0.25" />

      {/* The wheel: bowl, ball track and diamonds stay still. */}
      <circle cx={cx} cy={cy} r={142} fill={`url(#${id}-wood)`} stroke="#b45309" strokeWidth="3" />
      <circle cx={cx} cy={cy} r={132} fill="#4a2410" />
      <circle cx={cx} cy={cy} r={120} fill="#24110a" />
      {Array.from({ length: 8 }, (_, i) => {
        const [x, y] = polar(cx, cy, 127, i * 45 + 22.5);
        return <rect key={i} x={x - 3} y={y - 3} width={6} height={6} fill="#facc15" transform={`rotate(${i * 45 + 22.5} ${x} ${y})`} />;
      })}
      {/* The head turns. */}
      <g className="moment-turn" style={at(0, { '--turns': '-720deg', '--dur': '3.6s' })}>
        <circle cx={cx} cy={cy} r={118} fill="transparent" />
        {WHEEL_ORDER.map((n, i) => {
          const a = angleOf(i);
          const [x1, y1] = polar(cx, cy, 118, a - step / 2);
          const [x2, y2] = polar(cx, cy, 118, a + step / 2);
          const [x3, y3] = polar(cx, cy, 82, a + step / 2);
          const [x4, y4] = polar(cx, cy, 82, a - step / 2);
          return <path key={n} d={`M${x1} ${y1} A118 118 0 0 1 ${x2} ${y2} L${x3} ${y3} A82 82 0 0 0 ${x4} ${y4} Z`} fill={pocketFill(n)} />;
        })}
        {WHEEL_ORDER.map((n, i) => {
          const a = angleOf(i);
          const [x1, y1] = polar(cx, cy, 82, a + step / 2);
          const [x2, y2] = polar(cx, cy, 101, a + step / 2);
          return (
            <g key={n}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d4a017" strokeWidth="1.2" />
              <text x={cx} y={cy - 106} textAnchor="middle" fontSize={8.5} fontWeight={800} fill="#f8fafc" fontFamily={SANS} transform={`rotate(${a} ${cx} ${cy})`}>
                {n}
              </text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={101} fill="none" stroke="#d4a017" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r={82} fill={`url(#${id}-cone)`} stroke="#d4a017" strokeWidth="2" />
        {[0, 90, 180, 270].map((a) => {
          const [x, y] = polar(cx, cy, 44, a);
          return (
            <g key={a}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke={`url(#${id}-gilt)`} strokeWidth="6" strokeLinecap="round" />
              <circle cx={x} cy={y} r={6} fill={`url(#${id}-gilt)`} />
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={17} fill={`url(#${id}-gilt)`} stroke="#78350f" />
      </g>
      {/* The ball circles the other way, drops and bounces into 17. */}
      <g className="moment-turn" style={at(0, { '--turns': '1440deg', '--dur': '3.6s' })}>
        <circle cx={cx} cy={cy} r={142} fill="transparent" />
        <g className="moment-drop" style={at(2.7, { '--dy': `${RL_BALL.y - (cy - 124)}px` })}>
          <circle cx={cx} cy={cy - 124} r={6} fill={`url(#${id}-ball)`} />
        </g>
      </g>

      {/* The layout. */}
      <rect x={330} y={16} width={534} height={252} rx={14} fill={`url(#${id}-felt)`} stroke="#fde68a" strokeOpacity="0.3" />
      <path d="M386 36 L386 186 L358 186 L344 111 L358 36 Z" fill="#15803d" stroke="#f8fafc" strokeOpacity="0.7" />
      <text x={368} y={117} textAnchor="middle" fontSize={16} fontWeight={800} fill="#f8fafc" fontFamily={SANS}>0</text>
      {grid.map((n) => {
        const { x, y } = cell(n);
        return (
          <g key={n}>
            <rect x={x} y={y} width={38} height={50} fill={pocketFill(n)} stroke="#f8fafc" strokeOpacity="0.7" />
            <text x={x + 19} y={y + 31} textAnchor="middle" fontSize={15} fontWeight={800} fill="#f8fafc" fontFamily={SANS}>{n}</text>
          </g>
        );
      })}
      {['1st 12', '2nd 12', '3rd 12'].map((label, i) => (
        <g key={label}>
          <rect x={386 + i * 152} y={186} width={152} height={30} fill="none" stroke="#f8fafc" strokeOpacity="0.7" />
          <text x={386 + i * 152 + 76} y={206} textAnchor="middle" fontSize={12} fontWeight={700} fill="#f8fafc" fontFamily={SANS}>{label}</text>
        </g>
      ))}
      {['1-18', 'EVEN', 'red', 'black', 'ODD', '19-36'].map((label, i) => {
        const x = 386 + i * 76;
        return (
          <g key={label}>
            <rect x={x} y={216} width={76} height={34} fill="none" stroke="#f8fafc" strokeOpacity="0.7" />
            {label === 'red' || label === 'black' ? (
              <path d={`M${x + 38} 222 L${x + 58} 233 L${x + 38} 244 L${x + 18} 233 Z`} fill={label === 'red' ? '#b91c1c' : '#111827'} stroke="#f8fafc" strokeOpacity="0.6" />
            ) : (
              <text x={x + 38} y={238} textAnchor="middle" fontSize={11} fontWeight={700} fill="#f8fafc" fontFamily={SANS}>{label}</text>
            )}
          </g>
        );
      })}

      {/* Bets: the red chip on 17, black on red, green on the third dozen. */}
      <Place x={RL_CHIP.x - 22} y={RL_CHIP.y - 22}>
        <Chip color="red" size={44} />
      </Place>
      <Place x={561} y={218}>
        <Chip color="black" size={30} />
      </Place>
      <g className="moment-away" style={at(4.0, { '--dx': '70px', '--dy': '80px' })}>
        <Place x={751} y={186}>
          <Chip color="green" size={30} />
        </Place>
      </g>

      {/* The result. */}
      <g className="moment-pop" style={at(3.75)}>
        <g className="moment-blink" style={at(4.0)}>
          <rect x={cell(17).x} y={cell(17).y} width={38} height={50} fill="none" stroke="#fbbf24" strokeWidth="3" />
          <rect x={538} y={216} width={76} height={34} fill="none" stroke="#fbbf24" strokeWidth="3" />
        </g>
      </g>
      <SlideIn x={RL_CHIP.x} y={RL_CHIP.y - 18} from={[RL_CHIP.x, RL_CHIP.y - 80]} t={3.7} spin={0}>
        <ellipse cy={10} rx={11} ry={4} fill="#000" opacity="0.4" />
        <rect x={-9} y={-14} width={18} height={22} rx={3} fill="#e2e8f0" fillOpacity="0.85" stroke="#94a3b8" />
        <ellipse cy={-14} rx={9} ry={3.5} fill="#fbbf24" />
      </SlideIn>
      <SlideIn x={652} y={128} from={[840, 270]} t={3.95} spin={0}>
        <ChipStack x={0} y={0} colors={['red', 'red', 'red', 'red', 'red']} w={26} />
      </SlideIn>
      <Place x={640} y={88}>
        <g className="moment-pop" style={at(4.1)}>
          <text fontSize={20} fontWeight={800} fill="#6ee7b7" stroke="#022c22" strokeWidth="3" paintOrder="stroke" fontFamily={SANS}>+350</text>
        </g>
      </Place>
      <Place x={812} y={72}>
        <g className="moment-pop" style={at(3.75)}>
          <circle r={30} fill="#b91c1c" stroke="#fbbf24" strokeWidth="3" />
          <text y={9} textAnchor="middle" fontSize={26} fontWeight={800} fill="#fff" fontFamily={SANS}>17</text>
          <rect x={-22} y={34} width={44} height={14} rx={7} fill="#0f172a" />
          <text y={44} textAnchor="middle" fontSize={9} fontWeight={800} letterSpacing={2} fill="#fca5a5" fontFamily={SANS}>RED</text>
        </g>
      </Place>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Football: the striker shoots, the keeper dives, top corner; the net bulges,
// the crowd lights up and the jumbotron goes to 2-0.

function Player({ x, y, shirt, shorts, kick, dive }: { x: number; y: number; shirt: string; shorts: string; kick?: number; dive?: number }) {
  const skin = '#d6a77a';
  const legs = (
    <>
      <line x1={-3} y1={-9} x2={-5} y2={10} stroke={skin} strokeWidth="4" strokeLinecap="round" />
      <rect x={-8} y={8} width={6} height={4} rx={1.5} fill="#111827" />
    </>
  );
  const kicking = (
    <g>
      <line x1={3} y1={-9} x2={5} y2={10} stroke={skin} strokeWidth="4" strokeLinecap="round" />
      <rect x={3} y={8} width={6} height={4} rx={1.5} fill="#111827" />
    </g>
  );
  const body = (
    <>
      {legs}
      {kick === undefined ? (
        kicking
      ) : (
        <g className="moment-kick" style={{ ...at(kick), transformBox: 'view-box', transformOrigin: '0px -9px' } as CSSProperties}>
          {kicking}
        </g>
      )}
      <rect x={-7.5} y={-18} width={15} height={10} rx={2} fill={shorts} />
      <rect x={-8} y={-40} width={16} height={24} rx={5} fill={shirt} />
      <line x1={-8} y1={-36} x2={-14} y2={-20} stroke={skin} strokeWidth="3.5" strokeLinecap="round" />
      <line x1={8} y1={-36} x2={14} y2={-22} stroke={skin} strokeWidth="3.5" strokeLinecap="round" />
      <circle cy={-47} r={7} fill={skin} />
      <path d="M-7 -49 Q0 -58 7 -49 Q0 -53 -7 -49" fill="#1f2937" />
    </>
  );
  return (
    <Place x={x} y={y}>
      <ellipse cy={12} rx={14} ry={3} fill="#000" opacity="0.3" />
      {dive === undefined ? body : <g className="moment-dive" style={at(dive)}>{body}</g>}
    </Place>
  );
}

function Football() {
  // A clear middle (where the camera stops) with panels round the edge.
  return (
    <g>
      <circle r={9} fill="#f8fafc" stroke="#334155" strokeWidth="1" />
      {[0, 72, 144, 216, 288].map((a) => {
        const [x, y] = polar(0, 0, 7.6, a);
        return <circle key={a} cx={x} cy={y} r={2.2} fill="#1e293b" />;
      })}
    </g>
  );
}

function GoalScene() {
  const id = useSvgId();
  const end = { x: 806, y: 160 };
  const flashes = [[60, 78], [140, 96], [228, 74], [310, 104], [392, 82], [470, 100], [560, 76], [640, 98], [720, 80], [800, 102], [100, 112], [520, 114]];
  return (
    <g>
      <SceneDefs id={id} />
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#050b1a" />
          <stop offset="1" stopColor="#13305a" />
        </linearGradient>
        <pattern id={`${id}-crowd`} width="24" height="10" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="4" r="1.7" fill="#f87171" />
          <circle cx="9" cy="7" r="1.7" fill="#e5e7eb" />
          <circle cx="15" cy="3" r="1.7" fill="#60a5fa" />
          <circle cx="21" cy="7" r="1.7" fill="#fbbf24" />
        </pattern>
        <pattern id={`${id}-stripes`} width="140" height="10" patternUnits="userSpaceOnUse">
          <rect width="70" height="10" fill="#15803d" />
          <rect x="70" width="70" height="10" fill="#166534" />
        </pattern>
        <pattern id={`${id}-net`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0H7M0 0V7" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1" />
        </pattern>
        <clipPath id={`${id}-led`}>
          <rect y={128} width={W} height={12} />
        </clipPath>
      </defs>
      <rect width={W} height={H} fill={`url(#${id}-sky)`} />
      {[70, 810].map((x) => (
        <g key={x}>
          <circle cx={x} cy={16} r={60} fill="#ffffff" opacity="0.35" filter={`url(#${id}-blur)`} />
          <rect x={x - 2} y={14} width={4} height={56} fill="#64748b" />
          <rect x={x - 30} y={4} width={60} height={18} rx={2} fill="#f1f5f9" />
          {[10, 20, 30, 40, 50].map((dx) => (
            <rect key={dx} x={x - 30 + dx} y={4} width={1} height={18} fill="#94a3b8" />
          ))}
        </g>
      ))}

      {/* Stands and the crowd, with camera flashes; more after the goal. */}
      <rect y={64} width={W} height={64} fill="#111827" />
      <rect y={64} width={W} height={64} fill={`url(#${id}-crowd)`} opacity="0.75" />
      <rect y={86} width={W} height={2} fill="#000" opacity="0.5" />
      <rect y={107} width={W} height={2} fill="#000" opacity="0.5" />
      {flashes.map(([x, y], i) => (
        <circle key={i} className="moment-sparkle" style={{ animationDelay: `${(i * 0.37) % 2.2}s` }} cx={x} cy={y} r={3} fill="#ffffff" />
      ))}
      {flashes.map(([x, y], i) => (
        <circle key={`goal-${i}`} className="moment-sparkle moment-sparkle-burst" style={at(1.6 + (i % 6) * 0.08)} cx={x + 18} cy={y + 6} r={3.5} fill="#ffffff" />
      ))}

      {/* LED board with a scrolling message. */}
      <rect y={128} width={W} height={12} fill="#020617" />
      <g clipPath={`url(#${id}-led)`}>
        <text className="moment-ticker" x={0} y={137.5} fontSize={9} fontWeight={800} letterSpacing={3} fill="#22d3ee" fontFamily={SANS}>
          STACKS OVERFLOWED SPORTSBOOK · LIVE ODDS ON EVERY MATCH
        </text>
      </g>

      {/* The pitch and its lines. */}
      <rect y={140} width={W} height={160} fill={`url(#${id}-stripes)`} />
      <path d="M0 150 H880 M640 150 L606 300 M736 150 L724 232 H880" fill="none" stroke="#f8fafc" strokeOpacity="0.7" strokeWidth="2" />

      {/* The goal; its net bulges when the ball goes in. */}
      <g className="moment-bulge" style={{ ...at(1.38), transformOrigin: 'left center' } as CSSProperties}>
        <path d="M798 150 L870 132 L874 236 L798 232 Z" fill={`url(#${id}-net)`} />
      </g>
      <path d="M798 232 L798 150 L864 138 L864 222" fill="none" stroke="#f8fafc" strokeWidth="5" strokeLinejoin="round" />

      {/* Striker (red), a defender (blue) and the keeper (yellow). */}
      <Player x={300} y={238} shirt="#dc2626" shorts="#f8fafc" kick={0.25} />
      <Player x={540} y={226} shirt="#1d4ed8" shorts="#1e3a8a" />
      <Player x={836} y={222} shirt="#facc15" shorts="#111827" dive={0.95} />

      {/* The ball: from the striker's feet into the top corner. */}
      <Place x={end.x} y={end.y}>
        <g className="moment-fly-x" style={at(0.35, { '--dx': `${FB_BALL.x - end.x}px`, '--dur': '1s' })}>
          <g className="moment-fly-y" style={at(0.35, { '--dy': `${FB_BALL.y - end.y}px`, '--peak': '-46px', '--dur': '1s' })}>
            <g className="moment-spin" style={at(0.35)}>
              <Football />
            </g>
          </g>
        </g>
      </Place>

      {/* Jumbotron: 1-0 becomes 2-0. */}
      <ScorePanel x={JUMBOTRON.x} y={JUMBOTRON.y} label="LIVE · 89:41">
        <text x={60} y={38} textAnchor="middle" fontSize={16} fontWeight={800} fill="#f8fafc" fontFamily={SANS}>HOME</text>
        <text x={160} y={38} textAnchor="middle" fontSize={16} fontWeight={800} fill="#f8fafc" fontFamily={SANS}>AWAY</text>
        <text x={110} y={38} textAnchor="middle" fontSize={18} fontWeight={800} fill="#f8fafc" fontFamily={SANS}>–</text>
        <g className="moment-out" style={at(1.7)}>
          <text x={96} y={38} textAnchor="middle" fontSize={18} fontWeight={800} fill="#f8fafc" fontFamily={SANS}>1</text>
        </g>
        <g className="moment-pop" style={at(1.75)}>
          <text x={96} y={38} textAnchor="middle" fontSize={18} fontWeight={800} fill="#fbbf24" fontFamily={SANS}>2</text>
        </g>
        <text x={124} y={38} textAnchor="middle" fontSize={18} fontWeight={800} fill="#f8fafc" fontFamily={SANS}>0</text>
      </ScorePanel>
      <Headline id={id} x={440} y={112} size={72} t={1.5} ds={2.2} until={4.2}>GOAL!</Headline>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Bet slip: the final score; a three-leg parlay's legs go green one by one,
// WON is stamped on it, the payout counts up and flies to your balance.

const LEGS = [
  { pick: 'Lakers ML', market: 'Moneyline', odds: '−120', badge: '#7c3aed', tag: 'LAL' },
  { pick: 'Over 48.5', market: 'Total points', odds: '−110', badge: '#475569', tag: 'O/U' },
  { pick: 'Chiefs −3', market: 'Spread', odds: '+105', badge: '#dc2626', tag: 'KC' },
];

function BetSlipScene() {
  const id = useSvgId();
  const bokeh = [[90, 260, 50, '#6366f1'], [250, 30, 40, '#0ea5e9'], [640, 40, 56, '#a855f7'], [820, 250, 60, '#0ea5e9'], [600, 280, 36, '#22d3ee'], [830, 60, 30, '#f472b6']] as const;
  const stats = [['Possession', 0.61], ['Shots', 0.7], ['Corners', 0.55]] as const;
  return (
    <g>
      <SceneDefs id={id} />
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0f172a" />
          <stop offset="1" stopColor="#1e1b4b" />
        </linearGradient>
        <clipPath id={`${id}-payout`}>
          <rect x={364} y={240} width={90} height={26} />
        </clipPath>
        <clipPath id={`${id}-balance`}>
          <rect x={672} y={146} width={150} height={26} />
        </clipPath>
      </defs>
      <rect width={W} height={H} fill={`url(#${id}-bg)`} />
      {bokeh.map(([x, y, r, c], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={c} opacity="0.35" filter={`url(#${id}-blur)`} />
      ))}

      {/* Final score and match stats. */}
      <ScorePanel x={LIVE_SCORE.x} y={LIVE_SCORE.y} label="FULL TIME">
        <text x={110} y={38} textAnchor="middle" fontSize={16} fontWeight={800} fill="#f8fafc" fontFamily={SANS}>HOME 2 – 0 AWAY</text>
      </ScorePanel>
      <Place x={40} y={100}>
        <rect width={220} height={150} rx={10} fill="#0b1120" fillOpacity="0.8" stroke="#334155" />
        <text x={14} y={22} fontSize={10} fontWeight={800} letterSpacing={2} fill="#94a3b8" fontFamily={SANS}>MATCH STATS</text>
        {stats.map(([name, share], i) => (
          <g key={name} transform={`translate(14 ${46 + i * 36})`}>
            <text fontSize={11} fontWeight={700} fill="#e2e8f0" fontFamily={SANS}>{name}</text>
            <rect y={8} width={192} height={7} rx={3.5} fill="#1e293b" />
            <rect className="moment-grow" style={{ ...at(0.2 + i * 0.15), transformOrigin: 'left center' } as CSSProperties} y={8} width={192 * share} height={7} rx={3.5} fill="#38bdf8" />
          </g>
        ))}
      </Place>

      {/* The slip. */}
      <Place x={300} y={18}>
        <rect width={280} height={266} rx={14} fill="#f8fafc" />
        <path d="M0 14 A14 14 0 0 1 14 0 H266 A14 14 0 0 1 280 14 V40 H0 Z" fill="#065f46" />
        <text x={16} y={26} fontSize={13} fontWeight={800} letterSpacing={1.5} fill="#ecfdf5" fontFamily={SANS}>BET SLIP</text>
        <text x={264} y={26} textAnchor="end" fontSize={10} fontWeight={700} letterSpacing={1.5} fill="#a7f3d0" fontFamily={SANS}>PARLAY · 3 LEGS</text>
        {LEGS.map((leg, i) => (
          <g key={leg.pick} transform={`translate(0 ${48 + i * 50})`}>
            <circle cx={28} cy={22} r={13} fill={leg.badge} />
            <text x={28} y={25.5} textAnchor="middle" fontSize={8.5} fontWeight={800} fill="#fff" fontFamily={SANS}>{leg.tag}</text>
            <text x={50} y={20} fontSize={14} fontWeight={800} fill="#0f172a" fontFamily={SANS}>{leg.pick}</text>
            <text x={50} y={34} fontSize={10} fill="#64748b" fontFamily={SANS}>{leg.market}</text>
            <text x={222} y={26} textAnchor="end" fontSize={13} fontWeight={700} fill="#334155" fontFamily={SANS}>{leg.odds}</text>
            <circle cx={252} cy={22} r={11} fill="none" stroke="#cbd5e1" strokeWidth="2" />
            <g className="moment-pop" style={at(0.5 + i * 0.5)}>
              <circle cx={252} cy={22} r={11} fill="#10b981" />
              <path d="M246 22 L250.5 26.5 L258 18" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </g>
            <rect x={14} y={46} width={252} height={1} fill="#e2e8f0" />
          </g>
        ))}
        <text x={16} y={214} fontSize={11} fill="#64748b" fontFamily={SANS}>Stake</text>
        <text x={100} y={214} fontSize={11} fontWeight={700} fill="#0f172a" fontFamily={SANS}>100</text>
        <text x={160} y={214} fontSize={11} fill="#64748b" fontFamily={SANS}>Odds</text>
        <text x={264} y={214} textAnchor="end" fontSize={11} fontWeight={700} fill="#0f172a" fontFamily={SANS}>+450</text>
      </Place>
      <GoldCoin x={SLIP_COIN.x - 14} y={SLIP_COIN.y - 14} size={28} />
      <g clipPath={`url(#${id}-payout)`}>
        <g className="moment-reel" style={at(2.4, { '--from': '-78px', '--dur': '0.9s' })}>
          {['+450', '+300', '+150', '+0'].map((v, i) => (
            <text key={v} x={366} y={260 + i * 26} fontSize={20} fontWeight={800} fill="#059669" fontFamily={SANS}>{v}</text>
          ))}
        </g>
      </g>
      <Place x={440} y={150} r={-14}>
        <g className="moment-pop" style={at(2.0, { '--ds': '2.6' })}>
          <rect x={-74} y={-30} width={148} height={60} rx={10} fill="#ecfdf5" fillOpacity="0.4" stroke="#059669" strokeWidth="6" />
          <text y={17} textAnchor="middle" fontSize={46} fontWeight={700} letterSpacing={4} fill="#059669" style={{ fontFamily: 'inherit' }}>WON</text>
        </g>
      </Place>

      {/* Your balance; gold sparks fly to it as the payout lands. */}
      <Place x={620} y={118}>
        <rect width={240} height={64} rx={32} fill="#0b1120" stroke="#334155" strokeWidth="2" />
        <path d="M24 22 h24 a4 4 0 0 1 4 4 v14 a4 4 0 0 1 -4 4 h-24 a4 4 0 0 1 -4 -4 v-14 a4 4 0 0 1 4 -4 z M40 30 h12 v8 h-12 a4 4 0 0 1 0 -8 z" fill="#facc15" fillRule="evenodd" />
        <text x={66} y={24} fontSize={9} fontWeight={800} letterSpacing={2} fill="#94a3b8" fontFamily={SANS}>BALANCE</text>
      </Place>
      <g clipPath={`url(#${id}-balance)`}>
        <g className="moment-reel" style={at(3.0, { '--from': '-52px', '--dur': '0.8s' })}>
          {['1,450', '1,200', '1,000'].map((v, i) => (
            <text key={v} x={686} y={166 + i * 26} fontSize={20} fontWeight={800} fill="#f8fafc" fontFamily={SANS}>{v}</text>
          ))}
        </g>
      </g>
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i} className="moment-away" style={at(2.55 + i * 0.08, { '--dx': `${300 - i * 6}px`, '--dy': `${-100 + i * 6}px` })}>
          <circle cx={SLIP_COIN.x + 30 + i * 6} cy={SLIP_COIN.y - 6 - i * 3} r={4} fill="#fde047" />
        </g>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Slots: the lever is pulled, the reels land on 7-7-7, JACKPOT, and coins
// pour into the tray. Neighbouring machines glow either side.

const REEL_STRIP = ['★', '7', 'BAR', 'cherry', 'bell', '♦', '7', '★'];
const SYMBOL_H = 46;

function ReelSymbol({ symbol, y }: { symbol: string; y: number }) {
  if (symbol === 'BAR') {
    return (
      <g transform={`translate(0 ${y})`}>
        <rect x={-22} y={-9} width={44} height={18} rx={3} fill="#111827" />
        <text y={5} textAnchor="middle" fontSize={13} fontWeight={800} fill="#fbbf24" fontFamily={SANS}>BAR</text>
      </g>
    );
  }
  if (symbol === 'cherry') {
    return (
      <g transform={`translate(0 ${y})`}>
        <path d="M-6 4 Q-4 -12 6 -14 M6 4 Q4 -8 6 -14" fill="none" stroke="#15803d" strokeWidth="2" />
        <circle cx={-7} cy={7} r={7} fill="#dc2626" />
        <circle cx={7} cy={7} r={7} fill="#b91c1c" />
      </g>
    );
  }
  if (symbol === 'bell') {
    return (
      <g transform={`translate(0 ${y})`}>
        <path d="M-12 8 Q-12 -14 0 -14 Q12 -14 12 8 Z" fill="#f59e0b" stroke="#b45309" strokeWidth="1.5" />
        <circle cy={11} r={3.5} fill="#b45309" />
      </g>
    );
  }
  const fill = symbol === '7' || symbol === '♦' ? '#dc2626' : '#f59e0b';
  return (
    <text y={y + 12} textAnchor="middle" fontSize={34} fontWeight={900} fill={fill} stroke={symbol === '7' ? '#7f1d1d' : 'none'} strokeWidth="1" fontFamily={SANS}>
      {symbol}
    </text>
  );
}

function SlotsScene() {
  const id = useSvgId();
  const reelX = [322, 405, 488];
  const bulbs = Array.from({ length: 22 }, (_, i) => {
    // Round the marquee: 8 along the top and bottom, 3 down each side.
    if (i < 8) return [326 + i * 32.6, 20];
    if (i < 11) return [562, 34 + (i - 8) * 14];
    if (i < 19) return [554 - (i - 11) * 32.6, 76];
    return [318, 62 - (i - 19) * 14];
  });
  const pour = [[-60, -8], [-40, -4], [-22, -10], [-6, -3], [10, -9], [26, -4], [44, -8], [62, -5]];
  return (
    <g>
      <SceneDefs id={id} />
      <defs>
        <radialGradient id={`${id}-room`} cx="0.5" cy="0.3" r="0.9">
          <stop offset="0" stopColor="#4c1d95" />
          <stop offset="1" stopColor="#0c0a1d" />
        </radialGradient>
        <linearGradient id={`${id}-cab`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7f1d1d" />
          <stop offset="0.5" stopColor="#dc2626" />
          <stop offset="1" stopColor="#7f1d1d" />
        </linearGradient>
        <linearGradient id={`${id}-reel`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cbd5e1" />
          <stop offset="0.15" stopColor="#f8fafc" />
          <stop offset="0.85" stopColor="#f8fafc" />
          <stop offset="1" stopColor="#cbd5e1" />
        </linearGradient>
        <pattern id={`${id}-carpet`} width="28" height="14" patternUnits="userSpaceOnUse">
          <path d="M0 7 L7 0 L14 7 L7 14 Z M14 7 L21 0 L28 7 L21 14 Z" fill="#7c2d12" opacity="0.5" />
        </pattern>
        {reelX.map((x, i) => (
          <clipPath key={x} id={`${id}-win${i}`}>
            <rect x={x} y={118} width={70} height={92} rx={6} />
          </clipPath>
        ))}
      </defs>
      <rect width={W} height={H} fill={`url(#${id}-room)`} />
      <rect y={252} width={W} height={48} fill={`url(#${id}-carpet)`} />

      {/* The machines either side. */}
      {[{ x: -30, screen: '#1d4ed8' }, { x: 710, screen: '#0f766e' }].map((m) => (
        <g key={m.x} opacity="0.7">
          <rect x={m.x} y={36} width={200} height={264} rx={16} fill="#3b0764" stroke="#a855f7" strokeOpacity="0.5" />
          <rect x={m.x + 26} y={70} width={148} height={96} rx={8} fill={m.screen} />
          <rect className="moment-blink" style={{ animationDuration: '2.4s' }} x={m.x + 26} y={70} width={148} height={96} rx={8} fill="#ffffff" fillOpacity="0.12" />
          <rect x={m.x + 40} y={186} width={120} height={14} rx={4} fill="#0f172a" />
        </g>
      ))}

      {/* The machine. */}
      <rect x={300} y={8} width={280} height={292} rx={18} fill={`url(#${id}-cab)`} stroke="#fbbf24" strokeWidth="4" />
      <rect x={316} y={18} width={248} height={60} rx={12} fill="#1e1b4b" stroke="#fbbf24" strokeWidth="2" />
      {bulbs.map(([x, y], i) => (
        <circle key={i} className={i % 2 ? 'moment-chase-a' : 'moment-chase-b'} cx={x} cy={y} r={3.4} fill="#fde68a" />
      ))}
      <g className="moment-out" style={at(2.05)}>
        <text x={440} y={60} textAnchor="middle" fontSize={30} fontWeight={700} letterSpacing={2} fill={`url(#${id}-gold)`} stroke="#78350f" strokeWidth="2" paintOrder="stroke" style={{ fontFamily: 'inherit' }}>
          LUCKY 7s
        </text>
      </g>
      <rect x={330} y={84} width={220} height={24} rx={6} fill="#0a0a0a" stroke="#ef4444" />
      <text x={342} y={100} fontSize={8} fontWeight={800} letterSpacing={1.5} fill="#f87171" fontFamily={SANS}>MEGA JACKPOT</text>
      <text className="moment-blink" style={at(2.1)} x={538} y={102} textAnchor="end" fontSize={16} fontWeight={800} fill="#ef4444" fontFamily="ui-monospace, monospace">5,000</text>

      {/* Reels: each window shows one symbol on the pay line and half of the ones either side. */}
      <rect x={314} y={112} width={252} height={104} rx={10} fill="#111827" stroke="#fbbf24" strokeWidth="2" />
      {reelX.map((x, i) => (
        <g key={x} clipPath={`url(#${id}-win${i})`}>
          <rect x={x} y={118} width={70} height={92} fill={`url(#${id}-reel)`} />
          <g className="moment-reel" style={at(0.25, { '--from': `-${5 * SYMBOL_H}px`, '--dur': `${1 + i * 0.4}s` })}>
            {REEL_STRIP.map((symbol, k) => (
              <g key={k} transform={`translate(${x + 35} 0)`}>
                <ReelSymbol symbol={symbol} y={164 + (k - 1) * SYMBOL_H} />
              </g>
            ))}
          </g>
        </g>
      ))}
      <g className="moment-blink" style={at(2.1)}>
        <line x1={318} y1={164} x2={562} y2={164} stroke="#ef4444" strokeWidth="2.5" />
      </g>
      <path d="M308 158 L318 164 L308 170 Z M572 158 L562 164 L572 170 Z" fill="#ef4444" />

      {/* Credits, buttons and the coin tray. */}
      <rect x={330} y={222} width={220} height={18} rx={4} fill="#0f172a" />
      <text x={340} y={235} fontSize={9} fontWeight={800} letterSpacing={1} fill="#38bdf8" fontFamily={SANS}>BET 25</text>
      <text x={540} y={235} textAnchor="end" fontSize={9} fontWeight={800} letterSpacing={1} fill="#38bdf8" fontFamily={SANS}>WIN 5,000</text>
      <circle cx={352} cy={252} r={8} fill="#ef4444" stroke="#7f1d1d" />
      <rect x={372} y={246} width={46} height={12} rx={4} fill="#facc15" />
      <rect x={428} y={246} width={46} height={12} rx={4} fill="#38bdf8" />
      <rect x={330} y={264} width={220} height={32} rx={8} fill="#0a0a0a" stroke="#475569" />
      {[[372, 286], [396, 290], [484, 289], [508, 285]].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx={12} ry={4.5} fill="#facc15" stroke="#a16207" />
      ))}
      <GoldCoin x={TRAY_COIN.x - 14} y={TRAY_COIN.y - 14} size={28} />
      {pour.map(([dx, dy], i) => (
        <g key={i} className="moment-coin" style={at(2.2 + i * 0.07, { '--cx': `${dx}px`, '--cy': `${dy}px`, '--cr': `${(i % 3) * 40 - 40}deg`, '--dur': '0.6s' })}>
          <ellipse cx={440} cy={268} rx={10} ry={4} fill="#fde047" stroke="#a16207" />
        </g>
      ))}

      {/* The lever, pulled at the start. */}
      <circle cx={592} cy={172} r={10} fill="#cbd5e1" stroke="#64748b" />
      <g className="moment-lever" style={{ ...at(0), transformBox: 'view-box', transformOrigin: '592px 172px' } as CSSProperties}>
        <line x1={592} y1={172} x2={592} y2={74} stroke="#e2e8f0" strokeWidth="6" strokeLinecap="round" />
        <circle cx={592} cy={66} r={12} fill="#dc2626" stroke="#7f1d1d" strokeWidth="2" />
      </g>
      <Headline id={id} x={440} y={64} size={46} t={2.1}>JACKPOT!</Headline>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Poker: an all-in showdown, shown like TV. You have A♠ K♠ against a set of
// fours; the turn misses, the river is the Q♠ for a royal flush.

const FOLDED = [
  { x: 210, y: 30, name: 'ACE_HIGH', color: '#0ea5e9' },
  { x: 54, y: 120, name: 'NUTS4DAYS', color: '#a855f7' },
  { x: 826, y: 130, name: 'BLUFFR', color: '#f97316' },
  { x: 770, y: 274, name: 'SHORTY', color: '#eab308' },
];

function Seat({ x, y, name, color, stack, dim }: { x: number; y: number; name: string; color: string; stack: string; dim?: boolean }) {
  return (
    <Place x={x} y={y}>
      <g opacity={dim ? 0.55 : 1}>
        <rect x={-46} y={-11} width={92} height={24} rx={12} fill="#0b1120" stroke="#334155" />
        <circle cx={-40} cy={1} r={14} fill={color} stroke="#0b1120" strokeWidth="2" />
        <text x={-40} y={5} textAnchor="middle" fontSize={10} fontWeight={800} fill="#fff" fontFamily={SANS}>{name[0]}</text>
        <text x={-20} y={0} fontSize={8} fontWeight={800} fill="#e2e8f0" fontFamily={SANS}>{name}</text>
        <text x={-20} y={10} fontSize={8} fontWeight={700} fill="#94a3b8" fontFamily={SANS}>{dim ? 'FOLD' : stack}</text>
      </g>
    </Place>
  );
}

function PokerScene() {
  const id = useSvgId();
  const boardX = [305, 361, 417, 473, 529];
  const dealer: [number, number] = [440, 20];
  const royal = [{ x: 305, y: 98, w: 50 }, { x: 361, y: 98, w: 50 }, { x: 529, y: 98, w: 50 }, { x: PK_ACE.x, y: PK_ACE.y, w: 40 }, { x: 440, y: 206, w: 40 }];
  return (
    <g>
      <SceneDefs id={id} />
      <defs>
        <radialGradient id={`${id}-room`} cx="0.5" cy="0.4" r="0.7">
          <stop offset="0" stopColor="#1e293b" />
          <stop offset="1" stopColor="#020617" />
        </radialGradient>
        <radialGradient id={`${id}-rail`} cx="0.5" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#9a3412" />
          <stop offset="1" stopColor="#431407" />
        </radialGradient>
        <radialGradient id={`${id}-felt`} cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor="#16a34a" />
          <stop offset="0.65" stopColor="#14532d" />
          <stop offset="1" stopColor="#052e16" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${id}-room)`} />

      {/* The table. */}
      <ellipse cx={440} cy={168} rx={424} ry={126} fill={`url(#${id}-rail)`} />
      <ellipse cx={440} cy={168} rx={408} ry={114} fill="#18181b" />
      <ellipse cx={440} cy={168} rx={398} ry={106} fill="none" stroke="#3f3f46" strokeDasharray="4 3" />
      <ellipse cx={440} cy={168} rx={386} ry={98} fill={`url(#${id}-felt)`} />
      <ellipse cx={440} cy={168} rx={300} ry={68} fill="none" stroke="#fde68a" strokeOpacity="0.2" strokeDasharray="6 5" />

      {/* Board: the flop is out (10♠ J♠ 4♦); the turn and river are dealt and turned over. */}
      <Place x={boardX[0]} y={98}><CardFace face="10♠" width={50} /></Place>
      <Place x={boardX[1]} y={98}><CardFace face="J♠" width={50} /></Place>
      <Place x={boardX[2]} y={98}><CardFace face="4♦" width={50} /></Place>
      <SlideIn x={boardX[3]} y={98} from={dealer} t={0.3} spin={0}>
        <TurnOver x={0} y={0} w={50} face="2♣" t={0.6} />
      </SlideIn>
      <SlideIn x={boardX[4]} y={98} from={dealer} t={1.6} spin={0}>
        <TurnOver x={0} y={0} w={50} face="Q♠" t={2.1} />
      </SlideIn>

      {/* The pot. */}
      <g className="moment-away" style={at(3.5, { '--dx': '0px', '--dy': '70px' })}>
        <ChipStack x={330} y={196} colors={['black', 'green', 'black', 'green']} w={24} />
        <ChipStack x={356} y={198} colors={['red', 'black', 'red']} w={24} />
        <ChipStack x={548} y={198} colors={['green', 'red', 'green', 'red', 'green']} w={24} />
      </g>
      <text x={440} y={194} textAnchor="middle" fontSize={11} fontWeight={800} letterSpacing={1.5} fill="#fde68a" fontFamily={SANS}>POT 9,600</text>

      {/* Seats: everyone else has folded; the villain shows a set of fours. */}
      {FOLDED.map((s) => (
        <Seat key={s.name} x={s.x} y={s.y} name={s.name} color={s.color} stack="" dim />
      ))}
      <Place x={640} y={58} r={-6}><CardFace face="4♣" width={38} /></Place>
      <Place x={680} y={54} r={6}><CardFace face="4♥" width={38} /></Place>
      <Seat x={700} y={36} name="RIVER_RAT" color="#ef4444" stack="ALL IN" />
      <circle cx={612} cy={236} r={10} fill="#f8fafc" stroke="#94a3b8" />
      <text x={612} y={240} textAnchor="middle" fontSize={11} fontWeight={900} fill="#0f172a" fontFamily={SANS}>D</text>

      {/* You: A♠ K♠. */}
      <Place x={PK_ACE.x} y={PK_ACE.y}><CardFace face="A♠" width={40} /></Place>
      <Place x={440} y={206} r={6}><CardFace face="K♠" width={40} /></Place>
      <Seat x={440} y={284} name="YOU" color="#10b981" stack="ALL IN" />

      {/* TV graphic: each player's chance of winning, street by street. */}
      <Place x={22} y={224}>
        <rect width={200} height={66} rx={8} fill="#020617" fillOpacity="0.85" stroke="#334155" />
        {[
          { name: 'YOU', color: '#10b981', s: [0.27, 0.2, 1], pct: ['27%', '20%', '100%'], y: 22 },
          { name: 'RIVER_RAT', color: '#ef4444', s: [0.73, 0.8, 0.0001], pct: ['73%', '80%', '0%'], y: 48 },
        ].map((p) => (
          <g key={p.name}>
            <text x={10} y={p.y + 4} fontSize={9} fontWeight={800} fill="#e2e8f0" fontFamily={SANS}>{p.name}</text>
            <rect x={74} y={p.y - 4} width={84} height={8} rx={4} fill="#1e293b" />
            <rect
              className="moment-bar"
              style={{ ...at(0, { '--s0': String(p.s[0]), '--s1': String(p.s[1]), '--s2': String(p.s[2]) }), transformOrigin: 'left center' } as CSSProperties}
              x={74} y={p.y - 4} width={84} height={8} rx={4} fill={p.color}
            />
            <g className="moment-out" style={at(0.85)}>
              <text x={190} y={p.y + 4} textAnchor="end" fontSize={10} fontWeight={800} fill="#f8fafc" fontFamily={SANS}>{p.pct[0]}</text>
            </g>
            <g className="moment-pop" style={at(0.9)}>
              <g className="moment-out" style={at(2.4)}>
                <text x={190} y={p.y + 4} textAnchor="end" fontSize={10} fontWeight={800} fill="#f8fafc" fontFamily={SANS}>{p.pct[1]}</text>
              </g>
            </g>
            <g className="moment-pop" style={at(2.45)}>
              <text x={190} y={p.y + 4} textAnchor="end" fontSize={10} fontWeight={800} fill={p.color} fontFamily={SANS}>{p.pct[2]}</text>
            </g>
          </g>
        ))}
      </Place>

      {/* Royal flush: the five cards light up, and the pot comes to you. */}
      <g className="moment-pop" style={at(2.8)}>
        {royal.map((c) => (
          <rect key={`${c.x}-${c.y}`} className="moment-blink" style={at(3.1)} x={c.x - 3} y={c.y - 3} width={c.w + 6} height={c.w * 1.4 + 6} rx={6} fill="none" stroke="#fbbf24" strokeWidth="3" />
        ))}
      </g>
      <Headline id={id} x={440} y={82} size={44} t={2.8}>ROYAL FLUSH</Headline>
    </g>
  );
}
