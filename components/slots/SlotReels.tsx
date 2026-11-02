'use client';

import { useEffect, useRef } from 'react';
import SlotSymbol from './SlotSymbol';
import { SYMBOL_WEIGHTS, type SlotSymbolName } from '../../lib/slots';

// SRS-307.6: the reels stop left to right, the last within 1.5 s of the result.
export const REEL_STOP_MS = [900, 1200, 1500] as const;
const CYCLES = [3, 4, 5];
const SYMBOLS = SYMBOL_WEIGHTS.map(([symbol]) => symbol);

/** The symbols one reel scrolls past: from what it showed, round a few times, to where it stops. */
export function reelStrip(from: SlotSymbolName, to: SlotSymbolName, cycles: number): SlotSymbolName[] {
  const start = SYMBOLS.indexOf(from);
  const strip = Array.from({ length: cycles * SYMBOLS.length }, (_, i) => SYMBOLS[(start + i) % SYMBOLS.length]);
  return [...strip, to];
}

/**
 * Three reels in a window with the payline across the middle. Whenever
 * `spinId` changes each reel scrolls from `from` to `reels` and stops, left
 * to right; `onStopped` fires once the last one has. The animation is
 * clock-timed CSS (reel-spin in app/globals.css), and the last reel's
 * animationend marks the stop, with a backup timer in case the tab was
 * hidden and the animation never ran.
 */
export default function SlotReels({
  from,
  reels,
  spinId,
  onStopped,
}: {
  from: SlotSymbolName[];
  reels: SlotSymbolName[];
  spinId: number;
  onStopped: () => void;
}) {
  const pending = useRef(false);
  const onStoppedRef = useRef(onStopped);
  onStoppedRef.current = onStopped;

  function stop() {
    if (!pending.current) return;
    pending.current = false;
    onStoppedRef.current();
  }

  useEffect(() => {
    if (spinId === 0) return;
    pending.current = true;
    const timer = window.setTimeout(stop, REEL_STOP_MS[2] + 300);
    return () => window.clearTimeout(timer);
  }, [spinId]);

  return (
    <div className="relative grid grid-cols-3 gap-3 rounded-2xl border-4 border-amber-300 bg-slate-950 p-3">
      {reels.map((symbol, i) => {
        const strip = spinId === 0 ? [symbol] : reelStrip(from[i], symbol, CYCLES[i]);
        const stopAt = `-${((strip.length - 1) / strip.length) * 100}%`;
        return (
          <div
            key={i}
            aria-label={`Reel ${i + 1}: ${symbol}`}
            className="relative h-32 overflow-hidden rounded-xl bg-gradient-to-b from-slate-300 via-white to-slate-300 shadow-inner sm:h-40"
          >
            <div
              // Remounts each spin so the animation plays again.
              key={spinId}
              className="absolute inset-x-0 top-0"
              style={
                spinId === 0
                  ? undefined
                  : ({
                      '--reel-stop': stopAt,
                      animation: `reel-spin ${REEL_STOP_MS[i]}ms cubic-bezier(0.2, 0.6, 0.25, 1) forwards`,
                    } as React.CSSProperties)
              }
              onAnimationEnd={i === 2 ? stop : undefined}
            >
              {strip.map((s, j) => (
                <div key={j} className="flex h-32 items-center justify-center sm:h-40">
                  <SlotSymbol name={s} />
                </div>
              ))}
            </div>
            {/* Shading at the top and bottom, like a curved reel. */}
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/25" />
          </div>
        );
      })}
      <div aria-hidden className="pointer-events-none absolute inset-x-1 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/70" />
    </div>
  );
}
