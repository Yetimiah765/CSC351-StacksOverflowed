'use client';

import { Html } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import {
  BAR,
  BAR_ALCOVE,
  CAGE,
  COLS,
  DOOR,
  FLOOR_OBJECTS,
  LEFT_WALL,
  RIGHT_WALL,
  SHOP_ALCOVE,
  ROWS,
  LOBBY_MIDDLE,
  START,
  TILE_METRES,
  atCasinoDoors,
  atCasinoDoorsFromLobby,
  atFountain,
  atKiosk,
  deskWalk,
  doorStandingSpots,
  kioskStandingSpots,
  entranceWalk,
  exitWalk,
  coinLanding,
  findPath,
  fountainCentre,
  fountainStandingSpots,
  isBlocked,
  isInLobby,
  moveWithCollisions,
  nearbyObjectAt,
  rugRect,
  nearestChair,
  nearestScreen,
  objectAt,
  pieceLayout,
  standingSpots,
  stepCasinoDoors,
  stepGate,
  CASINO_DOORS_PASSABLE,
  GATE_SHUT,
  type FloorObject,
  type GateState,
  type Point,
  type StoodSpot,
  type TakenSeat,
} from '../../lib/casinoFloor';
import { wishDay } from '../../lib/wishingFountain';
import {
  Bar,
  BlackjackTable,
  Pillar,
  Plant,
  PokerTable,
  RouletteTable,
  ShopCage,
  SlotMachines,
  SportsBar,
} from './Furniture';
import Person, { type Motion, type SeatPose, type TossPose } from './Person';
import { compileInBackground } from './compile';
import CoinToss, { noCoin, type CoinFx } from './CoinToss';
import Slosh from './Slosh';
import BarGlass, { GLASS_HEIGHT, GLASS_RADIUS, noGlass, type GlassFx } from './BarGlass';
import { SIPS_PER_DRINK, STUMBLE_SPEED, noStumble, stepStumble } from '../../lib/drinks';
import { BASIN_FLOOR, BASIN_WATER } from './Fountain';
import CasinoFront, { CASINO_DOOR_HALF, CASINO_DOOR_HEIGHT, FRONT_WALL_Z } from './CasinoFront';
import Lobby, { LOBBY_HALF_WIDTH, LOBBY_HEIGHT, LOBBY_NORTH_Z, LOBBY_SOUTH_Z, type LobbyState } from './Lobby';
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
// (Lobby.tsx) and the casino's doors (CasinoFront.tsx), which shut behind
// them; through the gate in the rail, at those doors, a logged-in player can
// leave the same way, walking out to the street as they log out (SRS-105.5).
// At the bar there's no game to open: the player sits on a stool and stays,
// watching the TVs, until they walk off.

const TILE_M = TILE_METRES;
/** The middle of the lobby (and the casino's doors) across the room, metres: the door needn't be in the middle of the grid. */
const LOBBY_X = (DOOR.x + DOOR.w / 2 - COLS / 2) * TILE_METRES;
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
  /** The page's "Get up" button, for a player sitting at the bar on a touch screen; Player clears it. */
  getUp?: boolean;
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
  /** The first visit in the tab, or just logged in: start outside the building and walk in (SRS-103.12). */
  entering?: boolean;
  /** A guest: they stay in the lobby (they can't go into the casino until they've checked in). */
  guest?: boolean;
  /** The walk in is over (or was skipped). */
  onEntered?: () => void;
  /** Logged in, so the casino's doors can be left through, logging out (SRS-105.5). */
  canLeave?: boolean;
  /** The player came in reach of the casino's doors, from the foyer ('floor') or the lobby ('lobby', SRS-103.15), or went out of it (null). */
  onNearDoors?: (near: DoorsSide) => void;
  /** A click on the casino's doors while in reach of them from the foyer. */
  onLeave?: () => void;
  /** Set by the page once the player has chosen to leave: the scene walks them out, or with `leaveAtOnce` (reduced motion) puts them straight in the lobby. */
  leaving?: boolean;
  leaveAtOnce?: boolean;
  /** The walk out is over (or was skipped): they're a guest in the lobby. */
  onLeft?: () => void;
  /** A guest came in reach of a check-in tablet at the front desk (its index), or went out of reach (null) (SRS-103.13). */
  onNearKiosk?: (kiosk: number | null) => void;
  /** A click on the check-in tablet in reach, or (for a guest) on the casino's doors from the lobby (SRS-103.15). */
  onCheckIn?: () => void;
  /** Set by the page while the guest is checking in: they walk to the front desk if they aren't at a tablet (SRS-103.15), the camera flies into the tablet (all straight there with `checkInAtOnce`), then `onAtKiosk`; cleared, it flies back out. */
  checkingIn?: boolean;
  checkInAtOnce?: boolean;
  onAtKiosk?: () => void;
  /** Came in reach of the lobby's fountain, or went out of reach; a click on it in reach makes a wish (SRS-129.1), or for a guest checks in to (SRS-129.5). */
  onNearFountain?: (near: boolean) => void;
  onWish?: () => void;
  /** Set by the page once a wish is made: the scene plays the coin toss (SRS-129.4), or with `tossAtOnce` (reduced motion) goes straight to its end; then `onTossed`, with where the coin lies (metres from the fountain's middle). */
  tossing?: boolean;
  tossAtOnce?: boolean;
  onTossed?: (spot: { x: number; z: number }) => void;
  /** Where today's coin lies on the bottom of the fountain (metres from its middle), or null for none. */
  restingCoin?: { x: number; z: number } | null;
  /** Where the player last stood in this tab, to start them there (SRS-107.7). */
  spot?: StoodSpot | null;
  /** Where the player stands now, every so often while they walk about (and as the page closes), to remember. */
  onSpot?: (spot: StoodSpot) => void;
  /** Stop drawing (while a game's page loads), so the page isn't held up. */
  paused?: boolean;
  /** Sat on a bar stool (true), or got up from it (false). */
  onBarSeated?: (seated: boolean) => void;
  /** Counts the drinks ordered at the bar: each new count is a new drink, which the player sips (all at once with `drinkAtOnce`), calling `onSip` for each sip and `onDrinkDone` when it's finished (or they got up). */
  drinkOrder?: number;
  drinkAtOnce?: boolean;
  onSip?: () => void;
  onDrinkDone?: () => void;
  /** How sloshed the view is (maxed out on drinks), 0 to 1; with `sloshGentle` (reduced motion) it holds still. */
  slosh?: number;
  sloshGentle?: boolean;
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
  /** 'seated' is staying on a bar stool (a lounge, not a game): walking gets up again. */
  stage: 'walk' | 'turn' | 'sit' | 'zoom' | 'done' | 'seated' | 'rise' | 'stand';
  /** Seconds into the current stage. */
  t: number;
  /** World positions on the floor, metres: beside the chair, and the seat. */
  approach: THREE.Vector2 | null;
  seatAt: THREE.Vector2 | null;
  /** The heading to sit facing the table. */
  facing: number;
  seatedHands: { y: number; z: number; hipY?: number };
  zoomFrom: { position: THREE.Vector3; look: THREE.Vector3 } | null;
  zoomTo: { position: THREE.Vector3; look: THREE.Vector3 };
  /** At the bar: how far back the camera was before sitting, to put back on getting up. */
  cameraDistance?: number;
}

/** A drink at the bar: seconds in, and how many sips are taken. */
interface DrinkPlan {
  s: number;
  sips: number;
  atOnce: boolean;
}
/** The bartender pouring it (the glass fills on the counter), then each sip: reach for the glass, lift it, drink, put it down, let go. */
const POUR_SECONDS = 0.9;
const SIP = { reach: 0.45, lift: 1.0, drink: 1.8, lower: 2.3, end: 2.6 };
/** Where the glass stands on the counter, in the seated player's own space (metres; +x their left, +z ahead). */
const GLASS_ON_COUNTER = new THREE.Vector3(-0.2, 0, 0.5);
/** The mouth, from the head's joint (at the top of the neck): this far up towards the top of the head, and this far ahead of it. */
const MOUTH_UP = 0.28;
const MOUTH_AHEAD = 0.1;

/** How far the glass tips back to drink, radians, as it reaches the lips and at its deepest; and how far the head tips back then. */
const SIP_TILT = 0.4;
const SIP_TILT_DEEP = 1.15;
const HEAD_BACK = 0.12;
const HEAD_BACK_DEEP = 0.45;
/** Which way the right elbow points while drinking, in the player's own space: down at their side, a little out. */
const DRINK_ELBOW = new THREE.Vector3(-0.45, -0.88, 0.1);

/** The glass's base, from the mouth, so that its near rim rests on the lips when it's tipped back by `tilt` (in the player's own space, where the glass tips about its own x axis). */
function baseFromMouth(mouth: THREE.Vector3, tilt: number) {
  const rimY = GLASS_HEIGHT * Math.cos(tilt) - GLASS_RADIUS * Math.sin(tilt);
  const rimZ = -GLASS_HEIGHT * Math.sin(tilt) - GLASS_RADIUS * Math.cos(tilt);
  return new THREE.Vector3(mouth.x, mouth.y - rimY, mouth.z - rimZ);
}

/** The middle of the glass, from its base, tipped back by `tilt`. */
function glassMiddle(base: THREE.Vector3, tilt: number) {
  return new THREE.Vector3(base.x, base.y + (GLASS_HEIGHT / 2) * Math.cos(tilt), base.z - (GLASS_HEIGHT / 2) * Math.sin(tilt));
}

/** Which side of the casino's doors the player is in reach of them from, if either. */
export type DoorsSide = 'floor' | 'lobby' | null;

/**
 * Checking in at a front-desk tablet (SRS-103.13): a guest who isn't at one
 * (they used the casino's doors, SRS-103.15) first walks to the desk
 * ('walk'), the camera swinging round behind them. Then they turn to the
 * tablet and the camera flies in from wherever it was until its screen
 * fills the view ('in'); the page then shows the tablet up close ('open'),
 * and stepping away, or logging in, flies the camera back out to behind
 * them ('out'), leaving them at the desk (SRS-103.14).
 */
interface KioskVisit {
  /** The tablet; for a walk to the desk, chosen once the walk is planned. */
  kiosk: number;
  stage: 'walk' | 'in' | 'open' | 'out';
  t: number;
  skip: boolean;
  /** With reduced motion: each stage goes straight to its end. */
  atOnce: boolean;
  /** The walk to the desk, world metres, once planned from where the player is, and how far along it they are. */
  walk: { points: THREE.Vector2[]; length: number; walked: number } | null;
  from: { position: THREE.Vector3; look: THREE.Vector3 } | null;
}

const KIOSK_SECONDS = 1.4;
/** How far in front of the tablet's screen the camera stops, metres (just past the camera's near plane). */
const KIOSK_VIEW = 0.15;

/**
 * Tossing a coin into the fountain after making a wish (SRS-129.4). It runs
 * on its own clock, `s`, which slows down while the coin's in the air and
 * splashing: the player turns to the fountain and the camera moves over
 * their shoulder; they wind up and throw; the camera follows the coin,
 * close up, flipping through the air into the water; it splashes, then
 * sinks to the bottom, the camera looking down at it; and the camera slowly
 * pulls back to behind the player. Any key or a click skips to the end.
 */
interface CoinTossPlan {
  s: number;
  skip: boolean;
  /** Where it lands, metres from the fountain's middle, and in the world, on the water and on the bottom. */
  spot: { x: number; z: number };
  land: THREE.Vector3;
  rest: THREE.Vector3;
  /** Which way the player throws (level), and their right. */
  ahead: THREE.Vector3;
  right: THREE.Vector3;
  /** Where the coin leaves their hand, once it has. */
  release: THREE.Vector3 | null;
  /** The camera where the toss began; above the water looking down at the splash; and closer, looking down at the coin on the bottom. */
  from: CameraPose;
  splashView: CameraPose;
  bottomView: CameraPose;
}

type CameraPose = { position: THREE.Vector3; look: THREE.Vector3 };

/** The toss's moments on its own clock, seconds: the coin leaves the hand, lands, has finished splashing, reaches the bottom; the camera starts back, and is back. */
const TOSS = { release: 0.8, landed: 1.35, splashed: 1.75, sunk: 3.15, held: 3.6, end: 6.2 };
/** How fast the toss's clock runs against real time: slowed to a quarter while the coin's in the air, easing back as it splashes. */
function tossRate(s: number) {
  if (s < TOSS.release) return 1;
  if (s < TOSS.release + 0.06) return THREE.MathUtils.lerp(1, 0.25, (s - TOSS.release) / 0.06);
  if (s < TOSS.landed) return 0.25;
  if (s < TOSS.splashed) return THREE.MathUtils.lerp(0.25, 1, (s - TOSS.landed) / (TOSS.splashed - TOSS.landed));
  return 1;
}
/** How high over the straight line from the hand to the water the coin goes, metres, and how many times it turns over on the way. */
const TOSS_ARC = 0.35;
const TOSS_FLIPS = 3.5;

/** A point `y` metres up, `spot` metres from the fountain's middle, in the world. */
function fountainPoint(spot: { x: number; z: number }, y: number) {
  const centre = fountainCentre();
  const [x, z] = toWorld(centre.x, centre.y);
  return new THREE.Vector3(x + spot.x, y, z + spot.z);
}

function planToss(at: Point, from: CameraPose, atOnce: boolean): CoinTossPlan {
  const spot = coinLanding(at, wishDay());
  const land = fountainPoint(spot, BASIN_WATER);
  const [px, pz] = toWorld(at.x, at.y);
  const ahead = new THREE.Vector3(land.x - px, 0, land.z - pz).normalize();
  const right = new THREE.Vector3().crossVectors(ahead, new THREE.Vector3(0, 1, 0)).normalize();
  const rest = fountainPoint(spot, BASIN_FLOOR + 0.004);
  return {
    s: 0,
    skip: atOnce,
    spot,
    land,
    rest,
    ahead,
    right,
    release: null,
    from: { position: from.position.clone(), look: from.look.clone() },
    // (Both well above the basin's rim, which would hide the water from lower down.)
    splashView: { position: land.clone().addScaledVector(ahead, -0.25).addScaledVector(right, 0.18).setY(BASIN_WATER + 0.38), look: land.clone() },
    bottomView: { position: rest.clone().addScaledVector(ahead, -0.12).addScaledVector(right, 0.08).setY(BASIN_FLOOR + 0.55), look: rest.clone() },
  };
}

/** Where the throw has the right wrist, `s` seconds in, in the body's own space: low in front, wound up back over the shoulder, thrown forward and up (it lets go there), then following through. */
function tossArm(s: number) {
  const low = new THREE.Vector3(-0.22, 1.0, 0.25);
  const back = new THREE.Vector3(-0.3, 1.6, -0.1);
  const out = new THREE.Vector3(-0.1, 1.45, 0.55);
  const down = new THREE.Vector3(-0.08, 1.15, 0.45);
  if (s < 0.55) return low.lerp(back, smooth((s - 0.2) / 0.35));
  if (s < TOSS.release) return back.lerp(out, smooth((s - 0.55) / (TOSS.release - 0.55)));
  return out.lerp(down, smooth((s - TOSS.release) / 0.3));
}

function blendPose(a: CameraPose, b: CameraPose, k: number): CameraPose {
  return { position: a.position.clone().lerp(b.position, k), look: a.look.clone().lerp(b.look, k) };
}

/** Where the camera stops in front of a tablet's screen, close enough that it fills the view, and the screen's middle. */
function closeUp(screen: THREE.Object3D) {
  const look = screen.getWorldPosition(new THREE.Vector3());
  const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(screen.getWorldQuaternion(new THREE.Quaternion()));
  return { position: look.clone().addScaledVector(facing, KIOSK_VIEW), look };
}

/** How far the following camera keeps off the player when it's up against a wall behind it, metres. */
const WALL_ROOM = 2;
const SIT_SECONDS = 1.1;
/** How far behind a player sitting at the bar the camera stays, metres. */
const SEATED_CAMERA_DISTANCE = 2.2;
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
    const view = layout.seatedView;
    if (view) {
      plan.zoomTo = {
        position: new THREE.Vector3(seatAt.x + toTable.x * view.ahead, view.y, seatAt.y + toTable.y * view.ahead),
        look: new THREE.Vector3(seatAt.x + toTable.x * view.lookAhead, view.lookY, seatAt.y + toTable.y * view.lookAhead),
      };
    } else {
      const look = seatAt.clone().lerp(new THREE.Vector2(cx, cz), 0.55);
      plan.zoomTo = {
        position: new THREE.Vector3(seatAt.x + toTable.x * 0.24, 1.62, seatAt.y + toTable.y * 0.24),
        look: new THREE.Vector3(look.x, 0.82, look.y),
      };
    }
  } else if (layout.screens?.length) {
    // Right up to the screen (or the shop's teller window), from the room's side of it.
    const screen = layout.screens[spot ?? 0] ?? layout.screens[0]!;
    const at = new THREE.Vector3(cx + screen.x, screen.y, cz + screen.z);
    const from = screen.from ?? { x: 0, z: 1 };
    const distance = screen.distance ?? 0.82;
    plan.zoomTo = {
      position: at.clone().add(new THREE.Vector3(from.x * distance, 0, from.z * distance)),
      look: screen.look ? new THREE.Vector3(cx + screen.look.x, screen.look.y, cz + screen.look.z) : at,
    };
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
 * Walking in (SRS-103.12), through the building's lobby (Lobby.tsx): the
 * player stands outside the glass front doors while they slide open, then
 * walks in along `points`. The camera holds inside the lobby facing them as
 * they come in while the front doors slide shut behind them, then orbits
 * round to behind them. They stop there, in the middle of the lobby, guest
 * or not. Any key or a click skips to the end.
 */
interface WalkIn {
  /** The walk, world metres. */
  points: THREE.Vector2[];
  length: number;
  /** How far into it the camera's moves are, metres: like `walked`, but carrying on past the end for SETTLE more. */
  progress: number;
  /** How far along it the player is, metres, and seconds since it began. */
  walked: number;
  t: number;
  skip: boolean;
  /** Where the first shot is taken from: inside the lobby, facing the front doors. */
  from: THREE.Vector3;
}

/** Seconds outside while the front doors open, then the walking pace, metres a second. */
const ENTER_WAIT = 1.2;
const ENTER_SPEED = 1.3;
/** How far in the first shot holds, metres. */
const ENTER_HOLD = 3.4;
/** After the player stops, how much further (metres, at walking pace) the camera takes to swing round behind them. */
const SETTLE = 2.2;

function planEntrance(): WalkIn {
  const points = entranceWalk().map((point) => new THREE.Vector2(...toWorld(point.x, point.y)));
  const length = points.slice(1).reduce((sum, point, i) => sum + point.distanceTo(points[i]!), 0);
  return { points, length, progress: 0, walked: 0, t: 0, skip: false, from: entranceShot(points[0]!.x) };
}

/** The walk in's first shot: inside the lobby, facing the building's front doors, from beside the carpet down the middle at `x`. */
function entranceShot(x: number) {
  return new THREE.Vector3(x + 1.7, 2.0, LOBBY_SOUTH_Z - 4.2);
}

/** How far open the building's front doors are `entry.progress` metres in: they slide open as the player stands outside, and shut once they're through. The casino's doors and the gate stay shut, and the lobby lit. */
function walkInDoors(entry: WalkIn) {
  return {
    front: smooth((entry.t - 0.25) / 1.1) * (1 - smooth((entry.progress - 4.4) / 1.3)),
    casino: 0,
    gate: 0,
    lit: 1,
    shown: true,
  };
}

/** Where the camera is, `entry.progress` metres in with the player `here`, ending where `follow` puts it. */
function walkInCamera(entry: WalkIn, here: THREE.Vector2, follow: Camera) {
  const s = entry.progress;
  const head = 1.45;
  // Through the front door and a few steps in, the first shot holds.
  if (s <= ENTER_HOLD) return entry.from.clone();
  // Then it orbits from the first shot round to behind them, where it
  // follows from: `across` metres away towards `yaw` (0 is behind them, as
  // they walk towards -z), and `up` metres above their head.
  const holdHere = alongWalk(entry.points, ENTER_HOLD).here;
  const startYaw = Math.atan2(entry.from.x - holdHere.x, entry.from.z - holdHere.y);
  const startAcross = Math.hypot(entry.from.x - holdHere.x, entry.from.z - holdHere.y);
  const k = smooth((s - ENTER_HOLD) / (entry.length + SETTLE - ENTER_HOLD));
  const yaw = THREE.MathUtils.lerp(startYaw, follow.yaw, k);
  const across = THREE.MathUtils.lerp(startAcross, Math.cos(follow.pitch) * follow.distance, k);
  const up = THREE.MathUtils.lerp(entry.from.y - head, Math.sin(follow.pitch) * follow.distance, k);
  return new THREE.Vector3(here.x + Math.sin(yaw) * across, head + up, here.y + Math.cos(yaw) * across);
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

/**
 * Leaving through the casino's doors (SRS-105.5): the player turns to the
 * doors as they swing open and walks out through them into the middle of the
 * lobby, then turns round to watch them shut. After logging out on the
 * profile (SRS-105.6) the walk starts wherever they were on the floor, the
 * way round anything in the way, through the gate. The camera swings round behind
 * them from wherever it was, follows them through the doorway (a little to
 * one side, inside it), and once they're in the lobby swings round them,
 * between them and the fountain, to behind them, where it follows from — as
 * the doors shut. Then they're a guest in the lobby. Any key or a click
 * skips it, and with reduced motion it starts skipped.
 */
interface WalkOut {
  /** The walk, world metres, and how far along it the casino's doors are. */
  points: THREE.Vector2[];
  length: number;
  doors: number;
  /** How far into it the camera's moves are, metres: like `walked`, but carrying on past the end for EXIT_SETTLE more. */
  progress: number;
  /** How far along it the player is, metres, and seconds since it began. */
  walked: number;
  t: number;
  skip: boolean;
  /** Where the camera was when it began, around the player: it swings round from there. */
  start: { yaw: number; across: number; up: number };
}

/** Seconds turning to the casino's doors as they start to open. */
const EXIT_WAIT = 0.6;
/** After they stop in the lobby, how much further (metres, at walking pace) the camera takes to swing round behind them. */
const EXIT_SETTLE = 4.0;
/** Behind them as they walk out (towards +z), a little to one side so it goes through the doorway inside it. */
const EXIT_BEHIND = { x: 0.9, z: -3.0, up: 1.3 };

function planExit(from: Point, camera: THREE.Vector3, atOnce: boolean): WalkOut {
  const points = exitWalk(from).map((point) => new THREE.Vector2(...toWorld(point.x, point.y)));
  const legs = points.slice(1).map((point, i) => point.distanceTo(points[i]!));
  const upTo = (n: number) => legs.slice(0, n).reduce((sum, leg) => sum + leg, 0);
  const here = points[0]!;
  return {
    points,
    length: upTo(legs.length),
    doors: upTo(legs.length - 1),
    progress: 0,
    walked: 0,
    t: 0,
    skip: atOnce,
    start: {
      yaw: Math.atan2(camera.x - here.x, camera.z - here.y),
      across: Math.hypot(camera.x - here.x, camera.z - here.y),
      up: camera.y - 1.45,
    },
  };
}

/** How far open the casino's doors are, and how bright the lobby is, on the walk out. */
function walkOutDoors(out: WalkOut) {
  // The casino's doors open as the player turns to them (or, from further
  // off on the floor, as they come up to them), letting the lobby's light
  // in, and shut once they're in the lobby and the camera's clear.
  const opened = smooth((out.t - 0.15) / 1.3) * smooth((out.progress - (out.doors - 3.5)) / 1.3);
  const shut = 1 - smooth((out.progress - (out.length + 1.6)) / 1.6);
  return {
    casino: out.skip ? 0 : opened * shut,
    lit: out.skip ? 1 : opened,
    front: 0,
    shown: true,
  };
}

/** Where the camera is on the walk out, with the player `here`, ending where `follow` puts it. */
function walkOutCamera(out: WalkOut, here: THREE.Vector2, follow: Camera) {
  const head = 1.45;
  const behindYaw = Math.atan2(EXIT_BEHIND.x, EXIT_BEHIND.z);
  const behindAcross = Math.hypot(EXIT_BEHIND.x, EXIT_BEHIND.z);
  let yaw: number;
  let across: number;
  let up: number;
  if (out.progress <= out.length) {
    // First it swings round behind them from wherever it was, the shorter way round, then follows.
    const k = smooth(out.t / 1.6);
    const turn = Math.atan2(Math.sin(behindYaw - out.start.yaw), Math.cos(behindYaw - out.start.yaw));
    yaw = out.start.yaw + turn * k;
    across = THREE.MathUtils.lerp(out.start.across, behindAcross, k);
    up = THREE.MathUtils.lerp(out.start.up, EXIT_BEHIND.up, k);
  } else {
    // In the lobby, it swings round them, coming in closer half way so it
    // passes between them and the fountain, to behind them as they face the doors.
    const k = smooth((out.progress - out.length) / EXIT_SETTLE);
    yaw = THREE.MathUtils.lerp(behindYaw, follow.yaw, k);
    across = THREE.MathUtils.lerp(behindAcross, Math.cos(follow.pitch) * follow.distance, k) - Math.sin(Math.PI * k);
    up = THREE.MathUtils.lerp(EXIT_BEHIND.up, Math.sin(follow.pitch) * follow.distance, k);
  }
  const position = new THREE.Vector3(here.x + Math.sin(yaw) * across, head + up, here.y + Math.cos(yaw) * across);
  if (position.z > LOBBY_NORTH_Z) {
    position.x = THREE.MathUtils.clamp(position.x, LOBBY_X - LOBBY_HALF_WIDTH + 0.4, LOBBY_X + LOBBY_HALF_WIDTH - 0.4);
    position.y = Math.min(position.y, LOBBY_HEIGHT - 0.4);
  } else {
    const halfW = (COLS / 2 - 1.3) * TILE_M;
    position.x = THREE.MathUtils.clamp(position.x, -halfW, halfW);
    position.y = THREE.MathUtils.clamp(position.y, 0.6, WALL_HEIGHT - 0.3);
    // (Walking out from the back of the room, SRS-105.6, it stays inside the back wall.)
    position.z = Math.max(position.z, (2 - ROWS / 2) * TILE_M + 0.4);
  }
  return position;
}

function Player({
  start,
  startHeading,
  onSpot,
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
  walkOut,
  onLeft,
  onNearDoors,
  kiosk,
  kioskScreens,
  onAtKiosk,
  onNearKiosk,
  onNearFountain,
  coinToss,
  coinFx,
  onTossed,
  member,
  drink,
  glassFx,
  onBarSeated,
  onSip,
  onDrinkDone,
  drunk,
}: {
  /** Where the player starts, in tiles (the middle of the start tile, if not given), and the way they face (into the room). */
  start?: Point;
  startHeading?: number;
  onSpot?: (spot: StoodSpot) => void;
  input: MutableRefObject<WalkInput>;
  onNear: (near: NearSpot) => void;
  path: MutableRefObject<Point[]>;
  camera: MutableRefObject<Camera>;
  tile: MutableRefObject<Point>;
  /** Set to start taking a seat; Player plans and plays it. */
  seating: MutableRefObject<{ object: FloorObject; spot: number | null } | Seating | null>;
  onSeated: (object: FloorObject, spot: number | null) => void;
  onStood?: () => void;
  /** The walk in (SRS-103.12), while it plays, and the lobby it plays in. */
  walkIn: MutableRefObject<WalkIn | null>;
  lobby: MutableRefObject<LobbyState>;
  onEntered?: () => void;
  /** The walk out through the casino's doors (SRS-105.5): 'asked' (or 'asked at once', skipped from the start) until Player plans it from where the player is. */
  walkOut: MutableRefObject<WalkOut | 'asked' | 'asked at once' | null>;
  onLeft?: () => void;
  onNearDoors: (near: DoorsSide) => void;
  /** Checking in at a front-desk tablet (SRS-103.13), while it plays. */
  kiosk: MutableRefObject<KioskVisit | null>;
  /** The tablets' screens, which the camera flies up to (there once the lobby's drawn). */
  kioskScreens: MutableRefObject<(THREE.Object3D | null)[]>;
  onAtKiosk?: () => void;
  onNearKiosk: (kiosk: number | null) => void;
  onNearFountain: (near: boolean) => void;
  /** Tossing a coin into the fountain (SRS-129.4): 'asked' (or 'asked at once', skipped from the start) until Player plans it; and the coin it moves. */
  coinToss: MutableRefObject<CoinTossPlan | 'asked' | 'asked at once' | null>;
  coinFx: MutableRefObject<CoinFx>;
  onTossed?: (spot: { x: number; z: number }) => void;
  /** Logged in: the casino's doors open for them from the lobby (SRS-103.17). */
  member: boolean;
  /** A drink at the bar: 'asked' (or 'asked at once') until Player starts it; and the glass it moves. */
  drink: MutableRefObject<DrinkPlan | 'asked' | 'asked at once' | null>;
  glassFx: MutableRefObject<GlassFx>;
  onBarSeated?: (seated: boolean) => void;
  onSip?: () => void;
  onDrinkDone?: () => void;
  /** How sloshed they are (maxed out on drinks), 0 to 1: they stumble now and then as they walk, and sway. */
  drunk: MutableRefObject<number>;
}) {
  const body = useRef<THREE.Group>(null);
  const motion = useRef<Motion>({ speed: 0 });
  const seat = useRef<SeatPose>({ amount: 0, handsY: 0.85, handsZ: 0.4 });
  const tossPose = useRef<TossPose>({ amount: 0, hand: new THREE.Vector3(), at: new THREE.Vector3(), head: new THREE.Vector3(), headTop: new THREE.Vector3(), lookUp: 0, gripAt: new THREE.Vector3() });

  /**
   * A drink at the bar, sat on the stool: the glass fills on the counter,
   * then each sip the right arm reaches for it, lifts it to the mouth and
   * tips it back (the drink going down, the meter going up as `onSip`),
   * then puts it back. The arm is the coin toss's (`tossPose`).
   */
  function stepDrink(plan: DrinkPlan, delta: number) {
    const holder = body.current;
    const fx = glassFx.current;
    if (!holder) return;
    holder.updateMatrixWorld(true);
    const counterY = seat.current.handsY;
    const onCounter = holder.localToWorld(GLASS_ON_COUNTER.clone().setY(counterY));
    fx.shown = true;
    fx.heading = heading.current;
    fx.tilt = 0;
    if (plan.atOnce) {
      for (; plan.sips < SIPS_PER_DRINK; plan.sips++) onSip?.();
      fx.position.copy(onCounter);
      fx.fill = 0;
      tossPose.current.amount = 0;
      tossPose.current.lookUp = 0;
      tossPose.current.elbow = undefined;
      tossPose.current.grip = null;
      tossPose.current.afterPose = undefined;
      drink.current = null;
      onDrinkDone?.();
      return;
    }
    plan.s += delta;
    if (plan.s < POUR_SECONDS) {
      fx.position.copy(onCounter);
      fx.fill = smooth(plan.s / POUR_SECONDS);
      tossPose.current.amount = 0;
      return;
    }
    const into = plan.s - POUR_SECONDS;
    const sip = Math.min(SIPS_PER_DRINK - 1, Math.floor(into / SIP.end));
    const u = into - sip * SIP.end;
    // Sips taken, as the meter has them: one as each comes down from its deepest.
    while (plan.sips < Math.min(SIPS_PER_DRINK, sip + (u >= SIP.drink ? 1 : 0))) {
      plan.sips++;
      onSip?.();
    }
    // The drink: down a sip's worth while it's tipped back.
    const drunk = sip + Math.min(1, Math.max(0, (u - SIP.lift) / (SIP.drink - SIP.lift)));
    fx.fill = 1 - drunk / SIPS_PER_DRINK;
    // The mouth, in their own space, from where Person put the head last frame.
    const pose = tossPose.current;
    let mouth = new THREE.Vector3(0, 1.4, 0.12);
    if (pose.head && pose.headTop && pose.head.lengthSq() > 0 && pose.headTop.lengthSq() > 0) {
      const neck = holder.worldToLocal(pose.head.clone());
      const top = holder.worldToLocal(pose.headTop.clone());
      mouth = neck.lerp(top, MOUTH_UP).add(new THREE.Vector3(0, 0, MOUTH_AHEAD));
    }
    // How far the glass is lifted (0 on the counter, 1 at the lips), tipped, and the arm's blend.
    let lift = 0;
    let arm = 1;
    let tilt = 0;
    let headBack = 0;
    if (u < SIP.reach) arm = smooth(u / SIP.reach);
    else if (u < SIP.lift) {
      lift = smooth((u - SIP.reach) / (SIP.lift - SIP.reach));
      tilt = lift * SIP_TILT;
      headBack = lift * HEAD_BACK;
    } else if (u < SIP.drink) {
      lift = 1;
      const deep = Math.sin(Math.PI * Math.min(1, ((u - SIP.lift) / (SIP.drink - SIP.lift)) * 1.1));
      tilt = SIP_TILT + (SIP_TILT_DEEP - SIP_TILT) * deep;
      headBack = HEAD_BACK + (HEAD_BACK_DEEP - HEAD_BACK) * deep;
    } else if (u < SIP.lower) {
      lift = 1 - smooth((u - SIP.drink) / (SIP.lower - SIP.drink));
      tilt = lift * SIP_TILT;
      headBack = lift * HEAD_BACK;
    } else arm = 1 - smooth((u - SIP.lower) / (SIP.end - SIP.lower));
    // Where the glass should be: from the counter up to the lips, its near
    // rim on them once it's there, tipped back.
    const counterBase = GLASS_ON_COUNTER.clone().setY(counterY);
    const wanted = counterBase.clone().lerp(baseFromMouth(mouth, tilt), lift);
    // The hand goes round it there (Person does the grip), and turns with it.
    pose.amount = arm;
    pose.grip = {
      middle: glassMiddle(wanted, tilt),
      up: new THREE.Vector3(0, Math.cos(tilt), -Math.sin(tilt)),
      forward: new THREE.Vector3(0, Math.sin(tilt), Math.cos(tilt)),
      radius: GLASS_RADIUS,
    };
    pose.lookUp = headBack;
    pose.elbow = DRINK_ELBOW;
    // The glass itself: on the counter until it's picked up, then in the
    // hand, wherever the hand really got to last frame (so they never part).
    // (Placed once Person has posed the hand this frame, so it doesn't lag a frame behind.)
    const held = lift > 0 ? smooth(Math.min(1, lift / 0.15)) : 0;
    fx.position.copy(holder.localToWorld(wanted.clone()));
    pose.afterPose = () => {
      if (held <= 0 || !pose.gripAt || pose.gripAt.lengthSq() === 0) return;
      const inHand = holder.worldToLocal(pose.gripAt.clone()).sub(glassMiddle(new THREE.Vector3(), tilt));
      fx.position.copy(holder.localToWorld(wanted.clone().lerp(inHand, held)));
      fx.redraw?.();
    };
    fx.tilt = tilt;
    if (into >= SIPS_PER_DRINK * SIP.end) {
      // Finished: the empty glass stays on the counter.
      tossPose.current.amount = 0;
      tossPose.current.lookUp = 0;
      tossPose.current.elbow = undefined;
      tossPose.current.grip = null;
      tossPose.current.afterPose = undefined;
      fx.position.copy(onCounter);
      fx.tilt = 0;
      fx.fill = 0;
      drink.current = null;
      onDrinkDone?.();
    }
  }
  /** Getting up from the stool: the drink's left (what's been sipped counts) and the glass is cleared away. */
  function stopDrink() {
    if (drink.current) {
      drink.current = null;
      onDrinkDone?.();
    }
    tossPose.current.amount = 0;
    tossPose.current.lookUp = 0;
    tossPose.current.elbow = undefined;
    tossPose.current.grip = null;
    tossPose.current.afterPose = undefined;
    glassFx.current.shown = false;
  }
  // Position in tiles (the middle of the start tile), and the way they face.
  const position = useRef<Point>(start ?? { x: START.x + 0.5, y: START.y + 0.5 });
  // The camera's put straight into place the first time it follows, rather
  // than easing in from wherever it began (from the floor into the lobby, say).
  const placed = useRef(false);
  const heading = useRef(startHeading ?? Math.PI);
  // Where they stand while it's theirs to walk, reported every half second
  // or so (when it's changed), and once more as the page closes.
  const stood = useRef<StoodSpot | null>(null);
  const sinceReport = useRef(0);
  useEffect(
    () => () => {
      if (stood.current) onSpot?.(stood.current);
    },
    [onSpot]
  );
  const lookAt = useRef(new THREE.Vector3());
  const near = useRef<NearSpot>({ object: null, spot: null });
  const nearDoors = useRef<DoorsSide>(null);
  const nearKiosk = useRef<number | null>(null);
  const nearFountain = useRef(false);
  // The casino's doors as a logged-in player walks in through them from the
  // lobby (SRS-103.17), 0 shut to 1 open; and whether they've just come in,
  // so they aren't offered the way out until they've stepped away from the
  // doors and come back to them.
  const casinoDoors = useRef(0);
  const justIn = useRef(false);
  const { camera: view } = useThree();

  // Stumbling now and then, maxed out on drinks, and swaying a little.
  const stumble = useRef(noStumble());
  const swayTime = useRef(0);
  useFrame((_, rawDelta) => {
    // Capped, so a slow computer still walks at about the right speed.
    const delta = Math.min(rawDelta, 0.25);
    // Upright, unless walking about drunk (below) leans them.
    if (body.current) body.current.rotation.z = 0;
    const turnTowards = (target: number, rate: number) => {
      let turn = target - heading.current;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      heading.current += turn * Math.min(1, delta * rate);
      return Math.abs(turn);
    };

    // Walking in (SRS-103.12): the player isn't steered, the walk plays
    // out; any key (or a click, see Floor) skips to the end.
    const entry = walkIn.current;
    if (entry) {
      const keys = input.current;
      if (keys.forward || keys.back || keys.left || keys.right) entry.skip = true;
      entry.t += delta;
      const end = entry.length + SETTLE;
      if (entry.skip) {
        entry.progress = end;
      } else if (entry.t > ENTER_WAIT) {
        entry.progress = Math.min(end, entry.progress + ENTER_SPEED * delta);
      }
      entry.walked = Math.min(entry.length, entry.progress);
      const walking = entry.t > ENTER_WAIT && entry.walked < entry.length;
      const { here, heading: way } = alongWalk(entry.points, entry.walked);
      motion.current.speed = walking ? ENTER_SPEED : 0;
      if (walking) turnTowards(way, 10);
      position.current = { x: here.x / TILE_M + COLS / 2, y: here.y / TILE_M + ROWS / 2 };
      if (body.current) {
        body.current.position.set(here.x, 0, here.y);
        body.current.rotation.y = heading.current;
      }
      Object.assign(lobby.current, walkInDoors(entry));
      view.position.copy(walkInCamera(entry, here, camera.current));
      lookAt.current.set(here.x, 1.45, here.y);
      view.lookAt(lookAt.current);
      if (entry.progress >= end) {
        // In the middle of the lobby, facing the casino's doors, with the
        // camera behind them: walking is theirs.
        heading.current = Math.PI;
        if (body.current) body.current.rotation.y = heading.current;
        motion.current.speed = 0;
        walkIn.current = null;
        tile.current = { x: Math.floor(position.current.x), y: Math.floor(position.current.y) };
        onEntered?.();
      }
      return;
    }

    // Leaving through the casino's doors (SRS-105.5): the player isn't
    // steered, the walk out plays out; a key or a click (see Floor) skips it.
    let out = walkOut.current;
    if (out === 'asked' || out === 'asked at once') {
      // The camera's to end up behind them facing the casino's doors, whichever way it was turned.
      camera.current.yaw = 0;
      out = planExit(position.current, view.position, out === 'asked at once');
      walkOut.current = out;
      path.current = [];
    }
    if (out) {
      out.t += delta;
      const end = out.length + EXIT_SETTLE;
      if (out.skip) out.progress = end;
      else if (out.t > EXIT_WAIT) out.progress = Math.min(end, out.progress + ENTER_SPEED * delta);
      out.walked = Math.min(out.length, out.progress);
      const walking = out.t > EXIT_WAIT && out.walked < out.length;
      const { here, heading: way } = alongWalk(out.points, out.walked);
      motion.current.speed = walking ? ENTER_SPEED : 0;
      if (out.walked < out.length) turnTowards(way, walking ? 10 : 6);
      // In the lobby, they turn round to watch the doors shut.
      else if (out.skip) heading.current = Math.PI;
      else turnTowards(Math.PI, 3);
      position.current = { x: here.x / TILE_M + COLS / 2, y: here.y / TILE_M + ROWS / 2 };
      if (body.current) {
        body.current.position.set(here.x, 0, here.y);
        body.current.rotation.y = heading.current;
      }
      Object.assign(lobby.current, walkOutDoors(out));
      view.position.copy(walkOutCamera(out, here, camera.current));
      lookAt.current.set(here.x, 1.45, here.y);
      view.lookAt(lookAt.current);
      if (out.progress >= end) {
        // A guest in the lobby now, facing the doors, with the camera behind them.
        heading.current = Math.PI;
        if (body.current) body.current.rotation.y = heading.current;
        motion.current.speed = 0;
        walkOut.current = null;
        tile.current = { x: Math.floor(position.current.x), y: Math.floor(position.current.y) };
        onLeft?.();
      }
      return;
    }

    // Checking in at a tablet (SRS-103.13): walking to the desk first if
    // they used the casino's doors (SRS-103.15), then the camera flies in,
    // holds while the tablet's up close, and flies back out.
    const visit = kiosk.current;
    if (visit?.stage === 'walk') {
      if (!visit.walk) {
        const route = deskWalk(position.current);
        const points = (route?.points ?? [position.current]).map((point) => new THREE.Vector2(...toWorld(point.x, point.y)));
        visit.kiosk = route?.kiosk ?? 0;
        visit.walk = { points, length: points.slice(1).reduce((sum, point, i) => sum + point.distanceTo(points[i]!), 0), walked: 0 };
        path.current = [];
      }
      const walk = visit.walk;
      walk.walked = visit.skip ? walk.length : Math.min(walk.length, walk.walked + ENTER_SPEED * delta);
      const { here, heading: way } = alongWalk(walk.points, walk.walked);
      const walking = walk.walked < walk.length;
      motion.current.speed = walking ? ENTER_SPEED : 0;
      if (walking) turnTowards(way, 10);
      // The camera swings round behind them as they go.
      const behind = heading.current + Math.PI - camera.current.yaw;
      camera.current.yaw += Math.atan2(Math.sin(behind), Math.cos(behind)) * Math.min(1, delta * 1.5);
      position.current = { x: here.x / TILE_M + COLS / 2, y: here.y / TILE_M + ROWS / 2 };
      tile.current = { x: Math.floor(position.current.x), y: Math.floor(position.current.y) };
      if (body.current) {
        body.current.position.set(here.x, 0, here.y);
        body.current.rotation.y = heading.current;
      }
      followWith(here.x, here.y, 1.45, delta);
      if (!walking) {
        // At the tablet, away from the doors: on to flying in. The camera's
        // orbit is set to end up behind them facing it, so stepping away
        // pulls back to there however the walk went.
        const tablet = kioskScreens.current[visit.kiosk]?.getWorldPosition(new THREE.Vector3());
        if (tablet) camera.current.yaw = Math.atan2(tablet.x - here.x, tablet.z - here.y) + Math.PI;
        visit.stage = 'in';
        visit.t = 0;
        visit.skip = visit.atOnce;
        nearDoors.current = null;
        onNearDoors(null);
        nearKiosk.current = visit.kiosk;
        onNearKiosk(visit.kiosk);
      }
      return;
    }
    if (visit) {
      // (The tablets are there once the lobby's drawn; until then, it waits.)
      const screen = kioskScreens.current[visit.kiosk];
      if (!screen) return;
      visit.t += delta;
      motion.current.speed = 0;
      const [wx, wz] = toWorld(position.current.x, position.current.y);
      const to = closeUp(screen);
      if (visit.stage === 'in') {
        turnTowards(Math.atan2(to.look.x - wx, to.look.z - wz), 8);
        if (!visit.from) visit.from = { position: view.position.clone(), look: lookAt.current.clone() };
        const k = visit.skip ? 1 : smooth(visit.t / KIOSK_SECONDS);
        view.position.lerpVectors(visit.from.position, to.position, k);
        lookAt.current.lerpVectors(visit.from.look, to.look, k);
        view.lookAt(lookAt.current);
        if (k >= 1) {
          visit.stage = 'open';
          onAtKiosk?.();
        }
      } else if (visit.stage === 'out') {
        const pose = followPose(wx, wz, 1.45);
        const k = visit.skip ? 1 : smooth(visit.t / KIOSK_SECONDS);
        view.position.lerpVectors(to.position, pose.position, k);
        lookAt.current.lerpVectors(to.look, pose.look, k);
        view.lookAt(lookAt.current);
        if (k >= 1) kiosk.current = null;
      }
      if (body.current) {
        body.current.position.set(wx, 0, wz);
        body.current.rotation.y = heading.current;
      }
      return;
    }

    // Tossing a coin into the fountain (SRS-129.4): the player isn't
    // steered, the toss plays out; a key or a click (see Floor) skips it.
    let toss = coinToss.current;
    if (toss === 'asked' || toss === 'asked at once') {
      toss = planToss(position.current, { position: view.position, look: lookAt.current }, toss === 'asked at once');
      coinToss.current = toss;
      path.current = [];
      // The camera's to end up behind them, facing the fountain.
      camera.current.yaw = Math.atan2(-toss.ahead.x, -toss.ahead.z);
    }
    if (toss) {
      toss.s = toss.skip ? TOSS.end : Math.min(TOSS.end, toss.s + delta * tossRate(toss.s));
      const s = toss.s;
      const [wx, wz] = toWorld(position.current.x, position.current.y);
      motion.current.speed = 0;
      turnTowards(Math.atan2(toss.ahead.x, toss.ahead.z), 8);
      if (body.current) {
        body.current.position.set(wx, 0, wz);
        body.current.rotation.y = heading.current;
      }
      // The arm: in from the clips' pose as they wind up, back out after the throw.
      tossPose.current.amount = smooth((s - 0.15) / 0.15) * (1 - smooth((s - 0.9) / 0.4));
      tossPose.current.hand.copy(tossArm(s));

      // The coin: in their hand, then through the air, into the water, down to the bottom.
      const fx = coinFx.current;
      fx.tilt = 0;
      if (s < TOSS.release) {
        fx.shown = s > 0.2;
        fx.position.copy(tossPose.current.at);
        fx.spin = 0;
        fx.under = 0;
        fx.splashAt = null;
        fx.resting = false;
      } else if (s < TOSS.landed) {
        if (!toss.release) toss.release = tossPose.current.at.clone();
        const u = (s - TOSS.release) / (TOSS.landed - TOSS.release);
        fx.shown = true;
        fx.position.lerpVectors(toss.release, toss.land, u);
        fx.position.y += 4 * TOSS_ARC * u * (1 - u);
        fx.spin = u * TOSS_FLIPS * Math.PI * 2;
      } else {
        const k = smooth((s - TOSS.landed) / (TOSS.sunk - TOSS.landed));
        fx.shown = true;
        fx.splashAt = toss.land;
        fx.splash = THREE.MathUtils.clamp((s - TOSS.landed) / (TOSS.splashed - TOSS.landed), 0, 1);
        fx.position.lerpVectors(toss.land, toss.rest, k);
        fx.spin = TOSS_FLIPS * Math.PI * 2;
        // Rocking as it sinks, less and less.
        fx.tilt = 0.45 * (1 - k) * Math.sin(s * 9);
        fx.under = k;
        fx.resting = s >= TOSS.sunk;
      }

      // The camera: over their shoulder, then close up on the coin, then
      // looking down at it in the water, then slowly back behind them.
      const follow = followPose(wx, wz, 1.45);
      const shoulder: CameraPose = {
        position: new THREE.Vector3(wx, 1.75, wz).addScaledVector(toss.ahead, -1.6).addScaledVector(toss.right, 0.6),
        look: toss.land.clone().setY(0.75),
      };
      const onCoin: CameraPose = {
        position: fx.position.clone().addScaledVector(toss.ahead, -0.3).addScaledVector(toss.right, 0.32).add(new THREE.Vector3(0, 0.12, 0)),
        look: fx.position.clone(),
      };
      let pose: CameraPose;
      if (s < TOSS.release) {
        pose = blendPose(toss.from, shoulder, smooth(s / 0.7));
      } else if (s < TOSS.landed) {
        // Onto the coin as it leaves the hand, then, as it comes down, up over the water to see it go in.
        const u = (s - TOSS.release) / (TOSS.landed - TOSS.release);
        pose = blendPose(blendPose(shoulder, onCoin, smooth(u / 0.3)), toss.splashView, smooth((u - 0.6) / 0.4));
      } else {
        if (s < TOSS.splashed) pose = toss.splashView;
        else if (s < TOSS.held) pose = blendPose(toss.splashView, { position: toss.bottomView.position, look: fx.position }, smooth((s - TOSS.splashed) / 0.7));
        else pose = blendPose(toss.bottomView, follow, smooth((s - TOSS.held) / (TOSS.end - TOSS.held)));
      }
      view.position.copy(pose.position);
      lookAt.current.copy(pose.look);
      view.lookAt(lookAt.current);
      if (s >= TOSS.end) {
        coinToss.current = null;
        tossPose.current.amount = 0;
        onTossed?.(toss.spot);
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
          seat.current = { amount: 1, handsY: plan.seatedHands.y, handsZ: plan.seatedHands.z, hipY: plan.seatedHands.hipY };
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
          seat.current.hipY = plan.seatedHands.hipY;
        }
      } else if (plan.stage === 'sit' && plan.approach && plan.seatAt) {
        const k = smooth(plan.t / SIT_SECONDS);
        heading.current = plan.facing;
        here.copy(plan.approach).lerp(plan.seatAt, k);
        seat.current.amount = k;
        if (plan.t >= SIT_SECONDS) {
          plan.t = 0;
          if (plan.object.interactive?.lounge) {
            // Staying a while: swing the camera round behind them, lower and
            // closer (the slot machines are just behind the stools), so the
            // TVs over the bar fill the view. Getting up puts the distance back.
            plan.stage = 'seated';
            onBarSeated?.(true);
            plan.cameraDistance = camera.current.distance;
            camera.current.yaw = plan.facing + Math.PI;
            camera.current.pitch = 0.2;
            camera.current.distance = Math.min(camera.current.distance, SEATED_CAMERA_DISTANCE);
          } else {
            plan.stage = 'zoom';
          }
        }
      } else if (plan.stage === 'seated' && plan.seatAt) {
        here.copy(plan.seatAt);
        heading.current = plan.facing;
        const keys = input.current;
        let order = drink.current;
        if (order === 'asked' || order === 'asked at once') {
          order = { s: 0, sips: 0, atOnce: order === 'asked at once' };
          drink.current = order;
        }
        if (body.current) {
          body.current.position.set(here.x, 0, here.y);
          body.current.rotation.y = heading.current;
        }
        if (order) stepDrink(order, delta);
        if (keys.forward || keys.back || keys.left || keys.right || keys.getUp) {
          // Getting up: the same as after a game, minus the camera pulling
          // back (it's already behind them).
          keys.getUp = false;
          stopDrink();
          onBarSeated?.(false);
          if (plan.cameraDistance !== undefined) camera.current.distance = plan.cameraDistance;
          plan.stage = 'stand';
          plan.t = 0;
          plan.zoomFrom = { position: view.position.clone(), look: lookAt.current.clone() };
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
      // Sitting at the bar, the camera looks up over their shoulder at the TVs.
      followWith(here.x, here.y, plan.stage === 'seated' ? 1.7 : 1.45 - seat.current.amount * 0.4, delta);
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

    // Drunk: now and then a lurch to one side as they walk, slowing them,
    // without turning them from the way they meant to go.
    const meant = Math.hypot(move.x, move.y) > 1e-6 ? Math.atan2(move.x, move.y) : null;
    const reel = stepStumble(stumble.current, delta, meant !== null, drunk.current);
    stumble.current = reel.state;
    if (reel.push !== 0) {
      const across = heading.current;
      move = {
        x: move.x * reel.keep + Math.cos(across) * reel.push * STUMBLE_SPEED * delta,
        y: move.y * reel.keep - Math.sin(across) * reel.push * STUMBLE_SPEED * delta,
      };
    }

    const before = position.current;
    const after = moveWithCollisions(before, { x: move.x / TILE_M, y: move.y / TILE_M }, undefined, member && casinoDoors.current >= CASINO_DOORS_PASSABLE);
    position.current = after;
    tile.current = { x: Math.floor(after.x), y: Math.floor(after.y) };
    const moved = Math.hypot(after.x - before.x, after.y - before.y) * TILE_M;
    motion.current.speed = moved / Math.max(delta, 1e-6);

    // The casino's doors open for a logged-in player coming up to them from
    // the lobby, and shut once they and the camera are through (SRS-103.17);
    // the lobby's lights fade as they shut, and it's hidden once they have.
    casinoDoors.current = member ? stepCasinoDoors(casinoDoors.current, after, { x: after.x - before.x, y: after.y - before.y }, delta, view.position.z < FRONT_WALL_Z - 0.1) : 0;
    const opened = smooth(casinoDoors.current);
    lobby.current.casino = opened;
    lobby.current.lit = isInLobby(after) ? 1 : opened;
    lobby.current.shown = isInLobby(after) || opened > 0;
    const doorsOpening = casinoDoors.current > 0 && casinoDoors.current < 1;

    if (moved > 1e-4) {
      // Turn to face the way they walk, smoothly.
      turnTowards(meant ?? Math.atan2(after.x - before.x, after.y - before.y), 12);
    } else if (path.current.length > 0 && !(forward || sideways) && !doorsOpening) {
      // Stuck on something (not just the casino's doors, still opening): give up on the walk.
      path.current = [];
    }

    const [wx, wz] = toWorld(after.x, after.y);
    swayTime.current += delta;
    if (body.current) {
      body.current.position.set(wx, 0, wz);
      body.current.rotation.y = heading.current;
      // Leaning into a stumble, and swaying gently while drunk.
      body.current.rotation.z = reel.lean + drunk.current * 0.04 * Math.sin(swayTime.current * 1.5);
    }

    // The game in reach, and its chair (or screen) nearest the player.
    const object = nearbyObjectAt(after);
    const spot = object ? nearestChair(object, after) ?? nearestScreen(object, after) : null;
    if (object !== near.current.object || spot !== near.current.spot) {
      near.current = { object, spot };
      onNear(near.current);
    }
    // In reach of the casino's doors, from the foyer (SRS-105.5) or the lobby
    // (SRS-103.15); not from the foyer just after walking in through them.
    if (casinoDoors.current > 0 && !isInLobby(after)) justIn.current = true;
    else if (!atCasinoDoors(after)) justIn.current = false;
    const doors: DoorsSide = atCasinoDoors(after) ? (justIn.current ? null : 'floor') : atCasinoDoorsFromLobby(after) ? 'lobby' : null;
    if (doors !== nearDoors.current) {
      nearDoors.current = doors;
      onNearDoors(doors);
    }
    // In reach of a check-in tablet, in the lobby (SRS-103.13).
    const tablet = atKiosk(after);
    if (tablet !== nearKiosk.current) {
      nearKiosk.current = tablet;
      onNearKiosk(tablet);
    }
    // In reach of the fountain, in the lobby (SRS-129.1).
    const fountain = atFountain(after);
    if (fountain !== nearFountain.current) {
      nearFountain.current = fountain;
      onNearFountain(fountain);
    }

    // Remembered for coming back to the page (SRS-107.7).
    const here = { x: after.x, y: after.y, heading: heading.current, yaw: camera.current.yaw };
    const last = stood.current;
    const changed = !last || Math.hypot(here.x - last.x, here.y - last.y) > 0.05 || Math.abs(here.heading - last.heading) > 0.05 || Math.abs(here.yaw - last.yaw) > 0.05;
    sinceReport.current += delta;
    if (changed && sinceReport.current > 0.5) {
      stood.current = here;
      sinceReport.current = 0;
      onSpot?.(here);
    } else if (!last) {
      stood.current = here;
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
    const [minX] = toWorld(LEFT_WALL + 0.3, 0);
    const [maxX] = toWorld(RIGHT_WALL - 0.3, 0);
    const back = (2 - ROWS / 2) * TILE_M + 0.4;
    if (casinoDoors.current > 0) {
      // While the casino's doors are open for them (SRS-103.17), it stays
      // behind them on either side of the wall, in line with the doorway, so
      // it follows them through it rather than through the wall (and the
      // doors shut once it's through).
      const room = CASINO_DOOR_HALF - 0.35;
      position.x = THREE.MathUtils.clamp(position.x, LOBBY_X - room, LOBBY_X + room);
      position.z = THREE.MathUtils.clamp(position.z, back, LOBBY_SOUTH_Z - 0.4);
      position.y = THREE.MathUtils.clamp(position.y, 0.6, CASINO_DOOR_HEIGHT - 0.4);
      return { position, look };
    }
    // Walking towards it, up against the wall at the end it's limited by,
    // it slides along the wall to one side, keeping at least WALL_ROOM metres
    // off, rather than ending up right overhead.
    const slideAlong = (limit: number, room: number) => {
      if (room >= WALL_ROOM) return;
      const side = position.x >= wx ? 1 : -1;
      const slide = Math.sqrt(WALL_ROOM ** 2 - Math.max(0, room) ** 2);
      position.x = wx + side * Math.max(Math.abs(position.x - wx), slide);
      position.z = limit;
    };
    if (wz > FRONT_WALL_Z) {
      // In the lobby: kept inside its walls and under its ceiling.
      const near = FRONT_WALL_Z + 0.5;
      const far = LOBBY_SOUTH_Z - 0.4;
      if (position.z > far) slideAlong(far, far - wz);
      else if (position.z < near) slideAlong(near, wz - near);
      position.x = THREE.MathUtils.clamp(position.x, LOBBY_X - LOBBY_HALF_WIDTH + 0.4, LOBBY_X + LOBBY_HALF_WIDTH - 0.4);
      position.z = THREE.MathUtils.clamp(position.z, near, far);
      position.y = THREE.MathUtils.clamp(position.y, 0.6, LOBBY_HEIGHT - 0.4);
      return { position, look };
    }
    const front = FRONT_WALL_Z - 0.4;
    // (In the foyer, against the casino's front wall.)
    if (position.z > front) slideAlong(front, front - wz);
    position.x = THREE.MathUtils.clamp(position.x, minX, maxX);
    position.z = THREE.MathUtils.clamp(position.z, back, front);
    position.y = THREE.MathUtils.clamp(position.y, 0.6, WALL_HEIGHT - 0.3);
    return { position, look };
  }

  /** The camera: easing after the player into its following pose. */
  function followWith(wx: number, wz: number, height: number, delta: number) {
    const pose = followPose(wx, wz, height);
    if (!placed.current) {
      placed.current = true;
      view.position.copy(pose.position);
      lookAt.current.copy(pose.look);
    }
    const ease = 1 - Math.exp(-delta * 7);
    view.position.lerp(pose.position, ease);
    lookAt.current.lerp(pose.look, 1 - Math.exp(-delta * 12));
    view.lookAt(lookAt.current);
  }

  // The gate in the rail (SRS-105.4) swings away from the player as they
  // walk through it, whichever way; the walk in swings it itself.
  const gate = useRef<GateState>(GATE_SHUT);
  const lastAt = useRef<Point | null>(null);
  useFrame((_, rawDelta) => {
    const at = position.current;
    const before = lastAt.current ?? at;
    lastAt.current = at;
    if (walkIn.current) return;
    gate.current = stepGate(gate.current, at, { x: at.x - before.x, y: at.y - before.y }, Math.min(rawDelta, 0.25));
    lobby.current.gate = gate.current.way * smooth(gate.current.open);
  });

  return (
    <group ref={body}>
      <Person who="player" motion={motion} seat={seat} toss={tossPose} />
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
function Room({
  lobbyState,
  doorsOutlined,
  onDoorsClick,
}: {
  lobbyState: MutableRefObject<LobbyState>;
  doorsOutlined: boolean;
  onDoorsClick: (event: ThreeEvent<MouseEvent>) => void;
}) {
  const [leftX, backZ] = toWorld(LEFT_WALL, 2);
  const [rightX, frontZ] = toWorld(RIGHT_WALL, ROWS - 1);
  const width = rightX - leftX;
  const depth = frontZ - backZ;
  const middleX = (leftX + rightX) / 2;
  const centerZ = (backZ + frontZ) / 2;
  const walls = useMemo(() => wallTexture([width / 2.4, 1.6]), [width]);
  const sign = useMemo(() => neonTexture('STACKS OVERFLOWED', '#fbbf24'), []);
  return (
    <group>
      {/* Polished floor: a clear coat that catches the lights. (A true mirror,
          MeshReflectorMaterial, drew the whole room twice a frame and needed a
          second copy of every shader, freezing the page for seconds at start.) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[middleX, 0, centerZ]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshPhysicalMaterial color="#0b0f19" roughness={0.5} metalness={0.3} clearcoat={1} clearcoatRoughness={0.12} />
      </mesh>
      {/* Back wall with the sign and a neon strip, and side walls; the front
          (the rail, the foyer and the front wall with the doors) is CasinoFront */}
      <mesh position={[middleX, WALL_HEIGHT / 2, backZ]} receiveShadow>
        <planeGeometry args={[width, WALL_HEIGHT]} />
        <meshStandardMaterial map={walls} roughness={0.7} />
      </mesh>
      <mesh position={[middleX, 3.2, backZ + 0.02]}>
        <planeGeometry args={[6.4, 1]} />
        <meshStandardMaterial map={sign} emissiveMap={sign} emissive="#ffffff" emissiveIntensity={2.4} transparent toneMapped={false} />
      </mesh>
      <mesh position={[middleX, WALL_HEIGHT - 0.25, backZ + 0.03]}>
        <boxGeometry args={[width, 0.05, 0.04]} />
        <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={2.2} toneMapped={false} />
      </mesh>
      {/* A gold frame round the sign */}
      <mesh position={[middleX, 3.2, backZ + 0.01]}>
        <planeGeometry args={[6.9, 1.3]} />
        <meshStandardMaterial color="#05070d" roughness={0.4} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[middleX, 3.2 + side * 0.65, backZ + 0.03]}>
          <boxGeometry args={[6.9, 0.04, 0.03]} />
          <Brass />
        </mesh>
      ))}
      {/* Sconces along the back wall, either side of the sign */}
      {sconces(width, 3.9).map((x) => (
        <Sconce key={x} position={[middleX + x, 2.3, backZ]} rotation={0} />
      ))}

      {/* The side walls: the bar set into the left one, the shop's cage into the right */}
      <SideWall side={-1} wallX={leftX} backZ={backZ} frontZ={frontZ} alcove={BAR_ALCOVE} alcoveBackX={toWorld(BAR_ALCOVE.x, 0)[0]} ceiling={BAR.ceiling} />
      <SideWall
        side={1}
        wallX={rightX}
        backZ={backZ}
        frontZ={frontZ}
        alcove={SHOP_ALCOVE}
        alcoveBackX={toWorld(SHOP_ALCOVE.x + SHOP_ALCOVE.w, 0)[0]}
        ceiling={CAGE.ceiling}
      />

      {/* The front, drawn across the whole grid (centred, as CasinoFront expects); what's left of
          LEFT_WALL is behind the left wall, out of sight. */}
      <CasinoFront state={lobbyState} width={(COLS - 2) * TILE_M} height={WALL_HEIGHT} highlight={doorsOutlined} onDoorsClick={onDoorsClick} />
    </group>
  );
}

/**
 * One side wall (`side` -1 the left, 1 the right), from the back wall to the
 * casino's front wall, with an alcove set into it (`alcove`, in tiles; the
 * bar's or the shop's): the wall either side of it, an emerald neon strip
 * along the top, sconces, and the alcove's back wall, side walls, lowered
 * dark-wood ceiling, dark wood floor, gold pilasters and the header across
 * its mouth (the sign on it is the piece's own, in Furniture.tsx).
 */
function SideWall({
  side,
  wallX,
  backZ,
  frontZ,
  alcove,
  alcoveBackX,
  ceiling,
}: {
  side: -1 | 1;
  wallX: number;
  backZ: number;
  frontZ: number;
  alcove: { y: number; h: number };
  alcoveBackX: number;
  ceiling: number;
}) {
  // Into the room.
  const inward = -side;
  const facing = inward * (Math.PI / 2);
  const [, alcoveTop] = toWorld(0, alcove.y);
  const [, alcoveBottom] = toWorld(0, alcove.y + alcove.h);
  const alcoveDepth = Math.abs(wallX - alcoveBackX);
  const alcoveLength = alcoveBottom - alcoveTop;
  const alcoveMiddle = (alcoveTop + alcoveBottom) / 2;
  const alcoveX = (wallX + alcoveBackX) / 2;
  const sideLength = FRONT_WALL_Z - backZ;
  const sideZ = (backZ + FRONT_WALL_Z) / 2;
  const headerHeight = WALL_HEIGHT - ceiling;
  const upperLength = alcoveTop - backZ;
  const lowerLength = FRONT_WALL_Z - alcoveBottom;
  const upperWall = useMemo(() => wallTexture([upperLength / 2.4, 1.6]), [upperLength]);
  const lowerWall = useMemo(() => wallTexture([lowerLength / 2.4, 1.6]), [lowerLength]);
  const alcoveSides = useMemo(() => wallTexture([alcoveDepth / 2.4, 1.6]), [alcoveDepth]);
  const segments = [
    { from: backZ, to: alcoveTop, map: upperWall },
    { from: alcoveBottom, to: FRONT_WALL_Z, map: lowerWall },
  ];
  // Sconces: one towards the back, a pair flanking the alcove, and one more in the middle of a long stretch towards the front.
  const lights = [backZ + 0.9, alcoveTop - 0.5, alcoveBottom + 0.5];
  if (frontZ - alcoveBottom > 2.5) lights.push((alcoveBottom + frontZ) / 2 + 0.4);
  return (
    <group>
      {segments.map(({ from, to, map }) => (
        <mesh key={from} position={[wallX, WALL_HEIGHT / 2, (from + to) / 2]} rotation={[0, facing, 0]} receiveShadow>
          <planeGeometry args={[to - from, WALL_HEIGHT]} />
          <meshStandardMaterial map={map} roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[wallX + inward * 0.03, WALL_HEIGHT - 0.25, sideZ]}>
        <boxGeometry args={[0.04, 0.05, sideLength]} />
        <NeonStrip />
      </mesh>
      {lights.map((z) => (
        <Sconce key={z} position={[wallX, 2.3, z]} rotation={facing} />
      ))}

      <mesh position={[alcoveBackX, ceiling / 2, alcoveMiddle]} rotation={[0, facing, 0]} receiveShadow>
        <planeGeometry args={[alcoveLength, ceiling]} />
        <meshStandardMaterial color="#0d1220" roughness={0.75} />
      </mesh>
      {[
        { z: alcoveTop, turn: 0 },
        { z: alcoveBottom, turn: Math.PI },
      ].map(({ z, turn }) => (
        <mesh key={z} position={[alcoveX, ceiling / 2, z]} rotation={[0, turn, 0]} receiveShadow>
          <planeGeometry args={[alcoveDepth, ceiling]} />
          <meshStandardMaterial map={alcoveSides} roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[alcoveX, ceiling, alcoveMiddle]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[alcoveDepth, alcoveLength]} />
        <meshStandardMaterial color="#1c0f08" roughness={0.6} />
      </mesh>
      <mesh position={[wallX, ceiling + headerHeight / 2, alcoveMiddle]} rotation={[0, facing, 0]} receiveShadow>
        <planeGeometry args={[alcoveLength, headerHeight]} />
        <meshStandardMaterial color="#0b1120" roughness={0.6} />
      </mesh>
      {/* The header's underside, and a gold edge along its bottom */}
      <mesh position={[wallX + inward * 0.06, ceiling + 0.04, alcoveMiddle]}>
        <boxGeometry args={[0.12, 0.08, alcoveLength + 0.24]} />
        <Brass />
      </mesh>
      {[alcoveTop, alcoveBottom].map((z, i) => (
        <mesh key={z} position={[wallX + inward * 0.04, ceiling / 2, z + (i ? 0.06 : -0.06)]} castShadow>
          <boxGeometry args={[0.1, ceiling, 0.12]} />
          <Brass />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[alcoveX, 0.001, alcoveMiddle]} receiveShadow>
        <planeGeometry args={[alcoveDepth, alcoveLength]} />
        <meshStandardMaterial color="#2a160b" roughness={0.45} />
      </mesh>
    </group>
  );
}

function Brass() {
  return <meshStandardMaterial color="#c9a227" metalness={0.9} roughness={0.25} />;
}

function NeonStrip() {
  return <meshStandardMaterial color="#34d399" emissive="#34d399" emissiveIntensity={1.6} toneMapped={false} />;
}

/** Where the sconces go along a wall `length` long: every 3 m, leaving `gap` either side of the middle clear. */
function sconces(length: number, gap: number) {
  const spots: number[] = [];
  for (let x = -length / 2 + 1.5; x <= length / 2 - 1.5; x += 3) if (Math.abs(x) > gap) spots.push(x);
  return spots;
}

/** A wall light: a gold back plate and a glowing frosted shade, facing +z before `rotation` (about y). */
function Sconce({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0, 0.015]}>
        <boxGeometry args={[0.12, 0.34, 0.03]} />
        <meshStandardMaterial color="#c9a227" metalness={0.9} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.06, 0.11]}>
        <cylinderGeometry args={[0.07, 0.1, 0.2, 18, 1, true]} />
        <meshStandardMaterial color="#fff1d0" emissive="#ffb85c" emissiveIntensity={1.8} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.07, 0.07]}>
        <boxGeometry args={[0.03, 0.04, 0.1]} />
        <meshStandardMaterial color="#c9a227" metalness={0.9} roughness={0.25} />
      </mesh>
    </group>
  );
}

/** A patterned carpet under a game, a little bigger than it. */
function Rug({ object }: { object: FloorObject }) {
  // The size the layout gives it (rugRect()), so rugs never overlap.
  const rect = rugRect(object) as { w: number; h: number };
  const w = rect.w * TILE_M;
  const d = rect.h * TILE_M;
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
      return <ShopCage width={width} depth={depth} layout={layout} highlight={highlight} />;
    case 'bar':
      return <Bar width={width} depth={depth} layout={layout} highlight={highlight} />;
    case 'plant':
      return <Plant />;
    case 'pillar':
      return <Pillar height={WALL_HEIGHT} />;
  }
}

function Floor({
  onNear,
  onPlay,
  nearId,
  input,
  playing,
  onSeated,
  returning,
  onStood,
  entering,
  onEntered,
  canLeave,
  onNearDoors,
  onLeave,
  leaving,
  leaveAtOnce,
  onLeft,
  guest = false,
  spot,
  onSpot,
  onNearKiosk,
  onCheckIn,
  checkingIn,
  checkInAtOnce,
  onAtKiosk,
  onNearFountain,
  onWish,
  tossing,
  tossAtOnce,
  onTossed,
  restingCoin = null,
  onBarSeated,
  drinkOrder = 0,
  drinkAtOnce,
  onSip,
  onDrinkDone,
  slosh = 0,
  sloshGentle = false,
}: Props) {
  const sloshAmount = useRef(slosh);
  sloshAmount.current = slosh;
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
  // In the lobby, unless they're getting up from a seat or put back where
  // they last stood on the floor: where everyone's walk in ends (SRS-103.12),
  // and a guest stays (SRS-103.15).
  const inLobby = !rising && (guest || !spot || isInLobby(spot));
  const lobby = useRef<LobbyState>({ front: 0, casino: 0, gate: 0, lit: 1, shown: entrance !== null || inLobby });
  // Leaving through the casino's doors (SRS-105.5), once the page says so;
  // Player plans the walk out from wherever the player is.
  const walkOut = useRef<WalkOut | 'asked' | 'asked at once' | null>(null);
  useEffect(() => {
    if (leaving && !walkOut.current) walkOut.current = leaveAtOnce ? 'asked at once' : 'asked';
  }, [leaving, leaveAtOnce]);
  // In reach of the casino's doors: they're outlined (for a player who can
  // leave, or from the lobby for a guest, who's walked to the desk instead).
  const [nearDoors, setNearDoors] = useState<DoorsSide>(null);
  const nearDoorsRef = useRef<DoorsSide>(null);
  const handleNearDoors = useCallback(
    (doors: DoorsSide) => {
      nearDoorsRef.current = doors;
      setNearDoors(doors);
      onNearDoors?.(doors);
    },
    [onNearDoors]
  );
  // Checking in at a front-desk tablet (SRS-103.13): the one in reach is
  // outlined; the page says when to fly in, and when to fly back out (having
  // logged in or not, they're left at the desk, SRS-103.14).
  const [nearKiosk, setNearKiosk] = useState<number | null>(null);
  const nearKioskRef = useRef<number | null>(null);
  const handleNearKiosk = useCallback(
    (kiosk: number | null) => {
      nearKioskRef.current = kiosk;
      setNearKiosk(kiosk);
      onNearKiosk?.(kiosk);
    },
    [onNearKiosk]
  );
  // In reach of the lobby's fountain, which is outlined: a logged-in player
  // can make a wish at it (SRS-129.1), a guest log in to (SRS-129.5).
  const [nearFountain, setNearFountain] = useState(false);
  const nearFountainRef = useRef(false);
  const handleNearFountain = useCallback(
    (near: boolean) => {
      nearFountainRef.current = near;
      setNearFountain(near);
      onNearFountain?.(near);
    },
    [onNearFountain]
  );
  // Tossing a coin into the fountain once a wish is made (SRS-129.4):
  // Player plans and plays it, moving the coin CoinToss draws; once it's
  // over, today's coin lies on the bottom.
  const coinToss = useRef<CoinTossPlan | 'asked' | 'asked at once' | null>(null);
  useEffect(() => {
    if (tossing && !coinToss.current) coinToss.current = tossAtOnce ? 'asked at once' : 'asked';
  }, [tossing, tossAtOnce]);
  const coinFx = useRef<CoinFx>(noCoin());
  // A drink at the bar, each time the page counts another ordered: Player
  // plays it, moving the glass BarGlass draws.
  const drink = useRef<DrinkPlan | 'asked' | 'asked at once' | null>(null);
  const glassFx = useRef<GlassFx>(noGlass());
  const drinkAtOnceRef = useRef(drinkAtOnce);
  drinkAtOnceRef.current = drinkAtOnce;
  useEffect(() => {
    // Only a new order starts one.
    if (drinkOrder > 0) drink.current = drinkAtOnceRef.current ? 'asked at once' : 'asked';
  }, [drinkOrder]);
  useEffect(() => {
    if (coinToss.current) return;
    coinFx.current = restingCoin
      ? { ...noCoin(), shown: true, position: fountainPoint(restingCoin, BASIN_FLOOR + 0.004), spin: TOSS_FLIPS * Math.PI * 2, under: 1, resting: true }
      : noCoin();
  }, [restingCoin]);
  const kioskScreens = useRef<(THREE.Object3D | null)[]>([]);
  const kiosk = useRef<KioskVisit | null>(null);
  useEffect(() => {
    if (checkingIn && !kiosk.current) {
      const atOnce = Boolean(checkInAtOnce);
      // Straight there, after any walk in, too.
      if (atOnce && walkIn.current) walkIn.current.skip = true;
      kiosk.current = {
        kiosk: nearKioskRef.current ?? 0,
        stage: nearKioskRef.current === null ? 'walk' : 'in',
        t: 0,
        skip: atOnce,
        atOnce,
        walk: null,
        from: null,
      };
    } else if (!checkingIn && kiosk.current && kiosk.current.stage !== 'out') {
      kiosk.current.stage = 'out';
      kiosk.current.t = 0;
      kiosk.current.skip = kiosk.current.atOnce;
    }
  }, [checkingIn, checkInAtOnce]);
  // Any key, or pressing anywhere on the floor's view, skips the walk in,
  // the walk out or the coin toss (but not a held key repeating, like the
  // Space that started it).
  const { gl } = useThree();
  useEffect(() => {
    const skip = (event: Event) => {
      if (walkIn.current) walkIn.current.skip = true;
      const out = walkOut.current;
      if (out && !(event as KeyboardEvent).repeat) {
        // (Asked for but not yet planned, it starts skipped.)
        if (typeof out === 'object') out.skip = true;
        else walkOut.current = 'asked at once';
      }
      // The walk to the desk, and the camera flying into or out of a check-in tablet, too (not while it's up close: those keys are for its forms).
      if (kiosk.current && kiosk.current.stage !== 'open' && !(event as KeyboardEvent).repeat) kiosk.current.skip = true;
      // And the coin toss (asked for but not yet planned, it starts skipped).
      const toss = coinToss.current;
      if (toss && !(event as KeyboardEvent).repeat) {
        if (typeof toss === 'object') toss.skip = true;
        else coinToss.current = 'asked at once';
      }
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
  const camera = useRef<Camera>({ yaw: spot?.yaw ?? 0, pitch: 0.42, distance: 4.6 });
  const near = FLOOR_OBJECTS.find((object) => object.id === nearId);
  const playerTile = useRef<Point>({ x: START.x, y: START.y });

  // The player's tile (kept up to date by Player), for click-to-walk paths.
  const walkTo = (targets: Point[], throughDoors = false) => {
    path.current = findPath(playerTile.current, targets, false, throughDoors) ?? [];
  };

  // A click on a check-in tablet uses it when in reach (for a guest), or walks up to it.
  function handleKioskClick(which: number, event: ThreeEvent<MouseEvent>) {
    if (walkIn.current || walkOut.current || kiosk.current || coinToss.current || event.delta > 6 || seating.current) return;
    event.stopPropagation();
    if (nearKioskRef.current === which && guest) onCheckIn?.();
    else walkTo(kioskStandingSpots(which));
  }

  // A click on the fountain makes a wish when in reach (SRS-129.1; for a
  // guest, logs in first, SRS-129.5), or walks up to it.
  function handleFountainClick(event: ThreeEvent<MouseEvent>) {
    if (walkIn.current || walkOut.current || kiosk.current || coinToss.current || event.delta > 6 || seating.current) return;
    event.stopPropagation();
    if (nearFountainRef.current) onWish?.();
    else walkTo(fountainStandingSpots());
  }

  // A click on the casino's doors leaves through them when in reach (for a
  // player who can), or for a guest in the lobby walks them to the front
  // desk to check in (SRS-103.15); otherwise it walks up to them, or for a
  // logged-in player in the lobby, through them (SRS-103.17).
  function handleDoorsClick(event: ThreeEvent<MouseEvent>) {
    if (walkIn.current || walkOut.current || kiosk.current || coinToss.current || event.delta > 6 || seating.current) return;
    event.stopPropagation();
    if (nearDoorsRef.current === 'floor' && canLeave) onLeave?.();
    else if (nearDoorsRef.current === 'lobby' && guest) onCheckIn?.();
    else if (!guest && isInLobby({ x: playerTile.current.x + 0.5, y: playerTile.current.y + 0.5 })) walkTo(doorStandingSpots(), true);
    else walkTo(doorStandingSpots(guest));
  }

  function handleFloorClick(event: ThreeEvent<MouseEvent>) {
    if (walkIn.current || walkOut.current || kiosk.current || coinToss.current) return; // the press that skipped the walk in or out, or the toss (see above)
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
      {/* Low, warm light overall, so each game's own spotlight makes a pool of light on the floor. */}
      <ambientLight intensity={0.16} color="#ffd9b0" />
      <hemisphereLight args={['#334155', '#07090f', 0.32]} />
      <directionalLight
        position={[4, 9, 6]}
        intensity={0.6}
        color="#ffdcb0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-bias={-0.0004}
      />
      <pointLight position={[0, 3.2, toWorld(0, 2)[1] + 0.8]} color="#fbbf24" intensity={7} distance={9} />

      <Room lobbyState={lobby} doorsOutlined={(nearDoors === 'floor' && Boolean(canLeave) && !leaving) || (nearDoors === 'lobby' && guest && !checkingIn)} onDoorsClick={handleDoorsClick} />
      {/* Always there, so walking out shows it without new shaders to build:
          it's hidden (its lights at zero) except while a guest is in it or the player walks in or out. */}
      <Lobby
        state={lobby}
        kioskOutlined={guest && !checkingIn ? nearKiosk : null}
        kioskScreens={kioskScreens}
        onKioskClick={handleKioskClick}
        fountainOutlined={nearFountain && !tossing && !checkingIn}
        onFountainClick={handleFountainClick}
      />
      <CoinToss fx={coinFx} />
      <BarGlass fx={glassFx} />
      <group onClick={handleFloorClick}>
        {/* What a click lands on: the floor, the foyer out to the front wall, and the lobby beyond (SRS-107.6). */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, (LOBBY_SOUTH_Z - (ROWS / 2) * TILE_M) / 2]} visible={false}>
          <planeGeometry args={[COLS * TILE_M, LOBBY_SOUTH_Z + (ROWS / 2) * TILE_M]} />
        </mesh>
        {FLOOR_OBJECTS.filter((object) => object.interactive).map((object) => {
          const [x, z] = toWorld(object.x + object.w / 2, object.y + object.h / 2);
          return (
            <group key={`light-${object.id}`}>
              {/* The bar and the shop's cage stand on the polished floor; the games each have a rug. */}
              {object.kind === 'bar' || object.kind === 'shop' ? null : <Rug object={object} />}
              <Spot
                x={object.kind === 'bar' ? x + 0.6 : object.kind === 'shop' ? x - 0.6 : x}
                z={z}
                color={object.kind === 'bar' || object.kind === 'shop' ? '#ffc27a' : object.kind === 'slots' ? '#ffd1e8' : '#ffe8c2'}
                intensity={object.kind === 'bar' || object.kind === 'shop' ? 32 : 45}
              />
            </group>
          );
        })}
        <EffectComposer multisampling={4} enableNormalPass={false}>
          <Slosh amount={sloshAmount} gentle={sloshGentle} />
          <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.82} luminanceSmoothing={0.25} />
          <Vignette offset={0.25} darkness={0.6} />
        </EffectComposer>
        {FLOOR_OBJECTS.map((object) => {
          const [x, z] = toWorld(object.x + object.w / 2, object.y + object.h / 2);
          return (
            <group key={object.id} position={[x, 0, z]}>
              {/* A table outlines its nearest chair, the sports bar its nearer screen and the shop its nearest window (until the player's sitting down). */}
              <FloorPiece object={object} highlight={object.id === nearId && !playing ? nearSpot : null} />
            </group>
          );
        })}
      </group>

      <Player
        start={spot ? { x: spot.x, y: spot.y } : inLobby ? LOBBY_MIDDLE : undefined}
        startHeading={spot?.heading}
        onSpot={onSpot}
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
        walkOut={walkOut}
        onLeft={onLeft}
        onNearDoors={handleNearDoors}
        kiosk={kiosk}
        kioskScreens={kioskScreens}
        onAtKiosk={onAtKiosk}
        onNearKiosk={handleNearKiosk}
        onNearFountain={handleNearFountain}
        coinToss={coinToss}
        coinFx={coinFx}
        onTossed={onTossed}
        member={!guest}
        drink={drink}
        glassFx={glassFx}
        onBarSeated={onBarSeated}
        onSip={onSip}
        onDrinkDone={onDrinkDone}
        drunk={sloshAmount}
      />

      {near?.interactive && !playing && !walkIn.current && !leaving ? (
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
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.95 }}
      >
        <color attach="background" args={['#04060b']} />
        <fog attach="fog" args={['#04060b', 12, 32]} />
        <Floor {...props} />
        <Warmup onReady={onReady} />
      </Canvas>
      {ready ? null : (
        <div className="absolute inset-0 flex items-center justify-center bg-[#04060b] text-sm uppercase tracking-[0.3em] text-slate-400">
          <span className="animate-pulse">Opening the casino…</span>
        </div>
      )}
    </>
  );
}
