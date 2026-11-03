'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import * as THREE from 'three';
import { COLS, DOOR, LOBBY, ROWS, TILE_METRES } from '../../lib/casinoFloor';
import { Pillar, Plant } from './Furniture';
import { cityTexture, lobbyWallTexture, marbleTexture, neonTexture } from './textures';

// The building's lobby in front of the casino (SRS-103.12), only there for
// the walk in after logging in: the front of the building (glass doors
// between big windows onto the city at night), a marble lobby with columns,
// chandeliers, a concierge desk and a red carpet, and at its far end the
// casino's big double doors. Scene.tsx's walk-in opens the doors as the
// player reaches them and hides the lobby once they're on the casino floor
// (by then it's behind the camera), keeping its lights at zero rather than
// removing them, so no shader has to be rebuilt mid-walk.

/** What the walk in tells the lobby each frame. */
export interface LobbyState {
  /** How far open the building's glass doors and the casino's doors are, 0 to 1. */
  front: number;
  casino: number;
  /** False once the player's on the casino floor: the lobby is hidden. */
  shown: boolean;
}

const M = TILE_METRES;
const doorX = (DOOR.x + DOOR.w / 2 - COLS / 2) * M;
/** The casino's door (the lobby's far wall) and the building's front, world z. */
export const LOBBY_NORTH_Z = (DOOR.y - ROWS / 2) * M;
export const LOBBY_SOUTH_Z = (DOOR.y + LOBBY.depth - ROWS / 2) * M;
const HALF_W = (LOBBY.width / 2) * M;
export const LOBBY_HALF_WIDTH = HALF_W;
export const LOBBY_HEIGHT = 6.5;
const H = LOBBY_HEIGHT;
/** The casino's doorway: bigger than the gap in the floor's rail. */
export const CASINO_DOOR_HALF = 1.6;
const CASINO_DOOR_HEIGHT = 4.2;
/** The building's front doorway. */
const FRONT_DOOR_HALF = 1.3;
const FRONT_DOOR_HEIGHT = 3.4;

function Gold() {
  return <meshStandardMaterial color="#c9a227" metalness={0.9} roughness={0.25} />;
}

/** A box from (x1, y1) to (x2, y2) across a wall at `z`, `depth` thick, with the wall's paint. */
function WallPiece({ x1, x2, y1, y2, z, depth = 0.3, map }: { x1: number; x2: number; y1: number; y2: number; z: number; depth?: number; map: THREE.Texture }) {
  return (
    <mesh position={[(x1 + x2) / 2, (y1 + y2) / 2, z]} receiveShadow>
      <boxGeometry args={[x2 - x1, y2 - y1, depth]} />
      <meshStandardMaterial map={map} roughness={0.75} />
    </mesh>
  );
}

/** A tall window in the building's front: an opening framed in gold, with mullions and the faintest glass. */
function FrontWindow({ x1, x2, y1, y2, z }: { x1: number; x2: number; y1: number; y2: number; z: number }) {
  const w = x2 - x1;
  const h = y2 - y1;
  const cx = (x1 + x2) / 2;
  const bar = (key: string, x: number, y: number, bw: number, bh: number) => (
    <mesh key={key} position={[x, y, z]}>
      <boxGeometry args={[bw, bh, 0.12]} />
      <Gold />
    </mesh>
  );
  return (
    <group>
      <mesh position={[cx, (y1 + y2) / 2, z]}>
        <planeGeometry args={[w, h]} />
        <meshPhysicalMaterial color="#c7d2fe" transparent opacity={0.07} roughness={0.05} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {bar('top', cx, y2, w + 0.1, 0.1)}
      {bar('bottom', cx, y1, w + 0.1, 0.1)}
      {bar('left', x1, (y1 + y2) / 2, 0.1, h)}
      {bar('right', x2, (y1 + y2) / 2, 0.1, h)}
      {bar('mullion', cx, (y1 + y2) / 2, 0.05, h)}
      {[0.38, 0.72].map((f) => bar(`transom-${f}`, cx, y1 + h * f, w, 0.05))}
    </group>
  );
}

function Chandelier({ z }: { z: number }) {
  const y = H - 1.4;
  const drops = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 ? 0.72 : 0.46;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r, y: i % 2 ? -0.32 : -0.5 };
  });
  return (
    <group position={[doorX, y, z]}>
      <mesh position={[0, (H - y) / 2, 0]}>
        <cylinderGeometry args={[0.02, 0.02, H - y, 6]} />
        <Gold />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.72, 0.035, 8, 40]} />
        <Gold />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.18, 0]}>
        <torusGeometry args={[0.46, 0.03, 8, 32]} />
        <Gold />
      </mesh>
      <mesh position={[0, -0.12, 0]}>
        <sphereGeometry args={[0.2, 20, 14]} />
        <meshStandardMaterial color="#fff4d6" emissive="#ffe2a8" emissiveIntensity={3} toneMapped={false} />
      </mesh>
      {drops.map((drop, i) => (
        <group key={i} position={[drop.x, drop.y, drop.z]}>
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.006, 0.006, 0.24, 4]} />
            <Gold />
          </mesh>
          <mesh>
            <octahedronGeometry args={[0.06, 0]} />
            <meshStandardMaterial color="#fffaf0" emissive="#ffe8c2" emissiveIntensity={1.6} transparent opacity={0.9} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** The height a chandelier's light hangs at. */
const CHANDELIER_LIGHT_Y = H - 1.7;

/** One of the casino's doors: mahogany, gold panels and a ring handle, hung at `hinge` and swinging out into the lobby. */
function CasinoDoor({ side, door }: { side: -1 | 1; door: MutableRefObject<THREE.Group | null> }) {
  const w = CASINO_DOOR_HALF;
  const h = CASINO_DOOR_HEIGHT;
  const strip = (key: string, x: number, y: number, sw: number, sh: number) => (
    <mesh key={key} position={[x, y, 0.07]}>
      <boxGeometry args={[sw, sh, 0.02]} />
      <Gold />
    </mesh>
  );
  // Laid out from the hinge: the leaf runs -side·x away from it.
  const along = (f: number) => -side * w * f;
  return (
    <group ref={door} position={[doorX + side * w, 0, LOBBY_NORTH_Z + 0.22]}>
      <mesh position={[along(0.5), h / 2, 0]} castShadow>
        <boxGeometry args={[w - 0.03, h - 0.04, 0.12]} />
        <meshStandardMaterial color="#4a1d10" roughness={0.45} metalness={0.15} />
      </mesh>
      {/* Two raised panels outlined in gold, and a studded edge. */}
      {[
        [h * 0.68, h * 0.46],
        [h * 0.22, h * 0.3],
      ].map(([cy, ph]) => (
        <group key={cy}>
          {strip(`t${cy}`, along(0.5), cy + ph / 2, w * 0.7, 0.04)}
          {strip(`b${cy}`, along(0.5), cy - ph / 2, w * 0.7, 0.04)}
          {strip(`l${cy}`, along(0.15), cy, 0.04, ph)}
          {strip(`r${cy}`, along(0.85), cy, 0.04, ph)}
        </group>
      ))}
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[along(0.94), 0.4 + i * ((h - 0.8) / 8), 0.07]}>
          <sphereGeometry args={[0.025, 8, 6]} />
          <Gold />
        </mesh>
      ))}
      {/* The big ring handle near the meeting edge. */}
      <mesh position={[along(0.88), 1.15, 0.12]}>
        <torusGeometry args={[0.1, 0.018, 8, 24]} />
        <Gold />
      </mesh>
    </group>
  );
}

/** A brass stanchion. */
function Stanchion({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.16, 0.18, 0.04, 20]} />
        <Gold />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 1, 10]} />
        <Gold />
      </mesh>
      <mesh position={[0, 1.02, 0]}>
        <sphereGeometry args={[0.05, 12, 8]} />
        <Gold />
      </mesh>
    </group>
  );
}

/** A red velvet rope sagging between two stanchions. */
function Rope({ x, z1, z2 }: { x: number; z1: number; z2: number }) {
  const geometry = useMemo(() => {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, 0.95, z1), new THREE.Vector3(x, 0.62, (z1 + z2) / 2), new THREE.Vector3(x, 0.95, z2));
    return new THREE.TubeGeometry(curve, 16, 0.025, 8, false);
  }, [x, z1, z2]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#9f1239" roughness={0.7} />
    </mesh>
  );
}

function StreetLamp({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.8, 0]}>
        <cylinderGeometry args={[0.05, 0.08, 3.6, 10]} />
        <meshStandardMaterial color="#111827" roughness={0.5} metalness={0.6} />
      </mesh>
      <mesh position={[0, 3.75, 0]}>
        <sphereGeometry args={[0.22, 16, 12]} />
        <meshStandardMaterial color="#fff7e0" emissive="#ffe8b0" emissiveIntensity={2.5} toneMapped={false} />
      </mesh>
    </group>
  );
}

export default function Lobby({ state }: { state: MutableRefObject<LobbyState> }) {
  const north = LOBBY_NORTH_Z;
  const south = LOBBY_SOUTH_Z;
  const depth = south - north;
  const mid = (north + south) / 2;
  const marble = useMemo(() => marbleTexture([HALF_W / 1.2, depth / 1.2]), [depth]);
  const walls = useMemo(() => lobbyWallTexture([depth / 1.8, 1]), [depth]);
  const endWalls = useMemo(() => lobbyWallTexture([2, 1]), []);
  const city = useMemo(() => cityTexture(), []);
  const casinoSign = useMemo(() => neonTexture('CASINO', '#ff3fa4'), []);
  const nameSign = useMemo(() => neonTexture('STACKS OVERFLOWED', '#fbbf24'), []);

  const group = useRef<THREE.Group>(null);
  const leftGlass = useRef<THREE.Group>(null);
  const rightGlass = useRef<THREE.Group>(null);
  const leftDoor = useRef<THREE.Group>(null);
  const rightDoor = useRef<THREE.Group>(null);
  const lights = [useRef<THREE.PointLight>(null), useRef<THREE.PointLight>(null), useRef<THREE.PointLight>(null)];
  const brightness = [16, 16, 9];

  useFrame(() => {
    const { front, casino, shown } = state.current;
    if (group.current) group.current.visible = shown;
    lights.forEach((light, i) => {
      if (light.current) light.current.intensity = shown ? brightness[i]! : 0;
    });
    const slide = front * (FRONT_DOOR_HALF + 0.05);
    if (leftGlass.current) leftGlass.current.position.x = doorX - FRONT_DOOR_HALF / 2 - slide;
    if (rightGlass.current) rightGlass.current.position.x = doorX + FRONT_DOOR_HALF / 2 + slide;
    // The casino's doors swing out into the lobby, a little past square.
    const swing = casino * (Math.PI / 2) * 0.92;
    if (leftDoor.current) leftDoor.current.rotation.y = -swing;
    if (rightDoor.current) rightDoor.current.rotation.y = swing;
  });

  // The building's front, left to right: wall, window, wall, window, wall, the door, and the same again.
  const piers: [number, number][] = [];
  const windows: [number, number][] = [];
  {
    let x = FRONT_DOOR_HALF;
    for (const [kind, w] of [['pier', 0.4], ['window', 1.8], ['pier', 0.4], ['window', 1.8]] as const) {
      (kind === 'pier' ? piers : windows).push([x, x + w]);
      x += w;
    }
    piers.push([x, HALF_W]);
  }
  const mirrored = (spans: [number, number][]) => spans.flatMap(([a, b]) => [[doorX + a, doorX + b], [doorX - b, doorX - a]] as [number, number][]);
  const windowBottom = 0.5;
  const windowTop = 5.2;

  const glassDoor = (ref: typeof leftGlass, key: string): ReactNode => (
    <group key={key} ref={ref} position={[0, 0, south + 0.24]}>
      <mesh position={[0, FRONT_DOOR_HEIGHT / 2, 0]}>
        <planeGeometry args={[FRONT_DOOR_HALF - 0.04, FRONT_DOOR_HEIGHT - 0.06]} />
        <meshPhysicalMaterial color="#a5f3fc" transparent opacity={0.16} roughness={0.05} metalness={0.1} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {[0.03, FRONT_DOOR_HEIGHT - 0.03].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[FRONT_DOOR_HALF, 0.05, 0.05]} />
          <Gold />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * FRONT_DOOR_HALF) / 2, FRONT_DOOR_HEIGHT / 2, 0]}>
          <boxGeometry args={[0.05, FRONT_DOOR_HEIGHT, 0.05]} />
          <Gold />
        </mesh>
      ))}
    </group>
  );

  return (
    <>
      <group ref={group}>
        {/* The marble floor and the red carpet down the middle, door to door. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[doorX, 0.002, mid]} receiveShadow>
          <planeGeometry args={[HALF_W * 2, depth]} />
          <meshPhysicalMaterial map={marble} roughness={0.25} clearcoat={0.8} clearcoatRoughness={0.15} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[doorX, 0.005, mid + 1.2]} receiveShadow>
          <planeGeometry args={[2.3, depth + 2.4]} />
          <meshStandardMaterial color="#7f1d1d" roughness={0.9} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} rotation={[-Math.PI / 2, 0, 0]} position={[doorX + s * 1.15, 0.006, mid + 1.2]}>
            <planeGeometry args={[0.07, depth + 2.4]} />
            <meshStandardMaterial color="#c9a227" metalness={0.8} roughness={0.3} />
          </mesh>
        ))}

        {/* Side walls, with sconces between the columns, and the ceiling with gold coffers. */}
        {[-1, 1].map((s) => (
          <group key={s}>
            <mesh position={[doorX + s * HALF_W, H / 2, mid]} rotation={[0, -s * (Math.PI / 2), 0]} receiveShadow>
              <planeGeometry args={[depth, H]} />
              <meshStandardMaterial map={walls} roughness={0.75} />
            </mesh>
            {[north + 1.6, mid, south - 1.6].map((z) => (
              <group key={z} position={[doorX + s * (HALF_W - 0.06), 2.6, z]}>
                <mesh>
                  <boxGeometry args={[0.08, 0.36, 0.18]} />
                  <Gold />
                </mesh>
                <mesh position={[-s * 0.08, 0.22, 0]}>
                  <sphereGeometry args={[0.09, 12, 8]} />
                  <meshStandardMaterial color="#fff4d6" emissive="#ffd9a0" emissiveIntensity={2.2} toneMapped={false} />
                </mesh>
              </group>
            ))}
            {[north + 2.9, north + 5.9, north + 8.6].map((z) => (
              <group key={`p${z}`} position={[doorX + s * (HALF_W - 0.6), 0, z]}>
                <Pillar height={H} />
              </group>
            ))}
          </group>
        ))}
        <mesh position={[doorX, H, mid]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[HALF_W * 2, depth]} />
          <meshStandardMaterial color="#1c1424" roughness={0.8} />
        </mesh>
        {[-3, -1, 1, 3].map((x) => (
          <mesh key={`cx${x}`} position={[doorX + x * 1.25, H - 0.04, mid]}>
            <boxGeometry args={[0.06, 0.08, depth]} />
            <Gold />
          </mesh>
        ))}
        {[0.2, 0.4, 0.6, 0.8].map((f) => (
          <mesh key={`cz${f}`} position={[doorX, H - 0.04, north + depth * f]}>
            <boxGeometry args={[HALF_W * 2, 0.08, 0.06]} />
            <Gold />
          </mesh>
        ))}

        <Chandelier z={north + 2.9} />
        <Chandelier z={north + 7.2} />

        {/* The far wall: the casino's doors under a CASINO sign, ringed with marquee bulbs. */}
        <WallPiece x1={doorX - HALF_W} x2={doorX - CASINO_DOOR_HALF} y1={0} y2={H} z={north + 0.05} map={endWalls} />
        <WallPiece x1={doorX + CASINO_DOOR_HALF} x2={doorX + HALF_W} y1={0} y2={H} z={north + 0.05} map={endWalls} />
        <WallPiece x1={doorX - CASINO_DOOR_HALF} x2={doorX + CASINO_DOOR_HALF} y1={CASINO_DOOR_HEIGHT} y2={H} z={north + 0.05} map={endWalls} />
        {[-1, 1].map((s) => (
          <mesh key={`jamb${s}`} position={[doorX + s * (CASINO_DOOR_HALF + 0.08), CASINO_DOOR_HEIGHT / 2, north + 0.22]}>
            <boxGeometry args={[0.16, CASINO_DOOR_HEIGHT, 0.12]} />
            <Gold />
          </mesh>
        ))}
        <mesh position={[doorX, CASINO_DOOR_HEIGHT + 0.08, north + 0.22]}>
          <boxGeometry args={[CASINO_DOOR_HALF * 2 + 0.32, 0.16, 0.12]} />
          <Gold />
        </mesh>
        {Array.from({ length: 26 }, (_, i) => {
          // Bulbs up one side of the frame, across the top, and down the other.
          const perimeter = CASINO_DOOR_HEIGHT * 2 + CASINO_DOOR_HALF * 2;
          let d = (i / 25) * perimeter;
          let x: number;
          let y: number;
          if (d < CASINO_DOOR_HEIGHT) {
            x = -CASINO_DOOR_HALF - 0.3;
            y = d;
          } else if ((d -= CASINO_DOOR_HEIGHT) < CASINO_DOOR_HALF * 2) {
            x = -CASINO_DOOR_HALF + d;
            y = CASINO_DOOR_HEIGHT + 0.3;
          } else {
            x = CASINO_DOOR_HALF + 0.3;
            y = CASINO_DOOR_HEIGHT - (d - CASINO_DOOR_HALF * 2);
          }
          return (
            <mesh key={`bulb${i}`} position={[doorX + x, Math.max(0.3, y), north + 0.23]}>
              <sphereGeometry args={[0.055, 10, 8]} />
              <meshStandardMaterial color="#fff7d6" emissive="#ffd27a" emissiveIntensity={2.6} toneMapped={false} />
            </mesh>
          );
        })}
        <mesh position={[doorX, CASINO_DOOR_HEIGHT + 0.95, north + 0.22]}>
          <planeGeometry args={[3.2, 0.62]} />
          <meshStandardMaterial map={casinoSign} emissiveMap={casinoSign} emissive="#ffffff" emissiveIntensity={2.4} transparent toneMapped={false} />
        </mesh>
        <CasinoDoor side={-1} door={leftDoor} />
        <CasinoDoor side={1} door={rightDoor} />
        {[-1, 1].map((s) => (
          <group key={`rope${s}`}>
            {[north + 1.3, north + 2.6, north + 3.9].map((z) => (
              <Stanchion key={z} x={doorX + s * 1.5} z={z} />
            ))}
            <Rope x={doorX + s * 1.5} z1={north + 1.3} z2={north + 2.6} />
            <Rope x={doorX + s * 1.5} z1={north + 2.6} z2={north + 3.9} />
            <group position={[doorX + s * 2.4, 0, north + 0.7]}>
              <Plant />
            </group>
          </group>
        ))}

        {/* The concierge desk, to one side. */}
        <group position={[doorX - HALF_W + 1.6, 0, mid + 1.4]} rotation={[0, Math.PI / 2, 0]}>
          <mesh position={[0, 0.52, 0]} castShadow>
            <boxGeometry args={[2.6, 1.04, 0.8]} />
            <meshStandardMaterial color="#3b1f12" roughness={0.5} />
          </mesh>
          <mesh position={[0, 1.07, 0]}>
            <boxGeometry args={[2.75, 0.06, 0.92]} />
            <meshPhysicalMaterial color="#efe6d6" roughness={0.2} clearcoat={0.8} />
          </mesh>
          <mesh position={[0, 0.55, 0.41]}>
            <boxGeometry args={[2.3, 0.05, 0.02]} />
            <Gold />
          </mesh>
          <mesh position={[0.8, 1.2, 0]}>
            <sphereGeometry args={[0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <Gold />
          </mesh>
        </group>

        {/* The building's front: big windows onto the city, the glass doors, and the name above them. */}
        {mirrored(piers).map(([x1, x2]) => (
          <WallPiece key={`pier${x1}`} x1={x1} x2={x2} y1={0} y2={H} z={south + 0.05} map={endWalls} />
        ))}
        {mirrored(windows).map(([x1, x2]) => (
          <group key={`win${x1}`}>
            <WallPiece x1={x1} x2={x2} y1={0} y2={windowBottom} z={south + 0.05} map={endWalls} />
            <WallPiece x1={x1} x2={x2} y1={windowTop} y2={H} z={south + 0.05} map={endWalls} />
            <FrontWindow x1={x1} x2={x2} y1={windowBottom} y2={windowTop} z={south + 0.05} />
          </group>
        ))}
        <WallPiece x1={doorX - FRONT_DOOR_HALF} x2={doorX + FRONT_DOOR_HALF} y1={FRONT_DOOR_HEIGHT} y2={H} z={south + 0.05} map={endWalls} />
        <mesh position={[doorX, FRONT_DOOR_HEIGHT + 0.9, south - 0.12]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[3.8, 0.5]} />
          <meshStandardMaterial map={nameSign} emissiveMap={nameSign} emissive="#ffffff" emissiveIntensity={2.2} transparent toneMapped={false} />
        </mesh>
        {glassDoor(leftGlass, 'glass-left')}
        {glassDoor(rightGlass, 'glass-right')}
        {[-1, 1].map((s) => (
          <group key={`front-plant${s}`} position={[doorX + s * 2.0, 0, south - 0.8]}>
            <Plant />
          </group>
        ))}

        {/* Outside: wet pavement, the carpet out to the kerb, street lamps, and the city at night. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[doorX, -0.001, south + 7]} receiveShadow>
          <planeGeometry args={[34, 14]} />
          <meshStandardMaterial color="#1f2029" roughness={0.35} metalness={0.4} />
        </mesh>
        {[-1, 1].map((s) => (
          <StreetLamp key={`lamp${s}`} x={doorX + s * 4.2} z={south + 3.6} />
        ))}
        <mesh position={[doorX, 7, south + 16]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[60, 22]} />
          <meshBasicMaterial map={city} fog={false} toneMapped={false} />
        </mesh>
      </group>

      {/* Lights stay in the scene (at zero once hidden), so the floor's shaders never change. */}
      <pointLight ref={lights[0]} position={[doorX, CHANDELIER_LIGHT_Y, north + 2.9]} color="#ffe2b0" intensity={16} distance={13} decay={2} />
      <pointLight ref={lights[1]} position={[doorX, CHANDELIER_LIGHT_Y, north + 7.2]} color="#ffe2b0" intensity={16} distance={13} decay={2} />
      <pointLight ref={lights[2]} position={[doorX, 3.4, south + 2.4]} color="#ffd9a8" intensity={9} distance={9} decay={2} />
    </>
  );
}
