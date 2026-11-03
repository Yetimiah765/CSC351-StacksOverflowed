'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { RESULT_BANNER_MS, type SpinMood } from '../../lib/roulette/result';

// Confetti for a win: each piece flies out at its own angle and distance.
const CONFETTI = Array.from({ length: 18 }, (_, i) => {
  const angle = (i / 18) * Math.PI * 2;
  const distance = 90 + (i % 3) * 30;
  return {
    dx: `${Math.round(Math.cos(angle) * distance)}px`,
    dy: `${Math.round(Math.sin(angle) * distance)}px`,
    color: ['#fde047', '#f59e0b', '#34d399', '#f87171', '#60a5fa'][i % 5],
    delay: `${(i % 4) * 40}ms`,
  };
});

// Coins falling away for a loss.
const FALLING_COINS = [-60, -25, 15, 50, 80].map((x, i) => ({ x: `${x}px`, delay: `${200 + i * 90}ms` }));

/**
 * The win or loss animation over the wheel (SRS-303.5). It plays once each
 * time `spinKey` changes, then clears itself after RESULT_BANNER_MS. A spin
 * that broke even gets a plain message and no animation.
 */
export default function SpinResultBanner({
  spinKey,
  mood,
  amount,
}: {
  spinKey: number;
  mood: SpinMood | null;
  amount: number;
}) {
  const [shownKey, setShownKey] = useState<number | null>(null);

  useEffect(() => {
    if (mood === null || spinKey === 0) return;
    setShownKey(spinKey);
    const timer = window.setTimeout(() => setShownKey(null), RESULT_BANNER_MS);
    return () => window.clearTimeout(timer);
  }, [spinKey, mood]);

  if (mood === null || shownKey !== spinKey) return null;

  if (mood === 'even') {
    return (
      <div role="status" className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
        <span className="rounded-full border-2 border-slate-300 bg-slate-900/90 px-5 py-2 text-xl font-black text-slate-100 shadow-xl">
          Broke even
        </span>
      </div>
    );
  }

  if (mood === 'win') {
    return (
      <div
        key={spinKey}
        role="status"
        data-mood="win"
        className="roulette-banner pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
      >
        <div aria-hidden className="roulette-win-rays absolute h-72 w-72 rounded-full" />
        {CONFETTI.map((piece, i) => (
          <span
            key={i}
            aria-hidden
            className="roulette-confetti absolute h-3 w-2 rounded-sm"
            style={{ '--dx': piece.dx, '--dy': piece.dy, background: piece.color, animationDelay: piece.delay } as CSSProperties}
          />
        ))}
        <div className="roulette-win-pop relative flex flex-col items-center">
          <span className="text-5xl font-black italic tracking-tight text-yellow-300 drop-shadow-[0_4px_0_#92400e] [-webkit-text-stroke:2px_#78350f]">
            YOU WIN!
          </span>
          <span className="mt-1 rounded-full border-2 border-yellow-300 bg-emerald-600 px-4 py-1 text-2xl font-black text-white shadow-lg shadow-emerald-500/50">
            +{amount.toLocaleString()} coins
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      key={spinKey}
      role="status"
      data-mood="loss"
      className="roulette-banner pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
    >
      <div aria-hidden className="roulette-loss-dim absolute inset-0 rounded-full" />
      <div className="roulette-loss-drop relative flex flex-col items-center">
        <span className="text-5xl font-black italic tracking-tight text-red-400 drop-shadow-[0_4px_0_#450a0a] [-webkit-text-stroke:2px_#450a0a]">
          NO LUCK
        </span>
        <span className="mt-1 rounded-full border-2 border-red-300 bg-red-900 px-4 py-1 text-2xl font-black text-red-100 shadow-lg shadow-red-900/60">
          −{amount.toLocaleString()} coins
        </span>
        {FALLING_COINS.map((coin, i) => (
          <span
            key={i}
            aria-hidden
            className="roulette-coin-fall absolute top-full h-5 w-5 rounded-full border-2 border-amber-700 bg-amber-400"
            style={{ left: `calc(50% + ${coin.x})`, animationDelay: coin.delay } as CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}
