'use client';

import { RoundedBox } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useMemo, type MutableRefObject, type ReactNode } from 'react';
import * as THREE from 'three';
import { FRONT_DESK, KIOSKS, KIOSK_INSET } from '../../lib/casinoFloor';
import Highlight from './Highlight';
import Person from './Person';
import { arcShadowTexture, flutedWoodTexture, kioskScreenTexture, marbleTexture, medallionTexture } from './textures';

// The lobby's front desk (Lobby.tsx places it against a side wall): a
// curved reception desk bowing out towards the lobby, its fluted walnut front
// between gold bands, divided into panels by gold beads, over a plinth lit
// along its foot; the casino's chip-and-star emblem in the middle; a raised
// marble top with a rounded edge over a gold fillet and a shadow line; and
// on it two check-in kiosks (tablets on stands), a service bell and a
// banker's lamp. A receptionist stands behind it at the lower work surface,
// and a soft shadow lies round it on the floor.
//
// Drawn around the desk's centre of curvature: the front is a circle's arc of
// radius R, centred on +x and SPAN radians long. An angle `a` along it is
// measured from +x towards +z.

const R = FRONT_DESK.radius;
const SPAN = FRONT_DESK.span;
/** The marble top's height, how far in it reaches, and the work surface behind it. */
const TOP = 1.1;
const TOP_INNER = R - 0.32;
const WORK = 0.78;
const WORK_INNER = FRONT_DESK.inner;
const PLINTH = 0.12;

/** Where angle `a` at radius `r` is, [x, z]; and the turn that faces something there outwards. */
const along = (r: number, a: number): [number, number] => [Math.cos(a) * r, Math.sin(a) * r];
const facingOut = (a: number) => Math.PI / 2 - a;

function Gold() {
  return <meshStandardMaterial color="#c9a227" metalness={0.9} roughness={0.25} />;
}

function Walnut() {
  return <meshStandardMaterial color="#3a2112" roughness={0.5} side={THREE.DoubleSide} />;
}

/** A curved upright panel at radius r, `height` tall, centred at height y. */
function Band({ r, y, height, children }: { r: number; y: number; height: number; children: ReactNode }) {
  return (
    <mesh position={[0, y, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[r, r, height, 72, 1, true, Math.PI / 2 - SPAN / 2, SPAN]} />
      {children}
    </mesh>
  );
}

/** A flat curved slab from radius r1 to r2, `thick` deep, its top at height y. */
function Slab({ r1, r2, y, thick, children }: { r1: number; r2: number; y: number; thick: number; children: ReactNode }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, r2, -SPAN / 2, SPAN / 2, false);
    shape.absarc(0, 0, r1, SPAN / 2, -SPAN / 2, true);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 72 });
  }, [r1, r2, thick]);
  return (
    <mesh geometry={geometry} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
      {children}
    </mesh>
  );
}

/** A thin curved rod along the desk at radius r and height y: gold trim, a strip of light, a shadow line, or the marble top's rounded edge. */
function Trim({ r, y, tube = 0.012, kind = 'gold', marble }: { r: number; y: number; tube?: number; kind?: 'gold' | 'glow' | 'shadow' | 'marble'; marble?: THREE.Texture }) {
  return (
    <mesh position={[0, y, 0]} rotation={[Math.PI / 2, 0, -SPAN / 2]}>
      <torusGeometry args={[r, tube, 10, 96, SPAN]} />
      {kind === 'glow' ? (
        <meshStandardMaterial color="#ffe2a8" emissive="#ffcf7a" emissiveIntensity={2.4} toneMapped={false} />
      ) : kind === 'shadow' ? (
        <meshStandardMaterial color="#0d0704" roughness={0.9} />
      ) : kind === 'marble' ? (
        <meshPhysicalMaterial map={marble} roughness={0.2} clearcoat={0.8} clearcoatRoughness={0.15} />
      ) : (
        <Gold />
      )}
    </mesh>
  );
}

/** A rounded rectangle, flat, for a tablet's glass. */
function roundedRect(w: number, h: number, r: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return new THREE.ShapeGeometry(shape, 6);
}

function Aluminium() {
  return <meshStandardMaterial color="#d6cdb8" metalness={0.8} roughness={0.32} />;
}

/**
 * A check-in kiosk: a tablet on a weighted stand, its post leaning back to a
 * hinge so the screen tips up towards whoever's in front (towards +z). A
 * rounded aluminium body, a black glass front with a camera in the top
 * bezel, and the check-in screen.
 */
function KioskTablet({ screen, screenRef }: { screen: THREE.Texture; screenRef?: (mesh: THREE.Mesh | null) => void }) {
  const glass = useMemo(() => roundedRect(0.352, 0.237, 0.011), []);
  return (
    <group>
      <mesh position={[0, 0.008, 0]} castShadow>
        <cylinderGeometry args={[0.085, 0.092, 0.016, 32]} />
        <Aluminium />
      </mesh>
      <mesh position={[0, 0.0165, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.002, 32]} />
        <meshStandardMaterial color="#1f2937" roughness={0.7} />
      </mesh>
      <group position={[0, 0.016, -0.02]} rotation={[-0.2, 0, 0]}>
        <mesh position={[0, 0.1, 0]} castShadow>
          <cylinderGeometry args={[0.011, 0.014, 0.2, 16]} />
          <Aluminium />
        </mesh>
        <group position={[0, 0.205, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.016, 0.016, 0.06, 16]} />
            <Aluminium />
          </mesh>
          <group position={[0, 0.03, 0.018]} rotation={[-0.15, 0, 0]}>
            <RoundedBox args={[0.36, 0.245, 0.014]} radius={0.012} smoothness={4} castShadow>
              <Aluminium />
            </RoundedBox>
            <mesh geometry={glass} position={[0, 0, 0.0072]}>
              <meshPhysicalMaterial color="#05060a" roughness={0.08} clearcoat={1} clearcoatRoughness={0.05} />
            </mesh>
            <mesh ref={screenRef} position={[0, 0, 0.0076]}>
              <planeGeometry args={[0.318, 0.199]} />
              <meshStandardMaterial map={screen} emissiveMap={screen} emissive="#ffffff" emissiveIntensity={1.1} toneMapped={false} />
            </mesh>
            <mesh position={[0, 0.111, 0.0078]}>
              <circleGeometry args={[0.003, 12]} />
              <meshStandardMaterial color="#334155" roughness={0.3} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}

/** A brass service bell on a black base. */
function Bell() {
  return (
    <group>
      <mesh position={[0, 0.006, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.012, 24]} />
        <meshStandardMaterial color="#111827" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.012, 0]}>
        <sphereGeometry args={[0.06, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <Gold />
      </mesh>
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.005, 0.005, 0.014, 8]} />
        <Gold />
      </mesh>
      <mesh position={[0, 0.09, 0]}>
        <sphereGeometry args={[0.012, 10, 8]} />
        <Gold />
      </mesh>
    </group>
  );
}

/** A banker's lamp: a brass stand, and a green glass shade glowing over its bulb, facing +z. */
function BankersLamp() {
  return (
    <group>
      <mesh position={[0, 0.012, 0]}>
        <cylinderGeometry args={[0.07, 0.078, 0.024, 24]} />
        <Gold />
      </mesh>
      <mesh position={[0, 0.17, -0.02]}>
        <cylinderGeometry args={[0.008, 0.008, 0.3, 10]} />
        <Gold />
      </mesh>
      <group position={[0, 0.33, 0.03]} rotation={[0.25, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.075, 0.075, 0.28, 24, 1, true, 0, Math.PI]} />
          <meshPhysicalMaterial color="#14532d" emissive="#166534" emissiveIntensity={0.35} roughness={0.12} clearcoat={1} side={THREE.DoubleSide} />
        </mesh>
        {[-0.14, 0.14].map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.075, 0.005, 6, 24, Math.PI]} />
            <Gold />
          </mesh>
        ))}
        <mesh position={[0, -0.015, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.014, 0.014, 0.22, 10]} />
          <meshStandardMaterial color="#fff4d6" emissive="#ffd9a0" emissiveIntensity={2.4} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

export default function FrontDesk({
  outlined = null,
  screens,
  onKioskClick,
}: {
  /** The check-in tablet a guest is near enough to use, outlined (SRS-103.13). */
  outlined?: number | null;
  /** Each tablet's screen, for the camera to fly into. */
  screens?: MutableRefObject<(THREE.Object3D | null)[]>;
  onKioskClick?: (kiosk: number, event: ThreeEvent<MouseEvent>) => void;
} = {}) {
  const fluted = useMemo(() => flutedWoodTexture([(R * SPAN) / 0.64, 1]), []);
  const marble = useMemo(() => marbleTexture([0.6, 0.6], false), []);
  const shadowSize = 2 * (R + 0.7);
  const shadow = useMemo(() => arcShadowTexture(R - 0.12, SPAN + 0.12, shadowSize), [shadowSize]);
  const emblem = useMemo(() => medallionTexture(), []);
  const screen = useMemo(() => kioskScreenTexture(), []);
  const frontHeight = TOP - 0.05 - PLINTH;

  return (
    <group>
      {/* The plinth, set back a little, with a strip of light along its foot. */}
      <Band r={R - 0.05} y={PLINTH / 2} height={PLINTH}>
        <meshStandardMaterial color="#0b0b0f" roughness={0.4} side={THREE.DoubleSide} />
      </Band>
      <Trim r={R - 0.03} y={0.022} tube={0.008} kind="glow" />
      <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[shadowSize, shadowSize]} />
        <meshBasicMaterial map={shadow} transparent depthWrite={false} />
      </mesh>

      {/* The fluted front between gold bands, and gold-edged ends. */}
      <Band r={R} y={PLINTH + frontHeight / 2} height={frontHeight}>
        <meshStandardMaterial map={fluted} bumpMap={fluted} bumpScale={1.5} roughness={0.55} side={THREE.DoubleSide} />
      </Band>
      <Trim r={R + 0.006} y={PLINTH + 0.02} />
      <Trim r={R + 0.006} y={PLINTH + 0.045} tube={0.005} />
      <Trim r={R + 0.006} y={TOP - 0.08} />
      <Trim r={R + 0.006} y={TOP - 0.105} tube={0.005} />
      {/* Gold beads dividing the front into panels either side of the emblem. */}
      {[-0.55, 0.55].map((a) => {
        const [x, z] = along(R + 0.006, a);
        return (
          <mesh key={a} position={[x, PLINTH + frontHeight / 2, z]}>
            <cylinderGeometry args={[0.012, 0.012, frontHeight - 0.14, 10]} />
            <Gold />
          </mesh>
        );
      })}
      {[-1, 1].map((side) => {
        const a = (side * SPAN) / 2;
        const [x, z] = along((R + WORK_INNER) / 2, a);
        const [ex, ez] = along(R + 0.01, a);
        return (
          <group key={side}>
            <mesh position={[x, TOP / 2, z]} rotation={[0, -a, 0]} castShadow>
              <boxGeometry args={[R - WORK_INNER + 0.06, TOP - 0.05, 0.08]} />
              <Walnut />
            </mesh>
            <mesh position={[ex, PLINTH + frontHeight / 2, ez]}>
              <cylinderGeometry args={[0.022, 0.022, frontHeight, 12]} />
              <Gold />
            </mesh>
          </group>
        );
      })}

      {/* The raised marble top with its gold edge; behind it, the work surface. */}
      <Slab r1={TOP_INNER} r2={R + 0.06} y={TOP} thick={0.05}>
        <meshPhysicalMaterial map={marble} roughness={0.2} clearcoat={0.8} clearcoatRoughness={0.15} />
      </Slab>
      <Trim r={R + 0.06} y={TOP - 0.025} tube={0.025} kind="marble" marble={marble} />
      <Trim r={R + 0.05} y={TOP - 0.058} tube={0.007} />
      <Trim r={R + 0.012} y={TOP - 0.062} tube={0.01} kind="shadow" />
      <Band r={TOP_INNER} y={(WORK + TOP - 0.05) / 2} height={TOP - 0.05 - WORK}>
        <Walnut />
      </Band>
      <Slab r1={WORK_INNER} r2={TOP_INNER + 0.02} y={WORK} thick={0.04}>
        <meshStandardMaterial color="#2b170d" roughness={0.45} />
      </Slab>
      <Band r={WORK_INNER} y={(WORK - 0.04) / 2} height={WORK - 0.04}>
        <Walnut />
      </Band>

      {/* The receptionist, between the kiosks, hands on the work surface. */}
      {(() => {
        const [x, z] = along(R - 1.12, 0);
        return (
          <group position={[x, 0, z]} rotation={[0, facingOut(0), 0]}>
            <Person who="staff" pose="dealer" hands={{ y: WORK + 0.02, z: 0.38 }} idleOffset={0.7} />
          </group>
        );
      })()}

      {/* The casino's emblem in the middle of the front, ringed in gold. */}
      <group position={[R + 0.016, PLINTH + frontHeight / 2, 0]}>
        <mesh rotation={[0, 0, -Math.PI / 2]}>
          <cylinderGeometry args={[0.26, 0.26, 0.024, 48]} />
          <meshStandardMaterial attach="material-0" color="#c9a227" metalness={0.9} roughness={0.25} />
          <meshStandardMaterial attach="material-1" map={emblem} roughness={0.3} metalness={0.2} />
          <meshStandardMaterial attach="material-2" color="#c9a227" metalness={0.9} roughness={0.25} />
        </mesh>
        <mesh rotation={[0, Math.PI / 2, 0]} position={[0.012, 0, 0]}>
          <torusGeometry args={[0.265, 0.014, 8, 48]} />
          <Gold />
        </mesh>
      </group>

      {/* On the top: the two kiosks either side of the middle, the bell and the lamp at the ends. */}
      {KIOSKS.map((a, kiosk) => {
        const [x, z] = along(R - KIOSK_INSET, a);
        return (
          <group key={a} position={[x, TOP, z]} rotation={[0, facingOut(a), 0]} onClick={(event) => onKioskClick?.(kiosk, event)}>
            <Highlight enabled={outlined === kiosk}>
              <KioskTablet
                screen={screen}
                screenRef={(mesh) => {
                  if (screens) screens.current[kiosk] = mesh;
                }}
              />
            </Highlight>
          </group>
        );
      })}
      {(() => {
        const [x, z] = along(R - 0.15, 0.62);
        return (
          <group position={[x, TOP, z]} rotation={[0, facingOut(0.62), 0]}>
            <Bell />
          </group>
        );
      })()}
      {(() => {
        const [x, z] = along(R - 0.17, -0.62);
        return (
          <group position={[x, TOP, z]} rotation={[0, facingOut(-0.62), 0]}>
            <BankersLamp />
          </group>
        );
      })()}
    </group>
  );
}
