'use client';

// SRS-205.2: confirms the wager was taken and recorded as active. Shown for a
// moment after a regular bet goes through, in place of a text notice: a "BET
// PLACED" stamp slams down with a burst of coins, with the bet in one line
// underneath. Click anywhere, press Escape, or wait to close it.
// Keyframes (bet-stamp-*) are in app/globals.css; with reduced motion the
// stamp just appears.

import { useEffect } from 'react';

export type PlacedBet = { amount: number; label: string; odds: string; payout: number };

const SHOW_MS = 2200;
const COINS = 12;

export function BetPlacedStamp({ bet, onDone }: { bet: PlacedBet; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, SHOW_MS);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [onDone]);

  return (
    <div
      className="bet-stamp-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      onClick={onDone}
      role="status"
      aria-live="polite"
    >
      <div className="relative flex flex-col items-center">
        {/* Coins flying out from behind the stamp. */}
        <div className="bet-stamp-fx pointer-events-none absolute left-1/2 top-1/2" aria-hidden="true">
          {Array.from({ length: COINS }, (_, i) => (
            <span
              key={i}
              className="bet-stamp-coin absolute -left-2.5 -top-2.5 h-5 w-5 rounded-full border-2 border-amber-200 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]"
              style={
                {
                  '--coin-angle': `${(360 / COINS) * i + (i % 2) * 12}deg`,
                  '--coin-reach': `${120 + (i % 3) * 40}px`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>

        <div className="bet-stamp rounded-2xl border-4 border-sky-300 bg-slate-950/90 px-8 py-4 shadow-[0_0_40px_rgba(56,189,248,0.45)]">
          <p className="text-4xl font-black uppercase italic tracking-tight text-sky-300 sm:text-5xl">Bet placed</p>
        </div>

        <p className="bet-stamp-details mt-5 rounded-full bg-slate-900/95 px-4 py-2 text-sm text-slate-200">
          <span className="font-semibold tabular-nums">{bet.amount.toLocaleString()}</span> on{' '}
          <span className="font-semibold">{bet.label}</span> @ {bet.odds} · pays{' '}
          <span className="font-semibold tabular-nums text-emerald-300">{bet.payout.toLocaleString()}</span>
        </p>
      </div>
    </div>
  );
}
