'use client';

import { Oswald } from 'next/font/google';
import { useEffect, useRef, useState } from 'react';
import { DAILY_LOGIN_BOX_REWARDS } from '../lib/dailyLoginBox';

const AMOUNTS: number[] = DAILY_LOGIN_BOX_REWARDS.map((option) => option.amount);

// The casino floor's sign lettering, for the machine's marquee.
const display = Oswald({ weight: ['700'], subsets: ['latin'], display: 'swap' });

// Each reel window (h-36) shows the amount on the pay line with the ones
// above and below peeking in, like a real reel; each amount is h-16.
const ITEM_HEIGHT_PX = 64;
const WINDOW_HEIGHT_PX = 144;
const CENTRE_OFFSET_PX = (WINDOW_HEIGHT_PX - ITEM_HEIGHT_PX) / 2;

// The lever is pulled first (lever-rod / lever-ball in app/globals.css): it
// reaches the bottom at LEVER_DOWN_MS, when the reels start, and springs back
// by LEVER_MS. Each reel then passes through the amounts a few more times
// than the one before it and stops later, so they land left to right.
const LEVER_MS = 900;
const LEVER_DOWN_MS = 380;
const LEVER_LENGTH_PX = 92;
const REELS = [
  { cycles: 4, durationMs: 900 },
  { cycles: 5, durationMs: 1200 },
  { cycles: 6, durationMs: 1500 },
];
const LAST_STOP_MS = LEVER_DOWN_MS + REELS[REELS.length - 1].durationMs;

// Pause between the last reel stopping and the win, so it reads as its own moment.
const RESULT_DELAY_MS = 250;

const BULBS_ACROSS = 9;
const BULBS_DOWN = 7;

// The Daily Login Box reveal (SRS-128.10): a slot machine pops up, its lever
// is pulled, and its three reels spin and stop on the reward. It is only
// shown after the reward has been saved (SRS-128.9), so closing the tab
// mid-spin loses nothing. Its backdrop covers the nav bar, so the shop page
// refreshes the nav's balance as soon as the reward is saved without the
// balance giving the reward away.
export default function SlotReveal({
  reward,
  onClose,
}: {
  reward: number;
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

  // The last reel's animationend marks the stop. The reels use a CSS
  // animation (reel-spin in app/globals.css), which is timed by the clock
  // rather than by screen redraws, so the reels always reach their stop on
  // time. The animationend event itself can arrive late (e.g. in a
  // background tab), so this backup timer fires just after the planned stop.
  useEffect(() => {
    if (instant) return;
    const backup = setTimeout(() => setStopped(true), LAST_STOP_MS + 50);
    return () => clearTimeout(backup);
  }, [instant]);

  useEffect(() => {
    if (!stopped || instant) return;
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
  // The bulbs chase while the machine runs, and flash quickly for the win.
  const bulb = (index: number) => ({
    animation: `slot-bulb ${done ? 450 : 1200}ms ease-in-out ${index * (done ? 60 : 130)}ms infinite`,
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Daily Login Box spin"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/90 px-6 py-8 backdrop-blur-md"
    >
      <div className="w-full max-w-sm text-center">
        {/* The machine, with its lever hanging off the right side. */}
        <div className="relative mr-7">
          {/* Marquee: the lit sign on top. */}
          <div className="relative mx-5 rounded-t-[2.75rem] border-4 border-b-0 border-amber-300 bg-gradient-to-b from-rose-600 to-rose-900 px-4 pb-3 pt-5 shadow-[0_-8px_30px_rgba(251,191,36,0.25)]">
            <div aria-hidden="true" className="absolute inset-x-6 top-1.5 flex justify-between">
              {Array.from({ length: BULBS_ACROSS }, (_, i) => (
                <span key={i} className="slot-bulb h-2 w-2 rounded-full bg-amber-100 shadow-[0_0_8px_2px_rgba(253,230,138,0.9)]" style={bulb(i)} />
              ))}
            </div>
            <p
              className={`${display.className} text-2xl uppercase tracking-[0.14em] text-amber-200 [text-shadow:0_0_6px_rgba(253,230,138,0.9),0_0_18px_rgba(251,146,60,0.7)]`}
            >
              Daily Login Box
            </p>
          </div>

          {/* Cabinet */}
          <div className="relative rounded-3xl border-4 border-amber-300 bg-gradient-to-b from-rose-800 via-rose-900 to-rose-950 px-7 pb-4 pt-5 shadow-[0_25px_60px_rgba(0,0,0,0.7),inset_0_2px_0_rgba(255,255,255,0.15)]">
            {/* Bulbs down both sides */}
            {(['left-2', 'right-2'] as const).map((side) => (
              <div key={side} aria-hidden="true" className={`absolute ${side} inset-y-5 flex flex-col justify-between`}>
                {Array.from({ length: BULBS_DOWN }, (_, i) => (
                  <span key={i} className="slot-bulb h-2 w-2 rounded-full bg-amber-100 shadow-[0_0_8px_2px_rgba(253,230,138,0.9)]" style={bulb(i + 3)} />
                ))}
              </div>
            ))}

            {/* The reels, behind a chrome frame and glass, with the pay line across them. */}
            <div className="rounded-2xl bg-gradient-to-b from-slate-100 via-slate-400 to-slate-200 p-1.5 shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
              <div className="relative grid grid-cols-3 gap-1.5 rounded-xl bg-slate-950 p-1.5">
                {REELS.map((reel, reelIndex) => {
                  // One extra pass at the end holds the amount the reel stops on,
                  // plus one more so the next amount always peeks in below it.
                  const strip = Array.from({ length: (reel.cycles + 1) * AMOUNTS.length + 1 }, (_, i) => AMOUNTS[i % AMOUNTS.length]);
                  const stopIndex = reel.cycles * AMOUNTS.length + rewardIndex;
                  const stopAt = `${CENTRE_OFFSET_PX - stopIndex * ITEM_HEIGHT_PX}px`;
                  const isLastReel = reelIndex === REELS.length - 1;
                  return (
                    <div key={reelIndex} className="relative h-36 overflow-hidden rounded-lg bg-gradient-to-b from-stone-300 via-stone-50 to-stone-300">
                      <div
                        onAnimationEnd={isLastReel ? (event) => event.animationName === 'reel-spin' && setStopped(true) : undefined}
                        style={
                          instant
                            ? { transform: `translateY(${stopAt})` }
                            : ({
                                '--reel-start': `${CENTRE_OFFSET_PX}px`,
                                '--reel-stop': stopAt,
                                animation: [
                                  `reel-spin ${reel.durationMs}ms cubic-bezier(0.15, 0.7, 0.25, 1) ${LEVER_DOWN_MS}ms both`,
                                  `reel-blur ${reel.durationMs}ms linear ${LEVER_DOWN_MS}ms both`,
                                ].join(', '),
                              } as React.CSSProperties)
                        }
                      >
                        {strip.map((amount, itemIndex) => (
                          <div
                            key={itemIndex}
                            className="flex h-16 items-center justify-center text-2xl font-black leading-none text-red-700 [text-shadow:0_1px_0_rgba(255,255,255,0.7)]"
                          >
                            {amount.toLocaleString('en-US')}
                          </div>
                        ))}
                      </div>
                      {/* The reel's curve: darker towards the top and bottom. */}
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/45" />
                    </div>
                  );
                })}
                {/* Pay line */}
                <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/70 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
                {/* Glass */}
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-white/25 via-white/0 to-white/10" />
              </div>
            </div>

            {/* The win display: nothing given away until the reels stop. */}
            <div className="mt-4 rounded-lg border-2 border-black bg-black px-3 py-1.5 font-mono text-xl font-bold uppercase tracking-[0.25em] text-red-500 shadow-[inset_0_0_12px_rgba(239,68,68,0.35)] [text-shadow:0_0_8px_rgba(239,68,68,0.9)]">
              {done ? `Win ${reward.toLocaleString('en-US')}` : 'Good luck'}
            </div>

            {/* Coin tray */}
            <div aria-hidden="true" className="mx-6 mt-4 h-6 rounded-b-2xl rounded-t-md border-t-4 border-amber-300/70 bg-gradient-to-b from-black to-slate-800 shadow-[inset_0_4px_8px_rgba(0,0,0,0.9)]" />
          </div>

          <Lever animate={!instant} />
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

// The lever on the machine's right side: a chrome mount and hub, a rod, and
// a red ball. Pulled, it swings down towards the viewer and springs back up
// (lever-rod / lever-ball in app/globals.css).
function Lever({ animate }: { animate: boolean }) {
  const timing = `${LEVER_MS}ms ease-in-out both`;
  return (
    <div
      aria-hidden="true"
      className="absolute -right-7 top-[42%] h-10 w-8"
      style={{ '--lever-length': `${LEVER_LENGTH_PX}px` } as React.CSSProperties}
    >
      {/* Mount on the cabinet's side, and the hub the lever turns on */}
      <div className="absolute inset-y-0 left-0 w-3 rounded-r-md bg-gradient-to-r from-slate-500 to-slate-200" />
      <div className="absolute left-1.5 top-1.5 h-7 w-7 rounded-full bg-gradient-to-br from-slate-50 via-slate-300 to-slate-600 shadow-[0_2px_6px_rgba(0,0,0,0.6)]" />
      {/* Rod, pivoting on the hub's centre */}
      <div
        className="absolute bottom-5 left-[17px] w-2 origin-bottom rounded-full bg-gradient-to-r from-slate-400 via-slate-50 to-slate-500"
        style={{ height: LEVER_LENGTH_PX, animation: animate ? `lever-rod ${timing}` : undefined }}
      />
      {/* Ball at the rod's end */}
      <div
        className="absolute left-[3px] h-9 w-9 rounded-full bg-[radial-gradient(circle_at_32%_30%,#fecaca_0%,#ef4444_38%,#991b1b_75%,#450a0a_100%)] shadow-[0_4px_10px_rgba(0,0,0,0.6)]"
        style={{ bottom: 20 + LEVER_LENGTH_PX - 18, animation: animate ? `lever-ball ${timing}` : undefined }}
      />
    </div>
  );
}
