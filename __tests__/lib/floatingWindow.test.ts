import { describe, expect, it } from 'vitest';
import { clampToViewport, defaultPosition, KEY_STEP, KEY_STEP_LARGE, moveByKey, WINDOW_MARGIN } from '../../lib/floatingWindow';

const viewport = { width: 1440, height: 900 };
const size = { width: 360, height: 500 };

describe('the movable profile window (SRS-121.14)', () => {
  it('stays where it is put while it fits on screen', () => {
    expect(clampToViewport({ x: 300, y: 120 }, size, viewport)).toEqual({ x: 300, y: 120 });
  });

  it('cannot be dragged off any edge of the screen', () => {
    expect(clampToViewport({ x: -200, y: -50 }, size, viewport)).toEqual({ x: WINDOW_MARGIN, y: WINDOW_MARGIN });
    expect(clampToViewport({ x: 5000, y: 5000 }, size, viewport)).toEqual({
      x: viewport.width - size.width - WINDOW_MARGIN,
      y: viewport.height - size.height - WINDOW_MARGIN,
    });
  });

  it('keeps its top-left corner in view on a screen smaller than it', () => {
    expect(clampToViewport({ x: 40, y: 40 }, size, { width: 320, height: 400 })).toEqual({ x: WINDOW_MARGIN, y: WINDOW_MARGIN });
  });

  it('opens at the top right, under the nav bar', () => {
    expect(defaultPosition(size, viewport)).toEqual({ x: viewport.width - size.width - 24, y: 80 });
  });

  it('moves with the arrow keys, further with Shift, and ignores other keys', () => {
    const at = { x: 100, y: 100 };
    expect(moveByKey(at, 'ArrowLeft', false)).toEqual({ x: 100 - KEY_STEP, y: 100 });
    expect(moveByKey(at, 'ArrowRight', false)).toEqual({ x: 100 + KEY_STEP, y: 100 });
    expect(moveByKey(at, 'ArrowUp', true)).toEqual({ x: 100, y: 100 - KEY_STEP_LARGE });
    expect(moveByKey(at, 'ArrowDown', true)).toEqual({ x: 100, y: 100 + KEY_STEP_LARGE });
    expect(moveByKey(at, 'Enter', false)).toBeNull();
  });
});
