'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { Cosmetic } from '../../lib/cosmetics';
import CosmeticArt from './CosmeticArt';

export interface BoxResult {
  cosmetic: Pick<Cosmetic, 'cosmeticId' | 'name' | 'category' | 'artKey' | 'isHolographic'>;
  wasDuplicate: boolean;
  refund: number;
}

const TILE_PX = 144; // matches h-36 on the window and each tile
const SPIN_MS = 1600;
const CYCLES = 5;
// Pause between the reel stopping and the result text, as in SlotReveal.
const RESULT_DELAY_MS = 250;

// The blind-box reveal (UR-127): one reel runs through the box's rewards and
// stops on the one won. It only opens after the purchase has been saved, so
// leaving mid-spin loses nothing, and nothing replays later (SRS-127.5).
// Its backdrop covers the nav bar, so the shop refreshes the nav's balance
// as soon as the purchase is saved without a duplicate refund giving the
// result away. A holographic win gets a rainbow frame and its own line (SRS-127.6), shown
// only once the reel has stopped so it doesn't give the result away either.
export default function BlindBoxReveal({
  boxName,
  rewards,
  result,
  onClose,
}: {
  boxName: string;
  rewards: Pick<Cosmetic, 'cosmeticId' | 'category' | 'artKey'>[];
  result: BoxResult;
  onClose: () => void;
}) {
  const [instant] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const [stopped, setStopped] = useState(instant);
  const [done, setDone] = useState(instant);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // A backup in case animationend arrives late (e.g. in a background tab).
  useEffect(() => {
    if (instant) return;
    const backup = setTimeout(() => setStopped(true), SPIN_MS + 50);
    return () => clearTimeout(backup);
  }, [instant]);

  useEffect(() => {
    if (!stopped || instant) return;
    const timer = setTimeout(() => setDone(true), RESULT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [stopped, instant]);

  useEffect(() => {
    if (!done) return;
    closeButtonRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [done, onClose]);

  const strip = Array.from({ length: (CYCLES + 1) * rewards.length }, (_, i) => rewards[i % rewards.length]);
  const holographic = done && result.cosmetic.isHolographic;
  const wonIndex = Math.max(0, rewards.findIndex((reward) => reward.cosmeticId === result.cosmetic.cosmeticId));
  const stopIndex = CYCLES * rewards.length + wonIndex;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${boxName} reveal`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 px-6 backdrop-blur-md"
    >
      <div
        className={`w-full max-w-sm rounded-3xl border bg-slate-900 p-6 text-center shadow-2xl ${
          holographic ? 'border-fuchsia-300 shadow-[0_0_40px_rgba(244,114,182,0.45)]' : 'border-amber-400/60 shadow-black/50'
        }`}
      >
        <p className="text-xs uppercase tracking-[0.25em] text-amber-300">{boxName}</p>

        <div className="relative mx-auto mt-5 h-36 w-36 overflow-hidden rounded-2xl border border-slate-700 bg-slate-950">
          <div
            onAnimationEnd={() => setStopped(true)}
            style={
              instant
                ? { transform: `translateY(-${stopIndex * TILE_PX}px)` }
                : ({
                    '--reel-stop': `-${stopIndex * TILE_PX}px`,
                    animation: `reel-spin ${SPIN_MS}ms cubic-bezier(0.15, 0.7, 0.25, 1) forwards`,
                  } as React.CSSProperties)
            }
          >
            {strip.map((reward, i) => (
              <div key={i} className="flex h-36 items-center justify-center p-3">
                <CosmeticArt artKey={reward.artKey} category={reward.category} />
              </div>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/60 via-transparent to-slate-950/60" />
        </div>

        {/* Sized but empty until the reel stops, so nothing gives the result away. */}
        <div aria-live="polite" className="mt-5 flex min-h-[5.5rem] flex-col items-center justify-center">
          {done ? (
            <div className="animate-box-reveal">
              {holographic ? (
                <p className="bg-gradient-to-r from-pink-300 via-amber-200 to-cyan-300 bg-clip-text text-sm font-bold uppercase tracking-[0.3em] text-transparent">
                  Holographic!
                </p>
              ) : null}
              <p className="text-2xl font-bold text-slate-100">{result.cosmetic.name}</p>
              {result.wasDuplicate ? (
                <>
                  {/* SRS-127.3 / SRS-127.4 */}
                  <p className="mt-1 text-sm text-slate-300">Duplicate: you already own this one.</p>
                  <p className="mt-1 text-lg font-semibold text-amber-300">+{result.refund.toLocaleString('en-US')} coins refunded</p>
                </>
              ) : (
                <>
                  {/* SRS-127.2 */}
                  <p className="mt-1 text-sm font-semibold text-emerald-300">New! Added to your collection.</p>
                  <Link href="/profile" className="mt-1 inline-block text-sm text-slate-300 underline underline-offset-2 hover:text-emerald-200">
                    Equip it on your profile
                  </Link>
                </>
              )}
            </div>
          ) : null}
        </div>

        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          disabled={!done}
          className="mt-4 w-full rounded-xl bg-emerald-400 px-5 py-2 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {done ? 'Close' : 'Opening…'}
        </button>
      </div>
    </div>
  );
}
