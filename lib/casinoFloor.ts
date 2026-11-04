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

// ---------- walking in (SRS-103.12) ----------
// The first time the home page opens in a browser tab, and just after
// logging in, the player is seen walking in from the street: a guest as far
// as the middle of the lobby (they can't go into the casino until they've
// checked in), a logged-in player on through the casino's doors onto the
// floor. The tab remembers it's been opened under VISITED_KEY; logging in
// leaves ENTRANCE_KEY, cleared once they're in.
export const ENTRANCE_KEY = 'casino-floor-entrance';
export const VISITED_KEY = 'casino-floor-visited';

/** The casino's front wall, with its big doors in line with DOOR, in tiles:
 * past the floor's front rail (DOOR.y, where the gate is), leaving a foyer
 * the camera following the player can stand in without going through it. */
export const FRONT_WALL_Y = DOOR.y + 4.25;

/** The lobby in front of the casino, in tiles: it runs from the casino's
 * front wall out to the building's front door, `depth` tiles away, and is
 * `width` tiles wide, centred on the door. It's only there for the walk in. */
export const LOBBY = { depth: 12.5, width: 15 };

/** The middle of the lobby, in tiles: on the inlay, where a guest's walk in ends. */
export const LOBBY_MIDDLE: Point = { x: DOOR.x + DOOR.w / 2, y: FRONT_WALL_Y + LOBBY.depth / 2 };

/** The walk in, in tiles, all down the middle of the door: from outside the
 * building through its front door into the lobby, and for a guest no
 * further than its middle. A logged-in player goes on through the casino's
 * doors and the foyer, through the gate in the rail, to a couple of steps
 * onto the floor, short of the shop counter's reach, so no game's prompt
 * pops up the moment they take over. */
export function entranceWalk(guest = false): Point[] {
  const doorMiddle = DOOR.x + DOOR.w / 2;
  const front = FRONT_WALL_Y + LOBBY.depth;
  const intoLobby = [
    { x: doorMiddle, y: front + 2.25 },
    { x: doorMiddle, y: front },
  ];
  if (guest) return [...intoLobby, LOBBY_MIDDLE];
  return [...intoLobby, { x: doorMiddle, y: FRONT_WALL_Y }, { x: doorMiddle, y: DOOR.y }, { x: doorMiddle, y: DOOR.y - 2.1 }];
}

export const INTERACTIVE_OBJECTS = FLOOR_OBJECTS.filter((object) => object.interactive);

// ---------- getting up again (SRS-108.6) ----------
// Sitting down to play remembers the seat for this browser tab, so that
// coming back to the floor from the game, the player is seen getting up from
// it. It's kept in sessionStorage under SEAT_KEY as { objectId, spot }.

export const SEAT_KEY = 'casino-floor-seat';

export interface TakenSeat {
  object: FloorObject;
  /** The chair (or, at the sports bar, the screen) by index; null for none, like the shop counter. */
  spot: number | null;
}

/** The remembered seat, if it still names a game on the floor and one of its chairs or screens. */
export function parseTakenSeat(raw: string | null): TakenSeat | null {
  if (!raw) return null;
  let saved: unknown;
  try {
    saved = JSON.parse(raw);
  } catch {
    return null;
  }
  const { objectId, spot } = (saved ?? {}) as { objectId?: unknown; spot?: unknown };
  const object = INTERACTIVE_OBJECTS.find((candidate) => candidate.id === objectId);
  if (!object) return null;
  if (spot === null) return { object, spot: null };
  if (typeof spot !== 'number' || !Number.isInteger(spot) || spot < 0) return null;
  const layout = pieceLayout(object);
  const places = layout.chairs.length > 0 ? layout.chairs.length : (layout.screens?.length ?? 0);
  return spot < places ? { object, spot } : null;
}

export function serializeTakenSeat(seat: TakenSeat): string {
  return JSON.stringify({ objectId: seat.object.id, spot: seat.spot });
}

// ---------- each piece's real shape ----------
// In metres from the middle of the piece's rectangle: x across the room, z
// towards its front (the room's door side), as the 3D floor draws it.

export type Shape =
  | { type: 'box'; x: number; z: number; w: number; d: number }
  | { type: 'ellipse'; x: number; z: number; rx: number; rz: number }
  | { type: 'circle'; x: number; z: number; r: number }
  /** A rope between two posts: from (x, z) by (dx, dz), `r` thick. */
  | { type: 'capsule'; x: number; z: number; dx: number; dz: number; r: number };

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

// The front of the room (SRS-105.4): a rail runs across at y = DOOR.y, with
// a gate in it in front of the casino's doors, and the foyer beyond it, up to
// the front wall, is floor too, so the player can walk through the gate to
// the doors and back.
const isWall = (x: number, y: number) => {
  if (y < Math.floor(FRONT_WALL_Y)) return x <= 0 || x >= COLS - 1 || y <= 1;
  // From the front wall's row on there's only the lobby (its walls are
  // solids, LOBBY_SOLIDS), and nothing beyond it.
  return x < doorMiddle - LOBBY.width / 2 - 1 || x >= doorMiddle + LOBBY.width / 2 + 1 || y >= FRONT_WALL_Y + LOBBY.depth + 1;
};

/** The gate in the rail: how far it reaches each side of the door's middle, in tiles (each of its two leaves is this long). */
export const GATE_HALF_WIDTH = 2;
const doorMiddle = DOOR.x + DOOR.w / 2;
/** The rail's depth, metres (its gold cap). */
const RAIL_DEPTH = 0.24;
/** The plants either side of the casino's doors, in the foyer (CasinoFront.tsx draws them), in tiles. */
export const FOYER_PLANTS: Point[] = [-1, 1].map((side) => ({ x: doorMiddle + side * 3.4, y: FRONT_WALL_Y - 0.7 }));

/** A shape in tiles: centred, measured in the room's tile grid. */
interface TileShape {
  shape: Shape;
  cx: number;
  cy: number;
  /** The piece it's part of; none for the rail and the foyer's plants. */
  object?: FloorObject;
}

const SOLIDS: TileShape[] = FLOOR_OBJECTS.flatMap((object) =>
  pieceLayout(object).solid.map((shape) => ({
    shape,
    cx: object.x + object.w / 2 + shape.x / TILE_METRES,
    cy: object.y + object.h / 2 + shape.z / TILE_METRES,
    object,
  }))
);

/** The rail either side of its gate, from x1 to x2 along y = DOOR.y. */
const railPiece = (x1: number, x2: number): TileShape => ({
  shape: { type: 'box', x: 0, z: 0, w: (x2 - x1) * TILE_METRES, d: RAIL_DEPTH },
  cx: (x1 + x2) / 2,
  cy: DOOR.y,
});

const FRONT_SOLIDS: TileShape[] = [
  railPiece(1, doorMiddle - GATE_HALF_WIDTH),
  railPiece(doorMiddle + GATE_HALF_WIDTH, COLS - 1),
  ...FOYER_PLANTS.map((plant) => ({ shape: { type: 'circle', x: 0, z: 0, r: 0.3 } as Shape, cx: plant.x, cy: plant.y })),
];

// ---------- the lobby's layout (SRS-103.12, SRS-107.6) ----------
// Where things stand in the lobby, in metres: `x` across from the middle of
// the casino's doorway, `z` out from the casino's front wall towards the
// building's front. Lobby.tsx and FrontDesk.tsx draw them here, and
// LOBBY_SOLIDS keeps a guest walking round the lobby out of them.

/** The lobby inside its walls, metres. */
export const LOBBY_SIZE = { width: LOBBY.width * TILE_METRES, depth: LOBBY.depth * TILE_METRES };
const LOBBY_HALF = LOBBY_SIZE.width / 2;
const LOBBY_MID = LOBBY_SIZE.depth / 2;

/** How far each column (and the chandelier and ceiling rose in line with it) is from the middle of the lobby's length, and its distance in from its wall. */
export const COLUMN_GAP = 2.4;
export const COLUMN_INSET = 0.6;
export const LOBBY_COLUMNS: { x: number; z: number }[] = [-1, 1].flatMap((side) =>
  [-1, 1].map((end) => ({ x: side * (LOBBY_HALF - COLUMN_INSET), z: LOBBY_MID + end * COLUMN_GAP }))
);

/** The curved front desk: its centre of curvature, the radius of its front, the angle its front spans (centred on +x, towards the lobby), and the radius its work surface reaches in to. */
export const FRONT_DESK = { x: -LOBBY_HALF - 0.4, z: LOBBY_MID, radius: 2.5, span: 1.66, inner: 2.5 - 0.85 };

/** The check-in tablets on the desk (SRS-103.13): the angles along its front they stand at, a little in from its edge, and how near a guest must be to use one. */
export const KIOSKS = [-0.3, 0.3];
export const KIOSK_INSET = 0.13;
export const KIOSK_REACH = 1.3;

/** Where a check-in tablet stands, in the lobby's metres. */
export function kioskSpot(kiosk: number): { x: number; z: number } {
  const angle = KIOSKS[kiosk] ?? 0;
  const r = FRONT_DESK.radius - KIOSK_INSET;
  return { x: FRONT_DESK.x + Math.cos(angle) * r, z: FRONT_DESK.z + Math.sin(angle) * r };
}

/** The benches against the side walls (`side` -1 the left wall, 1 the right), 1.4 m long. */
export const LOBBY_BENCHES: { side: -1 | 1; z: number }[] = [
  { side: -1, z: 1.15 },
  { side: 1, z: 1.15 },
];
export const BENCH_SIZE = { length: 1.4, depth: 0.5, fromWall: 0.45 };

/** The fountain against the right wall, facing the desk, and the posts of the rope round it, from column to column. */
export const FOUNTAIN = { x: LOBBY_HALF - 1.5, z: LOBBY_MID, radius: 1.12 };
export const FOUNTAIN_ROPE: { x: number; z: number }[] = [
  { x: LOBBY_HALF - 1.3, z: LOBBY_MID - COLUMN_GAP + 0.65 },
  { x: LOBBY_HALF - 2.6, z: LOBBY_MID - 1.4 },
  { x: LOBBY_HALF - 3.15, z: LOBBY_MID },
  { x: LOBBY_HALF - 2.6, z: LOBBY_MID + 1.4 },
  { x: LOBBY_HALF - 1.3, z: LOBBY_MID + COLUMN_GAP - 0.65 },
];

/** The roped aisle up to the casino's doors: posts either side of the carpet. */
export const DOOR_ROPE = { x: 1.5, posts: [1.3, 2.6, 3.9] };

/** Plants: either side of the casino's doors, and either side of the building's front doors. */
export const LOBBY_PLANTS: { x: number; z: number }[] = [
  ...[-1, 1].map((side) => ({ x: side * 2.4, z: 0.7 })),
  ...[-1, 1].map((side) => ({ x: side * 2.0, z: LOBBY_SIZE.depth - 0.8 })),
];

/** The giant dice on their plinth, and the luggage cart (turned by `turn`) with its bellhop at its push bar, `bellhop` metres along it. */
export const LOBBY_DICE = { x: 3.7, z: LOBBY_SIZE.depth - 1.4, radius: 0.62 };
export const LUGGAGE_CART = { x: -4.2, z: LOBBY_SIZE.depth - 0.85, turn: 0.25, bellhop: 1.08 };

/** A lobby position in metres to tiles. */
const lobbyTile = (x: number, z: number) => ({ cx: doorMiddle + x / TILE_METRES, cy: FRONT_WALL_Y + z / TILE_METRES });
const lobbyCircle = (x: number, z: number, r: number): TileShape => ({ shape: { type: 'circle', x: 0, z: 0, r }, ...lobbyTile(x, z) });
const lobbyBox = (x: number, z: number, w: number, d: number): TileShape => ({ shape: { type: 'box', x: 0, z: 0, w, d }, ...lobbyTile(x, z) });

const LOBBY_SOLIDS: TileShape[] = [
  // The casino's front wall, doors and all (a guest can't go in; a
  // logged-in player leaves through them only by the walk out), the side
  // walls, and the building's front, its glass doors shut.
  { shape: { type: 'box', x: 0, z: 0, w: COLS * TILE_METRES, d: 0.4 }, cx: COLS / 2, cy: FRONT_WALL_Y + 0.05 / TILE_METRES },
  ...[-1, 1].map((side) => lobbyBox(side * (LOBBY_HALF + 0.1), LOBBY_MID, 0.2, LOBBY_SIZE.depth)),
  lobbyBox(0, LOBBY_SIZE.depth + 0.15, LOBBY_SIZE.width, 0.3),
  ...LOBBY_COLUMNS.map(({ x, z }) => lobbyBox(x, z, 0.84, 0.84)),
  // The desk: circles along its curve, and its ends closed off to the wall so nobody walks round behind it.
  ...Array.from({ length: 7 }, (_, i) => {
    const angle = -FRONT_DESK.span / 2 + (i * FRONT_DESK.span) / 6;
    const r = (FRONT_DESK.radius + FRONT_DESK.inner) / 2 + 0.02;
    return lobbyCircle(FRONT_DESK.x + Math.cos(angle) * r, FRONT_DESK.z + Math.sin(angle) * r, 0.48);
  }),
  ...[-1, 1].map((end) => lobbyBox(-LOBBY_HALF + 0.4, FRONT_DESK.z + end * 1.55, 0.9, 0.7)),
  ...LOBBY_BENCHES.map(({ side, z }) => lobbyBox(side * (LOBBY_HALF - BENCH_SIZE.fromWall), z, BENCH_SIZE.depth, BENCH_SIZE.length)),
  ...LOBBY_PLANTS.map(({ x, z }) => lobbyCircle(x, z, 0.3)),
  // The roped aisle up to the casino's doors, and the fountain with the rope round it.
  ...[-1, 1].map((side) => lobbyBox(side * DOOR_ROPE.x, (DOOR_ROPE.posts[0]! + DOOR_ROPE.posts[2]!) / 2, 0.36, DOOR_ROPE.posts[2]! - DOOR_ROPE.posts[0]! + 0.36)),
  lobbyCircle(FOUNTAIN.x, FOUNTAIN.z, FOUNTAIN.radius + 0.05),
  ...FOUNTAIN_ROPE.slice(1).map((to, i) => {
    const from = FOUNTAIN_ROPE[i]!;
    return { shape: { type: 'capsule', x: 0, z: 0, dx: to.x - from.x, dz: to.z - from.z, r: 0.18 } as Shape, ...lobbyTile(from.x, from.z) };
  }),
  lobbyCircle(LOBBY_DICE.x, LOBBY_DICE.z, LOBBY_DICE.radius),
  lobbyCircle(LUGGAGE_CART.x, LUGGAGE_CART.z, 0.75),
  lobbyCircle(LUGGAGE_CART.x + Math.cos(LUGGAGE_CART.turn) * LUGGAGE_CART.bellhop, LUGGAGE_CART.z - Math.sin(LUGGAGE_CART.turn) * LUGGAGE_CART.bellhop, 0.3),
];

/** Everything the player bumps into, besides the walls. */
const BLOCKING: TileShape[] = [...SOLIDS, ...FRONT_SOLIDS, ...LOBBY_SOLIDS];

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
    case 'capsule': {
      // The distance to the line between its ends, less its thickness.
      const ex = shape.dx / TILE_METRES;
      const ey = shape.dz / TILE_METRES;
      const along = Math.max(0, Math.min(1, (dx * ex + dy * ey) / (ex * ex + ey * ey || 1)));
      return Math.hypot(dx - ex * along, dy - ey * along) - shape.r / TILE_METRES;
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
  return BLOCKING.some((solid) => distanceOutside(solid, x, y) < radius);
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

/** Whether a step from one tile to the next would go through the rail rather than its gate. */
function throughRail(from: Point, to: Point) {
  const crossing = Math.min(from.y, to.y) === DOOR.y - 1 && Math.max(from.y, to.y) === DOOR.y;
  return crossing && (to.x < doorMiddle - GATE_HALF_WIDTH || to.x >= doorMiddle + GATE_HALF_WIDTH);
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
      if (cameFrom.has(nextKey) || isBlocked(next.x, next.y) || throughRail(current, next)) continue;
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

// ---------- the gate in the rail (SRS-105.4) ----------

/** How far open the gate is, 0 shut to 1 open, and which way it's swung: 1 in onto the floor (towards the back of the room), -1 out into the foyer, 0 while shut. */
export interface GateState {
  open: number;
  way: -1 | 0 | 1;
}

export const GATE_SHUT: GateState = { open: 0, way: 0 };

/** Seconds the gate takes to swing open, or shut. */
export const GATE_SWING_SECONDS = 0.35;

/**
 * The gate `seconds` later, with the player at `at` having just `moved` (in
 * tiles). It swings open away from a player coming up to it, the way they're
 * walking, stays open while they're anywhere its leaves could swing through,
 * and swings shut once they're clear of them.
 */
export function stepGate(gate: GateState, at: Point, moved: Point, seconds: number): GateState {
  const toHinge = (side: number) => Math.hypot(at.x - (doorMiddle + side * GATE_HALF_WIDTH), at.y - DOOR.y);
  const clear = Math.min(toHinge(-1), toHinge(1)) > GATE_HALF_WIDTH + PLAYER_RADIUS + 0.2;
  const railAhead = DOOR.y - at.y;
  const comingUp = Math.abs(at.x - doorMiddle) < GATE_HALF_WIDTH + 1 && Math.abs(railAhead) < 2.4 && railAhead * moved.y > 0;
  let way = gate.way;
  if (way === 0 && comingUp) way = moved.y > 0 ? -1 : 1;
  const target = way !== 0 && (comingUp || !clear) ? 1 : 0;
  const step = seconds / GATE_SWING_SECONDS;
  const open = target === 1 ? Math.min(1, gate.open + step) : Math.max(0, gate.open - step);
  return { open, way: open === 0 && target === 0 ? 0 : way };
}

// ---------- leaving through the casino's doors (SRS-105.5) ----------

/** Whether the player at `at` is in reach of the casino's doors from the foyer (not the lobby's side): close enough to leave through them. */
export function atCasinoDoors(at: Point): boolean {
  return Math.abs(at.x - doorMiddle) < GATE_HALF_WIDTH && at.y > FRONT_WALL_Y - 2.4 && at.y < FRONT_WALL_Y;
}

/** The open tiles in reach of the casino's doors, from the foyer (or for a guest, from the lobby, SRS-103.15), where a click on the doors walks the player to. */
export function doorStandingSpots(fromLobby = false): Point[] {
  const inReach = fromLobby ? atCasinoDoorsFromLobby : atCasinoDoors;
  const spots: Point[] = [];
  for (let y = DOOR.y; y < FRONT_WALL_Y + 3; y++) {
    for (let x = doorMiddle - GATE_HALF_WIDTH; x < doorMiddle + GATE_HALF_WIDTH; x++) {
      if (!isBlocked(x, y) && inReach({ x: x + 0.5, y: y + 0.5 })) spots.push({ x, y });
    }
  }
  return spots;
}

/** The walk out, in tiles: from `from` (in reach of the doors) to just in front of them, then through them into the middle of the lobby, where a guest's walk in ends. */
export function exitWalk(from: Point): Point[] {
  const points = [from, { x: doorMiddle, y: Math.max(from.y, FRONT_WALL_Y - 1.1) }, { x: doorMiddle, y: FRONT_WALL_Y }, LOBBY_MIDDLE];
  return points.filter((point, i) => i === 0 || Math.hypot(point.x - points[i - 1]!.x, point.y - points[i - 1]!.y) > 1e-6);
}

// ---------- back where you were (SRS-107.7) ----------
// While the player walks about, the home page keeps where they stand in the
// browser tab (sessionStorage, under SPOT_KEY), so coming back to it puts
// them there again rather than at the door or outside.

export const SPOT_KEY = 'casino-floor-spot';

/** Where the player stood, in tiles, the way they faced, and the way the camera following them looked. */
export interface StoodSpot {
  x: number;
  y: number;
  heading: number;
  yaw: number;
}

export function serializeSpot(spot: StoodSpot): string {
  return JSON.stringify(spot);
}

/**
 * The remembered spot, if it's still somewhere this player may stand: in
 * the lobby for a guest, on the casino floor for a logged-in player, and
 * not inside a wall or anything standing there.
 */
export function parseSpot(raw: string | null, guest: boolean): StoodSpot | null {
  if (!raw) return null;
  let saved: unknown;
  try {
    saved = JSON.parse(raw);
  } catch {
    return null;
  }
  const { x, y, heading, yaw } = (saved ?? {}) as Partial<Record<keyof StoodSpot, unknown>>;
  const numbers = [x, y, heading, yaw];
  if (!numbers.every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
  const spot = { x, y, heading, yaw } as StoodSpot;
  if (guest !== spot.y > FRONT_WALL_Y) return null;
  return circleBlocked(spot.x, spot.y, PLAYER_RADIUS) ? null : spot;
}

// ---------- the check-in kiosk (SRS-103.13) ----------

/** The check-in tablet a guest at `at` (in tiles, in the lobby) is near enough to use, the nearer of the two: its index in KIOSKS, or null. */
export function atKiosk(at: Point): number | null {
  if (at.y <= FRONT_WALL_Y) return null;
  const x = (at.x - doorMiddle) * TILE_METRES;
  const z = (at.y - FRONT_WALL_Y) * TILE_METRES;
  let nearest: number | null = null;
  let best = KIOSK_REACH;
  KIOSKS.forEach((_, kiosk) => {
    const spot = kioskSpot(kiosk);
    const distance = Math.hypot(x - spot.x, z - spot.z);
    if (distance < best) {
      best = distance;
      nearest = kiosk;
    }
  });
  return nearest;
}

/** The open tiles in reach of a check-in tablet, where a click on it walks the guest to. */
export function kioskStandingSpots(kiosk: number): Point[] {
  const spots: Point[] = [];
  for (let y = Math.ceil(FRONT_WALL_Y); y < FRONT_WALL_Y + LOBBY.depth; y++) {
    for (let x = Math.floor(doorMiddle - LOBBY.width / 2); x < doorMiddle + LOBBY.width / 2; x++) {
      if (!isBlocked(x, y) && atKiosk({ x: x + 0.5, y: y + 0.5 }) === kiosk) spots.push({ x, y });
    }
  }
  return spots;
}


// ---------- into the casino after checking in (SRS-103.14) ----------

/** The walk from the front desk onto the casino floor once a guest has logged in at a check-in tablet, from where they stand: a step back from the desk to in front of its middle (clear of the roped aisle's end), across to the middle of the lobby, then on the way the walk in goes, through the casino's doors and the gate. */
export function checkInWalk(from: Point): Point[] {
  const offDesk = { x: doorMiddle + (FRONT_DESK.x + FRONT_DESK.radius + 1) / TILE_METRES, y: FRONT_WALL_Y + FRONT_DESK.z / TILE_METRES };
  const points = [from, offDesk, LOBBY_MIDDLE, ...entranceWalk().slice(2)];
  return points.filter((point, i) => i === 0 || Math.hypot(point.x - points[i - 1]!.x, point.y - points[i - 1]!.y) > 1e-6);
}

// ---------- casino doors for guests (SRS-103.15) ----------
// A guest can't go through the casino's doors (they're solid from the
// lobby's side). Using them walks the guest to the front desk instead, to
// check in at a tablet there.

/** Whether a guest at `at` is in reach of the casino's doors from the lobby's side. */
export function atCasinoDoorsFromLobby(at: Point): boolean {
  return Math.abs(at.x - doorMiddle) < GATE_HALF_WIDTH && at.y > FRONT_WALL_Y && at.y < FRONT_WALL_Y + 2.4;
}

/** Where a guest stands to use a check-in tablet, in tiles: just in front of it, on the lobby's side of the desk. */
export function kioskStand(kiosk: number): Point {
  const angle = KIOSKS[kiosk] ?? 0;
  const r = FRONT_DESK.radius + 0.55;
  return { x: doorMiddle + (FRONT_DESK.x + Math.cos(angle) * r) / TILE_METRES, y: FRONT_WALL_Y + (FRONT_DESK.z + Math.sin(angle) * r) / TILE_METRES };
}

/** Whether the player (or a circle of `radius` tiles) can go in a straight line from `a` to `b` (tiles) without touching anything. */
export function clearLine(a: Point, b: Point, radius = PLAYER_RADIUS): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.05));
  for (let i = 0; i <= steps; i++) {
    if (circleBlocked(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps, radius)) return false;
  }
  return true;
}

/** How far the walk to the desk keeps off whatever it passes, beyond the player's own width, in tiles. */
const PASSING_ROOM = 0.1;

/**
 * The walk from `from` (tiles, in the lobby) to stand at the check-in tablet
 * it's the shorter walk to: the shortest way round anything in the way,
 * straightened wherever it can go straight. Null if neither can be reached.
 */
export function deskWalk(from: Point): { kiosk: number; points: Point[] } | null {
  let best: { kiosk: number; points: Point[]; length: number } | null = null;
  KIOSKS.forEach((_, kiosk) => {
    const stand = kioskStand(kiosk);
    const tiles = findPath({ x: Math.floor(from.x), y: Math.floor(from.y) }, [{ x: Math.floor(stand.x), y: Math.floor(stand.y) }]);
    if (!tiles) return;
    const steps = [from, ...tiles.slice(0, -1).map((tile) => ({ x: tile.x + 0.5, y: tile.y + 0.5 })), stand];
    // From each point, on to the furthest one there's a clear line to.
    const points = [from];
    for (let i = 0; i < steps.length - 1; ) {
      let j = steps.length - 1;
      while (j > i + 1 && !clearLine(steps[i]!, steps[j]!, PLAYER_RADIUS + PASSING_ROOM)) j--;
      points.push(steps[j]!);
      i = j;
    }
    const length = points.slice(1).reduce((sum, point, i) => sum + Math.hypot(point.x - points[i]!.x, point.y - points[i]!.y), 0);
    if (!best || length < best.length) best = { kiosk, points, length };
  });
  if (!best) return null;
  const { kiosk, points } = best;
  return { kiosk, points };
}
