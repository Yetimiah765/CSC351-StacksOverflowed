'use client';

import { useId } from 'react';

// Playing cards and poker chips drawn in SVG, shared by the sign-up page's
// falling pieces (CardsAndChipsBackground) and its game moments (CasinoMoments).
// Every chip colour has its own value and every card back its own colour, so
// the page can show each one at most once at a time.

export type ChipColor = 'white' | 'red' | 'blue' | 'green' | 'orange' | 'black' | 'teal' | 'purple' | 'gold' | 'pink';

const CHIP_COLORS: Record<ChipColor, { body: string; center: string; spots: string; ink: string; value: string }> = {
  white: { body: '#e2e8f0', center: '#cbd5e1', spots: '#2563eb', ink: '#1e293b', value: '1' },
  red: { body: '#dc2626', center: '#b91c1c', spots: '#f8fafc', ink: '#f8fafc', value: '5' },
  blue: { body: '#2563eb', center: '#1d4ed8', spots: '#f8fafc', ink: '#f8fafc', value: '10' },
  green: { body: '#16a34a', center: '#15803d', spots: '#f8fafc', ink: '#f8fafc', value: '25' },
  orange: { body: '#ea580c', center: '#c2410c', spots: '#f8fafc', ink: '#f8fafc', value: '50' },
  black: { body: '#1f2937', center: '#111827', spots: '#fbbf24', ink: '#fbbf24', value: '100' },
  teal: { body: '#0d9488', center: '#0f766e', spots: '#f8fafc', ink: '#f8fafc', value: '250' },
  purple: { body: '#7c3aed', center: '#6d28d9', spots: '#f8fafc', ink: '#f8fafc', value: '500' },
  gold: { body: '#eab308', center: '#ca8a04', spots: '#1e293b', ink: '#1e293b', value: '1000' },
  pink: { body: '#db2777', center: '#be185d', spots: '#f8fafc', ink: '#f8fafc', value: '5000' },
};

/** A chip colour's paints, for drawing chips other ways (e.g. stacks seen side on). */
export function chipColors(color: ChipColor) {
  return CHIP_COLORS[color];
}

export type BackColor = 'red' | 'navy' | 'green' | 'purple' | 'black' | 'teal';

const BACK_COLORS: Record<BackColor, { body: string; lines: string; center: string }> = {
  red: { body: '#991b1b', lines: '#fca5a5', center: '#7f1d1d' },
  navy: { body: '#1e3a8a', lines: '#93c5fd', center: '#172554' },
  green: { body: '#166534', lines: '#86efac', center: '#14532d' },
  purple: { body: '#5b21b6', lines: '#c4b5fd', center: '#4c1d95' },
  black: { body: '#18181b', lines: '#a1a1aa', center: '#09090b' },
  teal: { body: '#115e59', lines: '#5eead4', center: '#134e4a' },
};

export function CardFace({ face, width }: { face: string; width: number }) {
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

export function CardBack({ width, color = 'red' }: { width: number; color?: BackColor }) {
  const id = useId().replace(/:/g, '');
  const c = BACK_COLORS[color];
  return (
    <svg viewBox="0 0 50 70" width={width} height={width * 1.4} className="block drop-shadow-lg">
      <defs>
        <pattern id={`lattice-${id}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0H6M0 0V6" stroke={c.lines} strokeOpacity="0.35" strokeWidth="1" />
        </pattern>
      </defs>
      <rect x="0.5" y="0.5" width="49" height="69" rx="5" fill={c.body} stroke="#f8fafc" strokeOpacity="0.7" />
      <rect x="4" y="4" width="42" height="62" rx="3" fill={`url(#lattice-${id})`} stroke="#fde68a" strokeOpacity="0.6" />
      <circle cx="25" cy="35" r="8" fill={c.center} stroke="#fde68a" strokeOpacity="0.7" />
      <text x="25" y="39.5" fontSize="12" textAnchor="middle" fill="#fde68a">♠</text>
    </svg>
  );
}

export function Chip({ color, size }: { color: ChipColor; size: number }) {
  const c = CHIP_COLORS[color];
  return (
    <svg viewBox="0 0 60 60" width={size} height={size} className="block drop-shadow-lg">
      <circle cx="30" cy="30" r="29" fill={c.body} />
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x="26.5" y="1" width="7" height="9" rx="1.5" fill={c.spots} transform={`rotate(${i * 45} 30 30)`} />
      ))}
      <circle cx="30" cy="30" r="19" fill="none" stroke={c.spots} strokeOpacity="0.8" strokeWidth="1.5" strokeDasharray="3 3" />
      <circle cx="30" cy="30" r="15" fill={c.center} />
      <text x="30" y={c.value.length > 3 ? 33.5 : 34.5} fontSize={c.value.length > 3 ? 9 : 12} fontWeight="700" textAnchor="middle" fill={c.ink} fontFamily="ui-sans-serif, system-ui, sans-serif">
        {c.value}
      </text>
    </svg>
  );
}
