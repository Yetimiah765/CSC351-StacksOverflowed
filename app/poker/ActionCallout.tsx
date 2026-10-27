'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { LastAction } from '../../lib/pokerTable';

// A comic "OBJECTION!"-style callout that sweeps across the table whenever
// someone acts, in the spirit of the Ace Attorney courtroom shouts: a
// jagged speech bubble with a heavy black outline and a white rim, slanted
// outlined lettering, speed lines and a shake. Each move gets its own
// energy: a fold sags and drops away, a check taps twice, a call glides
// through, a bet punches in, a raise slams in shaking, and an all-in flashes
// the table. Shapes are drawn as SVG in code; the motion is the
// callout-* keyframes in app/globals.css.

type Kind = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

interface CalloutStyle {
  word: string;
  // Bubble fill, the text's fill and its outline.
  fill: string;
  text: string;
  shape: 'droop' | 'round' | 'oval' | 'soft' | 'spiky' | 'mega';
  // How the bubble crosses: drifts and sags, glides, or slams.
  motion: 'sag' | 'glide' | 'slam';
  duration: number;
  textSize: string;
  tap?: boolean;
  shake?: boolean;
  lines?: string | null;
  flash?: boolean;
}

const STYLES: Record<Kind, CalloutStyle> = {
  fold: { word: 'Fold…', fill: '#475569', text: '#cbd5e1', shape: 'droop', motion: 'sag', duration: 1500, textSize: 'text-4xl sm:text-5xl' },
  check: { word: 'Check!', fill: '#0284c7', text: '#e0f2fe', shape: 'round', motion: 'glide', duration: 1250, textSize: 'text-4xl sm:text-5xl', tap: true },
  call: { word: 'Call!', fill: '#059669', text: '#ecfdf5', shape: 'oval', motion: 'glide', duration: 1350, textSize: 'text-5xl sm:text-6xl' },
  bet: { word: 'Bet!', fill: '#f59e0b', text: '#fffbeb', shape: 'soft', motion: 'slam', duration: 1450, textSize: 'text-5xl sm:text-6xl', lines: 'rgba(251,191,36,0.55)' },
  raise: { word: 'Raise!', fill: '#dc2626', text: '#fff7ed', shape: 'spiky', motion: 'slam', duration: 1700, textSize: 'text-6xl sm:text-7xl', shake: true, lines: 'rgba(248,113,113,0.6)' },
  allin: { word: 'All-in!!', fill: '#facc15', text: '#f43f5e', shape: 'mega', motion: 'slam', duration: 2100, textSize: 'text-6xl sm:text-7xl', shake: true, lines: 'rgba(250,204,21,0.7)', flash: true },
};

// The bubble's outline in a 400×200 box centered on (200, 100).
const CX = 200;
const CY = 100;

// A star-shaped burst around an ellipse; `jitter` roughens the points, from
// a fixed seed so the shape is the same on every render.
function burst(points: number, outer: [number, number], inner: [number, number], jitter: number, seed: number): string {
  let state = seed;
  const random = () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
  const coords: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = (Math.PI * i) / points - Math.PI / 2;
    const [rx, ry] = i % 2 === 0 ? outer : inner;
    const wobble = 1 + (random() - 0.5) * jitter;
    coords.push(`${(CX + Math.cos(angle) * rx * wobble).toFixed(1)},${(CY + Math.sin(angle) * ry * wobble).toFixed(1)}`);
  }
  return coords.join(' ');
}

function BubbleShape({ shape, fill }: { shape: CalloutStyle['shape']; fill: string }) {
  // Drawn twice: a thick black outline with the fill, then a white rim inside it.
  const draw = (props: { fill: string; stroke: string; strokeWidth: number }) => {
    switch (shape) {
      case 'droop':
        // A sagging blob with drips.
        return (
          <g {...props} strokeLinejoin="round">
            <path d="M60 96 C60 46 130 30 200 34 C275 30 342 48 340 98 C338 140 300 150 262 148 C252 172 236 186 226 168 C220 156 214 150 196 150 C150 154 132 176 120 160 C112 150 112 146 104 144 C74 140 60 124 60 96 Z" />
          </g>
        );
      case 'round':
        // A neat rounded box with a short tail.
        return (
          <g {...props} strokeLinejoin="round">
            <path d="M74 44 H326 Q352 44 352 70 V126 Q352 152 326 152 H178 L140 182 L148 152 H74 Q48 152 48 126 V70 Q48 44 74 44 Z" />
          </g>
        );
      case 'oval':
        // A classic speech balloon.
        return (
          <g {...props} strokeLinejoin="round">
            <path d="M200 30 C300 30 360 62 360 98 C360 136 300 166 200 166 C186 166 172 165 160 163 L112 192 L126 156 C72 144 40 122 40 98 C40 62 100 30 200 30 Z" />
          </g>
        );
      case 'soft':
        return <polygon {...props} strokeLinejoin="round" points={burst(12, [178, 92], [146, 70], 0.08, 7)} />;
      case 'spiky':
        return <polygon {...props} strokeLinejoin="miter" points={burst(16, [196, 98], [140, 64], 0.22, 11)} />;
      case 'mega':
        return <polygon {...props} strokeLinejoin="miter" points={burst(22, [200, 100], [132, 60], 0.12, 23)} />;
    }
  };

  return (
    <svg viewBox="0 0 400 200" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
      {draw({ fill, stroke: '#020617', strokeWidth: 14 })}
      {draw({ fill: 'none', stroke: '#ffffff', strokeWidth: 4 })}
    </svg>
  );
}

function kindOf(action: LastAction): Kind {
  if (action.allIn && action.move !== 'fold' && action.move !== 'check') return 'allin';
  return action.move;
}

/**
 * How long `action`'s callout covers the table. Cards dealt or revealed
 * because of that action wait this long, so the callout doesn't hide them.
 */
export function calloutDuration(action: LastAction): number {
  return STYLES[kindOf(action)].duration;
}

function caption(action: LastAction, kind: Kind, name: string): string {
  switch (kind) {
    case 'fold':
      return `${name} folds`;
    case 'check':
      return `${name} checks`;
    case 'call':
      return `${name} calls`;
    case 'bet':
      return `${name} bets ${action.amount}`;
    case 'raise':
      return `${name} raises to ${action.amount}`;
    case 'allin':
      return `${name} — ${action.amount}`;
  }
}

/**
 * Plays one callout per new action. `actionKey` identifies the action (the
 * same state re-broadcast doesn't replay it), and the action already on the
 * table when the page loads isn't shown.
 */
export default function ActionCallout({
  action,
  actionKey,
  ownSeatNumber,
}: {
  action: LastAction | null;
  actionKey: string | null;
  ownSeatNumber: number | null;
}) {
  const [current, setCurrent] = useState<{ key: string; action: LastAction } | null>(null);
  const seenRef = useRef<string | null | undefined>(undefined);
  // Kept outside the effect: every broadcast is a new `action` object, and
  // re-running the effect mustn't cancel the callout already playing.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // The first state the page sees is history, not news.
    if (seenRef.current === undefined) {
      seenRef.current = actionKey;
      return;
    }
    if (!action || !actionKey || actionKey === seenRef.current) return;
    seenRef.current = actionKey;
    setCurrent({ key: actionKey, action });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCurrent(null), STYLES[kindOf(action)].duration + 100);
  }, [action, actionKey]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  if (!current) return null;
  const kind = kindOf(current.action);
  const style = STYLES[kind];
  const name = current.action.seatNumber === ownSeatNumber ? 'You' : current.action.username ?? `Seat ${current.action.seatNumber}`;
  const vars = { '--callout-duration': `${style.duration}ms` } as CSSProperties;

  return (
    <div
      key={current.key}
      role="status"
      aria-label={caption(current.action, kind, name)}
      className="pointer-events-none absolute inset-0 z-50 overflow-hidden"
      style={vars}
    >
      {style.flash ? <div className="callout-flash absolute inset-0" /> : null}
      {style.lines ? (
        <div
          className="callout-lines absolute inset-x-0 top-[38%] h-40 -translate-y-1/2"
          style={{
            backgroundImage: `repeating-linear-gradient(180deg, transparent 0 9px, ${style.lines} 9px 12px, transparent 12px 23px)`,
          }}
        />
      ) : null}
      <div className="absolute inset-x-0 top-[38%] flex -translate-y-1/2 justify-center">
        <div className={`callout-${style.motion}`}>
          <div className={style.shake ? 'callout-shake' : style.tap ? 'callout-tap' : ''}>
            <div className="relative flex h-[150px] w-[300px] items-center justify-center sm:h-[180px] sm:w-[360px]">
              <BubbleShape shape={style.shape} fill={style.fill} />
              <div className="relative flex flex-col items-center">
                <span
                  className={`block -skew-x-12 font-black uppercase italic leading-none tracking-tight ${style.textSize}`}
                  style={{
                    fontFamily: "Impact, 'Arial Black', 'Helvetica Neue', sans-serif",
                    color: style.text,
                    WebkitTextStroke: '2px #020617',
                    textShadow: '4px 4px 0 #020617, -1px -1px 0 #020617',
                  }}
                >
                  {style.word}
                </span>
                <span className="mt-1 max-w-[220px] truncate rounded-full bg-slate-950/85 px-3 py-0.5 text-xs font-bold text-white sm:text-sm">
                  {caption(current.action, kind, name)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
