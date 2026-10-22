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
}

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
const pumpkin = (cx: number, cy: number, s: number) =>
  `<g transform="translate(${cx} ${cy}) scale(${s})">` +
  `<path d="M-1 -10Q0 -15 3.5 -15.5" stroke="#4d7c0f" stroke-width="2.6" fill="none" stroke-linecap="round"/>` +
  `<path d="M2 -14Q6 -17 7 -13" stroke="#65a30d" stroke-width=".9" fill="none" stroke-linecap="round"/>` +
  `<ellipse cx="-6" cy="0" rx="8" ry="10.5" fill="#c2410c"/><ellipse cx="6" cy="0" rx="8" ry="10.5" fill="#c2410c"/>` +
  `<ellipse cx="0" cy="0" rx="8.5" ry="11" fill="#f97316"/>` +
  `<path d="M-4.5 -10Q-6 0 -4.5 10M4.5 -10Q6 0 4.5 10" stroke="#c2410c" stroke-width=".7" fill="none"/>` +
  `<path d="M-7.5 -2.5L-3 -2.5L-5.2 -6.8Z M7.5 -2.5L3 -2.5L5.2 -6.8Z" fill="#fde047"/>` +
  `<path d="M-8 2Q0 9.5 8 2L5.2 3.6L3.6 2.2L1.6 4.2L0 2.4L-1.6 4.2L-3.6 2.2L-5.2 3.6Z" fill="#fde047"/></g>`;
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
const anchor = (cx: number, cy: number, s: number, c: string) =>
  `<g transform="translate(${cx} ${cy}) scale(${s})" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">` +
  `<circle cx="0" cy="-15" r="3.6"/><path d="M0 -11.4V14M-8 -6H8M-13 4Q-12 14 0 14Q12 14 13 4"/><path d="M-15.5 7.5L-13 3.5L-9.5 6.5M15.5 7.5L13 3.5L9.5 6.5"/></g>`;
const planet = (cx: number, cy: number, r: number, gradId: string, ring: string) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${r * 2}" ry="${r * 0.55}" fill="none" stroke="${ring}" stroke-width="2" transform="rotate(-18 ${cx} ${cy})" opacity=".85"/>` +
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${gradId})"/>` +
  `<path d="M${f(cx - r * 0.9)} ${f(cy - r * 0.15)}Q${cx} ${f(cy + r * 0.25)} ${f(cx + r * 0.9)} ${f(cy - r * 0.1)}" stroke="#000" stroke-opacity=".15" stroke-width="${f(r * 0.18)}" fill="none"/>` +
  `<path d="M${cx - r * 2} ${cy}A${r * 2} ${r * 0.55} 0 0 0 ${cx + r * 2} ${cy}" fill="none" stroke="${ring}" stroke-width="2" transform="rotate(-18 ${cx} ${cy})"/>`;
const spark = (x: number, y: number, s: number, fill = '#fff') => `<path d="${starPath(x, y, s, s * 0.25, 4)}" fill="${fill}"/>`;
// A maple leaf about 2s tall, stem included, centered on 0,0.
const MAPLE: [number, number][] = [[0, -10], [2, -6], [5, -7], [4, -3], [8, -4], [6, 0], [9, 1], [4, 3], [5, 6], [1, 4], [0.6, 9], [-0.6, 9], [-1, 4], [-5, 6], [-4, 3], [-9, 1], [-6, 0], [-8, -4], [-4, -3], [-5, -7], [-2, -6]];
const maple = (s: number) => `${MAPLE.map(([x, y], i) => `${i ? 'L' : 'M'}${f((x * s) / 10)} ${f((y * s) / 10)}`).join('')}Z`;
const HOLLY = 'M0 -6.5L1.4 -4.4L3.4 -4.6L2.6 -2.2L4.2 0L2.6 2.2L3.4 4.6L1.4 4.4L0 6.5L-1.4 4.4L-3.4 4.6L-2.6 2.2L-4.2 0L-2.6 -2.2L-3.4 -4.6L-1.4 -4.4Z';
const turkey = (cx: number, cy: number, s: number) => {
  const cols = ['#b91c1c', '#ea580c', '#f59e0b', '#fbbf24', '#f59e0b', '#ea580c', '#b91c1c'];
  const fan = cols
    .map((c, i) => `<ellipse cx="0" cy="-12" rx="4.6" ry="12" fill="${c}" transform="rotate(${-72 + i * 24})"/><path d="M0 -3V-22" stroke="#7c2d12" stroke-opacity=".35" stroke-width=".5" transform="rotate(${-72 + i * 24})"/>`)
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
const tree = (cx: number, ty: number, gl: string) => {
  const orn: [number, number, string][] = [[cx - 5, ty + 19, '#ef4444'], [cx + 6, ty + 29, '#facc15'], [cx - 1, ty + 32, '#60a5fa'], [cx - 9, ty + 38, '#facc15'], [cx + 3, ty + 42, '#ef4444'], [cx + 12, ty + 46, '#60a5fa'], [cx - 14, ty + 47, '#ef4444'], [cx + 2, ty + 22, '#60a5fa']];
  return `<rect x="${cx - 3.5}" y="${ty + 49}" width="7" height="9" fill="#78350f"/>` +
    `<path d="M${cx} ${ty + 6}L${cx + 12} ${ty + 22}H${cx - 12}Z M${cx} ${ty + 15}L${cx + 16} ${ty + 36}H${cx - 16}Z M${cx} ${ty + 26}L${cx + 21} ${ty + 50}H${cx - 21}Z" fill="#22c55e" stroke="#15803d" stroke-width=".8" stroke-linejoin="round"/>` +
    `<path d="M${cx - 12} ${ty + 22}Q${cx - 6} ${ty + 20.5} ${cx} ${ty + 22}T${cx + 12} ${ty + 22}M${cx - 16} ${ty + 36}Q${cx - 8} ${ty + 34} ${cx} ${ty + 36}T${cx + 16} ${ty + 36}M${cx - 21} ${ty + 50}Q${cx - 10} ${ty + 47.5} ${cx} ${ty + 50}T${cx + 21} ${ty + 50}" stroke="#f8fafc" stroke-width="1.4" fill="none" stroke-linecap="round"/>` +
    `<path d="M${cx - 8} ${ty + 17}Q${cx} ${ty + 22} ${cx + 9} ${ty + 16}M${cx - 12} ${ty + 30}Q${cx} ${ty + 36} ${cx + 13} ${ty + 28}M${cx - 17} ${ty + 43}Q${cx} ${ty + 50} ${cx + 18} ${ty + 41}" stroke="#facc15" stroke-width=".6" stroke-dasharray="1 1.2" fill="none"/>` +
    orn.map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="1.9" fill="${c}"/><circle cx="${x - 0.6}" cy="${y - 0.6}" r=".6" fill="#fff" opacity=".7"/>`).join('') +
    `<path d="${starPath(cx, ty + 4.5, 5.6, 2.3, 5)}" fill="#facc15" filter="url(#${gl})"/>`;
};
const gift = (x: number, by: number, w: number, h: number, c: string, rib: string) =>
  `<rect x="${f(x - w / 2)}" y="${f(by - h)}" width="${w}" height="${h}" fill="${c}"/><rect x="${f(x - w / 2 - 0.8)}" y="${f(by - h - 2.4)}" width="${f(w + 1.6)}" height="3" fill="${c}" stroke="#000" stroke-opacity=".2" stroke-width=".4"/>` +
  `<rect x="${f(x - 1)}" y="${f(by - h - 2.4)}" width="2" height="${f(h + 2.4)}" fill="${rib}"/>` +
  `<path d="M${x} ${f(by - h - 2.4)}C${x - 4} ${f(by - h - 6.5)} ${x - 5.5} ${f(by - h - 2)} ${x} ${f(by - h - 2.4)}C${x + 4} ${f(by - h - 6.5)} ${x + 5.5} ${f(by - h - 2)} ${x} ${f(by - h - 2.4)}Z" fill="${rib}"/>`;
const bow = (x: number, y: number, c = '#facc15', dark = '#ca8a04') =>
  `<g transform="translate(${x} ${y})"><path d="M0 0C-6 -7 -13 -5 -11 1C-9 6 -3 3 0 0Z M0 0C6 -7 13 -5 11 1C9 6 3 3 0 0Z" fill="${c}" stroke="${dark}" stroke-width=".6"/>` +
  `<path d="M-1 1L-5 10L-2 9L0 3Z M1 1L5 10L2 9L0 3Z" fill="${c}" stroke="${dark}" stroke-width=".4"/><circle r="2" fill="${dark}"/></g>`;
const fish = (x: number, y: number, s: number, fill: string, dir = 1, stripe = 'none') =>
  `<g transform="translate(${x} ${y}) scale(${s * dir} ${s})"><path d="M-6 0C-3 -4 3 -4 6 0C3 4 -3 4 -6 0Z M-6 0L-10 -3.5L-9 0L-10 3.5Z" fill="${fill}"/>` +
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
const ghost = (x: number, y: number, s: number) =>
  `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-8 10V-2A8 8 0 0 1 8 -2V10L5.3 7.5L2.7 10L0 7.5L-2.7 10L-5.3 7.5Z" fill="#f8fafc" opacity=".94"/>` +
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
const snowman = (cx: number, by: number, s: number) =>
  `<g transform="translate(${cx} ${by}) scale(${s})">` +
  `<path d="M-7.5 -23L-16 -29M-13 -27L-15 -31M7.5 -23L16 -29M13 -27L15 -31" stroke="#78350f" stroke-width="1.2" stroke-linecap="round" fill="none"/>` +
  `<circle cx="0" cy="-8" r="10" fill="#f8fafc"/><circle cx="0" cy="-23" r="8" fill="#f8fafc"/><circle cx="0" cy="-35" r="6" fill="#f8fafc"/>` +
  `<path d="M-9 -4Q0 2 9 -4" stroke="#cbd5e1" stroke-width="1" fill="none"/>` +
  `<rect x="-6.5" y="-41.5" width="13" height="2" rx=".5" fill="#111827"/><rect x="-4.2" y="-49" width="8.4" height="7.5" fill="#111827"/><rect x="-4.2" y="-43.6" width="8.4" height="1.6" fill="#dc2626"/>` +
  `<circle cx="-2.2" cy="-36.5" r=".9" fill="#111827"/><circle cx="2.2" cy="-36.5" r=".9" fill="#111827"/><path d="M0 -34.5L6.5 -33.6L0 -32.9Z" fill="#f97316"/>` +
  `<path d="M-3 -31.5Q0 -30 3 -31.5" stroke="#111827" stroke-width=".7" fill="none" stroke-linecap="round"/>` +
  `<path d="M-6.5 -29.5Q0 -27 6.5 -29.5V-27.3Q0 -24.8 -6.5 -27.3Z" fill="#dc2626"/><path d="M3 -28L5 -20.5L2.4 -20.5L1.6 -27.5Z" fill="#b91c1c"/>` +
  `<circle cx="0" cy="-25" r=".9" fill="#111827"/><circle cx="0" cy="-21" r=".9" fill="#111827"/><circle cx="0" cy="-17" r=".9" fill="#111827"/></g>`;
const pie = (cx: number, cy: number, r: number) => {
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
  return `<path d="${crust}Z" fill="#d97706" stroke="#92400e" stroke-width=".8"/><circle cx="${cx}" cy="${cy}" r="${f(r * 0.84)}" fill="#ea580c"/>` +
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
const scalesD = () => {
  let d = '';
  for (let row = 0; row < 17; row++) {
    const y = row * 8.5;
    for (let col = -1; col < 12; col++) {
      const x = col * 10 + (row % 2 ? 5 : 0);
      d += `M${x - 5} ${f(y)}A5 5 0 0 0 ${x + 5} ${f(y)}`;
    }
  }
  return d;
};
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
}
function card({ label, bg, edge, frame, hair = frame, frameW = 1.5, defs = '', inner = '', over = '', corner = null, sheen = 0.12 }: CardSpec) {
  const g = nextId('cg'), c = nextId('cc'), sh = nextId('sh'), vg = nextId('vg');
  return `${svgOpen('0 0 100 140', label)}<defs>${lin(g, bg, 1, 1)}<clipPath id="${c}"><rect x="1" y="1" width="98" height="138" rx="8"/></clipPath>` +
    `<linearGradient id="${sh}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${sheen}"/><stop offset=".42" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="${sheen / 2}"/></linearGradient>` +
    `${rad(vg, [[0.55, '#000', 0], [1, '#000', 0.4]])}${defs}</defs>` +
    `<rect x="1" y="1" width="98" height="138" rx="8" fill="url(#${g})"/><g clip-path="url(#${c})">${inner}<rect x="0" y="0" width="100" height="140" fill="url(#${vg})"/></g>` +
    `<rect x="7" y="7" width="86" height="126" rx="5" fill="none" stroke="${frame}" stroke-width="${frameW}"/>` +
    `<rect x="9.6" y="9.6" width="80.8" height="120.8" rx="3.5" fill="none" stroke="${hair}" stroke-opacity=".45" stroke-width=".5"/>` +
    `${corner ? corners(corner) : ''}${over}` +
    `<rect x="1" y="1" width="98" height="138" rx="8" fill="url(#${sh})"/><rect x="1" y="1" width="98" height="138" rx="8" fill="none" stroke="${edge}" stroke-width="2"/></svg>`;
}

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
}
function chip({ label, main, spot, ring, ringDash = '4 3', ringW = 2, inlay, inlayStroke = 'none', defs = '', emblem = '', text = ring, tick = '#fff', band = null }: ChipSpec) {
  const g = nextId('pg'), tp = nextId('tp');
  let spots = '';
  for (let i = 0; i < 6; i++) {
    const fill = Array.isArray(spot) ? spot[i % spot.length] : spot;
    spots += `<g transform="rotate(${i * 60} 50 50)"><rect x="44" y="3" width="12" height="10" rx="1.5" fill="${fill}"/><rect x="45.6" y="4.6" width="8.8" height="6.8" rx="1" fill="none" stroke="#000" stroke-opacity=".22" stroke-width=".6"/></g>`;
  }
  let ticks = '';
  for (let s = 0; s < 6; s++) {
    for (const d of [20, 30, 40]) {
      const [x0, y0] = pol(50, 50, 44, s * 60 + d);
      const [x1, y1] = pol(50, 50, 46.6, s * 60 + d);
      ticks += `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`;
    }
  }
  return `${svgOpen('0 0 100 100', label)}<defs>${lin(g, main, 1, 1)}<path id="${tp}" d="M50 17.6A32.4 32.4 0 1 1 49.99 17.6"/>${defs}</defs>` +
    `<circle cx="50" cy="52" r="47" fill="#000" opacity=".4"/><circle cx="50" cy="50" r="47" fill="url(#${g})"/>${spots}` +
    (tick === 'none' ? '' : `<path d="${ticks}" stroke="${tick}" stroke-opacity=".5" stroke-width="1.2" stroke-linecap="round"/>`) +
    `<circle cx="50" cy="50" r="47" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="1.2"/><circle cx="50" cy="50" r="43.4" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width=".6"/>` +
    `<circle cx="50" cy="50" r="36" fill="none" stroke="${ring}" stroke-width="${ringW}" stroke-dasharray="${ringDash}"/>` +
    (band ? `<circle cx="50" cy="50" r="32.4" fill="none" stroke="${band}" stroke-width="6.2"/>` : '') +
    `<text font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="3.4" fill="${text}" fill-opacity=".85"><textPath href="#${tp}" textLength="199" lengthAdjust="spacingAndGlyphs">${CHIP_TEXT}</textPath></text>` +
    `<circle cx="50" cy="50" r="29" fill="${inlay}" stroke="${inlayStroke}" stroke-width="1.5"/><circle cx="50" cy="50" r="26.6" fill="none" stroke="${inlayStroke}" stroke-opacity=".45" stroke-width=".5"/>${emblem}` +
    `<path d="M14 38A38 38 0 0 1 62 13" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="3" stroke-linecap="round"/></svg>`;
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

// ---------- every cosmetic, by art key ----------
const ART: Record<string, () => string> = {
  // Classic (the defaults, SRS-119.4)
  'classic-navy': () => card({ label: 'Classic Navy card back', bg: ['#1e40af', '#172554'], edge: '#e2e8f0', frame: '#e2e8f0',
    inner: `<path d="${latticeD(8)}" stroke="#e2e8f0" stroke-opacity=".22" stroke-width=".7" fill="none"/>`,
    corner: (x, y) => `<path transform="translate(${x} ${y})" d="M0 -2.6L1.9 0L0 2.6L-1.9 0Z" fill="#e2e8f0" opacity=".85"/>`,
    over: `<ellipse cx="50" cy="70" rx="16" ry="22" fill="#172554" stroke="#e2e8f0" stroke-width="1.2"/><ellipse cx="50" cy="70" rx="13.5" ry="19.5" fill="none" stroke="#e2e8f0" stroke-opacity=".5" stroke-width=".5"/><text x="50" y="80" text-anchor="middle" font-size="27" fill="#e2e8f0" font-family="Georgia, 'Times New Roman', serif">♠</text>` }),
  'classic-red': () => chip({ label: 'Classic Red chip', main: ['#ef4444', '#b91c1c'], spot: '#f8fafc', ring: '#f8fafc', inlay: '#f8fafc', inlayStroke: '#b91c1c',
    emblem: `<text x="50" y="60" text-anchor="middle" font-size="28" fill="#b91c1c" font-family="Georgia, 'Times New Roman', serif">♠</text>` }),
  'classic-ring': () => outline({ label: 'Classic Ring profile outline', over: `<circle cx="60" cy="60" r="44" fill="none" stroke="#64748b" stroke-width="3"/><circle cx="60" cy="60" r="47.5" fill="none" stroke="#475569" stroke-width=".8"/>` }),

  // Neon
  'neon-horizon': () => {
    const gl = nextId('gl'), sun = nextId('sun'), r = rnd(3);
    let grid = '';
    [82, 86, 91, 98, 107, 119, 134].forEach((y) => (grid += `M0 ${y}H100`));
    for (let k = -6; k <= 6; k++) grid += `M${50 + k * 5} 78L${50 + k * 26} 140`;
    let stripes = '';
    [61, 66, 70.5, 74.5].forEach((y, i) => (stripes += `<rect x="20" y="${y}" width="60" height="${f(1.2 + i * 0.5)}" fill="#14072f"/>`));
    let stars = '';
    for (let i = 0; i < 20; i++) stars += `<circle cx="${f(r() * 100)}" cy="${f(8 + r() * 30)}" r="${f(0.3 + r() * 0.6)}" fill="#fff" opacity="${f(0.4 + r() * 0.6)}"/>`;
    const mtn = `<path d="M0 78L7 70L13 73L22 62L31 78Z M69 78L77 65L84 71L92 63L100 69V78Z" fill="#14072f" stroke="#8b5cf6" stroke-width=".8" filter="url(#${gl})"/>` +
      `<path d="M13 73L17 78M22 62L25 78M77 65L80 78M92 63L91 78" stroke="#8b5cf6" stroke-opacity=".6" stroke-width=".5"/>`;
    return card({ label: 'Neon Horizon card back', bg: ['#1a0b3d', '#0a0420'], edge: '#ff3fd2', frame: 'none', hair: '#2ef2ff', defs: glow(gl, 1.2) + lin(sun, ['#ffe066', '#ff3fd2', '#8b5cf6']),
      inner: `${stars}${spark(14, 18, 2.2)}${spark(84, 28, 1.6)}<circle cx="50" cy="56" r="22" fill="url(#${sun})"/>${stripes}${mtn}<rect x="0" y="78" width="100" height="62" fill="#0a0420"/>` +
        `<path d="${grid}" stroke="#2ef2ff" stroke-width=".8" fill="none" filter="url(#${gl})" opacity=".9"/><path d="M0 78H100" stroke="#ff3fd2" stroke-width="1.3" filter="url(#${gl})"/>`,
      corner: (x, y, rot) => `<path transform="translate(${x - 3} ${y - 3}) rotate(${rot} 3 3)" d="M0 7V0H7" stroke="#2ef2ff" stroke-width="1.3" fill="none" filter="url(#${gl})"/>`,
      over: `<rect x="7" y="7" width="86" height="126" rx="5" fill="none" stroke="#ff3fd2" stroke-width="1.4" filter="url(#${gl})"/>` });
  },
  'neon-volt': () => {
    const gl = nextId('gl');
    return chip({ label: 'Neon Volt chip', main: ['#2a1059', '#0f0628'], spot: ['#ff3fd2', '#2ef2ff'], ring: '#2ef2ff', ringDash: 'none', ringW: 1.2, inlay: '#0a0420', inlayStroke: '#ff3fd2',
      defs: glow(gl, 1.4), tick: 'none', band: '#0a0420', text: '#f5f3ff',
      emblem: `<path d="M54 29L39 53H48.5L44.5 71L61 45.5H51.5Z" fill="#ff3fd2" filter="url(#${gl})"/>` });
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
    const gl = nextId('gl'), eq = nextId('eq'), r = rnd(31);
    let bars = '';
    for (let i = 0; i < 13; i++) {
      const x = 11 + i * 6.25, h = 8 + r() * 30;
      bars += `<rect x="${f(x)}" y="${f(126 - h)}" width="4.2" height="${f(h)}" fill="url(#${eq})" filter="url(#${gl})"/><rect x="${f(x)}" y="${f(122.5 - h)}" width="4.2" height="1.4" fill="#fff"/>`;
    }
    let scan = '';
    for (let y = 2; y < 140; y += 2.6) scan += `M0 ${f(y)}H100`;
    const spade = 'M50 28C50 28 29 45 29 56C29 64 37 69 45.5 63.5L43.5 73H56.5L54.5 63.5C63 69 71 64 71 56C71 45 50 28 50 28Z';
    return card({ label: 'Neon Arcade card back', bg: ['#1b0536', '#0d0221'], edge: '#2ef2ff', frame: 'none', hair: '#ff3fd2', defs: glow(gl, 1.3) + lin(eq, ['#ff3fd2', '#8b5cf6', '#2ef2ff']),
      inner: `${bars}<path d="${scan}" stroke="#000" stroke-opacity=".28" stroke-width=".8"/>`,
      corner: (x, y) => `<g transform="translate(${x} ${y})" fill="#ff3fd2"><rect x="-2.6" y="-2.6" width="2.2" height="2.2"/><rect x=".4" y="-2.6" width="2.2" height="2.2" opacity=".5"/><rect x="-2.6" y=".4" width="2.2" height="2.2" opacity=".5"/></g>`,
      over: `<path d="${spade}" fill="#0d0221" stroke="#2ef2ff" stroke-width="2" filter="url(#${gl})"/><path d="${spade}" fill="none" stroke="#ff3fd2" stroke-width="1.4" transform="translate(50 52) scale(.68) translate(-50 -52)" filter="url(#${gl})"/>` +
        `<rect x="7" y="7" width="86" height="126" rx="5" fill="none" stroke="#2ef2ff" stroke-width="1.4" filter="url(#${gl})"/>` });
  },
  'neon-pulse': () => {
    const gl = nextId('gl'), cl = nextId('cl');
    return chip({ label: 'Neon Pulse chip', main: ['#0e3b4a', '#04161d'], spot: '#2ef2ff', ring: '#ff3fd2', ringDash: 'none', ringW: 1.2, inlay: '#020617', inlayStroke: '#2ef2ff',
      tick: 'none', band: '#020617', text: '#e0faff',
      defs: glow(gl, 1.3) + `<clipPath id="${cl}"><circle cx="50" cy="50" r="27"/></clipPath>`,
      emblem: `<g clip-path="url(#${cl})"><path d="M21 52H35L39 44L43.5 60L48 34L53 67L57 50L61 52H79" stroke="#ff3fd2" stroke-width="2.2" fill="none" stroke-linejoin="round" filter="url(#${gl})"/></g><circle cx="48" cy="34" r="1.6" fill="#fff"/>` });
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
    const gold = nextId('gd');
    let beads = '';
    for (let i = 0; i < 32; i++) {
      const t = (i / 32) * Math.PI * 2;
      beads += `<circle cx="${f(50 + 26.2 * Math.cos(t))}" cy="${f(70 + 34.2 * Math.sin(t))}" r=".9" fill="#f8e08e"/>`;
    }
    return card({ label: 'Royal Crest card back', bg: ['#6b1230', '#2a0716'], edge: '#d4af37', frame: `url(#${gold})`, hair: '#d4af37', frameW: 2, defs: lin(gold, ['#f8e08e', '#c9971c', '#8a6212'], 1, 1),
      inner: `<path d="${latticeD(9)}" stroke="#d4af37" stroke-opacity=".28" stroke-width=".7" fill="none"/>`,
      corner: (x, y, rot) => fleur(x, y, 0.42, '#d4af37', rot - 45),
      over: `${beads}<ellipse cx="50" cy="70" rx="23" ry="31" fill="#4a0b22" stroke="url(#${gold})" stroke-width="2"/><ellipse cx="50" cy="70" rx="19.5" ry="27.5" fill="none" stroke="#d4af37" stroke-opacity=".7" stroke-width=".6"/>` +
        `${crown(50, 66, 1, `url(#${gold})`, '#e11d48')}${laurel(50, 70, 16, 215, 300, 4, '#d4af37', 0.55)}${laurel(50, 70, 16, 145, 60, 4, '#d4af37', 0.55)}` +
        `<path d="M50 9.5L52.5 12L50 14.5L47.5 12Z M50 125.5L52.5 128L50 130.5L47.5 128Z" fill="url(#${gold})"/>` });
  },
  'royal-sovereign': () => {
    const gold = nextId('gd');
    return chip({ label: 'Royal Sovereign chip', main: ['#f8e08e', '#c9971c', '#8a6212'], spot: '#5b0f2a', ring: '#5b0f2a', ringDash: 'none', inlay: '#5b0f2a', inlayStroke: '#f8e08e', tick: '#5b0f2a',
      defs: lin(gold, ['#f8e08e', '#c9971c']), emblem: crown(50, 51, 1.05, `url(#${gold})`, '#e11d48') });
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
    const gold = nextId('gd'), gm = nextId('gm');
    let damask = '';
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 6; col++) damask += fleur(col * 20 + (row % 2 ? 10 : 0), row * 19 + 4, 0.55, '#d4af37');
    }
    return card({ label: 'Royal Damask card back', bg: ['#1c2c6b', '#0a1230'], edge: '#d4af37', frame: `url(#${gold})`, hair: '#d4af37', frameW: 2,
      defs: lin(gold, ['#f8e08e', '#c9971c', '#8a6212'], 1, 1) + lin(gm, ['#f0f9ff', '#7dd3fc', '#0369a1'], 0.6, 1),
      inner: `<g opacity=".2">${damask}</g>`,
      corner: (x, y, rot) => `<path transform="translate(${x} ${y}) rotate(${rot})" d="M-2 6Q-2 -2 6 -2M1 6Q1 1 6 1" stroke="#d4af37" stroke-width=".8" fill="none"/>`,
      over: `<path d="M50 34L76 70L50 106L24 70Z" fill="#0a1230" stroke="url(#${gold})" stroke-width="2"/><path d="M50 40L71.5 70L50 100L28.5 70Z" fill="none" stroke="#d4af37" stroke-opacity=".7" stroke-width=".6"/>` +
        `${gem(50, 69, 1.25, gm)}${spark(50, 47, 2.6, '#f8e08e')}${spark(50, 93, 2.6, '#f8e08e')}${spark(35, 70, 2, '#f8e08e')}${spark(65, 70, 2, '#f8e08e')}` });
  },
  'royal-signet': () => {
    const gold = nextId('gd'), gm = nextId('gm');
    return chip({ label: 'Royal Signet chip', main: ['#1f2937', '#030712'], spot: `url(#${gold})`, ring: '#d4af37', ringDash: 'none', inlay: '#0b0b0b', inlayStroke: '#d4af37', tick: '#d4af37', text: '#d4af37',
      defs: lin(gold, ['#f8e08e', '#c9971c', '#8a6212'], 1, 1) + lin(gm, ['#f0f9ff', '#7dd3fc', '#0369a1'], 0.6, 1),
      emblem: `${laurel(50, 50, 19, 200, 335, 6, '#d4af37', 0.75)}${laurel(50, 50, 19, 160, 25, 6, '#d4af37', 0.75)}${gem(50, 50, 0.85, gm)}` });
  },
  'golden-laurel': () => {
    const gold = nextId('gd'), gm = nextId('gm');
    return outline({ label: 'Golden Laurel profile outline', defs: lin(gold, ['#f8e08e', '#c9971c', '#8a6212'], 1, 1) + lin(gm, ['#f0f9ff', '#7dd3fc', '#0369a1'], 0.6, 1),
      over: `<circle cx="60" cy="60" r="44.5" fill="none" stroke="url(#${gold})" stroke-width="2"/>${laurel(60, 60, 49, 195, 345, 9, '#d4af37', 1.05, '#8a6212')}${laurel(60, 60, 49, 165, 15, 9, '#d4af37', 1.05, '#8a6212')}` +
        `${bow(60, 108, '#9f1239', '#5b0f2a')}${gem(60, 10, 0.55, gm)}` });
  },

  // Ocean
  'deep-anchor': () => {
    const r = rnd(7);
    let bubbles = '';
    for (let i = 0; i < 10; i++) bubbles += `<circle cx="${f(12 + r() * 76)}" cy="${f(16 + r() * 56)}" r="${f(0.8 + r() * 1.8)}" fill="none" stroke="#bae6fd" stroke-opacity=".55" stroke-width=".6"/>`;
    const rays = `<path d="M18 0H28L52 92H34Z M44 0H52L70 92H58Z M70 0H76L88 92H80Z" fill="#e0f2fe" opacity=".06"/>`;
    let rope = '';
    for (let y = 40; y <= 66; y += 3.2) rope += `M47.4 ${f(y)}L52.6 ${f(y + 1.6)}`;
    return card({ label: 'Deep Anchor card back', bg: ['#0e7490', '#082f49'], edge: '#22d3ee', frame: '#7dd3fc',
      inner: `${rays}${bubbles}${fish(22, 36, 0.8, '#0c4a6e')}${fish(78, 28, 0.6, '#0c4a6e', -1)}${waveFill(88, 3, 34, 0, '#0c4a6e')}${seaweed(14, 120, 26, '#0d9488')}${seaweed(86, 122, 30, '#0f766e')}` +
        `${waveFill(100, 3.5, 40, 1.4, '#075985')}${waveFill(113, 3, 30, 2.6, '#0369a1')}${waveFill(126, 2.5, 36, 0.8, '#0284c7')}<path d="${waveD(0, 100, 88, 3, 34, 0)}" stroke="#e0f2fe" stroke-opacity=".55" stroke-width=".8" fill="none"/>`,
      corner: (x, y, rot) => `<g transform="rotate(${rot - 45} ${x} ${y})">${shell(x, y, 0.3, '#e0f2fe', '#7dd3fc')}</g>`,
      over: `${anchor(50, 52, 1.25, '#e0f2fe')}<path d="${rope}" stroke="#d6b98c" stroke-width="1.1" stroke-linecap="round"/>` });
  },
  'ocean-tide': () => chip({ label: 'Ocean Tide chip', main: ['#0891b2', '#155e75'], spot: '#e0f2fe', ring: '#e0f2fe', inlay: '#082f49', inlayStroke: '#22d3ee',
    emblem: `<path d="${waveD(29, 71, 42, 3.2, 14, 0)}" stroke="#e0f2fe" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="${waveD(31, 69, 50.5, 3.2, 14, 0)}" stroke="#22d3ee" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="${waveD(35, 65, 59, 3.2, 14, 0)}" stroke="#0e7490" stroke-width="2.4" fill="none" stroke-linecap="round"/>` }),
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
    const r = rnd(41);
    let bubbles = '';
    for (let i = 0; i < 8; i++) bubbles += `<circle cx="${f(10 + r() * 80)}" cy="${f(14 + r() * 60)}" r="${f(0.7 + r() * 1.5)}" fill="none" stroke="#bae6fd" stroke-opacity=".6" stroke-width=".6"/>`;
    return card({ label: 'Coral Reef card back', bg: ['#0284c7', '#0c4a6e'], edge: '#fb7185', frame: '#7dd3fc',
      inner: `<path d="M16 0H24L44 100H30Z M52 0H58L76 100H66Z" fill="#e0f2fe" opacity=".08"/>${bubbles}` +
        `${fish(30, 46, 1.2, '#fbbf24', 1, '#fff')}${fish(68, 36, 1, '#fb7185', -1, '#fff')}${fish(58, 66, 0.9, '#38bdf8', 1, '#0c4a6e')}${fish(24, 82, 0.8, '#f97316', -1, '#fff')}${fish(80, 84, 0.7, '#a78bfa', -1, '#fff')}` +
        `${seaweed(12, 130, 34, '#14b8a6')}${seaweed(18, 130, 24, '#0d9488')}${seaweed(90, 130, 30, '#14b8a6')}` +
        `<path d="M0 122Q20 116 40 121T80 119T100 120V140H0Z" fill="#e7d3a6"/><path d="M8 128h3M30 131h2M62 127h3M84 132h2" stroke="#c9a66b" stroke-width=".8"/>` +
        `${coral(28, 124, 1.15, '#fb7185')}${coral(72, 125, 1.3, '#f97316')}${coral(50, 127, 0.85, '#f472b6')}<circle cx="40" cy="123" r="2.4" fill="#fde68a"/>${shell(62, 128, 0.35, '#fef3c7', '#d6b98c')}`,
      corner: (x, y) => spark(x, y, 2, '#e0f2fe') });
  },
  'pearl-diver': () => {
    const pr = nextId('pr');
    return chip({ label: 'Pearl Diver chip', main: ['#ecfeff', '#a5f3fc', '#67e8f9'], spot: '#0e7490', ring: '#0e7490', ringDash: '3 2', inlay: '#164e63', inlayStroke: '#ecfeff', tick: '#0e7490', text: '#0e7490',
      defs: rad(pr, [[0, '#ffffff'], [0.7, '#f5f3ff'], [1, '#c4b5fd']], 0.35, 0.35, 0.65),
      emblem: `${shell(50, 51, 1.85, '#fef3c7', '#d6b98c')}<circle cx="50" cy="55" r="4.2" fill="url(#${pr})"/>` });
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
    const r = rnd(11), gl = nextId('gl'), heat = nextId('ht');
    let embers = '';
    for (let i = 0; i < 26; i++) embers += `<circle cx="${f(r() * 100)}" cy="${f(10 + r() * 66)}" r="${f(0.4 + r())}" fill="${r() > 0.5 ? '#fbbf24' : '#f97316'}" opacity="${f(0.4 + r() * 0.6)}"/>`;
    const row = (scale: number, color: string, seed: number) => {
      const q = rnd(seed);
      let d = '';
      for (let x = -6; x <= 106; x += 12) d += flame(x + q() * 4, 142, 14 * scale, (26 + q() * 22) * scale);
      return `<path d="${d}" fill="${color}"/>`;
    };
    let ring = '';
    for (let i = 0; i < 12; i++) ring += `<path transform="rotate(${i * 30} 50 46)" d="${flame(50, 27.5, 4.5, 7)}" fill="${i % 2 ? '#f97316' : '#fbbf24'}"/>`;
    return card({ label: 'Inferno Blaze card back', bg: ['#2b0a05', '#120302'], edge: '#f97316', frame: '#f97316', defs: glow(gl, 1) + rad(heat, [[0, '#f97316', 0.45], [1, '#f97316', 0]]),
      inner: `<g filter="url(#${gl})">${embers}</g>${row(2.1, '#7f1d1d', 3)}${row(1.7, '#dc2626', 5)}${row(1.3, '#f97316', 9)}${row(0.85, '#fde047', 13)}`,
      corner: (x, y) => `<path d="${flame(x, y + 3, 4, 7)}" fill="#f97316"/><path d="${flame(x, y + 3, 2, 4)}" fill="#fde047"/>`,
      over: `<circle cx="50" cy="46" r="28" fill="url(#${heat})"/>${ring}<circle cx="50" cy="46" r="17" fill="#1c0703" stroke="#f97316" stroke-width="1.5"/><circle cx="50" cy="46" r="14.8" fill="none" stroke="#f97316" stroke-opacity=".5" stroke-width=".5"/>` +
        `<path d="${flame(50, 58, 16, 25)}" fill="#dc2626"/><path d="${flame(50, 58, 12, 20)}" fill="#f97316"/><path d="${flame(50, 58, 7, 13)}" fill="#fde047"/>` });
  },
  'inferno-ember': () => {
    const g = nextId('fg'), gl = nextId('gl');
    return chip({ label: 'Inferno Ember chip', main: ['#991b1b', '#450a0a'], spot: [`url(#${g})`], ring: '#f97316', ringDash: '2 3', inlay: '#1c0703', inlayStroke: '#f97316', tick: '#fbbf24', text: '#fbbf24',
      defs: lin(g, ['#fde047', '#f97316']) + glow(gl, 1.2),
      emblem: `<g filter="url(#${gl})"><path d="${flame(50, 68, 22, 35)}" fill="#dc2626"/><path d="${flame(50, 68, 15, 26)}" fill="#f97316"/><path d="${flame(50, 68, 8, 16)}" fill="#fde047"/></g><path d="${flame(42, 68, 6, 12)}" fill="#f97316"/><path d="${flame(58, 68, 6, 12)}" fill="#f97316"/>` });
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
    const iris = nextId('ir'), gl = nextId('gl');
    return card({ label: 'Dragon Eye card back', bg: ['#4c0f0f', '#120302'], edge: '#f97316', frame: '#ea580c',
      defs: rad(iris, [[0, '#fef08a'], [0.45, '#f59e0b'], [0.8, '#dc2626'], [1, '#7f1d1d']]) + glow(gl, 1.4),
      inner: `<path d="${scalesD()}" fill="none" stroke="#f97316" stroke-opacity=".28" stroke-width=".8"/>`,
      corner: (x, y, rot) => `<path transform="translate(${x} ${y}) rotate(${rot - 45})" d="M0 -5Q2 0 0 5Q-1 0 0 -5Z" fill="#f97316"/>`,
      over: `<path d="M16 70Q50 34 84 70Q50 106 16 70Z" fill="#1c0703"/><path d="M22 70Q50 44 78 70Q50 96 22 70Z" fill="url(#${iris})" filter="url(#${gl})"/>` +
        `<path d="M22 70Q50 44 78 70Q50 96 22 70Z" fill="none" stroke="#1c0703" stroke-width="2"/>` +
        `<path d="M32 70H68M50 50V90M36 58L64 82M36 82L64 58" stroke="#7f1d1d" stroke-opacity=".35" stroke-width=".6"/>` +
        `<path d="M50 51Q55.5 70 50 89Q44.5 70 50 51Z" fill="#0a0302"/><ellipse cx="45" cy="61" rx="2.6" ry="1.6" fill="#fff" opacity=".8"/>` +
        `<path d="M14 66Q50 26 86 66" stroke="#7f1d1d" stroke-width="2.4" fill="none"/><path d="M18 60L12 54M28 51L24 44M40 46L38 38M60 46L62 38M72 51L76 44M82 60L88 54" stroke="#ea580c" stroke-width="1.6" stroke-linecap="round"/>` });
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
    return chip({ label: 'Magma Core chip', main: ['#292524', '#0c0a09'], spot: ['#f97316', '#dc2626'], ring: '#f97316', ringDash: '1 3', inlay: '#1c0703', inlayStroke: '#ea580c', tick: '#f97316', text: '#f97316',
      defs: glow(gl, 1.2) + rad(core, [[0, '#fef08a', 1], [0.5, '#f97316', 0.8], [1, '#f97316', 0]]),
      emblem: `<circle cx="50" cy="50" r="12" fill="url(#${core})"/><path d="${cracks}" stroke="#f97316" stroke-width="1.3" fill="none" stroke-linejoin="round" filter="url(#${gl})"/><path d="${cracks}" stroke="#fde047" stroke-width=".5" fill="none"/>` });
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
    const n1 = nextId('nb'), n2 = nextId('nb'), n3 = nextId('nb'), pg = nextId('pl'), ss = nextId('ss'), r = rnd(5);
    let stars = '';
    for (let i = 0; i < 52; i++) {
      const s = r();
      stars += `<circle cx="${f(r() * 100)}" cy="${f(r() * 140)}" r="${f(0.3 + s * 0.9)}" fill="#fff" opacity="${f(0.35 + s * 0.65)}"/>`;
    }
    const pts: [number, number][] = [[16, 30], [25, 22], [35, 27], [40, 16], [49, 21]];
    const constel = `<path d="M${pts.map((p) => p.join(' ')).join('L')}" stroke="#e9d5ff" stroke-opacity=".4" stroke-width=".5" fill="none"/>${pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.1" fill="#fff"/>`).join('')}`;
    return card({ label: 'Galaxy Nebula card back', bg: ['#1e1b4b', '#0b0726'], edge: '#a78bfa', frame: '#c4b5fd',
      defs: rad(n1, [[0, '#f472b6', 0.75], [1, '#f472b6', 0]]) + rad(n2, [[0, '#60a5fa', 0.6], [1, '#60a5fa', 0]]) + rad(n3, [[0, '#a78bfa', 0.5], [1, '#a78bfa', 0]]) + rad(pg, [[0, '#fde68a'], [1, '#f59e0b']], 0.35, 0.35, 0.7) +
        `<linearGradient id="${ss}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff"/></linearGradient>`,
      inner: `<circle cx="30" cy="40" r="38" fill="url(#${n1})"/><circle cx="72" cy="104" r="42" fill="url(#${n2})"/><circle cx="78" cy="48" r="26" fill="url(#${n3})"/>${stars}${constel}` +
        `${spark(20, 108, 4)}${spark(82, 24, 3.2)}${spark(26, 82, 2.4)}<path d="M60 118L86 102" stroke="url(#${ss})" stroke-width="1.2" stroke-linecap="round"/><circle cx="86" cy="102" r="1.2" fill="#fff"/>`,
      corner: (x, y) => spark(x, y, 2.2, '#c4b5fd'),
      over: planet(50, 70, 11, pg, '#e9d5ff') });
  },
  'galaxy-orbit': () => {
    const pg = nextId('pl'), r = rnd(9);
    let stars = '';
    for (let i = 0; i < 16; i++) {
      const [x, y] = pol(50, 50, 9 + r() * 17, r() * 360);
      stars += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.4 + r() * 0.7)}" fill="#fff" opacity=".85"/>`;
    }
    return chip({ label: 'Galaxy Orbit chip', main: ['#4c1d95', '#1e1b4b'], spot: '#c4b5fd', ring: '#c4b5fd', ringDash: '1.5 3', inlay: '#0b0726', inlayStroke: '#a78bfa',
      defs: rad(pg, [[0, '#fde68a'], [1, '#f472b6']], 0.35, 0.35, 0.7), emblem: stars + planet(50, 50, 7, pg, '#e9d5ff') + spark(38, 38, 2) + spark(63, 62, 1.6) });
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
    const cor = nextId('cr'), r = rnd(61);
    let stars = '';
    for (let i = 0; i < 40; i++) {
      const s = r();
      stars += `<circle cx="${f(r() * 100)}" cy="${f(r() * 140)}" r="${f(0.3 + s * 0.8)}" fill="#fff" opacity="${f(0.3 + s * 0.6)}"/>`;
    }
    let rays = '';
    for (let i = 0; i < 28; i++) {
      const a = i * (360 / 28) + r() * 4, len = 26 + r() * 14;
      const [x1, y1] = pol(50, 66, 17, a - 2);
      const [x2, y2] = pol(50, 66, len, a);
      const [x3, y3] = pol(50, 66, 17, a + 2);
      rays += `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}L${f(x3)} ${f(y3)}Z`;
    }
    const [fx, fy] = pol(50, 66, 17.5, 40);
    return card({ label: 'Total Eclipse card back', bg: ['#1e1b4b', '#020617'], edge: '#a78bfa', frame: '#c4b5fd',
      defs: rad(cor, [[0.4, '#fff7ed', 1], [0.55, '#fde68a', 0.9], [0.75, '#f472b6', 0.35], [1, '#7c3aed', 0]]),
      inner: `${stars}<circle cx="50" cy="66" r="44" fill="none" stroke="#c4b5fd" stroke-opacity=".12" stroke-width=".6"/><circle cx="50" cy="66" r="36" fill="url(#${cor})"/><path d="${rays}" fill="#fff7ed" opacity=".22"/>`,
      corner: (x, y) => `<circle cx="${x}" cy="${y}" r="2.2" fill="#fde68a"/><circle cx="${x + 0.9}" cy="${y - 0.5}" r="1.8" fill="#1e1b4b"/>`,
      over: `<circle cx="50" cy="66" r="17" fill="#020617"/><circle cx="50" cy="66" r="17" fill="none" stroke="#fff7ed" stroke-opacity=".8" stroke-width=".6"/>` +
        `<circle cx="${f(fx)}" cy="${f(fy)}" r="2.2" fill="#fff"/>${spark(fx, fy, 7)}` });
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
    return chip({ label: 'Supernova chip', main: ['#581c87', '#1e1b4b'], spot: '#f0abfc', ring: '#f0abfc', ringDash: '4 2', inlay: '#0b0726', inlayStroke: '#e879f9', tick: '#f0abfc',
      defs: rad(rg, [[0, '#ffffff'], [0.5, '#f0abfc'], [1, '#c026d3']]) + rad(cg, [[0, '#ffffff', 1], [0.6, '#fde68a', 0.9], [1, '#fde68a', 0]]) + glow(gl, 1.2),
      emblem: `<path d="${rays}" fill="url(#${rg})" filter="url(#${gl})"/><circle cx="50" cy="50" r="7" fill="url(#${cg})"/>${spark(36, 36, 1.6)}${spark(66, 62, 1.4)}${spark(64, 35, 1.2)}` });
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
    const mg = nextId('mn'), r = rnd(71);
    let web = '<g stroke="#e9d5ff" stroke-opacity=".45" stroke-width=".5" fill="none">';
    const angles = [0, 18, 36, 54, 72, 90].map((d) => (d * Math.PI) / 180);
    angles.forEach((a) => (web += `<path d="M7 7L${f(7 + 30 * Math.cos(a))} ${f(7 + 30 * Math.sin(a))}"/>`));
    [8, 15, 22, 29].forEach((R) => {
      let d = '';
      for (let i = 0; i < angles.length - 1; i++) {
        const a0 = angles[i], a1 = angles[i + 1], am = (a0 + a1) / 2;
        d += `${i ? '' : `M${f(7 + R * Math.cos(a0))} ${f(7 + R * Math.sin(a0))}`}Q${f(7 + R * 0.84 * Math.cos(am))} ${f(7 + R * 0.84 * Math.sin(am))} ${f(7 + R * Math.cos(a1))} ${f(7 + R * Math.sin(a1))}`;
      }
      web += `<path d="${d}"/>`;
    });
    web += '</g>';
    let stars = '';
    for (let i = 0; i < 12; i++) stars += `<circle cx="${f(30 + r() * 66)}" cy="${f(8 + r() * 50)}" r="${f(0.3 + r() * 0.5)}" fill="#fef3c7" opacity="${f(0.4 + r() * 0.5)}"/>`;
    return card({ label: 'Haunted Moon card back', bg: ['#2e1065', '#0d0618'], edge: '#f97316', frame: '#f97316', defs: rad(mg, [[0, '#fffbeb'], [1, '#fde68a']]),
      inner: `${stars}<circle cx="68" cy="34" r="15" fill="url(#${mg})"/><circle cx="63" cy="30" r="2.5" fill="#fcd34d" opacity=".5"/><circle cx="72" cy="40" r="1.8" fill="#fcd34d" opacity=".5"/><circle cx="70" cy="28" r="1.2" fill="#fcd34d" opacity=".5"/>` +
        `${bat(42, 30, 1, '#0a0412')}${bat(58, 46, 0.7, '#0a0412')}${bat(82, 58, 0.55, '#0a0412')}${web}${spider(24, 12, 30)}` +
        `<path d="M0 116Q20 106 40 114T80 110T100 112V140H0Z" fill="#0a0412"/>${tomb(16, 117, 8, 12, '#1f1530')}${tomb(84, 113, 9, 14, '#1f1530')}${tomb(74, 116, 6, 9, '#1f1530')}` +
        `<path d="M26 120V113M30 119V112M34 118V111M24 116H36" stroke="#1f1530" stroke-width="1.2"/>`,
      corner: (x, y, rot) => (rot === 0 ? '' : `<circle cx="${x}" cy="${y}" r="1.3" fill="#f97316"/>`),
      over: pumpkin(50, 100, 1.5) });
  },
  'graveyard-ghost': () => {
    const mg = nextId('mn'), gl = nextId('gl'), r = rnd(81);
    let stars = '';
    for (let i = 0; i < 18; i++) stars += `<circle cx="${f(r() * 100)}" cy="${f(6 + r() * 60)}" r="${f(0.3 + r() * 0.6)}" fill="#e0e7ff" opacity="${f(0.4 + r() * 0.5)}"/>`;
    const fog = `<ellipse cx="30" cy="112" rx="34" ry="6" fill="#e0e7ff" opacity=".1"/><ellipse cx="72" cy="118" rx="36" ry="7" fill="#e0e7ff" opacity=".12"/><ellipse cx="50" cy="126" rx="44" ry="6" fill="#e0e7ff" opacity=".08"/>`;
    return card({ label: 'Graveyard Ghost card back', bg: ['#312e81', '#0f0a1e'], edge: '#f97316', frame: '#a855f7', defs: rad(mg, [[0, '#f8fafc'], [1, '#c7d2fe']]) + glow(gl, 2),
      inner: `${stars}<circle cx="26" cy="28" r="11" fill="url(#${mg})"/><circle cx="23" cy="25" r="1.8" fill="#a5b4fc" opacity=".5"/>${bat(60, 22, 0.7, '#0a0412')}${bat(76, 32, 0.5, '#0a0412')}` +
        `<path d="M0 112Q30 100 60 108T100 104V140H0Z" fill="#0d0a1a"/>${deadTree(84, 108, 1.4, '#0d0a1a')}` +
        `${tomb(18, 116, 10, 16, '#2a2342', '#4c4470')}${tomb(36, 118, 8, 12, '#2a2342', '#4c4470')}<path d="M62 120V110M58 113H66" stroke="#2a2342" stroke-width="2"/>${tomb(76, 121, 8, 11, '#2a2342', '#4c4470')}${fog}`,
      corner: (x, y) => `<circle cx="${x}" cy="${y}" r="1.2" fill="#f97316"/>`,
      over: `<g filter="url(#${gl})">${ghost(50, 66, 2.2)}</g>` });
  },
  'jack-o-lantern': () => chip({ label: 'Jack-o’-Lantern chip', main: ['#fb923c', '#c2410c'], spot: '#111827', ring: '#111827', ringDash: '4 3', inlay: '#111827', inlayStroke: '#fb923c', tick: '#111827',
    emblem: pumpkin(50, 52, 1.45) + bat(36, 33, 0.35, '#a855f7') + bat(65, 32, 0.3, '#a855f7') }),
  'bat-wing': () => {
    let stars = '';
    ([[16, 22], [104, 40], [12, 70], [106, 84]] as const).forEach(([x, y]) => (stars += spark(x, y, 1.8, '#fde68a')));
    return outline({ label: 'Bat Wing profile outline',
      over: `<circle cx="60" cy="60" r="46" fill="none" stroke="#f97316" stroke-width="6"/><circle cx="60" cy="60" r="46" fill="none" stroke="#111827" stroke-width="1.6" stroke-dasharray="4 4"/><circle cx="60" cy="60" r="42.4" fill="none" stroke="#7c3aed" stroke-width=".8"/>` +
        `${stars}${bat(60, 9, 1.25, '#a855f7')}${bat(30, 19, 0.8, '#a855f7')}${bat(90, 19, 0.8, '#a855f7')}${pumpkin(60, 106, 0.7)}` });
  },

  // Thanksgiving
  'harvest-turkey': () => {
    const r = rnd(17), cols = ['#ea580c', '#b91c1c', '#f59e0b', '#d97706'];
    let leaves = '', beads = '';
    for (let i = 0; i < 18; i++) {
      const s = 3.5 + r() * 3.5;
      leaves += `<g transform="translate(${f(r() * 100)} ${f(r() * 140)}) rotate(${f(r() * 360)})"><path d="${maple(s)}" fill="${cols[i % 4]}" opacity=".85"/></g>`;
    }
    for (let i = 0; i < 30; i++) {
      const [x, y] = pol(50, 70, 27.3, i * 12);
      beads += `<circle cx="${f(x)}" cy="${f(y)}" r=".9" fill="#fbbf24"/>`;
    }
    return card({ label: 'Harvest Turkey card back', bg: ['#7c2d12', '#3b1204'], edge: '#fbbf24', frame: '#fbbf24', inner: leaves,
      corner: (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot - 45})"><path d="${maple(3.4)}" fill="#fbbf24"/></g>`,
      over: `${wheat(20, 116, 30, '#fbbf24', -12)}${wheat(80, 116, 30, '#fbbf24', 12)}${beads}<circle cx="50" cy="70" r="25" fill="#fef3c7" stroke="#fbbf24" stroke-width="2"/><circle cx="50" cy="70" r="22.4" fill="none" stroke="#d97706" stroke-opacity=".5" stroke-width=".5"/>${turkey(50, 73, 0.92)}` });
  },
  'pumpkin-pie': () => {
    let ging = '';
    for (let k = 0; k <= 140; k += 10) ging += `<rect x="0" y="${k}" width="100" height="5" fill="#dc2626" opacity=".28"/>`;
    for (let k = 0; k <= 100; k += 10) ging += `<rect x="${k}" y="0" width="5" height="140" fill="#dc2626" opacity=".28"/>`;
    return card({ label: 'Pumpkin Pie card back', bg: ['#fffbeb', '#fde68a'], edge: '#b45309', frame: '#b45309', inner: ging,
      corner: (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot - 45})"><path d="${maple(3.6)}" fill="#c2410c"/></g>`,
      over: `<circle cx="50" cy="72" r="33" fill="#000" opacity=".15"/><circle cx="50" cy="70" r="33" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1"/><circle cx="50" cy="70" r="29" fill="none" stroke="#e2e8f0" stroke-width=".8"/>${pie(50, 70, 25)}` +
        `<path d="M80 108L90 118" stroke="#94a3b8" stroke-width="2.4" stroke-linecap="round"/><path d="M76 104L80 108M78 102L82 106M80 100L84 104" stroke="#94a3b8" stroke-width="1" stroke-linecap="round"/>` });
  },
  'autumn-leaf': () => chip({ label: 'Autumn Leaf chip', main: ['#d97706', '#92400e'], spot: '#fef3c7', ring: '#fef3c7', ringDash: '3 3', inlay: '#fef3c7', inlayStroke: '#92400e', tick: '#fef3c7',
    emblem: `<g transform="translate(50 49) rotate(-10)"><path d="${maple(21)}" fill="#c2410c" stroke="#7c2d12" stroke-width=".8" stroke-linejoin="round"/><path d="M0 8V-16M0 -2L-12 -6M0 -2L12 -6M0 3L-8 7M0 3L8 7" stroke="#7c2d12" stroke-width=".6" fill="none"/></g>` }),
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
    const gl = nextId('gl');
    let flakes = '';
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 4; col++) {
        const x = 14 + col * 24 + (row % 2 ? 12 : 0), y = 14 + row * 19;
        if (x < 94) flakes += snowflake(x, y, 3.2, '#dcfce7', 0.6);
      }
    }
    return card({ label: 'Evergreen card back', bg: ['#166534', '#052e16'], edge: '#facc15', frame: '#facc15', defs: glow(gl, 1.4),
      inner: `<g opacity=".45">${flakes}</g><path d="M0 114Q25 107 50 112T100 110V140H0Z" fill="#f1f5f9"/><path d="M0 120Q30 115 60 119T100 118" stroke="#cbd5e1" stroke-width=".8" fill="none"/>`,
      corner: (x, y) => snowflake(x, y, 2.6, '#facc15', 0.7),
      over: `${tree(50, 50, gl)}${gift(31, 114, 10, 8, '#dc2626', '#facc15')}${gift(69, 114, 9, 10, '#2563eb', '#f8fafc')}${gift(41, 116, 7, 5, '#facc15', '#dc2626')}` });
  },
  'frosty-night': () => {
    const r = rnd(91), gl = nextId('gl');
    let snow = '';
    for (let i = 0; i < 46; i++) snow += `<circle cx="${f(r() * 100)}" cy="${f(r() * 120)}" r="${f(0.4 + r() * 0.9)}" fill="#fff" opacity="${f(0.5 + r() * 0.5)}"/>`;
    const pine = (x: number, by: number, s: number) =>
      `<path transform="translate(${x} ${by}) scale(${s})" d="M0 -22L6 -12H3L8 -4H4L10 4H-10L-4 -4H-8L-3 -12H-6Z" fill="#14532d"/><path transform="translate(${x} ${by}) scale(${s})" d="M-6 -12H6M-8 -4H8" stroke="#f8fafc" stroke-width=".8"/>`;
    return card({ label: 'Frosty Night card back', bg: ['#1e3a8a', '#0f172a'], edge: '#facc15', frame: '#bfdbfe', defs: glow(gl, 1.6),
      inner: `<g filter="url(#${gl})"><circle cx="76" cy="26" r="9" fill="#fef9c3"/></g><circle cx="80" cy="23" r="8" fill="#1e3a8a"/>${snow}` +
        `${pine(16, 108, 1.1)}${pine(86, 106, 1.3)}${pine(26, 112, 0.7)}<path d="M0 110Q25 102 50 108T100 104V140H0Z" fill="#e2e8f0"/><path d="M0 120Q30 112 60 118T100 116V140H0Z" fill="#f8fafc"/>`,
      corner: (x, y) => snowflake(x, y, 2.6, '#bfdbfe', 0.7),
      over: snowman(50, 122, 1.2) });
  },
  'candy-cane': () => {
    const cc = nextId('cc');
    return chip({ label: 'Candy Cane chip', main: ['#dc2626', '#7f1d1d'], spot: `url(#${cc})`, ring: '#f8fafc', ringDash: '5 3', inlay: '#166534', inlayStroke: '#facc15',
      defs: `<pattern id="${cc}" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="#f8fafc"/><rect width="1.8" height="4" fill="#dc2626"/></pattern>`,
      emblem: `${snowflake(50, 50, 17, '#f8fafc', 2.2)}<circle cx="50" cy="50" r="2.4" fill="#facc15"/>` });
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
