import { describe, expect, it } from 'vitest';
import {
  COLS,
  DOOR,
  FLOOR_OBJECTS,
  FRONT_WALL_Y,
  LOBBY,
  LOBBY_MIDDLE,
  INTERACTIVE_OBJECTS,
  ROWS,
  START,
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
    expect(isBlocked(5, ROWS - 1)).toBe(true); // front wall
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

  it('puts the front wall past the rail, with a foyer between that nobody walks in', () => {
    expect(FRONT_WALL_Y).toBeGreaterThan(DOOR.y + 3);
    // The floor ends at the rail: the foyer's tiles are all wall.
    for (let y = DOOR.y; y < FRONT_WALL_Y; y++) expect(isBlocked(DOOR.x, y)).toBe(true);
  });
});
