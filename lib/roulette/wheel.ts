// Geometry and timing for the roulette wheel's animation, kept out of the
// component so they can be tested. Pure and DB-free.

import { WHEEL_ORDER } from './bets';

export const SEGMENT = 360 / WHEEL_ORDER.length;

// SRS-302.7: the wheel stops on the winning number within 1.5 s of the result arriving.
export const SPIN_MS = 1500;

// SRS-303.4: once the wheel stops, zoom in on the winning pocket, hold the
// enlarged view, then zoom back out to the full table. The enlarged view is
// fully on screen for the hold, which must be at least 1 second.
export const CLOSEUP_ZOOM_MS = 450;
export const CLOSEUP_HOLD_MS = 1300;
export const CLOSEUP_SCALE = 3;

// The SVG is 200 units square. The pointer is at the top, and the pocket under
// it is centered 79 units above the wheel's middle (between r66 and r92).
const VIEW_SIZE = 200;
const POCKET_RADIUS = 79;

/** The rotation that turns the wheel four full turns past `current` and leaves `target` under the pointer. */
export function landingRotation(current: number, target: number): number {
  const index = WHEEL_ORDER.indexOf(target);
  if (index === -1) throw new Error(`Not a roulette number: ${target}`);
  const landing = (360 - index * SEGMENT) % 360;
  const offset = (((landing - (current % 360)) % 360) + 360) % 360;
  return current + 360 * 4 + offset;
}

/** Which pocket is under the pointer at a given rotation. */
export function pocketUnderPointer(rotation: number): number {
  const turned = ((rotation % 360) + 360) % 360;
  const index = Math.round(((360 - turned) % 360) / SEGMENT) % WHEEL_ORDER.length;
  return WHEEL_ORDER[index];
}

/**
 * The CSS transform for the close-up: slides the pocket under the pointer to
 * the middle of the view, then enlarges it about the middle. CSS applies the
 * rightmost function first, so the shift is in unscaled units.
 */
export function closeUpTransform(): string {
  const shift = (POCKET_RADIUS / VIEW_SIZE) * 100;
  return `scale(${CLOSEUP_SCALE}) translateY(${shift}%)`;
}

/** Where a point in the 200-unit view ends up under closeUpTransform(), for checking it. */
export function closeUpPoint(x: number, y: number): [number, number] {
  const mid = VIEW_SIZE / 2;
  const shifted = y + POCKET_RADIUS;
  return [mid + (x - mid) * CLOSEUP_SCALE, mid + (shifted - mid) * CLOSEUP_SCALE];
}

/** The close-up lasts from the stop until the zoom back out begins. */
export const CLOSEUP_MS = CLOSEUP_ZOOM_MS + CLOSEUP_HOLD_MS;
