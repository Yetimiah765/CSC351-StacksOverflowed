// Where a small window the player can move around sits (SRS-121.14: another
// player's profile over the poker table). Positions are its top-left corner in
// pixels from the top-left of the browser window. Pure, so it's unit-tested.

export type Point = { x: number; y: number };
export type Size = { width: number; height: number };

// Kept clear of the browser window's edges.
export const WINDOW_MARGIN = 8;

// How far one arrow-key press moves it, and with Shift held.
export const KEY_STEP = 24;
export const KEY_STEP_LARGE = 96;

/** The position moved just enough to keep the whole window on screen. A window
 * bigger than the screen keeps its top-left corner in view. */
export function clampToViewport(pos: Point, size: Size, viewport: Size, margin = WINDOW_MARGIN): Point {
  const maxX = Math.max(margin, viewport.width - size.width - margin);
  const maxY = Math.max(margin, viewport.height - size.height - margin);
  return {
    x: Math.round(Math.min(Math.max(pos.x, margin), maxX)),
    y: Math.round(Math.min(Math.max(pos.y, margin), maxY)),
  };
}

/** Where it opens the first time: the top right, just under the nav bar. */
export function defaultPosition(size: Size, viewport: Size, top = 80): Point {
  return clampToViewport({ x: viewport.width - size.width - 24, y: top }, size, viewport);
}

/** The position after an arrow key, or null for any other key. */
export function moveByKey(pos: Point, key: string, large: boolean): Point | null {
  const step = large ? KEY_STEP_LARGE : KEY_STEP;
  switch (key) {
    case 'ArrowLeft':
      return { x: pos.x - step, y: pos.y };
    case 'ArrowRight':
      return { x: pos.x + step, y: pos.y };
    case 'ArrowUp':
      return { x: pos.x, y: pos.y - step };
    case 'ArrowDown':
      return { x: pos.x, y: pos.y + step };
    default:
      return null;
  }
}
