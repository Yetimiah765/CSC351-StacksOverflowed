'use client';

import { useEffect, useRef, useState } from 'react';
import { WHEEL_ORDER, pocketColor } from '../../lib/roulette/bets';

const SEGMENT = 360 / WHEEL_ORDER.length;
// SRS-302.7: the wheel stops on the winning number within 1.5 s of the result arriving.
const SPIN_MS = 1500;

const FILL = { green: '#15803d', red: '#b91c1c', black: '#111827' } as const;

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

/**
 * A European wheel that spins to `target` whenever `spinId` changes and calls
 * `onStopped` once it comes to rest with that pocket under the pointer. The
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
  const [spinning, setSpinning] = useState(false);
  const pendingStop = useRef(false);
  const onStoppedRef = useRef(onStopped);
  onStoppedRef.current = onStopped;

  function stop() {
    if (!pendingStop.current) return;
    pendingStop.current = false;
    setSpinning(false);
    onStoppedRef.current();
  }

  useEffect(() => {
    if (spinId === 0 || target === null) return;
    const landing = (360 - WHEEL_ORDER.indexOf(target) * SEGMENT) % 360;
    pendingStop.current = true;
    setSpinning(true);
    // Four full turns, then on to the winning pocket.
    setRotation((current) => current + 360 * 4 + ((landing - (current % 360) + 360) % 360));

    const timer = window.setTimeout(stop, SPIN_MS + 250);
    return () => window.clearTimeout(timer);
  }, [spinId, target]);

  const showBall = !spinning && target !== null && spinId > 0;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[20rem]">
      <svg viewBox="0 0 200 200" className="h-full w-full drop-shadow-2xl" role="img" aria-label="Roulette wheel">
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
        </defs>

        <circle cx="100" cy="100" r="99" fill="url(#wheel-wood)" />
        <circle cx="100" cy="100" r="93" fill="none" stroke="#fbbf24" strokeWidth="1.2" />

        <g
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: '100px 100px',
            transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.6, 0.2, 1)` : 'none',
          }}
          onTransitionEnd={stop}
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

        {/* The ball sits in the pocket under the pointer once the wheel stops. */}
        {showBall && <circle cx="100" cy="29" r="3.5"fill="#f8fafc" stroke="#94a3b8" strokeWidth="0.6" />}
        <path d="M 93 2 L 107 2 L 100 13 Z" fill="#fbbf24" stroke="#78350f" strokeWidth="0.8" />
      </svg>
    </div>
  );
}
