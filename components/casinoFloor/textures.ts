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
