'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import SlotSymbol from './SlotSymbol';
import { REEL_CYCLES, REEL_STOP_MS, reelStopOffset, reelStrip } from '../../lib/slotReels';
import type { SlotSymbolName } from '../../lib/slots';

/**
 * The reel window: three reels side by side behind glass, with the payline
 * marked by arrows at both ends. Whenever `spinId` changes each reel scrolls
 * from `from` to `reels`, blurred while it moves, and stops with a small
 * bounce, left to right (SRS-307.6); `onStopped` fires once the last one has.
 * The animation is clock-timed CSS (reel-spin in app/globals.css), and the
 * last reel's animationend marks the stop, with a backup timer in case the tab
 * was hidden and the animation never ran.
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
    <div className="relative rounded-2xl bg-gradient-to-b from-zinc-300 via-zinc-500 to-zinc-700 p-1.5 shadow-[0_6px_18px_rgba(0,0,0,0.6)]">
      <div className="relative grid grid-cols-3 gap-2 rounded-xl bg-black p-2 shadow-[inset_0_6px_16px_rgba(0,0,0,0.9)]">
        {reels.map((symbol, i) => {
          const strip = spinId === 0 ? [symbol] : reelStrip(from[i], symbol, REEL_CYCLES[i]);
          return (
            <div
              key={i}
              aria-label={`Reel ${i + 1}: ${symbol}`}
              className="relative h-32 overflow-hidden rounded-lg bg-gradient-to-b from-zinc-400 via-white to-zinc-400 sm:h-40"
            >
              <div
                // Remounts each spin so the animation plays again.
                key={spinId}
                className="absolute inset-x-0 top-0"
                style={
                  spinId === 0
                    ? undefined
                    : ({
                        '--reel-stop': reelStopOffset(strip.length),
                        // The strip scrolls (overshooting a little, then settling) and is
                        // blurred while it moves fast (slots-reel-blur in app/globals.css).
                        animation: `reel-spin ${REEL_STOP_MS[i]}ms cubic-bezier(0.2, 0.6, 0.25, 1.06) forwards, slots-reel-blur ${REEL_STOP_MS[i]}ms ease-out forwards`,
                      } as CSSProperties)
                }
                onAnimationEnd={i === 2 ? stop : undefined}
              >
                {strip.map((s, j) => (
                  <div key={j} className="flex h-32 items-center justify-center drop-shadow-[0_3px_2px_rgba(0,0,0,0.35)] sm:h-40">
                    <SlotSymbol name={s} />
                  </div>
                ))}
              </div>
              {/* Curved-reel shading, then the glass glare across the top. */}
              <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/45" />
              <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/35 to-transparent" />
            </div>
          );
        })}
        {/* The payline, with an arrow at each end. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-2 top-1/2 h-[3px] -translate-y-1/2 bg-red-500/80 shadow-[0_0_8px_#ef4444]" />
      </div>
      <span aria-hidden className="absolute -left-3 top-1/2 h-0 w-0 -translate-y-1/2 border-y-[10px] border-l-[12px] border-y-transparent border-l-red-500 drop-shadow-[0_0_4px_#ef4444]" />
      <span aria-hidden className="absolute -right-3 top-1/2 h-0 w-0 -translate-y-1/2 border-y-[10px] border-r-[12px] border-y-transparent border-r-red-500 drop-shadow-[0_0_4px_#ef4444]" />
    </div>
  );
}
