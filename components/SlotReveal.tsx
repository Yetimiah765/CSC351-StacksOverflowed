'use client';

import { useEffect, useRef, useState } from 'react';
import { DAILY_LOGIN_BOX_REWARDS } from '../lib/dailyLoginBox';

const AMOUNTS: number[] = DAILY_LOGIN_BOX_REWARDS.map((option) => option.amount);
const ITEM_HEIGHT_PX = 80; // matches h-20 on each reel and reel item

// Each reel passes through the amounts a few more times than the one before
// it and stops later, so they land left to right like a slot machine. The
// last one stops at 1.5 s, so the balance can update when it does and still
// be inside SRS-NFR-104's 2 seconds.
const REELS = [
  { cycles: 4, durationMs: 900 },
  { cycles: 5, durationMs: 1200 },
  { cycles: 6, durationMs: 1500 },
];
const LAST_REEL_MS = REELS[REELS.length - 1].durationMs;

// Pause between the last reel stopping and the "+N coins" result, so the
// result reads as its own moment.
const RESULT_DELAY_MS = 250;

// The Daily Login Box reveal (SRS-128.10): a pop-up with three reels that
// all stop on the reward. It is only shown after the reward has been saved
// (SRS-128.9), so closing the tab mid-spin loses nothing. onStopped runs
// once, when the last reel stops; the shop page refreshes the nav bar's
// balance then, so the balance doesn't give the reward away mid-spin.
export default function SlotReveal({
  reward,
  onStopped,
  onClose,
}: {
  reward: number;
  onStopped: () => void;
  onClose: () => void;
}) {
  // Visitors who turn off animations see the result right away. The window
  // check keeps this safe to render on the server.
  const [instant] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const [stopped, setStopped] = useState(instant);
  const [done, setDone] = useState(instant);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onStoppedRef = useRef(onStopped);
  onStoppedRef.current = onStopped;

  // The last reel's animationend marks the stop. The reels use a CSS
  // animation (reel-spin in app/globals.css), which is timed by the clock
  // rather than by screen redraws, so the reels always reach their stop on
  // time. The animationend event itself can arrive late (e.g. in a
  // background tab), so this backup timer fires just after the planned stop.
  useEffect(() => {
    if (instant) return;
    const backup = setTimeout(() => setStopped(true), LAST_REEL_MS + 50);
    return () => clearTimeout(backup);
  }, [instant]);

  useEffect(() => {
    if (!stopped) return;
    onStoppedRef.current();
    if (instant) return;
    const timer = setTimeout(() => setDone(true), RESULT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [stopped, instant]);

  useEffect(() => {
    if (done) closeButtonRef.current?.focus();
  }, [done]);

  useEffect(() => {
    if (!done) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [done, onClose]);

  const rewardIndex = Math.max(0, AMOUNTS.indexOf(reward));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Daily Login Box spin"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 px-6 backdrop-blur-md"
    >
      <div className="w-full max-w-md rounded-3xl border border-amber-400/60 bg-slate-900 p-6 text-center shadow-2xl shadow-black/50">
        <p className="text-xs uppercase tracking-[0.25em] text-amber-300">Daily Login Box</p>

        <div className="mt-5 grid grid-cols-3 gap-3 rounded-2xl border border-slate-700 bg-slate-950 p-3">
          {REELS.map((reel, reelIndex) => {
            // One extra pass at the end holds the amount the reel stops on.
            const strip = Array.from({ length: (reel.cycles + 1) * AMOUNTS.length }, (_, i) => AMOUNTS[i % AMOUNTS.length]);
            const stopIndex = reel.cycles * AMOUNTS.length + rewardIndex;
            const isLastReel = reelIndex === REELS.length - 1;
            return (
              <div key={reelIndex} className="relative h-20 overflow-hidden rounded-xl bg-slate-900">
                <div
                  onAnimationEnd={isLastReel ? () => setStopped(true) : undefined}
                  style={
                    instant
                      ? { transform: `translateY(-${stopIndex * ITEM_HEIGHT_PX}px)` }
                      : ({
                          '--reel-stop': `-${stopIndex * ITEM_HEIGHT_PX}px`,
                          animation: `reel-spin ${reel.durationMs}ms cubic-bezier(0.15, 0.7, 0.25, 1) forwards`,
                        } as React.CSSProperties)
                  }
                >
                  {strip.map((amount, itemIndex) => (
                    <div key={itemIndex} className="flex h-20 items-center justify-center text-3xl font-bold text-amber-300">
                      {amount.toLocaleString('en-US')}
                    </div>
                  ))}
                </div>
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/70 via-transparent to-slate-950/70" />
              </div>
            );
          })}
        </div>

        {/* Kept empty (but sized) until the reels stop, so nothing gives the
            reward away and the pop-up doesn't change size. */}
        <div aria-live="polite" className="mt-5 flex min-h-[4.5rem] flex-col items-center justify-center">
          {done ? (
            <div className="animate-box-reveal">
              <p className="text-4xl font-bold text-amber-300">+{reward.toLocaleString('en-US')} coins</p>
              <p className="mt-1 text-sm text-slate-300">Added to your balance.</p>
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
          {done ? 'Close' : 'Spinning…'}
        </button>
      </div>
    </div>
  );
}
