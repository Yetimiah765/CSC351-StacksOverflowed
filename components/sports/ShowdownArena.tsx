'use client';

// The Showdown's clash: the two team logos fly in and collide, then hold a
// tug-of-war line that sits wherever the money is (the side with more coins
// pushes it into the other side's half). When a live update brings new bets
// the line slides over with a flash and the side that grew pushes. Once
// settled, the loser is knocked back, and a winning player gets confetti.
// Keyframes are in app/globals.css; players who turn animations off get the
// same layout without the movement (.clash-anim / .clash-fx).

import { useEffect, useRef, useState } from 'react';
import type { Showdown } from '../../lib/sports/showdown';
import { clashLinePosition } from '../../lib/sports/showdown';
import { TeamCrest, teamColor } from './shared';

// When the logos meet, and so when the impact effects fire.
const IMPACT_MS = 560;
const SPARK_ANGLES = [0, 36, 72, 108, 144, 180, 216, 252, 288, 324];
const CONFETTI_COLORS = ['#fcd34d', '#34d399', '#f472b6', '#60a5fa', '#f87171', '#a78bfa'];

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function ShowdownArena({ showdown }: { showdown: Showdown }) {
  const { away, home, pool } = showdown;
  const line = clashLinePosition(away.total, pool);
  const awayColor = teamColor(away.name);
  const homeColor = teamColor(home.name);

  const settled = showdown.outcome === 'Settled';
  const loser = settled ? (showdown.winningTeamId === away.id ? 'home' : 'away') : null;
  const winner = settled ? (loser === 'away' ? 'home' : 'away') : null;
  const iWon = settled && showdown.mine !== null && showdown.mine.teamId === showdown.winningTeamId;

  // Live reactions: when a side's total goes up, flash the line and push
  // that side's logo. Uses the Web Animations API so nothing re-mounts.
  const awayPush = useRef<HTMLDivElement>(null);
  const homePush = useRef<HTMLDivElement>(null);
  const linePulse = useRef<HTMLDivElement>(null);
  const previous = useRef({ away: away.total, home: home.total });

  useEffect(() => {
    const before = previous.current;
    previous.current = { away: away.total, home: home.total };
    if (prefersReducedMotion()) return;

    const grew = [
      { ref: awayPush, grew: away.total > before.away, toward: 1 },
      { ref: homePush, grew: home.total > before.home, toward: -1 },
    ].filter((side) => side.grew);
    if (grew.length === 0) return;

    for (const side of grew) {
      side.ref.current?.animate(
        [
          { transform: 'none' },
          { transform: `translateX(${side.toward * 14}%) scale(1.08)`, offset: 0.35 },
          { transform: 'none' },
        ],
        { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' },
      );
    }
    linePulse.current?.animate(
      [
        { opacity: 0, transform: 'translateX(-50%) scaleY(0.3)' },
        { opacity: 1, transform: 'translateX(-50%) scaleY(1.05)', offset: 0.3 },
        { opacity: 0, transform: 'translateX(-50%) scaleY(1.4)' },
      ],
      { duration: 700, easing: 'ease-out' },
    );
  }, [away.total, home.total]);

  // The entrance plays once, when the card first appears.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setEntered(true), 1600);
    return () => clearTimeout(timer);
  }, []);

  const crestAnimation = (side: 'away' | 'home') => {
    const entrance = `clash-in-${side === 'away' ? 'left' : 'right'} 900ms cubic-bezier(.2,.8,.2,1) both`;
    const knockout = `clash-knockout-${side === 'away' ? 'left' : 'right'} 700ms ease-in 1300ms forwards`;
    return loser === side ? `${entrance}, ${knockout}` : entrance;
  };

  return (
    <div
      className="clash-anim relative h-40 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 sm:h-52"
      style={{ animation: `clash-shake 380ms ease-out ${IMPACT_MS}ms both` }}
      role="img"
      aria-label={`${away.name} versus ${home.name}${pool > 0 ? `, ${Math.round((away.total / pool) * 100)}% of the pool on ${away.name}` : ''}${
        winner ? `, ${winner === 'away' ? away.name : home.name} won` : ''
      }`}
    >
      {/* Each team's half, split at the clash line. */}
      <div
        className="clash-anim absolute inset-y-0 left-0 transition-[width] duration-700 ease-out"
        style={{ width: `${line}%`, background: `linear-gradient(90deg, transparent, ${awayColor}66)` }}
      />
      <div
        className="clash-anim absolute inset-y-0 right-0 transition-[width] duration-700 ease-out"
        style={{ width: `${100 - line}%`, background: `linear-gradient(90deg, ${homeColor}66, transparent)` }}
      />

      {/* The clash line, plus the flash it gives off when a bet comes in. */}
      <div
        className="clash-anim absolute inset-y-0 w-1 -translate-x-1/2 bg-white/80 shadow-[0_0_18px_4px_rgba(255,255,255,0.45)] transition-[left] duration-700 ease-out"
        style={{ left: `${line}%` }}
      />
      <div
        ref={linePulse}
        className="clash-fx pointer-events-none absolute inset-y-0 w-10 bg-gradient-to-r from-transparent via-amber-200/80 to-transparent opacity-0 transition-[left] duration-700 ease-out"
        style={{ left: `${line}%`, transform: 'translateX(-50%)' }}
      />

      {/* Impact: flash, shockwave, and sparks where the logos meet. */}
      {!entered ? (
        <div className="clash-fx pointer-events-none absolute top-1/2" style={{ left: `${line}%` }}>
          <span
            className="absolute left-0 top-0 h-28 w-28 rounded-full bg-white blur-md"
            style={{ animation: `clash-flash 600ms ease-out ${IMPACT_MS}ms both` }}
          />
          {/* The ring and sparks draw above the logos (z-10) so they burst past them. */}
          <span
            className="absolute left-0 top-0 z-10 h-24 w-24 rounded-full border-4 border-amber-300"
            style={{ animation: `clash-ring 800ms ease-out ${IMPACT_MS}ms both` }}
          />
          {SPARK_ANGLES.map((angle, i) => (
            <span
              key={angle}
              className="absolute left-0 top-0 z-10 h-1 w-7 origin-left rounded-full bg-amber-200 shadow-[0_0_6px_rgba(253,230,138,0.9)]"
              style={
                {
                  '--spark-angle': `${angle}deg`,
                  '--spark-reach': `${110 + (i % 3) * 35}px`,
                  animation: `clash-spark 650ms ease-out ${IMPACT_MS}ms both`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      ) : null}

      {/* The logos, each pressed against its side of the line. */}
      <div
        className="clash-anim absolute top-1/2 -translate-y-1/2 transition-[right] duration-700 ease-out"
        style={{ right: `calc(${100 - line}% + 6px)` }}
      >
        <div ref={awayPush}>
          <div
            className={`clash-anim ${loser === 'away' ? 'opacity-60 motion-safe:opacity-100' : ''}`}
            style={{ animation: crestAnimation('away') }}
          >
            <span className={`block rounded-full ${winner === 'away' ? 'ring-4 ring-amber-300 ring-offset-4 ring-offset-slate-950' : ''}`}>
              <TeamCrest name={away.name} size="lg" />
            </span>
          </div>
        </div>
      </div>
      <div
        className="clash-anim absolute top-1/2 -translate-y-1/2 transition-[left] duration-700 ease-out"
        style={{ left: `calc(${line}% + 6px)` }}
      >
        <div ref={homePush}>
          <div
            className={`clash-anim ${loser === 'home' ? 'opacity-60 motion-safe:opacity-100' : ''}`}
            style={{ animation: crestAnimation('home') }}
          >
            <span className={`block rounded-full ${winner === 'home' ? 'ring-4 ring-amber-300 ring-offset-4 ring-offset-slate-950' : ''}`}>
              <TeamCrest name={home.name} size="lg" />
            </span>
          </div>
        </div>
      </div>

      {/* VS badge, or the result once settled. */}
      <span
        className="clash-anim absolute top-2 -translate-x-1/2 rounded-lg bg-slate-950/80 px-2 py-0.5 text-xl font-black italic tracking-tight text-amber-300 shadow-lg transition-[left] duration-700 ease-out sm:top-3 sm:text-2xl"
        style={{ left: `${line}%`, animation: `clash-pop 450ms cubic-bezier(.2,.8,.2,1) ${IMPACT_MS + 80}ms both` }}
      >
        {winner ? 'WIN' : showdown.outcome === 'Refunded' ? 'PUSH' : 'VS'}
      </span>

      {showdown.outcome === 'Refunded' ? (
        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/90 px-3 py-1 text-xs text-slate-300">
          No winner · everyone refunded
        </span>
      ) : null}

      {/* Confetti when the player's side won. */}
      {iWon ? (
        <div className="clash-fx pointer-events-none absolute inset-0">
          {Array.from({ length: 28 }, (_, i) => (
            <span
              key={i}
              className="absolute top-0 h-2.5 w-1.5 rounded-sm"
              style={
                {
                  left: `${(i * 37) % 100}%`,
                  backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                  '--confetti-drift': `${((i * 53) % 80) - 40}px`,
                  '--confetti-spin': `${360 + ((i * 97) % 540)}deg`,
                  animation: `clash-confetti ${1400 + ((i * 71) % 900)}ms ease-in ${1500 + ((i * 43) % 700)}ms both`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
