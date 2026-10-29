'use client';

import { Html } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import {
  COLS,
  FLOOR_OBJECTS,
  ROWS,
  START,
  TILE_METRES,
  findPath,
  isBlocked,
  moveWithCollisions,
  nearbyObjectAt,
  nearestChair,
  nearestScreen,
  objectAt,
  pieceLayout,
  standingSpots,
  type FloorObject,
  type Point,
} from '../../lib/casinoFloor';
import {
  BlackjackTable,
  Pillar,
  Plant,
  PokerTable,
  RouletteTable,
  ShopCounter,
  SlotMachines,
  SportsBar,
} from './Furniture';
import Person, { type Motion, type SeatPose } from './Person';
import { compileInBackground } from './compile';
import Highlight from './Highlight';
import { carpetTexture, neonTexture, wallTexture } from './textures';

// The home page's casino floor in 3D (CasinoFloor.tsx is the page around
// it): a third-person walk around the room, the camera following behind the
// player like a modern open-world game. lib/casinoFloor.ts holds the layout
// (in tiles) and the rules; here a tile is TILE_M metres.
//
// WASD / the arrow keys walk relative to the camera; dragging orbits it and
// scrolling zooms. Clicking the floor walks there; clicking a game walks up
// to it, or plays it if it's already in reach. Next to a table its nearest
// chair is outlined; playing walks the player into that chair, sits them
// down, and flies the camera in over the felt (or, at the sports bar, into
// the nearest screen) — then the page opens the game.

const TILE_M = TILE_METRES;
const WALL_HEIGHT = 4.6;
/** Jogging speed, and walking speed with Shift held, metres a second. */
const JOG_SPEED = 3.1;
const WALK_SPEED = 1.4;

/** A position in tiles to the world, in metres (the room's centre is the origin). */
const toWorld = (x: number, y: number): [number, number] => [(x - COLS / 2) * TILE_M, (y - ROWS / 2) * TILE_M];

/** The keyboard, as the page tracks it: which ways are held right now. */
export interface WalkInput {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  /** Shift: walk instead of jog. */
  slow: boolean;
}

interface Props {
  input: MutableRefObject<WalkInput>;
  /** The game in reach changed (null for none). */
  onNear: (object: FloorObject | null) => void;
  /** A click on the game in reach. */
  onPlay: (object: FloorObject) => void;
  nearId: string | null;
  /** The game being sat down at (set by the page); the scene plays the sitting and the fly-in. */
  playing: FloorObject | null;
  /** The fly-in is over: open the game. */
  onSeated: (object: FloorObject) => void;
  /** Stop drawing (while a game's page loads), so the page isn't held up. */
  paused?: boolean;
}

// ---------- the player and the camera ----------
interface Camera {
  yaw: number;
  pitch: number;
  distance: number;
}

/** What's near: the game, and its chair (or screen) the player would use, by index. */
export interface NearSpot {
  object: FloorObject | null;
  spot: number | null;
}

/** Taking a seat to play: walk beside the chair, face the table, sit, then the camera flies in. */
interface Seating {
  object: FloorObject;
  stage: 'walk' | 'turn' | 'sit' | 'zoom' | 'done';
  /** Seconds into the current stage. */
  t: number;
  /** World positions on the floor, metres: beside the chair, and the seat. */
  approach: THREE.Vector2 | null;
  seatAt: THREE.Vector2 | null;
  /** The heading to sit facing the table. */
  facing: number;
  seatedHands: { y: number; z: number };
  zoomFrom: { position: THREE.Vector3; look: THREE.Vector3 } | null;
  zoomTo: { position: THREE.Vector3; look: THREE.Vector3 };
}

const SIT_SECONDS = 1.1;
const ZOOM_SECONDS = 1.6;

const smooth = (t: number) => {
  const k = THREE.MathUtils.clamp(t, 0, 1);
  return k * k * (3 - 2 * k);
};

/**
 * Plans taking `spot` (a chair, or for the sports bar a screen) at `object`,
 * from the player at `from` (world metres): where to walk, and where the
 * camera ends up — over the table from the seat, or right in front of the
 * screen (or the shop counter).
 */
function planSeating(object: FloorObject, spot: number | null, from: THREE.Vector2): Seating {
  const layout = pieceLayout(object);
  const [cx, cz] = toWorld(object.x + object.w / 2, object.y + object.h / 2);
  const seat = spot === null ? undefined : layout.chairs[spot];
  const plan: Seating = {
    object,
    stage: 'zoom',
    t: 0,
    approach: null,
    seatAt: null,
    facing: 0,
    seatedHands: layout.seatedHands ?? { y: 0.85, z: 0.4 },
    zoomFrom: null,
    zoomTo: { position: new THREE.Vector3(cx, 1.6, cz + 1.5), look: new THREE.Vector3(cx, 1.2, cz - 0.3) },
  };
  if (seat) {
    // Chairs face the table along (-sin a, -cos a); step in from whichever side is nearer.
    const a = seat.angle;
    const seatAt = new THREE.Vector2(cx + seat.x, cz + seat.z);
    const toTable = new THREE.Vector2(-Math.sin(a), -Math.cos(a));
    const side = new THREE.Vector2(Math.cos(a), -Math.sin(a)).multiplyScalar(0.55);
    const left = seatAt.clone().add(side);
    const right = seatAt.clone().sub(side);
    plan.stage = 'walk';
    plan.seatAt = seatAt;
    plan.approach = (left.distanceTo(from) < right.distanceTo(from) ? left : right).addScaledVector(toTable, -0.08);
    plan.facing = Math.atan2(toTable.x, toTable.y);
    // The camera ends just above and ahead of the seated player's head (clear
    // of their hair), looking down at the felt in front of them.
    const look = seatAt.clone().lerp(new THREE.Vector2(cx, cz), 0.55);
    plan.zoomTo = {
      position: new THREE.Vector3(seatAt.x + toTable.x * 0.24, 1.62, seatAt.y + toTable.y * 0.24),
      look: new THREE.Vector3(look.x, 0.82, look.y),
    };
  } else if (layout.screens?.length) {
    // Right up to the screen, filling the view.
    const screen = layout.screens[spot ?? 0] ?? layout.screens[0]!;
    const at = new THREE.Vector3(cx + screen.x, screen.y, cz + screen.z);
    plan.zoomTo = { position: at.clone().add(new THREE.Vector3(0, 0, 0.82)), look: at };
  }
  return plan;
}

function Player({
  input,
  onNear,
  path,
  camera,
  tile,
  seating,
  onSeated,
}: {
  input: MutableRefObject<WalkInput>;
  onNear: (near: NearSpot) => void;
  path: MutableRefObject<Point[]>;
  camera: MutableRefObject<Camera>;
  tile: MutableRefObject<Point>;
  /** Set to start taking a seat; Player plans and plays it. */
  seating: MutableRefObject<{ object: FloorObject; spot: number | null } | Seating | null>;
  onSeated: (object: FloorObject) => void;
}) {
  const body = useRef<THREE.Group>(null);
  const motion = useRef<Motion>({ speed: 0 });
  const seat = useRef<SeatPose>({ amount: 0, handsY: 0.85, handsZ: 0.4 });
  // Position in tiles (the middle of the start tile), and the way they face.
  const position = useRef<Point>({ x: START.x + 0.5, y: START.y + 0.5 });
  const heading = useRef(Math.PI);
  const lookAt = useRef(new THREE.Vector3());
  const near = useRef<NearSpot>({ object: null, spot: null });
  const { camera: view } = useThree();

  useFrame((_, rawDelta) => {
    // Capped, so a slow computer still walks at about the right speed.
    const delta = Math.min(rawDelta, 0.25);
    const turnTowards = (target: number, rate: number) => {
      let turn = target - heading.current;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      heading.current += turn * Math.min(1, delta * rate);
      return Math.abs(turn);
    };

    // Taking a seat: the player isn't steered, the plan plays out.
    let plan = seating.current;
    if (plan && !('stage' in plan)) {
      const [wx, wz] = toWorld(position.current.x, position.current.y);
      plan = planSeating(plan.object, plan.spot, new THREE.Vector2(wx, wz));
      seating.current = plan;
      path.current = [];
    }
    if (plan && 'stage' in plan) {
      plan.t += delta;
      const [wx, wz] = toWorld(position.current.x, position.current.y);
      const here = new THREE.Vector2(wx, wz);
      motion.current.speed = 0;
      if (plan.stage === 'walk' && plan.approach) {
        const toGo = plan.approach.clone().sub(here);
        const step = WALK_SPEED * delta;
        if (toGo.length() <= step || plan.t > 4) {
          here.copy(plan.approach);
          plan.stage = 'turn';
          plan.t = 0;
        } else {
          here.addScaledVector(toGo.normalize(), step);
          motion.current.speed = WALK_SPEED;
          turnTowards(Math.atan2(toGo.x, toGo.y), 12);
        }
      } else if (plan.stage === 'turn') {
        if (turnTowards(plan.facing, 9) < 0.04 || plan.t > 0.7) {
          plan.stage = 'sit';
          plan.t = 0;
          seat.current.handsY = plan.seatedHands.y;
          seat.current.handsZ = plan.seatedHands.z;
        }
      } else if (plan.stage === 'sit' && plan.approach && plan.seatAt) {
        const k = smooth(plan.t / SIT_SECONDS);
        heading.current = plan.facing;
        here.copy(plan.approach).lerp(plan.seatAt, k);
        seat.current.amount = k;
        if (plan.t >= SIT_SECONDS) {
          plan.stage = 'zoom';
          plan.t = 0;
        }
      }
      position.current = { x: here.x / TILE_M + COLS / 2, y: here.y / TILE_M + ROWS / 2 };
      if (body.current) {
        body.current.position.set(here.x, 0, here.y);
        body.current.rotation.y = heading.current;
      }
      if (plan.stage === 'zoom' || plan.stage === 'done') {
        // The camera flies in from wherever it was.
        if (!plan.zoomFrom) plan.zoomFrom = { position: view.position.clone(), look: lookAt.current.clone() };
        const k = smooth(plan.t / ZOOM_SECONDS);
        view.position.lerpVectors(plan.zoomFrom.position, plan.zoomTo.position, k);
        lookAt.current.lerpVectors(plan.zoomFrom.look, plan.zoomTo.look, k);
        view.lookAt(lookAt.current);
        if (plan.stage === 'zoom' && plan.t >= ZOOM_SECONDS) {
          plan.stage = 'done';
          onSeated(plan.object);
        }
        return;
      }
      followWith(here.x, here.y, 1.45 - seat.current.amount * 0.4, delta);
      return;
    }

    const keys = input.current;
    const forward = Number(keys.forward) - Number(keys.back);
    const sideways = Number(keys.right) - Number(keys.left);
    let move = { x: 0, y: 0 };
    const speed = keys.slow ? WALK_SPEED : JOG_SPEED;

    if (forward || sideways) {
      // Relative to the camera: "forward" is away from it, across the floor.
      path.current = [];
      const { yaw } = camera.current;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const length = Math.hypot(forward, sideways);
      move = {
        x: ((fx * forward - fz * sideways) / length) * speed * delta,
        y: ((fz * forward + fx * sideways) / length) * speed * delta,
      };
    } else if (path.current.length > 0) {
      // Following a click: head for the middle of the next tile.
      const next = path.current[0] as Point;
      const dx = next.x + 0.5 - position.current.x;
      const dy = next.y + 0.5 - position.current.y;
      const distance = Math.hypot(dx, dy);
      const stepLength = (JOG_SPEED * delta) / TILE_M;
      if (distance <= stepLength) path.current.shift();
      const scale = Math.min(1, stepLength / Math.max(distance, 1e-6));
      move = { x: dx * scale * TILE_M, y: dy * scale * TILE_M };
    }

    const before = position.current;
    const after = moveWithCollisions(before, { x: move.x / TILE_M, y: move.y / TILE_M });
    position.current = after;
    tile.current = { x: Math.floor(after.x), y: Math.floor(after.y) };
    const moved = Math.hypot(after.x - before.x, after.y - before.y) * TILE_M;
    motion.current.speed = moved / Math.max(delta, 1e-6);
    if (moved > 1e-4) {
      // Turn to face the way they walk, smoothly.
      turnTowards(Math.atan2(after.x - before.x, after.y - before.y), 12);
    } else if (path.current.length > 0 && !(forward || sideways)) {
      // Stuck on something: give up on the walk.
      path.current = [];
    }

    const [wx, wz] = toWorld(after.x, after.y);
    if (body.current) {
      body.current.position.set(wx, 0, wz);
      body.current.rotation.y = heading.current;
    }

    // The game in reach, and its chair (or screen) nearest the player.
    const object = nearbyObjectAt(after);
    const spot = object ? nearestChair(object, after) ?? nearestScreen(object, after) : null;
    if (object !== near.current.object || spot !== near.current.spot) {
      near.current = { object, spot };
      onNear(near.current);
    }

    followWith(wx, wz, 1.45, delta);
  });

  /** The camera: behind and above, easing after the player; kept inside the room. */
  function followWith(wx: number, wz: number, height: number, delta: number) {
    const { yaw, pitch, distance } = camera.current;
    const target = new THREE.Vector3(wx, height, wz);
    const desired = new THREE.Vector3(
      wx + Math.sin(yaw) * Math.cos(pitch) * distance,
      height + Math.sin(pitch) * distance,
      wz + Math.cos(yaw) * Math.cos(pitch) * distance
    );
    const halfW = (COLS / 2 - 1.3) * TILE_M;
    const back = (2 - ROWS / 2) * TILE_M + 0.4;
    const front = (ROWS / 2) * TILE_M + 2.2;
    desired.x = THREE.MathUtils.clamp(desired.x, -halfW, halfW);
    desired.z = THREE.MathUtils.clamp(desired.z, back, front);
    desired.y = THREE.MathUtils.clamp(desired.y, 0.6, WALL_HEIGHT - 0.3);
    const ease = 1 - Math.exp(-delta * 7);
    view.position.lerp(desired, ease);
    lookAt.current.lerp(target, 1 - Math.exp(-delta * 12));
    view.lookAt(lookAt.current);
  }

  return (
    <group ref={body}>
      <Person who="player" motion={motion} seat={seat} />
    </group>
  );
}

/** Dragging orbits the camera; the wheel zooms. */
function CameraControls({ camera }: { camera: MutableRefObject<Camera> }) {
  const { gl } = useThree();
  useEffect(() => {
    const element = gl.domElement;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const down = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const move = (event: PointerEvent) => {
      if (!dragging) return;
      camera.current.yaw -= (event.clientX - lastX) * 0.006;
      camera.current.pitch = THREE.MathUtils.clamp(camera.current.pitch + (event.clientY - lastY) * 0.004, 0.12, 1.25);
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const up = () => {
      dragging = false;
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      camera.current.distance = THREE.MathUtils.clamp(camera.current.distance + event.deltaY * 0.004, 2.4, 9);
    };
    element.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    element.addEventListener('wheel', wheel, { passive: false });
    return () => {
      element.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      element.removeEventListener('wheel', wheel);
    };
  }, [gl, camera]);
  return null;
}

// ---------- the room ----------
function Room() {
  const width = (COLS - 2) * TILE_M;
  const depth = (ROWS - 3) * TILE_M;
  const [, backZ] = toWorld(0, 2);
  const [, frontZ] = toWorld(0, ROWS - 1);
  const centerZ = (backZ + frontZ) / 2;
  const walls = useMemo(() => wallTexture([width / 2.4, 1.6]), [width]);
  const sideWalls = useMemo(() => wallTexture([depth / 2.4, 1.6]), [depth]);
  const sign = useMemo(() => neonTexture('STACKS OVERFLOWED', '#ff3fa4'), []);
  const lobby = useMemo(() => carpetTexture([(width + 4) / 1.6, 6 / 1.6]), [width]);
  return (
    <group>
      {/* Polished floor: a clear coat that catches the lights. (A true mirror,
          MeshReflectorMaterial, drew the whole room twice a frame and needed a
          second copy of every shader, freezing the page for seconds at start.) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, centerZ]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshPhysicalMaterial color="#1a0c14" roughness={0.55} metalness={0.3} clearcoat={1} clearcoatRoughness={0.12} />
      </mesh>
      {/* Back wall with the sign and a neon strip, side walls, a low front wall with the doors */}
      <mesh position={[0, WALL_HEIGHT / 2, backZ]} receiveShadow>
        <planeGeometry args={[width, WALL_HEIGHT]} />
        <meshStandardMaterial map={walls} roughness={0.7} />
      </mesh>
      <mesh position={[0, 3.2, backZ + 0.02]}>
        <planeGeometry args={[6.4, 1]} />
        <meshStandardMaterial map={sign} emissiveMap={sign} emissive="#ffffff" emissiveIntensity={2.4} transparent toneMapped={false} />
      </mesh>
      <mesh position={[0, WALL_HEIGHT - 0.25, backZ + 0.03]}>
        <boxGeometry args={[width, 0.05, 0.04]} />
        <meshStandardMaterial color="#ff3fa4" emissive="#ff3fa4" emissiveIntensity={3} toneMapped={false} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[(side * width) / 2, WALL_HEIGHT / 2, centerZ]} rotation={[0, -side * (Math.PI / 2), 0]} receiveShadow>
            <planeGeometry args={[depth, WALL_HEIGHT]} />
            <meshStandardMaterial map={sideWalls} roughness={0.7} />
          </mesh>
          <mesh position={[side * (width / 2 - 0.03), WALL_HEIGHT - 0.25, centerZ]}>
            <boxGeometry args={[0.04, 0.05, depth]} />
            <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={3} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {/* A low rail at the front, so the camera can look over it, and the lobby beyond */}
      <mesh position={[0, 0.25, frontZ]} castShadow receiveShadow>
        <boxGeometry args={[width, 0.5, 0.2]} />
        <meshStandardMaterial color="#1b0f2e" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.51, frontZ]}>
        <boxGeometry args={[width, 0.04, 0.24]} />
        <meshStandardMaterial color="#c9a227" metalness={0.9} roughness={0.25} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, frontZ + 3]} receiveShadow>
        <planeGeometry args={[width + 4, 6]} />
        <meshStandardMaterial map={lobby} roughness={0.95} />
      </mesh>
    </group>
  );
}

/** A patterned carpet under a game, a little bigger than it. */
function Rug({ object }: { object: FloorObject }) {
  const w = (object.w + 1.4) * TILE_M;
  const d = (object.h + 1.4) * TILE_M;
  const map = useMemo(() => carpetTexture([w / 1.6, d / 1.6]), [w, d]);
  const [x, z] = toWorld(object.x + object.w / 2, object.y + object.h / 2);
  return (
    <group position={[x, 0.004, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w + 0.16, d + 0.16]} />
        <meshStandardMaterial color="#c9a227" roughness={0.5} metalness={0.6} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial map={map} roughness={0.95} />
      </mesh>
    </group>
  );
}

/** A spotlight hanging over a game. */
function Spot({ x, z, color = '#ffe8c2', intensity = 45 }: { x: number; z: number; color?: string; intensity?: number }) {
  const light = useRef<THREE.SpotLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    target.position.set(x, 0, z);
    if (light.current) light.current.target = target;
  }, [target, x, z]);
  return (
    <>
      <primitive object={target} />
      <spotLight ref={light} position={[x, WALL_HEIGHT - 0.2, z]} angle={0.62} penumbra={0.7} intensity={intensity} distance={12} decay={2} color={color} />
    </>
  );
}

/** `highlight` is the chair (or screen) to outline, when the player is near. */
function FloorPiece({ object, highlight }: { object: FloorObject; highlight: number | null }) {
  const width = object.w * TILE_M;
  const depth = object.h * TILE_M;
  const layout = pieceLayout(object);
  switch (object.kind) {
    case 'poker':
      return <PokerTable width={width} depth={depth} layout={layout} highlight={highlight} />;
    case 'blackjack':
      return <BlackjackTable width={width} depth={depth} layout={layout} highlight={highlight} />;
    case 'roulette':
      return <RouletteTable width={width} depth={depth} layout={layout} highlight={highlight} />;
    case 'slots':
      return <SlotMachines width={width} depth={depth} highlight={highlight} />;
    case 'sports-betting':
      return <SportsBar width={width} depth={depth} highlight={highlight} />;
    case 'shop':
      return <ShopCounter width={width} depth={depth} layout={layout} />;
    case 'plant':
      return <Plant />;
    case 'pillar':
      return <Pillar height={WALL_HEIGHT} />;
  }
}

function Floor({ onNear, onPlay, nearId, input, playing, onSeated }: Props) {
  const path = useRef<Point[]>([]);
  // The chair (or screen) nearest the player at the game in reach, outlined.
  const [nearSpot, setNearSpot] = useState<number | null>(null);
  const nearSpotRef = useRef<number | null>(null);
  const lastNearId = useRef<string | null>(null);
  const handleNear = useCallback(
    ({ object, spot }: NearSpot) => {
      nearSpotRef.current = spot;
      setNearSpot(spot);
      if ((object?.id ?? null) !== lastNearId.current) {
        lastNearId.current = object?.id ?? null;
        onNear(object);
      }
    },
    [onNear]
  );
  // Asked to play: take the outlined chair.
  const seating = useRef<{ object: FloorObject; spot: number | null } | Seating | null>(null);
  useEffect(() => {
    if (playing && !seating.current) seating.current = { object: playing, spot: nearSpotRef.current };
  }, [playing]);
  const camera = useRef<Camera>({ yaw: 0, pitch: 0.42, distance: 4.6 });
  const near = FLOOR_OBJECTS.find((object) => object.id === nearId);
  const playerTile = useRef<Point>({ x: START.x, y: START.y });

  // The player's tile (kept up to date by Player), for click-to-walk paths.
  const walkTo = (targets: Point[]) => {
    path.current = findPath(playerTile.current, targets) ?? [];
  };

  function handleFloorClick(event: ThreeEvent<MouseEvent>) {
    if (event.delta > 6 || seating.current) return; // a drag to look around, or already sitting down
    event.stopPropagation();
    const tile = {
      x: Math.floor(event.point.x / TILE_M + COLS / 2),
      y: Math.floor(event.point.z / TILE_M + ROWS / 2),
    };
    const object = objectAt(tile.x, tile.y);
    if (object?.interactive) {
      if (object.id === nearId) onPlay(object);
      else walkTo(standingSpots(object));
    } else if (!isBlocked(tile.x, tile.y)) {
      walkTo([tile]);
    }
  }

  return (
    <>
      <CameraControls camera={camera} />
      <ambientLight intensity={0.35} color="#ffd9c2" />
      <hemisphereLight args={['#6b4b8f', '#1a0d10', 0.55]} />
      <directionalLight
        position={[4, 9, 6]}
        intensity={1.3}
        color="#ffe3c4"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-bias={-0.0004}
      />
      <pointLight position={[0, 3.2, toWorld(0, 2)[1] + 0.8]} color="#ff3fa4" intensity={12} distance={9} />

      <Room />
      <group onClick={handleFloorClick}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} visible={false}>
          <planeGeometry args={[COLS * TILE_M, ROWS * TILE_M]} />
        </mesh>
        {FLOOR_OBJECTS.filter((object) => object.interactive).map((object) => {
          const [x, z] = toWorld(object.x + object.w / 2, object.y + object.h / 2);
          return (
            <group key={`light-${object.id}`}>
              <Rug object={object} />
              <Spot x={x} z={z} color={object.kind === 'slots' ? '#ffd1e8' : '#ffe8c2'} />
            </group>
          );
        })}
        <EffectComposer multisampling={4} enableNormalPass={false}>
          <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.82} luminanceSmoothing={0.25} />
          <Vignette offset={0.25} darkness={0.6} />
        </EffectComposer>
        {FLOOR_OBJECTS.map((object) => {
          const [x, z] = toWorld(object.x + object.w / 2, object.y + object.h / 2);
          return (
            <group key={object.id} position={[x, 0, z]}>
              {/* A table outlines its nearest chair; the shop is outlined whole (until the player's sitting down). */}
              <Highlight enabled={object.id === nearId && object.kind === 'shop' && !playing}>
                <FloorPiece object={object} highlight={object.id === nearId && !playing ? nearSpot : null} />
              </Highlight>
            </group>
          );
        })}
      </group>

      <Player input={input} onNear={handleNear} path={path} camera={camera} tile={playerTile} seating={seating} onSeated={onSeated} />

      {near?.interactive && !playing ? (
        <Html position={[toWorld(near.x + near.w / 2, 0)[0], near.kind === 'sports-betting' ? 2.75 : 2.2, toWorld(0, near.y + near.h / 2)[1]]} center zIndexRange={[20, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded-md border border-white/20 bg-black/70 px-3 py-1.5 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-[0_0_24px_rgba(255,255,255,0.25)] backdrop-blur">
            {near.interactive.name}
          </div>
        </Html>
      ) : null}
    </>
  );
}

/** Compiles every shader before the first frame is drawn (see compile.ts). */
function Warmup({ onReady }: { onReady: () => void }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    let live = true;
    compileInBackground(gl, scene, camera).then(() => {
      if (live) onReady();
    });
    return () => {
      live = false;
    };
  }, [gl, scene, camera, onReady]);
  return null;
}

export default function Scene({ paused, ...props }: Props) {
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  return (
    <>
      <Canvas
        frameloop={paused || !ready ? 'never' : 'always'}
        shadows
        dpr={[1, 1.75]}
        camera={{ fov: 52, near: 0.1, far: 80, position: [0, 3, 8] }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      >
        <color attach="background" args={['#06030a']} />
        <fog attach="fog" args={['#06030a', 12, 30]} />
        <Floor {...props} />
        <Warmup onReady={onReady} />
      </Canvas>
      {ready ? null : (
        <div className="absolute inset-0 flex items-center justify-center bg-[#06030a] text-sm uppercase tracking-[0.3em] text-slate-400">
          <span className="animate-pulse">Opening the casino…</span>
        </div>
      )}
    </>
  );
}
