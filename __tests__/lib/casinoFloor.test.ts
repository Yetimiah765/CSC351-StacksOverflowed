import { describe, expect, it } from 'vitest';
import {
  BAR,
  BAR_STOOLS,
  BAR_ALCOVE,
  BAR_STOOL_SPACING,
  COLS,
  LEFT_WALL,
  FLOOR_OBJECTS,
  INTERACTIVE_OBJECTS,
  ROWS,
  START,
  findPath,
  isBlocked,
  moveWithCollisions,
  chairTile,
  nearbyObjectAt,
  parseTakenSeat,
  serializeTakenSeat,
  nearestChair,
  nearestScreen,
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
    const path = findPath({ x: 13, y: 7 }, [{ x: 20, y: 7 }])!;
    expect(path).toHaveLength(7);
    for (const step of path) expect(isBlocked(step.x, step.y)).toBe(false);
  });

  it('is empty when already there, and null when the target is unreachable', () => {
    expect(findPath(START, [START])).toEqual([]);
    expect(findPath(START, [{ x: 0, y: 0 }])).toBeNull();
  });

  it('can walk all the way round the poker table, between it and its chairs and the pillars', () => {
    const path = findPath({ x: 13, y: 7 }, [{ x: 20, y: 7 }])!;
    expect(path).toHaveLength(7);
  });
});

describe('moving freely (the 3D floor)', () => {
  it('walks across open floor', () => {
    expect(moveWithCollisions({ x: 16.5, y: 12.5 }, { x: 0.4, y: -0.4 })).toEqual({ x: 16.9, y: 12.1 });
  });

  it('stops at a wall', () => {
    // Behind the bar, against the left wall.
    const moved = moveWithCollisions({ x: LEFT_WALL + 0.5, y: 3.5 }, { x: -0.4, y: 0 });
    expect(moved).toEqual({ x: LEFT_WALL + 0.5, y: 3.5 });
  });

  it('slides along the poker table instead of stopping dead', () => {
    // Walking up and to the right into the front of the table, between two chairs.
    const moved = moveWithCollisions({ x: 16.9, y: 7.0 }, { x: 0.2, y: -0.6 });
    expect(moved.x).toBeCloseTo(17.1);
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
    expect(nearbyObjectAt({ x: 17, y: 7.1 })?.id).toBe('poker');
    expect(nearbyObjectAt({ x: 17, y: 8.6 })?.id).toBe('shop');
    expect(nearbyObjectAt({ x: 12.5, y: 12.5 })).toBeNull();
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
    expect(nearestChair(sports, { x: 24, y: 11 })).toBeNull();
    expect(nearestScreen(sports, { x: 24, y: 11 })).toBe(0);
    expect(nearestScreen(sports, { x: 27, y: 11 })).toBe(1);
    expect(nearestChair(byId('shop'), { x: 17, y: 8.6 })).toBeNull();
  });
});

describe('the bar', () => {
  const bar = byId('bar');

  it('is set into the left wall near the front, a place to sit rather than a game to open', () => {
    // The alcove behind the wall line, and the stools' column in front of it.
    expect(bar.x).toBe(BAR_ALCOVE.x);
    expect(bar.x + bar.w).toBe(LEFT_WALL + 1);
    expect(bar.y + bar.h).toBeGreaterThanOrEqual(ROWS - 3);
    for (let y = BAR_ALCOVE.y; y < BAR_ALCOVE.y + BAR_ALCOVE.h; y++) expect(isBlocked(LEFT_WALL - 1, y)).toBe(true);
    // The wall either side of the alcove is solid wall.
    expect(isBlocked(LEFT_WALL - 1, BAR_ALCOVE.y - 1)).toBe(true);
    expect(isBlocked(LEFT_WALL - 1, BAR_ALCOVE.y + BAR_ALCOVE.h)).toBe(true);
    expect(bar.interactive?.lounge).toBe(true);
    expect(bar.interactive?.href).toBeNull();
  });

  it('has a row of stools along the room side of the counter, facing the wall, spread out', () => {
    const { chairs, seatedHands } = pieceLayout(bar);
    expect(chairs.length).toBe(6);
    for (const seat of chairs) {
      expect(seat.x).toBe(BAR.stoolX);
      expect(seat.angle).toBeCloseTo(Math.PI / 2);
    }
    for (let i = 1; i < chairs.length; i++) expect(chairs[i]!.z - chairs[i - 1]!.z).toBeCloseTo(BAR_STOOL_SPACING);
    expect(BAR_STOOL_SPACING).toBeGreaterThanOrEqual(1);
    // A stool is taller than a chair, so whoever sits there sits higher.
    expect(seatedHands?.hipY).toBeGreaterThan(BAR.stoolTop);
    expect(seatedHands?.y).toBe(BAR.counterTop);
  });

  it('keeps the stools out in the room, clear of the counter, which sits on the wall line', () => {
    const { chairs } = pieceLayout(bar);
    const halfW = (bar.w * 0.8) / 2;
    const wallLine = -halfW + BAR_ALCOVE.w * 0.8;
    for (const seat of chairs) {
      expect(seat.x + 0.26).toBeLessThanOrEqual(halfW);
      expect(seat.x - 0.26).toBeGreaterThan(wallLine);
      expect(seat.x - 0.26).toBeGreaterThan(BAR.counterX + BAR.counterDepth / 2);
    }
    expect(Math.abs(BAR.counterX + BAR.counterDepth / 2 - wallLine)).toBeLessThan(0.1);
  });

  it('puts the bartender behind the counter, facing the room', () => {
    const { dealer } = pieceLayout(bar);
    expect(dealer?.facing).toBeCloseTo(Math.PI / 2);
    expect(dealer!.x).toBeLessThan(BAR.counterX - BAR.counterDepth / 2);
    expect(dealer!.x).toBeGreaterThan(-(bar.w * 0.8) / 2 + BAR.backDepth);
  });

  it("can't be walked behind: the counter's ends go back to the wall", () => {
    // Behind the counter, where the bartender stands, is out of reach from the floor.
    const behind = { x: bar.x + bar.w / 2 + BAR.bartenderX / 0.8, y: bar.y + bar.h / 2 };
    expect(findPath(START, [{ x: Math.floor(behind.x), y: Math.floor(behind.y) }])).toBeNull();
  });

  it('outlines the stool nearest the player, and leaves room to walk between it and the blackjack table', () => {
    const chairs = pieceLayout(bar).chairs;
    chairs.forEach((seat, i) => {
      const at = chairTile(bar, seat);
      expect(nearestChair(bar, { x: at.x + 0.6, y: at.y })).toBe(i);
    });
    expect(nearbyObjectAt({ x: 4.6, y: 9 })?.id).toBe('bar');
    expect(findPath({ x: 4, y: 3 }, [{ x: 4, y: 12 }])).toHaveLength(9);
  });

  it('BAR_STOOLS spaces them evenly about the middle', () => {
    expect(BAR_STOOLS(5.6)).toEqual([-2.2, -1.1, 0, 1.1, 2.2].map((z) => expect.closeTo(z, 10)));
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
