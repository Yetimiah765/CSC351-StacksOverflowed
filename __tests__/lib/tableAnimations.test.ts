import { describe, expect, it } from 'vitest';
import { boardHits, boardSlam, impactTime, showdownTimeline } from '../../app/poker/tableAnimations';

// The timing behind the table's slam animations: what lands when, and which
// landings shake the table.

const showdown = (overrides: Partial<Parameters<typeof showdownTimeline>[0]> = {}) => ({
  reason: 'showdown' as const,
  ranOut: false,
  board: ['As', 'Kd', '7c', '2h', '9s'],
  shown: [{ seatNumber: 2 }, { seatNumber: 4 }],
  awards: [{ seatNumber: 4 }],
  ...overrides,
});

describe('board slams', () => {
  it('lands the flop one card after another, each street harder than the last', () => {
    expect([0, 1, 2].map((index) => boardSlam(index).power)).toEqual([1, 1, 1]);
    expect(boardSlam(3).power).toBe(2);
    expect(boardSlam(4).power).toBe(3);
    expect(impactTime(boardSlam(1))).toBeGreaterThan(impactTime(boardSlam(0)));
  });

  it('shakes the table once per new card, and flashes for the river', () => {
    expect(boardHits(0, 3)).toHaveLength(3);
    expect(boardHits(3, 4)).toEqual([expect.objectContaining({ flash: false })]);
    expect(boardHits(4, 5)).toEqual([expect.objectContaining({ flash: true })]);
    expect(boardHits(4, 5)[0]?.strength).toBeGreaterThan(boardHits(0, 1)[0]?.strength as number);
  });
});

describe('showdown timeline', () => {
  it('reveals hands one after another, the winner hardest, then pays out', () => {
    const timeline = showdownTimeline(showdown(), 5);

    expect(timeline.reveal(1, 0).delay).toBeGreaterThan(timeline.reveal(0, 1).delay);
    expect(timeline.hits.map((hit) => hit.strength)).toEqual([4, 9]);
    expect(timeline.runout(4)).toBeNull();
    expect(timeline.winnerStart).toBeGreaterThan(impactTime(timeline.reveal(1, 1)));
  });

  it('after an all-in, reveals the hands first and then runs out the rest of the board street by street', () => {
    const timeline = showdownTimeline(showdown({ ranOut: true }), 0);
    const lastReveal = impactTime(timeline.reveal(1, 1));
    const flop = [0, 1, 2].map((index) => timeline.runout(index));
    const turn = timeline.runout(3);
    const river = timeline.runout(4);

    expect(flop.every((slam) => slam && slam.delay > lastReveal)).toBe(true);
    expect(turn && flop[2] && turn.delay).toBeGreaterThan(flop[2]?.delay as number);
    expect(river && turn && river.delay).toBeGreaterThan(turn?.delay as number);
    expect(timeline.hits).toHaveLength(2 + 5);
    expect(timeline.winnerStart).toBeGreaterThan(impactTime(river as NonNullable<typeof river>));
  });

  it('only runs out the streets that were still to come', () => {
    const timeline = showdownTimeline(showdown({ ranOut: true }), 3);
    expect([0, 1, 2].map((index) => timeline.runout(index))).toEqual([null, null, null]);
    expect(timeline.runout(3)).not.toBeNull();
  });

  it('pays out straight away when everyone else folded', () => {
    const timeline = showdownTimeline(showdown({ reason: 'fold', shown: [], board: [] }), 0);
    expect(timeline.winnerStart).toBe(0);
    expect(timeline.hits).toEqual([]);
  });
});
