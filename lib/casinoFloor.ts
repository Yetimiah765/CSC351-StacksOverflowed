// The home page's casino floor (components/casinoFloor/): a room laid out
// on a grid of tiles, walked around in 3D. This file is the floor's layout
// and rules — what's where, what blocks the way, what the player is next
// to, and the way to walk somewhere — with no drawing, so it can be tested.
//
// Each piece of furniture has a rectangle of tiles (where it is, and what a
// click on it means) and, inside that, the shapes it really has
// (`pieceLayout()`): the poker table is an oval ringed by chairs, the
// blackjack table a half circle, and so on. Only those shapes block the
// player, so they can walk right up to a table and round its corners. The
// drawing code (Furniture.tsx) places chairs and dealers from the same
// layout, so what you see is what you bump into.

import { GAMES } from './games';

export const COLS = 26;
export const ROWS = 15;
/** One tile, in metres. */
export const TILE_METRES = 0.8;

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Point {
  x: number;
  y: number;
}

/** Something on the floor: a game, the shop counter, or decoration. */
export interface FloorObject {
  id: string;
  /** What it is, for the drawing code. */
  kind: 'poker' | 'blackjack' | 'roulette' | 'slots' | 'sports-betting' | 'shop' | 'plant' | 'pillar';
  /** Top-left tile, and size in tiles: where it is (its real shape is in pieceLayout()). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Walk up to it and press Space to go here; null when it can't be used yet. */
  interactive?: {
    name: string;
    description: string;
    href: string | null;
  };
}

const game = (id: string) => GAMES.find((candidate) => candidate.id === id);

function gameObject(
  kind: Exclude<FloorObject['kind'], 'shop' | 'plant' | 'pillar'>,
  x: number,
  y: number,
  w: number,
  h: number
): FloorObject {
  const found = game(kind);
  return {
    id: kind,
    kind,
    x,
    y,
    w,
    h,
    interactive: {
      name: found?.name ?? kind,
      description: found?.description ?? '',
      href: found?.href ?? null,
    },
  };
}

// The room: the top two rows are the back wall (with the sign), the outer
// columns and the bottom row are walls, and the way in is at the bottom
// middle, where the player starts. Dealers stand behind their tables, as
// part of them (pieceLayout()).
export const FLOOR_OBJECTS: FloorObject[] = [
  gameObject('blackjack', 2, 4, 4, 3),
  gameObject('poker', 10, 4, 6, 3),
  gameObject('roulette', 19, 4, 5, 3),
  gameObject('slots', 2, 9, 5, 2),
  gameObject('sports-betting', 19, 9, 5, 2),
  {
    id: 'shop',
    kind: 'shop',
    x: 10,
    y: 9,
    w: 6,
    h: 2,
    interactive: {
      name: 'Cosmetic Shop',
      description: 'Spin the free Daily Login Box and open blind boxes for card backs, chips and outlines.',
      href: '/shop',
    },
  },
  // Plants in the corners, pillars between the rows of games.
  { id: 'plant-1', kind: 'plant', x: 1, y: 2, w: 1, h: 1 },
  { id: 'plant-2', kind: 'plant', x: 24, y: 2, w: 1, h: 1 },
  { id: 'plant-3', kind: 'plant', x: 1, y: 13, w: 1, h: 1 },
  { id: 'plant-4', kind: 'plant', x: 24, y: 13, w: 1, h: 1 },
  { id: 'pillar-1', kind: 'pillar', x: 8, y: 7, w: 1, h: 1 },
  { id: 'pillar-2', kind: 'pillar', x: 17, y: 7, w: 1, h: 1 },
];

/** Where the player appears: just inside the door, facing in. */
export const START: Point & { direction: Direction } = { x: 12, y: 13, direction: 'up' };
/** The door in the bottom wall (two tiles wide), drawn but not walkable. */
export const DOOR = { x: 12, y: 14, w: 2 };

export const INTERACTIVE_OBJECTS = FLOOR_OBJECTS.filter((object) => object.interactive);

// ---------- each piece's real shape ----------
// In metres from the middle of the piece's rectangle: x across the room, z
// towards its front (the room's door side), as the 3D floor draws it.

export type Shape =
  | { type: 'box'; x: number; z: number; w: number; d: number }
  | { type: 'ellipse'; x: number; z: number; rx: number; rz: number }
  | { type: 'circle'; x: number; z: number; r: number };

export interface Seat {
  x: number;
  z: number;
  /** Which way the chair faces (0 = towards -z, the table behind it). */
  angle: number;
}

export interface PieceLayout {
  /** What blocks the way: the piece itself, its chairs and its dealer. */
  solid: Shape[];
  chairs: Seat[];
  /** Where the dealer stands (facing +z), and how high and how far ahead their hands rest. */
  dealer?: { x: number; z: number; handsY: number; handsZ: number };
  /** For someone sitting in one of the chairs: how high and how far ahead the table top is. */
  seatedHands?: { y: number; z: number };
  /** Screens to look at (the middle of each, and its height), for a piece you play by watching. */
  screens?: { x: number; y: number; z: number }[];
}

const CHAIR_RADIUS = 0.26;
const PERSON_RADIUS = 0.24;

function withChairsAndDealer(layout: Omit<PieceLayout, 'solid'> & { body: Shape[] }): PieceLayout {
  return {
    chairs: layout.chairs,
    dealer: layout.dealer,
    seatedHands: layout.seatedHands,
    screens: layout.screens,
    solid: [
      ...layout.body,
      ...layout.chairs.map((seat): Shape => ({ type: 'circle', x: seat.x, z: seat.z, r: CHAIR_RADIUS })),
      ...(layout.dealer ? [{ type: 'circle', x: layout.dealer.x, z: layout.dealer.z, r: PERSON_RADIUS } as Shape] : []),
    ],
  };
}

const layouts = new Map<string, PieceLayout>();

/** A piece's real shape, chairs and dealer spot (see the comment above). */
export function pieceLayout(object: FloorObject): PieceLayout {
  const cached = layouts.get(object.id);
  if (cached) return cached;
  const width = object.w * TILE_METRES;
  const depth = object.h * TILE_METRES;
  let layout: PieceLayout;
  switch (object.kind) {
    case 'poker': {
      // An oval: the felt, then a padded rail round it. Six chairs round the
      // front and sides; the dealer stands at the middle of the back.
      const rx = width / 2 - 0.55;
      const rz = depth / 2 - 0.5;
      const chairs = [0.15, 0.72, 1.29, 1.85, 2.42, 2.99].map((angle) => {
        const x = Math.cos(angle) * (rx + 0.42);
        const z = Math.sin(angle) * (rz + 0.42);
        return { x, z, angle: Math.atan2(x, z) };
      });
      layout = withChairsAndDealer({
        body: [{ type: 'ellipse', x: 0, z: 0, rx: rx + 0.2, rz: rz + 0.2 }],
        chairs,
        dealer: { x: 0, z: -(rz + 0.2) - 0.2, handsY: 0.9, handsZ: 0.38 },
        seatedHands: { y: 0.88, z: 0.42 },
      });
      break;
    }
    case 'blackjack': {
      // A half circle, flat side at the back where the dealer stands.
      const r = Math.min(width / 2 - 0.3, depth - 0.9);
      const back = -depth / 2 + 0.75;
      layout = withChairsAndDealer({
        body: [
          { type: 'ellipse', x: 0, z: back, rx: r + 0.16, rz: r + 0.16 },
        ],
        chairs: [-0.55, 0, 0.55].map((x) => ({
          x: x * 1.35,
          z: back + r + 0.5 - Math.abs(x) * 0.35,
          angle: Math.atan2(x * 1.35, r + 0.5),
        })),
        dealer: { x: 0, z: back - 0.24, handsY: 0.84, handsZ: 0.36 },
        seatedHands: { y: 0.86, z: 0.5 },
      });
      break;
    }
    case 'roulette': {
      // A long table with the wheel at its left end; chairs along the front,
      // the dealer behind, beside the wheel.
      const tableW = width - 0.4;
      const tableD = depth - 1.0;
      const front = 0.15 + tableD / 2 + 0.06;
      const back = 0.15 - tableD / 2;
      layout = withChairsAndDealer({
        body: [{ type: 'box', x: 0, z: (front + back) / 2, w: tableW, d: front - back }],
        chairs: [-0.8, 0.2, 1.1].map((x) => ({ x, z: depth / 2 - 0.2, angle: 0 })),
        dealer: { x: -tableW / 2 + 1.45, z: back - 0.24, handsY: 0.81, handsZ: 0.36 },
        seatedHands: { y: 0.82, z: 0.32 },
      });
      break;
    }
    case 'shop': {
      // The counter, with the shopkeeper behind it.
      layout = withChairsAndDealer({
        body: [{ type: 'box', x: 0, z: 0.15, w: width - 0.3, d: 0.7 }],
        chairs: [],
        dealer: { x: 0, z: -0.45, handsY: 1.07, handsZ: 0.36 },
      });
      break;
    }
    case 'slots': {
      // A row of machines at the back, a stool in front of each.
      const spacing = width / 3.2;
      layout = withChairsAndDealer({
        body: [{ type: 'box', x: 0, z: -depth / 2 + 0.35, w: spacing * 2 + 0.8, d: 0.66 }],
        chairs: [-1, 0, 1].map((i) => ({ x: i * spacing, z: -depth / 2 + 1.1, angle: 0 })),
        seatedHands: { y: 0.78, z: 0.4 },
      });
      break;
    }
    case 'sports-betting': {
      // Two screens on poles at the back, a betting counter at the front.
      layout = withChairsAndDealer({
        body: [
          { type: 'box', x: 0, z: depth / 2 - 0.45, w: width - 0.2, d: 0.6 },
          ...[-1, 1].map((side): Shape => ({ type: 'circle', x: (side * width) / 4, z: -depth / 2 + 0.15, r: 0.12 })),
        ],
        chairs: [],
        screens: [-1, 1].map((side) => ({ x: (side * width) / 4, y: 1.9, z: -depth / 2 + 0.24 })),
      });
      break;
    }
    case 'plant':
      layout = withChairsAndDealer({ body: [{ type: 'circle', x: 0, z: 0, r: 0.3 }], chairs: [] });
      break;
    case 'pillar':
      layout = withChairsAndDealer({ body: [{ type: 'circle', x: 0, z: 0, r: 0.38 }], chairs: [] });
      break;
  }
  layouts.set(object.id, layout);
  return layout;
}

// ---------- walls, and what blocks the player ----------
// Positions here are in tiles (x across, y down the room; 0.5 is the middle
// of the first tile). The player is a circle of PLAYER_RADIUS.

export const PLAYER_RADIUS = 0.3;

const isWall = (x: number, y: number) => x <= 0 || x >= COLS - 1 || y <= 1 || y >= ROWS - 1;

/** A shape in tiles: centred, measured in the room's tile grid. */
interface TileShape {
  shape: Shape;
  cx: number;
  cy: number;
  object: FloorObject;
}

const SOLIDS: TileShape[] = FLOOR_OBJECTS.flatMap((object) =>
  pieceLayout(object).solid.map((shape) => ({
    shape,
    cx: object.x + object.w / 2 + shape.x / TILE_METRES,
    cy: object.y + object.h / 2 + shape.z / TILE_METRES,
    object,
  }))
);

/** How far a point is outside a shape, in tiles (0 or less when inside). */
function distanceOutside({ shape, cx, cy }: TileShape, x: number, y: number): number {
  const dx = x - cx;
  const dy = y - cy;
  switch (shape.type) {
    case 'circle':
      return Math.hypot(dx, dy) - shape.r / TILE_METRES;
    case 'box': {
      const hw = shape.w / 2 / TILE_METRES;
      const hd = shape.d / 2 / TILE_METRES;
      const ox = Math.abs(dx) - hw;
      const oy = Math.abs(dy) - hd;
      return ox > 0 || oy > 0 ? Math.hypot(Math.max(ox, 0), Math.max(oy, 0)) : Math.max(ox, oy);
    }
    case 'ellipse': {
      // Close enough for an oval this round: the distance along the line to
      // its centre, scaled.
      const rx = shape.rx / TILE_METRES;
      const ry = shape.rz / TILE_METRES;
      const scaled = Math.hypot(dx / rx, dy / ry);
      if (scaled === 0) return -Math.min(rx, ry);
      return Math.hypot(dx, dy) * (1 - 1 / scaled);
    }
  }
}

/** Whether a circle at (x, y) overlaps a wall or anything standing on the floor. */
function circleBlocked(x: number, y: number, radius: number): boolean {
  for (let ty = Math.floor(y - radius); ty <= Math.floor(y + radius); ty++) {
    for (let tx = Math.floor(x - radius); tx <= Math.floor(x + radius); tx++) {
      if (!isWall(tx, ty)) continue;
      const nearestX = Math.max(tx, Math.min(x, tx + 1));
      const nearestY = Math.max(ty, Math.min(y, ty + 1));
      if ((x - nearestX) ** 2 + (y - nearestY) ** 2 < radius * radius) return true;
    }
  }
  return SOLIDS.some((solid) => distanceOutside(solid, x, y) < radius);
}

/** Whatever's rectangle covers this tile, if anything (what a click on it means). */
export function objectAt(x: number, y: number): FloorObject | undefined {
  return FLOOR_OBJECTS.find((object) => x >= object.x && x < object.x + object.w && y >= object.y && y < object.y + object.h);
}

/** Whether the player can't stand in the middle of this tile: a wall, or too close to something. */
export function isBlocked(x: number, y: number): boolean {
  return isWall(x, y) || circleBlocked(x + 0.5, y + 0.5, PLAYER_RADIUS);
}

/**
 * Moves from `position` by `delta`, stopping at walls and furniture but
 * sliding along them (each axis is tried on its own), like walking into a
 * table at an angle.
 */
export function moveWithCollisions(position: Point, delta: Point, radius = PLAYER_RADIUS): Point {
  let { x, y } = position;
  if (!circleBlocked(x + delta.x, y, radius)) x += delta.x;
  if (!circleBlocked(x, y + delta.y, radius)) y += delta.y;
  return { x, y };
}

/** How close the player must be to a game (its real shape, chairs and dealer included) to use it, in tiles. */
export const REACH = 0.95;

/** How far a point is from an object's real shape, in tiles. */
function distanceToObject(object: FloorObject, point: Point): number {
  let best = Infinity;
  for (const solid of SOLIDS) {
    if (solid.object === object) best = Math.min(best, distanceOutside(solid, point.x, point.y));
  }
  return best;
}

/** Where one of a piece's chairs is, in tiles. */
export function chairTile(object: FloorObject, seat: Seat): Point {
  return { x: object.x + object.w / 2 + seat.x / TILE_METRES, y: object.y + object.h / 2 + seat.z / TILE_METRES };
}

/** The piece's chair nearest a point (in tiles), or null if it has none: the one to sit in. */
export function nearestChair(object: FloorObject, point: Point): number | null {
  let best: number | null = null;
  let bestDistance = Infinity;
  pieceLayout(object).chairs.forEach((seat, i) => {
    const at = chairTile(object, seat);
    const distance = Math.hypot(at.x - point.x, at.y - point.y);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  });
  return best;
}

/** The piece's screen nearest a point (in tiles), or null if it has none: the one to zoom into. */
export function nearestScreen(object: FloorObject, point: Point): number | null {
  const screens = pieceLayout(object).screens ?? [];
  let best: number | null = null;
  let bestDistance = Infinity;
  screens.forEach((screen, i) => {
    const distance = Math.hypot(object.x + object.w / 2 + screen.x / TILE_METRES - point.x, object.y + object.h / 2 + screen.z / TILE_METRES - point.y);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  });
  return best;
}

/** The game within reach of a point, the closest one if several are. */
export function nearbyObjectAt(point: Point): FloorObject | null {
  let best: FloorObject | null = null;
  let bestDistance = REACH;
  for (const object of INTERACTIVE_OBJECTS) {
    const distance = distanceToObject(object, point);
    if (distance <= bestDistance) {
      best = object;
      bestDistance = distance;
    }
  }
  return best;
}

// ---------- walking somewhere (click to walk) ----------
export const STEP: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** Tiles the player can stand on to use an object: open, with the object in reach from their middle. */
export function standingSpots(object: FloorObject): Point[] {
  const spots: Point[] = [];
  for (let y = object.y - 2; y <= object.y + object.h + 1; y++) {
    for (let x = object.x - 2; x <= object.x + object.w + 1; x++) {
      if (isBlocked(x, y)) continue;
      if (nearbyObjectAt({ x: x + 0.5, y: y + 0.5 })?.id === object.id) spots.push({ x, y });
    }
  }
  return spots;
}

/**
 * The shortest walk (4 directions, around anything in the way) from `from`
 * to the nearest of `targets`, as the tiles to step onto in order — empty if
 * already there, null if none can be reached.
 */
export function findPath(from: Point, targets: Point[]): Point[] | null {
  const key = (point: Point) => point.y * COLS + point.x;
  const goals = new Set(targets.map(key));
  if (goals.has(key(from))) return [];

  const cameFrom = new Map<number, number>([[key(from), -1]]);
  const queue: Point[] = [from];
  while (queue.length > 0) {
    const current = queue.shift() as Point;
    for (const step of Object.values(STEP)) {
      const next = { x: current.x + step.x, y: current.y + step.y };
      const nextKey = key(next);
      if (cameFrom.has(nextKey) || isBlocked(next.x, next.y)) continue;
      cameFrom.set(nextKey, key(current));
      if (goals.has(nextKey)) {
        const path: Point[] = [];
        for (let at = nextKey; at !== key(from); at = cameFrom.get(at) as number) {
          path.unshift({ x: at % COLS, y: Math.floor(at / COLS) });
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}
