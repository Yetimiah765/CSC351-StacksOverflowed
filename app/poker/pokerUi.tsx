// Visual pieces shared by the poker lobby (app/poker/page.tsx) and a table
// (app/poker/[tableId]/page.tsx), so the two pages look like one room.

import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Card } from '../../lib/pokerCards';
import type { PokerTableConfig } from '../../lib/pokerTables';

export type Stakes = PokerTableConfig['stakes'];

// Players' equipped cosmetics (UR-120). The artwork is a large module, so it
// loads after the page is up, like the nav bar's outline.
const CosmeticArt = dynamic(() => import('../../components/cosmetics/CosmeticArt'), { ssr: false });

// Each stakes tier is colored like a casino chip.
export const STAKES_STYLES: Record<Stakes, { chip: string; chipEdge: string; accent: string; glow: string }> = {
  Low: {
    chip: 'bg-sky-500',
    chipEdge: 'border-white/80',
    accent: 'text-sky-300',
    glow: 'hover:border-sky-400/50 hover:shadow-sky-500/10',
  },
  Mid: {
    chip: 'bg-red-600',
    chipEdge: 'border-white/80',
    accent: 'text-red-300',
    glow: 'hover:border-red-400/50 hover:shadow-red-500/10',
  },
  High: {
    chip: 'bg-slate-950',
    chipEdge: 'border-amber-300/90',
    accent: 'text-amber-300',
    glow: 'hover:border-amber-300/50 hover:shadow-amber-400/10',
  },
};

/** The gradient "room" behind every state of both poker pages. */
export function Room({ children, center = false }: { children: ReactNode; center?: boolean }) {
  return (
    <main
      className={`min-h-page bg-slate-950 bg-[radial-gradient(ellipse_at_top,_#14532d_0%,_#052e16_30%,_#020617_70%)] px-6 py-12 text-slate-100 ${
        center ? 'flex items-center justify-center' : 'flex justify-center'
      }`}
    >
      {children}
    </main>
  );
}

export function StakesChip({ stakes, size = 'h-9 w-9' }: { stakes: Stakes; size?: string }) {
  const style = STAKES_STYLES[stakes];
  return (
    <span className={`relative inline-block shrink-0 rounded-full shadow-md shadow-black/50 ${size} ${style.chip}`}>
      <span className={`absolute inset-[3px] rounded-full border-[3px] border-dashed ${style.chipEdge}`} />
      <span className={`absolute inset-[30%] rounded-full border border-white/30 ${style.chip}`} />
    </span>
  );
}

/**
 * A player's equipped chip cosmetic, or the table's stakes chip until it's
 * known (or if they have none).
 */
export function PlayerChip({ artKey, stakes, size = 'h-9 w-9' }: { artKey?: string | null; stakes: Stakes; size?: string }) {
  if (!artKey) return <StakesChip stakes={stakes} size={size} />;
  return (
    <span className={`inline-block shrink-0 drop-shadow-[0_2px_3px_rgba(0,0,0,0.5)] ${size}`}>
      <CosmeticArt artKey={artKey} className="h-full w-full" />
    </span>
  );
}

/**
 * A player's equipped profile outline, drawn around their round photo. Put
 * it inside a `relative` box the size of the photo: the outline's drawing is
 * 1.5x the photo, so it hangs a quarter of the photo's width past each side.
 */
export function ProfileOutline({ artKey }: { artKey?: string | null }) {
  if (!artKey) return null;
  return (
    <span aria-hidden="true" className="pointer-events-none absolute -inset-[25%] z-20">
      <CosmeticArt artKey={artKey} avatar={false} className="h-full w-full" />
    </span>
  );
}

/** The "♠♥♦♣ Poker Room" eyebrow above each page's title. */
export function PokerRoomEyebrow({ children = 'Poker Room' }: { children?: ReactNode }) {
  return (
    <p className="flex items-center gap-3 text-sm uppercase tracking-[0.3em] text-emerald-300">
      <span aria-hidden className="tracking-[0.2em]">
        <span className="text-slate-200">♠</span>
        <span className="text-red-500">♥</span>
        <span className="text-red-500">♦</span>
        <span className="text-slate-200">♣</span>
      </span>
      {children}
    </p>
  );
}

export function StatPill({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5">{children}</span>;
}

export function ConnectionPill({ connected }: { connected: boolean }) {
  return (
    <span className="flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-slate-300">
      <span
        className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'animate-pulse bg-amber-400'}`}
      />
      {connected ? 'Live' : 'Connecting…'}
    </span>
  );
}

/** A centered message card with one action link, e.g. the "log in first" gate. */
export function RoomMessage({ message, href, linkText }: { message: string; href: string; linkText: string }) {
  return (
    <Room center>
      <section className="max-w-sm space-y-5 rounded-3xl border border-white/5 bg-slate-950/80 p-8 text-center shadow-2xl shadow-black/50">
        <p aria-hidden className="text-3xl tracking-[0.3em]">
          <span className="text-slate-200">♠</span>
          <span className="text-red-500">♥</span>
        </p>
        <p className="text-slate-300">{message}</p>
        <Link
          href={href}
          className="inline-block rounded-xl bg-emerald-400 px-5 py-2.5 font-semibold text-slate-950 transition hover:bg-emerald-300"
        >
          {linkText}
        </Link>
      </section>
    </Room>
  );
}

const SUIT_SYMBOLS: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const SUIT_NAMES: Record<string, string> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };

const CARD_SIZES = {
  sm: 'h-9 w-[26px] rounded-[5px] text-[10px]',
  md: 'h-14 w-10 rounded-lg text-sm',
  lg: 'h-20 w-14 rounded-lg text-xl',
};

/**
 * One playing card: face up when `card` is given, otherwise its back — the
 * owner's equipped card back when `backArtKey` is given.
 */
export function PlayingCard({
  card,
  size = 'md',
  highlight = false,
  backArtKey = null,
}: {
  card?: Card | null;
  size?: keyof typeof CARD_SIZES;
  highlight?: boolean;
  backArtKey?: string | null;
}) {
  const sizeClass = CARD_SIZES[size];

  if (!card && backArtKey) {
    return (
      <span aria-label="Face-down card" className={`${sizeClass} inline-block shrink-0 shadow-md shadow-black/60`}>
        <CosmeticArt artKey={backArtKey} className="h-full w-full" />
      </span>
    );
  }

  if (!card) {
    return (
      <span
        aria-label="Face-down card"
        className={`${sizeClass} inline-block shrink-0 border-2 border-white/80 bg-[repeating-linear-gradient(45deg,#991b1b_0_3px,#7f1d1d_3px_6px)] shadow-md shadow-black/60`}
      />
    );
  }

  const rank = card[0] === 'T' ? '10' : (card[0] as string);
  const suit = card[1] as string;
  const isRed = suit === 'h' || suit === 'd';

  return (
    <span
      aria-label={`${rank} of ${SUIT_NAMES[suit]}`}
      className={`${sizeClass} inline-flex shrink-0 flex-col items-center justify-center gap-0.5 bg-white font-bold leading-none shadow-md shadow-black/60 ${
        isRed ? 'text-red-600' : 'text-slate-900'
      } ${highlight ? 'ring-2 ring-amber-300 ring-offset-1 ring-offset-emerald-900' : ''}`}
    >
      <span>{rank}</span>
      <span>{SUIT_SYMBOLS[suit]}</span>
    </span>
  );
}

/** Where a community card will go, before it's dealt. */
export function EmptyCardSlot({ size = 'md' }: { size?: keyof typeof CARD_SIZES }) {
  return <span className={`${CARD_SIZES[size]} inline-block shrink-0 border border-dashed border-emerald-200/20`} />;
}
