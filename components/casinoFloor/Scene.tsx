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
  entranceWalk,
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
  type TakenSeat,
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
import Lobby, { CASINO_DOOR_HALF, LOBBY_HALF_WIDTH, LOBBY_HEIGHT, LOBBY_NORTH_Z, LOBBY_SOUTH_Z, type LobbyState } from './Lobby';
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
// the nearest screen) — then the page opens the game. Coming back from that
// game, the same plays backwards (SRS-108.6): the player starts in the seat
// with the camera over the table, the camera pulls back behind them, and
// they get up beside the chair. Just after logging in (SRS-103.12) the player
// starts outside the building instead and walks in through its lobby
// (Lobby.tsx) and the casino's doors.

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
  /** The fly-in is over: open the game. `spot` is the chair (or screen) taken. */
  onSeated: (object: FloorObject, spot: number | null) => void;
  /** Back from a game: start in this seat and get up from it (SRS-108.6). */
  returning?: TakenSeat | null;
  /** Getting up is over. */
  onStood?: () => void;
  /** Just logged in: start outside the building and walk in through its lobby (SRS-103.12). */
  entering?: boolean;
  /** The walk in is over (or was skipped). */
  onEntered?: () => void;
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

/**
 * Taking a seat to play: walk beside the chair, face the table, sit, then the
 * camera flies in. Getting up after the game runs it backwards: 'rise' pulls
 * the camera back behind the seated player, then they 'stand'.
 */
interface Seating {
  object: FloorObject;
  /** The chair (or screen) by index, as the page remembers it. */
  spot: number | null;
  stage: 'walk' | 'turn' | 'sit' | 'zoom' | 'done' | 'rise' | 'stand';
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
    spot,
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

/**
 * Getting up again after a game (SRS-108.6): the plan for sitting down in
 * that seat, played backwards. Nobody sits at a screen or the shop counter,
 * so there the player stands on the nearest open spot in front of it.
 */
function planRising(object: FloorObject, spot: number | null): Seating {
  const [sx, sz] = toWorld(START.x + 0.5, START.y + 0.5);
  const plan = planSeating(object, spot, new THREE.Vector2(sx, sz));
  plan.stage = 'rise';
  plan.t = 0;
  if (!plan.seatAt) {
    const view = new THREE.Vector2(plan.zoomTo.position.x, plan.zoomTo.position.z);
    const spots = standingSpots(object).map((point) => new THREE.Vector2(...toWorld(point.x + 0.5, point.y + 0.5)));
    plan.approach = spots.sort((a, b) => a.distanceTo(view) - b.distanceTo(view))[0] ?? view;
    const [cx, cz] = toWorld(object.x + object.w / 2, object.y + object.h / 2);
    plan.facing = Math.atan2(cx - plan.approach.x, cz - plan.approach.y);
  }
  return plan;
}

/**
 * Walking in after logging in (SRS-103.12), through the building's lobby
 * (Lobby.tsx): the player stands outside the glass front doors while they
 * slide open, then walks in along `points` (outside, the front door, down the
 * lobby, through the casino's doors, a few steps onto the floor). The camera
 * holds inside the lobby facing them as they come in, orbits round to
 * behind them, follows them down the lobby, and closes in as they go through
 * the casino's doors, so it ends past them with the lobby behind it, which is
 * then hidden. Any key or a click skips to the end.
 */
interface WalkIn {
  /** The walk, world metres. */
  points: THREE.Vector2[];
  length: number;
  /** How far along it the player is, metres, and seconds since it began. */
  walked: number;
  t: number;
  skip: boolean;
  /** Where the first shot is taken from: inside the lobby, facing the front doors. */
  from: THREE.Vector3;
}

/** Seconds outside while the front doors open, then the walking pace, metres a second. */
const ENTER_WAIT = 1.2;
const ENTER_SPEED = 1.6;

function planEntrance(): WalkIn {
  const points = entranceWalk().map((point) => new THREE.Vector2(...toWorld(point.x, point.y)));
  const length = points.slice(1).reduce((sum, point, i) => sum + point.distanceTo(points[i]!), 0);
  return {
    points,
    length,
    walked: 0,
    t: 0,
    skip: false,
    from: new THREE.Vector3(points[0]!.x + 1.7, 2.0, LOBBY_SOUTH_Z - 4.2),
  };
}

/** Where the camera is, `walked` metres into the walk with the player `here`. */
function walkInCamera(entry: WalkIn, here: THREE.Vector2) {
  // Through the front door and a few steps in, the first shot holds.
  const holdUntil = 3.4;
  const behindBy = 8.6;
  const closeInFrom = entry.length - 3.6;
  const s = entry.walked;
  const head = 1.45;
  if (s <= holdUntil) return entry.from.clone();
  // Then it orbits the player, from where that shot was to behind them.
  const holdHere = alongWalk(entry.points, holdUntil).here;
  const startYaw = Math.atan2(entry.from.x - holdHere.x, entry.from.z - holdHere.y);
  const startAcross = Math.hypot(entry.from.x - holdHere.x, entry.from.z - holdHere.y);
  const behind = { yaw: 0, across: 4.6 * Math.cos(0.36), up: 4.6 * Math.sin(0.36) };
  let yaw: number;
  let across: number;
  let up: number;
  if (s <= behindBy) {
    const k = smooth((s - holdUntil) / (behindBy - holdUntil));
    yaw = THREE.MathUtils.lerp(startYaw, 0.12, k);
    across = THREE.MathUtils.lerp(startAcross, behind.across, k);
    up = THREE.MathUtils.lerp(entry.from.y - head, behind.up, k);
  } else if (s <= closeInFrom) {
    yaw = THREE.MathUtils.lerp(0.12, 0, smooth((s - behindBy) / (closeInFrom - behindBy)));
    across = behind.across;
    up = behind.up;
  } else {
    // Closing in as they go through the casino's doors, so it ends past them.
    const k = smooth((s - closeInFrom) / (entry.length - closeInFrom));
    yaw = 0;
    across = THREE.MathUtils.lerp(behind.across, 2 * Math.cos(0.75), k);
    up = THREE.MathUtils.lerp(behind.up, 2 * Math.sin(0.75), k);
  }
  const position = new THREE.Vector3(here.x + Math.sin(yaw) * across, head + up, here.y + Math.cos(yaw) * across);
  if (position.z > LOBBY_NORTH_Z) {
    // Kept inside the lobby's walls and under its ceiling.
    position.x = THREE.MathUtils.clamp(position.x, -LOBBY_HALF_WIDTH + 0.4, LOBBY_HALF_WIDTH - 0.4);
    position.y = Math.min(position.y, LOBBY_HEIGHT - 0.4);
  }
  return position;
}

/** The point `walked` metres along the walk, and the way it's heading there. */
function alongWalk(points: THREE.Vector2[], walked: number) {
  let left = walked;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const leg = a.distanceTo(b);
    if (left <= leg || i === points.length - 2) {
      const k = leg > 0 ? Math.min(1, left / leg) : 1;
      return { here: a.clone().lerp(b, k), heading: Math.atan2(b.x - a.x, b.y - a.y) };
    }
    left -= leg;
  }
  return { here: points[points.length - 1]!.clone(), heading: Math.PI };
}

function Player({
  input,
  onNear,
  path,
  camera,
  tile,
  seating,
  onSeated,
  onStood,
  walkIn,
  lobby,
  onEntered,
}: {
  input: MutableRefObject<WalkInput>;
  onNear: (near: NearSpot) => void;
  path: MutableRefObject<Point[]>;
  camera: MutableRefObject<Camera>;
  tile: MutableRefObject<Point>;
  /** Set to start taking a seat; Player plans and plays it. */
  seating: MutableRefObject<{ object: FloorObject; spot: number | null } | Seating | null>;
  onSeated: (object: FloorObject, spot: number | null) => void;
  onStood?: () => void;
  /** The walk in after logging in, while it plays (SRS-103.12), and the lobby it plays in. */
  walkIn: MutableRefObject<WalkIn | null>;
  lobby: MutableRefObject<LobbyState>;
  onEntered?: () => void;
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

    // Walking in after logging in (SRS-103.12): the player isn't steered,
    // the walk plays out; any key (or a click, see Floor) skips to the end.
    const entry = walkIn.current;
    if (entry) {
      const keys = input.current;
      if (keys.forward || keys.back || keys.left || keys.right) entry.skip = true;
      entry.t += delta;
      if (entry.skip) {
        entry.walked = entry.length;
      } else if (entry.t > ENTER_WAIT) {
        entry.walked = Math.min(entry.length, entry.walked + ENTER_SPEED * delta);
      }
      const walking = entry.t > ENTER_WAIT && entry.walked < entry.length;
      const { here, heading: way } = alongWalk(entry.points, entry.walked);
      motion.current.speed = walking ? ENTER_SPEED : 0;
      if (walking) turnTowards(way, 10);
      position.current = { x: here.x / TILE_M + COLS / 2, y: here.y / TILE_M + ROWS / 2 };
      if (body.current) {
        body.current.position.set(here.x, 0, here.y);
        body.current.rotation.y = heading.current;
      }
      // The glass front doors slide open first; the casino's doors swing open
      // as the player comes up to them.
      lobby.current.front = smooth((entry.t - 0.25) / 1.1);
      lobby.current.casino = smooth((LOBBY_NORTH_Z + 4.6 - here.y) / 2.2);
      view.position.copy(walkInCamera(entry, here));
      lookAt.current.set(here.x, 1.45, here.y);
      view.lookAt(lookAt.current);
      if (entry.walked >= entry.length) {
        // On the floor, facing into the room, the camera past the doors:
        // the lobby goes (it's behind the camera) and walking is theirs.
        heading.current = Math.PI;
        if (body.current) body.current.rotation.y = heading.current;
        motion.current.speed = 0;
        lobby.current.shown = false;
        walkIn.current = null;
        tile.current = { x: Math.floor(position.current.x), y: Math.floor(position.current.y) };
        onEntered?.();
      }
      return;
    }

    // Taking a seat: the player isn't steered, the plan plays out.
    let plan = seating.current;
    if (plan && !('stage' in plan)) {
      const [wx, wz] = toWorld(position.current.x, position.current.y);
      plan = planSeating(plan.object, plan.spot, new THREE.Vector2(wx, wz));
      seating.current = plan;
      path.current = [];
    }
    if (plan && 'stage' in plan && (plan.stage === 'rise' || plan.stage === 'stand') && plan.approach) {
      plan.t += delta;
      motion.current.speed = 0;
      if (!plan.zoomFrom) {
        // The first frame back: in the seat (or at the screen or counter),
        // facing the game, with the camera where it flew in to and the
        // orbit set to end up behind them.
        heading.current = plan.facing;
        camera.current.yaw = plan.facing + Math.PI;
        if (plan.seatAt) {
          seat.current = { amount: 1, handsY: plan.seatedHands.y, handsZ: plan.seatedHands.z };
        }
        plan.zoomFrom = { position: plan.zoomTo.position.clone(), look: plan.zoomTo.look.clone() };
      }
      let here = (plan.seatAt ?? plan.approach).clone();
      let finished = false;
      if (plan.stage === 'stand' && plan.seatAt) {
        const k = smooth(plan.t / SIT_SECONDS);
        seat.current.amount = 1 - k;
        here = plan.seatAt.clone().lerp(plan.approach, k);
        finished = plan.t >= SIT_SECONDS;
      }
      position.current = { x: here.x / TILE_M + COLS / 2, y: here.y / TILE_M + ROWS / 2 };
      if (body.current) {
        body.current.position.set(here.x, 0, here.y);
        body.current.rotation.y = heading.current;
      }
      const height = 1.45 - seat.current.amount * 0.4;
      if (plan.stage === 'rise') {
        // The camera pulls back from over the table to behind the player.
        const k = smooth(plan.t / ZOOM_SECONDS);
        const pose = followPose(here.x, here.y, height);
        view.position.lerpVectors(plan.zoomFrom.position, pose.position, k);
        lookAt.current.lerpVectors(plan.zoomFrom.look, pose.look, k);
        view.lookAt(lookAt.current);
        if (plan.t >= ZOOM_SECONDS) {
          plan.stage = 'stand';
          plan.t = 0;
          finished = !plan.seatAt;
        }
      } else {
        followWith(here.x, here.y, height, delta);
      }
      if (finished) {
        // On their feet: walking is theirs again.
        seat.current.amount = 0;
        seating.current = null;
        tile.current = { x: Math.floor(position.current.x), y: Math.floor(position.current.y) };
        onStood?.();
      }
      return;
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
          onSeated(plan.object, plan.spot);
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

  /** Where the following camera sits, and what it looks at: behind and above the player, kept inside the room. */
  function followPose(wx: number, wz: number, height: number) {
    const { yaw, pitch, distance } = camera.current;
    const look = new THREE.Vector3(wx, height, wz);
    const position = new THREE.Vector3(
      wx + Math.sin(yaw) * Math.cos(pitch) * distance,
      height + Math.sin(pitch) * distance,
      wz + Math.cos(yaw) * Math.cos(pitch) * distance
    );
    const halfW = (COLS / 2 - 1.3) * TILE_M;
    const back = (2 - ROWS / 2) * TILE_M + 0.4;
    const front = (ROWS / 2) * TILE_M + 2.2;
    position.x = THREE.MathUtils.clamp(position.x, -halfW, halfW);
    position.z = THREE.MathUtils.clamp(position.z, back, front);
    position.y = THREE.MathUtils.clamp(position.y, 0.6, WALL_HEIGHT - 0.3);
    return { position, look };
  }

  /** The camera: easing after the player into its following pose. */
  function followWith(wx: number, wz: number, height: number, delta: number) {
    const pose = followPose(wx, wz, height);
    const ease = 1 - Math.exp(-delta * 7);
    view.position.lerp(pose.position, ease);
    lookAt.current.lerp(pose.look, 1 - Math.exp(-delta * 12));
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
function Room({ lobbyState }: { lobbyState: MutableRefObject<LobbyState> }) {
  // The front rail is plain, except during the walk in (SRS-103.12), when the
  // stretch across the casino's doorway is left out for the player to walk
  // through; it's back as soon as the lobby is hidden.
  const filler = useRef<THREE.Group>(null);
  useFrame(() => {
    if (filler.current) filler.current.visible = !lobbyState.current.shown;
  });
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
      {/* Back wall with the sign and a neon strip, side walls, and a low front rail */}
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
      {/* A low rail at the front, so the camera can look over it (the middle
          stretch is the filler), and the lobby carpet beyond */}
      {[
        [-width / 2, -CASINO_DOOR_HALF],
        [-CASINO_DOOR_HALF, CASINO_DOOR_HALF],
        [CASINO_DOOR_HALF, width / 2],
      ].map(([from, to], i) => (
        <group key={from} ref={i === 1 ? filler : undefined}>
          <mesh position={[(from + to) / 2, 0.25, frontZ]} castShadow receiveShadow>
            <boxGeometry args={[to - from, 0.5, 0.2]} />
            <meshStandardMaterial color="#1b0f2e" roughness={0.6} />
          </mesh>
          <mesh position={[(from + to) / 2, 0.51, frontZ]}>
            <boxGeometry args={[to - from, 0.04, 0.24]} />
            <meshStandardMaterial color="#c9a227" metalness={0.9} roughness={0.25} />
          </mesh>
        </group>
      ))}
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

function Floor({ onNear, onPlay, nearId, input, playing, onSeated, returning, onStood, entering, onEntered }: Props) {
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
  // Asked to play: take the outlined chair. Back from a game, first get up
  // from the seat taken to play it (SRS-108.6).
  const [rising] = useState(() => (returning ? planRising(returning.object, returning.spot) : null));
  const seating = useRef<{ object: FloorObject; spot: number | null } | Seating | null>(rising);
  // Just logged in, and not back from a game: walk in through the entrance
  // (SRS-103.12).
  const [entrance] = useState(() => (entering && !rising ? planEntrance() : null));
  const walkIn = useRef<WalkIn | null>(entrance);
  const lobby = useRef<LobbyState>({ front: 0, casino: 0, shown: entrance !== null });
  // Any key, or pressing anywhere on the floor's view, skips the walk in.
  const { gl } = useThree();
  useEffect(() => {
    const skip = () => {
      if (walkIn.current) walkIn.current.skip = true;
    };
    const element = gl.domElement;
    element.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', skip);
    return () => {
      element.removeEventListener('pointerdown', skip);
      window.removeEventListener('keydown', skip);
    };
  }, [gl]);
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
    if (walkIn.current) return; // the press that skipped the walk in (see above)
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

      <Room lobbyState={lobby} />
      {entrance ? <Lobby state={lobby} /> : null}
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

      <Player
        input={input}
        onNear={handleNear}
        path={path}
        camera={camera}
        tile={playerTile}
        seating={seating}
        onSeated={onSeated}
        onStood={onStood}
        walkIn={walkIn}
        lobby={lobby}
        onEntered={onEntered}
      />

      {near?.interactive && !playing && !walkIn.current ? (
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
