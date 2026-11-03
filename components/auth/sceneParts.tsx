'use client';

import { Oswald } from 'next/font/google';
import { useId, type CSSProperties, type ReactNode } from 'react';
import { CardBack, CardFace } from './CasinoPieces';

// SVG drawing helpers shared by the animated headers on the sign-up page
// (CasinoMoments, SRS-101.13) and the login page (PokerWinHeader, SRS-103.10).
// Coordinates are canvas units; every move is one of the `moment-*` classes in
// app/globals.css, timed by `at()`.

// The headers' lettering (headlines), set on each header's outer element.
export const display = Oswald({ weight: ['700'], subsets: ['latin'], display: 'swap' });

export const SANS = 'ui-sans-serif, system-ui, sans-serif';

// Inline style for one move: when it starts (seconds into the scene's action)
// plus any of its CSS variables (--dx, --dy, --dr, --ds, --dur, ...).
export function at(seconds: number, vars: Record<string, string> = {}): CSSProperties {
  return { '--at': `${seconds}s`, ...vars } as CSSProperties;
}

export function useSvgId() {
  return useId().replace(/:/g, '');
}

export function Place({ x, y, r, s, children }: { x: number; y: number; r?: number; s?: number; children: ReactNode }) {
  return <g transform={`translate(${x} ${y})${r ? ` rotate(${r})` : ''}${s ? ` scale(${s})` : ''}`}>{children}</g>;
}

// Something dealt or slid in from `from` to (x, y), arriving at `t`.
export function SlideIn({ x, y, r, from, t, spin = -25, children }: { x: number; y: number; r?: number; from: [number, number]; t: number; spin?: number; children: ReactNode }) {
  return (
    <Place x={x} y={y} r={r}>
      <g className="moment-in" style={at(t, { '--dx': `${from[0] - x}px`, '--dy': `${from[1] - y}px`, '--dr': `${spin}deg`, '--ds': '0.55', '--dur': '0.4s' })}>
        {children}
      </g>
    </Place>
  );
}

// A card turned over at `t`: its back folds away, then its face opens.
export function TurnOver({ x, y, w, face, t }: { x: number; y: number; w: number; face: string; t: number }) {
  return (
    <Place x={x} y={y}>
      <g className="moment-flip-away" style={at(t)}>
        <CardBack flat width={w} />
      </g>
      <g className="moment-flip-show" style={at(t)}>
        <CardFace flat face={face} width={w} />
      </g>
    </Place>
  );
}

export function SceneDefs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fffbeb" />
        <stop offset="0.45" stopColor="#fcd34d" />
        <stop offset="1" stopColor="#d97706" />
      </linearGradient>
      {/* A soft light that fades to nothing (floodlights, bokeh), instead of a blur filter. */}
      <radialGradient id={`${id}-light`}>
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
        <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

// Big gold lettering that pops in at `t` (BLACKJACK!, GOAL!, ...), and fades
// at `until` if it would be in the way of the camera's push into the next scene.
export function Headline({ id, x, y, size, t, ds, until, children }: { id: string; x: number; y: number; size: number; t: number; ds?: number; until?: number; children: ReactNode }) {
  const lettering = (
    <g className="moment-pop" style={at(t, ds ? { '--ds': String(ds) } : {})}>
      {/* The glow: a wide, faint stroke behind the letters (no filter). */}
      <text
        textAnchor="middle"
        fontSize={size}
        fontWeight={700}
        letterSpacing={size * 0.04}
        fill="none"
        stroke="#fbbf24"
        strokeOpacity="0.3"
        strokeWidth={size * 0.3}
        strokeLinejoin="round"
        style={{ fontFamily: 'inherit' }}
      >
        {children}
      </text>
      <text
        textAnchor="middle"
        fontSize={size}
        fontWeight={700}
        letterSpacing={size * 0.04}
        fill={`url(#${id}-gold)`}
        stroke="#78350f"
        strokeWidth={size * 0.07}
        paintOrder="stroke"
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

// A small rounded label (hand totals, names), popping in at `t` if given.
export function Bubble({ x, y, text, t, fill = '#0f172a', ink = '#f8fafc', size = 12, out }: { x: number; y: number; text: string; t?: number; fill?: string; ink?: string; size?: number; out?: number }) {
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
