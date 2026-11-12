'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';

// The drink a player orders at the bar: a rocks glass of something amber
// with ice, on the counter in front of their stool, or in their hand as they
// sip it. Scene.tsx's Player moves it each frame through `fx`. Like the coin
// toss, it's always in the scene, so its shaders are built with everything
// else's at the start, and shows only what `fx` says.

export interface GlassFx {
  shown: boolean;
  /** The middle of the glass's base, world metres. */
  position: THREE.Vector3;
  /** Which way the player faces (the scene's heading), and how far the glass is tipped towards them, radians. */
  heading: number;
  tilt: number;
  /** How full, 0 to 1. */
  fill: number;
  /** Puts the glass where `fx` says straight away (set by BarGlass), for a change made after its own update this frame. */
  redraw?: () => void;
}

export function noGlass(): GlassFx {
  return { shown: false, position: new THREE.Vector3(0, -5, 0), heading: 0, tilt: 0, fill: 0 };
}

export const GLASS_HEIGHT = 0.095;
export const GLASS_RADIUS = 0.042;
const RADIUS_TOP = GLASS_RADIUS;
const RADIUS_BOTTOM = 0.036;
const BASE = 0.012;
/** How high the drink comes when it's full, from the inside bottom. */
const FULL = GLASS_HEIGHT - BASE - 0.018;

export default function BarGlass({ fx }: { fx: MutableRefObject<GlassFx> }) {
  const group = useRef<THREE.Group>(null);
  const tipped = useRef<THREE.Group>(null);
  const drink = useRef<THREE.Mesh>(null);
  const ice = useRef<THREE.Group>(null);
  const glass = useMemo(
    () => new THREE.MeshPhysicalMaterial({ color: '#e8f3ff', roughness: 0.05, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }),
    []
  );
  const liquid = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#c2690f', emissive: '#7a3305', emissiveIntensity: 0.5, roughness: 0.15, transparent: true, opacity: 0.88 }),
    []
  );
  // Its bottom at y 0, so scaling it by how full it is keeps it on the glass's base.
  const drinkShape = useMemo(
    () => new THREE.CylinderGeometry(RADIUS_BOTTOM + (RADIUS_TOP - RADIUS_BOTTOM) * 0.85 - 0.003, RADIUS_BOTTOM - 0.003, FULL, 24).translate(0, FULL / 2, 0),
    []
  );
  const cube = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f4fbff', roughness: 0.1, transparent: true, opacity: 0.6 }), []);

  // Put where `fx` says, every frame and whenever asked again (`redraw`).
  const place = () => {
    const g = group.current;
    if (!g) return;
    const f = fx.current;
    g.visible = f.shown;
    if (!f.shown) return;
    g.position.copy(f.position);
    g.rotation.set(0, f.heading, 0);
    // Tipped back about its base, the rim towards the player (their -z, once the heading turns it).
    if (tipped.current) tipped.current.rotation.set(-f.tilt, 0, 0);
    const fill = Math.max(0, Math.min(1, f.fill));
    if (drink.current) {
      drink.current.visible = fill > 0.01;
      drink.current.scale.set(1, Math.max(0.001, fill), 1);
    }
    if (ice.current) ice.current.position.y = BASE + Math.max(0.012, fill * FULL - 0.01);
  };
  fx.current.redraw = place;
  useFrame(place);

  return (
    <group ref={group}>
      <group ref={tipped}>
        {/* The glass: a heavy base and the open sides. */}
        <mesh position={[0, BASE / 2, 0]} material={glass}>
          <cylinderGeometry args={[RADIUS_BOTTOM, RADIUS_BOTTOM, BASE, 24]} />
        </mesh>
        <mesh position={[0, GLASS_HEIGHT / 2, 0]} material={glass}>
          <cylinderGeometry args={[RADIUS_TOP, RADIUS_BOTTOM, GLASS_HEIGHT, 24, 1, true]} />
        </mesh>
        {/* The drink, scaled from the bottom up by how full it is. */}
        <group position={[0, BASE, 0]}>
          <mesh ref={drink} material={liquid} geometry={drinkShape} />
        </group>
        {/* Two ice cubes floating at the top of the drink. */}
        <group ref={ice}>
          <mesh position={[0.012, 0, 0.006]} rotation={[0.3, 0.6, 0.2]} material={cube}>
            <boxGeometry args={[0.024, 0.024, 0.024]} />
          </mesh>
          <mesh position={[-0.014, 0.004, -0.008]} rotation={[-0.2, 1.1, 0.4]} material={cube}>
            <boxGeometry args={[0.022, 0.022, 0.022]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
