// The poker emotes' artwork (lib/emotes.ts): Chip, the table's poker-chip
// mascot, pulling a face. Every emote is the same chip body — a colour, the
// white edge spots and a lighter face — with its own eyes, mouth and props.
// Drawn in code, like the rest of the site's art; no image files.

import type { ReactNode } from 'react';

const INK = '#1f1306';

interface Look {
  body: string;
  rim: string;
  face: string;
}

const LOOKS: Record<string, Look> = {
  laugh: { body: '#f59e0b', rim: '#b45309', face: '#fde68a' },
  cry: { body: '#3b82f6', rim: '#1d4ed8', face: '#bfdbfe' },
  angry: { body: '#dc2626', rim: '#7f1d1d', face: '#fecaca' },
  'thumbs-up': { body: '#16a34a', rim: '#14532d', face: '#bbf7d0' },
  thinking: { body: '#8b5cf6', rim: '#4c1d95', face: '#ddd6fe' },
  shocked: { body: '#f97316', rim: '#9a3412', face: '#fed7aa' },
  cool: { body: '#0f172a', rim: '#020617', face: '#cbd5e1' },
  gg: { body: '#10b981', rim: '#065f46', face: '#a7f3d0' },
};

// The chip: an edge ring with six white spots, then the face.
function Chip({ look, children }: { look: Look; children: ReactNode }) {
  return (
    <>
      <ellipse cx="60" cy="108" rx="30" ry="6" fill="#000" opacity="0.25" />
      <circle cx="60" cy="62" r="42" fill={look.body} stroke={look.rim} strokeWidth="4" />
      {[0, 60, 120, 180, 240, 300].map((angle) => (
        <rect
          key={angle}
          x="55"
          y="21"
          width="10"
          height="9"
          rx="2"
          fill="#fff"
          opacity="0.9"
          transform={`rotate(${angle} 60 62)`}
        />
      ))}
      <circle cx="60" cy="62" r="29" fill={look.face} stroke={look.rim} strokeWidth="2" />
      <path d="M38 48 A26 26 0 0 1 66 37" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="4" strokeLinecap="round" />
      {children}
    </>
  );
}

const happyEyes = (
  <g fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round">
    <path d="M44 58 Q49 51 54 58" />
    <path d="M66 58 Q71 51 76 58" />
  </g>
);
const dotEyes = (
  <g fill={INK}>
    <circle cx="50" cy="57" r="3.6" />
    <circle cx="70" cy="57" r="3.6" />
  </g>
);

const FACES: Record<string, ReactNode> = {
  // Eyes squeezed shut, mouth wide open, tears of joy.
  laugh: (
    <>
      <g fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round">
        <path d="M43 55 L51 59 L43 63" />
        <path d="M77 55 L69 59 L77 63" />
      </g>
      <path d="M45 68 Q60 70 75 68 Q72 86 60 86 Q48 86 45 68 Z" fill="#7f1d1d" stroke={INK} strokeWidth="2.5" />
      <path d="M52 80 Q60 75 68 80 Q66 86 60 86 Q54 86 52 80 Z" fill="#f87171" />
      <path d="M32 58 q-4 6 0 9 q4 -3 0 -9 Z" fill="#38bdf8" />
      <path d="M88 58 q-4 6 0 9 q4 -3 0 -9 Z" fill="#38bdf8" />
      <text x="96" y="30" fontSize="15" fontWeight="900" fill="#fff" stroke={INK} strokeWidth="1" fontFamily="Arial Black, Arial, sans-serif" transform="rotate(14 96 30)">
        HA
      </text>
    </>
  ),
  // Eyes shut tight, wobbly frown, two streams of tears.
  cry: (
    <>
      <g fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round">
        <path d="M44 55 Q49 60 54 55" />
        <path d="M66 55 Q71 60 76 55" />
      </g>
      <path d="M50 79 Q55 72 60 76 Q65 72 70 79" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
      <rect x="45" y="59" width="6" height="34" rx="3" fill="#38bdf8" opacity="0.9" />
      <rect x="69" y="59" width="6" height="34" rx="3" fill="#38bdf8" opacity="0.9" />
      <ellipse cx="48" cy="96" rx="7" ry="3" fill="#38bdf8" opacity="0.7" />
      <ellipse cx="72" cy="96" rx="7" ry="3" fill="#38bdf8" opacity="0.7" />
    </>
  ),
  // Brows down, glaring, teeth gritted, steam.
  angry: (
    <>
      <g stroke={INK} strokeWidth="4" strokeLinecap="round">
        <path d="M42 48 L55 54" />
        <path d="M78 48 L65 54" />
      </g>
      <g fill={INK}>
        <path d="M45 58 L55 58 L52 62 Z" />
        <path d="M75 58 L65 58 L68 62 Z" />
      </g>
      <rect x="47" y="71" width="26" height="10" rx="3" fill="#fff" stroke={INK} strokeWidth="2.5" />
      <path d="M53 71 V81 M60 71 V81 M67 71 V81" stroke={INK} strokeWidth="1.5" />
      <g fill="#e5e7eb" opacity="0.95">
        <circle cx="22" cy="24" r="6" />
        <circle cx="16" cy="16" r="4" />
        <circle cx="98" cy="24" r="6" />
        <circle cx="104" cy="16" r="4" />
      </g>
    </>
  ),
  // Big grin, a wink, and a thumbs up.
  'thumbs-up': (
    <>
      <path d="M44 57 Q49 51 54 57" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="70" cy="56" r="3.6" fill={INK} />
      <path d="M46 69 Q60 84 74 69" fill="#7f1d1d" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <g transform="translate(86 66) rotate(-8)">
        <rect x="-10" y="0" width="20" height="18" rx="5" fill="#fde68a" stroke={INK} strokeWidth="2.5" />
        <rect x="-5" y="-15" width="9" height="19" rx="4.5" fill="#fde68a" stroke={INK} strokeWidth="2.5" />
      </g>
    </>
  ),
  // One brow up, looking up and aside, a hand on the chin, a question mark.
  thinking: (
    <>
      <path d="M43 47 Q49 42 55 47" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <path d="M66 51 L77 50" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <g fill={INK}>
        <circle cx="52" cy="55" r="3.4" />
        <circle cx="72" cy="56" r="3.4" />
      </g>
      <path d="M52 76 L67 72" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="66" cy="86" r="8" fill="#fde68a" stroke={INK} strokeWidth="2.5" />
      <path d="M62 80 l-4 -8" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      <text x="94" y="30" fontSize="26" fontWeight="900" fill="#fff" stroke={INK} strokeWidth="1.2" fontFamily="Arial Black, Arial, sans-serif">
        ?
      </text>
    </>
  ),
  // Eyes wide, mouth a little O, a sweat drop and a "!".
  shocked: (
    <>
      <g fill="#fff" stroke={INK} strokeWidth="2.5">
        <circle cx="49" cy="55" r="8" />
        <circle cx="71" cy="55" r="8" />
      </g>
      <g fill={INK}>
        <circle cx="49" cy="55" r="2.6" />
        <circle cx="71" cy="55" r="2.6" />
      </g>
      <ellipse cx="60" cy="77" rx="6" ry="8" fill="#7f1d1d" stroke={INK} strokeWidth="2.5" />
      <path d="M84 40 q-5 8 0 11 q5 -3 0 -11 Z" fill="#38bdf8" />
      <text x="54" y="16" fontSize="22" fontWeight="900" fill="#fff" stroke={INK} strokeWidth="1.2" fontFamily="Arial Black, Arial, sans-serif">
        !
      </text>
    </>
  ),
  // Shades on, smirking, a sparkle.
  cool: (
    <>
      <path d="M36 52 H84 L80 62 Q75 66 68 62 L64 56 H56 L52 62 Q45 66 40 62 Z" fill="#0b0b0f" stroke="#fff" strokeWidth="1.5" />
      <path d="M41 55 L47 55" stroke="#fff" strokeOpacity="0.7" strokeWidth="2" strokeLinecap="round" />
      <path d="M49 76 Q60 80 72 72" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M96 22 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3 Z" fill="#fde047" />
    </>
  ),
  // Happy, holding up a "GG" sign.
  gg: (
    <>
      {happyEyes}
      <path d="M48 69 Q60 80 72 69" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
      <g transform="translate(60 18) rotate(-6)">
        <rect x="-24" y="-12" width="48" height="24" rx="5" fill="#fff" stroke={INK} strokeWidth="2.5" />
        <text x="0" y="8" textAnchor="middle" fontSize="18" fontWeight="900" fill="#059669" fontFamily="Arial Black, Arial, sans-serif">
          GG
        </text>
      </g>
    </>
  ),
};

/** One emote's picture. Unknown ids draw a plain smiling chip. */
export default function EmoteArt({ emoteId, className }: { emoteId: string; className?: string }) {
  const look = LOOKS[emoteId] ?? LOOKS.gg;
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true" overflow="visible">
      <Chip look={look}>
        {FACES[emoteId] ?? (
          <>
            {dotEyes}
            <path d="M48 70 Q60 79 72 70" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
          </>
        )}
      </Chip>
    </svg>
  );
}
