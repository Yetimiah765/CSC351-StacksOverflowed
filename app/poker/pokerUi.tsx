// Visual pieces shared by the poker lobby (app/poker/page.tsx) and a table
// (app/poker/[tableId]/page.tsx), so the two pages look like one room.

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { PokerTableConfig } from '../../lib/pokerTables';

export type Stakes = PokerTableConfig['stakes'];

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
