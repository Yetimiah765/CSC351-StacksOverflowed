'use client';

import { useEffect, useRef, useState } from 'react';
import { WHEEL_ORDER, pocketColor } from '../../lib/roulette/bets';
import {
  CLOSEUP_MS,
  CLOSEUP_ZOOM_MS,
  SEGMENT,
  SPIN_MS,
  closeUpTransform,
  landingRotation,
} from '../../lib/roulette/wheel';

const FILL = { green: '#15803d', red: '#b91c1c', black: '#111827' } as const;
const COLOR_NAME = { green: 'Green', red: 'Red', black: 'Black' } as const;

function polar(radius: number, degrees: number): [number, number] {
  const rad = ((degrees - 90) * Math.PI) / 180;
  return [100 + radius * Math.cos(rad), 100 + radius * Math.sin(rad)];
}

function pocketPath(index: number): string {
  const start = index * SEGMENT - SEGMENT / 2;
  const end = start + SEGMENT;
  const [x1, y1] = polar(92, start);
  const [x2, y2] = polar(92, end);
  const [x3, y3] = polar(66, end);
  const [x4, y4] = polar(66, start);
  return `M ${x1} ${y1} A 92 92 0 0 1 ${x2} ${y2} L ${x3} ${y3} A 66 66 0 0 0 ${x4} ${y4} Z`;
}

type Phase = 'idle' | 'spinning' | 'closeup';

/**
 * A European wheel that spins to `target` whenever `spinId` changes. When it
 * comes to rest it zooms in on the winning pocket with the ball in it
 * (SRS-303.4), holds there, then calls `onStopped` as it zooms back out. The
 * `transitionend` event marks the stop, with a backup timer in case the tab
 * was hidden and the transition never ran.
 */
export default function RouletteWheel({
  target,
  spinId,
  onStopped,
}: {
  target: number | null;
  spinId: number;
  onStopped: () => void;
}) {
  const [rotation, setRotation] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const pendingStop = useRef(false);
  const closeUpTimer = useRef<number | undefined>(undefined);
  const onStoppedRef = useRef(onStopped);
  onStoppedRef.current = onStopped;

  function stop() {
    if (!pendingStop.current) return;
    pendingStop.current = false;
    setPhase('closeup');
    closeUpTimer.current = window.setTimeout(() => {
      setPhase('idle');
      onStoppedRef.current();
    }, CLOSEUP_MS);
  }

  useEffect(() => {
    if (spinId === 0 || target === null) return;
    pendingStop.current = true;
    setPhase('spinning');
    setRotation((current) => landingRotation(current, target));

    const timer = window.setTimeout(stop, SPIN_MS + 250);
    return () => window.clearTimeout(timer);
  }, [spinId, target]);

  useEffect(() => () => window.clearTimeout(closeUpTimer.current), []);

  const showBall = phase !== 'spinning' && target !== null && spinId > 0;
  const closeUp = phase === 'closeup' && target !== null;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[20rem]">
      {/* The view zooms inside a round window, like a camera moving in. */}
      <div
        className="h-full w-full overflow-hidden rounded-full"
        style={{
          boxShadow: closeUp ? '0 0 0 4px #fbbf24, 0 0 40px rgba(251,191,36,0.6)' : 'none',
          transition: `box-shadow ${CLOSEUP_ZOOM_MS}ms ease`,
        }}
      >
        <svg
          viewBox="0 0 200 200"
          className="h-full w-full drop-shadow-2xl"
          role="img"
          aria-label="Roulette wheel"
          data-closeup={closeUp ? 'true' : undefined}
          style={{
            transform: closeUp ? closeUpTransform() : 'none',
            transformOrigin: '50% 50%',
            transition: `transform ${CLOSEUP_ZOOM_MS}ms cubic-bezier(0.3, 0, 0.2, 1)`,
          }}
        >
          <defs>
            <radialGradient id="wheel-wood" cx="50%" cy="50%" r="50%">
              <stop offset="80%" stopColor="#78350f" />
              <stop offset="100%" stopColor="#451a03" />
            </radialGradient>
            <radialGradient id="wheel-cone" cx="50%" cy="45%" r="60%">
              <stop offset="0%" stopColor="#a16207" />
              <stop offset="70%" stopColor="#713f12" />
              <stop offset="100%" stopColor="#422006" />
            </radialGradient>
            <radialGradient id="wheel-ball" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </radialGradient>
          </defs>

          <circle cx="100" cy="100" r="99" fill="url(#wheel-wood)" />
          <circle cx="100" cy="100" r="93" fill="none" stroke="#fbbf24" strokeWidth="1.2" />

          <g
            style={{
              transform: `rotate(${rotation}deg)`,
              transformOrigin: '100px 100px',
              transition: phase === 'spinning' ? `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.6, 0.2, 1)` : 'none',
            }}
            onTransitionEnd={(e) => {
              if (e.target === e.currentTarget) stop();
            }}
          >
            {WHEEL_ORDER.map((n, i) => {
              const [tx, ty] = polar(81, i * SEGMENT);
              return (
                <g key={n}>
                  <path d={pocketPath(i)} fill={FILL[pocketColor(n)]} stroke="#fcd34d" strokeWidth="0.4" />
                  <text
                    x={tx}
                    y={ty}
                    fill="white"
                    fontSize="7"
                    fontWeight="700"
                    textAnchor="middle"
                    dominantBaseline="central"
                    transform={`rotate(${i * SEGMENT} ${tx} ${ty})`}
                  >
                    {n}
                  </text>
                </g>
              );
            })}
            <circle cx="100" cy="100" r="66" fill="url(#wheel-cone)" stroke="#fcd34d" strokeWidth="0.8" />
            {[0, 45, 90, 135].map((angle) => (
              <rect
                key={angle}
                x="97.5"
                y="72"
                width="5"
                height="56"
                rx="2.5"
                fill="#fde68a"
                transform={`rotate(${angle} 100 100)`}
              />
            ))}
            <circle cx="100" cy="100" r="9" fill="#fbbf24" stroke="#92400e" strokeWidth="1" />
          </g>

          {/* The winning pocket, ringed in gold during the close-up. */}
          {closeUp && (
            <path d={pocketPath(0)} fill="none" stroke="#fde047" strokeWidth="1.2" className="animate-pulse" />
          )}
          {/* The ball sits in the pocket under the pointer once the wheel stops. */}
          {showBall && <circle cx="100" cy="29" r="3.5" fill="url(#wheel-ball)" stroke="#94a3b8" strokeWidth="0.5" />}
          <path d="M 93 2 L 107 2 L 100 13 Z" fill="#fbbf24" stroke="#78350f" strokeWidth="0.8" />
        </svg>
      </div>

      {closeUp && (
        <div
          aria-live="polite"
          className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center"
        >
          <span
            className={`rounded-full border-2 border-amber-300 px-4 py-1 text-lg font-black text-white shadow-lg ${
              { green: 'bg-emerald-600', red: 'bg-red-700', black: 'bg-slate-950' }[pocketColor(target)]
            }`}
          >
            {target} {COLOR_NAME[pocketColor(target)]}
          </span>
        </div>
      )}
    </div>
  );
}
