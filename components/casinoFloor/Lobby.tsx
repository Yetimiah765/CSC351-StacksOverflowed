'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import * as THREE from 'three';
import { COLS, DOOR, LOBBY, TILE_METRES } from '../../lib/casinoFloor';
import { CASINO_DOOR_HALF, CASINO_DOOR_HEIGHT, FRONT_WALL_Z } from './CasinoFront';
import { Pillar, Plant } from './Furniture';
import {
  cityTexture,
  dieFaceTexture,
  jackpotBoard,
  lobbyWallTexture,
  marbleTexture,
  medallionTexture,
  neonTexture,
  paintJackpotBoard,
  posterTexture,
  type PosterGame,
} from './textures';

// The building's lobby in front of the casino (SRS-103.12), only there for
// the walk in after logging in: the front of the building (glass doors
// between big windows onto the city at night), a marble lobby with columns,
// chandeliers, posters for the games, a jackpot board over the concierge
// desk, benches, a red carpet over a chip-and-star inlay, giant dice and a
// luggage cart, and at its far end the casino's big double doors (part of
// the casino's front, CasinoFront.tsx). Scene.tsx's walk in opens the doors
// as the player reaches them, shuts them behind the player, then hides the
// lobby, keeping its lights at zero rather than removing them, so no shader
// has to be rebuilt mid-walk.

/** What the walk in tells the lobby and the casino's front each frame. */
export interface LobbyState {
  /** How far open the building's glass doors, the casino's doors and the gate in the floor's rail are, 0 to 1. */
  front: number;
  casino: number;
  gate: number;
  /** How bright the lobby's lights are, 0 to 1: they fade as the casino's doors shut. */
  lit: number;
  /** False once the casino's doors have shut behind the player: the lobby is hidden. */
  shown: boolean;
}

const M = TILE_METRES;
const doorX = (DOOR.x + DOOR.w / 2 - COLS / 2) * M;
/** The casino's front wall (the lobby's far wall) and the building's front, world z. */
export const LOBBY_NORTH_Z = FRONT_WALL_Z;
export const LOBBY_SOUTH_Z = FRONT_WALL_Z + LOBBY.depth * M;
const HALF_W = (LOBBY.width / 2) * M;
export const LOBBY_HALF_WIDTH = HALF_W;
export const LOBBY_HEIGHT = 6.5;
const H = LOBBY_HEIGHT;
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

/** Something hung on a side wall at `z`, facing into the lobby: `side` is -1 for the left wall, 1 for the right. */
function OnWall({ side, z, y, children }: { side: -1 | 1; z: number; y: number; children: ReactNode }) {
  return (
    <group position={[doorX + side * (HALF_W - 0.04), y, z]} rotation={[0, -side * (Math.PI / 2), 0]}>
      {children}
    </group>
  );
}

/** A gold frame `w` x `h` with a little picture light over it. */
function Frame({ w, h }: { w: number; h: number }) {
  return (
    <>
      <mesh position={[0, 0, 0.02]}>
        <boxGeometry args={[w + 0.16, h + 0.16, 0.05]} />
        <Gold />
      </mesh>
      <mesh position={[0, h / 2 + 0.2, 0.1]}>
        <boxGeometry args={[0.05, 0.05, 0.2]} />
        <Gold />
      </mesh>
      <mesh position={[0, h / 2 + 0.2, 0.2]}>
        <boxGeometry args={[w * 0.6, 0.05, 0.06]} />
        <meshStandardMaterial color="#fff4d6" emissive="#ffd9a0" emissiveIntensity={2} toneMapped={false} />
      </mesh>
    </>
  );
}

const POSTER_W = 1.3;
const POSTER_H = (POSTER_W * 720) / 512;

function Poster({ game, side, z }: { game: PosterGame; side: -1 | 1; z: number }) {
  const map = useMemo(() => posterTexture(game), [game]);
  return (
    <OnWall side={side} z={z} y={2.75}>
      <Frame w={POSTER_W} h={POSTER_H} />
      <mesh position={[0, 0, 0.05]}>
        <planeGeometry args={[POSTER_W, POSTER_H]} />
        <meshStandardMaterial map={map} roughness={0.6} />
      </mesh>
    </OnWall>
  );
}

/** The progressive jackpot's LED board over the concierge desk, ticking up while the lobby's shown. */
function JackpotBoard({ side, z, state }: { side: -1 | 1; z: number; state: MutableRefObject<LobbyState> }) {
  const jackpot = useRef({ amount: 1_284_512, next: 0 });
  const board = useMemo(() => {
    const made = jackpotBoard();
    paintJackpotBoard(made.ctx, jackpot.current.amount);
    return made;
  }, []);
  useFrame(({ clock }) => {
    const now = clock.elapsedTime;
    if (!state.current.shown || now < jackpot.current.next) return;
    jackpot.current.next = now + 0.2;
    jackpot.current.amount += 1 + Math.floor(Math.random() * 37);
    paintJackpotBoard(board.ctx, jackpot.current.amount);
    board.texture.needsUpdate = true;
  });
  const w = 1.9;
  const h = (w * 320) / 1024;
  return (
    <OnWall side={side} z={z} y={3.3}>
      <Frame w={w} h={h} />
      <mesh position={[0, 0, 0.05]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={board.texture} emissiveMap={board.texture} emissive="#ffffff" emissiveIntensity={1.6} toneMapped={false} />
      </mesh>
    </OnWall>
  );
}

/** A velvet bench against a side wall, its length along the wall. */
function Bench({ side, z }: { side: -1 | 1; z: number }) {
  const length = 1.4;
  return (
    <group position={[doorX + side * (HALF_W - 0.45), 0, z]}>
      <mesh position={[0, 0.33, 0]} castShadow>
        <boxGeometry args={[0.5, 0.3, length]} />
        <meshStandardMaterial color="#6b1235" roughness={0.85} />
      </mesh>
      {/* Buttons in the tufting, a gold band, and gold legs. */}
      {[-0.5, -0.25, 0, 0.25, 0.5].map((f) => (
        <mesh key={f} position={[0, 0.485, f * length * 0.85]}>
          <sphereGeometry args={[0.022, 8, 6]} />
          <Gold />
        </mesh>
      ))}
      <mesh position={[0, 0.19, 0]}>
        <boxGeometry args={[0.52, 0.03, length + 0.02]} />
        <Gold />
      </mesh>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * 0.2, 0.09, sz * (length / 2 - 0.08)]}>
            <cylinderGeometry args={[0.025, 0.018, 0.18, 8]} />
            <Gold />
          </mesh>
        ))
      )}
    </group>
  );
}

/** A pair of giant red dice, double six up, on a black plinth banded in gold. */
function Dice({ x, z }: { x: number; z: number }) {
  // Box faces in three.js order (+x, -x, +y, -y, +z, -z); opposite faces add up to 7.
  const faces = useMemo(() => [2, 5, 6, 1, 3, 4].map((pips) => dieFaceTexture(pips)), []);
  const die = (key: string, position: [number, number, number], turn: number) => (
    <mesh key={key} position={position} rotation={[0, turn, 0]} castShadow>
      <boxGeometry args={[0.42, 0.42, 0.42]} />
      {faces.map((map, i) => (
        <meshPhysicalMaterial key={i} attach={`material-${i}`} map={map} roughness={0.2} clearcoat={1} clearcoatRoughness={0.1} />
      ))}
    </mesh>
  );
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.55, 0.6, 0.9, 32]} />
        <meshPhysicalMaterial color="#141016" roughness={0.25} clearcoat={0.8} />
      </mesh>
      {[0.06, 0.88].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[y < 0.5 ? 0.6 : 0.555, 0.025, 8, 40]} />
          <Gold />
        </mesh>
      ))}
      {die('a', [-0.17, 1.11, 0.08], 0.45)}
      {die('b', [0.2, 1.11, -0.12], -0.3)}
    </group>
  );
}

/** A bellhop's luggage cart: a carpeted base on castors, a gold frame with a crown, and three cases. */
function LuggageCart({ x, z, turn }: { x: number; z: number; turn: number }) {
  const pole = (key: string, px: number, pz: number) => (
    <mesh key={key} position={[px, 1.02, pz]}>
      <cylinderGeometry args={[0.022, 0.022, 1.56, 8]} />
      <Gold />
    </mesh>
  );
  const cases: { size: [number, number, number]; at: [number, number, number]; color: string }[] = [
    { size: [0.62, 0.46, 0.22], at: [-0.18, 0.5, 0.08], color: '#7c4a21' },
    { size: [0.5, 0.36, 0.2], at: [0.28, 0.45, -0.1], color: '#1e3a8a' },
    { size: [0.44, 0.26, 0.32], at: [-0.12, 0.86, 0.02], color: '#c08a4a' },
  ];
  return (
    <group position={[x, 0, z]} rotation={[0, turn, 0]}>
      <mesh position={[0, 0.22, 0]} castShadow>
        <boxGeometry args={[1.2, 0.06, 0.64]} />
        <meshStandardMaterial color="#7f1d1d" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.19, 0]}>
        <boxGeometry args={[1.24, 0.03, 0.68]} />
        <Gold />
      </mesh>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`w${sx}${sz}`} position={[sx * 0.5, 0.08, sz * 0.26]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 0.05, 14]} />
            <meshStandardMaterial color="#111827" roughness={0.6} />
          </mesh>
        ))
      )}
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => pole(`p${sx}${sz}`, sx * 0.58, sz * 0.28)))}
      {/* Rails along the top, and a crown arching over each end. */}
      {[-1, 1].map((sz) => (
        <mesh key={`r${sz}`} position={[0, 1.8, sz * 0.28]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.022, 0.022, 1.16, 8]} />
          <Gold />
        </mesh>
      ))}
      {[-1, 1].map((sx) => (
        <mesh key={`c${sx}`} position={[sx * 0.58, 1.8, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.28, 0.022, 8, 24, Math.PI]} />
          <Gold />
        </mesh>
      ))}
      {cases.map(({ size, at, color }) => (
        <group key={color} position={at}>
          <mesh castShadow>
            <boxGeometry args={size} />
            <meshStandardMaterial color={color} roughness={0.55} />
          </mesh>
          <mesh position={[0, size[1] / 2 + 0.03, 0]}>
            <torusGeometry args={[0.06, 0.012, 6, 16, Math.PI]} />
            <Gold />
          </mesh>
        </group>
      ))}
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
  const medallion = useMemo(() => medallionTexture(), []);
  const casinoSign = useMemo(() => neonTexture('CASINO', '#ff3fa4'), []);
  const nameSign = useMemo(() => neonTexture('STACKS OVERFLOWED', '#fbbf24'), []);

  const group = useRef<THREE.Group>(null);
  const leftGlass = useRef<THREE.Group>(null);
  const rightGlass = useRef<THREE.Group>(null);
  const lights = [useRef<THREE.PointLight>(null), useRef<THREE.PointLight>(null), useRef<THREE.PointLight>(null)];
  const brightness = [16, 16, 9];

  useFrame(() => {
    const { front, lit, shown } = state.current;
    if (group.current) group.current.visible = shown;
    lights.forEach((light, i) => {
      if (light.current) light.current.intensity = shown ? brightness[i]! * lit : 0;
    });
    const slide = front * (FRONT_DOOR_HALF + 0.05);
    if (leftGlass.current) leftGlass.current.position.x = doorX - FRONT_DOOR_HALF / 2 - slide;
    if (rightGlass.current) rightGlass.current.position.x = doorX + FRONT_DOOR_HALF / 2 + slide;
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

  // Between the columns along each wall (the columns are at north + 2.9, 5.9
  // and 8.6): a poster for each game, and the jackpot board behind the desk.
  const bays = [north + 1.45, north + 4.4, north + 7.25];

  return (
    <>
      <group ref={group}>
        {/* The marble floor, the red carpet down the middle, door to door, and the inlay halfway. */}
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
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[doorX, 0.008, mid]} receiveShadow>
          <circleGeometry args={[1.7, 64]} />
          <meshPhysicalMaterial map={medallion} roughness={0.25} metalness={0.2} clearcoat={0.8} clearcoatRoughness={0.15} />
        </mesh>

        {/* Side walls with the columns, and the ceiling with gold coffers. */}
        {[-1, 1].map((s) => (
          <group key={s}>
            <mesh position={[doorX + s * HALF_W, H / 2, mid]} rotation={[0, -s * (Math.PI / 2), 0]} receiveShadow>
              <planeGeometry args={[depth, H]} />
              <meshStandardMaterial map={walls} roughness={0.75} />
            </mesh>
            {[north + 2.9, north + 5.9, north + 8.6].map((z) => (
              <group key={`p${z}`} position={[doorX + s * (HALF_W - 0.6), 0, z]}>
                <Pillar height={H} />
              </group>
            ))}
            {/* A sconce in the stretch of wall by the front windows. */}
            <group position={[doorX + s * (HALF_W - 0.06), 2.6, south - 0.7]}>
              <mesh>
                <boxGeometry args={[0.08, 0.36, 0.18]} />
                <Gold />
              </mesh>
              <mesh position={[-s * 0.08, 0.22, 0]}>
                <sphereGeometry args={[0.09, 12, 8]} />
                <meshStandardMaterial color="#fff4d6" emissive="#ffd9a0" emissiveIntensity={2.2} toneMapped={false} />
              </mesh>
            </group>
          </group>
        ))}
        <Poster game="slots" side={-1} z={bays[0]!} />
        <Poster game="blackjack" side={-1} z={bays[1]!} />
        <JackpotBoard side={-1} z={bays[2]!} state={state} />
        <Poster game="sports" side={1} z={bays[0]!} />
        <Poster game="roulette" side={1} z={bays[1]!} />
        <Poster game="poker" side={1} z={bays[2]!} />
        <Bench side={-1} z={bays[1]!} />
        <Bench side={1} z={bays[1]!} />
        <Bench side={1} z={bays[2]!} />
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

        {/* The far wall, round the casino's doorway (the doors and their gold
            lining are the casino's, CasinoFront.tsx): a CASINO sign, ringed
            with marquee bulbs. */}
        <WallPiece x1={doorX - HALF_W} x2={doorX - CASINO_DOOR_HALF} y1={0} y2={H} z={north + 0.1} depth={0.2} map={endWalls} />
        <WallPiece x1={doorX + CASINO_DOOR_HALF} x2={doorX + HALF_W} y1={0} y2={H} z={north + 0.1} depth={0.2} map={endWalls} />
        <WallPiece x1={doorX - CASINO_DOOR_HALF} x2={doorX + CASINO_DOOR_HALF} y1={CASINO_DOOR_HEIGHT} y2={H} z={north + 0.1} depth={0.2} map={endWalls} />
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

        {/* The concierge desk, to one side, under the jackpot board. */}
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

        {/* By the front windows: the giant dice, and a luggage cart. */}
        <Dice x={doorX + 3.7} z={south - 1.4} />
        <LuggageCart x={doorX - 3.9} z={south - 1.7} turn={0.35} />

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
