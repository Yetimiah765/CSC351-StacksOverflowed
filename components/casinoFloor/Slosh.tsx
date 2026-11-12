'use client';

import { useFrame } from '@react-three/fiber';
import { Effect } from 'postprocessing';
import { useEffect, useMemo, type MutableRefObject } from 'react';
import { Uniform } from 'three';

// Maxed out on drinks at the bar: the whole view sloshes about like a
// drink in a glass. It rolls and sways like the deck of a ship, the picture
// ripples in slow waves, and it swims a little in and out. One post-processing
// effect in the floor's composer that only moves where each pixel is read
// from, so it costs next to nothing, and with `amount` at 0 it changes
// nothing. It's there from the start, so its shader is built with the rest.

const FRAGMENT = /* glsl */ `
uniform float amount;
uniform float time;

void mainUv(inout vec2 uv) {
  if (amount <= 0.0) return;
  vec2 c = uv - 0.5;
  // Rolling, like a ship's deck.
  float roll = (sin(time * 0.62) * 0.045 + sin(time * 1.37 + 0.8) * 0.012) * amount;
  float cr = cos(roll);
  float sr = sin(roll);
  c = mat2(cr, -sr, sr, cr) * c;
  // Zoomed in a little (so the edges stay on screen), swimming in and out.
  c *= 1.0 - amount * (0.075 + 0.02 * sin(time * 0.83));
  // Swaying side to side and bobbing.
  c.x += sin(time * 0.51) * 0.022 * amount;
  c.y += sin(time * 0.74 + 1.3) * 0.014 * amount;
  // Slow waves through the picture, like looking through the drink.
  c.x += sin(c.y * 8.0 + time * 1.7) * 0.011 * amount;
  c.y += sin(c.x * 6.5 + time * 1.25) * 0.009 * amount;
  uv = c + 0.5;
}
`;

class SloshEffect extends Effect {
  constructor() {
    super('SloshEffect', FRAGMENT, {
      uniforms: new Map<string, Uniform>([
        ['amount', new Uniform(0)],
        ['time', new Uniform(0)],
      ]),
    });
  }
}

/** `amount` is 0 (steady) to 1 (fully sloshed); it eases towards it, and it reduces to a gentle sway with `gentle` (reduced motion). */
export default function Slosh({ amount, gentle = false }: { amount: MutableRefObject<number>; gentle?: boolean }) {
  const effect = useMemo(() => new SloshEffect(), []);
  useEffect(() => () => effect.dispose(), [effect]);
  useFrame((_, delta) => {
    const step = Math.min(delta, 0.25);
    const target = Math.max(0, Math.min(1, amount.current)) * (gentle ? 0.25 : 1);
    const now = effect.uniforms.get('amount')!;
    now.value += (target - now.value) * (1 - Math.exp(-step * 1.5));
    if (now.value < 0.0005 && target === 0) now.value = 0;
    // With reduced motion, it holds still at its slosh rather than moving.
    if (!gentle) effect.uniforms.get('time')!.value += step;
  });
  return <primitive object={effect} dispose={null} />;
}
