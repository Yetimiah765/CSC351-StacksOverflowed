'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { LobbyState } from './Lobby';
import { rippleTexture, waterStreakTexture } from './textures';

// A tiered marble fountain for the lobby (Lobby.tsx places it): a moulded
// round basin, a baluster pedestal carrying a bowl, a smaller bowl above
// that, and a gold finial throwing up a jet of water. Water spills over each
// bowl's rim into the one below in curtains of streaks scrolling down,
// rings spread where it lands, droplets arc from the jet, and lights under
// the water make it glow. It's all textures and simple shapes moved each
// frame — no physics, and nothing that draws the scene twice — so it costs
// little and looks the same in every browser.

/** A shape turned round the vertical axis, from [radius, height] points. */
function lathe(points: [number, number][], segments = 56) {
  return new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    segments
  );
}

function Stone() {
  return <meshStandardMaterial color="#ece3d2" roughness={0.35} side={THREE.DoubleSide} />;
}

function Gold() {
  return <meshStandardMaterial color="#c9a227" metalness={0.9} roughness={0.25} />;
}

/** A flat gold ring at height y. */
function Rim({ r, y, tube }: { r: number; y: number; tube: number }) {
  return (
    <mesh position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[r, tube, 10, 64]} />
      <Gold />
    </mesh>
  );
}

/** The heights of the three pools of water, and how far out each bowl's curtain falls from. */
const BASIN_WATER = 0.48;
const BOWL_WATER = 1.405;
const TOP_WATER = 1.855;
const JET_TOP = 2.34;
const DROPS = 16;

export default function Fountain({ state }: { state: MutableRefObject<LobbyState> }) {
  const geometry = useMemo(
    () => ({
      basin: lathe([
        [0.96, 0.3],
        [0.96, 0.5],
        [0.98, 0.56],
        [1.08, 0.56],
        [1.12, 0.52],
        [1.1, 0.46],
        [1.02, 0.4],
        [1.05, 0.12],
        [1.1, 0.07],
        [1.12, 0.02],
        [1.08, 0],
      ]),
      pedestal: lathe([
        [0.3, 0.3],
        [0.3, 0.38],
        [0.2, 0.46],
        [0.14, 0.7],
        [0.16, 0.86],
        [0.22, 0.95],
        [0.13, 1.05],
        [0.1, 1.14],
      ]),
      bowl: lathe([
        [0.08, 1.1],
        [0.28, 1.16],
        [0.48, 1.27],
        [0.6, 1.38],
        [0.63, 1.43],
        [0.6, 1.46],
        [0.54, 1.44],
        [0.5, 1.38],
        [0.3, 1.33],
        [0, 1.31],
      ]),
      stem: lathe([
        [0.09, 1.3],
        [0.1, 1.42],
        [0.06, 1.55],
        [0.075, 1.66],
        [0.05, 1.73],
      ]),
      top: lathe([
        [0.04, 1.71],
        [0.16, 1.75],
        [0.26, 1.82],
        [0.29, 1.87],
        [0.27, 1.89],
        [0.23, 1.86],
        [0.12, 1.81],
        [0, 1.8],
      ]),
    }),
    []
  );

  // The water's textures: the pools shimmer, the curtains and the jet stream.
  const ripple = useMemo(() => rippleTexture(), []);
  const streaks = useMemo(() => {
    const base = waterStreakTexture();
    const make = (around: number) => {
      const copy = base.clone();
      copy.repeat.set(around, 1);
      copy.needsUpdate = true;
      return copy;
    };
    return { top: make(4), bowl: make(9), jet: make(1) };
  }, []);
  useEffect(() => {
    ripple.center.set(0.5, 0.5);
  }, [ripple]);

  // Rings spreading where each curtain lands, three to a pool, and the drops from the jet.
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const drops = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }, delta) => {
    if (!state.current.shown) return;
    const t = clock.elapsedTime;
    streaks.top.offset.y += delta * 1.1;
    streaks.bowl.offset.y += delta * 1.4;
    streaks.jet.offset.y -= delta * 2.2;
    ripple.rotation = t * 0.05;
    rings.current.forEach((ring, i) => {
      if (!ring) return;
      const inBowl = i >= 3;
      const k = (t * 0.55 + (i % 3) / 3) % 1;
      const [from, to] = inBowl ? [0.34, 0.52] : [0.73, 0.94];
      const r = from + (to - from) * k;
      ring.scale.set(r, r, 1);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k);
    });
    const mesh = drops.current;
    if (mesh) {
      for (let i = 0; i < DROPS; i++) {
        const k = (t * 0.9 + i / DROPS) % 1;
        const angle = (i / DROPS) * Math.PI * 2 + i * 0.7;
        const r = 0.02 + 0.19 * k;
        dummy.position.set(Math.cos(angle) * r, JET_TOP + 0.12 * k - (JET_TOP + 0.12 - TOP_WATER) * k * k, Math.sin(angle) * r);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  const water = (radius: number, y: number) => (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <circleGeometry args={[radius, 56]} />
      <meshStandardMaterial map={ripple} color="#9ad6ea" emissive="#1b6d8c" emissiveIntensity={0.55} roughness={0.06} metalness={0.15} transparent opacity={0.86} depthWrite={false} />
    </mesh>
  );
  const curtain = (top: number, bottom: number, rTop: number, rBottom: number, map: THREE.Texture) => (
    <mesh position={[0, (top + bottom) / 2, 0]} renderOrder={2}>
      <cylinderGeometry args={[rTop, rBottom, top - bottom, 56, 1, true]} />
      <meshStandardMaterial map={map} color="#e6f8ff" emissive="#3aa0c8" emissiveIntensity={0.35} roughness={0.1} transparent depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );

  return (
    <group>
      {/* The basin: its floor with a ring of lights under the water, and a gold rim. */}
      <mesh geometry={geometry.basin} castShadow receiveShadow>
        <Stone />
      </mesh>
      <mesh position={[0, 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.97, 56]} />
        <meshStandardMaterial color="#0d3d4d" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.32, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.86, 0.02, 8, 64]} />
        <meshStandardMaterial color="#c8f2ff" emissive="#7dd3fc" emissiveIntensity={2.6} toneMapped={false} />
      </mesh>
      {water(0.965, BASIN_WATER)}
      <Rim r={1.08} y={0.56} tube={0.018} />

      {/* The pedestal and the bowl it carries; a stem and the top bowl; the finial. */}
      <mesh geometry={geometry.pedestal} castShadow>
        <Stone />
      </mesh>
      <Rim r={0.22} y={0.95} tube={0.015} />
      <mesh geometry={geometry.bowl} castShadow>
        <Stone />
      </mesh>
      {water(0.55, BOWL_WATER)}
      <Rim r={0.62} y={1.445} tube={0.012} />
      <mesh geometry={geometry.stem}>
        <Stone />
      </mesh>
      <mesh geometry={geometry.top}>
        <Stone />
      </mesh>
      {water(0.235, TOP_WATER)}
      <Rim r={0.285} y={1.88} tube={0.008} />
      <mesh position={[0, 1.88, 0]}>
        <cylinderGeometry args={[0.018, 0.024, 0.16, 12]} />
        <Gold />
      </mesh>
      <mesh position={[0, 1.97, 0]}>
        <sphereGeometry args={[0.04, 16, 12]} />
        <Gold />
      </mesh>

      {/* The water: the jet, its drops, the curtains over each rim, and rings where they land. */}
      <mesh position={[0, (JET_TOP + 2.0) / 2, 0]} renderOrder={2}>
        <cylinderGeometry args={[0.012, 0.022, JET_TOP - 2.0, 12, 1, true]} />
        <meshStandardMaterial map={streaks.jet} color="#ffffff" emissive="#7dd3fc" emissiveIntensity={0.5} transparent depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <instancedMesh ref={drops} args={[undefined, undefined, DROPS]} renderOrder={2}>
        <sphereGeometry args={[0.011, 8, 6]} />
        <meshStandardMaterial color="#f0fbff" emissive="#7dd3fc" emissiveIntensity={0.6} transparent opacity={0.9} />
      </instancedMesh>
      {curtain(1.885, BOWL_WATER, 0.29, 0.345, streaks.top)}
      {curtain(1.445, BASIN_WATER, 0.63, 0.73, streaks.bowl)}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            rings.current[i] = mesh;
          }}
          position={[0, (i >= 3 ? BOWL_WATER : BASIN_WATER) + 0.004, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={3}
        >
          <ringGeometry args={[0.97, 1, 48]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
