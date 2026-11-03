'use client';

import { useEffect, useId, useState, type CSSProperties, type ComponentType } from 'react';
import { CardBack, CardFace, Chip } from './CasinoPieces';

// SRS-101.13: game moments flashing behind the sign-up form, one at a time
// (laptop and desktop only). Each moment flashes in at one of six spots
// around the form, tilted like a photo, plays a short scene from one of the
// site's games, and holds; the next starts, somewhere else, as it fades, so
// two only ever overlap for a moment. Neighbouring moments share no card,
// chip or label (blackjack and poker, which both use A♠ and red and black
// chips, and the two sports moments are never back to back), and the falling
// cards and chips use none of them either, so nothing shows twice at once.
// The `moment-*` keyframes are in app/globals.css. Each moment is keyed by
// its step, so its animations play from the start; every move rests at its
// end state, so with reduced motion (animations off, and no cycling) the
// first moment shows finished and still.

// A moment holds for SHOW_MS, then fades over the next 800 ms while the next
// one comes in.
const SHOW_MS = 5000;
const LIFE_MS = 5800;

type Scene = { label: string; Draw: ComponentType };

const SCENES: Scene[] = [
  { label: 'Blackjack', Draw: BlackjackMoment },
  { label: 'Sports', Draw: GoalMoment },
  { label: 'Slots', Draw: JackpotMoment },
  { label: 'Poker', Draw: PokerMoment },
  { label: 'Roulette', Draw: RouletteMoment },
  { label: 'Sports', Draw: BetSlipMoment },
];

type Spot = { position: CSSProperties; rotate: number };

// Around the form, alternating sides. Each round of six the moments move on
// one spot, so a scene doesn't always come back in the same place.
const SPOTS: Spot[] = [
  { position: { left: '2%', top: '7%' }, rotate: -5 },
  { position: { right: '1.5%', top: '38%' }, rotate: -4 },
  { position: { left: '1.5%', top: '68%' }, rotate: -2 },
  { position: { right: '2.5%', top: '6%' }, rotate: 4 },
  { position: { left: '3%', top: '38%' }, rotate: 4 },
  { position: { right: '2.5%', top: '68%' }, rotate: 3 },
];

// Inline style for one move: when it starts (seconds into the moment) plus
// any of its CSS variables (--dx, --dy, --dr, --ds, --dur, ...).
function at(seconds: number, vars: Record<string, string> = {}): CSSProperties {
  return { '--at': `${seconds}s`, ...vars } as CSSProperties;
}

export default function CasinoMoments() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setStep((s) => s + 1), SHOW_MS);
    return () => window.clearInterval(timer);
  }, []);

  // The moment coming in, and the one before it while it fades out.
  const steps = step === 0 ? [0] : [step - 1, step];
  return (
    <div className="absolute inset-0 hidden lg:block">
      {steps.map((n) => (
        <Moment key={n} step={n} />
      ))}
    </div>
  );
}

function Moment({ step }: { step: number }) {
  const { label, Draw } = SCENES[step % SCENES.length];
  const spot = SPOTS[(step + Math.floor(step / SCENES.length)) % SPOTS.length];
  return (
    <div className="absolute" style={{ ...spot.position, transform: `rotate(${spot.rotate}deg) scale(1.15)`, transformOrigin: 'center' }}>
      <div
        className="moment-life relative h-40 w-64 overflow-hidden rounded-2xl border border-white/15 shadow-2xl shadow-black/60"
        style={{ '--moment-period': `${LIFE_MS}ms` } as CSSProperties}
      >
        <Draw />
        <div className="absolute inset-0 bg-[radial-gradient(transparent_55%,rgba(0,0,0,0.5))]" />
        <div className="moment-flashbulb absolute inset-0 bg-white" />
        <span className="absolute bottom-1.5 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-white/85">
          {label}
        </span>
      </div>
    </div>
  );
}

function BlackjackMoment() {
  const id = useId().replace(/:/g, '');
  return (
    <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 95% at 50% 0%, #16a34a 0%, #14532d 55%, #052e16 100%)' }}>
      <svg viewBox="0 0 256 160" className="absolute inset-0 h-full w-full">
        <path id={`arc-${id}`} d="M 34 126 Q 128 50 222 126" fill="none" />
        <path d="M 30 132 Q 128 54 226 132" fill="none" stroke="#fde68a" strokeOpacity="0.25" />
        <text fontSize="8" letterSpacing="2" fill="#fde68a" fillOpacity="0.4" fontWeight="700">
          <textPath href={`#arc-${id}`} startOffset="50%" textAnchor="middle">BLACKJACK PAYS 3 TO 2</textPath>
        </text>
      </svg>
      <div className="absolute" style={{ left: 102, top: 8 }}>
        <CardBack width={24} />
      </div>
      <div className="moment-in absolute" style={{ left: 128, top: 8, ...at(0.2, { '--dx': '60px', '--dy': '-20px', '--dr': '25deg' }) }}>
        <CardFace face="7♣" width={24} />
      </div>
      <div className="moment-in absolute" style={{ left: 104, top: 96, ...at(0.45, { '--dx': '80px', '--dy': '-80px', '--dr': '-35deg' }) }}>
        <CardFace face="A♠" width={32} />
      </div>
      <div className="absolute" style={{ left: 126, top: 90, transform: 'rotate(10deg)' }}>
        <div className="moment-in" style={at(0.8, { '--dx': '60px', '--dy': '-80px', '--dr': '-40deg' })}>
          <CardFace face="K♥" width={32} />
        </div>
      </div>
      <div className="absolute inset-x-0 flex justify-center" style={{ top: 44 }}>
        <span className="moment-pop moment-title text-2xl" style={at(1.4)}>BLACKJACK!</span>
      </div>
      <div className="moment-in absolute" style={{ left: 60, top: 116, ...at(2, { '--dx': '-50px', '--dy': '30px' }) }}>
        <Chip color="black" size={22} />
      </div>
      <div className="moment-in absolute" style={{ left: 70, top: 110, ...at(2.15, { '--dx': '-50px', '--dy': '30px' }) }}>
        <Chip color="red" size={22} />
      </div>
      <span className="moment-pop absolute text-sm font-black text-emerald-300" style={{ left: 182, top: 112, ...at(2.4) }}>
        +150
      </span>
    </div>
  );
}

function PokerMoment() {
  const board = ['10♠', 'J♠', 'Q♠', 'K♠', 'A♠'];
  return (
    <div className="absolute inset-0 bg-[#0b1220]">
      <div
        className="absolute rounded-[64px] border-[6px] border-[#7c2d12]"
        style={{ left: 12, top: 14, width: 232, height: 132, background: 'radial-gradient(ellipse at 50% 40%, #16a34a, #14532d 70%, #052e16)' }}
      />
      {board.map((face, i) => (
        <div
          key={face}
          className="moment-in absolute"
          style={{ left: 56 + i * 30, top: 54, ...at(0.25 + i * 0.22, { '--dx': `${-30 - i * 30}px`, '--dy': '-24px', '--ds': '0.5' }) }}
        >
          <CardFace face={face} width={26} />
        </div>
      ))}
      <div className="absolute inset-x-0 flex justify-center" style={{ top: 24 }}>
        <span className="moment-pop moment-title text-lg" style={at(1.6)}>ROYAL FLUSH</span>
      </div>
      {(['black', 'green', 'red'] as const).map((color, i) => (
        <div key={color} className="moment-in absolute" style={{ left: 116, top: 108 - i * 4, ...at(2.1 + i * 0.1, { '--dy': '50px' }) }}>
          <Chip color={color} size={24} />
        </div>
      ))}
    </div>
  );
}

const REEL = ['7', '★', 'BAR', '♦', '7', '♣', 'BAR', '★'];

function ReelSymbol({ symbol }: { symbol: string }) {
  if (symbol === 'BAR') {
    return <span className="rounded-sm bg-slate-900 px-1 text-[10px] font-black leading-4 text-amber-300">BAR</span>;
  }
  const color = symbol === '7' || symbol === '♦' ? 'text-red-600' : symbol === '★' ? 'text-amber-500' : 'text-slate-900';
  return <span className={`text-3xl font-black ${color}`}>{symbol}</span>;
}

function JackpotMoment() {
  const coins = [
    [-96, -58, 40], [-70, -84, -60], [-40, -66, 90], [-14, -92, 20], [14, -74, -30],
    [42, -94, 70], [70, -64, -80], [98, -80, 50], [-58, -30, 10], [60, -36, -20],
  ];
  return (
    <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 30%, #6d28d9, #1e1b4b 75%)' }}>
      <div className="absolute rounded-2xl border-4 border-amber-400 bg-gradient-to-b from-red-600 to-red-900 shadow-lg" style={{ left: 38, top: 34, width: 180, height: 94 }} />
      {[0, 1, 2].map((reel) => (
        <div key={reel} className="absolute overflow-hidden rounded-md bg-gradient-to-b from-slate-300 via-white to-slate-300" style={{ left: 54 + reel * 52, top: 48, width: 44, height: 56 }}>
          <div className="moment-reel" style={at(0.2, { '--dur': `${1.1 + reel * 0.45}s`, '--from': `-${(REEL.length - 1) * 56}px` })}>
            {REEL.map((symbol, k) => (
              <div key={k} className="flex h-14 items-center justify-center">
                <ReelSymbol symbol={symbol} />
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="absolute h-0.5 bg-red-500/80" style={{ left: 50, right: 50, top: 75 }} />
      <div className="absolute inset-x-0 flex justify-center" style={{ top: 6 }}>
        <div className="moment-blink" style={at(2.4)}>
          <span className="moment-pop moment-title block text-2xl" style={at(2)}>JACKPOT</span>
        </div>
      </div>
      {coins.map(([cx, cy, cr], i) => (
        <div
          key={i}
          className="moment-coin absolute h-3.5 w-3.5 rounded-full border-2 border-amber-600 bg-amber-300"
          style={{ left: 121, top: 112, ...at(2.05 + (i % 4) * 0.06, { '--cx': `${cx}px`, '--cy': `${cy}px`, '--cr': `${cr}deg` }) }}
        />
      ))}
    </div>
  );
}

function RouletteMoment() {
  return (
    <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 35% 50%, #166534, #052e16 75%)' }}>
      <div className="absolute" style={{ left: 30, top: 22, width: 116, height: 116 }}>
        <div
          className="moment-turn absolute inset-0 rounded-full border-[6px] border-[#a16207] shadow-lg"
          style={{
            background: 'conic-gradient(#15803d 0deg 9.73deg, transparent 9.73deg), repeating-conic-gradient(#b91c1c 0deg 9.73deg, #111827 9.73deg 19.46deg)',
            ...at(0.1, { '--turns': '-720deg', '--dur': '3s' }),
          }}
        >
          <div className="absolute rounded-full bg-[#78350f] ring-2 ring-amber-500/60" style={{ inset: 22 }} />
          <div className="absolute rounded-full bg-gradient-to-br from-amber-200 to-amber-600" style={{ inset: 44 }} />
        </div>
        <div className="moment-turn absolute inset-0" style={at(0.1, { '--turns': '1080deg', '--dur': '3.2s' })}>
          <div className="absolute left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-white shadow" style={{ top: 9 }} />
        </div>
      </div>
      <div className="moment-pop absolute flex flex-col items-center rounded-lg bg-red-700 px-3 py-1 shadow-lg ring-2 ring-amber-300/70" style={{ left: 172, top: 40, ...at(3.2) }}>
        <span className="text-2xl font-black leading-7 text-white">17</span>
        <span className="text-[9px] font-bold tracking-widest text-red-100">RED</span>
      </div>
      <span className="moment-pop absolute text-sm font-black text-emerald-300" style={{ left: 170, top: 102, ...at(3.5) }}>
        WIN +350
      </span>
    </div>
  );
}

function GoalMoment() {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: 'linear-gradient(#0b1d3a 0%, #13305a 38%, #14532d 39%, #166534 100%)' }}>
      <div className="absolute inset-x-0 opacity-50" style={{ top: 26, height: 30, backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1.6px)', backgroundSize: '6px 6px' }} />
      <div className="absolute h-10 w-10 rounded-full bg-white/50 blur-md" style={{ left: 8, top: -6 }} />
      <div className="absolute h-10 w-10 rounded-full bg-white/50 blur-md" style={{ right: 8, top: -6 }} />
      <div className="absolute inset-x-0 bottom-0" style={{ top: 62, background: 'repeating-linear-gradient(90deg, #15803d 0 26px, #166534 26px 52px)' }} />
      <div className="absolute border-2 border-r-0 border-white/70" style={{ left: 184, top: 72, width: 76, height: 64 }} />
      <div
        className="moment-bulge absolute rounded-sm border-2 border-white"
        style={{
          left: 224, top: 76, width: 30, height: 42, transformOrigin: 'left center',
          backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0 1px, transparent 1px 5px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.35) 0 1px, transparent 1px 5px)',
          ...at(1.45),
        }}
      />
      <div className="moment-fly-x absolute" style={{ left: 232, top: 94, ...at(0.35, { '--dx': '-180px', '--dur': '1.1s' }) }}>
        <div className="moment-fly-y" style={at(0.35, { '--dy': '34px', '--peak': '-40px', '--dur': '1.1s' })}>
          <div className="h-3 w-3 rounded-full border border-slate-700 bg-white" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, #0f172a 0 1.5px, transparent 2px)' }} />
        </div>
      </div>
      <div className="absolute flex items-center gap-1 rounded-md bg-black/70 px-2 py-0.5 font-mono text-[10px] text-white" style={{ left: 8, top: 8 }}>
        <span className="text-slate-300">HOME</span>
        <span className="relative inline-block w-2 text-center font-bold">
          <span className="moment-out absolute inset-0" style={at(1.6)}>1</span>
          <span className="moment-pop block text-amber-300" style={at(1.7)}>2</span>
        </span>
        <span>–</span>
        <span className="font-bold">0</span>
        <span className="text-slate-300">AWAY</span>
      </div>
      <div className="absolute inset-x-0 flex justify-center" style={{ top: 36 }}>
        <span className="moment-pop moment-title text-3xl" style={at(1.5, { '--ds': '2.2' })}>GOAL!</span>
      </div>
    </div>
  );
}

function BetSlipMoment() {
  const legs = ['Lakers ML', 'Over 48.5', 'Chiefs −3'];
  return (
    <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)' }}>
      <div className="absolute h-24 w-24 rounded-full bg-sky-500/20 blur-2xl" style={{ left: 150, top: 10 }} />
      <div className="absolute" style={{ left: 62, top: 14, transform: 'rotate(-4deg)' }}>
        <div className="w-[132px] rounded-lg bg-slate-100 p-2 text-slate-900 shadow-xl">
          <p className="border-b border-slate-300 pb-1 text-[8px] font-bold tracking-widest text-slate-500">PARLAY · 3 LEGS</p>
          {legs.map((leg, i) => (
            <div key={leg} className="mt-1 flex items-center justify-between text-[11px] font-semibold">
              <span>{leg}</span>
              <span className="moment-pop text-emerald-600" style={at(0.4 + i * 0.35)}>✓</span>
            </div>
          ))}
          <p className="mt-1.5 border-t border-slate-300 pt-1 text-[8px] text-slate-500">Stake 100 · Pays 550</p>
        </div>
      </div>
      <div className="absolute" style={{ left: 98, top: 52, transform: 'rotate(-14deg)' }}>
        <span className="moment-pop block rounded-md border-4 border-emerald-500 px-2 text-2xl font-black text-emerald-500" style={at(1.6, { '--ds': '2.4' })}>
          WON
        </span>
      </div>
      <span className="moment-pop absolute text-sm font-black text-emerald-300" style={{ left: 172, top: 128, ...at(2.1) }}>
        +450 coins
      </span>
    </div>
  );
}
