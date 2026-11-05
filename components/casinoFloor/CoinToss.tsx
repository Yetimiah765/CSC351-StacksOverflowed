'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { glintTexture } from './textures';

// The coin a player tosses into the lobby's fountain when they make a wish
// (SRS-129.4), the splash where it goes in, and its glint once it lies on
// the bottom. Scene.tsx's Player moves it all each frame through `fx`. It's
// always in the scene, so its shaders are built with everything else's at
// the start, and shows only what `fx` says. The coin is drawn after the
// water (which is nearly opaque), tinted as it goes under, so it can be
// seen sinking and lying on the bottom.

export interface CoinFx {
  /** The coin: whether it's showing, where (world metres), how far it's flipped over about its own diameter, its rocking, and how far under the water it is (0 at the surface, 1 on the bottom). */
  shown: boolean;
  position: THREE.Vector3;
  spin: number;
  tilt: number;
  under: number;
  /** The splash: where the coin went in, and how far through it is, 0 to 1 (1, or no `splashAt`, for none). */
  splashAt: THREE.Vector3 | null;
  splash: number;
  /** Lying on the bottom: it glints now and then. */
  resting: boolean;
}

export function noCoin(): CoinFx {
  return { shown: false, position: new THREE.Vector3(), spin: 0, tilt: 0, under: 0, splashAt: null, splash: 1, resting: false };
}

const COIN_RADIUS = 0.028;
const COIN_THICKNESS = 0.0045;
/** The drops thrown up by the splash, how long they're in the air (seconds of the splash), and gravity. */
const DROPS = 18;
const DROP_SECONDS = 0.42;
const GRAVITY = 9.8;
/** How often the coin on the bottom glints, and how long each glint lasts, seconds. */
const GLINT_EVERY = 2.4;
const GLINT_FOR = 0.35;

const GOLD = new THREE.Color('#f5c542');
const UNDER_WATER = new THREE.Color('#a9cdb5');

export default function CoinToss({ fx }: { fx: MutableRefObject<CoinFx> }) {
  const coin = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const crown = useRef<THREE.Mesh>(null);
  const drops = useRef<THREE.InstancedMesh>(null);
  const glint = useRef<THREE.Sprite>(null);
  const glintMap = useMemo(() => glintTexture(), []);
  const coinMaterial = useMemo(
    // (Not fully metal: with nothing in the scene for it to reflect, a metal coin looks dark.)
    () => new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.45, roughness: 0.3, emissive: '#c08a10', emissiveIntensity: 0.55, transparent: true }),
    []
  );
  const ringMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }), []);
  const crownMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#e6f8ff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    []
  );
  const glintMaterial = useMemo(
    () => new THREE.SpriteMaterial({ map: glintMap, color: '#fff3c4', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }),
    [glintMap]
  );
  // Each drop's way out (an angle round the splash), how fast it's thrown up and out, metres a second.
  const throws = useMemo(
    () =>
      Array.from({ length: DROPS }, (_, i) => ({
        angle: (i / DROPS) * Math.PI * 2 + (i % 3) * 0.37,
        up: 1.0 + ((i * 37) % 10) / 16,
        out: 0.22 + ((i * 53) % 10) / 36,
      })),
    []
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((state) => {
    const f = fx.current;
    if (coin.current) {
      coin.current.visible = f.shown;
      coin.current.position.copy(f.position);
      coin.current.rotation.set(f.spin, 0, f.tilt);
      coinMaterial.color.copy(GOLD).lerp(UNDER_WATER, f.under * 0.55);
      coinMaterial.emissiveIntensity = 0.55 - f.under * 0.2;
    }

    // The splash: a ring spreading on the water, a crown of water round the
    // coin as it goes in, and drops thrown up that fall back.
    const splashing = f.splashAt !== null && f.splash < 1;
    const p = splashing ? f.splash : 1;
    if (ring.current) {
      ring.current.visible = splashing;
      if (f.splashAt) ring.current.position.set(f.splashAt.x, f.splashAt.y + 0.004, f.splashAt.z);
      const spread = 0.03 + 0.42 * Math.sqrt(p);
      ring.current.scale.set(spread, spread, 1);
      ringMaterial.opacity = 0.85 * (1 - p);
    }
    if (crown.current) {
      crown.current.visible = splashing;
      const rise = Math.sin(Math.min(1, p * 2.2) * Math.PI);
      // (Standing on the water: the crown is 0.09 m tall about its middle.)
      if (f.splashAt) crown.current.position.set(f.splashAt.x, f.splashAt.y + 0.045 * rise, f.splashAt.z);
      crown.current.scale.set(0.5 + p, Math.max(0.001, rise), 0.5 + p);
      crownMaterial.opacity = 0.7 * rise;
    }
    if (drops.current) {
      drops.current.visible = splashing;
      const t = p * DROP_SECONDS * 1.6;
      throws.forEach((drop, i) => {
        const height = drop.up * t - (GRAVITY / 2) * t * t;
        const inAir = splashing && f.splashAt !== null && height > -0.005;
        dummy.position.set(
          (f.splashAt?.x ?? 0) + Math.cos(drop.angle) * drop.out * t,
          (f.splashAt?.y ?? 0) + Math.max(0, height),
          (f.splashAt?.z ?? 0) + Math.sin(drop.angle) * drop.out * t
        );
        dummy.scale.setScalar(inAir ? 1 : 0.0001);
        dummy.updateMatrix();
        drops.current!.setMatrixAt(i, dummy.matrix);
      });
      drops.current.instanceMatrix.needsUpdate = true;
    }

    // On the bottom, it catches the light now and then.
    if (glint.current) {
      glint.current.visible = f.shown && f.resting;
      glint.current.position.set(f.position.x, f.position.y + 0.015, f.position.z);
      const phase = (state.clock.elapsedTime % GLINT_EVERY) / GLINT_FOR;
      const flash = phase < 1 ? Math.sin(phase * Math.PI) : 0;
      glintMaterial.opacity = 0.25 + 0.75 * flash;
      glintMaterial.rotation = state.clock.elapsedTime * 0.6;
      glint.current.scale.setScalar(0.045 + 0.12 * flash);
    }
  });

  return (
    <group>
      <group ref={coin}>
        <mesh material={coinMaterial} renderOrder={4} castShadow>
          <cylinderGeometry args={[COIN_RADIUS, COIN_RADIUS, COIN_THICKNESS, 28]} />
        </mesh>
      </group>
      <mesh ref={ring} material={ringMaterial} rotation={[-Math.PI / 2, 0, 0]} renderOrder={4}>
        <ringGeometry args={[0.8, 1, 40]} />
      </mesh>
      <mesh ref={crown} material={crownMaterial} renderOrder={4}>
        <cylinderGeometry args={[0.035, 0.05, 0.09, 20, 1, true]} />
      </mesh>
      <instancedMesh ref={drops} args={[undefined, undefined, DROPS]} renderOrder={4}>
        <sphereGeometry args={[0.008, 8, 6]} />
        <meshStandardMaterial color="#f0fbff" emissive="#7dd3fc" emissiveIntensity={0.7} transparent opacity={0.9} />
      </instancedMesh>
      <sprite ref={glint} material={glintMaterial} renderOrder={5} />
    </group>
  );
}
