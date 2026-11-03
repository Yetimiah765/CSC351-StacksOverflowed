import { describe, expect, it } from 'vitest';
import { WHEEL_ORDER } from '../../lib/roulette/bets';
import {
  CLOSEUP_HOLD_MS,
  CLOSEUP_MS,
  CLOSEUP_SCALE,
  CLOSEUP_ZOOM_MS,
  SPIN_MS,
  closeUpPoint,
  closeUpTransform,
  landingRotation,
  pocketUnderPointer,
} from '../../lib/roulette/wheel';

describe('landingRotation', () => {
  it('leaves every number under the pointer', () => {
    for (const n of WHEEL_ORDER) {
      expect(pocketUnderPointer(landingRotation(0, n))).toBe(n);
    }
  });

  it('works from wherever the last spin left the wheel', () => {
    let rotation = 0;
    for (const n of [17, 0, 36, 5, 5, 26]) {
      const next = landingRotation(rotation, n);
      expect(pocketUnderPointer(next)).toBe(n);
      // Always forward, at least four full turns.
      expect(next - rotation).toBeGreaterThanOrEqual(360 * 4);
      expect(next - rotation).toBeLessThan(360 * 5);
      rotation = next;
    }
  });

  it('rejects a number that is not on the wheel', () => {
    expect(() => landingRotation(0, 37)).toThrow();
  });
});

describe('winning-pocket close-up (SRS-303.4)', () => {
  it('holds the enlarged view for at least 1 second', () => {
    expect(CLOSEUP_HOLD_MS).toBeGreaterThanOrEqual(1000);
    expect(CLOSEUP_MS).toBe(CLOSEUP_ZOOM_MS + CLOSEUP_HOLD_MS);
  });

  it('starts only after the wheel has stopped (SRS-302.7 still holds)', () => {
    expect(SPIN_MS).toBeLessThanOrEqual(1500);
  });

  it('enlarges the view', () => {
    expect(CLOSEUP_SCALE).toBeGreaterThan(1);
    expect(closeUpTransform()).toContain(`scale(${CLOSEUP_SCALE})`);
  });

  it('centers the pocket under the pointer, and keeps the ball in view', () => {
    // The pocket under the pointer is centered at (100, 21) in the 200-unit view.
    expect(closeUpPoint(100, 21)).toEqual([100, 100]);
    // The ball sits in that pocket at (100, 29).
    const [, ballY] = closeUpPoint(100, 29);
    expect(ballY).toBeGreaterThan(0);
    expect(ballY).toBeLessThan(200);
  });

  it('matches the CSS shift to the pocket position', () => {
    // 79 of 200 units is 39.5% of the view's height.
    expect(closeUpTransform()).toBe(`scale(${CLOSEUP_SCALE}) translateY(39.5%)`);
  });
});
