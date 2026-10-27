// The artwork for every cosmetic (UR-119 - UR-127), drawn as SVG in code like
// the home page's game art (components/GameArt.tsx), so there are no image
// files. Each cosmetic's art key is its cosmetics.asset_path in the database.
// drawCosmetic() returns an SVG string; components/cosmetics/CosmeticArt.tsx
// renders it. All the data in these strings comes from this file, never from
// players.

export interface DrawOptions {
  // Profile outlines only: false draws just the ring, to go around a real
  // profile photo; true (the default) also draws the blank person inside.
  avatar?: boolean;
  // Chips only: draw the skin for this coin value (one of CHIP_SKIN_VALUES).
  // Left out, a chip is drawn in its main look, as in the shop.
  value?: number;
}

// The coin values a chip set has a skin for: every chip value the games use
// (roulette's CHIP_VALUES and blackjack's BLACKJACK_CHIPS).
export const CHIP_SKIN_VALUES = [5, 10, 25, 50, 100] as const;

// ---------- drawing helpers ----------
// Gradient, filter and clip ids must be unique on the page, so each drawing
// gets its own prefix (set by drawCosmetic before it draws).
let nextId: (p: string) => string = (p) => p;
let drawOptions: DrawOptions = {};

const f = (n: number) => +n.toFixed(2);
// Seeded random numbers, so every design draws the same each time.
const rnd = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
// A point on a circle, 0 degrees at the top, clockwise.
const pol = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};
const starPath = (cx: number, cy: number, R: number, r: number, n = 5, rot = 0) => {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const [x, y] = pol(cx, cy, i % 2 ? r : R, rot + (i * 180) / n);
    d += `${i ? 'L' : 'M'}${f(x)} ${f(y)}`;
  }
  return `${d}Z`;
};
const glow = (id: string, sd = 1.6) =>
  `<filter id="${id}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${sd}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
const lin = (id: string, stops: string[], x2 = 0, y2 = 1) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops
    .map((c, i) => `<stop offset="${i / (stops.length - 1)}" stop-color="${c}"/>`)
    .join('')}</linearGradient>`;
type RadStop = [number, string] | [number, string, number];
const rad = (id: string, stops: RadStop[], cx = 0.5, cy = 0.5, r = 0.5) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops
    .map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`)
    .join('')}</radialGradient>`;
const latticeD = (step: number) => {
  let d = '';
  for (let k = -140; k <= 100; k += step) d += `M${k} 0L${k + 140} 140M${k + 140} 0L${k} 140`;
  return d;
};
const waveD = (x0: number, x1: number, y: number, amp: number, period: number, phase: number) => {
  let d = '';
  for (let x = x0; x <= x1; x += 1.5) d += `${x === x0 ? 'M' : 'L'}${f(x)} ${f(y + amp * Math.sin((x / period) * 2 * Math.PI + phase))}`;
  return d;
};
const waveFill = (y: number, amp: number, period: number, phase: number, fill: string) =>
  `<path d="M0 140L${waveD(0, 100, y, amp, period, phase).slice(1)}L100 140Z" fill="${fill}"/>`;
// An arc along a circle from angle a0 to a1 (degrees, clockwise when a1 > a0).
const arcD = (cx: number, cy: number, r: number, a0: number, a1: number) => {
  const [x0, y0] = pol(cx, cy, r, a0);
  const [x1, y1] = pol(cx, cy, r, a1);
  return `M${f(x0)} ${f(y0)}A${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${a1 > a0 ? 1 : 0} ${f(x1)} ${f(y1)}`;
};
type CornerDraw = (x: number, y: number, rot: number) => string;
// The four inner corners of a card, each drawn with its rotation.
const corners = (draw: CornerDraw, inset = 13) =>
  ([[inset, inset, 0], [100 - inset, inset, 90], [100 - inset, 140 - inset, 180], [inset, 140 - inset, 270]] as const)
    .map(([x, y, r]) => draw(x, y, r))
    .join('');
const flame = (cx: number, by: number, w: number, h: number) =>
  `M${f(cx - w / 2)} ${f(by)}C${f(cx - w / 2)} ${f(by - h * 0.45)} ${f(cx - w * 0.05)} ${f(by - h * 0.55)} ${f(cx)} ${f(by - h)}C${f(cx + w * 0.05)} ${f(by - h * 0.55)} ${f(cx + w / 2)} ${f(by - h * 0.45)} ${f(cx + w / 2)} ${f(by)}Z`;
const bat = (x: number, y: number, s: number, fill: string) =>
  `<path transform="translate(${x} ${y}) scale(${s})" fill="${fill}" d="M-10 0Q-8-5-4-3Q-2-6 0-3.5Q2-6 4-3Q8-5 10 0Q7-1.5 6 2Q4 0 2 2Q1 .5 0 1.5Q-1 .5-2 2Q-4 0-6 2Q-7-1.5-10 0Z"/>`;
// shade: a lit-sphere gradient id, for a rounded pumpkin on card backs.
const pumpkin = (cx: number, cy: number, s: number, shade?: string) =>
  `<g transform="translate(${cx} ${cy}) scale(${s})">` +
  `<path d="M-1 -10Q0 -15 3.5 -15.5" stroke="#4d7c0f" stroke-width="2.6" fill="none" stroke-linecap="round"/>` +
  `<path d="M2 -14Q6 -17 7 -13" stroke="#65a30d" stroke-width=".9" fill="none" stroke-linecap="round"/>` +
  `<ellipse cx="-6" cy="0" rx="8" ry="10.5" fill="${shade ? `url(#${shade})` : '#c2410c'}"/><ellipse cx="6" cy="0" rx="8" ry="10.5" fill="${shade ? `url(#${shade})` : '#c2410c'}"/>` +
  (shade ? `<ellipse cx="-6" cy="0" rx="8" ry="10.5" fill="#7c2d12" opacity=".35"/><ellipse cx="6" cy="0" rx="8" ry="10.5" fill="#7c2d12" opacity=".2"/>` : '') +
  `<ellipse cx="0" cy="0" rx="8.5" ry="11" fill="${shade ? `url(#${shade})` : '#f97316'}"/>` +
  `<path d="M-4.5 -10Q-6 0 -4.5 10M4.5 -10Q6 0 4.5 10" stroke="#c2410c" stroke-width=".7" fill="none"/>` +
  `<path d="M-7.5 -2.5L-3 -2.5L-5.2 -6.8Z M7.5 -2.5L3 -2.5L5.2 -6.8Z" fill="#fde047"/>` +
  `<path d="M-8 2Q0 9.5 8 2L5.2 3.6L3.6 2.2L1.6 4.2L0 2.4L-1.6 4.2L-3.6 2.2L-5.2 3.6Z" fill="#fde047"/>` +
  (shade ? `<ellipse cx="-3.6" cy="-6.6" rx="3" ry="1.5" fill="#fff" opacity=".38" transform="rotate(-25 -3.6 -6.6)"/>` : '') +
  `</g>`;
const snowflake = (cx: number, cy: number, r: number, color: string, w = 1) => {
  let d = '';
  for (let i = 0; i < 6; i++) {
    const [x, y] = pol(cx, cy, r, i * 60);
    d += `M${f(cx)} ${f(cy)}L${f(x)} ${f(y)}`;
    const [bx, by] = pol(cx, cy, r * 0.58, i * 60);
    const [ax, ay] = pol(bx, by, r * 0.32, i * 60 - 45);
    const [cx2, cy2] = pol(bx, by, r * 0.32, i * 60 + 45);
    d += `M${f(bx)} ${f(by)}L${f(ax)} ${f(ay)}M${f(bx)} ${f(by)}L${f(cx2)} ${f(cy2)}`;
  }
  return `<path d="${d}" stroke="${color}" stroke-width="${w}" stroke-linecap="round" fill="none"/>`;
};
const crown = (cx: number, cy: number, s: number, fill: string, jewel: string) =>
  `<g transform="translate(${cx} ${cy}) scale(${s})"><path d="M-14 6L-15.5 -7L-7 0L0 -11L7 0L15.5 -7L14 6Z" fill="${fill}"/>` +
  `<rect x="-14" y="6" width="28" height="4.5" rx="1" fill="${fill}"/><path d="M-13 8.2H13" stroke="#000" stroke-opacity=".25" stroke-width=".5"/>` +
  `<circle cx="0" cy="-11.5" r="2.2" fill="${fill}"/><circle cx="-15.5" cy="-7.5" r="1.8" fill="${fill}"/><circle cx="15.5" cy="-7.5" r="1.8" fill="${fill}"/>` +
  `<circle cx="0" cy="2.5" r="2.2" fill="${jewel}"/><circle cx="-7.5" cy="3.5" r="1.5" fill="${jewel}"/><circle cx="7.5" cy="3.5" r="1.5" fill="${jewel}"/>` +
  `<circle cx="-.6" cy="1.8" r=".6" fill="#fff" opacity=".7"/></g>`;
const fleur = (x: number, y: number, s: number, fill: string, rot = 0) =>
  `<g transform="translate(${f(x)} ${f(y)}) rotate(${rot}) scale(${s})" fill="${fill}"><path d="M0 -10C2.6 -7 3 -3.5 0 0C-3 -3.5 -2.6 -7 0 -10Z"/>` +
  `<path d="M0 0C-1 -4 -5 -6 -7.5 -4C-9 -2.5 -8 0 -6 .3C-5 -1.2 -3.5 -1 -2.4 .6Z"/><path d="M0 0C1 -4 5 -6 7.5 -4C9 -2.5 8 0 6 .3C5 -1.2 3.5 -1 2.4 .6Z"/>` +
  `<rect x="-4.5" y=".6" width="9" height="1.8" rx=".6"/><path d="M-1.6 2.4L-3 6.5H3L1.6 2.4Z"/></g>`;
const anchor = (cx: number, cy: number, s: number, c: string, w = 2.6) =>
  `<g transform="translate(${cx} ${cy}) scale(${s})" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">` +
  `<circle cx="0" cy="-15" r="3.6"/><path d="M0 -11.4V14M-8 -6H8M-13 4Q-12 14 0 14Q12 14 13 4"/><path d="M-15.5 7.5L-13 3.5L-9.5 6.5M15.5 7.5L13 3.5L9.5 6.5"/></g>`;
// shade: a gradient id darkening the planet's far side (card backs).
const planet = (cx: number, cy: number, r: number, gradId: string, ring: string, shade?: string) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${r * 2}" ry="${r * 0.55}" fill="none" stroke="${ring}" stroke-width="2" transform="rotate(-18 ${cx} ${cy})" opacity=".85"/>` +
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${gradId})"/>` +
  (shade ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${shade})"/>` : '') +
  `<path d="M${f(cx - r * 0.9)} ${f(cy - r * 0.15)}Q${cx} ${f(cy + r * 0.25)} ${f(cx + r * 0.9)} ${f(cy - r * 0.1)}" stroke="#000" stroke-opacity=".15" stroke-width="${f(r * 0.18)}" fill="none"/>` +
  `<path d="M${cx - r * 2} ${cy}A${r * 2} ${r * 0.55} 0 0 0 ${cx + r * 2} ${cy}" fill="none" stroke="${ring}" stroke-width="2" transform="rotate(-18 ${cx} ${cy})"/>`;
const spark = (x: number, y: number, s: number, fill = '#fff') => `<path d="${starPath(x, y, s, s * 0.25, 4)}" fill="${fill}"/>`;
// A maple leaf about 2s tall, stem included, centered on 0,0.
const MAPLE: [number, number][] = [[0, -10], [2, -6], [5, -7], [4, -3], [8, -4], [6, 0], [9, 1], [4, 3], [5, 6], [1, 4], [0.6, 9], [-0.6, 9], [-1, 4], [-5, 6], [-4, 3], [-9, 1], [-6, 0], [-8, -4], [-4, -3], [-5, -7], [-2, -6]];
const maple = (s: number) => `${MAPLE.map(([x, y], i) => `${i ? 'L' : 'M'}${f((x * s) / 10)} ${f((y * s) / 10)}`).join('')}Z`;
const HOLLY = 'M0 -6.5L1.4 -4.4L3.4 -4.6L2.6 -2.2L4.2 0L2.6 2.2L3.4 4.6L1.4 4.4L0 6.5L-1.4 4.4L-3.4 4.6L-2.6 2.2L-4.2 0L-2.6 -2.2L-3.4 -4.6L-1.4 -4.4Z';
const turkey = (cx: number, cy: number, s: number) => {
  const cols = ['#b91c1c', '#ea580c', '#f59e0b', '#fbbf24', '#f59e0b', '#ea580c', '#b91c1c'];
  let barbs = '';
  for (let y = -5; y >= -21; y -= 1.6) barbs += `M0 ${f(y)}L-2.6 ${f(y - 1.6)}M0 ${f(y)}L2.6 ${f(y - 1.6)}`;
  const fan = cols
    .map((c, i) => `<g transform="rotate(${-72 + i * 24})"><ellipse cx="0" cy="-12" rx="4.6" ry="12" fill="${c}"/><path d="${barbs}" stroke="#7c2d12" stroke-opacity=".28" stroke-width=".22"/>` +
      `<path d="M0 -3V-22" stroke="#7c2d12" stroke-opacity=".45" stroke-width=".5"/><ellipse cx="0" cy="-12" rx="4.6" ry="12" fill="none" stroke="#7c2d12" stroke-opacity=".35" stroke-width=".3"/></g>`)
    .join('');
  return `<g transform="translate(${cx} ${cy}) scale(${s})">${fan}` +
    `<ellipse cx="0" cy="3" rx="8" ry="9" fill="#78350f"/><path d="M-5 1Q0 5 5 1M-5.5 5Q0 9 5.5 5" stroke="#92400e" stroke-width=".8" fill="none"/><circle cx="0" cy="-5.5" r="4.6" fill="#92400e"/>` +
    `<circle cx="-1.6" cy="-6.6" r=".9" fill="#fff"/><circle cx="1.6" cy="-6.6" r=".9" fill="#fff"/><circle cx="-1.6" cy="-6.5" r=".4" fill="#111"/><circle cx="1.6" cy="-6.5" r=".4" fill="#111"/>` +
    `<path d="M-1.6 -4.3L1.6 -4.3L0 -2Z" fill="#fbbf24"/><path d="M1 -3.4Q2.6 -.6 1.2 1" stroke="#dc2626" stroke-width="1.4" fill="none" stroke-linecap="round"/>` +
    `<path d="M-3.5 11V14.5M3.5 11V14.5" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round"/></g>`;
};
const wheat = (x: number, by: number, h: number, c: string, lean = 0) => {
  let g = '';
  for (let i = 0; i < 6; i++) {
    const y = by - h + i * 3.2;
    g += `<ellipse cx="${f(x - 1.5)}" cy="${f(y)}" rx="1.1" ry="2.3" transform="rotate(-30 ${f(x - 1.5)} ${f(y)})" fill="${c}"/><ellipse cx="${f(x + 1.5)}" cy="${f(y)}" rx="1.1" ry="2.3" transform="rotate(30 ${f(x + 1.5)} ${f(y)})" fill="${c}"/>`;
  }
  return `<g transform="rotate(${lean} ${x} ${by})"><path d="M${x} ${by}V${by - h - 3}" stroke="${c}" stroke-width=".9"/>${g}</g>`;
};
const acorn = (x: number, y: number, s: number, rot: number) =>
  `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)}) scale(${s})"><ellipse cx="0" cy="1.5" rx="2.6" ry="3.4" fill="#b45309"/><path d="M-3.2 .2Q0 -3.6 3.2 .2Z" fill="#78350f"/><path d="M0 -2.2V-3.8" stroke="#78350f" stroke-width=".8"/></g>`;
const tree = (cx: number, ty: number, gl: string, fill = '#22c55e') => {
  const orn: [number, number, string][] = [[cx - 5, ty + 19, '#ef4444'], [cx + 6, ty + 29, '#facc15'], [cx - 1, ty + 32, '#60a5fa'], [cx - 9, ty + 38, '#facc15'], [cx + 3, ty + 42, '#ef4444'], [cx + 12, ty + 46, '#60a5fa'], [cx - 14, ty + 47, '#ef4444'], [cx + 2, ty + 22, '#60a5fa']];
  return `<rect x="${cx - 3.5}" y="${ty + 49}" width="7" height="9" fill="#78350f"/>` +
    `<path d="M${cx} ${ty + 6}L${cx + 12} ${ty + 22}H${cx - 12}Z M${cx} ${ty + 15}L${cx + 16} ${ty + 36}H${cx - 16}Z M${cx} ${ty + 26}L${cx + 21} ${ty + 50}H${cx - 21}Z" fill="${fill}" stroke="#15803d" stroke-width=".8" stroke-linejoin="round"/>` +
    `<path d="M${cx - 12} ${ty + 22}Q${cx - 6} ${ty + 20.5} ${cx} ${ty + 22}T${cx + 12} ${ty + 22}M${cx - 16} ${ty + 36}Q${cx - 8} ${ty + 34} ${cx} ${ty + 36}T${cx + 16} ${ty + 36}M${cx - 21} ${ty + 50}Q${cx - 10} ${ty + 47.5} ${cx} ${ty + 50}T${cx + 21} ${ty + 50}" stroke="#f8fafc" stroke-width="1.4" fill="none" stroke-linecap="round"/>` +
    `<path d="M${cx - 8} ${ty + 17}Q${cx} ${ty + 22} ${cx + 9} ${ty + 16}M${cx - 12} ${ty + 30}Q${cx} ${ty + 36} ${cx + 13} ${ty + 28}M${cx - 17} ${ty + 43}Q${cx} ${ty + 50} ${cx + 18} ${ty + 41}" stroke="#facc15" stroke-width=".6" stroke-dasharray="1 1.2" fill="none"/>` +
    orn.map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="1.9" fill="${c}"/><circle cx="${x - 0.6}" cy="${y - 0.6}" r=".6" fill="#fff" opacity=".7"/>`).join('') +
    `<path d="${starPath(cx, ty + 4.5, 5.6, 2.3, 5)}" fill="#facc15" filter="url(#${gl})"/>`;
};
const gift = (x: number, by: number, w: number, h: number, c: string, rib: string) =>
  `<rect x="${f(x - w / 2)}" y="${f(by - h)}" width="${w}" height="${h}" fill="${c}"/><rect x="${f(x - w / 2 - 0.8)}" y="${f(by - h - 2.4)}" width="${f(w + 1.6)}" height="3" fill="${c}" stroke="#000" stroke-opacity=".2" stroke-width=".4"/>` +
  `<rect x="${f(x + w / 2 - w * 0.32)}" y="${f(by - h)}" width="${f(w * 0.32)}" height="${h}" fill="#000" opacity=".22"/>` +
  `<rect x="${f(x - w / 2 - 0.8)}" y="${f(by - h - 2.4)}" width="${f(w + 1.6)}" height=".8" fill="#fff" opacity=".35"/>` +
  `<rect x="${f(x - 1)}" y="${f(by - h - 2.4)}" width="2" height="${f(h + 2.4)}" fill="${rib}"/>` +
  `<path d="M${x} ${f(by - h - 2.4)}C${x - 4} ${f(by - h - 6.5)} ${x - 5.5} ${f(by - h - 2)} ${x} ${f(by - h - 2.4)}C${x + 4} ${f(by - h - 6.5)} ${x + 5.5} ${f(by - h - 2)} ${x} ${f(by - h - 2.4)}Z" fill="${rib}"/>`;
const bow = (x: number, y: number, c = '#facc15', dark = '#ca8a04') =>
  `<g transform="translate(${x} ${y})"><path d="M0 0C-6 -7 -13 -5 -11 1C-9 6 -3 3 0 0Z M0 0C6 -7 13 -5 11 1C9 6 3 3 0 0Z" fill="${c}" stroke="${dark}" stroke-width=".6"/>` +
  `<path d="M-1 1L-5 10L-2 9L0 3Z M1 1L5 10L2 9L0 3Z" fill="${c}" stroke="${dark}" stroke-width=".4"/><circle r="2" fill="${dark}"/></g>`;
const fish = (x: number, y: number, s: number, fill: string, dir = 1, stripe = 'none', shaded = false) =>
  `<g transform="translate(${x} ${y}) scale(${s * dir} ${s})"><path d="M-6 0C-3 -4 3 -4 6 0C3 4 -3 4 -6 0Z M-6 0L-10 -3.5L-9 0L-10 3.5Z" fill="${fill}"/>` +
  (shaded
    ? `<ellipse cx=".5" cy="1.5" rx="4.6" ry="1.2" fill="#000" opacity=".22"/><ellipse cx="1" cy="-1.5" rx="3.6" ry="1" fill="#fff" opacity=".35"/>` +
      `<path d="M-9.4 -2.6L-6.6 -.3M-9.6 -1.2L-6.6 0M-9.6 1.2L-6.6 0M-9.4 2.6L-6.6 .3M-2.4 -1.6A1.4 1.4 0 0 0 -2.4 1.6M0 -2.2A1.8 1.8 0 0 0 0 2.2M2.4 -1.8A1.5 1.5 0 0 0 2.4 1.8" stroke="#000" stroke-opacity=".3" stroke-width=".22" fill="none"/>` +
      `<path d="M-6 0C-3 -4 3 -4 6 0C3 4 -3 4 -6 0Z" fill="none" stroke="#000" stroke-opacity=".35" stroke-width=".3"/>`
    : '') +
  `<path d="M-1.5 -2.8Q.5 0 -1.5 2.8" stroke="${stripe}" stroke-width="1.2" fill="none"/><circle cx="3.4" cy="-.8" r=".7" fill="#0f172a"/></g>`;
const coral = (x: number, by: number, s: number, color: string) =>
  `<g transform="translate(${x} ${by}) scale(${s})" stroke="${color}" stroke-width="2.2" stroke-linecap="round" fill="none"><path d="M0 0V-14M0 -6L-5 -11V-17M0 -9L5 -14V-19M-5 -11L-8 -14M5 -14L8 -16M0 -14L-2 -19M0 -14L3 -18"/></g>`;
const seaweed = (x: number, by: number, h: number, c: string) =>
  `<path d="M${x} ${by}Q${x - 3} ${f(by - h * 0.25)} ${x} ${f(by - h * 0.5)}T${x} ${f(by - h)}" stroke="${c}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
const shell = (cx: number, cy: number, s: number, fill: string, line: string) => {
  let ridges = '';
  for (let i = 0; i < 7; i++) {
    const [x, y] = pol(0, 0, 11, -60 + i * 20);
    ridges += `M0 4L${f(x)} ${f(y)}`;
  }
  return `<g transform="translate(${cx} ${cy}) scale(${s})"><path d="M0 4L-10.5 -3.5Q-8 -11 0 -11.5Q8 -11 10.5 -3.5Z" fill="${fill}"/><path d="${ridges}" stroke="${line}" stroke-width=".8"/><path d="M-3 4H3L2 6.5H-2Z" fill="${fill}" stroke="${line}" stroke-width=".4"/></g>`;
};
const ghost = (x: number, y: number, s: number, fill = '#f8fafc') =>
  `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-8 10V-2A8 8 0 0 1 8 -2V10L5.3 7.5L2.7 10L0 7.5L-2.7 10L-5.3 7.5Z" fill="${fill}" opacity=".94"/>` +
  `<path d="M-8 3Q-11 1 -12 -2M8 3Q11 1 12 -2" stroke="#f8fafc" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".9"/>` +
  `<ellipse cx="-2.8" cy="-1.5" rx="1.3" ry="1.9" fill="#1e1b4b"/><ellipse cx="2.8" cy="-1.5" rx="1.3" ry="1.9" fill="#1e1b4b"/><ellipse cx="0" cy="3" rx="1.4" ry="1.8" fill="#1e1b4b"/></g>`;
const tomb = (x: number, by: number, w: number, h: number, fill: string, mark = '#3b2a55') =>
  `<path d="M${f(x - w / 2)} ${by}V${f(by - h + w / 2)}A${w / 2} ${w / 2} 0 0 1 ${f(x + w / 2)} ${f(by - h + w / 2)}V${by}Z" fill="${fill}"/>` +
  `<path d="M${f(x - w * 0.25)} ${f(by - h * 0.55)}H${f(x + w * 0.25)}M${f(x - w * 0.25)} ${f(by - h * 0.4)}H${f(x + w * 0.2)}" stroke="${mark}" stroke-width=".7"/>`;
const deadTree = (x: number, by: number, s: number, c: string) =>
  `<g transform="translate(${x} ${by}) scale(${s})" stroke="${c}" stroke-linecap="round" fill="none"><path d="M0 0Q-1 -12 0 -22" stroke-width="3"/>` +
  `<path d="M0 -10L-7 -17L-10 -16M-7 -17L-8 -22M0 -15L6 -21L9 -20M6 -21L6 -25M0 -22L-3 -27M0 -22L2 -28" stroke-width="1.5"/></g>`;
const spider = (x: number, y0: number, y1: number) =>
  `<path d="M${x} ${y0}V${y1 - 2}" stroke="#e9d5ff" stroke-opacity=".6" stroke-width=".4"/><g transform="translate(${x} ${y1})" stroke="#0a0412" stroke-width=".7" fill="none">` +
  `<path d="M-1 0L-4 -2.5L-5.5 -1M-1 .6L-4.5 .6L-5.5 2M-1 1.2L-3.5 3.5L-4 5M1 0L4 -2.5L5.5 -1M1 .6L4.5 .6L5.5 2M1 1.2L3.5 3.5L4 5"/></g><ellipse cx="${x}" cy="${f(y1 + 0.6)}" rx="1.8" ry="2.3" fill="#0a0412"/>`;
const snowman = (cx: number, by: number, s: number, shade?: string) =>
  `<g transform="translate(${cx} ${by}) scale(${s})">` +
  `<path d="M-7.5 -23L-16 -29M-13 -27L-15 -31M7.5 -23L16 -29M13 -27L15 -31" stroke="#78350f" stroke-width="1.2" stroke-linecap="round" fill="none"/>` +
  [[-8, 10], [-23, 8], [-35, 6]].map(([cy, r]) => `<circle cx="0" cy="${cy}" r="${r}" fill="${shade ? `url(#${shade})` : '#f8fafc'}"/>`).join('') +
  `<path d="M-9 -4Q0 2 9 -4" stroke="#cbd5e1" stroke-width="1" fill="none"/>` +
  `<rect x="-6.5" y="-41.5" width="13" height="2" rx=".5" fill="#111827"/><rect x="-4.2" y="-49" width="8.4" height="7.5" fill="#111827"/><rect x="-4.2" y="-43.6" width="8.4" height="1.6" fill="#dc2626"/>` +
  `<circle cx="-2.2" cy="-36.5" r=".9" fill="#111827"/><circle cx="2.2" cy="-36.5" r=".9" fill="#111827"/><path d="M0 -34.5L6.5 -33.6L0 -32.9Z" fill="#f97316"/>` +
  `<path d="M-3 -31.5Q0 -30 3 -31.5" stroke="#111827" stroke-width=".7" fill="none" stroke-linecap="round"/>` +
  `<path d="M-6.5 -29.5Q0 -27 6.5 -29.5V-27.3Q0 -24.8 -6.5 -27.3Z" fill="#dc2626"/><path d="M3 -28L5 -20.5L2.4 -20.5L1.6 -27.5Z" fill="#b91c1c"/>` +
  `<circle cx="0" cy="-25" r=".9" fill="#111827"/><circle cx="0" cy="-21" r=".9" fill="#111827"/><circle cx="0" cy="-17" r=".9" fill="#111827"/></g>`;
const pie = (cx: number, cy: number, r: number, filling = '#ea580c') => {
  let crust = '';
  for (let a = 0; a <= 360; a += 3) {
    const [x, y] = pol(cx, cy, r + 1.6 * Math.cos(((a * Math.PI) / 180) * 30), a);
    crust += `${a ? 'L' : 'M'}${f(x)} ${f(y)}`;
  }
  let cream = '';
  for (let i = 0; i < 8; i++) {
    const [x, y] = pol(cx, cy, r * 0.6, i * 45 + 22.5);
    cream += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.13)}" fill="#fff7ed"/><path d="${arcD(x, y, r * 0.07, 200, 340)}" stroke="#fed7aa" stroke-width=".6" fill="none"/>`;
  }
  return `<path d="${crust}Z" fill="#d97706" stroke="#92400e" stroke-width=".8"/><circle cx="${cx}" cy="${cy}" r="${f(r * 0.84)}" fill="${filling}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${f(r * 0.84)}" fill="none" stroke="#c2410c" stroke-width="1"/><circle cx="${f(cx - r * 0.25)}" cy="${f(cy - r * 0.3)}" r="${f(r * 0.3)}" fill="#fb923c" opacity=".35"/>` +
    `${cream}<circle cx="${cx}" cy="${cy}" r="${f(r * 0.2)}" fill="#fff7ed"/><path d="${arcD(cx, cy, r * 0.1, 200, 520)}" stroke="#fed7aa" stroke-width=".7" fill="none"/>`;
};
const gem = (cx: number, cy: number, s: number, gid: string) =>
  `<g transform="translate(${cx} ${cy}) scale(${s})"><path d="M-12 -4L-7 -10H7L12 -4L0 12Z" fill="url(#${gid})" stroke="#e0f2fe" stroke-width=".5"/>` +
  `<path d="M-12 -4H12M-7 -10L-4 -4L0 -10L4 -4L7 -10M-4 -4L0 12L4 -4" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width=".5"/></g>`;
const laurel = (cx: number, cy: number, r: number, a0: number, a1: number, n: number, fill: string, size = 1, stroke = 'none') => {
  let s = `<path d="${arcD(cx, cy, r, a0, a1)}" stroke="${fill}" stroke-width="${f(0.9 * size)}" fill="none"/>`;
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * i) / (n - 1);
    for (const side of [-1, 1]) {
      const [x, y] = pol(cx, cy, r + side * 2.5 * size, a);
      s += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(1.4 * size)}" ry="${f(3.4 * size)}" fill="${fill}" stroke="${stroke}" stroke-width=".4" transform="rotate(${f(a + 90 + side * 40 * Math.sign(a1 - a0))} ${f(x)} ${f(y)})"/>`;
    }
  }
  return s;
};
// Shading for the card backs: a lit sphere (highlight up and to the left),
// a soft blur, and the shadow side of a round object.
const sphere = (id: string, light: string, mid: string, dark: string) => rad(id, [[0, light], [0.5, mid], [1, dark]], 0.35, 0.3, 0.8);
const blur = (id: string, sd: number) => `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${sd}"/></filter>`;
const shadowSide = (id: string, strength = 0.55) => rad(id, [[0.5, '#000', 0], [1, '#000', strength]], 0.3, 0.28, 0.9);

// Realism for the card backs: SVG lighting and noise filters.
const hexRgb = (hex: string) => [1, 3, 5].map((i) => f(parseInt(hex.slice(i, i + 2), 16) / 255));
// Card stock: lit paper fibres, multiplied over the artwork.
const paperTex = (id: string, seed = 3) =>
  `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="2.4" numOctaves="2" seed="${seed}" result="n"/>` +
  `<feDiffuseLighting in="n" surfaceScale=".9" diffuseConstant="1.1" lighting-color="#fff"><feDistantLight azimuth="225" elevation="55"/></feDiffuseLighting></filter>`;
// Raised, lit edges (a bevel), plus an optional drop shadow, for a card's
// center design and frame. The light comes from the top left. sRGB, because
// in the default linearRGB the faint light on flat areas turns dark colors grey.
const embossLift = (id: string, shadow = true) =>
  `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation=".7" result="b"/>` +
  `<feSpecularLighting in="b" surfaceScale="2.2" specularConstant=".85" specularExponent="30" lighting-color="#fff" result="s"><feDistantLight azimuth="225" elevation="40"/></feSpecularLighting>` +
  `<feComposite in="s" in2="SourceAlpha" operator="in" result="si"/><feComposite in="SourceGraphic" in2="si" operator="arithmetic" k2="1" k3=".6" result="lit"/>` +
  (shadow ? `<feDropShadow in="lit" dx="0" dy="1.4" stdDeviation="1.3" flood-color="#000" flood-opacity=".6"/>` : '') + `</filter>`;
// Soft colored clouds (nebulae, fog, smoke): fractal noise as one color's alpha.
const clouds = (id: string, color: string, freq: string, seed: number, density = 2.2, cut = 0.9) => {
  const [r, g, b] = hexRgb(color);
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="4" seed="${seed}"/>` +
    `<feColorMatrix values="0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  0 0 0 ${density} -${cut}"/></filter>`;
};
// A lit, bumpy surface (stone, moon rock, crust, snow, velvet) to multiply over a shape.
const rough = (id: string, freq: number | string, seed: number, scale = 1.6) =>
  `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="4" seed="${seed}" result="n"/>` +
  `<feDiffuseLighting in="n" surfaceScale="${scale}" lighting-color="#fff"><feDistantLight azimuth="225" elevation="50"/></feDiffuseLighting></filter>`;
// Wavy heat distortion for flames.
const warp = (id: string, scale: number, seed: number) =>
  `<filter id="${id}" x="-10%" y="-20%" width="120%" height="140%"><feTurbulence type="turbulence" baseFrequency=".035 .09" numOctaves="2" seed="${seed}" result="t"/>` +
  `<feDisplacementMap in="SourceGraphic" in2="t" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/></filter>`;
// The bright, rippling web of sunlight on the sea floor.
const caustics = (id: string, seed: number) =>
  `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="turbulence" baseFrequency=".07 .1" numOctaves="2" seed="${seed}"/>` +
  `<feColorMatrix values="0 0 0 0 .85  0 0 0 0 .97  0 0 0 0 1  0 0 0 -3 1.05"/></filter>`;
// A neon tube: a wide soft glow, the colored glass, and a white-hot core.
const tube = (d: string, color: string, w: number, blurId: string) =>
  `<path d="${d}" stroke="${color}" stroke-width="${f(w * 3.2)}" stroke-opacity=".45" fill="none" filter="url(#${blurId})" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="${d}" stroke="${color}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="${d}" stroke="#fff" stroke-width="${f(w * 0.35)}" stroke-opacity=".9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
// Engraved guilloché: phase-shifted wavy ellipses, like a banknote or a
// classic casino card back.
const guilloche = (cx: number, cy: number, rx: number, ry: number, amp: number, waves: number, count: number, color: string, w: number) => {
  // Enough points for a smooth curve at this size, and no more.
  const n = Math.max(48, Math.round((rx + ry) * 4));
  let out = '';
  for (let j = 0; j < count; j++) {
    let d = '';
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI * 2, k = 1 + (amp / Math.max(rx, ry)) * Math.sin(waves * t + (j * Math.PI * 2) / count);
      d += `${i ? 'L' : 'M'}${f(cx + rx * k * Math.cos(t))} ${f(cy + ry * k * Math.sin(t))}`;
    }
    out += `<path d="${d}Z" stroke="${color}" stroke-width="${w}" fill="none"/>`;
  }
  return out;
};
// Round, overlapping dragon scales: each a shaded dome with a highlight,
// upper rows drawn last so every scale shows its rounded lower edge.
const scalePattern = (id: string, shade: string, edge: string) => {
  const W = 8, H = 7, R = 4.7;
  const one = (x: number, y: number) =>
    `<circle cx="${x}" cy="${y}" r="${R}" fill="url(#${shade})" stroke="${edge}" stroke-width=".45"/>` +
    `<path d="M${f(x - R * 0.72)} ${f(y + R * 0.38)}Q${x} ${f(y + R * 1.02)} ${f(x + R * 0.72)} ${f(y + R * 0.38)}" stroke="#fdba74" stroke-opacity=".3" stroke-width=".5" fill="none"/>` +
    `<ellipse cx="${f(x - 1.3)}" cy="${f(y + 1.6)}" rx="1.3" ry=".7" fill="#fff" opacity=".22" transform="rotate(-25 ${f(x - 1.3)} ${f(y + 1.6)})"/>`;
  const rows: [number, number][] = [[4, H * 2 - H / 2 + H / 2], [0, H], [W, H], [4, H / 2], [0, 0], [W, 0], [4, -H / 2]];
  return `<pattern id="${id}" width="${W}" height="${H}" patternUnits="userSpaceOnUse">${rows.map(([x, y]) => one(x, y)).join('')}</pattern>`;
};

// Engraving: parallel hatch lines as a pattern, and a mask that fades them in
// toward the shadow side (bottom right) of whatever it is applied to.
const hatchPattern = (id: string, angle: number, gap: number, color: string, w: number) =>
  `<pattern id="${id}" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse" patternTransform="rotate(${angle})"><path d="M0 0V${gap}" stroke="${color}" stroke-width="${w}"/></pattern>`;
const shadeMask = (id: string) =>
  `<linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset=".35" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>` +
  `<mask id="${id}" maskContentUnits="objectBoundingBox"><rect width="1" height="1" fill="url(#${id}g)"/></mask>`;
// Hatching over a box, kept inside a clip path and faded in by a mask.
const engrave = (clip: string, x: number, y: number, w: number, h: number, hatch: string, mask: string, opacity = 1) =>
  `<g clip-path="url(#${clip})"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${hatch})" mask="url(#${mask})" opacity="${opacity}"/></g>`;
// A bright star's diffraction spikes.
const spikes = (x: number, y: number, len: number, color = '#fff') =>
  `<path d="M${f(x - len)} ${y}H${f(x + len)}M${x} ${f(y - len)}V${f(y + len)}" stroke="${color}" stroke-width=".35" stroke-opacity=".8"/><circle cx="${x}" cy="${y}" r="${f(len * 0.16)}" fill="${color}"/>`;
// Several thin lines following one wave, for water and sand.
const ripples = (y: number, amp: number, period: number, phase: number, count: number, gap: number, color: string, opacity: number) => {
  let out = '';
  for (let i = 0; i < count; i++) out += `<path d="${waveD(0, 100, y + i * gap, amp * (1 - i * 0.12), period, phase + i * 0.5)}" stroke="${color}" stroke-opacity="${f(opacity * (1 - i * 0.18))}" stroke-width=".35" fill="none"/>`;
  return out;
};
// A maple leaf's veins, to lay over maple(s).
const mapleVeins = (s: number, color: string, opacity = 0.45) => {
  const k = s / 10;
  return `<path d="M0 ${f(8.5 * k)}V${f(-9 * k)}M0 ${f(-1 * k)}L${f(-7 * k)} ${f(-3.5 * k)}M0 ${f(-1 * k)}L${f(7 * k)} ${f(-3.5 * k)}M0 ${f(2.5 * k)}L${f(-4.5 * k)} ${f(5 * k)}M0 ${f(2.5 * k)}L${f(4.5 * k)} ${f(5 * k)}" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${f(Math.max(0.2, 0.06 * s))}" fill="none"/>`;
};

// ---------- season shapes ----------
const at = (x: number, y: number, s: number, rot = 0) => `translate(${f(x)} ${f(y)}) rotate(${f(rot)}) scale(${s})`;
// A notched five-petal cherry blossom, about 13 across at s = 1.
const blossom = (x: number, y: number, s: number, petal: string, rot = 0, edge = '#be185d') => {
  let p = '', st = '';
  for (let i = 0; i < 5; i++) {
    p += `<path transform="rotate(${i * 72})" d="M0 0C-3 -1.4 -3.8 -5.4 -1.5 -6.6L0 -5.6L1.5 -6.6C3.8 -5.4 3 -1.4 0 0Z" fill="${petal}" stroke="${edge}" stroke-opacity=".4" stroke-width=".25"/>` +
      `<path transform="rotate(${i * 72})" d="M0 -.8V-4.8M0 -2.4L-1.1 -4.5M0 -2.4L1.1 -4.5" stroke="${edge}" stroke-opacity=".3" stroke-width=".18" fill="none"/>`;
  }
  for (let i = 0; i < 10; i++) {
    const [sx, sy] = pol(0, 0, 2.7, i * 36 + 18);
    st += `<path d="M0 0L${f(sx)} ${f(sy)}" stroke="${edge}" stroke-opacity=".55" stroke-width=".2"/><circle cx="${f(sx)}" cy="${f(sy)}" r=".38" fill="#facc15"/>`;
  }
  return `<g transform="${at(x, y, s, rot)}">${p}${st}<circle r="1" fill="#fde047"/></g>`;
};
// One loose, falling petal.
const petal = (x: number, y: number, s: number, fill: string, rot: number) =>
  `<path transform="${at(x, y, s, rot)}" d="M0 3C-2.4 1.6 -2.4 -2 -1 -3L0 -2.2L1 -3C2.4 -2 2.4 1.6 0 3Z" fill="${fill}"/>`;
// A closed bud on a short stem.
const bud = (x: number, y: number, s: number, fill: string, rot: number) =>
  `<g transform="${at(x, y, s, rot)}"><path d="M0 0V-3" stroke="#7c2d12" stroke-width=".6"/><path d="M0 -2.4C-1.8 -3.4 -1.6 -6.4 0 -7.2C1.6 -6.4 1.8 -3.4 0 -2.4Z" fill="${fill}"/><path d="M-1 -2.8L0 -4L1 -2.8" stroke="#65a30d" stroke-width=".7" fill="none"/></g>`;
// A butterfly about 24 across at s = 1, wings veined and spotted.
const butterfly = (x: number, y: number, s: number, upper: string, lower: string, rot = 0) => {
  const wing = `<path d="M-.6 -1C-3.5 -8 -11 -10.5 -12 -5C-12.8 -1 -7 1.2 -.8 .4Z" fill="${upper}" stroke="#1f2937" stroke-width=".5"/>` +
    `<path d="M-.6 .8C-4.5 1.6 -9.5 4 -8.6 8.4C-7.8 11.6 -2.4 8.6 -.4 2.6Z" fill="${lower}" stroke="#1f2937" stroke-width=".5"/>` +
    `<path d="M-1.2 -.6L-10.4 -5.2M-1.6 -.9L-7.8 -8.6M-1.4 -.2L-11.6 -2.2M-1 .8L-7.8 3.6M-1 1.2L-5.2 8.6" stroke="#1f2937" stroke-opacity=".55" stroke-width=".3" fill="none"/>` +
    `<path d="M-11.6 -4.2C-12 -1.6 -8 .4 -3 .2" stroke="#1f2937" stroke-width="1.1" fill="none" stroke-opacity=".7"/>` +
    `<circle cx="-9.6" cy="-5.4" r="1.1" fill="#fff" opacity=".9"/><circle cx="-11" cy="-2.6" r=".6" fill="#fff" opacity=".9"/><circle cx="-6.6" cy="6.6" r=".8" fill="#fff" opacity=".9"/>`;
  return `<g transform="${at(x, y, s, rot)}">${wing}<g transform="scale(-1 1)">${wing}</g>` +
    `<ellipse rx="1" ry="5" fill="#1f2937"/><path d="M-.4 -4.6Q-2 -8.4 -3.6 -9.2M.4 -4.6Q2 -8.4 3.6 -9.2" stroke="#1f2937" stroke-width=".4" fill="none"/><circle cx="-3.6" cy="-9.2" r=".5" fill="#1f2937"/><circle cx="3.6" cy="-9.2" r=".5" fill="#1f2937"/></g>`;
};
// A tulip on its stem, h tall, with a leaf.
const tulip = (x: number, by: number, h: number, c: string, dark: string) =>
  `<path d="M${x} ${by}Q${f(x - 1.2)} ${f(by - h / 2)} ${x} ${f(by - h)}" stroke="#15803d" stroke-width="1" fill="none"/>` +
  `<path d="M${x} ${f(by - 1)}Q${f(x - 5)} ${f(by - h * 0.4)} ${f(x - 3.4)} ${f(by - h * 0.72)}Q${f(x - 1)} ${f(by - h * 0.4)} ${x} ${f(by - 1)}Z" fill="#16a34a"/>` +
  `<path d="M${f(x - 0.6)} ${f(by - 2)}Q${f(x - 2.6)} ${f(by - h * 0.4)} ${f(x - 3.1)} ${f(by - h * 0.66)}" stroke="#14532d" stroke-width=".3" fill="none"/>` +
  `<g transform="translate(${x} ${f(by - h)})"><path d="M-3.2 0Q-3.8 -4.6 -2 -6.4L-.9 -4.4L0 -6.8L.9 -4.4L2 -6.4Q3.8 -4.6 3.2 0Q0 2.4 -3.2 0Z" fill="${c}"/>` +
  `<path d="M-.9 -4.4Q-1.4 -1.4 0 1.2M.9 -4.4Q1.4 -1.4 0 1.2" stroke="${dark}" stroke-width=".35" fill="none"/><path d="M-2.2 -4Q-2.6 -1.6 -1.4 .4" stroke="#fff" stroke-opacity=".45" stroke-width=".5" fill="none"/></g>`;
// A white daisy, about 14 across at s = 1.
const daisy = (x: number, y: number, s: number, rot = 0) => {
  let p = '';
  for (let i = 0; i < 14; i++) p += `<ellipse transform="rotate(${f(i * (360 / 14))})" cx="0" cy="-4.6" rx="1.25" ry="3.2" fill="#fff" stroke="#cbd5e1" stroke-width=".25"/>`;
  return `<g transform="${at(x, y, s, rot)}">${p}<circle r="2.4" fill="#facc15"/><circle r="2.4" fill="none" stroke="#ca8a04" stroke-width=".4" stroke-dasharray=".4 .5"/><circle cx="-.7" cy="-.7" r=".7" fill="#fef9c3"/></g>`;
};
const raindrop = (x: number, y: number, s: number, fill: string) =>
  `<path transform="${at(x, y, s)}" d="M0 -3.4Q2.2 -.2 2.2 1.2A2.2 2.2 0 1 1 -2.2 1.2Q-2.2 -.2 0 -3.4Z" fill="${fill}"/><path transform="${at(x, y, s)}" d="M-1 .4Q-1.2 1.6 -.2 2.2" stroke="#fff" stroke-opacity=".7" stroke-width=".45" fill="none"/>`;
// An open umbrella, canopy 32 wide at s = 1, in two alternating colors.
// hook: false gives a beach umbrella's straight pole.
const umbrella = (x: number, y: number, s: number, a: string, b: string, clipId: string, hook = true) => {
  const xs = [-16, -8, 0, 8, 16];
  let wedges = '', ribs = '';
  for (let i = 0; i < 4; i++) wedges += `<path d="M0 -20L${xs[i] * 1.3} 3L${xs[i + 1] * 1.3} 3Z" fill="${i % 2 ? b : a}"/>`;
  for (const xx of xs.slice(1, 4)) ribs += `M0 -15Q${f(xx * 0.55)} -11 ${xx} 0`;
  const canopy = 'M-16 0Q-15.5 -14 0 -15Q15.5 -14 16 0Q12 -3 8 0Q4 -3 0 0Q-4 -3 -8 0Q-12 -3 -16 0Z';
  return `<g transform="${at(x, y, s)}"><clipPath id="${clipId}"><path d="${canopy}"/></clipPath>` +
    (hook ? `<path d="M0 -2V15Q0 19 -3 19Q-6 19 -6 16" stroke="#78350f" stroke-width="1.4" fill="none" stroke-linecap="round"/>`
      : `<path d="M0 -2V34" stroke="#e7e5e4" stroke-width="1.4"/><path d="M.4 -2V34" stroke="#78716c" stroke-width=".4"/>`) +
    `<g clip-path="url(#${clipId})">${wedges}<path d="M5 -17H17V2H5Z" fill="#000" opacity=".14"/><path d="M-16 -2.6Q0 -5 16 -2.6V2H-16Z" fill="#000" opacity=".12"/></g>` +
    `<path d="${ribs}" stroke="#000" stroke-opacity=".25" stroke-width=".5" fill="none"/><path d="${canopy}" fill="none" stroke="#000" stroke-opacity=".35" stroke-width=".6"/>` +
    `<path d="M-12 -6Q-10 -11.5 -3 -13" stroke="#fff" stroke-opacity=".5" stroke-width="1" fill="none" stroke-linecap="round"/><path d="M0 -15V-17.6" stroke="#78350f" stroke-width="1.2" stroke-linecap="round"/></g>`;
};
// A palm tree, h tall, its crown leaning by `lean`.
const palm = (x: number, by: number, h: number, lean: number, trunk: string, leaf: string, rib: string) => {
  const tx = x + lean, ty = by - h;
  let rings = '';
  for (let k = 1; k < 10; k++) {
    const t = k / 10, px = x + lean * t * t, py = by - h * t;
    rings += `M${f(px - 1.6 + t)} ${f(py)}Q${f(px)} ${f(py + 0.9)} ${f(px + 1.6 - t)} ${f(py)}`;
  }
  let fronds = '';
  // Fronds fan out and droop on both sides, longest at the sides.
  [-206, -176, -146, -114, -72, -38, -8, 22].forEach((a, i) => {
    const L = 15 + Math.abs(i - 3.5) * 1.6;
    let cuts = '';
    for (let k = 2.4; k < L - 1; k += 1.5) {
      const my = (-3.4 * k * (L - k)) / ((L * L) / 4) / 2 + (3.6 * k) / L / 2;
      cuts += `M${f(k)} ${f(my)}l1.6 2.6M${f(k)} ${f(my)}l1.4 -3`;
    }
    fronds += `<g transform="translate(${f(tx)} ${f(ty)}) rotate(${a})"><path d="M0 0Q${f(L / 2)} -8.4 ${L} 3.6Q${f(L / 2)} 1.8 0 0Z" fill="${leaf}"/>` +
      `<path d="M0 0Q${f(L / 2)} -3.4 ${L} 3.6" stroke="${rib}" stroke-width=".45" fill="none"/><path d="${cuts}" stroke="${rib}" stroke-opacity=".6" stroke-width=".3"/></g>`;
  });
  return `<path d="M${f(x - 3.2)} ${by}Q${f(x + lean * 0.3 - 0.4)} ${f(by - h * 0.5)} ${f(tx - 1.5)} ${f(ty)}L${f(tx + 1.5)} ${f(ty)}Q${f(x + lean * 0.3 + 3)} ${f(by - h * 0.5)} ${f(x + 3.2)} ${by}Z" fill="${trunk}"/>` +
    `<path d="${rings}" stroke="#000" stroke-opacity=".35" stroke-width=".4" fill="none"/>${fronds}` +
    `<circle cx="${f(tx - 1)}" cy="${f(ty + 1.4)}" r="1.4" fill="#78350f"/><circle cx="${f(tx + 1.2)}" cy="${f(ty + 1.8)}" r="1.4" fill="#92400e"/>`;
};
// A sun: a lit disc inside a ring of long and short rays.
const sunRays = (cx: number, cy: number, r: number, n: number, ray: string) => {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = (i * 180) / n, len = i % 2 ? r * 1.35 : r * 1.7;
    const [x1, y1] = pol(cx, cy, r * 1.05, a - 90 / n * 0.7), [x2, y2] = pol(cx, cy, len, a), [x3, y3] = pol(cx, cy, r * 1.05, a + 90 / n * 0.7);
    d += `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}L${f(x3)} ${f(y3)}Z`;
  }
  return `<path d="${d}" fill="${ray}"/>`;
};
// A slice of watermelon, flat side up, 32 across at s = 1.
const melon = (x: number, y: number, s: number, rot = 0) => {
  let seeds = '';
  ([[-8, 4.5, -30], [-3, 7, -10], [3, 7, 10], [8, 4.5, 30], [0, 3.4, 0], [-5.4, 2.4, -20], [5.4, 2.4, 20]] as const).forEach(([sx, sy, r]) => {
    seeds += `<path transform="translate(${sx} ${sy}) rotate(${r})" d="M0 -1.3Q.9 0 0 1.3Q-.9 0 0 -1.3Z" fill="#1c1917"/><path transform="translate(${sx} ${sy}) rotate(${r})" d="M-.2 -.6V.2" stroke="#fff" stroke-opacity=".6" stroke-width=".25"/>`;
  });
  return `<g transform="${at(x, y, s, rot)}"><path d="M-16 0A16 16 0 0 0 16 0Z" fill="#15803d"/><path d="M-16 0A16 16 0 0 0 16 0" fill="none" stroke="#14532d" stroke-width="1"/>` +
    `<path d="M-14.6 0A14.6 14.6 0 0 0 14.6 0Z" fill="#dcfce7"/><path d="M-13.2 0A13.2 13.2 0 0 0 13.2 0Z" fill="#ef4444"/>` +
    `<path d="M-11 1.4A11 11 0 0 0 11 1.4" stroke="#fca5a5" stroke-opacity=".5" stroke-width=".4" fill="none"/>${seeds}<path d="M-13.2 0H13.2" stroke="#b91c1c" stroke-width=".5"/></g>`;
};
// A striped beach ball.
const beachBall = (x: number, y: number, r: number, clipId: string) =>
  `<clipPath id="${clipId}"><circle cx="${x}" cy="${y}" r="${r}"/></clipPath><g clip-path="url(#${clipId})"><circle cx="${x}" cy="${y}" r="${r}" fill="#f8fafc"/>` +
  `<path d="M${x} ${f(y - r)}Q${f(x - r * 1.2)} ${y} ${x} ${f(y + r)}L${f(x - r)} ${f(y + r)}V${f(y - r)}Z" fill="#ef4444"/><path d="M${x} ${f(y - r)}Q${f(x + r * 1.2)} ${y} ${x} ${f(y + r)}L${f(x + r)} ${f(y + r)}V${f(y - r)}Z" fill="#2563eb"/>` +
  `<path d="M${x} ${f(y - r)}Q${f(x - r * 0.35)} ${y} ${x} ${f(y + r)}Q${f(x + r * 0.35)} ${y} ${x} ${f(y - r)}Z" fill="#facc15"/>` +
  `<circle cx="${f(x - r * 0.35)}" cy="${f(y - r * 0.4)}" r="${f(r * 0.8)}" fill="#fff" opacity=".18"/><circle cx="${x}" cy="${f(y + r * 0.08)}" r="${f(r)}" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="${f(r * 0.3)}" transform="translate(${f(r * 0.12)} ${f(r * 0.12)})"/></g>` +
  `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="#000" stroke-opacity=".3" stroke-width=".4"/><circle cx="${f(x - r * 0.42)}" cy="${f(y - r * 0.45)}" r="${f(r * 0.16)}" fill="#fff" opacity=".85"/>`;
const starfish = (x: number, y: number, s: number, fill: string, rot = 0) => {
  let dots = '';
  for (let i = 0; i < 5; i++) for (const d of [1.6, 3]) {
    const [dx, dy] = pol(0, 0, d, i * 72);
    dots += `<circle cx="${f(dx)}" cy="${f(dy)}" r=".35" fill="#fff" opacity=".7"/>`;
  }
  return `<g transform="${at(x, y, s, rot)}"><path d="${starPath(0, 0, 5, 2, 5)}" fill="${fill}" stroke="#000" stroke-opacity=".25" stroke-width=".3" stroke-linejoin="round"/>${dots}</g>`;
};
// A red-and-white toadstool, about 24 across at s = 1.
const toadstool = (x: number, by: number, s: number, cap = '#dc2626') => {
  let gills = '';
  for (let k = -9; k <= 9; k += 1.5) gills += `M${f(k * 0.4)} -1.4L${f(k)} .2`;
  return `<g transform="${at(x, by, s)}"><path d="M-4 0L-4.6 12Q0 14 4.6 12L4 0Z" fill="#fef3c7"/><path d="M2.4 1L2.8 12.6" stroke="#d6b98c" stroke-width=".5"/><path d="M-4.4 6Q0 8 4.4 6L4.6 7.4Q0 9.6 -4.6 7.4Z" fill="#fde68a"/>` +
    `<path d="M-12 0Q-12 -12 0 -12.5Q12 -12 12 0Q0 2.6 -12 0Z" fill="${cap}"/><path d="M-12 0Q0 2.6 12 0Q0 -.6 -12 0Z" fill="#fef3c7"/><path d="${gills}" stroke="#d6b98c" stroke-width=".25"/>` +
    `<ellipse cx="-5" cy="-6.6" rx="2" ry="1.4" fill="#fff"/><ellipse cx="2" cy="-9" rx="1.6" ry="1.1" fill="#fff"/><ellipse cx="6.6" cy="-4.4" rx="1.6" ry="1.2" fill="#fff"/><ellipse cx="-1" cy="-3.4" rx="1.2" ry=".9" fill="#fff"/><ellipse cx="-8.8" cy="-2.6" rx="1" ry=".7" fill="#fff"/>` +
    `<path d="M-9.4 -6Q-6 -11 0 -11.4" stroke="#fff" stroke-opacity=".35" stroke-width="1" fill="none" stroke-linecap="round"/></g>`;
};
// A big acorn with a cross-hatched cap, about 22 tall at s = 1.
const acornBig = (x: number, y: number, s: number, nut: string, cap: string, rot = 0) => {
  const ac = nextId('ac');
  let hatch = '';
  for (let k = -10; k <= 10; k += 1.6) hatch += `M${f(k)} -5.4L${f(k + 4)} 1M${f(k + 4)} -5.4L${f(k)} 1`;
  return `<g transform="${at(x, y, s, rot)}"><path d="M-7.6 0Q-8 9 0 12.6Q8 9 7.6 0Z" fill="${nut}"/><path d="M4.6 1Q5.4 7.6 0 11" stroke="#000" stroke-opacity=".2" stroke-width="1.6" fill="none"/>` +
    `<path d="M-4.4 1.6Q-4.8 6 -2 9" stroke="#fff" stroke-opacity=".4" stroke-width="1" fill="none" stroke-linecap="round"/><path d="M0 12.6V13.8" stroke="${cap}" stroke-width=".8" stroke-linecap="round"/>` +
    `<clipPath id="${ac}"><path d="M-9 .8Q-9.4 -6 0 -6.6Q9.4 -6 9 .8Q0 2.6 -9 .8Z"/></clipPath><path d="M-9 .8Q-9.4 -6 0 -6.6Q9.4 -6 9 .8Q0 2.6 -9 .8Z" fill="${cap}"/>` +
    `<path d="${hatch}" stroke="#000" stroke-opacity=".3" stroke-width=".35" clip-path="url(#${ac})"/>` +
    `<path d="M-9 .8Q0 2.6 9 .8" stroke="#000" stroke-opacity=".3" stroke-width=".6" fill="none"/><path d="M0 -6.6Q.6 -9.4 2.6 -10.4" stroke="${cap}" stroke-width="1.2" fill="none" stroke-linecap="round"/></g>`;
};
// A night owl perched, about 34 tall at s = 1.
const owl = (x: number, y: number, s: number, body: string, belly: string, eye = '#facc15') => {
  let marks = '';
  for (let row = 0; row < 4; row++) for (let k = -1; k <= 1; k++) {
    const mx = k * 3.2 + (row % 2 ? 1.6 : 0), my = 2 + row * 3.4;
    if (Math.abs(mx) < 6.2 - row * 0.4) marks += `M${f(mx - 1.2)} ${f(my)}L${f(mx)} ${f(my + 1)}L${f(mx + 1.2)} ${f(my)}`;
  }
  const eyeD = (ex: number) => `<circle cx="${ex}" cy="-6" r="5.6" fill="${belly}"/><circle cx="${ex}" cy="-6" r="5.6" fill="none" stroke="#000" stroke-opacity=".2" stroke-width=".4" stroke-dasharray=".5 .5"/>` +
    `<circle cx="${ex}" cy="-6" r="3.6" fill="${eye}"/><circle cx="${ex}" cy="-6" r="3.6" fill="none" stroke="#92400e" stroke-width=".4"/><circle cx="${ex}" cy="-6" r="1.9" fill="#0a0a0a"/><circle cx="${f(ex - 0.8)}" cy="-6.9" r=".7" fill="#fff"/>`;
  return `<g transform="${at(x, y, s)}"><path d="M-9.6 -12L-8 -18L-4.4 -13.4Z M9.6 -12L8 -18L4.4 -13.4Z" fill="${body}"/>` +
    `<path d="M0 -15C10 -15 13 -6 12 4C11 13 6 17 0 17C-6 17 -11 13 -12 4C-13 -6 -10 -15 0 -15Z" fill="${body}"/>` +
    `<path d="M-12 2C-14 8 -12 13 -7 15C-9 10 -9.6 6 -12 2Z M12 2C14 8 12 13 7 15C9 10 9.6 6 12 2Z" fill="#000" opacity=".3"/>` +
    `<path d="M-11.6 4L-9 6.4M-11.8 7.4L-9 9.4M-11 10.6L-8.4 12M11.6 4L9 6.4M11.8 7.4L9 9.4M11 10.6L8.4 12" stroke="#000" stroke-opacity=".35" stroke-width=".35"/>` +
    `<ellipse cx="0" cy="7" rx="6.8" ry="8.6" fill="${belly}" opacity=".9"/><path d="${marks}" stroke="#78350f" stroke-width=".45" fill="none"/>${eyeD(-4.8)}${eyeD(4.8)}` +
    `<path d="M-1.4 -3L0 .4L1.4 -3Z" fill="#f59e0b"/><path d="M-4.6 17.2L-5.8 19.4M-3.6 17.4L-3.6 19.6M-2.6 17.2L-1.6 19.4M2.6 17.2L1.6 19.4M3.6 17.4L3.6 19.6M4.6 17.2L5.8 19.4" stroke="#f59e0b" stroke-width=".9" stroke-linecap="round"/>` +
    `<path d="M-7 -13.6Q0 -16.2 7 -13.6" stroke="#fff" stroke-opacity=".25" stroke-width=".8" fill="none"/></g>`;
};
// A lobed oak leaf, about 2s long, stem down.
const oakLeaf = (s: number) => {
  const k = s / 10;
  return `M0 ${f(10 * k)}C${f(-1 * k)} ${f(7 * k)} ${f(-4 * k)} ${f(8 * k)} ${f(-4 * k)} ${f(5 * k)}C${f(-6 * k)} ${f(5 * k)} ${f(-6.4 * k)} ${f(2 * k)} ${f(-4 * k)} ${f(1 * k)}` +
    `C${f(-6.6 * k)} 0 ${f(-6.4 * k)} ${f(-3.4 * k)} ${f(-3.6 * k)} ${f(-3.4 * k)}C${f(-5 * k)} ${f(-5.6 * k)} ${f(-3.4 * k)} ${f(-8 * k)} ${f(-1.4 * k)} ${f(-6.6 * k)}` +
    `C${f(-1.6 * k)} ${f(-9.4 * k)} ${f(1.6 * k)} ${f(-9.4 * k)} ${f(1.4 * k)} ${f(-6.6 * k)}C${f(3.4 * k)} ${f(-8 * k)} ${f(5 * k)} ${f(-5.6 * k)} ${f(3.6 * k)} ${f(-3.4 * k)}` +
    `C${f(6.4 * k)} ${f(-3.4 * k)} ${f(6.6 * k)} 0 ${f(4 * k)} ${f(1 * k)}C${f(6.4 * k)} ${f(2 * k)} ${f(6 * k)} ${f(5 * k)} ${f(4 * k)} ${f(5 * k)}C${f(4 * k)} ${f(8 * k)} ${f(1 * k)} ${f(7 * k)} 0 ${f(10 * k)}Z`;
};
const oakVeins = (s: number, color: string) => {
  const k = s / 10;
  return `<path d="M0 ${f(10 * k)}V${f(-7.4 * k)}M0 ${f(4 * k)}L${f(-3.6 * k)} ${f(3 * k)}M0 ${f(4 * k)}L${f(3.6 * k)} ${f(3 * k)}M0 0L${f(-4 * k)} ${f(-1.6 * k)}M0 0L${f(4 * k)} ${f(-1.6 * k)}M0 ${f(-3.6 * k)}L${f(-2.2 * k)} ${f(-5.4 * k)}M0 ${f(-3.6 * k)}L${f(2.2 * k)} ${f(-5.4 * k)}" stroke="${color}" stroke-opacity=".55" stroke-width="${f(Math.max(0.2, 0.05 * s))}" fill="none"/>`;
};
// A penguin, about 30 tall at s = 1.
const penguin = (x: number, y: number, s: number, scarf = '') =>
  `<g transform="${at(x, y, s)}"><path d="M0 -15C7 -15 9 -8 9.6 0C10.4 9 8 15 0 15C-8 15 -10.4 9 -9.6 0C-9 -8 -7 -15 0 -15Z" fill="#111827"/>` +
  `<path d="M0 -8C5 -8 6.6 -2 6.6 4C6.6 11 4 14 0 14C-4 14 -6.6 11 -6.6 4C-6.6 -2 -5 -8 0 -8Z" fill="#f8fafc"/><path d="M4.6 -2Q6 5 3.4 12.6" stroke="#cbd5e1" stroke-width=".8" fill="none"/>` +
  `<path d="M-9.4 -1Q-14 6 -11.6 10Q-9 6 -8.6 3Z M9.4 -1Q14 6 11.6 10Q9 6 8.6 3Z" fill="#1f2937"/>` +
  `<circle cx="-3" cy="-9.6" r="1.6" fill="#fff"/><circle cx="3" cy="-9.6" r="1.6" fill="#fff"/><circle cx="-2.7" cy="-9.4" r=".9" fill="#0a0a0a"/><circle cx="3.3" cy="-9.4" r=".9" fill="#0a0a0a"/><circle cx="-3" cy="-9.9" r=".3" fill="#fff"/><circle cx="3" cy="-9.9" r=".3" fill="#fff"/>` +
  `<path d="M-2 -7.4L0 -4.4L2 -7.4Z" fill="#f59e0b"/><path d="M-6 14.4Q-4 16.6 -1 15M1 15Q4 16.6 6 14.4" fill="#f59e0b" stroke="#f59e0b" stroke-width="1.4" stroke-linecap="round"/>` +
  (scarf ? `<path d="M-7.4 -5Q0 -1.6 7.4 -5L7.4 -2.4Q0 1 -7.4 -2.4Z" fill="${scarf}"/><path d="M3.6 -2.6L5.6 4L3.4 4.4L2 -2Z" fill="${scarf}"/><path d="M-6 -3.6L6 -3.6" stroke="#fff" stroke-opacity=".5" stroke-width=".4" stroke-dasharray=".8 .8"/>` : '') +
  `<path d="M-5 -12.6Q0 -15.2 5 -12.6" stroke="#fff" stroke-opacity=".3" stroke-width=".7" fill="none"/></g>`;
// A detailed ice crystal: six arms with two orders of branches, a hexagonal
// plate and facet lines, r across.
const crystal = (cx: number, cy: number, r: number, color: string, w = 1) => {
  let d = '', facets = '';
  for (let i = 0; i < 6; i++) {
    const a = i * 60, [x, y] = pol(cx, cy, r, a);
    d += `M${f(cx)} ${f(cy)}L${f(x)} ${f(y)}`;
    for (const [t, len] of [[0.32, 0.22], [0.52, 0.3], [0.72, 0.22], [0.88, 0.12]] as const) {
      const [bx, by] = pol(cx, cy, r * t, a);
      for (const side of [-1, 1]) {
        const [ex, ey] = pol(bx, by, r * len, a + side * 55);
        d += `M${f(bx)} ${f(by)}L${f(ex)} ${f(ey)}`;
        if (t === 0.52) {
          const [mx, my] = pol(bx, by, r * len * 0.55, a + side * 55), [nx, ny] = pol(mx, my, r * 0.09, a);
          d += `M${f(mx)} ${f(my)}L${f(nx)} ${f(ny)}`;
        }
      }
    }
    const [h1x, h1y] = pol(cx, cy, r * 0.2, a), [h2x, h2y] = pol(cx, cy, r * 0.2, a + 60);
    facets += `M${f(h1x)} ${f(h1y)}L${f(h2x)} ${f(h2y)}`;
  }
  return `<path d="${facets}Z" fill="${color}" fill-opacity=".25" stroke="${color}" stroke-width="${f(w * 0.6)}"/><path d="${d}" stroke="${color}" stroke-width="${w}" stroke-linecap="round" fill="none"/>`;
};
// A row of icicles hanging from y, between x0 and x1.
const icicles = (x0: number, x1: number, y: number, seed: number, fill: string) => {
  const r = rnd(seed);
  let out = '';
  for (let x = x0; x < x1; x += 3 + r() * 2.4) {
    const w = 1.6 + r() * 1.4, h = 4 + r() * 9;
    out += `<path d="M${f(x)} ${y}L${f(x + w / 2)} ${f(y + h)}L${f(x + w)} ${y}Z" fill="${fill}"/><path d="M${f(x + w * 0.3)} ${y}L${f(x + w * 0.48)} ${f(y + h * 0.8)}" stroke="#fff" stroke-opacity=".8" stroke-width=".3"/>`;
  }
  return out;
};
// A mountain range: peaks [x, y] across the bottom at by, with snow caps.
const mountains = (peaks: [number, number][], by: number, fill: string, snow: string, shade: string) => {
  let d = `M${peaks[0][0] - 20} ${by}`, caps = '', shades = '';
  peaks.forEach(([px, py], i) => {
    const [nx, ny] = peaks[i + 1] ?? [px + 20, by];
    const lv = (by - py) * 0.3;
    d += `L${px} ${py}`;
    caps += `M${f(px - lv * 0.75)} ${f(py + lv)}L${px} ${py}L${f(px + lv * 0.75)} ${f(py + lv)}L${f(px + lv * 0.35)} ${f(py + lv * 0.75)}L${f(px)} ${f(py + lv * 1.15)}L${f(px - lv * 0.3)} ${f(py + lv * 0.8)}Z`;
    shades += `M${px} ${py}L${f((px + nx) / 2)} ${f((py + ny) / 2 + 6)}L${f(px + 4)} ${by}Z`;
  });
  d += `L${peaks[peaks.length - 1][0] + 20} ${by}Z`;
  return `<path d="${d}" fill="${fill}"/><path d="${shades}" fill="${shade}" opacity=".35"/><path d="${caps}" fill="${snow}"/>`;
};
// A hibiscus flower, about 22 across at s = 1.
const hibiscus = (x: number, y: number, s: number, c: string, dark: string, rot = 0) => {
  let p = '';
  for (let i = 0; i < 5; i++) {
    p += `<g transform="rotate(${i * 72})"><path d="M0 0C-4.6 -2 -7 -8.4 -3 -10.6C-1.4 -11.4 0 -10.4 0 -10.4C0 -10.4 1.4 -11.4 3 -10.6C7 -8.4 4.6 -2 0 0Z" fill="${c}" stroke="${dark}" stroke-opacity=".4" stroke-width=".3"/>` +
      `<path d="M0 -1V-9M0 -3L-2.6 -7.6M0 -3L2.6 -7.6M0 -5.4L-1.4 -8.8M0 -5.4L1.4 -8.8" stroke="${dark}" stroke-opacity=".35" stroke-width=".22" fill="none"/></g>`;
  }
  return `<g transform="${at(x, y, s, rot)}">${p}<circle r="3" fill="${dark}" opacity=".75"/><path d="M0 0L2 -9" stroke="#fef3c7" stroke-width=".7"/>` +
    `<circle cx="2" cy="-9" r=".8" fill="#facc15"/><circle cx="1.2" cy="-8.4" r=".5" fill="#facc15"/><circle cx="2.8" cy="-8.2" r=".5" fill="#facc15"/><circle cx="2.4" cy="-9.9" r=".5" fill="#dc2626"/></g>`;
};

// ---------- nature shapes ----------
// A pine tree silhouette, h tall, in four tiers.
const pineSil = (x: number, by: number, h: number, fill: string) => {
  const w = h * 0.4;
  const side = (k: number) => [[0, -h], [0.34, -h * 0.72], [0.2, -h * 0.72], [0.62, -h * 0.44], [0.4, -h * 0.44], [1, -h * 0.12], [0.12, -h * 0.12], [0.12, 0]].map(([dx, dy]) => `${f(x + k * dx * w)} ${f(by + dy)}`);
  const right = side(1), left = side(-1).reverse();
  return `<path d="M${right.join('L')}L${left.join('L')}Z" fill="${fill}"/>`;
};
// A pinecone about 24 tall at s = 1, scales shaded at their lower edge.
const pinecone = (x: number, y: number, s: number, c: string, dark: string, rot = 0) => {
  let scales = '';
  for (let i = 0; i < 9; i++) {
    const sy = -9 + i * 2.4, half = 6.6 * Math.sin(((i + 0.6) / 9.6) * Math.PI), n = Math.max(2, Math.round(half / 1.7));
    for (let k = 0; k < n; k++) {
      const sx = -half + ((k + 0.5) * (2 * half)) / n + (i % 2 ? 0.8 : -0.8);
      scales += `M${f(sx - 1.8)} ${f(sy)}Q${f(sx)} ${f(sy + 2.6)} ${f(sx + 1.8)} ${f(sy)}Q${f(sx)} ${f(sy + 1)} ${f(sx - 1.8)} ${f(sy)}Z`;
    }
  }
  return `<g transform="${at(x, y, s, rot)}"><path d="M0 -12.6V-15.6" stroke="${dark}" stroke-width="1.2" stroke-linecap="round"/><ellipse cx="0" cy="0" rx="7" ry="12" fill="${c}"/>` +
    `<path d="${scales}" fill="${dark}" opacity=".75"/><ellipse cx="-2.6" cy="-4" rx="1.6" ry="5" fill="#fff" opacity=".12"/><ellipse cx="0" cy="0" rx="7" ry="12" fill="none" stroke="${dark}" stroke-width=".5"/></g>`;
};
// An ivy leaf about 14 tall at s = 1, with its veins.
const IVY = 'M0 6C-1 4 -6 4 -6.6 0C-7 -3 -4 -3.4 -3.2 -2.4C-3.6 -5.6 -1.4 -7.4 0 -7.6C1.4 -7.4 3.6 -5.6 3.2 -2.4C4 -3.4 7 -3 6.6 0C6 4 1 4 0 6Z';
const ivy = (x: number, y: number, s: number, fill: string, rot = 0) =>
  `<g transform="${at(x, y, s, rot)}"><path d="${IVY}" fill="${fill}" stroke="#14532d" stroke-opacity=".5" stroke-width=".3"/><path d="M0 5.6V-6.6M0 1L-4.6 -1M0 1L4.6 -1M0 -2L-2.6 -4.6M0 -2L2.6 -4.6" stroke="#dcfce7" stroke-opacity=".6" stroke-width=".3" fill="none"/></g>`;
// A little songbird (a robin) facing right, about 18 long at s = 1.
const songbird = (x: number, y: number, s: number) =>
  `<g transform="${at(x, y, s)}"><path d="M-6 0C-6 -4 -2 -6 2 -5C4 -6.4 6.4 -6 7 -4.6L9.6 -4.2L7 -3.2C7 1 4 4 -1 4L-7.6 6.4L-4.6 2.6C-5.6 2 -6 1.2 -6 0Z" fill="#78350f"/>` +
  `<path d="M1 -3.6C5 -2.6 6.4 0 4.4 2.6C2.4 4 -.6 3.6 -1.4 2C-1 -.6 -.4 -2.6 1 -3.6Z" fill="#ea580c"/><path d="M-4.6 -1.6C-2 -3 1 -2.4 1.6 .2C-1 1 -3.4 .6 -4.6 -1.6Z" fill="#451a03"/>` +
  `<path d="M-3.6 -1.2L-.6 -.4M-3 -.2L0 .6" stroke="#a16207" stroke-opacity=".7" stroke-width=".25"/><circle cx="5" cy="-4" r=".7" fill="#0a0a0a"/><circle cx="5.2" cy="-4.2" r=".22" fill="#fff"/>` +
  `<path d="M1 4V6.6M3 3.6V6.4" stroke="#78350f" stroke-width=".5"/><path d="M7 -4.6L9.6 -4.2L7 -3.4" fill="#f59e0b"/></g>`;
// A seedling: two leaves on a short stem in a mound of soil.
const sprout = (x: number, y: number, s: number, leaf: string, rot = 0) =>
  `<g transform="${at(x, y, s, rot)}"><path d="M-8 10Q0 6 8 10Z" fill="#78350f"/><path d="M0 9V-2" stroke="#15803d" stroke-width="1.4" stroke-linecap="round"/>` +
  `<path d="M0 -1C-2 -7 -9 -8.6 -11 -5.6C-8 -1.6 -3 -.4 0 -1Z" fill="${leaf}" stroke="#14532d" stroke-width=".4"/><path d="M0 -3C2 -10 9 -11.6 11 -8.6C9 -3.6 4 -2.4 0 -3Z" fill="${leaf}" stroke="#14532d" stroke-width=".4"/>` +
  `<path d="M-1 -1.6Q-5 -4.6 -9.4 -5.4M1 -3.6Q5 -7.6 9.4 -8.4" stroke="#dcfce7" stroke-opacity=".7" stroke-width=".35" fill="none"/></g>`;

// The site's name printed around a chip's center, like a real casino chip.
const CHIP_TEXT = 'STACKS OVERFLOWED • STACKS OVERFLOWED • ';

// ---------- the three item shapes ----------
const svgOpen = (viewBox: string, label: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%" role="img" aria-label="${label}">`;

interface CardSpec {
  label: string;
  bg: string[];
  edge: string;
  frame: string;
  hair?: string;
  frameW?: number;
  defs?: string;
  inner?: string;
  over?: string;
  corner?: CornerDraw | null;
  sheen?: number;
  // Strength of the card-stock texture over the artwork (0 for none).
  grain?: number;
  // Raise and light the center design's edges (off for glowing neon).
  emboss?: boolean;
  // Drawn last, clipped to the card: a holographic card's moving shine.
  shine?: string;
}
// A card back: the artwork in a recessed panel behind a bevelled frame, with
// paper grain, a vignette, a lifted (drop-shadowed) center design, a soft
// glare and a bevelled outer edge, so it reads as a printed, glossy card.
function card({ label, bg, edge, frame, hair = frame, frameW = 1.5, defs = '', inner = '', over = '', corner = null, sheen = 0.12, grain = 0.16, emboss = true, shine = '' }: CardSpec) {
  const g = nextId('cg'), c = nextId('cc'), pc = nextId('pc'), sh = nextId('sh'), vg = nextId('vg'), sp = nextId('sp');
  const bv = nextId('bv'), lf = nextId('lf'), fb = nextId('fb'), sf = nextId('sf'), gr = nextId('gr');
  const framed = frame !== 'none';
  return `${svgOpen('0 0 100 140', label)}<defs>${lin(g, bg, 1, 1)}<clipPath id="${c}"><rect x="1" y="1" width="98" height="138" rx="8"/></clipPath>` +
    `<clipPath id="${pc}"><rect x="7" y="7" width="86" height="126" rx="5"/></clipPath>` +
    `<linearGradient id="${sh}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${sheen}"/><stop offset=".42" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="${sheen / 2}"/></linearGradient>` +
    `${rad(vg, [[0.5, '#000', 0], [1, '#000', 0.45]])}${rad(sp, [[0, '#fff', 0.2], [1, '#fff', 0]], 0.22, 0.12, 0.6)}` +
    `<linearGradient id="${bv}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient>` +
    (emboss ? embossLift(lf) : `<filter id="${lf}" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1.4" stdDeviation="1.3" flood-color="#000" flood-opacity=".6"/></filter>`) +
    `${embossLift(fb, false)}${blur(sf, 1.8)}${paperTex(gr)}` +
    `${defs}</defs>` +
    `<rect x="1" y="1" width="98" height="138" rx="8" fill="url(#${g})"/>` +
    `<g clip-path="url(#${c})">${inner}${grain ? `<rect x="0" y="0" width="100" height="140" filter="url(#${gr})" opacity="${grain}" style="mix-blend-mode:multiply"/>` : ''}<rect x="0" y="0" width="100" height="140" fill="url(#${vg})"/></g>` +
    // The panel sits a little below the frame: a soft shadow just inside it.
    `<g clip-path="url(#${pc})"><rect x="7" y="7" width="86" height="126" rx="5" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="5" filter="url(#${sf})"/></g>` +
    (framed
      ? `<rect x="7.5" y="7.7" width="86" height="126" rx="5" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="${frameW}"/>` +
        `<rect x="7" y="7" width="86" height="126" rx="5" fill="none" stroke="${frame}" stroke-width="${frameW}" filter="url(#${fb})"/>` +
        `<rect x="6.6" y="6.6" width="86" height="126" rx="5.2" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width=".45"/>`
      : '') +
    `<rect x="9.6" y="9.6" width="80.8" height="120.8" rx="3.5" fill="none" stroke="${hair}" stroke-opacity=".45" stroke-width=".5"/>` +
    `<rect x="11.6" y="11.6" width="76.8" height="116.8" rx="2.6" fill="none" stroke="${hair}" stroke-opacity=".3" stroke-width=".35" stroke-dasharray=".6 1.1"/>` +
    `${corner ? corners(corner) : ''}<g filter="url(#${lf})">${over}</g>` +
    `<rect x="1" y="1" width="98" height="138" rx="8" fill="url(#${sp})"/><rect x="1" y="1" width="98" height="138" rx="8" fill="url(#${sh})"/>` +
    (shine ? `<g clip-path="url(#${c})">${shine}</g>` : '') +
    `<rect x="1" y="1" width="98" height="138" rx="8" fill="none" stroke="${edge}" stroke-width="2"/>` +
    `<rect x="1.6" y="1.6" width="96.8" height="136.8" rx="7.5" fill="none" stroke="url(#${bv})" stroke-width="1.2"/></svg>`;
}

// A coin value on a small plate at the bottom of a chip's center, under the
// emblem, like the denomination plate on a real casino chip.
const valueTag = (value: number, fill: string, plate: string, extra = '') => {
  const size = value >= 100 ? 8.4 : 9.4, w = String(value).length * size * 0.66 + 6;
  return `<rect x="${f(50 - w / 2)}" y="61.8" width="${f(w)}" height="10.6" rx="5.3" fill="${plate}" opacity=".9"/>` +
    `<text x="50" y="67.2" text-anchor="middle" dominant-baseline="central" font-family="'Arial Black', Arial, Helvetica, sans-serif" font-weight="900" font-size="${size}" fill="${fill}" letter-spacing="-.3" ${extra}>${value}</text>`;
};

interface ChipSpec {
  label: string;
  main: string[];
  spot: string | string[];
  ring: string;
  ringDash?: string;
  ringW?: number;
  inlay: string;
  inlayStroke?: string;
  defs?: string;
  emblem?: string;
  text?: string;
  // 'none' leaves the edge notches off.
  tick?: string;
  // A solid color behind the name ring, for busy designs.
  band?: string | null;
  // Value skins only: a filter id for the number (e.g. a neon glow).
  numberFilter?: string;
  // Holographic chips: foil laid over the body and edge spots, a moving
  // shine drawn last, clipped to the chip, and their own edge-spot shape
  // (drawn at 12 o'clock, around 50,8) in place of the square.
  foil?: string;
  shine?: string;
  spotShape?: string;
}
function chip({ label, main, spot, ring, ringDash = '4 3', ringW = 2, inlay, inlayStroke = 'none', defs = '', emblem = '', text = ring, tick = '#fff', band = null, foil = '', shine = '', spotShape }: ChipSpec) {
  const g = nextId('pg'), tp = nextId('tp'), cc = nextId('cc');
  let spots = '';
  for (let i = 0; i < 6; i++) {
    const fill = Array.isArray(spot) ? spot[i % spot.length] : spot;
    spots += spotShape
      ? `<g transform="rotate(${i * 60} 50 50)"><g fill="${fill}">${spotShape}</g><g fill="none" stroke="#000" stroke-opacity=".3" stroke-width=".5">${spotShape}</g></g>`
      : `<g transform="rotate(${i * 60} 50 50)"><rect x="44" y="3" width="12" height="10" rx="1.5" fill="${fill}"/><rect x="45.6" y="4.6" width="8.8" height="6.8" rx="1" fill="none" stroke="#000" stroke-opacity=".22" stroke-width=".6"/></g>`;
  }
  let ticks = '';
  for (let s = 0; s < 6; s++) {
    for (const d of [20, 30, 40]) {
      const [x0, y0] = pol(50, 50, 44, s * 60 + d);
      const [x1, y1] = pol(50, 50, 46.6, s * 60 + d);
      ticks += `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`;
    }
  }
  return `${svgOpen('0 0 100 100', label)}<defs>${lin(g, main, 1, 1)}<path id="${tp}" d="M50 17.6A32.4 32.4 0 1 1 49.99 17.6"/>` +
    `${shine ? `<clipPath id="${cc}"><circle cx="50" cy="50" r="47"/></clipPath>` : ''}${defs}</defs>` +
    `<circle cx="50" cy="52" r="47" fill="#000" opacity=".4"/><circle cx="50" cy="50" r="47" fill="url(#${g})"/>${spots}${foil}` +
    (tick === 'none' ? '' : `<path d="${ticks}" stroke="${tick}" stroke-opacity=".5" stroke-width="1.2" stroke-linecap="round"/>`) +
    `<circle cx="50" cy="50" r="47" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="1.2"/><circle cx="50" cy="50" r="43.4" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width=".6"/>` +
    `<circle cx="50" cy="50" r="36" fill="none" stroke="${ring}" stroke-width="${ringW}" stroke-dasharray="${ringDash}"/>` +
    (band ? `<circle cx="50" cy="50" r="32.4" fill="none" stroke="${band}" stroke-width="6.2"/>` : '') +
    `<text font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="3.4" fill="${text}" fill-opacity=".85"><textPath href="#${tp}" textLength="199" lengthAdjust="spacingAndGlyphs">${CHIP_TEXT}</textPath></text>` +
    `<circle cx="50" cy="50" r="29" fill="${inlay}" stroke="${inlayStroke}" stroke-width="1.5"/><circle cx="50" cy="50" r="26.6" fill="none" stroke="${inlayStroke}" stroke-opacity=".45" stroke-width=".5"/>${emblem}` +
    `<path d="M14 38A38 38 0 0 1 62 13" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="3" stroke-linecap="round"/>` +
    `${shine ? `<g clip-path="url(#${cc})">${shine}</g>` : ''}</svg>`;
}

// A chip cosmetic is a set: its main look (the shop, the profile) plus a skin
// for each coin value in CHIP_SKIN_VALUES. A value's skin has its own colors
// but the same pattern and emblem (a little smaller, moved up), with the value
// on a small plate underneath. The colors keep one family per value on every chip (5 red, 10 blue, 25 green,
// 50 orange or purple, 100 black or gold), so values read the same at a
// glance whichever chip a player has equipped.
interface ChipPalette { num: string; numStroke: string }
function chipSet<P extends ChipPalette>(name: string, main: P, values: Record<number, P>, spec: (p: P) => Omit<ChipSpec, 'label'>) {
  const v = drawOptions.value, p = v === undefined ? undefined : values[v];
  if (v === undefined || !p) return chip({ ...spec(main), label: `${name} chip` });
  const s = spec(p);
  return chip({ ...s, label: `${name} ${v} chip`,
    emblem: `<g transform="translate(50 44.5) scale(.82) translate(-50 -50)">${s.emblem ?? ''}</g>` + valueTag(v, p.num, p.numStroke, s.numberFilter ? `filter="url(#${s.numberFilter})"` : '') });
}

// A profile outline is drawn in a 120×120 box around a 40-radius photo at
// the center, so the photo fills two thirds of the box's width.
export const OUTLINE_PHOTO_FRACTION = 80 / 120;
interface OutlineSpec {
  label: string;
  defs?: string;
  under?: string;
  over?: string;
}
function outline({ label, defs = '', under = '', over = '' }: OutlineSpec) {
  const a = nextId('av');
  const avatar = drawOptions.avatar === false ? '' :
    `<g clip-path="url(#${a})"><rect x="20" y="20" width="80" height="80" fill="#1e293b"/><circle cx="60" cy="50.4" r="14.4" fill="#64748b"/>` +
    `<path d="M31.2 100c1.6-17.6 13.6-27.2 28.8-27.2s27.2 9.6 28.8 27.2z" fill="#64748b"/></g>`;
  return `${svgOpen('0 0 120 120', label)}<defs><clipPath id="${a}"><circle cx="60" cy="60" r="40"/></clipPath>${defs}</defs>${under}${avatar}${over}</svg>`;
}

// The rare holographic card in each box (3%): the theme's design under a
// rainbow foil, a fine foil grain, sparkles, and a band of light that sweeps
// across every few seconds (held still for visitors who turn off animation).
// motif and emblem get the rainbow gradient's id, to use in their own fills.
const RAINBOW = ['#ff5e7e', '#ffb86b', '#fff38a', '#7dfca8', '#6fe7ff', '#8b9dff', '#e58bff', '#ff5e7e'];
function holoCard({ label, bg, motif, emblem, defs = '', seed }: { label: string; bg: string[]; motif: (rb: string) => string; emblem: (rb: string) => string; defs?: string; seed: number }) {
  const rb = nextId('rb'), rb2 = nextId('rb'), fo = nextId('fo'), sw = nextId('sw'), sg = nextId('sg'), cls = nextId('hs');
  const stops = RAINBOW.map((c, i) => `<stop offset="${f(i / (RAINBOW.length - 1))}" stop-color="${c}"/>`).join('');
  const r = rnd(seed);
  let sparkles = '';
  for (let i = 0; i < 14; i++) sparkles += spark(f(12 + r() * 76), f(12 + r() * 116), f(0.9 + r() * 2.2));
  const foil =
    `<rect x="0" y="0" width="100" height="140" fill="url(#${rb})" opacity=".45" style="mix-blend-mode:screen"/>` +
    `<rect x="0" y="0" width="100" height="140" fill="url(#${rb2})" opacity=".35" style="mix-blend-mode:overlay"/>` +
    `<rect x="0" y="0" width="100" height="140" fill="url(#${fo})" style="mix-blend-mode:overlay"/>`;
  const shine =
    `<style>.${cls}{animation:cosmetic-holo-sweep 3.6s ease-in-out infinite}@keyframes cosmetic-holo-sweep{0%{transform:translateX(-110px)}55%,100%{transform:translateX(130px)}}` +
    `@media (prefers-reduced-motion:reduce){.${cls}{animation:none;transform:translateX(35px)}}</style>` +
    `<g class="${cls}"><rect x="-40" y="-40" width="34" height="220" fill="url(#${sw})" transform="rotate(20 50 70)" style="mix-blend-mode:screen"/></g>`;
  return card({ label, bg, edge: `url(#${rb})`, frame: `url(#${rb})`, hair: '#ffffff', frameW: 2, grain: 0.12,
    defs: `<linearGradient id="${rb}" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient>` +
      `<linearGradient id="${rb2}" x1="0" y1="0" x2=".32" y2=".24" spreadMethod="reflect">${stops}</linearGradient>` +
      `<pattern id="${fo}" width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="1" height="2.4" fill="#fff" opacity=".22"/></pattern>` +
      `<linearGradient id="${sw}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      glow(sg, 1.2) + defs,
    inner: `${motif(rb)}${foil}<g filter="url(#${sg})">${sparkles}</g>`,
    corner: (x, y) => spark(x, y, 2.6),
    over: emblem(rb),
    shine });
}

// A holographic chip: the chip's colors under iridescent foil, foil-colored
// edge spots and emblem, sparkles, and the same sweeping band of light as the
// holographic cards. Each set has its own style (foil colors, edge-spot shape,
// body, center and ring) so the sets don't look alike. Its value skins keep
// that style, center included, but use the same color family as every other
// chip (5 red, 10 blue, 25 green, 50 purple, 100 black) for the body.
const HOLO_CHIP_VALUES: Record<number, string[]> = { 5: ['#b91c1c', '#3b0707'], 10: ['#1d4ed8', '#0b1640'], 25: ['#047857', '#022c22'], 50: ['#6d28d9', '#1e0b47'], 100: ['#3f3f46', '#09090b'] };
const HOLO_EDGE: Record<string, string> = {
  bar: '<rect x="44.4" y="3" width="2.6" height="10" rx=".8"/><rect x="48.7" y="3" width="2.6" height="10" rx=".8"/><rect x="53" y="3" width="2.6" height="10" rx=".8"/>',
  diamond: '<path d="M50 2.2L57.4 8L50 13.8L42.6 8Z"/>',
  dot: '<circle cx="50" cy="8" r="5.2"/>',
  drop: `<path d="${flame(50, 13.8, 9.4, 12)}"/>`,
  star: `<path d="${starPath(50, 8.2, 6.6, 2.7, 5)}"/>`,
  arch: '<path d="M44.4 13.6V7.6A5.6 5.6 0 0 1 55.6 7.6V13.6Z"/>',
  leaf: `<path transform="translate(50 8.6)" d="${maple(6.2)}"/>`,
  flake: `<path d="${starPath(50, 8, 6.6, 2.4, 6)}"/>`,
  petal: '<path transform="translate(50 13.4) scale(1.55)" d="M0 0C-3 -1.4 -3.8 -5.4 -1.5 -6.6L0 -5.6L1.5 -6.6C3.8 -5.4 3 -1.4 0 0Z"/>',
  ray: '<path d="M50 1.4L56.6 13.8H43.4Z"/>',
  oval: '<ellipse cx="50" cy="8" rx="4.2" ry="6"/><rect x="45.2" y="2.4" width="9.6" height="3" rx="1.4"/>',
  hex: '<path d="M50 2L55.4 5V11L50 14L44.6 11V5Z"/>',
  pine: '<path d="M50 2L55 8.4H52.6L56.4 13.6H43.6L47.4 8.4H45Z"/>',
};
interface HoloChipStyle {
  foil: string[];
  edge: keyof typeof HOLO_EDGE;
  ring: string;
  ringDash?: string;
  // The main look's center; a light one also takes dark ink for the name ring.
  inlay: string;
  ink?: string;
}
function holoChip(name: string, main: string[], seed: number, style: HoloChipStyle, emblem: (rb: string, ink: string) => string) {
  const rb = nextId('rb'), rb2 = nextId('rb'), fo = nextId('fo'), sw = nextId('sw'), sg = nextId('sg'), cls = nextId('hs'), r = rnd(seed);
  const cyc = [...style.foil, style.foil[0]];
  const stops = cyc.map((c, i) => `<stop offset="${f(i / (cyc.length - 1))}" stop-color="${c}"/>`).join('');
  let sparkles = '';
  for (let i = 0; i < 7; i++) {
    const [x, y] = pol(50, 50, 38.5 + r() * 6, r() * 360);
    sparkles += spark(f(x), f(y), f(0.9 + r() * 1.3));
  }
  // On a light center the number is dark ink outlined in white.
  const ink = style.ink ?? '#ffffff', light = ink !== '#ffffff';
  const pal = (c: string[]) => ({ c, inlay: style.inlay, ink, num: ink, numStroke: light ? '#ffffff' : style.inlay });
  const values: Record<number, ReturnType<typeof pal>> = {};
  for (const v of CHIP_SKIN_VALUES) values[v] = pal(HOLO_CHIP_VALUES[v]);
  return chipSet(`${name} holographic`, pal(main), values, (p) => ({
    main: p.c, spot: `url(#${rb})`, spotShape: HOLO_EDGE[style.edge], ring: style.ring, ringDash: style.ringDash ?? 'none', ringW: 1.2,
    inlay: p.inlay, inlayStroke: `url(#${rb})`, tick: 'none', band: p.inlay, text: p.ink,
    defs: `<linearGradient id="${rb}" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient>` +
      `<linearGradient id="${rb2}" x1="0" y1="0" x2=".32" y2=".24" spreadMethod="reflect">${stops}</linearGradient>` +
      `<pattern id="${fo}" width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="1" height="2.4" fill="#fff" opacity=".22"/></pattern>` +
      `<linearGradient id="${sw}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      glow(sg, 1),
    foil: `<circle cx="50" cy="50" r="47" fill="url(#${rb2})" opacity=".34" style="mix-blend-mode:screen"/><circle cx="50" cy="50" r="47" fill="url(#${fo})" style="mix-blend-mode:overlay"/><g filter="url(#${sg})">${sparkles}</g>`,
    emblem: emblem(rb, p.ink),
    shine: `<style>.${cls}{animation:cosmetic-holo-chip-sweep 3.6s ease-in-out infinite}@keyframes cosmetic-holo-chip-sweep{0%{transform:translateX(-50px)}55%,100%{transform:translateX(120px)}}` +
      `@media (prefers-reduced-motion:reduce){.${cls}{animation:none;transform:translateX(30px)}}</style>` +
      `<g class="${cls}"><rect x="-20" y="-30" width="24" height="160" fill="url(#${sw})" transform="rotate(20 50 50)" style="mix-blend-mode:screen"/></g>`,
  }));
}

// A holographic profile outline: a ring of iridescent foil, the set's own
// ornaments in foil, sparkles, and the same sweeping band of light as the
// other holographic items, masked to the foil itself so it never crosses the
// photo or the empty space around the ring. Each set has its own foil
// colors (the same as its holographic chip) and ornaments, so the sets don't
// look alike.
function holoOutline(name: string, foilColors: string[], seed: number, ornaments: (rb: string) => string, ringW = 4.2) {
  const rb = nextId('rb'), rb2 = nextId('rb'), fo = nextId('fo'), sw = nextId('sw'), sg = nextId('sg'), mk = nextId('mk'), cls = nextId('hs'), r = rnd(seed);
  const orn = ornaments(rb);
  const cyc = [...foilColors, foilColors[0]];
  const stops = cyc.map((c, i) => `<stop offset="${f(i / (cyc.length - 1))}" stop-color="${c}"/>`).join('');
  let sparkles = '';
  for (let i = 0; i < 8; i++) {
    const [x, y] = pol(60, 60, 50 + r() * 8, r() * 360);
    sparkles += spark(f(x), f(y), f(1 + r() * 1.4));
  }
  const ring = (stroke: string, extra = '') => `<circle cx="60" cy="60" r="45" fill="none" stroke="${stroke}" stroke-width="${ringW}" ${extra}/>`;
  return outline({ label: `${name} holographic profile outline`,
    defs: `<linearGradient id="${rb}" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient>` +
      `<linearGradient id="${rb2}" x1="0" y1="0" x2=".3" y2=".22" spreadMethod="reflect">${stops}</linearGradient>` +
      `<pattern id="${fo}" width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="1" height="2.4" fill="#fff" opacity=".25"/></pattern>` +
      `<linearGradient id="${sw}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      glow(sg, 1) + `<mask id="${mk}" maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120">${ring('#fff')}${orn}</mask>`,
    over: `${ring(`url(#${rb})`)}${ring(`url(#${rb2})`, 'opacity=".45" style="mix-blend-mode:screen"')}${ring(`url(#${fo})`, 'style="mix-blend-mode:overlay"')}` +
      `<circle cx="60" cy="60" r="${f(44.5 - ringW / 2)}" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width=".5"/>` +
      `<circle cx="60" cy="60" r="${f(45.5 + ringW / 2)}" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width=".5"/>` +
      `${orn}<g filter="url(#${sg})">${sparkles}</g>` +
      `<g mask="url(#${mk})"><style>.${cls}{animation:cosmetic-holo-outline-sweep 3.6s ease-in-out infinite}@keyframes cosmetic-holo-outline-sweep{0%{transform:translateX(-70px)}55%,100%{transform:translateX(150px)}}` +
      `@media (prefers-reduced-motion:reduce){.${cls}{animation:none;transform:translateX(40px)}}</style>` +
      `<g class="${cls}"><rect x="-20" y="-40" width="26" height="200" fill="url(#${sw})" transform="rotate(20 60 60)" style="mix-blend-mode:screen"/></g></g>` });
}

// ---------- every cosmetic, by art key ----------
const ART: Record<string, () => string> = {
  // Classic (the defaults, SRS-119.4)
  'classic-navy': () => {
    const ov = nextId('ov'), sp = nextId('spd'), oc = nextId('oc'), hz = nextId('hz'), mk = nextId('mk');
    const spade = 'M50 56C50 56 40.5 63.8 40.5 69.2C40.5 73.4 44.3 75.6 48.2 73.2L46.8 79.5H53.2L51.8 73.2C55.7 75.6 59.5 73.4 59.5 69.2C59.5 63.8 50 56 50 56Z';
    let scallops = '';
    for (let x = 16; x <= 84; x += 4) scallops += `M${x - 2} 14A2 2 0 0 0 ${x + 2} 14M${x - 2} 126A2 2 0 0 1 ${x + 2} 126`;
    for (let y = 18; y <= 122; y += 4) scallops += `M14 ${y - 2}A2 2 0 0 1 14 ${y + 2}M86 ${y - 2}A2 2 0 0 0 86 ${y + 2}`;
    return card({ label: 'Classic Navy card back', bg: ['#1e40af', '#172554'], edge: '#e2e8f0', frame: '#e2e8f0',
      defs: rad(ov, [[0, '#2b4bb0'], [1, '#0f1d4a']], 0.45, 0.35, 0.75) + lin(sp, ['#ffffff', '#b6c2d6']) + `<clipPath id="${oc}"><ellipse cx="50" cy="70" rx="16" ry="22"/></clipPath>` +
        hatchPattern(hz, 45, 1.1, '#0b1640', 0.35) + shadeMask(mk),
      inner: `<path d="${latticeD(8)}" transform="translate(.5 .7)" stroke="#000" stroke-opacity=".3" stroke-width=".7" fill="none"/><path d="${latticeD(8)}" stroke="#e2e8f0" stroke-opacity=".2" stroke-width=".7" fill="none"/>` +
        `<path d="${latticeD(8)}" transform="translate(4 0)" stroke="#e2e8f0" stroke-opacity=".08" stroke-width=".3" fill="none"/>` +
        `<path d="${scallops}" stroke="#e2e8f0" stroke-opacity=".45" stroke-width=".45" fill="none"/>` +
        `<g opacity=".6">${guilloche(50, 70, 22.5, 29.5, 1.5, 22, 5, '#e2e8f0', 0.28)}</g>`,
      corner: (x, y) => `<g opacity=".7">${guilloche(x, y, 4.2, 4.2, 0.8, 8, 4, '#e2e8f0', 0.25)}</g><path transform="translate(${x} ${y})" d="M0 -1.6L1.2 0L0 1.6L-1.2 0Z" fill="#e2e8f0"/>`,
      over: `<ellipse cx="50" cy="70" rx="16" ry="22" fill="url(#${ov})" stroke="#e2e8f0" stroke-width="1.2"/>${engrave(oc, 34, 48, 32, 44, hz, mk, 0.8)}` +
        `<ellipse cx="50" cy="70" rx="13.5" ry="19.5" fill="none" stroke="#e2e8f0" stroke-opacity=".5" stroke-width=".5"/><ellipse cx="50" cy="70" rx="12.4" ry="18.4" fill="none" stroke="#e2e8f0" stroke-opacity=".25" stroke-width=".3" stroke-dasharray=".5 .9"/>` +
        `<ellipse cx="44.5" cy="56.5" rx="5" ry="2.4" fill="#fff" opacity=".16" transform="rotate(-35 44.5 56.5)"/>` +
        `<path d="${spade}" fill="url(#${sp})"/><path d="${spade}" fill="none" stroke="#0b1640" stroke-opacity=".45" stroke-width=".4" transform="translate(50 68) scale(.78) translate(-50 -68)"/>` });
  },
  'classic-red': () => {
    // Roulette's colors for each value: red, blue, green, orange, black.
    // big: the value skins' spade, larger so it carries the design above the value.
    const pal = (hi: string, lo: string, big = true) => ({ hi, lo, big, num: lo, numStroke: '#f8fafc' });
    const spade = 'M0 -11.75C0 -11.75 -9.5 -3.95 -9.5 1.45C-9.5 5.65 -5.7 7.85 -1.8 5.45L-3.2 11.75H3.2L1.8 5.45C5.7 7.85 9.5 5.65 9.5 1.45C9.5 -3.95 0 -11.75 0 -11.75Z';
    return chipSet('Classic Red', pal('#ef4444', '#b91c1c', false),
      { 5: pal('#ef4444', '#b91c1c'), 10: pal('#3b82f6', '#1e3a8a'), 25: pal('#10b981', '#065f46'), 50: pal('#fb923c', '#c2410c'), 100: pal('#525252', '#171717') },
      (p) => ({ main: [p.hi, p.lo], spot: '#f8fafc', ring: '#f8fafc', inlay: '#f8fafc', inlayStroke: p.lo,
        emblem: p.big
          ? `<path transform="translate(50 50) scale(1.3)" d="${spade}" fill="${p.lo}"/><path transform="translate(50 50) scale(1)" d="${spade}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width=".5"/>`
          : `<text x="50" y="60" text-anchor="middle" font-size="28" fill="${p.lo}" font-family="Georgia, 'Times New Roman', serif">♠</text>` }));
  },
  'classic-ring': () => outline({ label: 'Classic Ring profile outline', over: `<circle cx="60" cy="60" r="44" fill="none" stroke="#64748b" stroke-width="3"/><circle cx="60" cy="60" r="47.5" fill="none" stroke="#475569" stroke-width=".8"/>` }),

  // Neon
  'neon-horizon': () => {
    const gl = nextId('gl'), sun = nextId('sun'), shn = nextId('shn'), mt = nextId('mt'), fog = nextId('fog'), bl = nextId('bl'), r = rnd(3);
    let grid = '', fine = '';
    [82, 86, 91, 98, 107, 119, 134].forEach((y) => (grid += `M0 ${y}H100`));
    [80, 83.8, 88.4, 94.4, 102.4, 112.8, 126].forEach((y) => (fine += `M0 ${y}H100`));
    for (let k = -6; k <= 6; k++) grid += `M${50 + k * 5} 78L${50 + k * 26} 140`;
    for (let k = -6; k < 6; k++) fine += `M${50 + k * 5 + 2.5} 78L${50 + k * 26 + 13} 140`;
    let stripes = '';
    [58.5, 62, 65.5, 68.8, 71.8, 74.6, 77].forEach((y, i) => (stripes += `<rect x="20" y="${y}" width="60" height="${f(0.6 + i * 0.35)}" fill="#14072f"/>`));
    let stars = '';
    for (let i = 0; i < 24; i++) stars += `<circle cx="${f(r() * 100)}" cy="${f(8 + r() * 30)}" r="${f(0.3 + r() * 0.6)}" fill="#fff" opacity="${f(0.4 + r() * 0.6)}"/>`;
    const mesh = 'M7 70L13 78M7 70L4 78M13 73L18 78M22 62L17 78M22 62L27 78M22 62L13 73M77 65L72 78M77 65L84 71M77 65L80 78M84 71L88 78M92 63L84 71M92 63L95 78M92 63L100 69';
    const mtn = `<path d="M0 78L7 70L13 73L22 62L31 78Z M69 78L77 65L84 71L92 63L100 69V78Z" fill="url(#${mt})"/><path d="${mesh}" stroke="#c4b5fd" stroke-opacity=".45" stroke-width=".35" fill="none"/>` +
      tube('M0 78L7 70L13 73L22 62L31 78M69 78L77 65L84 71L92 63L100 69', '#8b5cf6', 0.6, bl);
    return card({ label: 'Neon Horizon card back', bg: ['#1a0b3d', '#0a0420'], edge: '#ff3fd2', frame: 'none', hair: '#2ef2ff', emboss: false,
      defs: glow(gl, 1.2) + lin(sun, ['#ffe066', '#ff3fd2', '#8b5cf6']) + rad(shn, [[0, '#fff', 0.55], [1, '#fff', 0]]) + lin(mt, ['#4c1d95', '#14072f']) + blur(bl, 1.6) +
        `<linearGradient id="${fog}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff3fd2" stop-opacity=".35"/><stop offset=".3" stop-color="#0a0420" stop-opacity=".6"/><stop offset="1" stop-color="#0a0420" stop-opacity="0"/></linearGradient>`,
      inner: `${stars}${spikes(14, 18, 3)}${spikes(84, 28, 2.2)}${spikes(66, 12, 1.6)}<circle cx="50" cy="56" r="27" fill="#ff3fd2" opacity=".25" filter="url(#${bl})"/><circle cx="50" cy="56" r="22" fill="url(#${sun})"/>` +
        `<circle cx="43" cy="47" r="10" fill="url(#${shn})"/>${stripes}<circle cx="50" cy="56" r="22" fill="none" stroke="#ffe066" stroke-opacity=".6" stroke-width=".4"/>${mtn}<rect x="0" y="78" width="100" height="62" fill="#0a0420"/>` +
        `<path d="${fine}" stroke="#2ef2ff" stroke-width=".3" stroke-opacity=".45" fill="none"/>${tube(grid, '#2ef2ff', 0.55, bl)}<rect x="0" y="78" width="100" height="38" fill="url(#${fog})"/>` +
        `<ellipse cx="50" cy="78" rx="46" ry="3.5" fill="#ff3fd2" opacity=".55" filter="url(#${bl})"/>${tube('M0 78H100', '#ff3fd2', 1, bl)}`,
      corner: (x, y, rot) => `<g transform="translate(${x - 3} ${y - 3}) rotate(${rot} 3 3)">${tube('M0 7V0H7', '#2ef2ff', 0.9, bl)}</g>`,
      over: tube('M12 7H88Q93 7 93 12V128Q93 133 88 133H12Q7 133 7 128V12Q7 7 12 7Z', '#ff3fd2', 1.1, bl) });
  },
  'neon-volt': () => {
    const gl = nextId('gl');
    const pal = (a: string, b: string, hi: string, lo: string) => ({ a, b, hi, lo, num: a, numStroke: '#0a0420' });
    return chipSet('Neon Volt', pal('#ff3fd2', '#2ef2ff', '#2a1059', '#0f0628'),
      { 5: pal('#ff3f6e', '#ffb3c7', '#4a0d1f', '#1d040c'), 10: pal('#2ef2ff', '#3f8cff', '#0b2f4a', '#04121d'), 25: pal('#a3ff3f', '#3fffb0', '#1f3d0c', '#081505'),
        50: pal('#b18cff', '#ff3fd2', '#2a1059', '#0f0628'), 100: pal('#ffd84d', '#fff4c2', '#4a3b0a', '#1a1403') },
      (p) => ({ main: [p.hi, p.lo], spot: [p.a, p.b], ring: p.b, ringDash: 'none', ringW: 1.2, inlay: '#0a0420', inlayStroke: p.a,
        defs: glow(gl, 1.4), tick: 'none', band: '#0a0420', text: '#f5f3ff', numberFilter: gl,
        emblem: `<path d="M54 29L39 53H48.5L44.5 71L61 45.5H51.5Z" fill="${p.a}" filter="url(#${gl})"/>` }));
  },
  'neon-halo': () => {
    const gl = nextId('gl');
    let dia = '', ticks = '';
    [0, 90, 180, 270].forEach((a) => {
      const [x, y] = pol(60, 60, 50, a);
      dia += `<path d="M${f(x)} ${f(y - 3.6)}L${f(x + 3.6)} ${f(y)}L${f(x)} ${f(y + 3.6)}L${f(x - 3.6)} ${f(y)}Z" fill="#2ef2ff"/>`;
    });
    for (let i = 0; i < 36; i++) {
      if (i % 9 === 0) continue;
      const [x0, y0] = pol(60, 60, 46.2, i * 10);
      const [x1, y1] = pol(60, 60, 48, i * 10);
      ticks += `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`;
    }
    return outline({ label: 'Neon Halo profile outline', defs: glow(gl, 1.6),
      over: `<g filter="url(#${gl})"><circle cx="60" cy="60" r="44" fill="none" stroke="#2ef2ff" stroke-width="2.5"/><circle cx="60" cy="60" r="50" fill="none" stroke="#ff3fd2" stroke-width="2"/>${dia}</g><path d="${ticks}" stroke="#ff3fd2" stroke-opacity=".8" stroke-width=".8"/>` });
  },
  'neon-arcade': () => {
    const gl = nextId('gl'), eq = nextId('eq'), halo = nextId('ha'), spf = nextId('spf'), bl = nextId('bl'), r = rnd(31);
    let bars = '', leds = '';
    for (let i = 0; i < 13; i++) {
      const x = 11 + i * 6.25, h = 8 + r() * 30;
      bars += `<rect x="${f(x)}" y="${f(126 - h)}" width="4.2" height="${f(h)}" fill="url(#${eq})" filter="url(#${gl})"/>` +
        `<rect x="${f(x + 3.1)}" y="${f(126 - h)}" width="1.1" height="${f(h)}" fill="#000" opacity=".25"/><rect x="${f(x)}" y="${f(122.5 - h)}" width="4.2" height="1.4" fill="#fff"/>` +
        `<rect x="${f(x + 0.5)}" y="${f(126 - h)}" width=".6" height="${f(h)}" fill="#fff" opacity=".35"/>` +
        `<rect x="${f(x)}" y="126.8" width="4.2" height="${f(h * 0.35)}" fill="url(#${eq})" opacity=".16"/>`;
      for (let y = 124.6; y > 126 - h; y -= 2.2) leds += `M${f(x)} ${f(y)}h4.2`;
    }
    let scan = '';
    for (let y = 2; y < 140; y += 2.6) scan += `M0 ${f(y)}H100`;
    let traces = '';
    const tq = rnd(77);
    for (let i = 0; i < 14; i++) {
      const x = f(12 + tq() * 76), y = f(12 + tq() * 70), dx = f((tq() - 0.5) * 18), dy = f(4 + tq() * 8);
      traces += `<path d="M${x} ${y}h${dx}v${dy}" stroke="#2ef2ff" stroke-opacity=".22" stroke-width=".4" fill="none"/><circle cx="${f(x + dx)}" cy="${f(y + dy)}" r=".7" fill="none" stroke="#ff3fd2" stroke-opacity=".4" stroke-width=".35"/>`;
    }
    const spade = 'M50 28C50 28 29 45 29 56C29 64 37 69 45.5 63.5L43.5 73H56.5L54.5 63.5C63 69 71 64 71 56C71 45 50 28 50 28Z';
    return card({ label: 'Neon Arcade card back', bg: ['#1b0536', '#0d0221'], edge: '#2ef2ff', frame: 'none', hair: '#ff3fd2', emboss: false,
      defs: glow(gl, 1.3) + lin(eq, ['#ff3fd2', '#8b5cf6', '#2ef2ff']) + rad(halo, [[0, '#ff3fd2', 0.4], [1, '#ff3fd2', 0]]) + lin(spf, ['#2f0d5c', '#0d0221']) + blur(bl, 1.5),
      inner: `${traces}${bars}<path d="${leds}" stroke="#0d0221" stroke-opacity=".7" stroke-width=".45"/><path d="M8 126.4H92" stroke="#2ef2ff" stroke-opacity=".55" stroke-width=".5"/><path d="${scan}" stroke="#000" stroke-opacity=".28" stroke-width=".8"/>`,
      corner: (x, y) => `<g transform="translate(${x} ${y})" fill="#ff3fd2"><rect x="-2.6" y="-2.6" width="2.2" height="2.2"/><rect x=".4" y="-2.6" width="2.2" height="2.2" opacity=".5"/><rect x="-2.6" y=".4" width="2.2" height="2.2" opacity=".5"/></g>`,
      over: `<circle cx="50" cy="52" r="30" fill="url(#${halo})"/><path d="${spade}" fill="url(#${spf})"/>${tube(spade, '#2ef2ff', 1.5, bl)}` +
        `<g transform="translate(50 52) scale(.68) translate(-50 -52)">${tube(spade, '#ff3fd2', 1.4, bl)}</g>` +
        `<path d="M40 45Q45 37 49.5 33" stroke="#fff" stroke-opacity=".5" stroke-width="1" fill="none" stroke-linecap="round"/>` +
        tube('M12 7H88Q93 7 93 12V128Q93 133 88 133H12Q7 133 7 128V12Q7 7 12 7Z', '#2ef2ff', 1.1, bl) });
  },
  'neon-pulse': () => {
    const gl = nextId('gl'), cl = nextId('cl');
    // c: the main neon color, d: the ring and pulse line, e: the second color
    // the edge squares alternate with (like Neon Volt's).
    const pal = (c: string, d: string, e: string, hi: string, lo: string) => ({ c, d, e, hi, lo, num: c, numStroke: '#020617' });
    return chipSet('Neon Pulse', pal('#2ef2ff', '#ff3fd2', '#ff3fd2', '#0e3b4a', '#04161d'),
      { 5: pal('#ff3f6e', '#ff3f6e', '#ffc2d1', '#4a0d1f', '#1d040c'), 10: pal('#2ef2ff', '#2ef2ff', '#c2fbff', '#0e3b4a', '#04161d'), 25: pal('#a3ff3f', '#a3ff3f', '#e1ffc2', '#1f3d0c', '#081505'),
        50: pal('#b18cff', '#b18cff', '#e4d6ff', '#2b1659', '#0e0624'), 100: pal('#ffd84d', '#ffd84d', '#fff4c2', '#4a3b0a', '#1a1403') },
      (p) => ({ main: [p.hi, p.lo], spot: [p.c, p.e], ring: p.d, ringDash: 'none', ringW: 1.2, inlay: '#020617', inlayStroke: p.c,
        tick: 'none', band: '#020617', text: '#e0faff', numberFilter: gl,
        defs: glow(gl, 1.3) + `<clipPath id="${cl}"><circle cx="50" cy="50" r="27"/></clipPath>`,
        emblem: `<g clip-path="url(#${cl})"><path d="M21 52H35L39 44L43.5 60L48 34L53 67L57 50L61 52H79" stroke="${p.d}" stroke-width="2.2" fill="none" stroke-linejoin="round" filter="url(#${gl})"/></g><circle cx="48" cy="34" r="1.6" fill="#fff"/>` }));
  },
  'neon-circuit': () => {
    const gl = nextId('gl');
    let traces = '', nodes = '';
    for (let i = 0; i < 12; i++) {
      const a = i * 30 + 10, side = i % 2 ? 1 : -1;
      const [x0, y0] = pol(60, 60, 49, a);
      const [x1, y1] = pol(60, 60, 53.5, a);
      const [x2, y2] = pol(60, 60, 53.5, a + side * 7);
      traces += `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`;
      nodes += `<circle cx="${f(x2)}" cy="${f(y2)}" r="1.5" fill="${i % 3 ? '#2ef2ff' : '#ff3fd2'}"/>`;
    }
    let pads = '';
    [45, 135, 225, 315].forEach((a) => {
      const [x, y] = pol(60, 60, 46, a);
      pads += `<rect x="${f(x - 2.4)}" y="${f(y - 2.4)}" width="4.8" height="4.8" fill="#0a0420" stroke="#ff3fd2" stroke-width=".8" transform="rotate(${a} ${f(x)} ${f(y)})"/>`;
    });
    return outline({ label: 'Neon Circuit profile outline', defs: glow(gl, 1.2),
      over: `<circle cx="60" cy="60" r="46" fill="none" stroke="#0a0420" stroke-width="6"/><g filter="url(#${gl})"><circle cx="60" cy="60" r="43" fill="none" stroke="#2ef2ff" stroke-width="1"/><circle cx="60" cy="60" r="49" fill="none" stroke="#2ef2ff" stroke-width="1"/>` +
        `<path d="${traces}" stroke="#2ef2ff" stroke-width="1" fill="none"/>${nodes}</g>${pads}` });
  },

  // Royal Gold
  'royal-crest': () => {
    const gold = nextId('gd'), vel = nextId('vl'), bead = nextId('bd'), vc = nextId('vc'), vt = nextId('vt'), hz = nextId('hz'), mk = nextId('mk');
    let beads = '';
    for (let i = 0; i < 32; i++) {
      const t = (i / 32) * Math.PI * 2;
      beads += `<circle cx="${f(50 + 26.2 * Math.cos(t))}" cy="${f(70 + 34.2 * Math.sin(t))}" r="1.1" fill="url(#${bead})"/>`;
    }
    const scroll = (sx: number) => `<path d="M50 ${36 + 0} C${50 + sx * 6} 30 ${50 + sx * 14} 32 ${50 + sx * 13} 38 C${50 + sx * 12} 42 ${50 + sx * 7} 41 ${50 + sx * 8} 37.5" stroke="#f8e08e" stroke-width=".6" fill="none"/>` +
      `<path d="M50 104C${50 + sx * 6} 110 ${50 + sx * 14} 108 ${50 + sx * 13} 102C${50 + sx * 12} 98 ${50 + sx * 7} 99 ${50 + sx * 8} 102.5" stroke="#f8e08e" stroke-width=".6" fill="none"/>`;
    return card({ label: 'Royal Crest card back', bg: ['#6b1230', '#2a0716'], edge: '#d4af37', frame: `url(#${gold})`, hair: '#d4af37', frameW: 2,
      defs: lin(gold, ['#fff3c4', '#f8e08e', '#c9971c', '#f1d27a', '#8a6212'], 1, 1) + rad(vel, [[0, '#8f1d44'], [0.65, '#4a0b22'], [1, '#2a0614']], 0.45, 0.32, 0.85) +
        sphere(bead, '#fff7d6', '#f0c75e', '#7a5410') + `<clipPath id="${vc}"><ellipse cx="50" cy="70" rx="23" ry="31"/></clipPath>` + rough(vt, 1.4, 12, 1.2) +
        hatchPattern(hz, -45, 1, '#2a0614', 0.4) + shadeMask(mk),
      inner: `<path d="${latticeD(9)}" transform="translate(.5 .7)" stroke="#000" stroke-opacity=".35" stroke-width=".7" fill="none"/><path d="${latticeD(9)}" stroke="#d4af37" stroke-opacity=".3" stroke-width=".7" fill="none"/>` +
        `<path d="${latticeD(9)}" transform="translate(4.5 0)" stroke="#d4af37" stroke-opacity=".12" stroke-width=".3" fill="none"/>` +
        `<g opacity=".55">${guilloche(50, 70, 27.8, 36, 1.2, 28, 4, '#f8e08e', 0.28)}</g>`,
      corner: (x, y, rot) => fleur(x, y, 0.42, '#d4af37', rot - 45),
      over: `${beads}<ellipse cx="50" cy="70" rx="23" ry="31" fill="url(#${vel})" stroke="url(#${gold})" stroke-width="2"/>` +
        `<g clip-path="url(#${vc})"><rect x="27" y="39" width="46" height="62" filter="url(#${vt})" opacity=".35" style="mix-blend-mode:multiply"/></g>${engrave(vc, 27, 39, 46, 62, hz, mk, 0.5)}` +
        `<ellipse cx="50" cy="70" rx="19.5" ry="27.5" fill="none" stroke="#d4af37" stroke-opacity=".7" stroke-width=".6"/><ellipse cx="50" cy="70" rx="18.3" ry="26.3" fill="none" stroke="#d4af37" stroke-opacity=".35" stroke-width=".3" stroke-dasharray=".6 .9"/>` +
        `<ellipse cx="42" cy="50" rx="7" ry="3.5" fill="#fff" opacity=".1" transform="rotate(-30 42 50)"/>${scroll(-1)}${scroll(1)}` +
        `${crown(50, 66, 1, `url(#${gold})`, '#e11d48')}<path d="M37 72H63M38 69.5H62" stroke="#8a6212" stroke-width=".3" stroke-opacity=".6"/>` +
        `${laurel(50, 70, 16, 215, 300, 4, '#d4af37', 0.55)}${laurel(50, 70, 16, 145, 60, 4, '#d4af37', 0.55)}` +
        `<path d="M50 9.5L52.5 12L50 14.5L47.5 12Z M50 125.5L52.5 128L50 130.5L47.5 128Z" fill="url(#${gold})"/>` });
  },
  'royal-sovereign': () => {
    const gold = nextId('gd');
    // A different jewel set in the gold for each value.
    const pal = (jewel: string, bright: string) => ({ jewel, bright, num: `url(#${gold})`, numStroke: '#1a0410' });
    return chipSet('Royal Sovereign', pal('#5b0f2a', '#e11d48'),
      { 5: pal('#5b0f2a', '#e11d48'), 10: pal('#1e3a8a', '#60a5fa'), 25: pal('#065f46', '#34d399'), 50: pal('#4c1d95', '#c084fc'), 100: pal('#111827', '#e5e7eb') },
      (p) => ({ main: ['#f8e08e', '#c9971c', '#8a6212'], spot: p.jewel, ring: p.jewel, ringDash: 'none', inlay: p.jewel, inlayStroke: '#f8e08e', tick: p.jewel,
        defs: lin(gold, ['#f8e08e', '#c9971c']), emblem: crown(50, 51, 1.05, `url(#${gold})`, p.bright) }));
  },
  'royal-jewels': () => {
    const gold = nextId('gd');
    let rubies = '', beads = '';
    [45, 135, 180, 225, 315].forEach((a) => {
      const [x, y] = pol(60, 60, 46, a);
      rubies += `<circle cx="${f(x)}" cy="${f(y)}" r="2.8" fill="#e11d48" stroke="#f8e08e" stroke-width=".9"/><circle cx="${f(x - 0.8)}" cy="${f(y - 0.8)}" r=".7" fill="#fff" opacity=".7"/>`;
    });
    for (let i = 0; i < 48; i++) {
      const [x, y] = pol(60, 60, 50.6, i * 7.5);
      beads += `<circle cx="${f(x)}" cy="${f(y)}" r=".7" fill="#d4af37"/>`;
    }
    const [lx, ly] = pol(60, 60, 46, 90);
    const [rx, ry] = pol(60, 60, 46, 270);
    return outline({ label: 'Royal Jewels profile outline', defs: lin(gold, ['#f8e08e', '#c9971c', '#8a6212'], 1, 1),
      over: `${beads}<circle cx="60" cy="60" r="46" fill="none" stroke="url(#${gold})" stroke-width="7"/><circle cx="60" cy="60" r="42.2" fill="none" stroke="#5b0f2a" stroke-width="1"/>` +
        `${rubies}${fleur(lx, ly, 0.42, '#5b0f2a', 90)}${fleur(rx, ry, 0.42, '#5b0f2a', -90)}${crown(60, 11, 0.75, `url(#${gold})`, '#e11d48')}` });
  },
  'royal-damask': () => {
    const gold = nextId('gd'), gm = nextId('gm'), loz = nextId('lz'), sk = nextId('sk');
    let damask = '', shadow = '';
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 6; col++) {
        const x = col * 20 + (row % 2 ? 10 : 0), y = row * 19 + 4;
        shadow += fleur(x + 0.6, y + 0.8, 0.55, '#000');
        damask += fleur(x, y, 0.55, '#d4af37') + `<circle cx="${x}" cy="${f(y + 9.5)}" r=".6" fill="#d4af37"/>`;
      }
    }
    let rings = '';
    for (let k = 0; k < 4; k++) {
      const d = 8 + k * 2.6;
      rings += `<path d="M50 ${34 + d}L${76 - d * 0.72} 70L50 ${106 - d}L${24 + d * 0.72} 70Z" fill="none" stroke="#d4af37" stroke-opacity="${f(0.45 - k * 0.08)}" stroke-width=".35"/>`;
    }
    return card({ label: 'Royal Damask card back', bg: ['#1c2c6b', '#0a1230'], edge: '#d4af37', frame: `url(#${gold})`, hair: '#d4af37', frameW: 2,
      defs: lin(gold, ['#fff3c4', '#f8e08e', '#c9971c', '#f1d27a', '#8a6212'], 1, 1) + lin(gm, ['#f0f9ff', '#7dd3fc', '#0369a1'], 0.6, 1) + rad(loz, [[0, '#2a3f94'], [1, '#0a1230']], 0.5, 0.4, 0.75) +
        clouds(sk, '#c7d2fe', '.012 .5', 21, 2.4, 1.2),
      inner: `<rect x="0" y="0" width="100" height="140" filter="url(#${sk})" opacity=".18" style="mix-blend-mode:screen"/><g opacity=".3">${shadow}</g><g opacity=".24">${damask}</g>`,
      corner: (x, y, rot) => `<path transform="translate(${x} ${y}) rotate(${rot})" d="M-2 6Q-2 -2 6 -2M1 6Q1 1 6 1M-2 6C-4 3 -1 -1 1 1" stroke="#d4af37" stroke-width=".7" fill="none"/>`,
      over: `<path d="M50 34L76 70L50 106L24 70Z" fill="url(#${loz})" stroke="url(#${gold})" stroke-width="2"/>${rings}` +
        `<path d="M50.5 36.5L62 52" stroke="#fff" stroke-opacity=".25" stroke-width="1" stroke-linecap="round"/>` +
        `${gem(50, 69, 1.25, gm)}<path d="M38 65L43.5 69M62 65L56.5 69M50 54V58" stroke="#e0f2fe" stroke-opacity=".4" stroke-width=".3"/>` +
        `${spark(45.5, 61, 2.4)}${spark(50, 47, 2.6, '#f8e08e')}${spark(50, 93, 2.6, '#f8e08e')}${spark(35, 70, 2, '#f8e08e')}${spark(65, 70, 2, '#f8e08e')}` });
  },
  'royal-signet': () => {
    const gold = nextId('gd'), gm = nextId('gm');
    const pal = (hi: string, lo: string, gem3: string[]) => ({ hi, lo, gem3, num: `url(#${gold})`, numStroke: '#0b0b0b' });
    return chipSet('Royal Signet', pal('#1f2937', '#030712', ['#f0f9ff', '#7dd3fc', '#0369a1']),
      { 5: pal('#7f1d1d', '#2a0606', ['#ffe4e6', '#fb7185', '#9f1239']), 10: pal('#1e3a8a', '#0b1430', ['#f0f9ff', '#7dd3fc', '#0369a1']),
        25: pal('#065f46', '#022c22', ['#ecfdf5', '#34d399', '#065f46']), 50: pal('#5b21b6', '#1e0b47', ['#faf5ff', '#c084fc', '#6b21a8']),
        100: pal('#1f2937', '#030712', ['#ffffff', '#e2e8f0', '#94a3b8']) },
      (p) => ({ main: [p.hi, p.lo], spot: `url(#${gold})`, ring: '#d4af37', ringDash: 'none', inlay: '#0b0b0b', inlayStroke: '#d4af37', tick: '#d4af37', text: '#d4af37',
        defs: lin(gold, ['#f8e08e', '#c9971c', '#8a6212'], 1, 1) + lin(gm, p.gem3, 0.6, 1),
        emblem: `${laurel(50, 50, 19, 200, 335, 6, '#d4af37', 0.75)}${laurel(50, 50, 19, 160, 25, 6, '#d4af37', 0.75)}${gem(50, 50, 0.85, gm)}` }));
  },
  'golden-laurel': () => {
    const gold = nextId('gd'), gm = nextId('gm');
    return outline({ label: 'Golden Laurel profile outline', defs: lin(gold, ['#f8e08e', '#c9971c', '#8a6212'], 1, 1) + lin(gm, ['#f0f9ff', '#7dd3fc', '#0369a1'], 0.6, 1),
      over: `<circle cx="60" cy="60" r="44.5" fill="none" stroke="url(#${gold})" stroke-width="2"/>${laurel(60, 60, 49, 195, 345, 9, '#d4af37', 1.05, '#8a6212')}${laurel(60, 60, 49, 165, 15, 9, '#d4af37', 1.05, '#8a6212')}` +
        `${bow(60, 108, '#9f1239', '#5b0f2a')}${gem(60, 10, 0.55, gm)}` });
  },

  // Ocean
  'deep-anchor': () => {
    const r = rnd(7), am = nextId('am'), cs = nextId('cs'), hz = nextId('hz'), mk = nextId('mk');
    const waves: [number, number, number, number, string, string][] = [
      [88, 3, 34, 0, '#155e75', '#0c4a6e'],
      [100, 3.5, 40, 1.4, '#0e7490', '#075985'],
      [113, 3, 30, 2.6, '#0284c7', '#0369a1'],
      [126, 2.5, 36, 0.8, '#38bdf8', '#0284c7'],
    ];
    const ids = waves.map(() => nextId('wv'));
    let bubbles = '';
    for (let i = 0; i < 12; i++) {
      const x = f(12 + r() * 76), y = f(16 + r() * 56), rr = f(0.8 + r() * 1.8);
      bubbles += `<circle cx="${x}" cy="${y}" r="${rr}" fill="none" stroke="#bae6fd" stroke-opacity=".55" stroke-width=".6"/><circle cx="${f(x - rr * 0.35)}" cy="${f(y - rr * 0.35)}" r="${f(rr * 0.25)}" fill="#fff" opacity=".6"/>` +
        `<path d="${arcD(x, y, rr * 0.7, 110, 200)}" stroke="#fff" stroke-opacity=".35" stroke-width=".25" fill="none"/>`;
    }
    const rays = `<path d="M18 0H28L52 92H34Z M44 0H52L70 92H58Z M70 0H76L88 92H80Z" fill="#e0f2fe" opacity=".07"/><path d="M18 0L34 92M28 0L52 92M44 0L58 92M52 0L70 92" stroke="#e0f2fe" stroke-opacity=".12" stroke-width=".3"/>`;
    let rope = '';
    for (let y = 40; y <= 66; y += 3.2) rope += `M47.4 ${f(y)}L52.6 ${f(y + 1.6)}`;
    const wave = (i: number) => {
      const [y, amp, period, phase] = waves[i];
      return `${waveFill(y, amp, period, phase, `url(#${ids[i]})`)}<path d="${waveD(0, 100, y, amp, period, phase)}" stroke="#e0f2fe" stroke-opacity="${i === 0 ? 0.55 : 0.3}" stroke-width=".8" fill="none"/>` +
        ripples(y + 2.4, amp * 0.8, period, phase + 0.4, 3, 2, '#e0f2fe', 0.28);
    };
    return card({ label: 'Deep Anchor card back', bg: ['#0e7490', '#082f49'], edge: '#22d3ee', frame: '#7dd3fc',
      defs: lin(am, ['#ffffff', '#94a3b8', '#e0f2fe', '#64748b', '#cbd5e1'], 1, 1) + waves.map((w, i) => lin(ids[i], [w[4], w[5]])).join('') + caustics(cs, 9) +
        hatchPattern(hz, 35, 0.9, '#0b2a3a', 0.35) + shadeMask(mk),
      inner: `${rays}<rect x="0" y="0" width="100" height="90" filter="url(#${cs})" opacity=".28" style="mix-blend-mode:screen"/>${bubbles}${fish(22, 36, 0.8, '#0c4a6e')}${fish(78, 28, 0.6, '#0c4a6e', -1)}` +
        `${wave(0)}${wave(1)}${seaweed(14, 120, 26, '#0d9488')}${seaweed(86, 122, 30, '#0f766e')}<path d="M14 120Q11 113.5 14 107T14 94M86 122Q83 114.5 86 107T86 92" stroke="#5eead4" stroke-opacity=".5" stroke-width=".35" fill="none"/>${wave(2)}${wave(3)}`,
      corner: (x, y, rot) => `<g transform="rotate(${rot - 45} ${x} ${y})">${shell(x, y, 0.3, '#e0f2fe', '#7dd3fc')}</g>`,
      over: `<g opacity=".45">${anchor(51, 53.6, 1.25, '#021827')}</g>${anchor(50, 52, 1.25, '#062433', 3.4)}${anchor(50, 52, 1.25, `url(#${am})`)}` +
        `<g mask="url(#${mk})">${anchor(50, 52, 1.25, `url(#${hz})`)}</g>` +
        `<path d="${rope}" stroke="#5c4320" stroke-width="1.7" stroke-linecap="round"/><path d="${rope}" stroke="#a88552" stroke-width="1.1" stroke-linecap="round"/><path d="${rope}" transform="translate(-.25 -.3)" stroke="#f0dcb0" stroke-width=".4" stroke-linecap="round"/>` });
  },
  'ocean-tide': () => {
    const pal = (hi: string, lo: string, acc: string, deep: string) => ({ hi, lo, acc, deep, num: '#f0f9ff', numStroke: '#082f49' });
    return chipSet('Ocean Tide', pal('#0891b2', '#155e75', '#22d3ee', '#0e7490'),
      { 5: pal('#f43f5e', '#9f1239', '#fda4af', '#be123c'), 10: pal('#2563eb', '#1e3a8a', '#93c5fd', '#1d4ed8'), 25: pal('#0d9488', '#134e4a', '#5eead4', '#0f766e'),
        50: pal('#7c3aed', '#4c1d95', '#c4b5fd', '#6d28d9'), 100: pal('#334155', '#0f172a', '#cbd5e1', '#475569') },
      (p) => ({ main: [p.hi, p.lo], spot: '#e0f2fe', ring: '#e0f2fe', inlay: '#082f49', inlayStroke: p.acc,
        emblem: `<path d="${waveD(29, 71, 42, 3.2, 14, 0)}" stroke="#e0f2fe" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="${waveD(31, 69, 50.5, 3.2, 14, 0)}" stroke="${p.acc}" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="${waveD(35, 65, 59, 3.2, 14, 0)}" stroke="${p.deep}" stroke-width="2.4" fill="none" stroke-linecap="round"/>` }));
  },
  'sea-foam': () => {
    const g = nextId('og');
    const wav = (amp: number, ph: number) => {
      let d = '';
      for (let a = 0; a <= 360; a += 3) {
        const [x, y] = pol(60, 60, 46 + amp * Math.sin((a * Math.PI * 12) / 180 + ph), a);
        d += `${a ? 'L' : 'M'}${f(x)} ${f(y)}`;
      }
      return `${d}Z`;
    };
    const bubbles = ([[100, 22, 3], [106, 32, 2], [97, 12.5, 1.6], [16, 98, 2.2], [10, 90, 1.4]] as const)
      .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="#bae6fd" stroke-width="1"/>`)
      .join('');
    return outline({ label: 'Sea Foam profile outline', defs: lin(g, ['#22d3ee', '#0e7490', '#0369a1'], 1, 1),
      over: `<circle cx="60" cy="60" r="46" fill="none" stroke="url(#${g})" stroke-width="7"/><path d="${wav(1.8, 0)}" fill="none" stroke="#e0f2fe" stroke-width="1.2" stroke-opacity=".9"/><path d="${wav(1.4, Math.PI)}" fill="none" stroke="#7dd3fc" stroke-width=".6"/>${bubbles}` });
  },
  'coral-reef': () => {
    const r = rnd(41), sd = nextId('sd'), cs = nextId('cs');
    let bubbles = '';
    for (let i = 0; i < 9; i++) {
      const x = f(10 + r() * 80), y = f(14 + r() * 60), rr = f(0.7 + r() * 1.5);
      bubbles += `<circle cx="${x}" cy="${y}" r="${rr}" fill="none" stroke="#bae6fd" stroke-opacity=".6" stroke-width=".6"/><circle cx="${f(x - rr * 0.35)}" cy="${f(y - rr * 0.35)}" r="${f(rr * 0.25)}" fill="#fff" opacity=".6"/>`;
    }
    const corals: [number, number, number, string][] = [[28, 124, 1.15, '#fb7185'], [72, 125, 1.3, '#f97316'], [50, 127, 0.85, '#f472b6']];
    let polyps = '';
    const pq = rnd(43);
    corals.forEach(([x, y, s2]) => {
      for (let i = 0; i < 10; i++) polyps += `<circle cx="${f(x + (pq() - 0.5) * 14 * s2)}" cy="${f(y - pq() * 18 * s2)}" r="${f(0.35 + pq() * 0.35)}" fill="#fff" opacity=".55"/>`;
    });
    let sandLines = '';
    for (let i = 0; i < 6; i++) sandLines += `<path d="${waveD(0, 100, 124 + i * 2.6, 0.8, 9 + i, i)}" stroke="#a37f49" stroke-opacity=".4" stroke-width=".3" fill="none"/>`;
    return card({ label: 'Coral Reef card back', bg: ['#0284c7', '#0c4a6e'], edge: '#fb7185', frame: '#7dd3fc',
      defs: lin(sd, ['#f6e7c1', '#c9a66b']) + caustics(cs, 13),
      inner: `<path d="M16 0H24L44 100H30Z M52 0H58L76 100H66Z" fill="#e0f2fe" opacity=".09"/><path d="M16 0L30 100M24 0L44 100M52 0L66 100M58 0L76 100" stroke="#e0f2fe" stroke-opacity=".14" stroke-width=".3"/>` +
        `<rect x="0" y="0" width="100" height="125" filter="url(#${cs})" opacity=".25" style="mix-blend-mode:screen"/>${bubbles}` +
        `<g opacity=".55">${fish(80, 84, 0.7, '#a78bfa', -1, '#fff', true)}${fish(24, 82, 0.8, '#f97316', -1, '#fff', true)}</g>` +
        `${fish(58, 66, 0.9, '#38bdf8', 1, '#0c4a6e', true)}${fish(68, 36, 1, '#fb7185', -1, '#fff', true)}${fish(30, 46, 1.2, '#fbbf24', 1, '#fff', true)}` +
        `${seaweed(12, 130, 34, '#14b8a6')}${seaweed(18, 130, 24, '#0d9488')}${seaweed(90, 130, 30, '#14b8a6')}` +
        `<path d="M12 130Q9 121.5 12 113T12 96M90 130Q87 122.5 90 115T90 100" stroke="#99f6e4" stroke-opacity=".5" stroke-width=".3" fill="none"/>` +
        `<path d="M0 122Q20 116 40 121T80 119T100 120V140H0Z" fill="url(#${sd})"/>${sandLines}<path d="M8 128h3M30 131h2M62 127h3M84 132h2" stroke="#b08c55" stroke-width=".8"/>` +
        corals.map(([x, y, s2, c]) => `<g opacity=".35">${coral(x + 0.9, y + 0.6, s2, '#3f0a14')}</g>${coral(x, y, s2, c)}`).join('') + polyps +
        `<circle cx="40" cy="123" r="2.4" fill="#fde68a"/><circle cx="39.3" cy="122.3" r=".7" fill="#fff" opacity=".7"/>${shell(62, 128, 0.35, '#fef3c7', '#d6b98c')}`,
      corner: (x, y) => spark(x, y, 2, '#e0f2fe') });
  },
  'pearl-diver': () => {
    const pr = nextId('pr');
    // Pearls come in colors: pink, blue, green, lavender and black.
    const pal = (m: string[], dark: string, inlay: string) => ({ m, dark, inlay, num: '#fef3c7', numStroke: inlay });
    return chipSet('Pearl Diver', pal(['#ecfeff', '#a5f3fc', '#67e8f9'], '#0e7490', '#164e63'),
      { 5: pal(['#fff1f2', '#fda4af', '#fb7185'], '#9f1239', '#4c0519'), 10: pal(['#eff6ff', '#93c5fd', '#60a5fa'], '#1e40af', '#172554'),
        25: pal(['#ecfdf5', '#6ee7b7', '#34d399'], '#047857', '#022c22'), 50: pal(['#faf5ff', '#d8b4fe', '#c084fc'], '#6b21a8', '#3b0764'),
        100: pal(['#f1f5f9', '#94a3b8', '#475569'], '#0f172a', '#0f172a') },
      (p) => ({ main: p.m, spot: p.dark, ring: p.dark, ringDash: '3 2', inlay: p.inlay, inlayStroke: '#ecfeff', tick: p.dark, text: p.dark,
        defs: rad(pr, [[0, '#ffffff'], [0.7, '#f5f3ff'], [1, '#c4b5fd']], 0.35, 0.35, 0.65),
        emblem: `${shell(50, 51, 1.85, '#fef3c7', '#d6b98c')}<circle cx="50" cy="55" r="4.2" fill="url(#${pr})"/>` }));
  },
  riptide: () => {
    const g = nextId('og');
    let curls = '';
    for (let i = 0; i < 12; i++) {
      const a = i * 30;
      const [x, y] = pol(60, 60, 49.5, a);
      curls += `<path transform="translate(${f(x)} ${f(y)}) rotate(${a + 90})" d="M-6 2Q-4 -5 2 -5Q6 -5 6 -1.5Q6 1.5 3 1.5Q1 1.5 1 0" stroke="#e0f2fe" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    }
    return outline({ label: 'Riptide profile outline', defs: lin(g, ['#0369a1', '#0c4a6e', '#082f49'], 1, 1),
      over: `<circle cx="60" cy="60" r="46" fill="none" stroke="url(#${g})" stroke-width="7"/><circle cx="60" cy="60" r="42.6" fill="none" stroke="#22d3ee" stroke-width=".8"/>${curls}` });
  },

  // Inferno
  'inferno-blaze': () => {
    const r = rnd(11), gl = nextId('gl'), heat = nextId('ht'), md = nextId('md'), wp = nextId('wp'), sm = nextId('sm');
    let embers = '', rowDefs = '', streaks = '';
    for (let i = 0; i < 26; i++) embers += `<circle cx="${f(r() * 100)}" cy="${f(10 + r() * 66)}" r="${f(0.4 + r())}" fill="${r() > 0.5 ? '#fbbf24' : '#f97316'}" opacity="${f(0.4 + r() * 0.6)}"/>`;
    for (let i = 0; i < 16; i++) {
      const x = f(r() * 100), y = f(20 + r() * 60);
      streaks += `M${x} ${y}l${f(-0.6 - r())} ${f(-2 - r() * 3)}`;
    }
    const row = (scale: number, top: string, bottom: string, seed: number, inner?: string) => {
      const q = rnd(seed), id = nextId('fr');
      rowDefs += lin(id, [top, bottom]);
      let d = '', lines = '';
      for (let x = -6; x <= 106; x += 12) {
        const fx = x + q() * 4, h = (26 + q() * 22) * scale;
        d += flame(fx, 142, 14 * scale, h);
        if (inner) lines += flame(fx, 142, 8 * scale, h * 0.72) + flame(fx, 142, 4 * scale, h * 0.45);
      }
      return `<path d="${d}" fill="url(#${id})"/>${inner ? `<path d="${lines}" fill="none" stroke="${inner}" stroke-opacity=".55" stroke-width=".35"/>` : ''}`;
    };
    const rows = `${row(2.1, '#b91c1c', '#3f0707', 3)}${row(1.7, '#ef4444', '#991b1b', 5, '#fca5a5')}${row(1.3, '#fb923c', '#c2410c', 9, '#fed7aa')}${row(0.85, '#fef9c3', '#f59e0b', 13, '#ffffff')}`;
    let ring = '', burst = '';
    for (let i = 0; i < 12; i++) ring += `<path transform="rotate(${i * 30} 50 46)" d="${flame(50, 27.5, 4.5, 7)}" fill="${i % 2 ? '#f97316' : '#fbbf24'}"/>`;
    for (let i = 0; i < 48; i++) {
      const [x0, y0] = pol(50, 46, 18, i * 7.5), [x1, y1] = pol(50, 46, i % 2 ? 22 : 25, i * 7.5);
      burst += `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`;
    }
    return card({ label: 'Inferno Blaze card back', bg: ['#2b0a05', '#120302'], edge: '#f97316', frame: '#f97316',
      defs: glow(gl, 1) + rad(heat, [[0, '#f97316', 0.5], [1, '#f97316', 0]]) + rad(md, [[0, '#5a1607'], [1, '#120302']], 0.45, 0.35, 0.8) + warp(wp, 5, 4) + clouds(sm, '#57534e', '.03 .06', 5, 2, 1) + rowDefs,
      inner: `<rect x="0" y="0" width="100" height="70" filter="url(#${sm})" opacity=".35"/><g filter="url(#${gl})">${embers}</g><path d="${streaks}" stroke="#fbbf24" stroke-opacity=".5" stroke-width=".3"/><g filter="url(#${wp})">${rows}</g>`,
      corner: (x, y) => `<path d="${flame(x, y + 3, 4, 7)}" fill="#f97316"/><path d="${flame(x, y + 3, 2, 4)}" fill="#fde047"/>`,
      over: `<circle cx="50" cy="46" r="29" fill="url(#${heat})"/><path d="${burst}" stroke="#fdba74" stroke-opacity=".55" stroke-width=".35"/>${ring}<circle cx="50" cy="46" r="17" fill="url(#${md})" stroke="#f97316" stroke-width="1.5"/>` +
        `<circle cx="50" cy="46" r="14.8" fill="none" stroke="#f97316" stroke-opacity=".5" stroke-width=".5"/><circle cx="50" cy="46" r="13.6" fill="none" stroke="#fdba74" stroke-opacity=".3" stroke-width=".3" stroke-dasharray=".6 .9"/>` +
        `<path d="${arcD(50, 46, 16.2, 290, 350)}" stroke="#fed7aa" stroke-opacity=".6" stroke-width=".8" fill="none" stroke-linecap="round"/>` +
        `<path d="${flame(50, 58, 16, 25)}" fill="#dc2626"/><path d="${flame(50, 58, 12, 20)}" fill="#f97316"/><path d="${flame(50, 58, 7, 13)}" fill="#fde047"/><path d="${flame(49, 58, 3, 7)}" fill="#fff7d6"/>` +
        `<path d="${flame(50, 58, 14, 23)}${flame(50, 58, 9.5, 16.5)}" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width=".3"/>` });
  },
  'inferno-ember': () => {
    const gl = nextId('gl');
    // Fire in each value's color: red, blue, green, orange, and white-hot gold on black.
    const pal = (hi: string, lo: string, f1: string, f2: string, f3: string, t: string) => ({ hi, lo, f1, f2, f3, t, num: f3, numStroke: '#1c0703' });
    return chipSet('Inferno Ember', pal('#991b1b', '#450a0a', '#dc2626', '#f97316', '#fde047', '#fbbf24'),
      { 5: pal('#b91c1c', '#450a0a', '#991b1b', '#ef4444', '#fecaca', '#fca5a5'), 10: pal('#1d4ed8', '#0b1640', '#1e40af', '#3b82f6', '#bfdbfe', '#93c5fd'),
        25: pal('#15803d', '#052e16', '#166534', '#22c55e', '#bbf7d0', '#86efac'), 50: pal('#c2410c', '#431407', '#dc2626', '#f97316', '#fde047', '#fbbf24'),
        100: pal('#292524', '#0c0a09', '#a16207', '#facc15', '#fefce8', '#fde68a') },
      // The edge squares alternate the flame's core and middle colors, like Magma Core's.
      (p) => ({ main: [p.hi, p.lo], spot: [p.f3, p.f2], ring: p.f2, ringDash: '2 3', inlay: '#1c0703', inlayStroke: p.f2, tick: p.t, text: p.t, numberFilter: gl,
        defs: glow(gl, 1.2),
        emblem: `<g filter="url(#${gl})"><path d="${flame(50, 68, 22, 35)}" fill="${p.f1}"/><path d="${flame(50, 68, 15, 26)}" fill="${p.f2}"/><path d="${flame(50, 68, 8, 16)}" fill="${p.f3}"/></g><path d="${flame(42, 68, 6, 12)}" fill="${p.f2}"/><path d="${flame(58, 68, 6, 12)}" fill="${p.f2}"/>` }));
  },
  'inferno-corona': () => {
    const g = nextId('fg'), gl = nextId('gl'), r = rnd(21);
    let licks = '', sparks = '';
    for (let i = 0; i < 16; i++) {
      const a = i * 22.5 + r() * 6, h = 7 + r() * 5;
      const [b1x, b1y] = pol(60, 60, 45, a - 7);
      const [tx, ty] = pol(60, 60, 45 + h, a + 3);
      const [b2x, b2y] = pol(60, 60, 45, a + 7);
      const [c1x, c1y] = pol(60, 60, 45 + h * 0.6, a - 4);
      const [c2x, c2y] = pol(60, 60, 45 + h * 0.4, a + 6);
      licks += `M${f(b1x)} ${f(b1y)}Q${f(c1x)} ${f(c1y)} ${f(tx)} ${f(ty)}Q${f(c2x)} ${f(c2y)} ${f(b2x)} ${f(b2y)}Z`;
    }
    for (let i = 0; i < 9; i++) {
      const [x, y] = pol(60, 60, 55 + r() * 3, r() * 360);
      sparks += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.5 + r() * 0.7)}" fill="#fde047"/>`;
    }
    return outline({ label: 'Inferno Corona profile outline', defs: rad(g, [[0.74, '#fde047'], [0.86, '#f97316'], [1, '#dc2626']]) + glow(gl, 1),
      under: `<path d="${licks}" fill="url(#${g})"/><g filter="url(#${gl})">${sparks}</g>`,
      over: `<circle cx="60" cy="60" r="45" fill="none" stroke="#dc2626" stroke-width="5"/><circle cx="60" cy="60" r="45" fill="none" stroke="#f97316" stroke-width="1.5"/><circle cx="60" cy="60" r="42" fill="none" stroke="#7f1d1d" stroke-width=".8"/>` });
  },
  'dragon-eye': () => {
    const iris = nextId('ir'), gl = nextId('gl'), sc = nextId('sc'), scg = nextId('scg'), lid = nextId('lid'), ec = nextId('ec'), r = rnd(55);
    let fibers = '';
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * 360 + r() * 3, [x0, y0] = pol(50, 70, 3 + r() * 3, a), [x1, y1] = pol(50, 70, 12 + r() * 16, a);
      fibers += `<path d="M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}" stroke="${r() > 0.5 ? '#7f1d1d' : '#fef08a'}" stroke-opacity="${f(0.15 + r() * 0.3)}" stroke-width=".3"/>`;
    }
    let lids = '';
    for (let k = 0; k < 3; k++) lids += `<path d="M${18 - k * 1.5} ${66 - k * 2}Q50 ${30 - k * 3} ${82 + k * 1.5} ${66 - k * 2}" stroke="#ea580c" stroke-opacity="${f(0.45 - k * 0.12)}" stroke-width=".4" fill="none"/>`;
    let ridge = '';
    [[18, 60, 12, 54], [28, 51, 24, 44], [40, 46, 38, 38], [60, 46, 62, 38], [72, 51, 76, 44], [82, 60, 88, 54]].forEach(([x0, y0, x1, y1]) => {
      ridge += `<path d="M${x0} ${y0}L${x1} ${y1}" stroke="#ea580c" stroke-width="1.6" stroke-linecap="round"/><path d="M${x0} ${y0}L${x1} ${y1}" stroke="#fed7aa" stroke-opacity=".6" stroke-width=".4" stroke-linecap="round" transform="translate(-.3 -.2)"/>`;
    });
    return card({ label: 'Dragon Eye card back', bg: ['#4c0f0f', '#120302'], edge: '#f97316', frame: '#ea580c',
      defs: scalePattern(sc, scg, '#1c0703') + rad(scg, [[0, '#c2410c'], [0.55, '#7f1d1d'], [1, '#2a0606']], 0.45, 0.62, 0.62) +
        rad(iris, [[0, '#fef08a'], [0.45, '#f59e0b'], [0.8, '#dc2626'], [1, '#7f1d1d']]) + glow(gl, 1.4) + `<clipPath id="${ec}"><path d="M22 70Q50 44 78 70Q50 96 22 70Z"/></clipPath>` +
        `<linearGradient id="${lid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".7"/><stop offset=".5" stop-color="#000" stop-opacity="0"/></linearGradient>`,
      inner: `<rect x="0" y="0" width="100" height="140" fill="url(#${sc})"/>`,
      corner: (x, y, rot) => `<path transform="translate(${x} ${y}) rotate(${rot - 45})" d="M0 -5Q2 0 0 5Q-1 0 0 -5Z" fill="#f97316"/>`,
      over: `<path d="M16 70Q50 34 84 70Q50 106 16 70Z" fill="#1c0703"/>${lids}<path d="M22 70Q50 44 78 70Q50 96 22 70Z" fill="url(#${iris})" filter="url(#${gl})"/>` +
        `<g clip-path="url(#${ec})">${fibers}<circle cx="50" cy="70" r="22" fill="none" stroke="#450a0a" stroke-opacity=".5" stroke-width="2"/></g>` +
        `<path d="M22 70Q50 44 78 70Q50 96 22 70Z" fill="url(#${lid})"/><path d="M22 70Q50 44 78 70Q50 96 22 70Z" fill="none" stroke="#1c0703" stroke-width="2"/>` +
        `<path d="M50 51Q55.5 70 50 89Q44.5 70 50 51Z" fill="#0a0302"/><path d="M50 51Q55.5 70 50 89Q44.5 70 50 51Z" fill="none" stroke="#f59e0b" stroke-opacity=".45" stroke-width=".4"/>` +
        `<ellipse cx="43.5" cy="61" rx="3.4" ry="1.5" fill="#fff" opacity=".75" transform="rotate(-24 43.5 61)"/><circle cx="55" cy="78" r=".9" fill="#fff" opacity=".45"/>` +
        `<path d="M14 66Q50 26 86 66" stroke="#7f1d1d" stroke-width="2.4" fill="none"/>${ridge}` });
  },
  'magma-core': () => {
    const gl = nextId('gl'), core = nextId('co'), r = rnd(51);
    let cracks = '';
    for (let i = 0; i < 7; i++) {
      let a = i * (360 / 7) + r() * 20, rr = 4;
      let [x, y] = pol(50, 50, rr, a);
      let d = `M${f(x)} ${f(y)}`;
      while (rr < 26) {
        rr += 4 + r() * 4;
        a += (r() - 0.5) * 30;
        [x, y] = pol(50, 50, Math.min(rr, 26), a);
        d += `L${f(x)} ${f(y)}`;
      }
      cracks += d;
    }
    // Lava in each value's color, in stone tinted to match.
    const pal = (hi: string, lo: string, a: string, b: string, s: string, c0: string, l2: string) => ({ hi, lo, a, b, s, c0, l2, num: l2, numStroke: '#1c0703' });
    return chipSet('Magma Core', pal('#292524', '#0c0a09', '#f97316', '#dc2626', '#ea580c', '#fef08a', '#fde047'),
      { 5: pal('#3b1212', '#120404', '#ef4444', '#991b1b', '#dc2626', '#fecaca', '#fca5a5'), 10: pal('#122a3b', '#04101a', '#38bdf8', '#1d4ed8', '#0ea5e9', '#e0f2fe', '#bae6fd'),
        25: pal('#14301c', '#04120a', '#4ade80', '#15803d', '#22c55e', '#dcfce7', '#bbf7d0'), 50: pal('#292524', '#0c0a09', '#f97316', '#dc2626', '#ea580c', '#fef08a', '#fde047'),
        100: pal('#3a300a', '#120e03', '#facc15', '#ca8a04', '#eab308', '#fefce8', '#fef9c3') },
      (p) => ({ main: [p.hi, p.lo], spot: [p.a, p.b], ring: p.a, ringDash: '1 3', inlay: '#1c0703', inlayStroke: p.s, tick: p.a, text: p.a, numberFilter: gl,
        defs: glow(gl, 1.2) + rad(core, [[0, p.c0, 1], [0.5, p.a, 0.8], [1, p.a, 0]]),
        emblem: `<circle cx="50" cy="50" r="12" fill="url(#${core})"/><path d="${cracks}" stroke="${p.a}" stroke-width="1.3" fill="none" stroke-linejoin="round" filter="url(#${gl})"/><path d="${cracks}" stroke="${p.l2}" stroke-width=".5" fill="none"/>` }));
  },
  phoenix: () => {
    const g = nextId('fg');
    let wings = '';
    for (const side of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const a = side < 0 ? 300 - i * 17 : 60 + i * 17, len = 18 - Math.abs(i - 2) * 2.2;
        const [bx, by] = pol(60, 60, 44, a);
        const [tx, ty] = pol(60, 60, 44 + len, a + side * -6);
        const [c1x, c1y] = pol(60, 60, 44 + len * 0.55, a - 6);
        const [c2x, c2y] = pol(60, 60, 44 + len * 0.55, a + 6);
        wings += `<path d="M${f(bx)} ${f(by)}Q${f(c1x)} ${f(c1y)} ${f(tx)} ${f(ty)}Q${f(c2x)} ${f(c2y)} ${f(bx)} ${f(by)}Z" fill="url(#${g})"/>`;
      }
    }
    let tail = '';
    [-12, 0, 12].forEach((d, i) => {
      const [bx, by] = pol(60, 60, 44, 180 + d);
      const [tx, ty] = pol(60, 60, i === 1 ? 59 : 55, 180 + d * 1.4);
      tail += `<path d="M${f(bx - 2.5)} ${f(by)}Q${f(tx)} ${f(by + 6)} ${f(tx)} ${f(ty)}Q${f(tx)} ${f(by + 6)} ${f(bx + 2.5)} ${f(by)}Z" fill="url(#${g})"/>`;
    });
    return outline({ label: 'Phoenix profile outline', defs: rad(g, [[0.7, '#fde047'], [0.85, '#f97316'], [1, '#dc2626']], 0.5, 0.5, 0.5),
      under: `${wings}${tail}`,
      over: `<circle cx="60" cy="60" r="45" fill="none" stroke="#f97316" stroke-width="3.5"/><circle cx="60" cy="60" r="42.4" fill="none" stroke="#fde047" stroke-width=".7"/>` +
        `<path d="${flame(60, 17, 7, 13)}" fill="#f97316"/><path d="${flame(60, 17, 3.5, 7)}" fill="#fde047"/>` });
  },

  // Galaxy
  'galaxy-nebula': () => {
    const n1 = nextId('nb'), n2 = nextId('nb'), pg = nextId('pl'), ps = nextId('ps'), ss = nextId('ss'), bl = nextId('bl'), sg = nextId('sg'), pc = nextId('pc'), cp = nextId('cp'), cb = nextId('cb'), mk = nextId('mk'), mg = nextId('mg'), r = rnd(5);
    let stars = '';
    for (let i = 0; i < 60; i++) {
      const s = r();
      stars += `<circle cx="${f(r() * 100)}" cy="${f(r() * 140)}" r="${f(0.25 + s * 0.85)}" fill="#fff" opacity="${f(0.35 + s * 0.65)}"/>`;
    }
    const pts: [number, number][] = [[16, 30], [25, 22], [35, 27], [40, 16], [49, 21]];
    const constel = `<path d="M${pts.map((p) => p.join(' ')).join('L')}" stroke="#e9d5ff" stroke-opacity=".4" stroke-width=".4" stroke-dasharray="1 .8" fill="none"/>${pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.1" fill="#fff"/><circle cx="${x}" cy="${y}" r="2" fill="none" stroke="#e9d5ff" stroke-opacity=".35" stroke-width=".25"/>`).join('')}`;
    let bands = '';
    [[-7, '#78350f', 0.45, 1.6], [-3.5, '#fde68a', 0.4, 1.2], [0, '#b45309', 0.5, 2], [3.8, '#fef3c7', 0.35, 1], [7, '#92400e', 0.45, 1.6]].forEach(([dy, c, o, w]) => {
      bands += `<path d="M36 ${70 + (dy as number)}Q50 ${72 + (dy as number)} 64 ${70 + (dy as number)}" stroke="${c}" stroke-opacity="${o}" stroke-width="${w}" fill="none"/>`;
    });
    let lat = '';
    for (let k = -8; k <= 8; k += 2.6) lat += `M38 ${f(70 + k)}Q50 ${f(71.5 + k)} 62 ${f(70 + k)}`;
    let ringLines = '';
    for (let k = 0; k < 5; k++) ringLines += `<ellipse cx="50" cy="70" rx="${f(19 + k * 1.3)}" ry="${f(5.2 + k * 0.36)}" fill="none" stroke="#e9d5ff" stroke-opacity="${f(0.75 - k * 0.12)}" stroke-width="${k === 2 ? 0.25 : 0.55}" transform="rotate(-18 50 70)"/>`;
    return card({ label: 'Galaxy Nebula card back', bg: ['#1e1b4b', '#0b0726'], edge: '#a78bfa', frame: '#c4b5fd',
      defs: clouds(n1, '#f472b6', '.022', 3, 2.6, 1.05) + clouds(n2, '#60a5fa', '.025', 8, 2.6, 1.05) + rad(mg, [[0, '#fff', 1], [0.7, '#fff', 0.6], [1, '#fff', 0]]) +
        `<mask id="${mk}"><rect x="0" y="0" width="100" height="140" fill="url(#${mg})"/></mask>` +
        rad(pg, [[0, '#fef3c7'], [0.5, '#fbbf24'], [1, '#b45309']], 0.35, 0.35, 0.75) + shadowSide(ps, 0.7) + blur(bl, 3) + glow(sg, 1.2) + `<clipPath id="${pc}"><circle cx="50" cy="70" r="11"/></clipPath>` +
        `<clipPath id="${cp}"><rect x="0" y="70" width="100" height="70"/></clipPath><clipPath id="${cb}"><rect x="0" y="0" width="100" height="70"/></clipPath>` +
        `<linearGradient id="${ss}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff"/></linearGradient>`,
      inner: `<g mask="url(#${mk})"><rect x="0" y="0" width="100" height="140" filter="url(#${n1})" opacity=".85"/><rect x="0" y="0" width="100" height="140" filter="url(#${n2})" opacity=".75"/></g>` +
        `<ellipse cx="46" cy="64" rx="34" ry="6" fill="#05031a" opacity=".5" filter="url(#${bl})" transform="rotate(-25 46 64)"/>${stars}${constel}` +
        `<g filter="url(#${sg})">${spikes(20, 108, 4.5)}${spikes(82, 24, 3.6)}${spikes(26, 82, 2.6)}${spikes(74, 112, 2)}</g><path d="M60 118L86 102" stroke="url(#${ss})" stroke-width="1.2" stroke-linecap="round"/><circle cx="86" cy="102" r="1.2" fill="#fff"/>`,
      corner: (x, y) => spark(x, y, 2.2, '#c4b5fd'),
      over: `<g clip-path="url(#${cb})">${ringLines}</g><circle cx="50" cy="70" r="11" fill="url(#${pg})"/><g clip-path="url(#${pc})">${bands}<path d="${lat}" stroke="#78350f" stroke-opacity=".25" stroke-width=".2" fill="none"/></g>` +
        `<circle cx="50" cy="70" r="11" fill="url(#${ps})"/><circle cx="50" cy="70" r="11.4" fill="none" stroke="#fde68a" stroke-opacity=".35" stroke-width=".6"/><g clip-path="url(#${cp})">${ringLines}</g>` });
  },
  'galaxy-orbit': () => {
    const pg = nextId('pl'), r = rnd(9);
    let stars = '';
    for (let i = 0; i < 16; i++) {
      const [x, y] = pol(50, 50, 9 + r() * 17, r() * 360);
      stars += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.4 + r() * 0.7)}" fill="#fff" opacity=".85"/>`;
    }
    const pal = (hi: string, lo: string, light: string, mid: string, pr: string) => ({ hi, lo, light, mid, pr, num: light, numStroke: '#0b0726' });
    return chipSet('Galaxy Orbit', pal('#4c1d95', '#1e1b4b', '#c4b5fd', '#a78bfa', '#e9d5ff'),
      { 5: pal('#9d174d', '#3b0a1f', '#fbcfe8', '#f472b6', '#fce7f3'), 10: pal('#1d4ed8', '#172554', '#bfdbfe', '#60a5fa', '#dbeafe'),
        25: pal('#0f766e', '#042f2e', '#99f6e4', '#2dd4bf', '#ccfbf1'), 50: pal('#4c1d95', '#1e1b4b', '#c4b5fd', '#a78bfa', '#e9d5ff'),
        100: pal('#44403c', '#0c0a09', '#fde68a', '#facc15', '#fef3c7') },
      (p) => ({ main: [p.hi, p.lo], spot: p.light, ring: p.light, ringDash: '1.5 3', inlay: '#0b0726', inlayStroke: p.mid,
        defs: rad(pg, [[0, '#fde68a'], [1, '#f472b6']], 0.35, 0.35, 0.7), emblem: stars + planet(50, 50, 7, pg, p.pr) + spark(38, 38, 2) + spark(63, 62, 1.6) }));
  },
  'galaxy-starlight': () => {
    const g = nextId('gg'), gl = nextId('gl'), tl = nextId('tl'), r = rnd(13);
    let stars = '';
    for (let i = 0; i < 12; i++) {
      const [x, y] = pol(60, 60, 46 + (r() - 0.5) * 4, r() * 360);
      stars += `<path d="${starPath(x, y, 2.6, 0.6, 4)}" fill="#fff"/>`;
    }
    const [mx, my] = pol(60, 60, 54, 135);
    return outline({ label: 'Galaxy Starlight profile outline',
      defs: lin(g, ['#f472b6', '#7c3aed', '#60a5fa'], 1, 1) + glow(gl, 1.5) +
        `<linearGradient id="${tl}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9d5ff" stop-opacity="0"/><stop offset="1" stop-color="#e9d5ff"/></linearGradient>`,
      over: `<path d="${arcD(60, 60, 54, 80, 128)}" stroke="url(#${tl})" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
        `<circle cx="60" cy="60" r="46" fill="none" stroke="url(#${g})" stroke-width="6"/><circle cx="60" cy="60" r="42.4" fill="none" stroke="#c4b5fd" stroke-opacity=".5" stroke-width=".5"/>` +
        `<circle cx="60" cy="60" r="54" fill="none" stroke="#c4b5fd" stroke-opacity=".3" stroke-width=".6" stroke-dasharray="2 3"/>` +
        `<g filter="url(#${gl})">${stars}<circle cx="${f(mx)}" cy="${f(my)}" r="3.4" fill="#e9d5ff"/></g>` });
  },
  'total-eclipse': () => {
    const cor = nextId('cr'), es = nextId('es'), bl = nextId('bl'), fg = nextId('fg'), ct = nextId('ct'), cm = nextId('cm'), cmg = nextId('cmg'), r = rnd(61);
    let stars = '';
    for (let i = 0; i < 44; i++) {
      const s = r();
      stars += `<circle cx="${f(r() * 100)}" cy="${f(r() * 140)}" r="${f(0.3 + s * 0.8)}" fill="#fff" opacity="${f(0.3 + s * 0.6)}"/>`;
    }
    let rays = '', streaks = '';
    for (let i = 0; i < 28; i++) {
      const a = i * (360 / 28) + r() * 4, len = 26 + r() * 14;
      const [x1, y1] = pol(50, 66, 17, a - 2), [x2, y2] = pol(50, 66, len, a), [x3, y3] = pol(50, 66, 17, a + 2);
      rays += `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}L${f(x3)} ${f(y3)}Z`;
    }
    for (let i = 0; i < 110; i++) {
      const a = r() * 360, [x0, y0] = pol(50, 66, 17.5, a), [x1, y1] = pol(50, 66, 20 + r() * 22, a + (r() - 0.5) * 6);
      streaks += `<path d="M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}" stroke="#fff7ed" stroke-opacity="${f(0.1 + r() * 0.35)}" stroke-width=".22"/>`;
    }
    let proms = '';
    [[30, 3], [140, 2.2], [250, 2.8]].forEach(([a, h]) => {
      const [x, y] = pol(50, 66, 17, a);
      proms += `<path transform="translate(${f(x)} ${f(y)}) rotate(${a})" d="M-1.4 0Q-1.6 ${-h} 0 ${-h * 1.2}Q1.6 ${-h} 1.4 0Z" fill="#f43f5e" opacity=".85"/>`;
    });
    const [fx, fy] = pol(50, 66, 17.5, 40);
    return card({ label: 'Total Eclipse card back', bg: ['#1e1b4b', '#020617'], edge: '#a78bfa', frame: '#c4b5fd',
      defs: rad(cor, [[0.4, '#fff7ed', 1], [0.55, '#fde68a', 0.9], [0.75, '#f472b6', 0.35], [1, '#7c3aed', 0]]) + rad(es, [[0, '#121b45'], [1, '#020617']], 0.4, 0.35, 0.8) + blur(bl, 3) + glow(fg, 1.6) +
        clouds(ct, '#fde68a', '.08', 17, 2.4, 1.1) + rad(cmg, [[0.3, '#fff', 1], [1, '#fff', 0]]) + `<mask id="${cm}"><circle cx="50" cy="66" r="36" fill="url(#${cmg})"/></mask>`,
      inner: `${stars}<circle cx="50" cy="66" r="44" fill="none" stroke="#c4b5fd" stroke-opacity=".12" stroke-width=".6"/><circle cx="50" cy="66" r="40" fill="url(#${cor})" opacity=".6" filter="url(#${bl})"/>` +
        `<circle cx="50" cy="66" r="36" fill="url(#${cor})"/><rect x="14" y="30" width="72" height="72" filter="url(#${ct})" mask="url(#${cm})" opacity=".5"/><path d="${rays}" fill="#fff7ed" opacity=".2"/>${streaks}` +
        `${spikes(18, 22, 2.6)}${spikes(84, 118, 3)}${spikes(80, 30, 1.8)}`,
      corner: (x, y) => `<circle cx="${x}" cy="${y}" r="2.2" fill="#fde68a"/><circle cx="${x + 0.9}" cy="${y - 0.5}" r="1.8" fill="#1e1b4b"/>`,
      over: `${proms}<circle cx="50" cy="66" r="17" fill="url(#${es})"/><circle cx="50" cy="66" r="17" fill="none" stroke="#fff7ed" stroke-opacity=".8" stroke-width=".6"/>` +
        `<g filter="url(#${fg})"><circle cx="${f(fx)}" cy="${f(fy)}" r="2.2" fill="#fff"/>${spark(fx, fy, 7)}</g>` });
  },
  supernova: () => {
    const rg = nextId('rg'), cg = nextId('cg'), gl = nextId('gl');
    let rays = '';
    for (let i = 0; i < 16; i++) {
      const a = i * 22.5, len = i % 2 ? 16 : 26;
      const [x1, y1] = pol(50, 50, 4, a - 6);
      const [x2, y2] = pol(50, 50, len, a);
      const [x3, y3] = pol(50, 50, 4, a + 6);
      rays += `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}L${f(x3)} ${f(y3)}Z`;
    }
    // A star in each value's color: red giant, blue, green, violet, gold.
    const pal = (hi: string, lo: string, light: string, mid: string, deep: string) => ({ hi, lo, light, mid, deep, num: light, numStroke: '#0b0726' });
    return chipSet('Supernova', pal('#581c87', '#1e1b4b', '#f0abfc', '#e879f9', '#c026d3'),
      { 5: pal('#b91c1c', '#450a0a', '#fecaca', '#f87171', '#dc2626'), 10: pal('#1e40af', '#172554', '#bfdbfe', '#60a5fa', '#2563eb'),
        25: pal('#047857', '#022c22', '#a7f3d0', '#34d399', '#059669'), 50: pal('#581c87', '#1e1b4b', '#f0abfc', '#e879f9', '#c026d3'),
        100: pal('#a16207', '#422006', '#fef08a', '#facc15', '#ca8a04') },
      (p) => ({ main: [p.hi, p.lo], spot: p.light, ring: p.light, ringDash: '4 2', inlay: '#0b0726', inlayStroke: p.mid, tick: p.light, numberFilter: gl,
        defs: rad(rg, [[0, '#ffffff'], [0.5, p.light], [1, p.deep]]) + rad(cg, [[0, '#ffffff', 1], [0.6, '#fde68a', 0.9], [1, '#fde68a', 0]]) + glow(gl, 1.2),
        emblem: `<path d="${rays}" fill="url(#${rg})" filter="url(#${gl})"/><circle cx="50" cy="50" r="7" fill="url(#${cg})"/>${spark(36, 36, 1.6)}${spark(66, 62, 1.4)}${spark(64, 35, 1.2)}` }));
  },
  orbitals: () => {
    const p1 = nextId('pl'), p2 = nextId('pl');
    const ell = (rot: number, half: 'back' | 'front') =>
      `<path d="M-56 0A56 18 0 0 ${half === 'back' ? 1 : 0} 56 0" transform="translate(60 60) rotate(${rot})" fill="none" stroke="${rot < 0 ? '#c4b5fd' : '#93c5fd'}" stroke-width="1.4"/>`;
    const at = (rot: number, t: number): [number, number] => {
      const x = 56 * Math.cos(t), y = 18 * Math.sin(t), c = Math.cos((rot * Math.PI) / 180), s = Math.sin((rot * Math.PI) / 180);
      return [60 + x * c - y * s, 60 + x * s + y * c];
    };
    const [ax, ay] = at(-25, Math.PI * 0.62);
    const [bx, by] = at(25, Math.PI * 0.22);
    return outline({ label: 'Orbitals profile outline', defs: rad(p1, [[0, '#fbcfe8'], [1, '#db2777']], 0.35, 0.35, 0.7) + rad(p2, [[0, '#bfdbfe'], [1, '#2563eb']], 0.35, 0.35, 0.7),
      under: `${ell(-25, 'back')}${ell(25, 'back')}`,
      over: `<circle cx="60" cy="60" r="44.5" fill="none" stroke="#7c3aed" stroke-width="3"/>${ell(-25, 'front')}${ell(25, 'front')}` +
        `<circle cx="${f(ax)}" cy="${f(ay)}" r="4" fill="url(#${p1})"/><circle cx="${f(bx)}" cy="${f(by)}" r="3" fill="url(#${p2})"/>${spark(18, 20, 2.4)}${spark(102, 96, 2)}${spark(100, 22, 1.4)}` });
  },

  // Halloween
  'haunted-moon': () => {
    const mg = nextId('mn'), pk = nextId('pk'), tb = nextId('tb'), bl = nextId('bl'), mc = nextId('mc'), mt = nextId('mt'), st = nextId('st'), tc = nextId('tc'), fg = nextId('fg'), r = rnd(71);
    let web = '<g stroke="#e9d5ff" stroke-opacity=".45" stroke-width=".4" fill="none">';
    const angles = [0, 12, 24, 36, 48, 60, 72, 84, 90].map((d) => (d * Math.PI) / 180);
    angles.forEach((a) => (web += `<path d="M7 7L${f(7 + 32 * Math.cos(a))} ${f(7 + 32 * Math.sin(a))}"/>`));
    [5, 9, 13, 17, 21, 25, 29].forEach((R) => {
      let d = '';
      for (let i = 0; i < angles.length - 1; i++) {
        const a0 = angles[i], a1 = angles[i + 1], am = (a0 + a1) / 2;
        d += `${i ? '' : `M${f(7 + R * Math.cos(a0))} ${f(7 + R * Math.sin(a0))}`}Q${f(7 + R * 0.88 * Math.cos(am))} ${f(7 + R * 0.88 * Math.sin(am))} ${f(7 + R * Math.cos(a1))} ${f(7 + R * Math.sin(a1))}`;
      }
      web += `<path d="${d}"/>`;
    });
    web += '</g>';
    let stars = '';
    for (let i = 0; i < 14; i++) stars += `<circle cx="${f(30 + r() * 66)}" cy="${f(8 + r() * 50)}" r="${f(0.3 + r() * 0.5)}" fill="#fef3c7" opacity="${f(0.4 + r() * 0.5)}"/>`;
    const crater = (x: number, y: number, rr: number) => `<circle cx="${x}" cy="${y}" r="${rr}" fill="#d9ad4a" opacity=".55"/><circle cx="${f(x + rr * 0.3)}" cy="${f(y + rr * 0.3)}" r="${f(rr * 0.65)}" fill="#fff6d0" opacity=".4"/>` +
      `<path d="${arcD(x, y, rr, 200, 340)}" stroke="#9a7424" stroke-opacity=".55" stroke-width=".25" fill="none"/>`;
    let grass = '';
    for (let x = 2; x < 100; x += 3.4) grass += `M${x} ${f(115 - Math.sin(x / 8) * 3)}l-.6 -2.2M${x} ${f(115 - Math.sin(x / 8) * 3)}l.7 -2.6`;
    const tombs = `${tomb(16, 117, 8, 12, `url(#${tb})`)}${tomb(84, 113, 9, 14, `url(#${tb})`)}${tomb(74, 116, 6, 9, `url(#${tb})`)}`;
    return card({ label: 'Haunted Moon card back', bg: ['#2e1065', '#0d0618'], edge: '#f97316', frame: '#f97316',
      defs: rad(mg, [[0, '#fffbeb'], [0.7, '#fde68a'], [1, '#e9b949']], 0.4, 0.35, 0.75) + sphere(pk, '#fdba74', '#f97316', '#9a3412') + lin(tb, ['#3a2d55', '#140d22'], 1, 0) + blur(bl, 2.5) +
        `<clipPath id="${mc}"><circle cx="68" cy="34" r="15"/></clipPath>` + rough(mt, 0.35, 7, 2.2) + rough(st, 0.9, 11, 1.8) + clouds(fg, '#c4b5fd', '.02 .09', 6, 2, 1) +
        `<clipPath id="${tc}"><path d="M12 117V109A4 4 0 0 1 20 109V117ZM79.5 113V103.5A4.5 4.5 0 0 1 88.5 103.5V113ZM71 116V110A3 3 0 0 1 77 110V116Z"/></clipPath>`,
      inner: `${stars}<circle cx="68" cy="34" r="21" fill="#fde68a" opacity=".28" filter="url(#${bl})"/><circle cx="68" cy="34" r="15" fill="url(#${mg})"/>` +
        `<g clip-path="url(#${mc})"><rect x="53" y="19" width="30" height="30" filter="url(#${mt})" opacity=".45" style="mix-blend-mode:multiply"/></g>${crater(63, 30, 2.6)}${crater(72, 40, 1.9)}${crater(70, 28, 1.3)}${crater(61, 39, 1.1)}${crater(75, 33, 0.8)}` +
        `${bat(42, 30, 1, '#0a0412')}<path d="M34 30Q38 28 40.5 29M50 30Q46 28 43.5 29" stroke="#3b2a55" stroke-width=".25" fill="none"/>${bat(58, 46, 0.7, '#0a0412')}${bat(82, 58, 0.55, '#0a0412')}${web}${spider(24, 12, 30)}` +
        `<path d="M0 116Q20 106 40 114T80 110T100 112V140H0Z" fill="#0a0412"/><path d="${grass}" stroke="#1f1530" stroke-width=".35"/>` +
        `<rect x="0" y="100" width="100" height="30" filter="url(#${fg})" opacity=".35"/>${tombs}<g clip-path="url(#${tc})"><rect x="10" y="100" width="80" height="20" filter="url(#${st})" opacity=".4" style="mix-blend-mode:multiply"/></g>` +
        `<path d="M85.5 105l-1 2.2 1.1 1.4-.8 2M14.5 110l1 2.4-.6 1.8" stroke="#0a0412" stroke-width=".3" fill="none"/>` +
        `<path d="M26 120V113M30 119V112M34 118V111M24 116H36" stroke="#1f1530" stroke-width="1.2"/>`,
      corner: (x, y, rot) => (rot === 0 ? '' : `<circle cx="${x}" cy="${y}" r="1.3" fill="#f97316"/>`),
      over: `<circle cx="50" cy="100" r="17" fill="#f97316" opacity=".22" filter="url(#${bl})"/>${pumpkin(50, 100, 1.5, pk)}` +
        `<path d="M44 89Q42 100 44 111M56 89Q58 100 56 111M38.5 92Q36.5 100 38.5 108M61.5 92Q63.5 100 61.5 108" stroke="#7c2d12" stroke-opacity=".45" stroke-width=".35" fill="none"/>` });
  },
  'graveyard-ghost': () => {
    const mg = nextId('mn'), gl = nextId('gl'), gh = nextId('gh'), tb = nextId('tb'), bl = nextId('bl'), fg = nextId('fg'), st = nextId('st'), tc = nextId('tc'), mt = nextId('mt'), mc = nextId('mc'), r = rnd(81);
    let stars = '';
    for (let i = 0; i < 20; i++) stars += `<circle cx="${f(r() * 100)}" cy="${f(6 + r() * 60)}" r="${f(0.3 + r() * 0.6)}" fill="#e0e7ff" opacity="${f(0.4 + r() * 0.5)}"/>`;
    let grass = '', fence = '';
    for (let x = 1; x < 100; x += 3) grass += `M${x} ${f(108 - Math.sin(x / 9) * 4)}l-.5 -2M${x} ${f(108 - Math.sin(x / 9) * 4)}l.6 -2.4`;
    for (let x = 44; x <= 70; x += 3) fence += `M${x} 112V104l.7 -1.2.7 1.2V112`;
    const tombs = `${tomb(18, 116, 10, 16, `url(#${tb})`, '#5b5285')}${tomb(36, 118, 8, 12, `url(#${tb})`, '#5b5285')}${tomb(76, 121, 8, 11, `url(#${tb})`, '#5b5285')}`;
    return card({ label: 'Graveyard Ghost card back', bg: ['#312e81', '#0f0a1e'], edge: '#f97316', frame: '#a855f7',
      defs: rad(mg, [[0, '#f8fafc'], [1, '#c7d2fe']], 0.4, 0.35, 0.75) + glow(gl, 2) + lin(gh, ['#ffffff', '#c7d2fe']) + lin(tb, ['#3b3360', '#1a1530'], 1, 0) + blur(bl, 2.4) +
        clouds(fg, '#e0e7ff', '.018 .08', 4, 2.2, 1) + rough(st, 0.9, 13, 1.8) + rough(mt, 0.4, 3, 2) + `<clipPath id="${mc}"><circle cx="26" cy="28" r="11"/></clipPath>` +
        `<clipPath id="${tc}"><path d="M13 116V105A5 5 0 0 1 23 105V116ZM32 118V110A4 4 0 0 1 40 110V118ZM72 121V114A4 4 0 0 1 80 114V121Z"/></clipPath>`,
      inner: `${stars}<circle cx="26" cy="28" r="15" fill="#c7d2fe" opacity=".25" filter="url(#${bl})"/><circle cx="26" cy="28" r="11" fill="url(#${mg})"/>` +
        `<g clip-path="url(#${mc})"><rect x="15" y="17" width="22" height="22" filter="url(#${mt})" opacity=".4" style="mix-blend-mode:multiply"/></g><circle cx="23" cy="25" r="1.8" fill="#a5b4fc" opacity=".5"/><circle cx="29" cy="31" r="1.2" fill="#a5b4fc" opacity=".45"/>` +
        `${bat(60, 22, 0.7, '#0a0412')}${bat(76, 32, 0.5, '#0a0412')}<path d="M0 112Q30 100 60 108T100 104V140H0Z" fill="#0d0a1a"/><path d="${grass}" stroke="#251d40" stroke-width=".35"/>` +
        `${deadTree(84, 108, 1.4, '#0d0a1a')}<path d="M84 100l-3 -4M84 96l2.6 -3.4M80 92l-1.6 -2.6M88 88l1 -2.4M81.5 86.5l-2 -.8" stroke="#0d0a1a" stroke-width=".7" stroke-linecap="round"/>` +
        `<path d="${fence}" stroke="#2a2342" stroke-width=".7" fill="none"/><path d="M43 106H71M43 109.5H71" stroke="#2a2342" stroke-width=".6"/>` +
        `${tombs}<g clip-path="url(#${tc})"><rect x="10" y="98" width="72" height="24" filter="url(#${st})" opacity=".45" style="mix-blend-mode:multiply"/></g>` +
        `<path d="M18 104V110M15.8 106H20.2M21 112l-1.4 2.4.8 1.2" stroke="#5b5285" stroke-width=".45" fill="none"/>` +
        `<rect x="0" y="96" width="100" height="44" filter="url(#${fg})" opacity=".5"/>`,
      corner: (x, y) => `<circle cx="${x}" cy="${y}" r="1.2" fill="#f97316"/>`,
      over: `<g filter="url(#${gl})">${ghost(50, 66, 2.2, `url(#${gh})`)}</g><path d="M37 82Q35 88 39 92M63 82Q65 87 61 91M44 84Q43 90 46 93" stroke="#e0e7ff" stroke-opacity=".45" stroke-width=".35" fill="none"/>` });
  },
  'jack-o-lantern': () => {
    const pal = (hi: string, lo: string, spot: string, edge: string, wing: string) => ({ hi, lo, spot, edge, wing, num: edge, numStroke: '#111827' });
    return chipSet('Jack-o’-Lantern', pal('#fb923c', '#c2410c', '#111827', '#fb923c', '#a855f7'),
      { 5: pal('#ef4444', '#991b1b', '#111827', '#f87171', '#fb923c'), 10: pal('#6366f1', '#312e81', '#111827', '#818cf8', '#fb923c'),
        25: pal('#84cc16', '#3f6212', '#111827', '#a3e635', '#a855f7'), 50: pal('#fb923c', '#c2410c', '#111827', '#fb923c', '#a855f7'),
        100: pal('#3f3f46', '#09090b', '#fb923c', '#fb923c', '#a855f7') },
      (p) => ({ main: [p.hi, p.lo], spot: p.spot, ring: p.spot, ringDash: '4 3', inlay: '#111827', inlayStroke: p.edge, tick: p.spot,
        emblem: pumpkin(50, 52, 1.45) + bat(36, 33, 0.35, p.wing) + bat(65, 32, 0.3, p.wing) }));
  },
  'bat-wing': () => {
    let stars = '';
    ([[16, 22], [104, 40], [12, 70], [106, 84]] as const).forEach(([x, y]) => (stars += spark(x, y, 1.8, '#fde68a')));
    return outline({ label: 'Bat Wing profile outline',
      over: `<circle cx="60" cy="60" r="46" fill="none" stroke="#f97316" stroke-width="6"/><circle cx="60" cy="60" r="46" fill="none" stroke="#111827" stroke-width="1.6" stroke-dasharray="4 4"/><circle cx="60" cy="60" r="42.4" fill="none" stroke="#7c3aed" stroke-width=".8"/>` +
        `${stars}${bat(60, 9, 1.25, '#a855f7')}${bat(30, 19, 0.8, '#a855f7')}${bat(90, 19, 0.8, '#a855f7')}${pumpkin(60, 106, 0.7)}` });
  },

  // Thanksgiving
  'harvest-turkey': () => {
    const r = rnd(17), md = nextId('md'), sf = nextId('sf'), cols = ['#ea580c', '#b91c1c', '#f59e0b', '#d97706'];
    let leaves = '', beads = '';
    for (let i = 0; i < 18; i++) {
      const s = 3.5 + r() * 3.5, x = f(r() * 100), y = f(r() * 140), rot = f(r() * 360);
      leaves += `<g transform="translate(${f(x + 0.7)} ${f(y + 0.9)}) rotate(${rot})"><path d="${maple(s)}" fill="#000" opacity=".3"/></g>` +
        `<g transform="translate(${x} ${y}) rotate(${rot})"><path d="${maple(s)}" fill="${cols[i % 4]}" opacity=".9"/><path d="${maple(s)}" fill="none" stroke="#7c2d12" stroke-opacity=".4" stroke-width=".22"/>${mapleVeins(s, '#7c2d12')}</g>`;
    }
    for (let i = 0; i < 30; i++) {
      const [x, y] = pol(50, 70, 27.3, i * 12);
      beads += `<circle cx="${f(x)}" cy="${f(y)}" r=".9" fill="#fbbf24"/>`;
    }
    return card({ label: 'Harvest Turkey card back', bg: ['#7c2d12', '#3b1204'], edge: '#fbbf24', frame: '#fbbf24',
      defs: rad(md, [[0, '#fffbeb'], [0.75, '#fde68a'], [1, '#efc265']], 0.45, 0.35, 0.8) + blur(sf, 1.2),
      inner: leaves,
      corner: (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot - 45})"><path d="${maple(3.4)}" fill="#fbbf24"/>${mapleVeins(3.4, '#7c2d12', 0.6)}</g>`,
      over: `${wheat(20, 116, 30, '#fbbf24', -12)}${wheat(80, 116, 30, '#fbbf24', 12)}<path d="M20 86l-2 -5M22 90l2.4 -4.4M80 86l2 -5M78 90l-2.4 -4.4" stroke="#fbbf24" stroke-opacity=".7" stroke-width=".25"/>` +
        `${beads}<circle cx="50" cy="70" r="28.8" fill="none" stroke="#fbbf24" stroke-opacity=".4" stroke-width=".3"/><circle cx="50" cy="70" r="25" fill="url(#${md})" stroke="#fbbf24" stroke-width="2"/>` +
        `<circle cx="50" cy="70" r="23.6" fill="none" stroke="#b45309" stroke-opacity=".45" stroke-width="1.6" filter="url(#${sf})"/><circle cx="50" cy="70" r="22.4" fill="none" stroke="#d97706" stroke-opacity=".5" stroke-width=".5"/>` +
        `<circle cx="50" cy="70" r="21.3" fill="none" stroke="#d97706" stroke-opacity=".35" stroke-width=".3" stroke-dasharray=".7 1"/>${turkey(50, 73, 0.92)}` });
  },
  'pumpkin-pie': () => {
    const pl = nextId('pl'), fl = nextId('fl'), fk = nextId('fk'), bl = nextId('bl'), cr = nextId('cr'), cc = nextId('cc'), th = nextId('th'), r = rnd(91);
    let ging = '';
    for (let k = 0; k <= 140; k += 10) ging += `<rect x="0" y="${k}" width="100" height="5" fill="#dc2626" opacity=".28"/>`;
    for (let k = 0; k <= 100; k += 10) ging += `<rect x="${k}" y="0" width="5" height="140" fill="#dc2626" opacity=".28"/>`;
    let crimps = '', specks = '';
    for (let a = 0; a < 360; a += 6) {
      const [x0, y0] = pol(50, 70, 22.4, a), [x1, y1] = pol(50, 70, 26.4, a);
      crimps += `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`;
    }
    for (let i = 0; i < 26; i++) {
      const [x, y] = pol(50, 70, r() * 18, r() * 360);
      specks += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.15 + r() * 0.2)}" fill="#7c2d12" opacity=".55"/>`;
    }
    let rims = '';
    [31.6, 30.8, 30].forEach((rr, i) => (rims += `<circle cx="50" cy="70" r="${rr}" fill="none" stroke="${i === 1 ? '#fff' : '#94a3b8'}" stroke-opacity="${i === 1 ? 0.8 : 0.45}" stroke-width=".3"/>`));
    return card({ label: 'Pumpkin Pie card back', bg: ['#fffbeb', '#fde68a'], edge: '#b45309', frame: '#b45309',
      defs: rad(pl, [[0, '#ffffff'], [0.8, '#f1f5f9'], [1, '#cbd5e1']], 0.45, 0.4, 0.75) + rad(fl, [[0, '#fdba74'], [0.6, '#f97316'], [1, '#c2410c']], 0.4, 0.35, 0.8) +
        lin(fk, ['#f1f5f9', '#64748b', '#e2e8f0'], 1, 1) + blur(bl, 2.2) + rough(cr, 0.8, 5, 2) + `<clipPath id="${cc}"><path d="M50 43A27 27 0 1 1 49.99 43ZM50 49A21 21 0 1 0 50.01 49Z" clip-rule="evenodd"/></clipPath>` +
        hatchPattern(th, 0, 1, '#7f1d1d', 0.15),
      inner: `${ging}<rect x="0" y="0" width="100" height="140" fill="url(#${th})" opacity=".35"/>`,
      corner: (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot - 45})"><path d="${maple(3.6)}" fill="#c2410c"/>${mapleVeins(3.6, '#7c2d12', 0.6)}</g>`,
      over: `<ellipse cx="52" cy="74" rx="34" ry="33" fill="#000" opacity=".3" filter="url(#${bl})"/><circle cx="50" cy="70" r="33" fill="url(#${pl})" stroke="#cbd5e1" stroke-width="1"/>${rims}` +
        `<circle cx="50" cy="70" r="29" fill="none" stroke="#94a3b8" stroke-opacity=".6" stroke-width="1"/>${pie(50, 70, 25, `url(#${fl})`)}` +
        `<g clip-path="url(#${cc})"><rect x="23" y="43" width="54" height="54" filter="url(#${cr})" opacity=".4" style="mix-blend-mode:multiply"/></g>` +
        `<path d="${crimps}" stroke="#92400e" stroke-opacity=".45" stroke-width=".3"/>${specks}` +
        `<path d="M81 109L91 119" stroke="#000" stroke-opacity=".25" stroke-width="2.6" stroke-linecap="round"/><path d="M80 108L90 118" stroke="url(#${fk})" stroke-width="2.4" stroke-linecap="round"/>` +
        `<path d="M80.6 107.6L89.6 116.6" stroke="#fff" stroke-opacity=".6" stroke-width=".4" stroke-linecap="round"/><path d="M76 104L80 108M78 102L82 106M80 100L84 104M74.6 105.4L78.6 109.4" stroke="#94a3b8" stroke-width="1" stroke-linecap="round"/>` });
  },
  'autumn-leaf': () => {
    const pal = (hi: string, lo: string, leaf: string, vein: string) => ({ hi, lo, leaf, vein, num: lo, numStroke: '#fef3c7' });
    return chipSet('Autumn Leaf', pal('#d97706', '#92400e', '#c2410c', '#7c2d12'),
      { 5: pal('#dc2626', '#7f1d1d', '#b91c1c', '#7f1d1d'), 10: pal('#0284c7', '#0c4a6e', '#0369a1', '#0c4a6e'), 25: pal('#65a30d', '#365314', '#4d7c0f', '#365314'),
        50: pal('#d97706', '#92400e', '#c2410c', '#7c2d12'), 100: pal('#57534e', '#1c1917', '#44403c', '#1c1917') },
      (p) => ({ main: [p.hi, p.lo], spot: '#fef3c7', ring: '#fef3c7', ringDash: '3 3', inlay: '#fef3c7', inlayStroke: p.lo, tick: '#fef3c7',
        emblem: `<g transform="translate(50 49) rotate(-10)"><path d="${maple(21)}" fill="${p.leaf}" stroke="${p.vein}" stroke-width=".8" stroke-linejoin="round"/><path d="M0 8V-16M0 -2L-12 -6M0 -2L12 -6M0 3L-8 7M0 3L8 7" stroke="${p.vein}" stroke-width=".6" fill="none"/></g>` }));
  },
  'harvest-wreath': () => {
    const cols = ['#ea580c', '#b91c1c', '#f59e0b', '#d97706'];
    let leaves = '', acorns = '';
    for (let i = 0; i < 18; i++) {
      const a = i * 20;
      const [x, y] = pol(60, 60, 47, a);
      leaves += `<g transform="translate(${f(x)} ${f(y)}) rotate(${a + 60})"><path d="M0 -7.5Q4.8 -1 0 7.5Q-4.8 -1 0 -7.5Z" fill="${cols[i % 4]}"/><path d="M0 -6.5V6.5" stroke="#7c2d12" stroke-width=".6"/></g>`;
    }
    [45, 135, 225, 315].forEach((a) => {
      const [x, y] = pol(60, 60, 47, a + 10);
      acorns += acorn(x, y, 0.9, a);
    });
    return outline({ label: 'Harvest Wreath profile outline', over: `<circle cx="60" cy="60" r="46" fill="none" stroke="#78350f" stroke-width="3"/>${leaves}${acorns}${bow(60, 107, '#b91c1c', '#7f1d1d')}` });
  },

  // Christmas
  evergreen: () => {
    const gl = nextId('gl'), tg = nextId('tg'), gd = nextId('gd'), tc = nextId('tc'), r = rnd(23);
    let flakes = '';
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 4; col++) {
        const x = 14 + col * 24 + (row % 2 ? 12 : 0), y = 14 + row * 19;
        if (x < 94) flakes += snowflake(x, y, 3.2, '#dcfce7', 0.6) + snowflake(x, y, 1.6, '#dcfce7', 0.35);
      }
    }
    let needles = '';
    for (let i = 0; i < 170; i++) {
      const y = 57 + r() * 44, x = 50 + (r() - 0.5) * 40, dir = x < 50 ? -1 : 1;
      needles += `M${f(x)} ${f(y)}l${f(dir * (1 + r()))} ${f(1.2 + r() * 0.8)}`;
    }
    let drift = '';
    for (let i = 0; i < 4; i++) drift += `<path d="${waveD(0, 100, 118 + i * 4, 1.2, 30 + i * 6, i)}" stroke="#94a3b8" stroke-opacity="${f(0.45 - i * 0.08)}" stroke-width=".3" fill="none"/>`;
    return card({ label: 'Evergreen card back', bg: ['#166534', '#052e16'], edge: '#facc15', frame: '#facc15',
      defs: glow(gl, 1.4) + lin(tg, ['#4ade80', '#16a34a', '#14532d'], 1, 0) + lin(gd, ['#ffffff', '#cbd5e1']) +
        `<clipPath id="${tc}"><path d="M50 56L62 72H38Z M50 65L66 86H34Z M50 76L71 100H29Z"/></clipPath>`,
      inner: `<g opacity=".45">${flakes}</g><path d="M0 114Q25 107 50 112T100 110V140H0Z" fill="url(#${gd})"/>${drift}<ellipse cx="54" cy="112" rx="24" ry="2.6" fill="#000" opacity=".15"/>`,
      corner: (x, y) => snowflake(x, y, 2.6, '#facc15', 0.7),
      over: `<circle cx="50" cy="54" r="9" fill="#facc15" opacity=".25" filter="url(#${gl})"/>${tree(50, 50, gl, `url(#${tg})`)}` +
        `<g clip-path="url(#${tc})"><path d="${needles}" stroke="#052e16" stroke-opacity=".45" stroke-width=".3"/><path d="${needles}" transform="translate(-.4 -.5)" stroke="#86efac" stroke-opacity=".16" stroke-width=".2"/></g>` +
        `${gift(31, 114, 10, 8, '#dc2626', '#facc15')}<path d="M26 108H36M26 110.5H36" stroke="#7f1d1d" stroke-opacity=".5" stroke-width=".3"/>${gift(69, 114, 9, 10, '#2563eb', '#f8fafc')}` +
        `<path d="M64.5 106l9 8M64.5 110l5 4.4" stroke="#1e3a8a" stroke-opacity=".5" stroke-width=".3"/>${gift(41, 116, 7, 5, '#facc15', '#dc2626')}` });
  },
  'frosty-night': () => {
    const r = rnd(91), gl = nextId('gl'), sn = nextId('sn'), gd = nextId('gd'), pg = nextId('pg'), sx = nextId('sx'), scl = nextId('scl'), mt = nextId('mt'), mc = nextId('mc');
    let snow = '';
    for (let i = 0; i < 50; i++) snow += `<circle cx="${f(r() * 100)}" cy="${f(r() * 120)}" r="${f(0.4 + r() * 0.9)}" fill="#fff" opacity="${f(0.5 + r() * 0.5)}"/>`;
    const pine = (x: number, by: number, s: number) => {
      let n = '';
      for (let y = -20; y < 4; y += 1.6) n += `M0 ${y}l${f(-(y + 22) * 0.36)} 1.4M0 ${y}l${f((y + 22) * 0.36)} 1.4`;
      return `<g transform="translate(${x} ${by}) scale(${s})"><path d="M0 -22L6 -12H3L8 -4H4L10 4H-10L-4 -4H-8L-3 -12H-6Z" fill="url(#${pg})"/><path d="${n}" stroke="#052e16" stroke-opacity=".5" stroke-width=".3"/>` +
        `<path d="M-6 -12H6M-8 -4H8" stroke="#f8fafc" stroke-width=".8"/><path d="M0 -22V4" stroke="#14532d" stroke-width=".4"/></g>`;
    };
    let drift = '';
    for (let i = 0; i < 4; i++) drift += `<path d="${waveD(0, 100, 122 + i * 3.6, 1.4, 34 + i * 5, i * 0.9)}" stroke="#94a3b8" stroke-opacity="${f(0.45 - i * 0.08)}" stroke-width=".3" fill="none"/>`;
    return card({ label: 'Frosty Night card back', bg: ['#1e3a8a', '#0f172a'], edge: '#facc15', frame: '#bfdbfe',
      defs: glow(gl, 1.6) + sphere(sn, '#ffffff', '#eef2f7', '#94a3b8') + lin(gd, ['#f8fafc', '#cbd5e1']) + lin(pg, ['#22c55e', '#14532d'], 1, 0) + rough(sx, 1.1, 19, 1.4) +
        `<clipPath id="${scl}"><circle cx="50" cy="112.4" r="12"/><circle cx="50" cy="94.4" r="9.6"/><circle cx="50" cy="80" r="7.2"/></clipPath>` + rough(mt, 0.5, 2, 1.6) + `<clipPath id="${mc}"><circle cx="76" cy="26" r="9"/></clipPath>`,
      inner: `<g filter="url(#${gl})"><circle cx="76" cy="26" r="9" fill="#fef9c3"/></g><g clip-path="url(#${mc})"><rect x="67" y="17" width="18" height="18" filter="url(#${mt})" opacity=".35" style="mix-blend-mode:multiply"/></g><circle cx="80" cy="23" r="8" fill="#1e3a8a"/>` +
        `${snow}${spikes(20, 18, 2.6)}${spikes(46, 30, 1.8)}${pine(16, 108, 1.1)}${pine(86, 106, 1.3)}${pine(26, 112, 0.7)}<path d="M0 110Q25 102 50 108T100 104V140H0Z" fill="#dbe4ef"/>` +
        `<path d="M0 120Q30 112 60 118T100 116V140H0Z" fill="url(#${gd})"/>${drift}<ellipse cx="54" cy="122.5" rx="15" ry="2.6" fill="#1e3a8a" opacity=".25"/>`,
      corner: (x, y) => snowflake(x, y, 2.6, '#bfdbfe', 0.7),
      over: `${snowman(50, 122, 1.2, sn)}<g clip-path="url(#${scl})"><rect x="36" y="70" width="28" height="56" filter="url(#${sx})" opacity=".35" style="mix-blend-mode:multiply"/></g>` +
        `<path d="M42.4 86.6Q50 89.6 57.6 86.6" stroke="#991b1b" stroke-opacity=".6" stroke-width=".3" fill="none"/><path d="M44 87.6l1 2.4M47 88.3l.6 2.4M50 88.5V91M53 88.3l-.6 2.4M56 87.6l-1 2.4" stroke="#7f1d1d" stroke-opacity=".6" stroke-width=".3"/>` +
        `<path d="M40.4 94.4l-4 -3.2M38 92.6l-.4 -2.6M59.6 94.4l4 -3.2M62 92.6l.4 -2.6" stroke="#78350f" stroke-width=".6" stroke-linecap="round"/>` });
  },
  'candy-cane': () => {
    const cc = nextId('cc');
    const pal = (hi: string, lo: string, stripe: string, inlay: string) => ({ hi, lo, stripe, inlay, num: '#f8fafc', numStroke: inlay });
    return chipSet('Candy Cane', pal('#dc2626', '#7f1d1d', '#dc2626', '#166534'),
      { 5: pal('#dc2626', '#7f1d1d', '#dc2626', '#166534'), 10: pal('#2563eb', '#1e3a8a', '#2563eb', '#166534'), 25: pal('#16a34a', '#14532d', '#16a34a', '#991b1b'),
        50: pal('#f59e0b', '#92400e', '#f59e0b', '#166534'), 100: pal('#475569', '#0f172a', '#94a3b8', '#166534') },
      (p) => ({ main: [p.hi, p.lo], spot: `url(#${cc})`, ring: '#f8fafc', ringDash: '5 3', inlay: p.inlay, inlayStroke: '#facc15',
        defs: `<pattern id="${cc}" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="#f8fafc"/><rect width="1.8" height="4" fill="${p.stripe}"/></pattern>`,
        emblem: `${snowflake(50, 50, 17, '#f8fafc', 2.2)}<circle cx="50" cy="50" r="2.4" fill="#facc15"/>` }));
  },
  'holly-wreath': () => {
    let leaves = '', berries = '', orn = '';
    for (let i = 0; i < 12; i++) {
      const a = i * 30 + 15;
      const [x, y] = pol(60, 60, 46, a);
      leaves += `<g transform="translate(${f(x)} ${f(y)}) rotate(${a})"><path d="${HOLLY}" fill="#15803d" transform="rotate(-35) translate(0 -5)"/><path d="${HOLLY}" fill="#22c55e" transform="rotate(35) translate(0 -5)"/><path d="M0 -5V5" stroke="#14532d" stroke-width=".5" transform="rotate(-35) translate(0 -5)"/></g>`;
    }
    for (let i = 0; i < 6; i++) {
      if (i === 3) continue;
      const [x, y] = pol(60, 60, 46, i * 60);
      berries += `<circle cx="${f(x - 1.6)}" cy="${f(y)}" r="2.2" fill="#dc2626"/><circle cx="${f(x + 1.6)}" cy="${f(y + 0.6)}" r="2.2" fill="#ef4444"/><circle cx="${f(x)}" cy="${f(y - 1.8)}" r="2.2" fill="#b91c1c"/><circle cx="${f(x - 0.6)}" cy="${f(y - 2.4)}" r=".6" fill="#fff" opacity=".7"/>`;
    }
    [30, 150, 210, 330].forEach((a) => {
      const [x, y] = pol(60, 60, 50, a);
      orn += `<circle cx="${f(x)}" cy="${f(y)}" r="2.3" fill="#facc15" stroke="#ca8a04" stroke-width=".5"/><rect x="${f(x - 0.8)}" y="${f(y - 3.4)}" width="1.6" height="1.2" fill="#ca8a04"/>`;
    });
    return outline({ label: 'Holly Wreath profile outline', over: `<circle cx="60" cy="60" r="46" fill="none" stroke="#14532d" stroke-width="8"/>${leaves}${berries}${orn}${bow(60, 106)}` });
  },

  // Holographic (the rare card in each box)
  'holo-neon': () => {
    const gl = nextId('gl');
    const spade = 'M50 30C50 30 27 48 27 60C27 69 36 74 45.5 68L43 79H57L54.5 68C64 74 73 69 73 60C73 48 50 30 50 30Z';
    return holoCard({ label: 'Neon Prism holographic card back', bg: ['#1a0b3d', '#05010f'], seed: 101, defs: glow(gl, 1.4),
      motif: () => {
        let rings = '';
        for (let k = 1; k <= 6; k++) rings += `<circle cx="50" cy="58" r="${k * 9}" fill="none" stroke="${k % 2 ? '#2ef2ff' : '#ff3fd2'}" stroke-opacity=".3" stroke-width=".8"/>`;
        let grid = '';
        [104, 110, 118, 128, 140].forEach((y) => (grid += `M0 ${y}H100`));
        for (let k = -5; k <= 5; k++) grid += `M${50 + k * 6} 100L${50 + k * 22} 140`;
        return `${rings}<path d="${grid}" stroke="#2ef2ff" stroke-opacity=".55" stroke-width=".7" fill="none"/>`;
      },
      emblem: (rb) => `<path d="${spade}" fill="url(#${rb})" stroke="#fff" stroke-width="1.6" filter="url(#${gl})"/><path d="${spade}" fill="#fff" opacity=".25" transform="translate(50 56) scale(.6) translate(-50 -56)"/>` +
        `<path d="M41 47Q46 38 50 34" stroke="#fff" stroke-opacity=".8" stroke-width="1.2" fill="none" stroke-linecap="round"/>` });
  },
  'holo-royal': () => {
    const gm = nextId('gm');
    return holoCard({ label: 'Gilded Prism holographic card back', bg: ['#5b0f2a', '#160309'], seed: 102, defs: lin(gm, ['#f0f9ff', '#7dd3fc', '#0369a1'], 0.6, 1),
      motif: () => {
        let fleurs = '';
        for (let row = 0; row < 8; row++) for (let col = 0; col < 6; col++) fleurs += fleur(col * 20 + (row % 2 ? 10 : 0), row * 19 + 4, 0.5, '#f8e08e');
        return `<path d="${latticeD(9)}" stroke="#f8e08e" stroke-opacity=".25" stroke-width=".6" fill="none"/><g opacity=".18">${fleurs}</g>`;
      },
      emblem: (rb) => `${laurel(50, 74, 24, 205, 320, 6, `url(#${rb})`, 0.9)}${laurel(50, 74, 24, 155, 40, 6, `url(#${rb})`, 0.9)}${crown(50, 68, 1.45, `url(#${rb})`, '#ffffff')}${gem(50, 90, 0.8, gm)}` });
  },
  'holo-ocean': () => {
    const pr = nextId('pr');
    return holoCard({ label: 'Opal Tide holographic card back', bg: ['#0c4a6e', '#041a2b'], seed: 103,
      defs: rad(pr, [[0, '#ffffff'], [0.5, '#e0f2fe'], [1, '#a5b4fc']], 0.35, 0.3, 0.75),
      motif: () => `${waveFill(96, 3, 34, 0, '#0e7490')}${waveFill(108, 3.5, 40, 1.4, '#075985')}${waveFill(121, 3, 30, 2.6, '#0369a1')}` +
        `<path d="${waveD(0, 100, 96, 3, 34, 0)}" stroke="#e0f2fe" stroke-opacity=".5" stroke-width=".8" fill="none"/>`,
      emblem: (rb) => `${shell(50, 66, 2.7, `url(#${rb})`, '#ffffff')}<circle cx="50" cy="74" r="6.5" fill="url(#${pr})"/><circle cx="50" cy="74" r="6.5" fill="url(#${rb})" opacity=".35"/><circle cx="47.8" cy="71.8" r="1.6" fill="#fff" opacity=".9"/>` });
  },
  'holo-inferno': () => {
    const r = rnd(104);
    return holoCard({ label: 'Prism Flame holographic card back', bg: ['#2b0a05', '#0a0201'], seed: 104,
      motif: () => {
        let embers = '';
        for (let i = 0; i < 24; i++) embers += `<circle cx="${f(r() * 100)}" cy="${f(r() * 140)}" r="${f(0.4 + r() * 0.9)}" fill="#fbbf24" opacity="${f(0.3 + r() * 0.6)}"/>`;
        let d = '';
        for (let x = -6; x <= 106; x += 12) d += flame(x, 142, 16, 30 + ((x + 6) % 24) * 0.8);
        return `${embers}<path d="${d}" fill="#7f1d1d" opacity=".8"/>`;
      },
      emblem: (rb) => `<path d="${flame(50, 102, 42, 66)}" fill="url(#${rb})" stroke="#fff" stroke-width="1.2"/><path d="${flame(50, 102, 26, 44)}" fill="#fff" opacity=".3"/>` +
        `<path d="${flame(50, 102, 16, 28)}" fill="url(#${rb})"/><path d="${flame(36, 102, 12, 22)}" fill="url(#${rb})" opacity=".85"/><path d="${flame(64, 102, 12, 22)}" fill="url(#${rb})" opacity=".85"/>` });
  },
  'holo-galaxy': () => {
    const r = rnd(105), nb = nextId('nb');
    return holoCard({ label: 'Stardust Prism holographic card back', bg: ['#1e1b4b', '#05031a'], seed: 105,
      defs: rad(nb, [[0, '#a78bfa', 0.55], [1, '#a78bfa', 0]]),
      motif: () => {
        let stars = '';
        for (let i = 0; i < 70; i++) stars += `<circle cx="${f(r() * 100)}" cy="${f(r() * 140)}" r="${f(0.25 + r() * 0.8)}" fill="#fff" opacity="${f(0.3 + r() * 0.7)}"/>`;
        return `<circle cx="50" cy="66" r="48" fill="url(#${nb})"/>${stars}`;
      },
      emblem: (rb) => `<ellipse cx="50" cy="66" rx="34" ry="9" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1" transform="rotate(-20 50 66)"/>` +
        `<path d="${starPath(50, 66, 30, 7, 8)}" fill="url(#${rb})" stroke="#fff" stroke-width=".8"/><path d="${starPath(50, 66, 14, 3.5, 4, 45)}" fill="#fff" opacity=".85"/>` +
        `<circle cx="78" cy="40" r="4" fill="url(#${rb})"/><circle cx="76.8" cy="38.8" r="1.2" fill="#fff" opacity=".8"/>` });
  },
  'holo-halloween': () => {
    const bl = nextId('bl');
    return holoCard({ label: 'Spectral Pumpkin holographic card back', bg: ['#2e1065', '#0a0412'], seed: 106, defs: blur(bl, 2.5),
      motif: () => `<circle cx="72" cy="30" r="13" fill="#fde68a" opacity=".85"/>${bat(30, 30, 1, '#0a0412')}${bat(52, 22, 0.7, '#0a0412')}${bat(84, 56, 0.6, '#0a0412')}` +
        `<path d="M0 118Q25 108 50 116T100 112V140H0Z" fill="#0a0412"/>`,
      emblem: (rb) => `<circle cx="50" cy="80" r="26" fill="#f97316" opacity=".3" filter="url(#${bl})"/>${pumpkin(50, 80, 2.3, rb)}` });
  },
  'holo-thanksgiving': () => {
    const r = rnd(107);
    return holoCard({ label: 'Golden Harvest holographic card back', bg: ['#7c2d12', '#2a0d03'], seed: 107,
      motif: () => {
        let leaves = '';
        for (let i = 0; i < 14; i++) leaves += `<g transform="translate(${f(r() * 100)} ${f(r() * 140)}) rotate(${f(r() * 360)})"><path d="${maple(3 + r() * 3)}" fill="#f59e0b" opacity=".35"/></g>`;
        return `${leaves}${wheat(16, 128, 34, '#fbbf24', -10)}${wheat(84, 128, 34, '#fbbf24', 10)}`;
      },
      emblem: (rb) => `<g transform="translate(50 70) rotate(-10)"><path d="${maple(30)}" fill="url(#${rb})" stroke="#fff" stroke-width="1" stroke-linejoin="round"/>` +
        `<path d="M0 26V-26M0 -4L-18 -10M0 -4L18 -10M0 6L-12 12M0 6L12 12" stroke="#fff" stroke-opacity=".75" stroke-width=".9" fill="none"/></g>` });
  },
  'holo-christmas': () => {
    const r = rnd(108), bl = nextId('bl'), au = [nextId('au'), nextId('au'), nextId('au')];
    return holoCard({ label: 'Aurora Star holographic card back', bg: ['#052e16', '#020617'], seed: 108,
      defs: blur(bl, 3) + lin(au[0], ['#22c55e', '#2dd4bf']) + lin(au[1], ['#22d3ee', '#818cf8']) + lin(au[2], ['#a855f7', '#22c55e']),
      motif: () => {
        let snow = '';
        for (let i = 0; i < 30; i++) snow += `<circle cx="${f(r() * 100)}" cy="${f(r() * 140)}" r="${f(0.4 + r() * 0.8)}" fill="#fff" opacity="${f(0.4 + r() * 0.5)}"/>`;
        const band = (y: number, h: number, g: string, ph: number) => `<path d="M0 ${y}${waveD(0, 100, y, 6, 60, ph).replace(/^M/, 'L')}L100 ${y + h}L0 ${y + h}Z" fill="url(#${g})" opacity=".45" filter="url(#${bl})"/>`;
        const pine = (x: number, by: number, s: number) => `<path transform="translate(${x} ${by}) scale(${s})" d="M0 -22L6 -12H3L8 -4H4L10 4H-10L-4 -4H-8L-3 -12H-6Z" fill="#021a0c"/>`;
        return `${band(18, 16, au[0], 0)}${band(30, 14, au[1], 1.6)}${band(42, 12, au[2], 3)}${snow}${pine(14, 132, 1.2)}${pine(86, 130, 1.4)}${pine(28, 134, 0.8)}`;
      },
      emblem: (rb) => `<path d="${starPath(50, 70, 27, 7.5, 8)}" fill="url(#${rb})" stroke="#fff" stroke-width=".9"/><path d="${starPath(50, 70, 13, 3, 4)}" fill="#fff" opacity=".9"/>` +
        `<circle cx="50" cy="70" r="2.4" fill="#fff"/>` });
  },
  // One holographic chip per box, like the holographic cards, each with its own style.
  'holo-chip-neon': () => holoChip('Prism Volt', ['#1a0533', '#05010d'], 201, { foil: ['#ff3fd2', '#2ef2ff', '#8b5cf6'], edge: 'bar', ring: '#2ef2ff', inlay: '#05010d' }, (rb) =>
    `<path d="M54 29L39 53H48.5L44.5 71L61 45.5H51.5Z" fill="url(#${rb})" stroke="#fff" stroke-width=".8" stroke-linejoin="round"/>`),
  'holo-chip-royal': () => holoChip('Prism Crown', ['#e0b23a', '#7a5310'], 202, { foil: ['#fff3c4', '#f5c6a5', '#e9d5ff', '#f8e08e'], edge: 'diamond', ring: '#fff3c4', inlay: '#3b0a1f' }, (rb) =>
    `${crown(50, 51, 1.05, `url(#${rb})`, '#ffffff')}${spark(33, 36, 1.6, '#fff3c4')}${spark(67, 36, 1.6, '#fff3c4')}`),
  'holo-chip-ocean': () => holoChip('Opal Pearl', ['#e0f2fe', '#c7d2fe'], 203, { foil: ['#a5f3fc', '#fbcfe8', '#bbf7d0', '#ddd6fe', '#fde68a'], edge: 'dot', ring: '#0e7490', ringDash: '1.5 2', inlay: '#ecfeff', ink: '#0e7490' }, (rb, ink) =>
    `${shell(50, 50, 1.85, `url(#${rb})`, ink)}<circle cx="50" cy="54" r="4.4" fill="#fff" stroke="${ink}" stroke-width=".5"/><circle cx="48.7" cy="52.7" r="1.4" fill="url(#${rb})"/>`),
  'holo-chip-inferno': () => holoChip('Prism Ember', ['#991b1b', '#1c0703'], 204, { foil: ['#ef4444', '#f97316', '#fde047', '#fb7185'], edge: 'drop', ring: '#fde047', inlay: '#1c0703' }, (rb) =>
    `<path d="${flame(41, 68, 10, 20)}" fill="url(#${rb})" stroke="#fff" stroke-width=".5"/><path d="${flame(59, 68, 10, 20)}" fill="url(#${rb})" stroke="#fff" stroke-width=".5"/>` +
    `<path d="${flame(50, 68, 22, 35)}" fill="url(#${rb})" stroke="#fff" stroke-width=".7"/><path d="${flame(50, 68, 15, 26)}" fill="#1c0703" opacity=".35"/>` +
    `<path d="${flame(50, 68, 11, 19)}" fill="url(#${rb})"/><path d="${flame(50, 68, 5, 10)}" fill="#fff" opacity=".9"/>`),
  'holo-chip-galaxy': () => holoChip('Prism Nova', ['#312e81', '#0b0726'], 205, { foil: ['#a78bfa', '#60a5fa', '#f472b6', '#e0e7ff'], edge: 'star', ring: '#c4b5fd', ringDash: '1 2', inlay: '#0b0726' }, (rb) =>
    `<ellipse cx="50" cy="50" rx="25" ry="7" fill="none" stroke="url(#${rb})" stroke-width="1" transform="rotate(-20 50 50)"/><path d="${starPath(50, 50, 21, 5, 8)}" fill="url(#${rb})" stroke="#fff" stroke-width=".6"/>` +
    `<path d="${starPath(50, 50, 8, 2.4, 4, 45)}" fill="#fff"/>${spark(34, 36, 1.4)}${spark(66, 64, 1.2)}`),
  'holo-chip-halloween': () => {
    const mk = nextId('mk');
    return holoChip('Spectral Bat', ['#292524', '#0c0a09'], 206, { foil: ['#fb923c', '#a855f7', '#84cc16'], edge: 'arch', ring: '#fb923c', ringDash: '4 3', inlay: '#0c0a09' }, (rb) =>
      `<mask id="${mk}"><circle cx="58" cy="39" r="9" fill="#fff"/><circle cx="62" cy="36" r="7.6" fill="#000"/></mask><circle cx="58" cy="39" r="9" fill="url(#${rb})" mask="url(#${mk})"/>${bat(47, 55, 1.65, `url(#${rb})`)}`);
  },
  'holo-chip-thanksgiving': () => holoChip('Prism Leaf', ['#d97706', '#78350f'], 207, { foil: ['#fde68a', '#f59e0b', '#ea580c', '#dc2626'], edge: 'leaf', ring: '#7c2d12', inlay: '#fef3c7', ink: '#7c2d12' }, (rb, ink) =>
    `<g transform="translate(50 49) rotate(-10)"><path d="${maple(21)}" fill="url(#${rb})" stroke="${ink}" stroke-width=".7" stroke-linejoin="round"/><path d="M0 8V-16M0 -2L-12 -6M0 -2L12 -6M0 3L-8 7M0 3L8 7" stroke="${ink}" stroke-opacity=".8" stroke-width=".6" fill="none"/></g>`),
  'holo-chip-christmas': () => holoChip('Aurora Flake', ['#15803d', '#052e16'], 208, { foil: ['#4ade80', '#22d3ee', '#a78bfa', '#f0abfc'], edge: 'flake', ring: '#f8fafc', ringDash: '5 3', inlay: '#7f1d1d' }, (rb) =>
    `${snowflake(50, 50, 17, `url(#${rb})`, 2.6)}<circle cx="50" cy="50" r="2.6" fill="#fff"/>`),
  'holo-chip-spring': () => holoChip('Prism Petal', ['#fbcfe8', '#ec4899'], 209, { foil: ['#fbcfe8', '#e9d5ff', '#bbf7d0', '#fef9c3'], edge: 'petal', ring: '#be185d', inlay: '#fdf2f8', ink: '#be185d' }, (rb, ink) =>
    blossom(50, 50, 3.3, `url(#${rb})`, 0, ink)),
  'holo-chip-summer': () => holoChip('Prism Sun', ['#fbbf24', '#ea580c'], 210, { foil: ['#fde047', '#fb923c', '#22d3ee', '#f472b6'], edge: 'ray', ring: '#fff7ed', inlay: '#0c4a6e' }, (rb) =>
    `${sunRays(50, 50, 10, 12, `url(#${rb})`)}<circle cx="50" cy="50" r="10" fill="url(#${rb})" stroke="#fff" stroke-width=".8"/><circle cx="46.6" cy="46.6" r="3.4" fill="#fff" opacity=".4"/>`),
  'holo-chip-autumn': () => holoChip('Prism Acorn', ['#9a3412', '#2a0d03'], 211, { foil: ['#c2410c', '#f59e0b', '#fde68a', '#a16207'], edge: 'oval', ring: '#fde68a', ringDash: '2 2', inlay: '#1c0a04' }, (rb) =>
    acornBig(50, 47, 1.45, `url(#${rb})`, '#fde68a', -15)),
  'holo-chip-winter': () => holoChip('Prism Glacier', ['#e0f2fe', '#7dd3fc'], 212, { foil: ['#e0f2fe', '#a5f3fc', '#c7d2fe', '#f0f9ff'], edge: 'hex', ring: '#0369a1', inlay: '#0c4a6e' }, (rb) =>
    `${crystal(50, 50, 21, `url(#${rb})`, 1.9)}<circle cx="50" cy="50" r="2.2" fill="#fff"/>`),
  // ---------- Spring ----------
  'spring-blossom': () => {
    const r = rnd(301), cl = nextId('cl'), hl = nextId('hl'), hl2 = nextId('hl');
    let petals = '';
    for (let i = 0; i < 24; i++) petals += petal(8 + r() * 84, 12 + r() * 116, 0.55 + r() * 0.5, r() > 0.5 ? '#f9a8d4' : '#fbcfe8', r() * 360);
    let grass = '';
    for (let x = 1; x < 100; x += 2.2) grass += `M${f(x)} ${f(121 - Math.sin(x / 11) * 2.4)}l${f(-0.6 + r() * 1.2)} ${f(-1.6 - r() * 2)}`;
    const limb = 'M-2 33C18 35 30 47 44 53C58 59 70 57 84 69C90 74 95 82 102 88';
    const twigs = 'M29 45C31 37 37 31 46 29M56 58C60 49 68 45 77 45M70 61C68 71 70 79 76 87M44 53C42 61 44 69 50 75M14 34C16 28 20 24 25 22';
    const flowers: [number, number, number, number, string][] = [[25, 22, 0.95, 10, '#fbcfe8'], [33, 30, 0.9, 40, '#f9a8d4'], [44, 29, 1.15, -20, '#fce7f3'], [50, 22, 0.75, 0, '#f9a8d4'],
      [36, 44, 0.9, 30, '#fce7f3'], [53, 49, 1.2, 15, '#fbcfe8'], [64, 48, 1, -10, '#f9a8d4'], [76, 44, 1.1, 20, '#fce7f3'], [82, 54, 0.85, 5, '#fbcfe8'],
      [87, 65, 1, -15, '#f9a8d4'], [71, 73, 1.1, 25, '#fbcfe8'], [77, 87, 0.95, 0, '#fce7f3'], [49, 74, 1, -30, '#f9a8d4'], [57, 63, 0.8, 12, '#fce7f3'], [94, 79, 0.85, 40, '#fbcfe8'], [16, 33, 0.8, 22, '#f9a8d4']];
    return card({ label: 'Cherry Blossom card back', bg: ['#93c5fd', '#fbcfe8'], edge: '#ec4899', frame: '#db2777', hair: '#be185d',
      defs: clouds(cl, '#ffffff', '.02 .06', 31, 2.4, 0.9) + lin(hl, ['#bbf7d0', '#86efac']) + lin(hl2, ['#86efac', '#4ade80']),
      inner: `<rect x="0" y="0" width="100" height="80" filter="url(#${cl})" opacity=".55"/><circle cx="78" cy="24" r="10" fill="#fff7ed" opacity=".7"/><circle cx="78" cy="24" r="14" fill="#fff7ed" opacity=".25"/>` +
        `<path d="M0 108Q22 96 46 104T100 98V140H0Z" fill="url(#${hl})"/><path d="M0 104Q22 92 46 100T100 94" stroke="#4ade80" stroke-opacity=".5" stroke-width=".4" fill="none"/>` +
        `<path d="M0 122Q30 112 60 120T100 116V140H0Z" fill="url(#${hl2})"/><path d="${grass}" stroke="#15803d" stroke-opacity=".6" stroke-width=".35"/>${petals}`,
      corner: (x, y, rot) => blossom(x, y, 0.42, '#f9a8d4', rot),
      over: `<path d="${limb}" stroke="#3f2a1d" stroke-width="3.6" fill="none" stroke-linecap="round"/><path d="${twigs}" stroke="#3f2a1d" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
        `<path d="${limb}" stroke="#1c120c" stroke-width="3.2" stroke-dasharray=".5 2.4" fill="none" stroke-opacity=".6"/><path d="${limb}" transform="translate(-.4 -.9)" stroke="#a16207" stroke-opacity=".45" stroke-width=".7" fill="none"/>` +
        `${bud(58, 44, 1, '#f472b6', -10)}${bud(24, 45, 1, '#f472b6', 200)}${bud(66, 81, 1, '#f472b6', 160)}${bud(40, 63, 1, '#f472b6', 190)}${bud(90, 60, 1, '#f472b6', 30)}` +
        flowers.map(([x, y, s, rot, c]) => blossom(x, y, s, c, rot)).join('') });
  },
  'spring-showers': () => {
    const r = rnd(311), cl = nextId('cl'), cl2 = nextId('cl'), gr = nextId('gr'), um = nextId('um'), pd = nextId('pd');
    let rain = '';
    for (let i = 0; i < 70; i++) {
      const x = r() * 110 - 5, y = r() * 118, l = 3 + r() * 3;
      rain += `M${f(x)} ${f(y)}l${f(-l * 0.3)} ${f(l)}`;
    }
    let grass = '';
    for (let x = 1; x < 100; x += 1.8) grass += `M${f(x)} ${f(123 - Math.sin(x / 9) * 2)}l${f(-0.8 + r() * 1.6)} ${f(-2 - r() * 3)}`;
    return card({ label: 'Spring Showers card back', bg: ['#cbd5e1', '#93c5fd'], edge: '#3b82f6', frame: '#2563eb', hair: '#1e40af',
      defs: clouds(cl, '#64748b', '.025 .06', 41, 2.6, 0.95) + clouds(cl2, '#f1f5f9', '.03 .07', 43, 2.2, 0.9) + lin(gr, ['#4ade80', '#15803d']) + rad(pd, [[0, '#93c5fd'], [1, '#3b82f6']]),
      inner: `<rect x="0" y="0" width="100" height="56" filter="url(#${cl})" opacity=".9"/><rect x="0" y="0" width="100" height="40" filter="url(#${cl2})" opacity=".6"/>` +
        `<path d="${rain}" stroke="#eff6ff" stroke-opacity=".7" stroke-width=".4" stroke-linecap="round"/>` +
        `<path d="M0 116Q50 108 100 116V140H0Z" fill="url(#${gr})"/><path d="${grass}" stroke="#14532d" stroke-opacity=".7" stroke-width=".35"/>` +
        `<ellipse cx="52" cy="124" rx="24" ry="4.6" fill="url(#${pd})"/><ellipse cx="52" cy="124" rx="24" ry="4.6" fill="none" stroke="#1e3a8a" stroke-opacity=".4" stroke-width=".4"/>` +
        `<ellipse cx="46" cy="123.6" rx="5" ry="1.1" fill="none" stroke="#eff6ff" stroke-opacity=".8" stroke-width=".3"/><ellipse cx="46" cy="123.6" rx="8" ry="1.8" fill="none" stroke="#eff6ff" stroke-opacity=".45" stroke-width=".3"/>` +
        `<ellipse cx="60" cy="125" rx="3.4" ry=".8" fill="none" stroke="#eff6ff" stroke-opacity=".8" stroke-width=".3"/><ellipse cx="60" cy="125" rx="6" ry="1.4" fill="none" stroke="#eff6ff" stroke-opacity=".45" stroke-width=".3"/>` +
        `${tulip(13, 127, 18, '#ef4444', '#991b1b')}${tulip(22, 129, 14, '#facc15', '#a16207')}${tulip(30, 130, 11, '#f472b6', '#9d174d')}${tulip(76, 130, 12, '#a855f7', '#6b21a8')}${tulip(84, 128, 16, '#ef4444', '#991b1b')}${tulip(92, 129, 13, '#facc15', '#a16207')}`,
      corner: (x, y) => raindrop(x, y, 0.9, '#2563eb'),
      over: `${umbrella(50, 66, 1.35, '#f472b6', '#fde047', um)}` +
        `${raindrop(26, 38, 0.8, '#bfdbfe')}${raindrop(74, 36, 0.7, '#bfdbfe')}${raindrop(50, 30, 0.6, '#bfdbfe')}` });
  },
  sakura: () => {
    const pal = (hi: string, lo: string, petalC: string) => ({ hi, lo, petalC, num: lo, numStroke: '#fdf2f8' });
    return chipSet('Sakura', pal('#f472b6', '#be185d', '#f9a8d4'),
      { 5: pal('#ef4444', '#991b1b', '#fecaca'), 10: pal('#3b82f6', '#1e3a8a', '#bfdbfe'), 25: pal('#22c55e', '#166534', '#bbf7d0'), 50: pal('#a855f7', '#6b21a8', '#e9d5ff'), 100: pal('#eab308', '#854d0e', '#fef08a') },
      (p) => ({ main: [p.hi, p.lo], spot: ['#fdf2f8', p.petalC], ring: '#fdf2f8', ringDash: '3 2', inlay: '#fdf2f8', inlayStroke: p.lo, tick: '#fdf2f8',
        emblem: blossom(50, 50, 3.3, p.petalC, 0, p.lo) }));
  },
  butterfly: () => {
    const pal = (hi: string, lo: string, inlay: string, up: string, low: string) => ({ hi, lo, inlay, up, low, num: '#fefce8', numStroke: inlay });
    return chipSet('Butterfly', pal('#a3e635', '#4d7c0f', '#1a2e05', '#f97316', '#fb923c'),
      { 5: pal('#ef4444', '#7f1d1d', '#2a0808', '#fca5a5', '#f87171'), 10: pal('#3b82f6', '#1e3a8a', '#0b1430', '#93c5fd', '#60a5fa'),
        25: pal('#22c55e', '#14532d', '#052e16', '#86efac', '#4ade80'), 50: pal('#a855f7', '#581c87', '#1e0b33', '#d8b4fe', '#c084fc'),
        100: pal('#eab308', '#713f12', '#1f1503', '#fde68a', '#facc15') },
      (p) => ({ main: [p.hi, p.lo], spot: ['#fefce8', p.up], ring: '#fefce8', ringDash: '2 2', inlay: p.inlay, inlayStroke: '#d9f99d', tick: '#fefce8', text: '#fefce8',
        emblem: butterfly(50, 50, 1.75, p.up, p.low) }));
  },
  'blossom-branch': () => {
    const r = rnd(321);
    const arc = `${arcD(60, 60, 48, 200, 360)}${arcD(60, 60, 48, 0, 160).replace(/^M/, 'L')}`;
    let flowers = '', twigs = '', buds = '';
    for (let a = 206; a <= 514; a += 22) {
      const [x, y] = pol(60, 60, 48 + (r() - 0.5) * 4, a);
      flowers += blossom(x, y, 0.8 + r() * 0.35, r() > 0.5 ? '#fbcfe8' : '#f9a8d4', r() * 72);
    }
    for (let a = 216; a <= 504; a += 44) {
      const [x0, y0] = pol(60, 60, 48, a), [x1, y1] = pol(60, 60, 55, a + 8);
      twigs += `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`;
      buds += bud(x1, y1, 0.8, '#f472b6', a + 8);
    }
    let petals = '';
    for (let i = 0; i < 6; i++) {
      const [x, y] = pol(60, 60, 52 + r() * 6, 155 + r() * 50);
      petals += petal(x, y, 0.6, '#f9a8d4', r() * 360);
    }
    return outline({ label: 'Blossom Branch profile outline',
      over: `<circle cx="60" cy="60" r="44.5" fill="none" stroke="#f9a8d4" stroke-width="1.4"/><path d="${arc}" stroke="#3f2a1d" stroke-width="3" fill="none" stroke-linecap="round"/>` +
        `<path d="${arc}" stroke="#1c120c" stroke-width="2.6" stroke-dasharray=".5 2.4" fill="none" stroke-opacity=".6"/><path d="${twigs}" stroke="#3f2a1d" stroke-width="1.2" stroke-linecap="round"/>${buds}${flowers}${petals}` });
  },
  'daisy-chain': () => {
    let daisies = '', leaves = '';
    for (let i = 0; i < 10; i++) {
      const [x, y] = pol(60, 60, 47, i * 36);
      daisies += daisy(x, y, 0.82, i * 17);
      const [lx, ly] = pol(60, 60, 47, i * 36 + 18);
      leaves += `<g transform="${at(lx, ly, 1, i * 36 + 18 + 90)}"><path d="M-6 0Q0 -3.4 6 0Q0 3.4 -6 0Z" fill="#22c55e"/><path d="M-5.4 0H5.4" stroke="#14532d" stroke-width=".35"/></g>`;
    }
    return outline({ label: 'Daisy Chain profile outline',
      over: `<circle cx="60" cy="60" r="47" fill="none" stroke="#16a34a" stroke-width="1.8"/>${leaves}${daisies}` });
  },
  'holo-spring': () => {
    const r = rnd(331);
    return holoCard({ label: 'Prism Bloom holographic card back', bg: ['#4a044e', '#1e1b4b'], seed: 331,
      motif: () => {
        let petals = '';
        for (let i = 0; i < 26; i++) petals += petal(r() * 100, r() * 140, 0.6 + r() * 0.6, '#f9a8d4', r() * 360);
        return `<g opacity=".55">${petals}</g><path d="M0 112Q30 100 60 108T100 104V140H0Z" fill="#831843" opacity=".6"/>`;
      },
      emblem: (rb) => `<path d="M4 98C24 92 30 80 40 74" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>${blossom(50, 66, 4, `url(#${rb})`, 0, '#ffffff')}` +
        `${blossom(26, 88, 1.4, `url(#${rb})`, 30, '#ffffff')}${blossom(76, 42, 1.2, `url(#${rb})`, -20, '#ffffff')}` });
  },

  // ---------- Summer ----------
  'summer-sunset': () => {
    const r = rnd(341), sky = nextId('sk'), sea = nextId('se'), sn = nextId('sn'), bl = nextId('bl');
    let streaks = '', ripples2 = '';
    for (let k = 0; k < 14; k++) {
      const y = 90 + k * 2.6, w = 22 - k * 1.2 + r() * 3;
      streaks += `<path d="M${f(50 - w / 2)} ${f(y)}H${f(50 + w / 2)}" stroke="#fdba74" stroke-opacity="${f(0.75 - k * 0.04)}" stroke-width="${f(0.9 - k * 0.04)}" stroke-linecap="round" stroke-dasharray="${f(2 + r() * 3)} ${f(0.8 + r())}"/>`;
    }
    for (let k = 0; k < 8; k++) ripples2 += `<path d="${waveD(0, 100, 94 + k * 5.4, 0.6, 7 + k, k)}" stroke="#fda4af" stroke-opacity=".22" stroke-width=".3" fill="none"/>`;
    const birds = [[30, 40, 1], [38, 34, 0.7], [70, 30, 0.8]].map(([x, y, s]) => `<path transform="${at(x, y, s)}" d="M-4 0Q-2 -2 0 0Q2 -2 4 0" stroke="#3b0764" stroke-width=".8" fill="none"/>`).join('');
    return card({ label: 'Sunset Palms card back', bg: ['#7c2d12', '#1e1b4b'], edge: '#fb923c', frame: '#f97316',
      defs: lin(sky, ['#4c1d95', '#be185d', '#f97316', '#fde047']) + lin(sea, ['#9a3412', '#1e1b4b']) + rad(sn, [[0, '#fffbeb'], [0.6, '#fde047'], [1, '#fb923c']]) + blur(bl, 3),
      inner: `<rect x="0" y="0" width="100" height="90" fill="url(#${sky})"/><circle cx="50" cy="88" r="28" fill="#fde047" opacity=".35" filter="url(#${bl})"/><circle cx="50" cy="88" r="19" fill="url(#${sn})"/>` +
        `<path d="M10 64Q30 60 50 63T92 61" stroke="#fdba74" stroke-opacity=".5" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M4 52Q20 49 36 51" stroke="#f9a8d4" stroke-opacity=".45" stroke-width="1.2" fill="none" stroke-linecap="round"/>` +
        `${birds}<path d="M0 89Q8 84 14 86Q20 82 26 88Z" fill="#2e1065"/><rect x="0" y="89" width="100" height="51" fill="url(#${sea})"/>${streaks}${ripples2}<path d="M0 89H100" stroke="#fde68a" stroke-opacity=".6" stroke-width=".4"/>`,
      corner: (x, y) => `${sunRays(x, y, 1.6, 8, '#fdba74')}<circle cx="${x}" cy="${y}" r="1.7" fill="#fde047"/>`,
      over: `${palm(20, 134, 70, 12, '#1c0a1e', '#24102a', '#4a1d4a')}${palm(84, 136, 54, -10, '#1c0a1e', '#24102a', '#4a1d4a')}` });
  },
  'beach-day': () => {
    const sky = nextId('sk'), sea = nextId('se'), sand = nextId('sd'), um = nextId('um'), bb = nextId('bb'), cl = nextId('cl');
    let prints = '';
    [[20, 132, -15], [24, 126, 10], [28, 120, -12], [33, 114, 12], [37, 108, -10]].forEach(([x, y, rot]) => {
      prints += `<g transform="${at(x, y, 1, rot)}"><ellipse rx="1.2" ry="2" fill="#d97706" opacity=".45"/><circle cx="-.6" cy="-2.6" r=".35" fill="#d97706" opacity=".45"/><circle cx=".2" cy="-2.8" r=".35" fill="#d97706" opacity=".45"/><circle cx=".9" cy="-2.5" r=".3" fill="#d97706" opacity=".45"/></g>`;
    });
    return card({ label: 'Beach Day card back', bg: ['#7dd3fc', '#0284c7'], edge: '#0ea5e9', frame: '#0284c7', hair: '#075985',
      defs: lin(sky, ['#38bdf8', '#bae6fd']) + lin(sea, ['#0ea5e9', '#0369a1']) + lin(sand, ['#fde68a', '#f59e0b']) + clouds(cl, '#ffffff', '.03 .08', 51, 2.4, 0.95),
      inner: `<rect x="0" y="0" width="100" height="72" fill="url(#${sky})"/><rect x="0" y="0" width="100" height="44" filter="url(#${cl})" opacity=".85"/>` +
        `${sunRays(78, 22, 7, 12, '#fde047')}<circle cx="78" cy="22" r="7" fill="#fef08a"/><circle cx="76" cy="20" r="3" fill="#fff" opacity=".5"/>` +
        `<rect x="0" y="70" width="100" height="26" fill="url(#${sea})"/>${ripples(76, 0.6, 9, 0, 4, 4.4, '#e0f2fe', 0.6)}<path d="M0 70H100" stroke="#e0f2fe" stroke-opacity=".7" stroke-width=".5"/>` +
        `<path d="M0 94Q12 90 25 93T50 92T75 93T100 91V140H0Z" fill="url(#${sand})"/><path d="M0 94Q12 90 25 93T50 92T75 93T100 91" stroke="#fff" stroke-width="1.4" fill="none" stroke-opacity=".85"/>` +
        `${ripples(104, 0.8, 14, 0.5, 6, 5.4, '#b45309', 0.35)}${prints}${starfish(24, 118, 0.9, '#f97316', 20)}${shell(82, 126, 0.32, '#fef3c7', '#d6b98c')}${shell(14, 104, 0.24, '#fecaca', '#d6b98c')}`,
      corner: (x, y, rot) => starfish(x, y, 0.55, '#f97316', rot),
      over: `<g transform="rotate(-12 48 104)">${umbrella(48, 70, 1.25, '#ef4444', '#f8fafc', um, false)}</g>${beachBall(72, 114, 7, bb)}` +
        `<ellipse cx="58" cy="112.5" rx="16" ry="2.4" fill="#92400e" opacity=".25"/>` });
  },
  sunburst: () => {
    const sn = nextId('sn');
    const pal = (hi: string, lo: string, ray: string, disc: string) => ({ hi, lo, ray, disc, num: lo, numStroke: '#fff7ed' });
    return chipSet('Sunburst', pal('#facc15', '#ca8a04', '#f97316', '#fde047'),
      { 5: pal('#ef4444', '#991b1b', '#dc2626', '#fca5a5'), 10: pal('#3b82f6', '#1e3a8a', '#2563eb', '#93c5fd'), 25: pal('#22c55e', '#166534', '#16a34a', '#86efac'),
        50: pal('#f97316', '#c2410c', '#ea580c', '#fdba74'), 100: pal('#57534e', '#1c1917', '#ca8a04', '#fde047') },
      (p) => ({ main: [p.hi, p.lo], spot: ['#fff7ed', p.ray], ring: '#fff7ed', inlay: '#fff7ed', inlayStroke: p.lo, tick: '#fff7ed',
        defs: rad(sn, [[0, '#ffffff'], [0.5, p.disc], [1, p.ray]], 0.4, 0.4, 0.7),
        emblem: `${sunRays(50, 50, 11, 12, p.ray)}<circle cx="50" cy="50" r="11" fill="url(#${sn})"/><circle cx="50" cy="50" r="11" fill="none" stroke="${p.lo}" stroke-opacity=".4" stroke-width=".5"/>` }));
  },
  watermelon: () => {
    const pal = (hi: string, lo: string) => ({ hi, lo, num: lo, numStroke: '#fef2f2' });
    return chipSet('Watermelon', pal('#22c55e', '#15803d'),
      { 5: pal('#ef4444', '#991b1b'), 10: pal('#3b82f6', '#1e3a8a'), 25: pal('#22c55e', '#15803d'), 50: pal('#f97316', '#c2410c'), 100: pal('#3f3f46', '#18181b') },
      (p) => ({ main: [p.hi, p.lo], spot: ['#fef2f2', '#ef4444'], ring: '#fecaca', ringDash: '2 2.4', inlay: '#fef2f2', inlayStroke: p.lo, tick: '#fef2f2',
        emblem: melon(50, 42, 1.3, 0) }));
  },
  'sun-ring': () => {
    const gd = nextId('gd'), gl = nextId('gl');
    let rays = '';
    for (let i = 0; i < 24; i++) {
      const a = i * 15, len = i % 2 ? 52.5 : 57;
      const [x1, y1] = pol(60, 60, 46, a - 4.5), [x2, y2] = pol(60, 60, len, a), [x3, y3] = pol(60, 60, 46, a + 4.5);
      rays += `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}L${f(x3)} ${f(y3)}Z`;
    }
    return outline({ label: 'Sun Ring profile outline', defs: lin(gd, ['#fde047', '#f97316'], 1, 1) + glow(gl, 1.4),
      over: `<g filter="url(#${gl})"><path d="${rays}" fill="url(#${gd})"/></g><path d="${rays}" fill="none" stroke="#c2410c" stroke-opacity=".5" stroke-width=".4"/>` +
        `<circle cx="60" cy="60" r="45" fill="none" stroke="url(#${gd})" stroke-width="4"/><circle cx="60" cy="60" r="42.6" fill="none" stroke="#c2410c" stroke-width=".6"/><circle cx="60" cy="60" r="47.2" fill="none" stroke="#fef9c3" stroke-opacity=".8" stroke-width=".5"/>` });
  },
  'tropical-fronds': () => {
    let leaves = '';
    for (let i = 0; i < 14; i++) {
      const a = i * (360 / 14), [x, y] = pol(60, 60, 47, a);
      let veins = '';
      for (let k = -8; k <= 8; k += 2.6) veins += `M0 ${f(k)}L${f(-3.6 + Math.abs(k) * 0.25)} ${f(k - 2)}M0 ${f(k)}L${f(3.6 - Math.abs(k) * 0.25)} ${f(k - 2)}`;
      leaves += `<g transform="${at(x, y, 1, a + 90 + (i % 2 ? 14 : -14))}"><path d="M0 -11Q6 -4 0 11Q-6 -4 0 -11Z" fill="${i % 2 ? '#16a34a' : '#22c55e'}"/><path d="M0 -10V10" stroke="#14532d" stroke-width=".5"/><path d="${veins}" stroke="#14532d" stroke-opacity=".5" stroke-width=".3"/></g>`;
    }
    return outline({ label: 'Tropical Fronds profile outline',
      over: `<circle cx="60" cy="60" r="44.6" fill="none" stroke="#15803d" stroke-width="2"/>${leaves}${hibiscus(22, 26, 0.85, '#f43f5e', '#9f1239', 20)}${hibiscus(98, 96, 0.75, '#fb923c', '#c2410c', -30)}${hibiscus(102, 28, 0.55, '#f472b6', '#9d174d', 10)}` });
  },
  'holo-summer': () => holoCard({ label: 'Prism Sunset holographic card back', bg: ['#3b0764', '#0c0a1e'], seed: 361,
    motif: () => `<path d="M0 96H100V140H0Z" fill="#1e1b4b" opacity=".7"/>${ripples(100, 0.6, 9, 0, 6, 5, '#c4b5fd', 0.4)}${palm(14, 136, 56, 9, '#0c0a1e', '#160f2e', '#3b2a6b')}${palm(88, 138, 44, -8, '#0c0a1e', '#160f2e', '#3b2a6b')}`,
    emblem: (rb) => `${sunRays(50, 64, 17, 14, `url(#${rb})`)}<circle cx="50" cy="64" r="17" fill="url(#${rb})" stroke="#fff" stroke-width="1"/><circle cx="44" cy="58" r="6" fill="#fff" opacity=".35"/>` }),
  // ---------- Autumn ----------
  'maple-grove': () => {
    const r = rnd(401), sky = nextId('sk'), gd = nextId('gd'), bk = nextId('bk'), tc = nextId('tc');
    const tones = ['#9a3412', '#dc2626', '#ea580c', '#f59e0b', '#fbbf24'];
    // Each clump of leaves is flat in the middle and shaded at its lower right edge.
    const lit = [['#9a3412', '#5a1d08'], ['#dc2626', '#7f1d1d'], ['#ea580c', '#9a3412'], ['#f59e0b', '#b45309'], ['#fbbf24', '#d97706']].map((c) => {
      const id = nextId('lt');
      return { id, def: rad(id, [[0, c[0]], [0.72, c[0]], [1, c[1]]], 0.4, 0.36, 0.68) };
    });
    let far = '';
    for (let x = -4; x < 104; x += 6 + r() * 3) {
      const h = 8 + r() * 6, c = ['#fdba74', '#fb923c', '#f59e0b', '#ea580c'][Math.floor(r() * 4)];
      far += `<path d="M${f(x)} 94V${f(94 - h * 0.4)}" stroke="#78350f" stroke-width=".6"/><ellipse cx="${f(x)}" cy="${f(94 - h * 0.62)}" rx="${f(h * 0.42)}" ry="${f(h * 0.5)}" fill="${c}" opacity=".7"/>`;
    }
    let canopy = '', leafTex = '', falling = '', ground = '';
    for (let layer = 0; layer < 5; layer++) for (let i = 0; i < 24; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r());
      canopy += `<circle cx="${f(50 + Math.cos(a) * d * 27)}" cy="${f(48 + Math.sin(a) * d * 20 - layer * 1.4)}" r="${f(3.8 + r() * 2.8 - layer * 0.3)}" fill="url(#${lit[layer].id})"/>`;
    }
    for (let i = 0; i < 80; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r());
      leafTex += `<g transform="${at(50 + Math.cos(a) * d * 29, 47 + Math.sin(a) * d * 22, 1, r() * 360)}"><path d="${maple(1.9)}" fill="${tones[Math.floor(r() * 5)]}" stroke="#7c2d12" stroke-opacity=".45" stroke-width=".15"/></g>`;
    }
    for (let i = 0; i < 12; i++) falling += `<g transform="${at(10 + r() * 80, 70 + r() * 40, 1, r() * 360)}"><path d="${maple(2.2)}" fill="${tones[1 + Math.floor(r() * 4)]}"/>${mapleVeins(2.2, '#7c2d12', 0.5)}</g>`;
    for (let i = 0; i < 30; i++) ground += `<g transform="${at(r() * 100, 112 + r() * 22, 1, r() * 360)}"><path d="${r() > 0.5 ? maple(1.8) : oakLeaf(1.8)}" fill="${tones[Math.floor(r() * 5)]}" opacity=".9"/></g>`;
    return card({ label: 'Maple Grove card back', bg: ['#fde68a', '#c2410c'], edge: '#ea580c', frame: '#c2410c', hair: '#7c2d12',
      defs: lin(sky, ['#fef3c7', '#fdba74']) + lin(gd, ['#a16207', '#713f12']) + lin(bk, ['#5b3a1e', '#3b2412'], 1, 0) + lit.map((l) => l.def).join('') + `<clipPath id="${tc}"><path d="M43 114C46 100 47 88 46 70L54 70C53 88 54 100 57 114Z"/></clipPath>`,
      inner: `<rect x="0" y="0" width="100" height="100" fill="url(#${sky})"/><circle cx="26" cy="30" r="16" fill="#fff7ed" opacity=".45"/>` +
        `<path d="M0 90Q25 84 50 88T100 86V100H0Z" fill="#d6a46a" opacity=".6"/>${far}` +
        `<path d="M0 100Q30 94 60 98T100 96V140H0Z" fill="url(#${gd})"/><path d="M50 140Q46 124 52 112Q56 104 50 98" stroke="#e7c9a0" stroke-width="7" fill="none" stroke-linecap="round" opacity=".7"/>` +
        `<path d="M50 140Q46 124 52 112Q56 104 50 98" stroke="#b08850" stroke-width="7" fill="none" stroke-dasharray=".4 1.6" opacity=".5"/>${ground}${falling}`,
      corner: (x, y, rot) => `<g transform="${at(x, y, 1, rot - 45)}"><path d="${maple(3.4)}" fill="#ea580c"/>${mapleVeins(3.4, '#7c2d12', 0.6)}</g>`,
      over: `<path d="M43 114C46 100 47 88 46 70L54 70C53 88 54 100 57 114Z" fill="url(#${bk})"/>` +
        `<g clip-path="url(#${tc})"><path d="M46.4 114C48.6 100 49.2 88 48.6 70M51.8 114C52.4 100 52.4 88 52 70M44.6 108l3 -1.4M52.6 100l2.4 -1M45.8 92l2.2 -.8M51 84l2.6 -1.2M47 78l1.8 -.8" stroke="#1c0f06" stroke-opacity=".55" stroke-width=".4" fill="none"/></g>` +
        `<path d="M41.6 114Q38 115 35 117M58 114Q61 115 65 117" stroke="#3b2412" stroke-width="1.6" stroke-linecap="round"/>` +
        `<path d="M47.4 78L35 58M52.6 76L66 56M49.6 72L49 50M45 66L30 50M55 66L72 52" stroke="#4a2c17" stroke-width="2" stroke-linecap="round"/>${canopy}${leafTex}` });
  },
  'night-owl': () => {
    const r = rnd(411), mn = nextId('mn'), mt = nextId('mt'), mc = nextId('mc'), bl = nextId('bl'), bk = nextId('bk');
    let stars = '';
    for (let i = 0; i < 40; i++) stars += `<circle cx="${f(r() * 100)}" cy="${f(r() * 100)}" r="${f(0.25 + r() * 0.6)}" fill="#fef3c7" opacity="${f(0.35 + r() * 0.6)}"/>`;
    let falling = '';
    for (let i = 0; i < 9; i++) falling += `<g transform="${at(8 + r() * 84, 16 + r() * 110, 1, r() * 360)}"><path d="${r() > 0.5 ? maple(2.4) : oakLeaf(2.4)}" fill="${['#ea580c', '#dc2626', '#f59e0b'][i % 3]}" opacity=".85"/></g>`;
    const branch = 'M-2 102C18 97 38 100 58 97C74 95 88 99 102 93';
    return card({ label: 'Night Owl card back', bg: ['#1e1b4b', '#0c0a1e'], edge: '#f59e0b', frame: '#d97706', hair: '#f59e0b',
      defs: rad(mn, [[0, '#fff7ed'], [0.55, '#fdba74'], [1, '#ea580c']], 0.4, 0.38, 0.75) + rough(mt, 0.3, 17, 2.2) + `<clipPath id="${mc}"><circle cx="50" cy="48" r="27"/></clipPath>` + blur(bl, 4) + lin(bk, ['#4a2c17', '#2a1a0e']),
      inner: `${stars}<circle cx="50" cy="48" r="34" fill="#fb923c" opacity=".3" filter="url(#${bl})"/><circle cx="50" cy="48" r="27" fill="url(#${mn})"/>` +
        `<g clip-path="url(#${mc})"><rect x="23" y="21" width="54" height="54" filter="url(#${mt})" opacity=".4" style="mix-blend-mode:multiply"/></g>` +
        `<circle cx="40" cy="38" r="4" fill="#c2410c" opacity=".25"/><circle cx="60" cy="56" r="5" fill="#c2410c" opacity=".2"/><circle cx="58" cy="34" r="2.4" fill="#c2410c" opacity=".25"/>` +
        `<path d="M14 44Q30 40 46 44T82 42" stroke="#1e1b4b" stroke-opacity=".6" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M28 62Q42 58 58 61T90 58" stroke="#1e1b4b" stroke-opacity=".5" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
        `<path d="M102 20Q90 26 84 38M92 24L96 14M88 31L80 28M86 34L90 44" stroke="#0c0a1e" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M-2 60Q8 64 14 74M4 63L2 54M9 67L16 64" stroke="#0c0a1e" stroke-width="1.4" fill="none" stroke-linecap="round"/>${falling}`,
      corner: (x, y, rot) => `<g transform="${at(x, y, 1, rot - 45)}"><path d="${oakLeaf(3.2)}" fill="#f59e0b"/>${oakVeins(3.2, '#78350f')}</g>`,
      over: `<path d="${branch}" stroke="url(#${bk})" stroke-width="4.4" fill="none" stroke-linecap="round"/><path d="${branch}" stroke="#120a04" stroke-width="4" stroke-dasharray=".5 2.4" fill="none" stroke-opacity=".6"/>` +
        `<path d="M74 95.6Q80 88 88 86" stroke="#3b2412" stroke-width="1.4" fill="none" stroke-linecap="round"/><g transform="${at(88, 86, 1, -30)}"><path d="${oakLeaf(4)}" fill="#ea580c"/>${oakVeins(4, '#7c2d12')}</g>` +
        `<g transform="${at(80, 89, 1, 40)}"><path d="${oakLeaf(3.4)}" fill="#f59e0b"/>${oakVeins(3.4, '#78350f')}</g>${owl(50, 78, 1.15, '#7c4a1e', '#f5deb3')}` });
  },
  acorn: () => {
    const pal = (hi: string, lo: string, nut: string) => ({ hi, lo, nut, num: lo, numStroke: '#fef3c7' });
    return chipSet('Acorn', pal('#b45309', '#78350f', '#d97706'),
      { 5: pal('#dc2626', '#7f1d1d', '#f87171'), 10: pal('#2563eb', '#1e3a8a', '#60a5fa'), 25: pal('#65a30d', '#365314', '#a3e635'), 50: pal('#ea580c', '#9a3412', '#fb923c'), 100: pal('#44403c', '#0c0a09', '#a8a29e') },
      (p) => ({ main: [p.hi, p.lo], spot: ['#fef3c7', p.nut], ring: '#fef3c7', ringDash: '3 2', inlay: '#fef3c7', inlayStroke: p.lo, tick: '#fef3c7',
        emblem: `<g transform="${at(37, 62, 1, -40)}"><path d="${oakLeaf(9)}" fill="#65a30d" opacity=".55"/>${oakVeins(9, '#365314')}</g>${acornBig(52, 47, 1.45, p.nut, p.lo, -15)}` }));
  },
  toadstool: () => {
    const pal = (hi: string, lo: string, cap: string, inlay: string) => ({ hi, lo, cap, inlay, num: '#f8fafc', numStroke: inlay });
    return chipSet('Toadstool', pal('#dc2626', '#991b1b', '#dc2626', '#14532d'),
      { 5: pal('#dc2626', '#991b1b', '#ef4444', '#14532d'), 10: pal('#2563eb', '#1e3a8a', '#3b82f6', '#14532d'), 25: pal('#16a34a', '#14532d', '#22c55e', '#3f2a14'),
        50: pal('#a855f7', '#6b21a8', '#a855f7', '#14532d'), 100: pal('#3f3f46', '#09090b', '#facc15', '#14532d') },
      (p) => ({ main: [p.hi, p.lo], spot: '#f8fafc', ring: '#f8fafc', inlay: p.inlay, inlayStroke: '#f8fafc',
        emblem: `<path d="M30 70Q33 64 36 70M64 70Q67 63 70 70M38 71Q40 66 42 71" stroke="#4d7c0f" stroke-width=".8" fill="none"/>${toadstool(50, 51, 1.45, p.cap)}` }));
  },
  'falling-leaves': () => {
    const r = rnd(421), tones = ['#dc2626', '#ea580c', '#f59e0b', '#b45309', '#fbbf24'];
    let leaves = '';
    for (let i = 0; i < 14; i++) {
      const a = i * (360 / 14) + r() * 8, rr = 46 + (r() - 0.5) * 5, [x, y] = pol(60, 60, rr, a), oak = i % 3 === 1, s = 4.6 + r() * 1.6;
      leaves += `<g transform="${at(x, y, 1, a + 90 + (r() - 0.5) * 70)}"><path d="${oak ? oakLeaf(s) : maple(s)}" fill="${tones[i % 5]}" stroke="#7c2d12" stroke-opacity=".4" stroke-width=".25"/>${oak ? oakVeins(s, '#7c2d12') : mapleVeins(s, '#7c2d12')}</g>`;
    }
    for (const a of [150, 200, 30]) {
      const [x, y] = pol(60, 60, 56, a);
      leaves += `<g transform="${at(x, y, 1, a * 2)}"><path d="${maple(3.2)}" fill="#ea580c" opacity=".85"/></g>`;
    }
    return outline({ label: 'Falling Leaves profile outline',
      over: `<circle cx="60" cy="60" r="46" fill="none" stroke="#5b3a1e" stroke-width="2"/><circle cx="60" cy="60" r="46" fill="none" stroke="#1c0f06" stroke-width="1.8" stroke-dasharray=".5 2.4" stroke-opacity=".6"/>${leaves}` });
  },
  'fairy-ring': () => {
    const r = rnd(431), caps = ['#dc2626', '#ea580c', '#dc2626', '#a855f7'];
    let shrooms = '', moss = '';
    for (let i = 0; i < 8; i++) shrooms += `<g transform="rotate(${i * 45 + 22.5} 60 60)">${toadstool(60, 10.4, 0.5 + (i % 2) * 0.12, caps[i % 4])}</g>`;
    for (let i = 0; i < 80; i++) {
      const [x, y] = pol(60, 60, 46 + (r() - 0.5) * 5, r() * 360);
      moss += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.4 + r() * 0.7)}" fill="${r() > 0.5 ? '#65a30d' : '#3f6212'}"/>`;
    }
    return outline({ label: 'Fairy Ring profile outline',
      over: `<circle cx="60" cy="60" r="46" fill="none" stroke="#4d7c0f" stroke-width="5"/>${moss}${shrooms}${spark(16, 20, 1.6, '#fef08a')}${spark(104, 34, 1.4, '#fef08a')}${spark(12, 96, 1.4, '#fef08a')}${spark(102, 102, 1.6, '#fef08a')}` });
  },
  'holo-autumn': () => {
    const r = rnd(441);
    return holoCard({ label: 'Prism Maple holographic card back', bg: ['#431407', '#1c0a04'], seed: 441,
      motif: () => {
        let leaves = '';
        for (let i = 0; i < 18; i++) leaves += `<g transform="${at(r() * 100, r() * 140, 1, r() * 360)}"><path d="${maple(3 + r() * 2)}" fill="#ea580c" opacity=".5"/></g>`;
        return leaves;
      },
      emblem: (rb) => `<g transform="${at(50, 68, 1, -8)}"><path d="${maple(32)}" fill="url(#${rb})" stroke="#fff" stroke-width="1" stroke-linejoin="round"/>${mapleVeins(32, '#ffffff', 0.85)}</g>` });
  },

  // ---------- Winter ----------
  'northern-lights': () => {
    const r = rnd(451), bl = nextId('bl'), sb = nextId('sb'), lk = nextId('lk'), st = nextId('st');
    let stars = '';
    for (let i = 0; i < 46; i++) stars += `<circle cx="${f(r() * 100)}" cy="${f(r() * 96)}" r="${f(0.25 + r() * 0.6)}" fill="#fff" opacity="${f(0.35 + r() * 0.6)}"/>`;
    const bands: [string, number, number, number, number, number][] = [['#22d3ee', 18, 5, 40, 0, 28], ['#4ade80', 30, 6, 46, 1.6, 36], ['#a78bfa', 46, 4, 34, 3, 22]];
    // Each band of light: a curtain shape filled with a gradient that fades
    // upward, with fine vertical rays, drawn once and once more mirrored in the lake.
    let aurora = '', auroraDefs = '';
    bands.forEach(([c, y, amp, period, phase, h]) => {
      const id = nextId('au'), cp = nextId('ac');
      const d = `${waveD(-6, 106, y, amp, period, phase)}L106 ${y + h}L-6 ${y + h}Z`;
      auroraDefs += `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity="0"/><stop offset=".55" stop-color="${c}" stop-opacity=".55"/><stop offset="1" stop-color="${c}" stop-opacity=".9"/></linearGradient>` +
        `<clipPath id="${cp}"><path d="${d}"/></clipPath>`;
      aurora += `<path d="${d}" fill="url(#${id})" filter="url(#${bl})"/>` +
        `<g clip-path="url(#${cp})" opacity=".22" filter="url(#${sb})"><rect x="-6" y="0" width="112" height="100" fill="url(#${st})"/></g><path d="${waveD(-6, 106, y + h, amp * 0.5, period * 0.8, phase)}" stroke="${c}" stroke-width="1.2" fill="none" filter="url(#${bl})"/>`;
    });
    let pines = '';
    for (let x = 2; x < 100; x += 4 + r() * 3) {
      const h = 5 + r() * 6;
      pines += `M${f(x)} 100L${f(x - h * 0.3)} 100L${f(x)} ${f(100 - h)}L${f(x + h * 0.3)} 100Z`;
    }
    return card({ label: 'Northern Lights card back', bg: ['#0f172a', '#020617'], edge: '#2dd4bf', frame: '#5eead4', hair: '#99f6e4',
      defs: blur(bl, 1.6) + blur(sb, 0.5) + lin(lk, ['#0b1730', '#020617']) + auroraDefs +
        `<pattern id="${st}" width="2.6" height="100" patternUnits="userSpaceOnUse"><rect width=".7" height="100" fill="#fff" opacity=".5"/></pattern>`,
      inner: `${stars}${aurora}${spikes(80, 14, 2.4)}${spikes(16, 30, 1.8)}${mountains([[8, 84], [26, 72], [44, 82], [62, 70], [84, 80], [100, 74]], 100, '#1e293b', '#cbd5e1', '#000000')}` +
        `<rect x="0" y="100" width="100" height="40" fill="url(#${lk})"/><g transform="translate(0 200) scale(1 -1)" opacity=".22">${aurora}</g>` +
        `<path d="${pines}" fill="#020617"/>${ripples(106, 0.4, 8, 0, 6, 4.6, '#5eead4', 0.25)}<path d="M0 100H100" stroke="#99f6e4" stroke-opacity=".35" stroke-width=".4"/>`,
      corner: (x, y) => snowflake(x, y, 2.6, '#99f6e4', 0.7),
      over: `${mountains([[24, 92], [50, 60], [76, 90]], 102, '#334155', '#f1f5f9', '#0f172a')}<path d="M50 60L44 74M50 60L56 72M38 84L44 92M62 82L58 92" stroke="#94a3b8" stroke-opacity=".5" stroke-width=".35"/>` });
  },
  'ice-crystal': () => {
    const r = rnd(461), fr = nextId('fr'), gl = nextId('gl'), cg = nextId('cg');
    // Fern frost creeping in from the corners.
    const fern = (x: number, y: number, a: number, len: number, depth: number): string => {
      const [x1, y1] = pol(x, y, len, a);
      let d = `M${f(x)} ${f(y)}L${f(x1)} ${f(y1)}`;
      if (depth > 0) for (let i = 0; i < 4; i++) {
        const t = 0.25 + i * 0.22, side = i % 2 ? 1 : -1, [bx, by] = pol(x, y, len * t, a);
        d += fern(bx, by, a + side * 42, len * 0.42 * (1.1 - t), depth - 1) + fern(bx, by, a - side * 42, len * 0.3 * (1.1 - t), depth - 1);
      }
      return d;
    };
    const frost = fern(4, 4, 135, 34, 2) + fern(96, 4, 225, 30, 2) + fern(4, 136, 45, 30, 2) + fern(96, 136, 315, 34, 2);
    let flakes = '';
    for (let i = 0; i < 14; i++) flakes += snowflake(f(10 + r() * 80), f(10 + r() * 120), f(1.4 + r() * 1.8), '#f0f9ff', 0.4);
    return card({ label: 'Ice Crystal card back', bg: ['#7dd3fc', '#0369a1'], edge: '#bae6fd', frame: '#e0f2fe', hair: '#f0f9ff',
      defs: rough(fr, 1.1, 21, 1.4) + glow(gl, 1.6) + rad(cg, [[0, '#ffffff', 0.9], [1, '#ffffff', 0]]),
      inner: `<rect x="0" y="0" width="100" height="140" filter="url(#${fr})" opacity=".25" style="mix-blend-mode:screen"/><g opacity=".55">${flakes}</g>` +
        `<path d="${frost}" stroke="#f0f9ff" stroke-opacity=".7" stroke-width=".45" fill="none" stroke-linecap="round"/>`,
      corner: (x, y) => crystal(x, y, 3.6, '#f0f9ff', 0.5),
      over: `<circle cx="50" cy="70" r="20" fill="url(#${cg})"/><g opacity=".45" transform="translate(.6 .9)">${crystal(50, 70, 31, '#0c4a6e', 2.4)}</g>` +
        `<g filter="url(#${gl})">${crystal(50, 70, 31, '#f0f9ff', 1.4)}</g><g transform="rotate(30 50 70)">${crystal(50, 70, 12, '#ffffff', 0.7)}</g>` +
        `${spark(50, 70, 3.4)}${spark(70, 52, 2)}${spark(32, 90, 1.6)}` });
  },
  penguin: () => {
    const pal = (hi: string, lo: string, scarf: string) => ({ hi, lo, scarf, num: lo, numStroke: '#e0f2fe' });
    return chipSet('Penguin', pal('#38bdf8', '#0369a1', '#ef4444'),
      { 5: pal('#ef4444', '#991b1b', '#facc15'), 10: pal('#3b82f6', '#1e3a8a', '#ef4444'), 25: pal('#22c55e', '#166534', '#ef4444'), 50: pal('#a855f7', '#6b21a8', '#facc15'), 100: pal('#3f3f46', '#09090b', '#facc15') },
      (p) => ({ main: [p.hi, p.lo], spot: ['#f0f9ff', '#bae6fd'], ring: '#f0f9ff', ringDash: '2 2', inlay: '#e0f2fe', inlayStroke: p.lo, tick: '#f0f9ff',
        emblem: penguin(50, 52, 1.45, p.scarf) }));
  },
  glacier: () => {
    const pal = (m: string[], dark: string, inlay: string) => ({ m, dark, inlay, num: '#f0f9ff', numStroke: inlay });
    return chipSet('Glacier', pal(['#e0f2fe', '#7dd3fc', '#38bdf8'], '#0369a1', '#0c4a6e'),
      { 5: pal(['#fee2e2', '#fca5a5', '#f87171'], '#991b1b', '#450a0a'), 10: pal(['#dbeafe', '#93c5fd', '#60a5fa'], '#1e3a8a', '#172554'),
        25: pal(['#dcfce7', '#86efac', '#4ade80'], '#166534', '#052e16'), 50: pal(['#f3e8ff', '#d8b4fe', '#c084fc'], '#6b21a8', '#3b0764'),
        100: pal(['#f1f5f9', '#94a3b8', '#475569'], '#0f172a', '#0f172a') },
      (p) => ({ main: p.m, spot: [p.dark, '#f0f9ff'], ring: p.dark, ringDash: '1.5 2', inlay: p.inlay, inlayStroke: '#e0f2fe', tick: p.dark, text: p.dark,
        emblem: crystal(50, 50, 21, '#e0f2fe', 1.6) }));
  },
  'icicle-ring': () => {
    const r = rnd(471), ic = nextId('ic');
    let drips = '';
    for (let a = 98; a <= 262; a += 7) {
      const [x, y] = pol(60, 60, 47.4, a), w = 1.6 + r() * 1.2, h = 3 + r() * 7 * (1 - Math.abs(a - 180) / 140);
      drips += `<path d="M${f(x - w / 2)} ${f(y - 0.6)}L${f(x)} ${f(y + h)}L${f(x + w / 2)} ${f(y - 0.6)}Z" fill="url(#${ic})"/><path d="M${f(x - w * 0.15)} ${f(y)}L${f(x - 0.05)} ${f(y + h * 0.75)}" stroke="#fff" stroke-opacity=".8" stroke-width=".3"/>`;
    }
    let lumps = '';
    for (let a = 296; a <= 424; a += 9) {
      const [x, y] = pol(60, 60, 47.6, a);
      lumps += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(2.4 + r() * 1.2)}" fill="#f8fafc"/>`;
    }
    return outline({ label: 'Icicle Ring profile outline', defs: lin(ic, ['#f0f9ff', '#7dd3fc']),
      over: `<circle cx="60" cy="60" r="45.4" fill="none" stroke="#7dd3fc" stroke-width="4"/><circle cx="60" cy="60" r="43.2" fill="none" stroke="#0369a1" stroke-width=".6"/><circle cx="60" cy="60" r="47.6" fill="none" stroke="#e0f2fe" stroke-width=".6"/>` +
        `${drips}<path d="${arcD(60, 60, 47.4, 292, 428)}" stroke="#f8fafc" stroke-width="4.4" fill="none" stroke-linecap="round"/>${lumps}<path d="${arcD(60, 60, 49.4, 300, 420)}" stroke="#cbd5e1" stroke-width=".5" fill="none"/>` +
        `${spark(18, 20, 1.6, '#e0f2fe')}${spark(104, 30, 1.4, '#e0f2fe')}` });
  },
  'frost-ring': () => {
    const gl = nextId('gl');
    let marks = '';
    for (let i = 0; i < 6; i++) {
      const [x, y] = pol(60, 60, 46, i * 60);
      marks += crystal(x, y, 6.4, '#e0f2fe', 0.7);
      const [sx, sy] = pol(60, 60, 46, i * 60 + 30);
      marks += snowflake(sx, sy, 2.8, '#f0f9ff', 0.55);
    }
    let dots = '';
    for (let a = 0; a < 360; a += 6) {
      const [x, y] = pol(60, 60, 50, a + 3);
      dots += `<circle cx="${f(x)}" cy="${f(y)}" r=".5" fill="#bae6fd"/>`;
    }
    return outline({ label: 'Frost Ring profile outline', defs: glow(gl, 1.2),
      over: `<circle cx="60" cy="60" r="45" fill="none" stroke="#38bdf8" stroke-width="1.6"/><circle cx="60" cy="60" r="47" fill="none" stroke="#bae6fd" stroke-width=".6"/>${dots}<g filter="url(#${gl})">${marks}</g>` });
  },
  'holo-winter': () => holoCard({ label: 'Prism Frost holographic card back', bg: ['#0c4a6e', '#020617'], seed: 481,
    motif: () => `${mountains([[10, 112], [32, 96], [56, 110], [78, 94], [100, 106]], 140, '#0f172a', '#cbd5e1', '#000000')}`,
    emblem: (rb) => `${crystal(50, 64, 30, `url(#${rb})`, 2.4)}<g transform="rotate(30 50 64)">${crystal(50, 64, 12, '#ffffff', 1)}</g>` }),
  // ---------- Nature ----------
  'ancient-oak': () => {
    const r = rnd(501), sky = nextId('sk'), mw = nextId('mw'), bk = nextId('bk'), tc = nextId('tc'), sr = nextId('sr');
    const lit = [['#0f3d22', '#052e16'], ['#14532d', '#0b2e19'], ['#166534', '#0f3d22'], ['#15803d', '#14532d'], ['#16a34a', '#166534']].map((c) => {
      const id = nextId('lt');
      return { id, def: rad(id, [[0, c[0]], [0.72, c[0]], [1, c[1]]], 0.4, 0.36, 0.68) };
    });
    let canopy = '', leafTex = '', grass = '', flowers = '';
    for (let layer = 0; layer < 5; layer++) for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r());
      canopy += `<circle cx="${f(50 + Math.cos(a) * d * 34)}" cy="${f(46 + Math.sin(a) * d * 19 - layer * 1.3)}" r="${f(3.8 + r() * 2.8 - layer * 0.3)}" fill="url(#${lit[layer].id})"/>`;
    }
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r());
      leafTex += `<g transform="${at(50 + Math.cos(a) * d * 36, 45 + Math.sin(a) * d * 21, 1, r() * 360)}"><path d="${oakLeaf(1.9)}" fill="${['#15803d', '#16a34a', '#22c55e', '#166534'][Math.floor(r() * 4)]}" stroke="#052e16" stroke-opacity=".4" stroke-width=".15"/></g>`;
    }
    for (let x = 1; x < 100; x += 1.6) grass += `M${f(x)} ${f(116 - Math.sin(x / 12) * 2)}l${f(-0.8 + r() * 1.6)} ${f(-2 - r() * 3.4)}`;
    for (let i = 0; i < 22; i++) flowers += `<circle cx="${f(r() * 100)}" cy="${f(112 + r() * 24)}" r="${f(0.5 + r() * 0.5)}" fill="${['#fde047', '#f8fafc', '#f472b6', '#a78bfa'][i % 4]}"/>`;
    const birds = [[18, 22, 0.7], [26, 18, 0.5], [82, 26, 0.6]].map(([x, y, s]) => `<path transform="${at(x, y, s)}" d="M-4 0Q-2 -2 0 0Q2 -2 4 0" stroke="#1e293b" stroke-width=".8" fill="none"/>`).join('');
    return card({ label: 'Ancient Oak card back', bg: ['#7dd3fc', '#166534'], edge: '#16a34a', frame: '#15803d', hair: '#14532d',
      defs: lin(sky, ['#38bdf8', '#e0f2fe']) + lin(mw, ['#84cc16', '#3f6212']) + lin(bk, ['#6b4423', '#3b2412'], 1, 0) + lit.map((l) => l.def).join('') +
        `<linearGradient id="${sr}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
        `<clipPath id="${tc}"><path d="M40 114C44 100 45 86 44 70L56 70C55 86 56 100 60 114Z"/></clipPath>`,
      inner: `<rect x="0" y="0" width="100" height="110" fill="url(#${sky})"/><path d="M-4 0L14 0L52 110H22Z M24 0L34 0L74 110H58Z" fill="url(#${sr})" opacity=".55"/>${birds}` +
        `<path d="M0 98Q24 88 50 94T100 90V110H0Z" fill="#65a30d" opacity=".55"/><path d="M0 108Q30 100 60 106T100 104V140H0Z" fill="url(#${mw})"/>` +
        `<path d="${grass}" stroke="#365314" stroke-opacity=".7" stroke-width=".35"/>${flowers}<ellipse cx="52" cy="114" rx="30" ry="4" fill="#14532d" opacity=".45"/>`,
      corner: (x, y, rot) => `<g transform="${at(x, y, 1, rot - 45)}"><path d="${oakLeaf(3.4)}" fill="#22c55e"/>${oakVeins(3.4, '#14532d')}</g>`,
      over: `<path d="M40 114C44 100 45 86 44 70L56 70C55 86 56 100 60 114Z" fill="url(#${bk})"/>` +
        `<g clip-path="url(#${tc})"><path d="M43 114C46 100 47 88 46.6 70M49.6 114C50 100 50.2 88 50 70M53.8 114C53.6 100 53.4 88 53.6 70M42 106l3 -1.2M54 98l3 -1M44 90l2.6 -.8M52 82l3 -1.2" stroke="#1c0f06" stroke-opacity=".55" stroke-width=".4" fill="none"/></g>` +
        `<path d="M40 113Q32 114 26 117M42 112Q38 116 34 120M58 112Q66 114 74 117M57 112Q61 116 64 120" stroke="#4a2c17" stroke-width="2" stroke-linecap="round" fill="none"/>` +
        `<path d="M45 76L30 60L20 56M55 74L70 58L82 55M47 70L40 52M53 70L60 50M30 60L26 50M70 58L76 48" stroke="#4a2c17" stroke-width="2.2" stroke-linecap="round" fill="none"/>${canopy}${leafTex}` });
  },
  'misty-pines': () => {
    const r = rnd(511), sky = nextId('sk'), fg = nextId('fg'), fg2 = nextId('fg'), tg = nextId('tg'), tc = nextId('tc');
    const row = (y: number, h: number, step: number, fill: string, seed: number) => {
      const q = rnd(seed);
      let out = '';
      for (let x = -4; x < 106; x += step * (0.7 + q() * 0.6)) out += pineSil(x, y + q() * 3, h * (0.7 + q() * 0.5), fill);
      return `${out}<rect x="0" y="${y}" width="100" height="${140 - y}" fill="${fill}"/>`;
    };
    let needles = '';
    for (let i = 0; i < 200; i++) {
      const t = r(), y = 34 + t * 78, half = 3 + t * 15, x = 50 + (r() - 0.5) * 2 * half, dir = x < 50 ? -1 : 1;
      needles += `M${f(x)} ${f(y)}l${f(dir * (1 + r()))} ${f(1 + r() * 0.8)}`;
    }
    const birds = [[20, 30, 0.6], [27, 26, 0.45], [74, 22, 0.55]].map(([x, y, s]) => `<path transform="${at(x, y, s)}" d="M-4 0Q-2 -2 0 0Q2 -2 4 0" stroke="#334155" stroke-width=".8" fill="none"/>`).join('');
    const pine = 'M50 28L58 46H54L64 64H58L70 84H62L76 106H24L38 84H30L42 64H36L46 46H42Z';
    return card({ label: 'Misty Pines card back', bg: ['#cbd5e1', '#1e3a2f'], edge: '#64748b', frame: '#94a3b8', hair: '#e2e8f0',
      defs: lin(sky, ['#94a3b8', '#f1f5f9']) + clouds(fg, '#f8fafc', '.012 .07', 61, 2.4, 0.9) + clouds(fg2, '#f8fafc', '.015 .09', 63, 2.4, 0.95) + lin(tg, ['#1f5c3d', '#0b2a1c'], 1, 0) +
        `<clipPath id="${tc}"><path d="${pine}"/></clipPath>`,
      inner: `<rect x="0" y="0" width="100" height="140" fill="url(#${sky})"/><circle cx="70" cy="30" r="8" fill="#fff" opacity=".5"/>${birds}` +
        `${mountains([[14, 70], [38, 58], [62, 68], [86, 56]], 90, '#a3b1c2', '#e2e8f0', '#64748b')}<rect x="0" y="60" width="100" height="40" filter="url(#${fg})" opacity=".85"/>` +
        `${row(88, 18, 6, '#7d9488', 5)}<rect x="0" y="82" width="100" height="30" filter="url(#${fg2})" opacity=".8"/>${row(102, 24, 7, '#4b6b5c', 7)}` +
        `<rect x="0" y="98" width="100" height="24" filter="url(#${fg})" opacity=".6"/>${row(118, 30, 8, '#24453a', 9)}`,
      corner: (x, y) => pineSil(x, y + 4, 8, '#e2e8f0'),
      over: `<path d="M48 104H52V114H48Z" fill="#3b2412"/><path d="${pine}" fill="url(#${tg})"/>` +
        `<g clip-path="url(#${tc})"><path d="${needles}" stroke="#052e16" stroke-opacity=".55" stroke-width=".3"/><path d="${needles}" transform="translate(-.4 -.5)" stroke="#86efac" stroke-opacity=".18" stroke-width=".2"/>` +
        `<path d="M42 46H58M36 64H64M30 84H70M24 106H76" stroke="#e2e8f0" stroke-opacity=".5" stroke-width="1.2"/></g><path d="M50 28V104" stroke="#0b2a1c" stroke-width=".5"/>` });
  },
  'oak-leaf': () => {
    const pal = (hi: string, lo: string) => ({ hi, lo, num: lo, numStroke: '#f0fdf4' });
    return chipSet('Oak Leaf', pal('#16a34a', '#14532d'),
      { 5: pal('#dc2626', '#7f1d1d'), 10: pal('#2563eb', '#1e3a8a'), 25: pal('#16a34a', '#14532d'), 50: pal('#ea580c', '#9a3412'), 100: pal('#3f3f46', '#09090b') },
      (p) => ({ main: [p.hi, p.lo], spot: ['#f0fdf4', '#a3e635'], ring: '#f0fdf4', ringDash: '3 2', inlay: '#f0fdf4', inlayStroke: p.lo, tick: '#f0fdf4',
        emblem: `<g transform="${at(50, 50, 1, -12)}"><path d="${oakLeaf(22)}" fill="${p.hi}" stroke="${p.lo}" stroke-width=".7" stroke-linejoin="round"/>${oakVeins(22, p.lo)}</g>` }));
  },
  pinecone: () => {
    const pal = (hi: string, lo: string, inlay: string) => ({ hi, lo, inlay, num: '#fef3c7', numStroke: inlay });
    return chipSet('Pinecone', pal('#78350f', '#3b1d06', '#1a2e05'),
      { 5: pal('#dc2626', '#7f1d1d', '#2a0808'), 10: pal('#2563eb', '#1e3a8a', '#0b1430'), 25: pal('#16a34a', '#14532d', '#1a2e05'), 50: pal('#ea580c', '#9a3412', '#2b1204'), 100: pal('#3f3f46', '#09090b', '#0c0a09') },
      (p) => ({ main: [p.hi, p.lo], spot: ['#d6b98c', '#65a30d'], ring: '#d6b98c', ringDash: '2 2', inlay: p.inlay, inlayStroke: '#d6b98c', tick: '#d6b98c', text: '#fef3c7',
        emblem: `<path d="M34 34L44 44M30 42L42 46M36 28L44 40M66 34L56 44M70 42L58 46M64 28L56 40" stroke="#4d7c0f" stroke-width="1" stroke-linecap="round"/>${pinecone(50, 54, 1.45, '#b45309', '#451a03')}` }));
  },
  'ivy-vine': () => {
    let vine = '', leaves = '';
    for (let i = 0; i <= 120; i++) {
      const a = i * 3, [x, y] = pol(60, 60, 46 + 2.4 * Math.sin((a * Math.PI) / 30), a);
      vine += `${i ? 'L' : 'M'}${f(x)} ${f(y)}`;
    }
    for (let i = 0; i < 18; i++) {
      const a = i * 20 + 5, out = i % 2 ? 1 : -1, [x, y] = pol(60, 60, 46 + out * 4.4, a);
      leaves += ivy(x, y, 0.62, i % 3 ? '#16a34a' : '#22c55e', a + (out > 0 ? 0 : 180));
    }
    return outline({ label: 'Ivy Vine profile outline',
      over: `<circle cx="60" cy="60" r="46" fill="none" stroke="#14532d" stroke-width=".8" stroke-opacity=".5"/><path d="${vine}" stroke="#3f6212" stroke-width="1.6" fill="none"/>${leaves}` });
  },
  'songbird-branch': () => {
    const r = rnd(521);
    const arc = `${arcD(60, 60, 47, 200, 360)}${arcD(60, 60, 47, 0, 160).replace(/^M/, 'L')}`;
    let leaves = '', berries = '';
    for (let a = 214; a <= 506; a += 26) {
      const [x, y] = pol(60, 60, 47, a), side = (a / 26) % 2 > 1 ? 1 : -1;
      if (Math.abs(((a % 360) + 360) % 360) < 14 || Math.abs((((a % 360) + 360) % 360) - 360) < 14) continue;
      leaves += `<g transform="${at(x, y, 1, a + 90 + side * 50)}"><path d="M0 0Q3 -3.4 7.6 0Q3 3.4 0 0Z" fill="${r() > 0.5 ? '#22c55e' : '#16a34a'}"/><path d="M0 0H7" stroke="#14532d" stroke-width=".3"/></g>`;
    }
    for (const a of [140, 150, 220, 232]) {
      const [x, y] = pol(60, 60, 50, a);
      berries += `<circle cx="${f(x)}" cy="${f(y)}" r="1.6" fill="#dc2626"/><circle cx="${f(x - 0.5)}" cy="${f(y - 0.5)}" r=".45" fill="#fff" opacity=".7"/>`;
    }
    return outline({ label: 'Songbird Branch profile outline',
      over: `<path d="${arc}" stroke="#5b3a1e" stroke-width="3" fill="none" stroke-linecap="round"/><path d="${arc}" stroke="#1c0f06" stroke-width="2.6" stroke-dasharray=".5 2.4" fill="none" stroke-opacity=".6"/>` +
        `${leaves}${berries}${songbird(62, 7.4, 1.05)}` });
  },
  'holo-nature': () => holoCard({ label: 'Prism Grove holographic card back', bg: ['#052e16', '#020617'], seed: 531,
    motif: () => `${pineSil(12, 140, 40, '#0b2a1c')}${pineSil(26, 140, 30, '#0b2a1c')}${pineSil(88, 140, 44, '#0b2a1c')}${pineSil(76, 140, 28, '#0b2a1c')}`,
    emblem: (rb) => {
      const q = rnd(532);
      let clumps = '';
      for (let i = 0; i < 18; i++) {
        const a = q() * Math.PI * 2, d = Math.sqrt(q());
        clumps += `<circle cx="${f(50 + Math.cos(a) * d * 22)}" cy="${f(56 + Math.sin(a) * d * 15)}" r="${f(6 + q() * 4)}" fill="url(#${rb})" stroke="#fff" stroke-width=".5"/>`;
      }
      return `<path d="M46 108C48 96 48 86 47 74L53 74C52 86 52 96 54 108Z" fill="#fff"/><path d="M48 80L38 66M52 78L62 64" stroke="#fff" stroke-width="2" stroke-linecap="round"/>${clumps}`;
    } }),
  'holo-chip-nature': () => holoChip('Prism Sprout', ['#166534', '#052e16'], 213, { foil: ['#bbf7d0', '#4ade80', '#fde68a', '#a3e635'], edge: 'pine', ring: '#166534', inlay: '#f0fdf4', ink: '#166534' }, (rb) =>
    sprout(50, 50, 1.55, `url(#${rb})`)),
  // One holographic profile outline per box, each with its own ornaments.
  'holo-outline-neon': () => holoOutline('Prism Halo', ['#ff3fd2', '#2ef2ff', '#8b5cf6'], 301, (rb) => {
    const bolt = 'M54 29L39 53H48.5L44.5 71L61 45.5H51.5Z';
    let marks = '';
    for (const a of [45, 135, 225, 315]) {
      const [x, y] = pol(60, 60, 52, a);
      marks += `<path transform="translate(${f(x)} ${f(y)}) rotate(${a}) scale(.4) translate(-50 -50)" d="${bolt}" fill="url(#${rb})" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>`;
    }
    for (const a of [0, 90, 180, 270]) {
      const [x, y] = pol(60, 60, 52, a);
      marks += `<path transform="translate(${f(x)} ${f(y)}) rotate(${a})" d="M0 -3L2.4 0L0 3L-2.4 0Z" fill="#fff"/>`;
    }
    return `<circle cx="60" cy="60" r="51.6" fill="none" stroke="url(#${rb})" stroke-width="1.2" stroke-dasharray="6 3"/>${marks}`;
  }, 3),
  'holo-outline-royal': () => holoOutline('Prism Laurel', ['#fff3c4', '#f5c6a5', '#e9d5ff', '#f8e08e'], 302, (rb) =>
    `${laurel(60, 60, 50.5, 196, 344, 9, `url(#${rb})`, 1.02, '#ffffff')}${laurel(60, 60, 50.5, 164, 16, 9, `url(#${rb})`, 1.02, '#ffffff')}` +
    `${crown(60, 8.6, 0.5, `url(#${rb})`, '#ffffff')}<path d="M60 105.4L63 109L60 112.6L57 109Z" fill="url(#${rb})" stroke="#fff" stroke-width=".5"/>`),
  'holo-outline-ocean': () => holoOutline('Opal Wave', ['#a5f3fc', '#fbcfe8', '#bbf7d0', '#ddd6fe', '#fde68a'], 303, (rb) => {
    let wave = '', foam = '', pearls = '';
    for (let i = 0; i <= 240; i++) {
      const a = i * 1.5, [x, y] = pol(60, 60, 51.2 + 2.2 * Math.sin((a * 16 * Math.PI) / 180), a);
      wave += `${i ? 'L' : 'M'}${f(x)} ${f(y)}`;
    }
    for (let i = 0; i < 16; i++) {
      const a = i * 22.5 + 5.6, [x, y] = pol(60, 60, 53.4, a);
      foam += `<circle cx="${f(x)}" cy="${f(y)}" r=".9" fill="#fff"/>`;
      if (i % 2 === 0) {
        const [px, py] = pol(60, 60, 57, a + 11);
        pearls += `<circle cx="${f(px)}" cy="${f(py)}" r="1.8" fill="#fff"/><circle cx="${f(px - 0.5)}" cy="${f(py - 0.5)}" r=".75" fill="url(#${rb})"/>`;
      }
    }
    return `<path d="${wave}Z" stroke="url(#${rb})" stroke-width="2.2" fill="none" stroke-linejoin="round"/><path d="${wave}Z" stroke="#fff" stroke-opacity=".6" stroke-width=".5" fill="none" transform="translate(-.3 -.3)"/>${foam}${pearls}`;
  }),
  'holo-outline-inferno': () => holoOutline('Prism Blaze', ['#ef4444', '#f97316', '#fde047', '#fb7185'], 304, (rb) => {
    let flames = '';
    for (let i = 0; i < 18; i++) flames += `<path transform="rotate(${i * 20} 60 60)" d="${flame(60, 13.6, 6.4, i % 2 ? 9 : 13)}" fill="url(#${rb})" stroke="#fff" stroke-width=".4"/>`;
    return flames;
  }),
  'holo-outline-galaxy': () => holoOutline('Prism Orbit', ['#a78bfa', '#60a5fa', '#f472b6', '#e0e7ff'], 305, (rb) => {
    const planet = (a: number, rr: number, size: number) => {
      const [x, y] = pol(60, 60, rr, a);
      return `<circle cx="${f(x)}" cy="${f(y)}" r="${size}" fill="url(#${rb})" stroke="#fff" stroke-width=".5"/><circle cx="${f(x - size * 0.35)}" cy="${f(y - size * 0.35)}" r="${f(size * 0.35)}" fill="#fff" opacity=".6"/>`;
    };
    return `<circle cx="60" cy="60" r="51.4" fill="none" stroke="url(#${rb})" stroke-width=".9" stroke-dasharray="1 1.6"/>` +
      `<circle cx="60" cy="60" r="56" fill="none" stroke="url(#${rb})" stroke-width=".9"/>` +
      `${planet(40, 51.4, 2.6)}${planet(200, 51.4, 2)}${planet(300, 56, 3.4)}${planet(130, 56, 2.4)}` +
      `<ellipse cx="${f(pol(60, 60, 56, 300)[0])}" cy="${f(pol(60, 60, 56, 300)[1])}" rx="5.6" ry="1.4" fill="none" stroke="#fff" stroke-width=".5" transform="rotate(-20 ${f(pol(60, 60, 56, 300)[0])} ${f(pol(60, 60, 56, 300)[1])})"/>` +
      `<path d="${starPath(60, 6.2, 5.4, 2, 4)}" fill="#fff"/><path d="${starPath(60, 114, 4, 1.6, 4)}" fill="#fff"/>`;
  }, 2.6),
  'holo-outline-halloween': () => holoOutline('Spectral Web', ['#fb923c', '#a855f7', '#84cc16'], 306, (rb) => {
    let web = '';
    for (let i = 0; i < 12; i++) {
      const a0 = i * 30, [x0, y0] = pol(60, 60, 47, a0), [x1, y1] = pol(60, 60, 57, a0);
      web += `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`;
      for (const rr of [51, 55]) {
        const [ax, ay] = pol(60, 60, rr, a0), [bx, by] = pol(60, 60, rr, a0 + 30), [mx, my] = pol(60, 60, rr - 1.8, a0 + 15);
        web += `M${f(ax)} ${f(ay)}Q${f(mx)} ${f(my)} ${f(bx)} ${f(by)}`;
      }
    }
    return `<path d="${web}" stroke="url(#${rb})" stroke-width=".8" fill="none"/>${bat(22, 18, 0.62, `url(#${rb})`)}${bat(98, 18, 0.62, `url(#${rb})`)}${bat(60, 113, 0.5, `url(#${rb})`)}`;
  }, 3.4),
  'holo-outline-thanksgiving': () => holoOutline('Prism Wreath', ['#fde68a', '#f59e0b', '#ea580c', '#dc2626'], 307, (rb) => {
    let leaves = '';
    for (let i = 0; i < 14; i++) {
      const a = i * (360 / 14), [x, y] = pol(60, 60, 49.6, a);
      leaves += `<g transform="${at(x, y, 1, a + 90 + (i % 2 ? 20 : -20))}"><path d="${maple(4.8)}" fill="url(#${rb})" stroke="#fff" stroke-width=".35"/>${mapleVeins(4.8, '#ffffff', 0.7)}</g>`;
    }
    return leaves;
  }),
  'holo-outline-christmas': () => holoOutline('Aurora Wreath', ['#4ade80', '#22d3ee', '#a78bfa', '#f0abfc'], 308, (rb) => {
    let marks = '';
    for (let i = 0; i < 6; i++) {
      const [x, y] = pol(60, 60, 50.4, i * 60 + 30);
      marks += snowflake(x, y, 4.6, `url(#${rb})`, 1.1);
      const [hx, hy] = pol(60, 60, 50.4, i * 60);
      if (i) marks += `<g transform="${at(hx, hy, 0.55, i * 60)}"><path d="${HOLLY}" fill="url(#${rb})" transform="rotate(-35) translate(0 -5)"/><path d="${HOLLY}" fill="url(#${rb})" transform="rotate(35) translate(0 -5)"/><circle r="1.8" fill="#fff"/></g>`;
    }
    return `${marks}<path d="${starPath(60, 6.6, 6, 2.4, 5)}" fill="url(#${rb})" stroke="#fff" stroke-width=".5"/>`;
  }),
  'holo-outline-spring': () => holoOutline('Prism Garden', ['#fbcfe8', '#e9d5ff', '#bbf7d0', '#fef9c3'], 309, (rb) => {
    let flowers = '';
    for (let i = 0; i < 10; i++) {
      const [x, y] = pol(60, 60, 49.6, i * 36);
      flowers += blossom(x, y, 0.78, `url(#${rb})`, i * 23, '#ffffff');
      const [lx, ly] = pol(60, 60, 50, i * 36 + 18);
      flowers += `<path transform="translate(${f(lx)} ${f(ly)}) rotate(${i * 36 + 18 + 90})" d="M-4 0Q0 -2.4 4 0Q0 2.4 -4 0Z" fill="url(#${rb})" stroke="#fff" stroke-width=".3"/>`;
    }
    return flowers;
  }),
  'holo-outline-summer': () => holoOutline('Prism Tropics', ['#fde047', '#fb923c', '#22d3ee', '#f472b6'], 310, (rb) => {
    let leaves = '';
    for (let i = 0; i < 14; i++) {
      const a = i * (360 / 14), [x, y] = pol(60, 60, 49.6, a);
      let veins = '';
      for (let k = -8; k <= 8; k += 2.6) veins += `M0 ${f(k)}L${f(-3.6 + Math.abs(k) * 0.25)} ${f(k - 2)}M0 ${f(k)}L${f(3.6 - Math.abs(k) * 0.25)} ${f(k - 2)}`;
      leaves += `<g transform="${at(x, y, 1, a + 90 + (i % 2 ? 14 : -14))}"><path d="M0 -11Q6 -4 0 11Q-6 -4 0 -11Z" fill="url(#${rb})" stroke="#fff" stroke-width=".35"/><path d="M0 -10V10" stroke="#fff" stroke-width=".4"/><path d="${veins}" stroke="#fff" stroke-opacity=".55" stroke-width=".25"/></g>`;
    }
    return `${leaves}${hibiscus(20, 22, 0.8, `url(#${rb})`, '#be185d', 20)}${hibiscus(100, 98, 0.75, `url(#${rb})`, '#be185d', -30)}${hibiscus(102, 26, 0.55, `url(#${rb})`, '#be185d', 10)}`;
  }),
  'holo-outline-autumn': () => holoOutline('Prism Fairy Ring', ['#c2410c', '#f59e0b', '#fde68a', '#a16207'], 311, (rb) => {
    let shrooms = '';
    for (let i = 0; i < 8; i++) shrooms += `<g transform="rotate(${i * 45 + 22.5} 60 60)">${toadstool(60, 10.6, 0.5 + (i % 2) * 0.1, `url(#${rb})`)}</g>`;
    return shrooms;
  }),
  'holo-outline-winter': () => holoOutline('Prism Icicles', ['#e0f2fe', '#a5f3fc', '#c7d2fe', '#f0f9ff'], 312, (rb) => {
    const q = rnd(313);
    let drips = '';
    for (let a = 100; a <= 260; a += 8) {
      const [x, y] = pol(60, 60, 47.4, a), w = 1.8 + q() * 1.2, h = 3 + q() * 7 * (1 - Math.abs(a - 180) / 140);
      drips += `<path d="M${f(x - w / 2)} ${f(y - 0.6)}L${f(x)} ${f(y + h)}L${f(x + w / 2)} ${f(y - 0.6)}Z" fill="url(#${rb})" stroke="#fff" stroke-width=".25"/>`;
    }
    let crystals = '';
    for (const a of [300, 0, 60]) {
      const [x, y] = pol(60, 60, 52, a);
      crystals += crystal(x, y, 5.6, `url(#${rb})`, 0.8);
    }
    return drips + crystals;
  }),
  'holo-outline-nature': () => holoOutline('Prism Vine', ['#bbf7d0', '#4ade80', '#fde68a', '#a3e635'], 314, (rb) => {
    let vine = '', leaves = '';
    for (let i = 0; i <= 120; i++) {
      const a = i * 3, [x, y] = pol(60, 60, 50 + 2.4 * Math.sin((a * Math.PI) / 30), a);
      vine += `${i ? 'L' : 'M'}${f(x)} ${f(y)}`;
    }
    for (let i = 0; i < 18; i++) {
      const a = i * 20 + 5, out = i % 2 ? 1 : -1, [x, y] = pol(60, 60, 50 + out * 4.2, a);
      leaves += ivy(x, y, 0.6, `url(#${rb})`, a + (out > 0 ? 0 : 180));
    }
    return `<path d="${vine}" stroke="url(#${rb})" stroke-width="1.4" fill="none"/>${leaves}`;
  }, 3),
};

export const COSMETIC_ART_KEYS = Object.keys(ART);

/**
 * Draws one cosmetic as an SVG string, or null for an unknown art key.
 * idPrefix must be unique among the drawings on the page (React's useId()
 * works), since the SVG's gradients and filters are referenced by id.
 */
export function drawCosmetic(artKey: string, idPrefix: string, options: DrawOptions = {}): string | null {
  const draw = ART[artKey];
  if (!draw) return null;
  let n = 0;
  const safePrefix = idPrefix.replace(/[^A-Za-z0-9_-]/g, '');
  nextId = (p) => `${safePrefix}-${p}${++n}`;
  drawOptions = options;
  try {
    return draw();
  } finally {
    nextId = (p) => p;
    drawOptions = {};
  }
}
