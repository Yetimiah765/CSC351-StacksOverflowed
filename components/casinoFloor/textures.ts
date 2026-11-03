// Textures for the 3D casino floor (Scene.tsx), painted onto canvases in
// code — no image files. Each is made once and reused; the sports screens
// are repainted every frame by paintSportsScreen().

import * as THREE from 'three';

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

/** Casino carpet: deep red with a gold lattice and medallions. Repeats. */
export function carpetTexture(repeat: [number, number]) {
  const { element, ctx } = canvas(256, 256);
  ctx.fillStyle = '#4a0e26';
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
    ctx.fillStyle = '#7a1a3e';
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

/** Dark wood wall panels with a gold rail. Repeats along the wall. */
export function wallTexture(repeat: [number, number]) {
  const { element, ctx } = canvas(256, 256);
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#1b0f2e');
  gradient.addColorStop(1, '#2a1640');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#3d2460';
  ctx.lineWidth = 6;
  ctx.strokeRect(18, 30, 220, 170);
  ctx.strokeStyle = '#120a20';
  ctx.lineWidth = 2;
  ctx.strokeRect(26, 38, 204, 154);
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(0, 216, 256, 8);
  ctx.fillStyle = '#7a5a10';
  ctx.fillRect(0, 224, 256, 3);
  return texture(element, repeat);
}

/** The lobby's floor (SRS-103.12): polished cream marble tiles with grey veins and a gold inlay. Repeats. */
export function marbleTexture(repeat: [number, number]) {
  const { element, ctx } = canvas(512, 512);
  // Seeded, so the floor looks the same every visit.
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const [x, y, tone] of [[0, 0, '#efe6d6'], [256, 0, '#e6dccb'], [0, 256, '#e6dccb'], [256, 256, '#efe6d6']] as const) {
    ctx.fillStyle = tone;
    ctx.fillRect(x, y, 256, 256);
    // Veins: soft wandering lines.
    for (let v = 0; v < 5; v++) {
      ctx.strokeStyle = `rgba(110, 100, 92, ${0.12 + random() * 0.18})`;
      ctx.lineWidth = 0.6 + random() * 1.8;
      ctx.beginPath();
      let px = x + random() * 256;
      let py = y;
      ctx.moveTo(px, py);
      while (py < y + 256) {
        px += (random() - 0.5) * 40;
        py += 12 + random() * 22;
        ctx.lineTo(Math.min(x + 256, Math.max(x, px)), Math.min(y + 256, py));
      }
      ctx.stroke();
    }
  }
  // Grout and a gold inlay between tiles, and a diamond where four meet.
  ctx.strokeStyle = '#b8902e';
  ctx.lineWidth = 3;
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
  ctx.moveTo(256, 236);
  ctx.lineTo(276, 256);
  ctx.lineTo(256, 276);
  ctx.lineTo(236, 256);
  ctx.closePath();
  ctx.fill();
  return texture(element, repeat);
}

/** The lobby's walls: warm cream panelling framed in gold, with a dado rail. Repeats along the wall. */
export function lobbyWallTexture(repeat: [number, number]) {
  const { element, ctx } = canvas(256, 512);
  const gradient = ctx.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, '#d8c7a6');
  gradient.addColorStop(1, '#c4b08a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 512);
  // A tall panel above the rail, a short one below.
  ctx.strokeStyle = '#b8902e';
  ctx.lineWidth = 5;
  ctx.strokeRect(28, 30, 200, 330);
  ctx.strokeStyle = 'rgba(90, 64, 20, 0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(38, 40, 180, 310);
  ctx.fillStyle = '#5b3a1e';
  ctx.fillRect(0, 384, 256, 128);
  ctx.strokeStyle = '#b8902e';
  ctx.lineWidth = 4;
  ctx.strokeRect(28, 404, 200, 88);
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(0, 376, 256, 10);
  return texture(element, repeat);
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
