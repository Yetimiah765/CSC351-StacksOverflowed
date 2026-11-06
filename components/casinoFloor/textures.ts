// Textures for the 3D casino floor (Scene.tsx), painted onto canvases in
// code — no image files. Each is made once and reused; the sports screens
// are repainted every frame by paintSportsScreen().

import * as THREE from 'three';
import type { TvGame } from '../../lib/barTvs';

function canvas(width: number, height: number) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  return { element, ctx: element.getContext('2d') as CanvasRenderingContext2D };
}

function texture(element: HTMLCanvasElement, repeat?: [number, number]) {
  const result = new THREE.CanvasTexture(element);
  result.colorSpace = THREE.SRGBColorSpace;
  result.anisotropy = 8;
  if (repeat) {
    result.wrapS = THREE.RepeatWrapping;
    result.wrapT = THREE.RepeatWrapping;
    result.repeat.set(repeat[0], repeat[1]);
  }
  return result;
}

/** Casino carpet: midnight blue with a gold lattice and emerald medallions, like the site. Repeats. */
export function carpetTexture(repeat: [number, number]) {
  const { element, ctx } = canvas(256, 256);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#b8861b';
  ctx.lineWidth = 5;
  // Diamond lattice.
  ctx.beginPath();
  ctx.moveTo(128, 0);
  ctx.lineTo(256, 128);
  ctx.lineTo(128, 256);
  ctx.lineTo(0, 128);
  ctx.closePath();
  ctx.stroke();
  // Medallion in the middle, rosettes at the corners.
  for (const [x, y, r] of [[128, 128, 30], [0, 0, 18], [256, 0, 18], [0, 256, 18], [256, 256, 18]]) {
    ctx.fillStyle = '#14532d';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d9a93a';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#e8b84a';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let i = 0; i < 1400; i++) ctx.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
  return texture(element, repeat);
}

/**
 * The walls, in the site's own colours: deep slate panels with a gold
 * pinstripe frame and a gold chair rail above dark wainscoting. Repeats
 * along the wall.
 */
export function wallTexture(repeat: [number, number]) {
  const { element, ctx } = canvas(256, 256);
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#0b1120');
  gradient.addColorStop(0.8, '#111827');
  gradient.addColorStop(1, '#0a0f1c');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  // A raised panel: a lit top-left edge, a shaded bottom-right one.
  ctx.fillStyle = '#131c2e';
  ctx.fillRect(22, 26, 212, 168);
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 4;
  ctx.strokeRect(22, 26, 212, 168);
  ctx.strokeStyle = 'rgba(201,162,39,0.55)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(32, 36, 192, 148);
  // Fine vertical grain, like dark lacquered wood.
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.012 + Math.random() * 0.02})`;
    ctx.fillRect(Math.random() * 256, 0, 1, 256);
  }
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(0, 210, 256, 6);
  ctx.fillStyle = '#7a5a10';
  ctx.fillRect(0, 216, 256, 2);
  ctx.fillStyle = '#070b14';
  ctx.fillRect(0, 218, 256, 38);
  return texture(element, repeat);
}

/** Lines along the edges of a rectangle: `light` on its top and left, `dark` on its bottom and right — a raised edge catching the light (swap them for a recess). */
function bevel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, light: string, dark: string, width: number) {
  ctx.lineWidth = width;
  ctx.strokeStyle = light;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.stroke();
  ctx.strokeStyle = dark;
  ctx.beginPath();
  ctx.moveTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.stroke();
}

/** The lobby's floor (SRS-103.12): polished cream marble tiles, clouded and veined, with bevelled edges and a gold inlay — or, with `tiles` false, one plain slab of it. Repeats; also its bump map. */
export function marbleTexture(repeat: [number, number], tiles = true) {
  const { element, ctx } = canvas(512, 512);
  // Seeded, so the floor looks the same every visit.
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const [x, y, tone] of [[0, 0, '#efe6d6'], [256, 0, '#e6dccb'], [0, 256, '#e6dccb'], [256, 256, '#efe6d6']] as const) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, 256, 256);
    ctx.clip();
    ctx.fillStyle = tone;
    ctx.fillRect(x, y, 256, 256);
    // Clouding: faint warm and grey patches.
    for (let c = 0; c < 14; c++) {
      const cx = x + random() * 256;
      const cy = y + random() * 256;
      const r = 30 + random() * 70;
      const cloud = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      cloud.addColorStop(0, random() < 0.5 ? 'rgba(150, 132, 108, 0.10)' : 'rgba(255, 250, 240, 0.18)');
      cloud.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = cloud;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    // Veins: wandering lines, each with fine threads branching off it.
    for (let v = 0; v < 9; v++) {
      ctx.strokeStyle = `rgba(105, 94, 86, ${0.1 + random() * 0.22})`;
      ctx.lineWidth = 0.5 + random() * 1.8;
      ctx.beginPath();
      let px = x + random() * 256;
      let py = y;
      ctx.moveTo(px, py);
      while (py < y + 256) {
        px += (random() - 0.5) * 40;
        py += 10 + random() * 22;
        ctx.lineTo(px, py);
        if (random() < 0.25) {
          ctx.moveTo(px, py);
          ctx.lineTo(px + (random() - 0.5) * 50, py + random() * 30);
          ctx.moveTo(px, py);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
    // Each tile's edges, ground to a slight bevel.
    if (tiles) bevel(ctx, x + 3, y + 3, 250, 250, 'rgba(255, 255, 255, 0.55)', 'rgba(70, 58, 44, 0.35)', 2);
  }
  if (!tiles) return texture(element, repeat);
  // Grout and a gold inlay between tiles, and a diamond where four meet.
  ctx.strokeStyle = '#6b5a3a';
  ctx.lineWidth = 5;
  for (const at of [0, 256, 512]) {
    ctx.beginPath();
    ctx.moveTo(at, 0);
    ctx.lineTo(at, 512);
    ctx.moveTo(0, at);
    ctx.lineTo(512, at);
    ctx.stroke();
  }
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 2.5;
  for (const at of [0, 256, 512]) {
    ctx.beginPath();
    ctx.moveTo(at, 0);
    ctx.lineTo(at, 512);
    ctx.moveTo(0, at);
    ctx.lineTo(512, at);
    ctx.stroke();
  }
  ctx.fillStyle = '#c9a227';
  ctx.beginPath();
  ctx.moveTo(256, 234);
  ctx.lineTo(278, 256);
  ctx.lineTo(256, 278);
  ctx.lineTo(234, 256);
  ctx.closePath();
  ctx.fill();
  bevel(ctx, 256 - 11, 256 - 11, 22, 22, 'rgba(255, 244, 200, 0.6)', 'rgba(60, 40, 0, 0.45)', 1.5);
  return texture(element, repeat);
}

/** The lobby's walls: warm cream raised panels with bevelled gold mouldings, a crown moulding, a gold chair rail, and a walnut dado and skirting. Repeats along the wall; also its bump map. */
export function lobbyWallTexture(repeat: [number, number]) {
  const w = 256;
  const h = 512;
  const { element, ctx } = canvas(w, h);
  let seed = 3;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const field = ctx.createLinearGradient(0, 0, 0, h);
  field.addColorStop(0, '#e0d0b0');
  field.addColorStop(0.7, '#c9b48c');
  ctx.fillStyle = field;
  ctx.fillRect(0, 0, w, 380);
  // The crown moulding along the top: stepped bands, each catching the light.
  for (const [y, band, color] of [[0, 8, '#efe3c8'], [8, 4, '#b8902e'], [12, 6, '#d6c49f'], [18, 3, '#8c7650']] as const) {
    ctx.fillStyle = color;
    ctx.fillRect(0, y, w, band);
  }
  ctx.fillStyle = 'rgba(40, 28, 10, 0.25)';
  ctx.fillRect(0, 21, w, 4);
  // The raised panel: a moulded gold frame round a recessed field.
  const px = 24;
  const py = 40;
  const pw = w - 48;
  const ph = 318;
  bevel(ctx, px - 3, py - 3, pw + 6, ph + 6, 'rgba(255, 250, 235, 0.8)', 'rgba(70, 50, 20, 0.5)', 2);
  ctx.strokeStyle = '#b8902e';
  ctx.lineWidth = 5;
  ctx.strokeRect(px, py, pw, ph);
  ctx.strokeStyle = '#e8c96a';
  ctx.lineWidth = 1;
  ctx.strokeRect(px - 1.5, py - 1.5, pw + 3, ph + 3);
  bevel(ctx, px + 6, py + 6, pw - 12, ph - 12, 'rgba(60, 42, 16, 0.45)', 'rgba(255, 248, 230, 0.6)', 3);
  const inner = ctx.createLinearGradient(0, py, 0, py + ph);
  inner.addColorStop(0, 'rgba(255, 250, 235, 0.12)');
  inner.addColorStop(1, 'rgba(90, 70, 40, 0.12)');
  ctx.fillStyle = inner;
  ctx.fillRect(px + 8, py + 8, pw - 16, ph - 16);
  // A fine inner line, with a little diamond at its top and bottom.
  ctx.strokeStyle = 'rgba(150, 112, 40, 0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 18, py + 18, pw - 36, ph - 36);
  ctx.fillStyle = '#b8902e';
  for (const y of [py + 18, py + ph - 18]) {
    ctx.beginPath();
    ctx.moveTo(w / 2, y - 6);
    ctx.lineTo(w / 2 + 6, y);
    ctx.lineTo(w / 2, y + 6);
    ctx.lineTo(w / 2 - 6, y);
    ctx.fill();
  }
  // The chair rail: gold, lit along its top, shadowed underneath.
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(0, 372, w, 12);
  ctx.fillStyle = 'rgba(255, 240, 190, 0.8)';
  ctx.fillRect(0, 372, w, 2);
  ctx.fillStyle = 'rgba(60, 40, 0, 0.55)';
  ctx.fillRect(0, 382, w, 2);
  // The walnut dado below, with its grain and a raised panel.
  ctx.fillStyle = '#5b3a1e';
  ctx.fillRect(0, 384, w, h - 384);
  for (let g = 0; g < 30; g++) {
    ctx.strokeStyle = `rgba(30, 16, 6, ${0.12 + random() * 0.2})`;
    ctx.lineWidth = 0.6 + random();
    ctx.beginPath();
    const y = 386 + random() * 100;
    ctx.moveTo(0, y);
    for (let x = 0; x <= w; x += 32) ctx.lineTo(x, y + (random() - 0.5) * 3);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(0, 384, w, 5);
  bevel(ctx, 26, 400, w - 52, 78, 'rgba(210, 160, 110, 0.55)', 'rgba(15, 8, 2, 0.6)', 3);
  ctx.strokeStyle = '#b8902e';
  ctx.lineWidth = 2;
  ctx.strokeRect(32, 406, w - 64, 66);
  // The skirting: dark, with a lit top edge.
  ctx.fillStyle = '#2a170b';
  ctx.fillRect(0, 490, w, 22);
  ctx.fillStyle = 'rgba(210, 160, 110, 0.5)';
  ctx.fillRect(0, 490, w, 2);
  return texture(element, repeat);
}

/** A column's fluting: cream marble with rounded grooves all round, flat fillets between them. Also its bump map. */
export function columnFlutingTexture() {
  const w = 512;
  const h = 128;
  const { element, ctx } = canvas(w, h);
  let seed = 9;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = '#efe6d6';
  ctx.fillRect(0, 0, w, h);
  const flutes = 20;
  const f = w / flutes;
  for (let i = 0; i < flutes; i++) {
    const x0 = i * f + f * 0.14;
    const x1 = (i + 1) * f - f * 0.14;
    const groove = ctx.createLinearGradient(x0, 0, x1, 0);
    groove.addColorStop(0, '#8a7c66');
    groove.addColorStop(0.22, '#c4b79f');
    groove.addColorStop(0.62, '#f8f1e4');
    groove.addColorStop(1, '#9c8f78');
    ctx.fillStyle = groove;
    ctx.fillRect(x0, 0, x1 - x0, h);
  }
  // A few faint veins across it.
  for (let v = 0; v < 6; v++) {
    ctx.strokeStyle = `rgba(110, 100, 92, ${0.08 + random() * 0.12})`;
    ctx.lineWidth = 0.6 + random();
    ctx.beginPath();
    let y = random() * h;
    ctx.moveTo(0, y);
    for (let x = 0; x <= w; x += 24) {
      y += (random() - 0.5) * 10;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return texture(element, [1, 1]);
}

/** Buttoned velvet for the lobby's benches: a diamond of creases between buttons, with a soft sheen. Repeats; also its bump map. */
export function tuftedVelvetTexture(repeat: [number, number]) {
  const size = 256;
  const { element, ctx } = canvas(size, size);
  ctx.fillStyle = '#6b1235';
  ctx.fillRect(0, 0, size, size);
  // Creases run corner to corner every half tile, with a button wherever
  // they cross (the grid points whose coordinates add up even); between
  // them each diamond puffs up.
  const half = size / 4;
  for (let m = -1; m <= 5; m++) {
    for (let n = -1; n <= 5; n++) {
      if ((m + n) % 2 === 0) continue;
      const cx = m * half;
      const cy = n * half;
      const puff = ctx.createRadialGradient(cx - 6, cy - 8, 2, cx, cy, half);
      puff.addColorStop(0, 'rgba(200, 90, 130, 0.5)');
      puff.addColorStop(1, 'rgba(40, 0, 15, 0.4)');
      ctx.fillStyle = puff;
      ctx.beginPath();
      ctx.moveTo(cx, cy - half);
      ctx.lineTo(cx + half, cy);
      ctx.lineTo(cx, cy + half);
      ctx.lineTo(cx - half, cy);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.strokeStyle = 'rgba(30, 2, 12, 0.8)';
  ctx.lineWidth = 3;
  for (let k = -4; k <= 8; k++) {
    ctx.beginPath();
    ctx.moveTo(k * 2 * half, 0);
    ctx.lineTo(k * 2 * half + size, size);
    ctx.moveTo(k * 2 * half, 0);
    ctx.lineTo(k * 2 * half - size, size);
    ctx.stroke();
  }
  for (let m = 0; m <= 4; m++) {
    for (let n = 0; n <= 4; n++) {
      if ((m + n) % 2 !== 0) continue;
      ctx.fillStyle = '#3a0618';
      ctx.beginPath();
      ctx.arc(m * half, n * half, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 210, 150, 0.6)';
      ctx.beginPath();
      ctx.arc(m * half - 2, n * half - 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return texture(element, repeat);
}

/** A soft round shadow, dark in the middle and fading out: laid under things on the lobby's floor. */
export function softShadowTexture() {
  const size = 128;
  const { element, ctx } = canvas(size, size);
  const shade = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  shade.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  shade.addColorStop(0.55, 'rgba(0, 0, 0, 0.28)');
  shade.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size, size);
  return texture(element);
}

/**
 * The soft shadow of a curved desk on the floor: an arc `radius` metres out
 * from the middle of a square `size` metres across, `span` radians long and
 * centred on +x (angles towards +y on the canvas, +z in the world).
 */
export function arcShadowTexture(radius: number, span: number, size: number) {
  const px = 512;
  const { element, ctx } = canvas(px, px);
  const scale = px / size;
  ctx.lineCap = 'round';
  for (const [width, alpha] of [[0.95, 0.05], [0.75, 0.07], [0.58, 0.09], [0.42, 0.12], [0.3, 0.14]] as const) {
    ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.lineWidth = width * scale;
    ctx.beginPath();
    ctx.arc(px / 2, px / 2, radius * scale, -span / 2, span / 2);
    ctx.stroke();
  }
  return texture(element);
}

/** The city at night, seen through the lobby's windows: a dusky sky, stars, and towers with lit windows. */
export function cityTexture() {
  const { element, ctx } = canvas(2048, 1024);
  let seed = 11;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const sky = ctx.createLinearGradient(0, 0, 0, 1024);
  sky.addColorStop(0, '#060b24');
  sky.addColorStop(0.55, '#1f1b4d');
  sky.addColorStop(0.8, '#5b2a5e');
  sky.addColorStop(1, '#a8495a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 2048, 1024);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(255, 255, 255, ${0.3 + random() * 0.7})`;
    ctx.fillRect(random() * 2048, random() * 520, 1.5, 1.5);
  }
  // The moon.
  ctx.fillStyle = '#fef3c7';
  ctx.beginPath();
  ctx.arc(1560, 210, 46, 0, Math.PI * 2);
  ctx.fill();
  // Two rows of towers, the far ones dimmer.
  for (const [base, tall, shade, lit] of [[860, 420, '#1a1636', 0.35], [1024, 560, '#0b0a1a', 0.75]] as const) {
    let x = -20;
    while (x < 2048) {
      const w = 60 + random() * 120;
      const h = 120 + random() * tall;
      ctx.fillStyle = shade;
      ctx.fillRect(x, base - h, w, h + 200);
      for (let wy = base - h + 14; wy < base - 10; wy += 22) {
        for (let wx = x + 10; wx < x + w - 10; wx += 18) {
          if (random() < lit * 0.5) {
            ctx.fillStyle = random() < 0.8 ? '#fde68a' : '#93c5fd';
            ctx.fillRect(wx, wy, 8, 11);
          }
        }
      }
      x += w + random() * 18;
    }
  }
  return texture(element);
}

/** The text's font size that fits `room` pixels wide, at most `size`. */
function fitText(ctx: CanvasRenderingContext2D, text: string, weight: string, size: number, room: number, family: string) {
  ctx.font = `${weight} ${size}px ${family}`;
  return Math.min(size, (size * room) / ctx.measureText(text).width);
}

/** A playing card on a poster, tilted about its bottom middle. */
function posterCard(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, rank: string, suit: string) {
  const w = 120;
  const h = 170;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#fbf7ee';
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h, w, h, 12);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = suit === '♥' || suit === '♦' ? '#c81e1e' : '#111827';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 34px Georgia';
  ctx.fillText(rank, -w / 2 + 24, -h + 28);
  ctx.font = '28px Georgia';
  ctx.fillText(suit, -w / 2 + 24, -h + 60);
  ctx.font = '72px Georgia';
  ctx.fillText(suit, 6, -h / 2 + 8);
  ctx.restore();
}

/** What each of the lobby's posters shows, painted around (cx, cy). */
const POSTER_MOTIFS = {
  blackjack: (ctx: CanvasRenderingContext2D, cx: number, cy: number) => {
    posterCard(ctx, cx - 40, cy + 110, -0.2, 'A', '♠');
    posterCard(ctx, cx + 40, cy + 110, 0.2, 'K', '♣');
    ctx.fillStyle = '#f5d76e';
    ctx.font = '900 46px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('21', cx, cy + 165);
  },
  roulette: (ctx: CanvasRenderingContext2D, cx: number, cy: number) => {
    const pockets = 37;
    ctx.fillStyle = '#d4af37';
    ctx.beginPath();
    ctx.arc(cx, cy, 150, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < pockets; i++) {
      const a0 = (i / pockets) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((i + 1) / pockets) * Math.PI * 2 - Math.PI / 2;
      ctx.fillStyle = i === 0 ? '#15803d' : i % 2 ? '#b91c1c' : '#111111';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, 138, a0, a1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#5b3416';
    ctx.beginPath();
    ctx.arc(cx, cy, 92, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = '#d4af37';
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((i * Math.PI) / 2 + Math.PI / 4);
      ctx.fillRect(-5, -78, 10, 156);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx + 84, cy - 98, 11, 0, Math.PI * 2);
    ctx.fill();
  },
  slots: (ctx: CanvasRenderingContext2D, cx: number, cy: number) => {
    ctx.fillStyle = '#d4af37';
    ctx.beginPath();
    ctx.roundRect(cx - 170, cy - 90, 300, 180, 18);
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      const x = cx - 156 + i * 94;
      ctx.fillStyle = '#fbf7ee';
      ctx.fillRect(x, cy - 72, 84, 144);
      ctx.fillStyle = '#c81e1e';
      ctx.font = '900 96px "Arial Black", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('7', x + 42, cy + 4);
    }
    ctx.strokeStyle = '#c81e1e';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - 160, cy);
    ctx.lineTo(cx + 120, cy);
    ctx.stroke();
    // The lever, with its red ball.
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(cx + 132, cy + 30);
    ctx.lineTo(cx + 168, cy + 30);
    ctx.lineTo(cx + 168, cy - 110);
    ctx.stroke();
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.arc(cx + 168, cy - 124, 22, 0, Math.PI * 2);
    ctx.fill();
  },
  poker: (ctx: CanvasRenderingContext2D, cx: number, cy: number) => {
    ['10', 'J', 'Q', 'K', 'A'].forEach((rank, i) => {
      posterCard(ctx, cx + (i - 2) * 46, cy + 120, (i - 2) * 0.2, rank, '♦');
    });
  },
  sports: (ctx: CanvasRenderingContext2D, cx: number, cy: number) => {
    // A football, with speed lines behind it.
    ctx.strokeStyle = 'rgba(245, 215, 110, 0.7)';
    ctx.lineWidth = 8;
    for (const dy of [-60, 0, 60]) {
      ctx.beginPath();
      ctx.moveTo(cx - 200, cy + dy);
      ctx.lineTo(cx - 140 + Math.abs(dy) / 2, cy + dy);
      ctx.stroke();
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx + 20, cy, 120, 0, Math.PI * 2);
    ctx.fillStyle = '#fbf7ee';
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = '#111827';
    const patch = (x: number, y: number, r: number) => {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    };
    patch(cx + 20, cy, 40);
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 5 + Math.PI / 5;
      patch(cx + 20 + Math.cos(a) * 112, cy + Math.sin(a) * 112, 36);
    }
    ctx.restore();
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx + 20, cy, 120, 0, Math.PI * 2);
    ctx.stroke();
  },
};

export type PosterGame = keyof typeof POSTER_MOTIFS;

/** An art deco poster for one of the casino's games, framed on the lobby's walls. */
export function posterTexture(game: PosterGame) {
  const w = 512;
  const h = 720;
  const { element, ctx } = canvas(w, h);
  const look = {
    blackjack: { title: 'BLACKJACK', top: '#14633f', bottom: '#052e1c' },
    roulette: { title: 'ROULETTE', top: '#8f1d1d', bottom: '#2a0a0a' },
    slots: { title: 'SLOTS', top: '#5b21b6', bottom: '#1e0b3d' },
    poker: { title: 'POKER', top: '#1e40af', bottom: '#0b1533' },
    sports: { title: 'SPORTS BETTING', top: '#0f766e', bottom: '#04262a' },
  }[game];
  const background = ctx.createLinearGradient(0, 0, 0, h);
  background.addColorStop(0, look.top);
  background.addColorStop(1, look.bottom);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2;
  const cy = 390;
  // Sunburst rays from behind the picture.
  ctx.fillStyle = 'rgba(255, 214, 120, 0.09)';
  for (let i = 0; i < 24; i += 2) {
    const a0 = (i / 24) * Math.PI * 2;
    const a1 = ((i + 1) / 24) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a0) * 800, cy + Math.sin(a0) * 800);
    ctx.lineTo(cx + Math.cos(a1) * 800, cy + Math.sin(a1) * 800);
    ctx.closePath();
    ctx.fill();
  }
  // A gold double border with fans in the corners.
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 10;
  ctx.strokeRect(18, 18, w - 36, h - 36);
  ctx.lineWidth = 3;
  ctx.strokeRect(34, 34, w - 68, h - 68);
  for (const [x, y, turn] of [[34, 34, 0], [w - 34, 34, 1], [w - 34, h - 34, 2], [34, h - 34, 3]] as const) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((turn * Math.PI) / 2);
    for (let r = 16; r <= 48; r += 16) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI / 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  const family = '"Arial Black", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f5d76e';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 8;
  ctx.font = `900 ${Math.round(fitText(ctx, look.title, '900', 80, w - 130, family))}px ${family}`;
  ctx.fillText(look.title, cx, 118);
  ctx.shadowBlur = 0;
  ctx.fillRect(cx - 130, 168, 260, 4);
  ctx.beginPath();
  ctx.moveTo(cx, 158);
  ctx.lineTo(cx + 12, 170);
  ctx.lineTo(cx, 182);
  ctx.lineTo(cx - 12, 170);
  ctx.fill();
  POSTER_MOTIFS[game](ctx, cx, cy);
  ctx.fillStyle = '#f5d76e';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.round(fitText(ctx, 'STACKS OVERFLOWED', '900', 30, w - 150, family))}px ${family}`;
  ctx.fillText('STACKS OVERFLOWED', cx, h - 104);
  ctx.font = '700 22px Arial, sans-serif';
  ctx.fillText('PLAY TONIGHT', cx, h - 70);
  return texture(element);
}

/** The lobby's progressive jackpot board, repainted as the jackpot climbs (paintJackpotBoard()). */
export function jackpotBoard() {
  const { element, ctx } = canvas(1024, 320);
  return { texture: texture(element), ctx };
}

export function paintJackpotBoard(ctx: CanvasRenderingContext2D, amount: number) {
  const w = 1024;
  const h = 320;
  ctx.fillStyle = '#07040c';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fbbf24';
  ctx.font = '900 54px "Arial Black", Arial, sans-serif';
  ctx.fillText('PROGRESSIVE JACKPOT', w / 2, 74);
  // LED digits: a faint grid of unlit segments behind the lit amount.
  const text = amount.toLocaleString('en-US');
  ctx.font = '900 140px "Courier New", monospace';
  ctx.fillStyle = 'rgba(255, 60, 40, 0.12)';
  ctx.fillText(text.replace(/\d/g, '8'), w / 2, 200);
  ctx.shadowColor = '#ff3b1f';
  ctx.shadowBlur = 28;
  ctx.fillStyle = '#ff5a36';
  ctx.fillText(text, w / 2, 200);
  ctx.shadowBlur = 0;
  ctx.font = '700 30px Arial, sans-serif';
  ctx.fillStyle = '#fde68a';
  ctx.fillText('COINS  ·  ANY GAME CAN WIN IT', w / 2, 280);
}

/** The inlay in the middle of the lobby's floor: a giant poker chip in marble and gold, with a compass star. */
export function medallionTexture() {
  const size = 1024;
  const { element, ctx } = canvas(size, size);
  const c = size / 2;
  const ring = (r: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.fill();
  };
  ring(512, '#c9a227');
  ring(492, '#7a1020');
  // The chip's edge spots.
  ctx.fillStyle = '#efe6d6';
  for (let i = 0; i < 8; i++) {
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate((i * Math.PI) / 4);
    ctx.fillRect(-46, -490, 92, 104);
    ctx.restore();
  }
  ring(384, '#c9a227');
  ring(370, '#efe6d6');
  ring(300, '#1f3d36');
  ring(288, '#e6dccb');
  // An eight-pointed star, the long points north, south, east and west.
  for (const [long, turn, color] of [[270, 0, '#c9a227'], [190, Math.PI / 4, '#b8902e']] as const) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = turn + (i * Math.PI) / 4;
      const r = i % 2 ? long * 0.28 : long;
      ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }
  ring(54, '#7a1020');
  ring(30, '#c9a227');
  return texture(element);
}

/** One face of a red die: `pips` white spots. */
export function dieFaceTexture(pips: number) {
  const size = 128;
  const { element, ctx } = canvas(size, size);
  ctx.fillStyle = '#b4141f';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#7f0d16';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, size - 6, size - 6);
  const at = { l: 32, m: 64, r: 96 };
  const spots: Record<number, [number, number][]> = {
    1: [[at.m, at.m]],
    2: [[at.l, at.l], [at.r, at.r]],
    3: [[at.l, at.l], [at.m, at.m], [at.r, at.r]],
    4: [[at.l, at.l], [at.r, at.l], [at.l, at.r], [at.r, at.r]],
    5: [[at.l, at.l], [at.r, at.l], [at.m, at.m], [at.l, at.r], [at.r, at.r]],
    6: [[at.l, at.l], [at.r, at.l], [at.l, at.m], [at.r, at.m], [at.l, at.r], [at.r, at.r]],
  };
  ctx.fillStyle = '#fbf7ee';
  for (const [x, y] of spots[pips] ?? []) {
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();
  }
  return texture(element);
}

/** Fluted walnut for the front desk: rounded vertical grooves over a fine grain. Repeats along the desk; also its bump map. */
export function flutedWoodTexture(repeat: [number, number]) {
  const size = 256;
  const { element, ctx } = canvas(size, size);
  let seed = 5;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = '#4a2a17';
  ctx.fillRect(0, 0, size, size);
  // Eight flutes to the tile, each shaded like a rounded groove.
  const flute = size / 8;
  for (let i = 0; i < 8; i++) {
    const shade = ctx.createLinearGradient(i * flute, 0, (i + 1) * flute, 0);
    shade.addColorStop(0, '#2a160b');
    shade.addColorStop(0.18, '#5e3720');
    shade.addColorStop(0.5, '#7a4a2b');
    shade.addColorStop(0.82, '#5e3720');
    shade.addColorStop(1, '#2a160b');
    ctx.fillStyle = shade;
    ctx.fillRect(i * flute, 0, flute, size);
  }
  // The grain: faint wavy lines running down the wood.
  for (let g = 0; g < 40; g++) {
    ctx.strokeStyle = `rgba(30, 14, 6, ${0.08 + random() * 0.12})`;
    ctx.lineWidth = 0.6 + random();
    ctx.beginPath();
    let x = random() * size;
    ctx.moveTo(x, 0);
    for (let y = 0; y <= size; y += 16) {
      x += (random() - 0.5) * 3;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Shadowed under the top and down by the plinth.
  const shade = ctx.createLinearGradient(0, 0, 0, size);
  shade.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  shade.addColorStop(0.12, 'rgba(0, 0, 0, 0)');
  shade.addColorStop(0.85, 'rgba(0, 0, 0, 0)');
  shade.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size, size);
  return texture(element, repeat);
}

/** A check-in kiosk's screen: a strip of green felt with chips and cards, CHECK IN, and buttons to sign up (first, as the tablet opens on it) or log in. */
export function kioskScreenTexture() {
  const w = 640;
  const h = 400;
  const { element, ctx } = canvas(w, h);
  const family = '"Arial Black", Arial, sans-serif';
  const background = ctx.createLinearGradient(0, 0, 0, h);
  background.addColorStop(0, '#0f172a');
  background.addColorStop(1, '#020617');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);
  // The felt, like the login page's header.
  const felt = ctx.createRadialGradient(w / 2, 40, 20, w / 2, 80, 360);
  felt.addColorStop(0, '#1f8a4c');
  felt.addColorStop(1, '#0e4a2a');
  ctx.fillStyle = felt;
  ctx.fillRect(0, 26, w, 136);
  ctx.fillStyle = '#b45309';
  ctx.fillRect(0, 158, w, 6);
  const chip = (x: number, y: number, color: string) => {
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(x, y - i * 7, 22, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.setLineDash([5, 6]);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };
  chip(470, 138, '#16a34a');
  chip(520, 132, '#111827');
  chip(570, 138, '#dc2626');
  for (const [x, angle, rank, suit, red] of [[90, -0.18, 'A', '♠', false], [140, 0.14, 'K', '♥', true]] as const) {
    ctx.save();
    ctx.translate(x, 150);
    ctx.rotate(angle);
    ctx.fillStyle = '#fbf7ee';
    ctx.beginPath();
    ctx.roundRect(-28, -96, 56, 84, 7);
    ctx.fill();
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = red ? '#c81e1e' : '#111827';
    ctx.font = 'bold 22px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText(rank, -14, -72);
    ctx.font = '36px Georgia';
    ctx.fillText(suit, 2, -32);
    ctx.restore();
  }
  // A status bar along the top, like a tablet's.
  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, w, 26);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '700 15px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('STACKS OVERFLOWED', 14, 13);
  ctx.fillRect(w - 44, 7, 26, 12);
  ctx.fillRect(w - 18, 10, 3, 6);
  for (let i = 0; i < 3; i++) ctx.fillRect(w - 82 + i * 7, 17 - i * 4, 4, 4 + i * 4);
  // CHECK IN, and the two buttons.
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 ${Math.round(fitText(ctx, 'CHECK IN', '900', 58, w - 120, family))}px ${family}`;
  ctx.fillText('CHECK IN', w / 2, 212);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 20px Arial, sans-serif';
  ctx.fillText('Sign up, or log in if you have an account', w / 2, 252);
  ctx.fillStyle = '#34d399';
  ctx.beginPath();
  ctx.roundRect(110, 290, 200, 56, 12);
  ctx.fill();
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(330, 290, 200, 56, 12);
  ctx.stroke();
  ctx.font = `900 22px ${family}`;
  ctx.fillStyle = '#020617';
  ctx.fillText('SIGN UP', 210, 319);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText('LOG IN', 430, 319);
  // The home bar at the bottom.
  ctx.fillStyle = 'rgba(226, 232, 240, 0.7)';
  ctx.beginPath();
  ctx.roundRect(w / 2 - 60, h - 16, 120, 6, 3);
  ctx.fill();
  return texture(element);
}

/** A soft glow, bright in the middle and fading to nothing: drawn additively, it lights up whatever's behind it. */
export function glowTexture() {
  const size = 128;
  const { element, ctx } = canvas(size, size);
  const glow = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  glow.addColorStop(0, '#ffffff');
  glow.addColorStop(0.35, '#7a7a7a');
  glow.addColorStop(1, '#000000');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  return texture(element);
}

/** A glint: a four-pointed star of light with a soft middle, for a coin catching the light. Drawn additively. */
export function glintTexture() {
  const size = 128;
  const { element, ctx } = canvas(size, size);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);
  const middle = size / 2;
  const glow = ctx.createRadialGradient(middle, middle, 0, middle, middle, middle * 0.45);
  glow.addColorStop(0, '#ffffff');
  glow.addColorStop(0.4, '#8a7a50');
  glow.addColorStop(1, '#000000');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';
  for (const [long, wide] of [
    [middle, 3.2],
    [middle * 0.55, 2],
  ] as const) {
    for (const turn of long === middle ? [0, Math.PI / 2] : [Math.PI / 4, -Math.PI / 4]) {
      ctx.save();
      ctx.translate(middle, middle);
      ctx.rotate(turn);
      const ray = ctx.createLinearGradient(-long, 0, long, 0);
      ray.addColorStop(0, 'rgba(255,255,255,0)');
      ray.addColorStop(0.5, 'rgba(255,250,225,1)');
      ray.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = ray;
      ctx.beginPath();
      ctx.moveTo(-long, 0);
      ctx.lineTo(0, -wide);
      ctx.lineTo(long, 0);
      ctx.lineTo(0, wide);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  return texture(element);
}

/** An uplight's wash on a wall: brightest at the bottom middle, spreading and fading as it rises. Drawn additively. */
export function washTexture() {
  const w = 128;
  const h = 256;
  const { element, ctx } = canvas(w, h);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h);
  ctx.scale(0.5, 1);
  const wash = ctx.createRadialGradient(0, 0, 0, 0, 0, h);
  wash.addColorStop(0, '#ffffff');
  wash.addColorStop(0.3, '#8a8a8a');
  wash.addColorStop(1, '#000000');
  ctx.fillStyle = wash;
  ctx.fillRect(-w, -h, w * 2, h);
  ctx.restore();
  return texture(element);
}

/** A lit ceiling coffer: a warm glow filling its middle, darker to its edges. Repeats one coffer per tile. */
export function cofferGlowTexture(repeat: [number, number], offset: [number, number]) {
  const size = 128;
  const { element, ctx } = canvas(size, size);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);
  const glow = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size * 0.62);
  glow.addColorStop(0, '#ffffff');
  glow.addColorStop(0.55, '#9a9a9a');
  glow.addColorStop(1, '#000000');
  ctx.fillStyle = glow;
  ctx.fillRect(6, 6, size - 12, size - 12);
  const result = texture(element, repeat);
  result.offset.set(offset[0], offset[1]);
  return result;
}

/** Water seen from above: blue-green with brighter wavering lines of light on it. Turned slowly to shimmer. */
export function rippleTexture() {
  const size = 256;
  const { element, ctx } = canvas(size, size);
  let seed = 13;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = '#4fa8c7';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 46; i++) {
    ctx.strokeStyle = `rgba(230, 250, 255, ${0.15 + random() * 0.35})`;
    ctx.lineWidth = 1 + random() * 2.5;
    ctx.beginPath();
    let x = random() * size;
    let y = random() * size;
    ctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += (random() - 0.5) * 50;
      y += (random() - 0.5) * 50;
      ctx.quadraticCurveTo(x + (random() - 0.5) * 30, y + (random() - 0.5) * 30, x, y);
    }
    ctx.stroke();
  }
  return texture(element);
}

/** Falling water: thin bright streaks of differing strength on nothing, for a curtain of water scrolling down. */
export function waterStreakTexture() {
  const w = 128;
  const h = 256;
  const { element, ctx } = canvas(w, h);
  let seed = 17;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(200, 235, 250, 0.28)';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) {
    const x = random() * w;
    const y = random() * h;
    const length = 40 + random() * 140;
    const streak = ctx.createLinearGradient(0, y, 0, y + length);
    const alpha = 0.3 + random() * 0.6;
    streak.addColorStop(0, 'rgba(255, 255, 255, 0)');
    streak.addColorStop(0.5, `rgba(255, 255, 255, ${alpha})`);
    streak.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = streak;
    ctx.fillRect(x, y, 1 + random() * 2.5, length);
    // Wrap round the bottom, so it scrolls seamlessly.
    if (y + length > h) ctx.fillRect(x, y - h, 1 + random() * 2.5, length);
  }
  const result = texture(element);
  result.wrapS = THREE.RepeatWrapping;
  result.wrapT = THREE.RepeatWrapping;
  return result;
}

/** A neon sign: glowing text on black, for an emissive map. The text shrinks to fit the width. */
export function neonTexture(text: string, color: string, width = 1024, height = 160) {
  const { element, ctx } = canvas(width, height);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  const family = '"Arial Black", Arial, sans-serif';
  ctx.font = `900 100px ${family}`;
  // Leave room at each end for the glow.
  const size = Math.min(height * 0.62, (100 * width * 0.86) / ctx.measureText(text).width);
  ctx.font = `900 ${Math.round(size)}px ${family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 24;
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.strokeText(text, width / 2, height / 2);
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, width / 2, height / 2);
  return texture(element);
}

// ---------- felt ----------
/** Woollen felt: the cloth colour with fine fibres, lighter under the lights in the middle. */
function paintFelt(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const base = new THREE.Color(color);
  const shade = (amount: number) => `#${base.clone().offsetHSL(0, 0, amount).getHexString()}`;
  const glow = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.7);
  glow.addColorStop(0, shade(0.035));
  glow.addColorStop(0.7, color);
  glow.addColorStop(1, shade(-0.05));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  // Fibres: thousands of tiny strokes a shade either side of the cloth.
  ctx.lineWidth = 1;
  for (let i = 0; i < size * 45; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const a = Math.random() * Math.PI;
    const l = 1 + Math.random() * 3;
    ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
}

/** Grey fibre noise for a felt's bump map, so the cloth catches the light. */
export function feltBumpTexture(repeat = 3) {
  const size = 256;
  const { element, ctx } = canvas(size, size);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 9000; i++) {
    const v = 90 + Math.floor(Math.random() * 80);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1);
  }
  const result = texture(element, [repeat, repeat]);
  result.colorSpace = THREE.NoColorSpace;
  return result;
}

/** Writes `text` round an arc, centred on angle `middle`, letters upright towards the centre, reading left to right from outside it. */
function arcText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, radius: number, middle: number, spacing = 1.08) {
  const chars = [...text];
  const angles = chars.map((char) => (ctx.measureText(char).width * spacing) / radius);
  let a = middle + angles.reduce((sum, angle) => sum + angle, 0) / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  chars.forEach((char, i) => {
    const half = (angles[i] as number) / 2;
    a -= half;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    ctx.rotate(a - Math.PI / 2);
    ctx.fillText(char, 0, 0);
    ctx.restore();
    a -= half;
  });
}

/**
 * The poker table's felt, for a circle stretched `stretch` times wider than
 * deep: a printed betting line and the casino's name, squeezed so they come
 * out round once stretched.
 */
export function pokerFeltTexture(stretch: number) {
  const size = 1024;
  const { element, ctx } = canvas(size, size);
  paintFelt(ctx, size, '#13693a');
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.strokeStyle = 'rgba(230, 200, 110, 0.55)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.36, size * 0.33, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.scale(1 / stretch, 1);
  ctx.fillStyle = 'rgba(230, 200, 110, 0.45)';
  ctx.font = 'bold 64px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('STACKS OVERFLOWED', 0, size * 0.2);
  ctx.font = 'italic 40px Georgia, serif';
  ctx.fillText('Texas Hold’em', 0, -size * 0.2);
  ctx.restore();
  return texture(element);
}

/**
 * The blackjack felt, seen from above with the dealer at the centre of the
 * circle (the top half is under the dealer's side and never shows): the
 * printed rules round the arc, the insurance band and seven betting boxes.
 */
export function blackjackFeltTexture() {
  const size = 1024;
  const c = size / 2;
  const { element, ctx } = canvas(size, size);
  paintFelt(ctx, size, '#14703f');
  const gold = 'rgba(235, 205, 120, 0.85)';
  ctx.fillStyle = gold;
  ctx.font = 'bold 34px Georgia, serif';
  arcText(ctx, 'BLACKJACK PAYS 3 TO 2', c, c, size * 0.2, Math.PI / 2);
  ctx.font = '22px Georgia, serif';
  arcText(ctx, 'Dealer must draw to 16 and stand on all 17s', c, c, size * 0.255, Math.PI / 2);
  // The insurance band.
  ctx.strokeStyle = gold;
  ctx.lineWidth = 3;
  for (const r of [0.3, 0.335]) {
    ctx.beginPath();
    ctx.arc(c, c, size * r, Math.PI * 0.18, Math.PI * 0.82);
    ctx.stroke();
  }
  ctx.font = 'bold 20px Georgia, serif';
  arcText(ctx, 'INSURANCE PAYS 2 TO 1', c, c, size * 0.3175, Math.PI / 2);
  // Seven betting boxes on the outer arc.
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * 0.2 + (i * Math.PI * 0.6) / 6;
    ctx.save();
    ctx.translate(c + Math.cos(a) * size * 0.41, c + Math.sin(a) * size * 0.41);
    ctx.rotate(a - Math.PI / 2);
    ctx.strokeStyle = 'rgba(245, 245, 240, 0.8)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(-34, -26, 68, 52, 8);
    ctx.stroke();
    ctx.restore();
  }
  return texture(element);
}

/** The top of a roulette wheel: 37 pockets around a wooden cone. */
export function rouletteWheelTexture() {
  const size = 512;
  const { element, ctx } = canvas(size, size);
  const c = size / 2;
  ctx.fillStyle = '#5b3416';
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 37; i++) {
    const a0 = (i / 37) * Math.PI * 2;
    const a1 = ((i + 1) / 37) * Math.PI * 2;
    ctx.fillStyle = i === 0 ? '#15803d' : i % 2 ? '#b91c1c' : '#111111';
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.arc(c, c, c * 0.94, a0, a1);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate((a0 + a1) / 2);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(String(i), c * 0.84, 6);
    ctx.restore();
  }
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 3;
  for (let i = 0; i < 37; i++) {
    const a = (i / 37) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * c * 0.62, c + Math.sin(a) * c * 0.62);
    ctx.lineTo(c + Math.cos(a) * c * 0.94, c + Math.sin(a) * c * 0.94);
    ctx.stroke();
  }
  const cone = ctx.createRadialGradient(c, c, 4, c, c, c * 0.62);
  cone.addColorStop(0, '#f3d27a');
  cone.addColorStop(0.35, '#8a5a24');
  cone.addColorStop(1, '#5b3416');
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.arc(c, c, c * 0.62, 0, Math.PI * 2);
  ctx.fill();
  return texture(element);
}

/** The roulette felt: the 0 and the 1-36 grid. */
export function rouletteLayoutTexture() {
  const { element, ctx } = canvas(512, 256);
  const felt = canvas(512, 512);
  paintFelt(felt.ctx, 512, '#14612f');
  ctx.drawImage(felt.element, 0, 0, 512, 512, 0, 0, 512, 256);
  const reds = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  ctx.font = 'bold 20px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#15803d';
  ctx.fillRect(14, 24, 34, 180);
  ctx.fillStyle = '#fff';
  ctx.fillText('0', 31, 114);
  for (let col = 0; col < 12; col++) {
    for (let row = 0; row < 3; row++) {
      const n = col * 3 + (3 - row);
      const x = 50 + col * 37;
      const y = 24 + row * 60;
      ctx.fillStyle = reds.has(n) ? '#b91c1c' : '#111111';
      ctx.fillRect(x, y, 35, 58);
      ctx.fillStyle = '#fff';
      ctx.fillText(String(n), x + 17, y + 29);
    }
  }
  ctx.strokeStyle = '#e5d38a';
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 24, 480, 180);
  ctx.fillStyle = '#e5d38a';
  ctx.font = 'bold 16px Arial';
  ctx.fillText('1st 12          2nd 12          3rd 12', 272, 228);
  return texture(element);
}

/** Slot reels: a tall strip of symbols the screen scrolls through. Repeats vertically. */
export function slotReelTexture() {
  const { element, ctx } = canvas(192, 512);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 192, 512);
  const symbols = ['7', '🍒', 'BAR', '🔔', '7', '💎', 'BAR', '🍋'];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let reel = 0; reel < 3; reel++) {
    for (let i = 0; i < 8; i++) {
      const symbol = symbols[(i + reel * 3) % symbols.length] as string;
      const x = 32 + reel * 64;
      const y = 32 + i * 64;
      ctx.font = symbol === 'BAR' ? 'bold 22px Arial' : symbol === '7' ? 'bold 44px Georgia' : '36px serif';
      ctx.fillStyle = symbol === '7' ? '#dc2626' : '#111827';
      ctx.fillText(symbol, x, y);
    }
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(reel * 64 + 62, 0, 4, 512);
  }
  return texture(element, [1, 1]);
}

/** A playing card face (rank and suit). */
export function cardTexture(rank: string, suit: '♠' | '♥' | '♦' | '♣') {
  const { element, ctx } = canvas(64, 96);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 64, 96);
  ctx.fillStyle = suit === '♥' || suit === '♦' ? '#dc2626' : '#111827';
  ctx.font = 'bold 26px Georgia';
  ctx.textAlign = 'center';
  ctx.fillText(rank, 32, 36);
  ctx.font = '34px Georgia';
  ctx.fillText(suit, 32, 76);
  return texture(element);
}

/** A sports screen, repainted every frame: a pitch, a moving ball, a score and LIVE. */
export function sportsScreen() {
  const { element, ctx } = canvas(320, 180);
  return { texture: texture(element), canvas: element, ctx };
}

export function paintSportsScreen(ctx: CanvasRenderingContext2D, time: number, variant: number) {
  const w = 320;
  const h = 180;
  ctx.fillStyle = variant ? '#155e2f' : '#1e6b3a';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect((i * w) / 8, 0, w / 8, h);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 2;
  ctx.strokeRect(10, 24, w - 20, h - 34);
  ctx.beginPath();
  ctx.moveTo(w / 2, 24);
  ctx.lineTo(w / 2, h - 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w / 2, (h + 14) / 2, 22, 0, Math.PI * 2);
  ctx.stroke();
  const t = time / (900 + variant * 300);
  ctx.fillStyle = '#fde047';
  ctx.beginPath();
  ctx.arc(w / 2 + Math.sin(t) * 120, (h + 14) / 2 + Math.cos(t * 1.7) * 45, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(2,6,23,0.85)';
  ctx.fillRect(0, 0, w, 22);
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(variant ? 'LAL 98  -  101 BOS' : 'KC 21  -  17 BUF', 10, 16);
  if (Math.floor(time / 600) % 2) {
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(w - 46, 11, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ef4444';
  ctx.fillText('LIVE', w - 38, 16);
}

// ---------- the bar ----------
/** One of the bar's TVs, repainted every frame by paintBarTv(). */
export function barTvScreen() {
  const { element, ctx } = canvas(480, 270);
  return { texture: texture(element), canvas: element, ctx };
}

/**
 * A bar TV: one of the sportsbook's Showdowns as a broadcast scoreboard — the
 * league and "SHOWDOWN", then LIVE / FINAL / the start time across the top;
 * each team in its colour with its score once the game's on, or before it the
 * coins backing it and by how many players; and a gold ticker with the pool,
 * sending people to the Showdown. With no Showdown (none is running, or the
 * sportsbook couldn't be reached) it shows a match like the sports bar's
 * screens.
 */
export function paintBarTv(
  ctx: CanvasRenderingContext2D,
  time: number,
  variant: number,
  game: TvGame | null,
  kickoff: string
) {
  const w = 480;
  const h = 270;
  if (!game) {
    ctx.save();
    ctx.scale(w / 320, h / 180);
    paintSportsScreen(ctx, time, variant % 2);
    ctx.restore();
    return;
  }
  // A dark pitch behind, slowly drifting, so the screen never looks frozen.
  const field = ctx.createLinearGradient(0, 0, w, h);
  field.addColorStop(0, '#04130c');
  field.addColorStop(1, '#0b2617');
  ctx.fillStyle = field;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 2;
  const drift = ((time / 60) % 60) - 60;
  for (let x = drift; x < w; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 40);
    ctx.lineTo(x + 40, h - 34);
    ctx.stroke();
  }

  // The top bar.
  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, w, 40);
  ctx.fillStyle = '#fcd34d';
  ctx.fillRect(0, 38, w, 2);
  ctx.font = 'bold 20px Arial';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(game.league.toUpperCase(), 16, 20);
  const leagueWidth = ctx.measureText(game.league.toUpperCase()).width;
  ctx.fillStyle = '#fcd34d';
  ctx.font = 'bold 14px Arial';
  ctx.fillText('★ SHOWDOWN', 26 + leagueWidth, 21);
  ctx.font = 'bold 20px Arial';
  ctx.textAlign = 'right';
  if (game.state === 'live') {
    if (Math.floor(time / 600) % 2) {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(w - 70, 20, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ef4444';
    ctx.fillText('LIVE', w - 16, 20);
  } else {
    ctx.fillStyle = game.state === 'upcoming' ? '#fcd34d' : '#94a3b8';
    ctx.fillText(game.state === 'final' ? 'FINAL' : game.state === 'off' ? 'OFF' : kickoff, w - 16, 20);
  }

  // The two teams, away above home.
  ([game.away, game.home] as const).forEach((team, i) => {
    const y = 62 + i * 82;
    ctx.fillStyle = 'rgba(2,6,23,0.78)';
    ctx.fillRect(16, y, w - 32, 70);
    ctx.fillStyle = team.color;
    ctx.fillRect(16, y, 14, 70);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px Arial';
    ctx.fillText(team.short, 44, y + 26);
    ctx.font = '15px Arial';
    ctx.fillStyle = '#cbd5e1';
    const name = team.name.length > 26 ? `${team.name.slice(0, 25)}…` : team.name;
    ctx.fillText(name, 46, y + 54);
    ctx.textAlign = 'right';
    if (game.state === 'upcoming' || team.score === null) {
      // Before the game: the coins backing this side of the Showdown.
      ctx.font = 'bold 28px Arial';
      ctx.fillStyle = '#fcd34d';
      ctx.fillText(team.coins.toLocaleString('en-US'), w - 32, y + 28);
      ctx.font = '13px Arial';
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(`COINS · ${team.players} ${team.players === 1 ? 'PLAYER' : 'PLAYERS'}`, w - 32, y + 54);
    } else {
      ctx.font = 'bold 46px Arial';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(team.score === null ? '–' : String(team.score), w - 32, y + 37);
    }
  });

  // The ticker.
  ctx.fillStyle = '#fcd34d';
  ctx.fillRect(0, h - 30, w, 30);
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 15px Arial';
  ctx.textAlign = 'left';
  const message =
    game.state === 'upcoming'
      ? `THE SHOWDOWN  ★  POOL ${game.pool.toLocaleString('en-US')} COINS  ★  BACK A TEAM AT THE SPORTSBOOK  ★  WINNERS SPLIT THE POOL  ★  `
      : `THE SHOWDOWN  ★  POOL ${game.pool.toLocaleString('en-US')} COINS  ★  NEXT SHOWDOWN AT THE SPORTSBOOK  ★  `;
  const span = ctx.measureText(message).width;
  const offset = -((time / 18) % span);
  for (let x = offset; x < w; x += span) ctx.fillText(message, x, h - 15);
}

// ---------- the shop's cage ----------
/** A little price tag for the cage's shelves: a cream card with a gold coin and the price. */
export function priceTagTexture(price: string) {
  const { element, ctx } = canvas(128, 64);
  ctx.fillStyle = '#f5ecd7';
  ctx.fillRect(0, 0, 128, 64);
  ctx.strokeStyle = '#8a6a1c';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 124, 60);
  ctx.fillStyle = '#e8b84a';
  ctx.beginPath();
  ctx.arc(26, 32, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8a6a1c';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#3b1d0e';
  ctx.font = 'bold 30px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(price, 46, 34);
  return texture(element);
}

/** A card back for the cage's display cards: a coloured lattice inside a white border. */
export function cardBackTexture(color: string, accent: string) {
  const { element, ctx } = canvas(96, 136);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 96, 136);
  ctx.fillStyle = color;
  ctx.fillRect(7, 7, 82, 122);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  for (let i = -136; i < 136; i += 12) {
    ctx.beginPath();
    ctx.moveTo(7 + i, 7);
    ctx.lineTo(7 + i + 122, 129);
    ctx.moveTo(89 - i, 7);
    ctx.lineTo(89 - i - 122, 129);
    ctx.stroke();
  }
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 3;
  ctx.strokeRect(12, 12, 72, 112);
  return texture(element);
}
