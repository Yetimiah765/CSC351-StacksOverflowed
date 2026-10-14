// Pictures for the home page, drawn as inline SVG so they stay crisp at any
// size and need no image files: one per game in lib/games.ts (matched by
// id), plus HeroArt for the top of the page. Gradient ids are prefixed per
// picture, since each one appears once on the page.

const FONT = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';

const RED_SUITS = new Set(['♥', '♦']);

/** A playing card, 56×80 before scaling, rotated about its centre. */
function Card({
  x,
  y,
  rank,
  suit,
  rotate = 0,
  scale = 1,
}: {
  x: number;
  y: number;
  rank: string;
  suit: string;
  rotate?: number;
  scale?: number;
}) {
  const color = RED_SUITS.has(suit) ? '#dc2626' : '#0f172a';
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale}) translate(-28 -40)`}>
      <rect x="2" y="4" width="56" height="80" rx="6" fill="#000" opacity="0.35" />
      <rect width="56" height="80" rx="6" fill="#fff" stroke="#e2e8f0" />
      <text x="7" y="18" fontFamily={FONT} fontSize="15" fontWeight="800" fill={color}>
        {rank}
      </text>
      <text x="7" y="31" fontFamily={FONT} fontSize="12" fill={color}>
        {suit}
      </text>
      <text x="28" y="57" fontFamily={FONT} fontSize="28" textAnchor="middle" fill={color}>
        {suit}
      </text>
    </g>
  );
}

/** A stack of `count` chips seen from the side, top chip at (cx, cy). */
function ChipStack({ cx, cy, count, color, edge }: { cx: number; cy: number; count: number; color: string; edge: string }) {
  return (
    <g>
      {Array.from({ length: count }, (_, i) => {
        const y = cy + (count - 1 - i) * 6;
        return (
          <g key={i}>
            <ellipse cx={cx} cy={y + 3} rx="22" ry="9" fill={edge} />
            <ellipse cx={cx} cy={y} rx="22" ry="9" fill={color} />
            <ellipse cx={cx} cy={y} rx="16" ry="6" fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="4 4" opacity="0.8" />
          </g>
        );
      })}
    </g>
  );
}

/** A single chip seen from above. */
function Chip({ cx, cy, r = 14, color }: { cx: number; cy: number; r?: number; color: string }) {
  return (
    <g>
      <circle cx={cx + 1.5} cy={cy + 2} r={r} fill="#000" opacity="0.35" />
      <circle cx={cx} cy={cy} r={r} fill={color} />
      <circle cx={cx} cy={cy} r={r * 0.72} fill="none" stroke="#fff" strokeWidth={r * 0.18} strokeDasharray={`${r * 0.35} ${r * 0.35}`} />
      <circle cx={cx} cy={cy} r={r * 0.42} fill={color} stroke="#ffffff66" />
    </g>
  );
}

function PokerArt() {
  return (
    <>
      <defs>
        <radialGradient id="poker-felt" cx="50%" cy="45%" r="70%">
          <stop offset="0%" stopColor="#16a34a" />
          <stop offset="60%" stopColor="#065f46" />
          <stop offset="100%" stopColor="#022c22" />
        </radialGradient>
      </defs>
      <rect width="400" height="250" fill="url(#poker-felt)" />
      <ellipse cx="200" cy="125" rx="175" ry="95" fill="none" stroke="#6ee7b7" strokeOpacity="0.18" strokeWidth="2" />
      {/* The board */}
      <Card x={110} y={120} rank="A" suit="♠" rotate={-8} />
      <Card x={168} y={116} rank="K" suit="♠" rotate={-2} />
      <Card x={226} y={116} rank="Q" suit="♠" rotate={3} />
      {/* Chips */}
      <ChipStack cx={310} cy={140} count={5} color="#dc2626" edge="#7f1d1d" />
      <ChipStack cx={340} cy={172} count={3} color="#0ea5e9" edge="#075985" />
      <ChipStack cx={292} cy={186} count={4} color="#1e293b" edge="#020617" />
      {/* Dealer button */}
      <circle cx="70" cy="190" r="15" fill="#fff" stroke="#cbd5e1" strokeWidth="2" />
      <text x="70" y="196" fontFamily={FONT} fontSize="15" fontWeight="900" textAnchor="middle" fill="#0f172a">
        D
      </text>
    </>
  );
}

function BlackjackArt() {
  return (
    <>
      <defs>
        <radialGradient id="blackjack-felt" cx="50%" cy="10%" r="90%">
          <stop offset="0%" stopColor="#0e7490" />
          <stop offset="70%" stopColor="#164e63" />
          <stop offset="100%" stopColor="#082f49" />
        </radialGradient>
        <path id="blackjack-arc" d="M 60 96 Q 200 16 340 96" />
      </defs>
      <rect width="400" height="250" fill="url(#blackjack-felt)" />
      <path d="M 40 116 Q 200 26 360 116" fill="none" stroke="#fde68a" strokeOpacity="0.35" strokeWidth="2" />
      <text fontFamily={FONT} fontSize="13" fontWeight="700" letterSpacing="3" fill="#fde68a" fillOpacity="0.7">
        <textPath href="#blackjack-arc" startOffset="50%" textAnchor="middle">
          BLACKJACK PAYS 3 TO 2
        </textPath>
      </text>
      <Card x={168} y={150} rank="A" suit="♥" rotate={-10} scale={1.15} />
      <Card x={222} y={150} rank="K" suit="♣" rotate={8} scale={1.15} />
      {/* 21 badge */}
      <circle cx="318" cy="168" r="26" fill="#fbbf24" stroke="#fff7" strokeWidth="3" />
      <text x="318" y="177" fontFamily={FONT} fontSize="24" fontWeight="900" textAnchor="middle" fill="#451a03">
        21
      </text>
      <Chip cx={95} cy={190} r={16} color="#16a34a" />
      <Chip cx={118} cy={206} r={16} color="#dc2626" />
    </>
  );
}

function RouletteArt() {
  // 37 pockets: 0 is green, the rest alternate red and black.
  const pockets = 37;
  const cx = 200;
  const cy = 125;
  const outer = 98;
  const inner = 70;
  const point = (r: number, angle: number) => `${cx + r * Math.cos(angle)} ${cy + r * Math.sin(angle)}`;

  return (
    <>
      <defs>
        <radialGradient id="roulette-bg" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#7f1d1d" />
          <stop offset="100%" stopColor="#1c0505" />
        </radialGradient>
        <radialGradient id="roulette-cone" cx="45%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#78350f" />
        </radialGradient>
      </defs>
      <rect width="400" height="250" fill="url(#roulette-bg)" />
      <circle cx={cx + 3} cy={cy + 5} r={outer + 14} fill="#000" opacity="0.4" />
      <circle cx={cx} cy={cy} r={outer + 14} fill="#78350f" stroke="#fbbf24" strokeOpacity="0.5" strokeWidth="2" />
      {Array.from({ length: pockets }, (_, i) => {
        const start = (2 * Math.PI * i) / pockets - Math.PI / 2;
        const end = (2 * Math.PI * (i + 1)) / pockets - Math.PI / 2;
        const fill = i === 0 ? '#16a34a' : i % 2 === 1 ? '#dc2626' : '#0f172a';
        return (
          <path
            key={i}
            d={`M ${point(inner, start)} L ${point(outer, start)} A ${outer} ${outer} 0 0 1 ${point(outer, end)} L ${point(inner, end)} A ${inner} ${inner} 0 0 0 ${point(inner, start)} Z`}
            fill={fill}
            stroke="#fbbf24"
            strokeOpacity="0.5"
            strokeWidth="0.75"
          />
        );
      })}
      <circle cx={cx} cy={cy} r={inner} fill="url(#roulette-cone)" />
      <circle cx={cx} cy={cy} r="14" fill="#fbbf24" />
      <path d={`M ${cx - 26} ${cy} H ${cx + 26} M ${cx} ${cy - 26} V ${cy + 26}`} stroke="#fde68a" strokeWidth="5" strokeLinecap="round" />
      {/* The ball */}
      <circle cx={cx + 62} cy={cy - 74} r="7" fill="#f8fafc" stroke="#94a3b8" />
      <Chip cx={50} cy={200} r={18} color="#dc2626" />
      <Chip cx={352} cy={52} r={16} color="#0f172a" />
    </>
  );
}

function SlotsArt() {
  return (
    <>
      <defs>
        <linearGradient id="slots-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4c1d95" />
          <stop offset="100%" stopColor="#1e1b4b" />
        </linearGradient>
        <linearGradient id="slots-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
      </defs>
      <rect width="400" height="250" fill="url(#slots-bg)" />
      {/* Marquee lights */}
      {Array.from({ length: 9 }, (_, i) => (
        <circle key={i} cx={124 + i * 19} cy="38" r="5" fill={i % 2 ? '#fde047' : '#f472b6'} />
      ))}
      <rect x="105" y="52" width="190" height="150" rx="18" fill="url(#slots-body)" />
      <rect x="120" y="78" width="160" height="90" rx="10" fill="#1e1b4b" />
      {[0, 1, 2].map((reel) => (
        <g key={reel}>
          <rect x={127 + reel * 51} y="84" width="44" height="78" rx="6" fill="#fff" />
          <text
            x={149 + reel * 51}
            y="137"
            fontFamily={FONT}
            fontSize="38"
            fontWeight="900"
            textAnchor="middle"
            fill="#dc2626"
          >
            7
          </text>
        </g>
      ))}
      <line x1="118" y1="123" x2="282" y2="123" stroke="#f43f5e" strokeWidth="2" strokeOpacity="0.8" />
      <rect x="150" y="178" width="100" height="14" rx="7" fill="#78350f" />
      {/* Lever */}
      <rect x="298" y="95" width="10" height="62" rx="5" fill="#94a3b8" />
      <line x1="303" y1="100" x2="318" y2="58" stroke="#cbd5e1" strokeWidth="5" strokeLinecap="round" />
      <circle cx="320" cy="52" r="11" fill="#ef4444" />
    </>
  );
}

function SportsArt() {
  return (
    <>
      <defs>
        <linearGradient id="sports-field" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#15803d" />
          <stop offset="100%" stopColor="#14532d" />
        </linearGradient>
      </defs>
      <rect width="400" height="250" fill="url(#sports-field)" />
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x={i * 50} width="25" height="250" fill="#fff" opacity="0.04" />
      ))}
      {Array.from({ length: 7 }, (_, i) => (
        <line key={i} x1={50 + i * 50} y1="0" x2={50 + i * 50} y2="250" stroke="#fff" strokeOpacity="0.35" strokeWidth="2" />
      ))}
      {/* Football */}
      <g transform="translate(170 140) rotate(-25)">
        <ellipse cx="3" cy="6" rx="62" ry="36" fill="#000" opacity="0.35" />
        <ellipse rx="62" ry="36" fill="#92400e" stroke="#451a03" strokeWidth="3" />
        <path d="M -44 -14 Q -50 0 -44 14 M 44 -14 Q 50 0 44 14" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" />
        <line x1="-22" y1="0" x2="22" y2="0" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
        {[-15, -5, 5, 15].map((x) => (
          <line key={x} x1={x} y1="-7" x2={x} y2="7" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        ))}
      </g>
      {/* Odds ticket */}
      <g transform="translate(262 34)">
        <rect width="112" height="78" rx="10" fill="#0f172a" fillOpacity="0.9" stroke="#334155" />
        <rect x="10" y="10" width="34" height="16" rx="8" fill="#dc2626" />
        <text x="27" y="22" fontFamily={FONT} fontSize="10" fontWeight="800" textAnchor="middle" fill="#fff">
          LIVE
        </text>
        <text x="10" y="46" fontFamily={FONT} fontSize="11" fill="#94a3b8">
          Home win
        </text>
        <text x="10" y="67" fontFamily={FONT} fontSize="20" fontWeight="800" fill="#fbbf24">
          +150
        </text>
      </g>
    </>
  );
}

const ART: Record<string, () => JSX.Element> = {
  poker: PokerArt,
  blackjack: BlackjackArt,
  roulette: RouletteArt,
  slots: SlotsArt,
  'sports-betting': SportsArt,
};

/** The picture for a game in lib/games.ts, filling its container at 8:5. */
export default function GameArt({ id, label }: { id: string; label: string }) {
  const Art = ART[id];
  return (
    <svg viewBox="0 0 400 250" role="img" aria-label={label} className="h-full w-full" preserveAspectRatio="xMidYMid slice">
      {Art ? <Art /> : <rect width="400" height="250" fill="#1e293b" />}
    </svg>
  );
}

/** A royal flush fanned over a pile of chips, for the top of the home page. */
export function HeroArt() {
  const fan = [
    { rank: '10', rotate: -24 },
    { rank: 'J', rotate: -12 },
    { rank: 'Q', rotate: 0 },
    { rank: 'K', rotate: 12 },
    { rank: 'A', rotate: 24 },
  ];
  return (
    <svg viewBox="0 0 420 320" role="img" aria-label="A royal flush fanned over stacks of chips" className="h-full w-full">
      <defs>
        <radialGradient id="hero-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="210" cy="170" rx="200" ry="150" fill="url(#hero-glow)" />
      {/* Cards fan out from a point below the hand */}
      {fan.map(({ rank, rotate }) => (
        <g key={rank} transform={`rotate(${rotate} 210 300)`}>
          <Card x={210} y={150} rank={rank} suit="♠" scale={1.6} />
        </g>
      ))}
      <ChipStack cx={95} cy={250} count={6} color="#dc2626" edge="#7f1d1d" />
      <ChipStack cx={140} cy={272} count={4} color="#0ea5e9" edge="#075985" />
      <ChipStack cx={310} cy={258} count={5} color="#1e293b" edge="#020617" />
      <ChipStack cx={350} cy={282} count={3} color="#16a34a" edge="#14532d" />
      <Chip cx={240} cy={292} r={16} color="#fbbf24" />
      <Chip cx={60} cy={296} r={13} color="#16a34a" />
    </svg>
  );
}
