import { describe, expect, it } from 'vitest';
import {
  COLS,
  DOOR,
  FLOOR_OBJECTS,
  FOYER_PLANTS,
  KIOSKS,
  atKiosk,
  checkInWalk,
  kioskStandingSpots,
  parseSpot,
  serializeSpot,
  FOUNTAIN,
  FOUNTAIN_ROPE,
  FRONT_DESK,
  LOBBY_SIZE,
  atCasinoDoors,
  doorStandingSpots,
  exitWalk,
  FRONT_WALL_Y,
  GATE_HALF_WIDTH,
  GATE_SHUT,
  GATE_SWING_SECONDS,
  LOBBY,
  LOBBY_MIDDLE,
  INTERACTIVE_OBJECTS,
  ROWS,
  START,
  TILE_METRES,
  entranceWalk,
  findPath,
  isBlocked,
  moveWithCollisions,
  chairTile,
  nearbyObjectAt,
  parseTakenSeat,
  serializeTakenSeat,
  nearestChair,
  nearestScreen,
  PLAYER_RADIUS,
  pieceLayout,
  standingSpots,
  stepGate,
  type GateState,
  type Point,
} from '../../lib/casinoFloor';
import { GAMES } from '../../lib/games';

const byId = (id: string) => FLOOR_OBJECTS.find((object) => object.id === id)!;

describe('the casino floor', () => {
  it('has every game on the home page list, plus the shop (SRS-107.1)', () => {
    const ids = INTERACTIVE_OBJECTS.map((object) => object.id);
    for (const game of GAMES) expect(ids).toContain(game.id);
    expect(ids).toContain('shop');
  });

  it('keeps every object inside the room, with nothing overlapping', () => {
    const taken = new Set<string>();
    for (const object of FLOOR_OBJECTS) {
      for (let y = object.y; y < object.y + object.h; y++) {
        for (let x = object.x; x < object.x + object.w; x++) {
          expect(x > 0 && x < COLS - 1 && y > 1 && y < ROWS - 1, `${object.id} at ${x},${y}`).toBe(true);
          expect(taken.has(`${x},${y}`), `${object.id} overlaps at ${x},${y}`).toBe(false);
          taken.add(`${x},${y}`);
        }
      }
    }
  });

  it('starts the player on an open tile', () => {
    expect(isBlocked(START.x, START.y)).toBe(false);
  });

  it('blocks the walls and anything standing on the floor', () => {
    expect(isBlocked(0, 5)).toBe(true); // left wall
    expect(isBlocked(5, 1)).toBe(true); // back wall
    expect(isBlocked(5, Math.floor(FRONT_WALL_Y))).toBe(true); // front wall
    const poker = byId('poker');
    expect(isBlocked(poker.x + 1, poker.y + 1)).toBe(true);
    expect(isBlocked(poker.x - 1, poker.y + 1)).toBe(false);
  });

  it('can walk from the door to every game and the shop', () => {
    for (const object of INTERACTIVE_OBJECTS) {
      expect(findPath(START, standingSpots(object)), object.id).not.toBeNull();
    }
  });
});

describe('walking somewhere', () => {
  it('takes the shortest way, one tile at a time, around anything in the way', () => {
    const path = findPath({ x: 9, y: 7 }, [{ x: 16, y: 7 }])!;
    expect(path).toHaveLength(7);
    for (const step of path) expect(isBlocked(step.x, step.y)).toBe(false);
  });

  it('is empty when already there, and null when the target is unreachable', () => {
    expect(findPath(START, [START])).toEqual([]);
    expect(findPath(START, [{ x: 0, y: 0 }])).toBeNull();
  });

  it('can walk all the way round the poker table, between it and its chairs and the pillars', () => {
    const path = findPath({ x: 9, y: 7 }, [{ x: 16, y: 7 }])!;
    expect(path).toHaveLength(7);
  });
});

describe('moving freely (the 3D floor)', () => {
  it('walks across open floor', () => {
    expect(moveWithCollisions({ x: 12.5, y: 12.5 }, { x: 0.4, y: -0.4 })).toEqual({ x: 12.9, y: 12.1 });
  });

  it('stops at a wall', () => {
    const moved = moveWithCollisions({ x: 1.5, y: 7.5 }, { x: -0.4, y: 0 });
    expect(moved).toEqual({ x: 1.5, y: 7.5 });
  });

  it('slides along the poker table instead of stopping dead', () => {
    // Walking up and to the right into the front of the table, between two chairs.
    const moved = moveWithCollisions({ x: 12.9, y: 7.0 }, { x: 0.2, y: -0.6 });
    expect(moved.x).toBeCloseTo(13.1);
    expect(moved.y).toBeCloseTo(7.0);
  });

  it("blocks only a table's real shape: the poker table's square corners are open floor", () => {
    const poker = byId('poker');
    expect(isBlocked(poker.x, poker.y)).toBe(false);
    expect(isBlocked(poker.x + poker.w - 1, poker.y)).toBe(false);
    expect(isBlocked(poker.x + 3, poker.y + 1)).toBe(true);
  });

  it('bumps into the chairs and the dealer too', () => {
    const poker = byId('poker');
    const { chairs, dealer } = pieceLayout(poker);
    const toTiles = (x: number, z: number) => ({ x: poker.x + poker.w / 2 + x / 0.8, y: poker.y + poker.h / 2 + z / 0.8 });
    const chair = toTiles(chairs[2]!.x, chairs[2]!.z);
    expect(moveWithCollisions({ x: chair.x, y: chair.y + 0.75 }, { x: 0, y: -0.3 }).y).toBeCloseTo(chair.y + 0.75);
    expect(dealer).toBeDefined();
    const at = toTiles(dealer!.x, dealer!.z);
    expect(moveWithCollisions({ x: at.x, y: at.y - 0.7 }, { x: 0, y: 0.3 }).y).toBeCloseTo(at.y - 0.7);
  });

  it('seats every dealer just behind their table, inside its rectangle', () => {
    for (const id of ['poker', 'blackjack', 'roulette', 'shop']) {
      const object = byId(id);
      const { dealer } = pieceLayout(object);
      expect(dealer, id).toBeDefined();
      expect(Math.abs(dealer!.z), id).toBeLessThanOrEqual((object.h * 0.8) / 2);
    }
  });

  it('finds the game within reach of a point, and none further away', () => {
    expect(nearbyObjectAt({ x: 13, y: 7.1 })?.id).toBe('poker');
    expect(nearbyObjectAt({ x: 13, y: 8.6 })?.id).toBe('shop');
    expect(nearbyObjectAt({ x: 8.5, y: 12.5 })).toBeNull();
  });
});

describe('taking a seat', () => {
  it('picks the chair nearest the player, to outline and sit in', () => {
    const poker = byId('poker');
    const chairs = pieceLayout(poker).chairs;
    chairs.forEach((seat, i) => {
      const at = chairTile(poker, seat);
      expect(nearestChair(poker, { x: at.x + 0.1, y: at.y + 0.4 })).toBe(i);
    });
  });

  it('seats every table, and gives the slots their stools', () => {
    for (const id of ['poker', 'blackjack', 'roulette', 'slots']) {
      const layout = pieceLayout(byId(id));
      expect(layout.chairs.length, id).toBeGreaterThan(0);
      expect(layout.seatedHands, id).toBeDefined();
    }
  });

  it('spaces the blackjack and roulette chairs about a metre apart', () => {
    for (const id of ['blackjack', 'roulette']) {
      const { chairs } = pieceLayout(byId(id));
      for (let i = 1; i < chairs.length; i++) {
        const gap = Math.hypot(chairs[i]!.x - chairs[i - 1]!.x, chairs[i]!.z - chairs[i - 1]!.z);
        expect(gap, id).toBeGreaterThan(1);
      }
    }
  });

  it('looks ahead at the slot reels once seated, not back over the player', () => {
    const view = pieceLayout(byId('slots')).seatedView!;
    expect(view.lookAhead).toBeGreaterThan(view.ahead);
  });

  it('zooms into the nearer of the sports bar screens, and the shop has no chair', () => {
    const sports = byId('sports-betting');
    expect(nearestChair(sports, { x: 20, y: 11 })).toBeNull();
    expect(nearestScreen(sports, { x: 20, y: 11 })).toBe(0);
    expect(nearestScreen(sports, { x: 23, y: 11 })).toBe(1);
    expect(nearestChair(byId('shop'), { x: 13, y: 8.6 })).toBeNull();
  });
});

describe('getting up after a game (SRS-108.6)', () => {
  const object = (id: string) => INTERACTIVE_OBJECTS.find((candidate) => candidate.id === id)!;

  it('remembers the chair taken at a table, and reads it back', () => {
    const poker = object('poker');
    const raw = serializeTakenSeat({ object: poker, spot: 3 });
    expect(JSON.parse(raw)).toEqual({ objectId: 'poker', spot: 3 });
    expect(parseTakenSeat(raw)).toEqual({ object: poker, spot: 3 });
  });

  it('remembers a screen at the sports bar, and no seat at the shop counter', () => {
    const bar = object('sports-betting');
    expect(parseTakenSeat(serializeTakenSeat({ object: bar, spot: 1 }))).toEqual({ object: bar, spot: 1 });
    const shop = object('shop');
    expect(parseTakenSeat(serializeTakenSeat({ object: shop, spot: null }))).toEqual({ object: shop, spot: null });
  });

  it('ignores nothing, garbage, an unknown game, or a chair the table does not have', () => {
    const chairs = pieceLayout(object('blackjack')).chairs.length;
    for (const raw of [
      null,
      '',
      'not json',
      'null',
      JSON.stringify({ objectId: 'plant-1', spot: null }),
      JSON.stringify({ objectId: 'baccarat', spot: 0 }),
      JSON.stringify({ objectId: 'blackjack', spot: chairs }),
      JSON.stringify({ objectId: 'blackjack', spot: -1 }),
      JSON.stringify({ objectId: 'blackjack', spot: 1.5 }),
      JSON.stringify({ objectId: 'blackjack', spot: '0' }),
    ]) {
      expect(parseTakenSeat(raw), String(raw)).toBeNull();
    }
    expect(parseTakenSeat(JSON.stringify({ objectId: 'blackjack', spot: chairs - 1 }))).not.toBeNull();
  });
});

describe('walking in (SRS-103.12)', () => {
  const walk = entranceWalk();
  const [outside, frontDoor, casinoDoors, gate] = walk;
  const inside = walk[walk.length - 1]!;
  // The casino doorway's opening, kept clear of its frame by the player's width.
  const inDoorway = (x: number) => x - PLAYER_RADIUS >= DOOR.x && x + PLAYER_RADIUS <= DOOR.x + DOOR.w;

  it('starts outside the building, beyond the front of the lobby', () => {
    expect(outside!.y).toBeGreaterThan(FRONT_WALL_Y + LOBBY.depth);
  });

  it('comes in through the front door, crosses the lobby, the casino doors and the foyer, then the gate', () => {
    expect(frontDoor!.y).toBe(FRONT_WALL_Y + LOBBY.depth);
    expect(casinoDoors!.y).toBe(FRONT_WALL_Y);
    expect(gate!.y).toBe(DOOR.y);
    // All in a straight line down the middle of the door, so it never meets the rail.
    for (const point of walk) expect(inDoorway(point.x), JSON.stringify(point)).toBe(true);
    expect(new Set(walk.map((point) => point.x)).size).toBe(1);
    for (let i = 1; i < walk.length; i++) expect(walk[i]!.y).toBeLessThan(walk[i - 1]!.y);
  });

  it('ends a couple of steps onto the floor, where the player can stand and walk off', () => {
    expect(inside.y).toBeLessThanOrEqual(DOOR.y - 2);
    // Every tile the player's circle touches there is open.
    for (const dx of [-PLAYER_RADIUS, PLAYER_RADIUS]) {
      for (const dy of [-PLAYER_RADIUS, PLAYER_RADIUS]) {
        expect(isBlocked(Math.floor(inside.x + dx), Math.floor(inside.y + dy))).toBe(false);
      }
    }
  });

  it("ends out of every game's reach, so no prompt pops up the moment the player takes over", () => {
    expect(nearbyObjectAt(inside)).toBeNull();
  });

  it("stops a guest's walk in the middle of the lobby, short of the casino's doors", () => {
    const guest = entranceWalk(true);
    expect(guest.slice(0, 2)).toEqual(walk.slice(0, 2));
    expect(guest[guest.length - 1]).toEqual(LOBBY_MIDDLE);
    for (const point of guest) expect(point.y).toBeGreaterThan(FRONT_WALL_Y);
    expect(LOBBY_MIDDLE.y).toBeLessThan(FRONT_WALL_Y + LOBBY.depth);
  });

  it('keeps the lobby centred on the door and wider than it', () => {
    expect(LOBBY.width).toBeGreaterThan(DOOR.w);
  });

  it('puts the front wall past the rail, with a foyer between', () => {
    expect(FRONT_WALL_Y).toBeGreaterThan(DOOR.y + 3);
  });
});

describe('the gate in the rail at the front of the floor (SRS-105.4)', () => {
  const middle = DOOR.x + DOOR.w / 2;
  // Walks from `from` by `step` a frame, `frames` times, swinging the gate as it goes.
  const walk = (from: Point, step: Point, frames: number, gate: GateState = GATE_SHUT) => {
    let at = from;
    let now = gate;
    const seen: GateState[] = [];
    for (let i = 0; i < frames; i++) {
      at = moveWithCollisions(at, step);
      now = stepGate(now, at, step, 1 / 60);
      seen.push(now);
    }
    return { at, gate: now, seen };
  };
  const pace = 0.04; // tiles a frame, about walking pace

  it('lets the player through the gate both ways, but not through the rail beside it', () => {
    expect(walk({ x: middle, y: DOOR.y - 1 }, { x: 0, y: pace }, 60).at.y).toBeGreaterThan(DOOR.y + 1);
    expect(walk({ x: middle, y: DOOR.y + 1.5 }, { x: 0, y: -pace }, 60).at.y).toBeLessThan(DOOR.y - 0.5);
    for (const x of [3.5, middle - GATE_HALF_WIDTH - 1, middle + GATE_HALF_WIDTH + 1, COLS - 3.5]) {
      expect(walk({ x, y: DOOR.y - 1 }, { x: 0, y: pace }, 60).at.y, `at x ${x}`).toBeLessThan(DOOR.y - PLAYER_RADIUS + 0.01);
    }
  });

  it('makes the foyer floor, up to the front wall, with its plants in the way', () => {
    expect(isBlocked(5, DOOR.y + 1)).toBe(false);
    expect(isBlocked(5, Math.floor(FRONT_WALL_Y) - 1)).toBe(false);
    for (const plant of FOYER_PLANTS) expect(isBlocked(Math.floor(plant.x), Math.floor(plant.y))).toBe(true);
  });

  it('walks a click through the gate, never through the rail', () => {
    const path = findPath(START, [{ x: 3, y: DOOR.y + 1 }])!;
    expect(path).not.toBeNull();
    let previous: Point = START;
    for (const step of path) {
      if (Math.min(previous.y, step.y) === DOOR.y - 1 && Math.max(previous.y, step.y) === DOOR.y) {
        expect(Math.abs(step.x + 0.5 - middle)).toBeLessThan(GATE_HALF_WIDTH);
      }
      previous = step;
    }
  });

  it('stays shut for a player standing beside it or walking along the rail elsewhere', () => {
    expect(walk({ x: middle, y: DOOR.y - 1 }, { x: 0, y: 0 }, 30).gate).toEqual(GATE_SHUT);
    expect(walk({ x: 4.5, y: DOOR.y - 1.5 }, { x: 0, y: pace }, 60).gate).toEqual(GATE_SHUT);
  });

  it('swings away from the player, out into the foyer from the floor and in onto the floor from the foyer, open before they reach it', () => {
    const jog = 3.1 / 60 / TILE_METRES; // tiles a frame at jogging pace
    for (const [start, dir, way] of [[DOOR.y - 2.5, 1, -1], [DOOR.y + 2.5, -1, 1]] as const) {
      let at = { x: middle, y: start };
      let gate = GATE_SHUT;
      while (Math.abs(at.y - DOOR.y) > PLAYER_RADIUS) {
        at = moveWithCollisions(at, { x: 0, y: dir * jog });
        gate = stepGate(gate, at, { x: 0, y: dir * jog }, 1 / 60);
      }
      expect(gate).toEqual({ open: 1, way });
    }
  });

  it('stays open while the player is in its swing, then shuts behind them and can swing the other way next time', () => {
    const through = walk({ x: middle, y: DOOR.y - 2 }, { x: 0, y: pace }, 60);
    // Standing in the gateway, it stays open.
    const standing = walk({ x: middle, y: DOOR.y + 0.3 }, { x: 0, y: 0 }, 30, through.gate);
    expect(standing.gate.open).toBe(1);
    // Clear of its leaves, it swings shut, and forgets which way it went.
    const away = walk(through.at, { x: 0, y: pace }, 100, through.gate);
    expect(away.at.y).toBeGreaterThan(DOOR.y + GATE_HALF_WIDTH + PLAYER_RADIUS);
    expect(away.gate).toEqual(GATE_SHUT);
    // Never shut on them: open all the while they're within reach of its leaves.
    let at = through.at;
    let gate = through.gate;
    for (let i = 0; i < 100; i++) {
      at = { x: at.x, y: at.y + pace };
      gate = stepGate(gate, at, { x: 0, y: pace }, 1 / 60);
      const reach = Math.min(Math.hypot(at.x - (middle - GATE_HALF_WIDTH), at.y - DOOR.y), Math.hypot(at.x - (middle + GATE_HALF_WIDTH), at.y - DOOR.y));
      if (reach < GATE_HALF_WIDTH + PLAYER_RADIUS) expect(gate.open).toBe(1);
    }
    // Coming back, it swings the other way.
    expect(walk(away.at, { x: 0, y: -pace }, 60, away.gate).gate.way).toBe(1);
    expect(GATE_SWING_SECONDS).toBeLessThan(0.5);
  });
});

describe("leaving through the casino's doors (SRS-105.5)", () => {
  const middle = DOOR.x + DOOR.w / 2;

  it('counts the player as at the doors only in the foyer, right in front of them', () => {
    expect(atCasinoDoors({ x: middle, y: Math.floor(FRONT_WALL_Y) - PLAYER_RADIUS })).toBe(true);
    expect(atCasinoDoors(START)).toBe(false);
    expect(atCasinoDoors({ x: middle, y: DOOR.y + 0.5 })).toBe(false); // by the gate
    expect(atCasinoDoors({ x: middle - GATE_HALF_WIDTH - 1, y: FRONT_WALL_Y - 0.5 })).toBe(false); // off to the side
    expect(atCasinoDoors(LOBBY_MIDDLE)).toBe(false); // on the lobby's side
    expect(atCasinoDoors({ x: middle, y: FRONT_WALL_Y + 0.5 })).toBe(false);
  });

  it('walks a click on the doors to an open spot in reach of them, through the gate', () => {
    const spots = doorStandingSpots();
    expect(spots.length).toBeGreaterThan(0);
    for (const spot of spots) {
      expect(isBlocked(spot.x, spot.y)).toBe(false);
      expect(atCasinoDoors({ x: spot.x + 0.5, y: spot.y + 0.5 })).toBe(true);
    }
    expect(findPath(START, spots)).not.toBeNull();
  });

  it("walks out through the doors into the middle of the lobby, where a guest's walk in ends", () => {
    for (const spot of doorStandingSpots()) {
      const from = { x: spot.x + 0.5, y: spot.y + 0.5 };
      const walk = exitWalk(from);
      expect(walk[0]).toEqual(from);
      // After stepping across to the middle, it's straight down it, never back.
      for (const point of walk.slice(1)) expect(point.x).toBe(middle);
      for (let i = 1; i < walk.length; i++) expect(walk[i]!.y).toBeGreaterThanOrEqual(walk[i - 1]!.y);
      expect(walk.map((point) => point.y)).toContain(FRONT_WALL_Y);
      expect(walk[walk.length - 1]).toEqual(LOBBY_MIDDLE);
    }
  });
});

describe('walking around the lobby (SRS-107.6)', () => {
  const middle = DOOR.x + DOOR.w / 2;
  // A lobby position in metres to tiles, as the layout gives them.
  const tile = (x: number, z: number): Point => ({ x: middle + x / TILE_METRES, y: FRONT_WALL_Y + z / TILE_METRES });
  const walkFrom = (from: Point, step: Point, frames: number) => {
    let at = from;
    for (let i = 0; i < frames; i++) at = moveWithCollisions(at, step);
    return at;
  };
  const pace = 0.05;

  it('lets a guest walk about from the middle of the lobby', () => {
    expect(isBlocked(Math.floor(LOBBY_MIDDLE.x), Math.floor(LOBBY_MIDDLE.y))).toBe(false);
    for (const step of [{ x: 0, y: pace }, { x: -pace, y: 0 }, { x: pace, y: 0 }, { x: 0, y: -pace }]) {
      const at = walkFrom(LOBBY_MIDDLE, step, 20);
      expect(Math.hypot(at.x - LOBBY_MIDDLE.x, at.y - LOBBY_MIDDLE.y), JSON.stringify(step)).toBeGreaterThan(0.9);
    }
  });

  it('keeps them inside its walls: the casino doors, the front doors and the sides', () => {
    const north = walkFrom(LOBBY_MIDDLE, { x: 0, y: -pace }, 400);
    expect(north.y).toBeGreaterThan(FRONT_WALL_Y);
    const south = walkFrom(LOBBY_MIDDLE, { x: 0, y: pace }, 400);
    expect(south.y).toBeLessThan(FRONT_WALL_Y + LOBBY.depth);
    const side = walkFrom(tile(0, LOBBY_SIZE.depth - 2.5), { x: -pace, y: 0 }, 400);
    expect(side.x).toBeGreaterThan(middle - LOBBY.width / 2);
    // And a player in the casino's foyer can't walk out into the lobby.
    expect(walkFrom({ x: middle, y: FRONT_WALL_Y - 0.6 }, { x: 0, y: pace }, 200).y).toBeLessThan(FRONT_WALL_Y);
  });

  it('stops them at the front desk, and never lets them round behind it', () => {
    const front = tile(FRONT_DESK.x + FRONT_DESK.radius, FRONT_DESK.z);
    const atDesk = walkFrom(LOBBY_MIDDLE, { x: -pace, y: 0 }, 400);
    expect(atDesk.x).toBeGreaterThan(front.x);
    // Close enough to use it, though.
    expect(atDesk.x - front.x).toBeLessThan(0.8);
    const behind = tile(FRONT_DESK.x + FRONT_DESK.inner - 0.4, FRONT_DESK.z);
    expect(findPath(atDeskTile(atDesk), [{ x: Math.floor(behind.x), y: Math.floor(behind.y) }])).toBeNull();
  });

  it('keeps them out of the roped-off fountain', () => {
    const atRope = walkFrom(LOBBY_MIDDLE, { x: pace, y: 0 }, 400);
    expect(atRope.x).toBeLessThan(tile(FOUNTAIN_ROPE[2]!.x, 0).x);
    const fountain = tile(FOUNTAIN.x, FOUNTAIN.z);
    expect(findPath({ x: Math.floor(LOBBY_MIDDLE.x), y: Math.floor(LOBBY_MIDDLE.y) }, [{ x: Math.floor(fountain.x) - 1, y: Math.floor(fountain.y) }])).toBeNull();
  });

  it("walks a click about the lobby, but never into the casino", () => {
    const from = { x: Math.floor(LOBBY_MIDDLE.x), y: Math.floor(LOBBY_MIDDLE.y) };
    expect(findPath(from, [{ x: from.x - 3, y: from.y + 4 }])).not.toBeNull();
    expect(findPath(from, [START])).toBeNull();
  });
});

function atDeskTile(at: Point): Point {
  return { x: Math.floor(at.x), y: Math.floor(at.y) };
}

describe('back where you were (SRS-107.7)', () => {
  const onFloor = { x: START.x + 0.5, y: START.y + 0.5, heading: 1.2, yaw: -0.4 };
  const inLobby = { x: LOBBY_MIDDLE.x - 1, y: LOBBY_MIDDLE.y + 1.5, heading: 0.3, yaw: 2.1 };

  it("remembers a logged-in player's spot on the casino floor, and a guest's in the lobby", () => {
    expect(parseSpot(serializeSpot(onFloor), false)).toEqual(onFloor);
    expect(parseSpot(serializeSpot(inLobby), true)).toEqual(inLobby);
  });

  it('puts nobody where they may no longer stand', () => {
    // A guest now (their session ended) can't be put back on the floor, and
    // a logged-in player isn't put back in the lobby.
    expect(parseSpot(serializeSpot(onFloor), true)).toBeNull();
    expect(parseSpot(serializeSpot(inLobby), false)).toBeNull();
    // Nor inside anything: a wall, the poker table.
    expect(parseSpot(serializeSpot({ ...onFloor, x: 0.2 }), false)).toBeNull();
    const poker = FLOOR_OBJECTS.find((object) => object.id === 'poker')!;
    expect(parseSpot(serializeSpot({ ...onFloor, x: poker.x + poker.w / 2, y: poker.y + poker.h / 2 }), false)).toBeNull();
  });

  it('ignores anything that is not a remembered spot', () => {
    for (const raw of [null, '', 'not json', '{}', '{"x":1,"y":2}', JSON.stringify({ ...onFloor, x: 'left' }), JSON.stringify({ ...onFloor, y: Infinity })]) {
      expect(parseSpot(raw, false), String(raw)).toBeNull();
    }
  });
});

describe('the check-in kiosk (SRS-103.13)', () => {
  it('lets a guest at the front desk use the tablet they are nearest', () => {
    // Walking straight to the desk from the middle of the lobby.
    let at = LOBBY_MIDDLE;
    for (let i = 0; i < 400; i++) at = moveWithCollisions(at, { x: -0.05, y: 0 });
    expect(atKiosk(at)).not.toBeNull();
    // Each tablet has somewhere open to stand in reach of it, reachable from the middle.
    KIOSKS.forEach((_, kiosk) => {
      const spots = kioskStandingSpots(kiosk);
      expect(spots.length, `kiosk ${kiosk}`).toBeGreaterThan(0);
      for (const spot of spots) expect(atKiosk({ x: spot.x + 0.5, y: spot.y + 0.5 })).toBe(kiosk);
      expect(findPath({ x: Math.floor(LOBBY_MIDDLE.x), y: Math.floor(LOBBY_MIDDLE.y) }, spots)).not.toBeNull();
    });
  });

  it('is out of reach from the middle of the lobby, and from the casino floor', () => {
    expect(atKiosk(LOBBY_MIDDLE)).toBeNull();
    expect(atKiosk({ x: START.x + 0.5, y: START.y + 0.5 })).toBeNull();
  });
});

describe('into the casino after checking in (SRS-103.14)', () => {
  const middle = DOOR.x + DOOR.w / 2;
  // Walking a straight line in small steps, the way the player's moved: nothing in the way stops them.
  const unblocked = (from: Point, to: Point) => {
    const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 0.05);
    const step = { x: (to.x - from.x) / steps, y: (to.y - from.y) / steps };
    let at = from;
    for (let i = 0; i < steps; i++) {
      const next = moveWithCollisions(at, step);
      if (Math.hypot(next.x - at.x - step.x, next.y - at.y - step.y) > 1e-9) return false;
      at = next;
    }
    return true;
  };

  // Where a guest can stand at each tablet, and get to from the middle of the lobby.
  const lobbyMiddle = { x: Math.floor(LOBBY_MIDDLE.x), y: Math.floor(LOBBY_MIDDLE.y) };
  const atTablets = KIOSKS.flatMap((_, kiosk) => kioskStandingSpots(kiosk).filter((spot) => findPath(lobbyMiddle, [spot]) !== null));

  it('steps back from wherever the guest stood at a tablet and crosses to the middle of the lobby, clear of everything', () => {
    expect(atTablets.length).toBeGreaterThan(1);
    for (const spot of atTablets) {
      const from = { x: spot.x + 0.5, y: spot.y + 0.5 };
      const walk = checkInWalk(from);
      expect(walk[0]).toEqual(from);
      expect(walk[2]).toEqual(LOBBY_MIDDLE);
      expect(atKiosk(walk[1]!)).toBeNull();
      expect(unblocked(from, walk[1]!) && unblocked(walk[1]!, LOBBY_MIDDLE), JSON.stringify(from)).toBe(true);
    }
  });

  it("then goes on as the walk in does, straight up the middle through the casino's doors and the gate onto the floor", () => {
    const walk = checkInWalk({ x: atTablets[0]!.x + 0.5, y: atTablets[0]!.y + 0.5 });
    expect(walk.slice(3)).toEqual(entranceWalk().slice(2));
    for (const point of walk.slice(2)) expect(point.x).toBe(middle);
    for (let i = 3; i < walk.length; i++) expect(walk[i]!.y).toBeLessThan(walk[i - 1]!.y);
    // Up the roped aisle to just short of the doors, nothing's in the way.
    expect(unblocked(LOBBY_MIDDLE, { x: middle, y: FRONT_WALL_Y + 1 })).toBe(true);
  });
});
