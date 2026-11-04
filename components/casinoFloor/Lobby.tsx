'use client';

import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import * as THREE from 'three';
import {
  BENCH_SIZE,
  COLS,
  COLUMN_GAP,
  COLUMN_INSET,
  DOOR,
  DOOR_ROPE,
  FOUNTAIN,
  FOUNTAIN_ROPE,
  FRONT_DESK,
  LOBBY,
  LOBBY_BENCHES,
  LOBBY_DICE,
  LOBBY_PLANTS,
  LUGGAGE_CART,
  TILE_METRES,
} from '../../lib/casinoFloor';
import { CASINO_DOOR_HALF, CASINO_DOOR_HEIGHT, FRONT_WALL_Z } from './CasinoFront';
import Fountain from './Fountain';
import FrontDesk from './FrontDesk';
import { Plant } from './Furniture';
import Person from './Person';
import {
  cityTexture,
  cofferGlowTexture,
  columnFlutingTexture,
  dieFaceTexture,
  glowTexture,
  jackpotBoard,
  lobbyWallTexture,
  marbleTexture,
  medallionTexture,
  neonTexture,
  paintJackpotBoard,
  posterTexture,
  softShadowTexture,
  tuftedVelvetTexture,
  washTexture,
  type PosterGame,
} from './textures';

// The building's lobby in front of the casino, seen only while the player
// walks in after logging in (SRS-103.12) or out through the casino's doors to
// log out (SRS-105.5): the front of the building (glass doors
// between big windows onto the city at night), a marble lobby with columns,
// chandeliers, posters for the games, a jackpot board over the curved front
// desk with its check-in kiosks and receptionist (FrontDesk.tsx), a tiered
// fountain facing it (Fountain.tsx), uplit columns, glowing ceiling coffers
// and a cove light round the top of the walls, benches, a red carpet over a chip-and-star inlay, giant dice and a
// luggage cart, and at its far end the casino's big double doors (part of
// the casino's front, CasinoFront.tsx). Scene.tsx's walks open the doors as
// the player reaches them and shut them behind. The lobby is always in the
// scene (so its shaders are built with the floor's), hidden the rest of the
// time with its lights at zero rather than removed, so none has to be
// rebuilt when it shows.

/** What the walk in tells the lobby and the casino's front each frame. */
export interface LobbyState {
  /** How far open the building's glass doors and the casino's doors are, 0 to 1. */
  front: number;
  casino: number;
  /** The gate in the floor's rail: 1 swung open in onto the floor, -1 out into the foyer, 0 shut. */
  gate: number;
  /** How bright the lobby's lights are, 0 to 1: they fade as the casino's doors shut. */
  lit: number;
  /** Whether the lobby's showing: only while the player walks in or out. */
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
      <meshStandardMaterial map={map} bumpMap={map} bumpScale={0.8} roughness={0.75} />
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

/** Where a picture sits in front of its Frame. */
const PICTURE_Z = 0.062;

/**
 * A frame for a picture `w` x `h`, stepping in towards it: a broad gold
 * moulding with a beaded lip, a dark liner, and a fine gold fillet; and a
 * picture light on a little arm over it.
 */
function Frame({ w, h }: { w: number; h: number }) {
  const lip = (key: string, x: number, y: number, bw: number, bh: number) => (
    <mesh key={key} position={[x, y, 0.05]}>
      <boxGeometry args={[bw, bh, 0.012]} />
      <Gold />
    </mesh>
  );
  const ow = w + 0.22;
  const oh = h + 0.22;
  return (
    <>
      <mesh position={[0, 0, 0.02]}>
        <boxGeometry args={[ow, oh, 0.05]} />
        <Gold />
      </mesh>
      {lip('top', 0, oh / 2 - 0.012, ow, 0.024)}
      {lip('bottom', 0, -oh / 2 + 0.012, ow, 0.024)}
      {lip('left', -ow / 2 + 0.012, 0, 0.024, oh)}
      {lip('right', ow / 2 - 0.012, 0, 0.024, oh)}
      <mesh position={[0, 0, 0.026]}>
        <boxGeometry args={[w + 0.11, h + 0.11, 0.05]} />
        <meshStandardMaterial color="#1a120a" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.032]}>
        <boxGeometry args={[w + 0.035, h + 0.035, 0.05]} />
        <Gold />
      </mesh>
      <mesh position={[0, oh / 2 + 0.08, 0.1]}>
        <boxGeometry args={[0.04, 0.04, 0.18]} />
        <Gold />
      </mesh>
      <mesh position={[0, oh / 2 + 0.08, 0.2]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.03, 0.03, w * 0.6, 16]} />
        <Gold />
      </mesh>
      <mesh position={[0, oh / 2 + 0.06, 0.21]}>
        <boxGeometry args={[w * 0.56, 0.012, 0.04]} />
        <meshStandardMaterial color="#fff4d6" emissive="#ffd9a0" emissiveIntensity={2} toneMapped={false} />
      </mesh>
    </>
  );
}

/** A wall light: a gold back plate and arm holding a glowing shade, lighting the wall round it. */
function Sconce({ side, z, y, glow }: { side: -1 | 1; z: number; y: number; glow: THREE.Texture }) {
  return (
    <OnWall side={side} z={z} y={y}>
      <mesh position={[0, 0.05, 0.012]}>
        <planeGeometry args={[1.3, 1.3]} />
        <meshBasicMaterial map={glow} color="#ffb867" transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <boxGeometry args={[0.15, 0.34, 0.05]} />
        <Gold />
      </mesh>
      <mesh position={[0, 0, 0.06]}>
        <boxGeometry args={[0.1, 0.26, 0.02]} />
        <meshStandardMaterial color="#1a120a" roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.06, 0.13]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.014, 0.014, 0.16, 10]} />
        <Gold />
      </mesh>
      <mesh position={[0, 0.03, 0.21]}>
        <cylinderGeometry args={[0.075, 0.045, 0.14, 20, 1, true]} />
        <meshStandardMaterial color="#fff4d6" emissive="#ffd9a0" emissiveIntensity={1.4} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.04, 0.21]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.046, 0.008, 6, 20]} />
        <Gold />
      </mesh>
    </OnWall>
  );
}

/** A soft shadow on the floor under something, rx by rz metres, turned by `turn`. */
function FloorShadow({ map, x, z, rx, rz = rx, turn = 0 }: { map: THREE.Texture; x: number; z: number; rx: number; rz?: number; turn?: number }) {
  return (
    <mesh position={[x, 0.004, z]} rotation={[-Math.PI / 2, 0, turn]}>
      <planeGeometry args={[rx * 2, rz * 2]} />
      <meshBasicMaterial map={map} transparent depthWrite={false} />
    </mesh>
  );
}

/**
 * One of the lobby's classical columns, `height` tall: a fluted marble shaft
 * (tapering a little) on a moulded base — square plinth, gold fillet, torus,
 * hollow and a gold ring — under a capital of a gold astragal, a flared
 * echinus, a gold band and a square abacus.
 */
function Column({ height, fluting }: { height: number; fluting: THREE.Texture }) {
  const base = 0.42;
  const capital = 0.52;
  const shaft = height - base - capital;
  const top = base + shaft;
  const ring = (key: string, y: number, r: number, tube: number, gold: boolean) => (
    <mesh key={key} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[r, tube, 12, 48]} />
      {gold ? <Gold /> : <Stone />}
    </mesh>
  );
  return (
    <group>
      <mesh position={[0, 0.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 0.2, 0.8]} />
        <Stone />
      </mesh>
      <mesh position={[0, 0.206, 0]}>
        <boxGeometry args={[0.82, 0.012, 0.82]} />
        <Gold />
      </mesh>
      {ring('torus', 0.26, 0.31, 0.05, false)}
      <mesh position={[0, 0.33, 0]}>
        <cylinderGeometry args={[0.29, 0.31, 0.06, 48]} />
        <Stone />
      </mesh>
      {ring('ring', 0.385, 0.29, 0.032, true)}
      <mesh position={[0, base + shaft / 2, 0]} castShadow>
        <cylinderGeometry args={[0.255, 0.275, shaft, 48]} />
        <meshStandardMaterial map={fluting} bumpMap={fluting} bumpScale={2} roughness={0.35} />
      </mesh>
      {ring('astragal', top + 0.03, 0.262, 0.024, true)}
      <mesh position={[0, top + 0.16, 0]}>
        <cylinderGeometry args={[0.37, 0.27, 0.2, 48]} />
        <Stone />
      </mesh>
      <mesh position={[0, top + 0.275, 0]}>
        <boxGeometry args={[0.84, 0.03, 0.84]} />
        <Gold />
      </mesh>
      <mesh position={[0, top + 0.37, 0]}>
        <boxGeometry args={[0.8, 0.16, 0.8]} />
        <Stone />
      </mesh>
      <mesh position={[0, top + 0.455, 0]}>
        <boxGeometry args={[0.84, 0.012, 0.84]} />
        <Gold />
      </mesh>
      <mesh position={[0, top + 0.49, 0]}>
        <boxGeometry args={[0.76, 0.06, 0.76]} />
        <Stone />
      </mesh>
    </group>
  );
}

function Stone() {
  return <meshStandardMaterial color="#e9dfcc" roughness={0.4} />;
}

const POSTER_W = 1.3;
const POSTER_H = (POSTER_W * 720) / 512;

function Poster({ game, side, z, y = 2.75 }: { game: PosterGame; side: -1 | 1; z: number; y?: number }) {
  const map = useMemo(() => posterTexture(game), [game]);
  return (
    <OnWall side={side} z={z} y={y}>
      <Frame w={POSTER_W} h={POSTER_H} />
      <mesh position={[0, 0, PICTURE_Z]}>
        <planeGeometry args={[POSTER_W, POSTER_H]} />
        <meshStandardMaterial map={map} roughness={0.6} />
      </mesh>
    </OnWall>
  );
}

/** The progressive jackpot's LED board over the front desk, ticking up while the lobby's shown. */
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
      <mesh position={[0, 0, PICTURE_Z]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={board.texture} emissiveMap={board.texture} emissive="#ffffff" emissiveIntensity={1.6} toneMapped={false} />
      </mesh>
    </OnWall>
  );
}

/** A buttoned velvet bench against a side wall, its length along the wall. */
function Bench({ side, z, velvet }: { side: -1 | 1; z: number; velvet: THREE.Texture }) {
  const { length } = BENCH_SIZE;
  return (
    <group position={[doorX + side * (HALF_W - BENCH_SIZE.fromWall), 0, z]}>
      <mesh position={[0, 0.33, 0]} castShadow>
        <boxGeometry args={[BENCH_SIZE.depth, 0.3, length]} />
        <meshStandardMaterial map={velvet} bumpMap={velvet} bumpScale={2} roughness={0.85} />
      </mesh>
      {/* Piping along its top edges, a gold band, and gold legs. */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * 0.25, 0.48, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.012, 0.012, length, 8]} />
          <meshStandardMaterial color="#3f0a1f" roughness={0.7} />
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
      {/* A push bar across one end, and the bellhop holding it. */}
      <mesh position={[0.68, 1.0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.64, 10]} />
        <Gold />
      </mesh>
      {[-1, 1].map((sz) => (
        <mesh key={`bracket${sz}`} position={[0.63, 1.0, sz * 0.28]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.012, 0.012, 0.1, 8]} />
          <Gold />
        </mesh>
      ))}
      <group position={[LUGGAGE_CART.bellhop, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <BellhopUniform>
          <Person who="staff" pose="dealer" hands={{ y: 0.97, z: 0.4 }} idleOffset={1.3} />
        </BellhopUniform>
      </group>
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

/** A pillbox hat, red with a gold band and button. */
function pillboxHat() {
  const hat = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: '#a50f2a', roughness: 0.6 });
  const gold = new THREE.MeshStandardMaterial({ color: '#c9a227', metalness: 0.9, roughness: 0.25 });
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.078, 0.07, 24), red);
  crown.position.y = 0.035;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.079, 0.079, 0.016, 24), gold);
  band.position.y = 0.012;
  const button = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), gold);
  button.position.y = 0.074;
  hat.add(crown, band, button);
  return hat;
}

/**
 * Dresses the staff member inside it as a bellhop once their model has
 * loaded: their jacket turned red (on a copy of its material, so the other
 * staff keep theirs) and a pillbox hat on the top of their head.
 */
function BellhopUniform({ children }: { children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const dressed = useRef(false);
  const hat = useMemo(() => pillboxHat(), []);
  useFrame(() => {
    if (dressed.current || !group.current) return;
    let jacket: THREE.Mesh | null = null;
    let headTop: THREE.Object3D | null = null;
    group.current.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh && (mesh.material as THREE.Material).name === 'Wolf3D_Outfit_Top') jacket = mesh;
      if (object.name === 'HeadTop_End') headTop = object;
    });
    if (!jacket || !headTop) return;
    const coat = jacket as THREE.Mesh;
    const red = (coat.material as THREE.MeshStandardMaterial).clone();
    red.color.set('#c0283f');
    coat.material = red;
    (headTop as THREE.Object3D).add(hat);
    hat.position.set(0, -0.045, -0.015);
    hat.rotation.set(-0.12, 0, 0.12);
    dressed.current = true;
  });
  return <group ref={group}>{children}</group>;
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
function Rope({ from, to }: { from: [number, number]; to: [number, number] }) {
  const [x1, z1] = from;
  const [x2, z2] = to;
  const geometry = useMemo(() => {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(x1, 0.95, z1),
      new THREE.Vector3((x1 + x2) / 2, 0.62, (z1 + z2) / 2),
      new THREE.Vector3(x2, 0.95, z2)
    );
    return new THREE.TubeGeometry(curve, 16, 0.025, 8, false);
  }, [x1, z1, x2, z2]);
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

export default function Lobby({
  state,
  kioskOutlined = null,
  kioskScreens,
  onKioskClick,
}: {
  state: MutableRefObject<LobbyState>;
  /** The check-in tablet a guest is near enough to use, outlined; each tablet's screen; a click on one (SRS-103.13). */
  kioskOutlined?: number | null;
  kioskScreens?: MutableRefObject<(THREE.Object3D | null)[]>;
  onKioskClick?: (kiosk: number, event: ThreeEvent<MouseEvent>) => void;
}) {
  const north = LOBBY_NORTH_Z;
  const south = LOBBY_SOUTH_Z;
  const depth = south - north;
  const mid = (north + south) / 2;
  const marble = useMemo(() => marbleTexture([HALF_W / 1.2, depth / 1.2]), [depth]);
  const fluting = useMemo(() => columnFlutingTexture(), []);
  const velvet = useMemo(() => tuftedVelvetTexture([1, 2.8]), []);
  const shadow = useMemo(() => softShadowTexture(), []);
  const glow = useMemo(() => glowTexture(), []);
  const wash = useMemo(() => washTexture(), []);
  // One glow per ceiling coffer: the beams are 2.5 m apart across, either
  // side of the middle, and 2 m apart along.
  const coffers = useMemo(() => cofferGlowTexture([(HALF_W * 2) / 2.5, depth / 2], [0.1, 0]), [depth]);
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
  const brightness = [30, 30, 10];

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

  // Two columns along each wall, either side of its middle, where the desk
  // (and its jackpot board) is on the left and the roulette poster facing it
  // on the right; the other posters in the bays at either end.
  const columns = [mid - COLUMN_GAP, mid + COLUMN_GAP];
  const nearBay = north + 1.15;
  const farBay = south - 1.15;
  const columnX = (s: number) => doorX + s * (HALF_W - COLUMN_INSET);

  return (
    <>
      <group ref={group}>
        {/* The marble floor, the red carpet down the middle, door to door, and the inlay halfway. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[doorX, 0.002, mid]} receiveShadow>
          <planeGeometry args={[HALF_W * 2, depth]} />
          <meshPhysicalMaterial map={marble} bumpMap={marble} bumpScale={0.5} roughness={0.25} clearcoat={0.8} clearcoatRoughness={0.15} />
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

        {/* Side walls with their columns, posters, sconces and benches. */}
        {[-1, 1].map((s) => (
          <group key={s}>
            <mesh position={[doorX + s * HALF_W, H / 2, mid]} rotation={[0, -s * (Math.PI / 2), 0]} receiveShadow>
              <planeGeometry args={[depth, H]} />
              <meshStandardMaterial map={walls} bumpMap={walls} bumpScale={0.8} roughness={0.75} />
            </mesh>
            {columns.map((z) => (
              <group key={`p${z}`}>
                <group position={[columnX(s), 0, z]}>
                  <Column height={H} fluting={fluting} />
                </group>
                <FloorShadow map={shadow} x={columnX(s)} z={z} rx={0.8} />
                {/* An uplight at its foot, washing the wall behind it. */}
                <mesh position={[columnX(s) - s * 0.52, 0.015, z]}>
                  <cylinderGeometry args={[0.07, 0.08, 0.03, 20]} />
                  <meshStandardMaterial color="#fff1d0" emissive="#ffd28a" emissiveIntensity={2.4} toneMapped={false} />
                </mesh>
                <OnWall side={s as -1 | 1} z={z} y={2.4}>
                  <mesh position={[0, 0, 0.015]}>
                    <planeGeometry args={[1.9, 4.8]} />
                    <meshBasicMaterial map={wash} color="#ffb867" transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
                  </mesh>
                </OnWall>
              </group>
            ))}
            {[-1.4, 1.4].map((dz) => (
              <Sconce key={`sconce${dz}`} side={s as -1 | 1} z={mid + dz} y={3.3} glow={glow} />
            ))}
            {/* A cove light running round the top of the wall. */}
            <mesh position={[doorX + s * (HALF_W - 0.05), H - 0.32, mid]}>
              <boxGeometry args={[0.03, 0.04, depth]} />
              <meshStandardMaterial color="#fff1d0" emissive="#ffd28a" emissiveIntensity={2.2} toneMapped={false} />
            </mesh>
          </group>
        ))}
        <Poster game="slots" side={-1} z={nearBay} />
        <JackpotBoard side={-1} z={mid} state={state} />
        <Poster game="blackjack" side={-1} z={farBay} />
        <Poster game="sports" side={1} z={nearBay} />
        <Poster game="roulette" side={1} z={mid} y={3.75} />
        <Poster game="poker" side={1} z={farBay} />
        {LOBBY_BENCHES.map(({ side, z }) => (
          <group key={`bench${side}${z}`}>
            <Bench side={side} z={north + z} velvet={velvet} />
            <FloorShadow map={shadow} x={doorX + side * (HALF_W - BENCH_SIZE.fromWall)} z={north + z} rx={0.42} rz={0.95} />
          </group>
        ))}

        {/* The ceiling: deep coffers between cream beams edged in gold, with a gold rose over each chandelier. */}
        <mesh position={[doorX, H, mid]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[HALF_W * 2, depth]} />
          <meshStandardMaterial color="#2a2030" emissiveMap={coffers} emissive="#ffdcaa" emissiveIntensity={0.85} roughness={0.8} />
        </mesh>
        {[north + 0.12, south - 0.12].map((z) => (
          <mesh key={`cove${z}`} position={[doorX, H - 0.32, z]}>
            <boxGeometry args={[HALF_W * 2, 0.04, 0.03]} />
            <meshStandardMaterial color="#fff1d0" emissive="#ffd28a" emissiveIntensity={2.2} toneMapped={false} />
          </mesh>
        ))}
        {[-3, -1, 1, 3].map((x) => (
          <group key={`cx${x}`} position={[doorX + x * 1.25, H - 0.09, mid]}>
            <mesh>
              <boxGeometry args={[0.14, 0.18, depth]} />
              <Stone />
            </mesh>
            {[-1, 1].map((e) => (
              <mesh key={e} position={[e * 0.07, -0.085, 0]}>
                <boxGeometry args={[0.014, 0.014, depth]} />
                <Gold />
              </mesh>
            ))}
          </group>
        ))}
        {[0.2, 0.4, 0.6, 0.8].map((f) => (
          <group key={`cz${f}`} position={[doorX, H - 0.09, north + depth * f]}>
            <mesh>
              <boxGeometry args={[HALF_W * 2, 0.18, 0.14]} />
              <Stone />
            </mesh>
            {[-1, 1].map((e) => (
              <mesh key={e} position={[0, -0.085, e * 0.07]}>
                <boxGeometry args={[HALF_W * 2, 0.014, 0.014]} />
                <Gold />
              </mesh>
            ))}
          </group>
        ))}
        {columns.map((z) => (
          <group key={`rose${z}`} position={[doorX, H - 0.02, z]}>
            <mesh>
              <cylinderGeometry args={[0.34, 0.34, 0.03, 40]} />
              <Gold />
            </mesh>
            <mesh position={[0, -0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.24, 0.025, 10, 40]} />
              <Gold />
            </mesh>
          </group>
        ))}

        {columns.map((z) => (
          <Chandelier key={`chandelier${z}`} z={z} />
        ))}

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
        {[-1, 1].map((s) => {
          const x = doorX + s * DOOR_ROPE.x;
          return (
            <group key={`rope${s}`}>
              {DOOR_ROPE.posts.map((z, i) => (
                <group key={z}>
                  <Stanchion x={x} z={north + z} />
                  <FloorShadow map={shadow} x={x} z={north + z} rx={0.24} />
                  {i > 0 ? <Rope from={[x, north + DOOR_ROPE.posts[i - 1]!]} to={[x, north + z]} /> : null}
                </group>
              ))}
            </group>
          );
        })}
        {LOBBY_PLANTS.map(({ x, z }) => (
          <group key={`plant${x}${z}`} position={[doorX + x, 0, north + z]}>
            <Plant />
            <FloorShadow map={shadow} x={0} z={0} rx={0.5} />
          </group>
        ))}

        {/* The fountain, against the right wall facing the desk, under the
            roulette poster, roped off in an arc from column to column. */}
        <group position={[doorX + FOUNTAIN.x, 0, north + FOUNTAIN.z]}>
          <Fountain state={state} />
        </group>
        <FloorShadow map={shadow} x={doorX + FOUNTAIN.x} z={north + FOUNTAIN.z} rx={1.45} />
        {(() => {
          const posts = FOUNTAIN_ROPE.map(({ x, z }): [number, number] => [doorX + x, north + z]);
          return posts.map(([x, z], i) => (
            <group key={`fountain-post${i}`}>
              <Stanchion x={x} z={z} />
              <FloorShadow map={shadow} x={x} z={z} rx={0.24} />
              {i > 0 ? <Rope from={posts[i - 1]!} to={[x, z]} /> : null}
            </group>
          ));
        })()}

        {/* The front desk, in the middle of the left wall under the jackpot board. */}
        <group position={[doorX + FRONT_DESK.x, 0, north + FRONT_DESK.z]}>
          <FrontDesk outlined={kioskOutlined} screens={kioskScreens} onKioskClick={onKioskClick} />
        </group>

        {/* By the front windows: the giant dice, and a luggage cart. */}
        <Dice x={doorX + LOBBY_DICE.x} z={north + LOBBY_DICE.z} />
        <FloorShadow map={shadow} x={doorX + LOBBY_DICE.x} z={north + LOBBY_DICE.z} rx={0.95} />
        <LuggageCart x={doorX + LUGGAGE_CART.x} z={north + LUGGAGE_CART.z} turn={LUGGAGE_CART.turn} />
        <FloorShadow map={shadow} x={doorX + LUGGAGE_CART.x} z={north + LUGGAGE_CART.z} rx={0.85} rz={0.5} turn={LUGGAGE_CART.turn} />

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
      <pointLight ref={lights[0]} position={[doorX, CHANDELIER_LIGHT_Y, mid - COLUMN_GAP]} color="#ffe2b0" intensity={30} distance={16} decay={2} />
      <pointLight ref={lights[1]} position={[doorX, CHANDELIER_LIGHT_Y, mid + COLUMN_GAP]} color="#ffe2b0" intensity={30} distance={16} decay={2} />
      <pointLight ref={lights[2]} position={[doorX, 3.4, south + 2.4]} color="#ffd9a8" intensity={9} distance={9} decay={2} />
    </>
  );
}
