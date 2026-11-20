import { describe, expect, it } from 'vitest';
import { isPng, MAX_PHOTO_BYTES, shrinkScale, UPLOAD_LIMIT_BYTES } from '../../lib/profilePhoto';

const MB = 1024 * 1024;

describe('profile photo uploads (UR-115)', () => {
  it('knows a PNG by its first eight bytes, not its name (SRS-115.1)', () => {
    expect(isPng(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))).toBe(true);
    expect(isPng(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))).toBe(false); // a JPEG
    expect(isPng(new Uint8Array([0x89, 0x50, 0x4e]))).toBe(false);
  });

  it("sends photos up to 5 MB in requests Vercel accepts, under its 4.5 MB limit (SRS-115.3)", () => {
    expect(MAX_PHOTO_BYTES).toBe(5 * MB);
    expect(UPLOAD_LIMIT_BYTES).toBeLessThan(4.5 * MB);

    // Small enough already: sent as it is.
    expect(shrinkScale(UPLOAD_LIMIT_BYTES)).toBe(1);
    expect(shrinkScale(2 * MB)).toBe(1);

    // Bigger: scaled so its area, which a PNG's size goes with, fits with room to spare.
    for (const bytes of [4.1 * MB, 4.6 * MB, 4.9 * MB, 5 * MB]) {
      const scale = shrinkScale(bytes);
      expect(scale).toBeLessThan(1);
      expect(bytes * scale * scale).toBeLessThan(UPLOAD_LIMIT_BYTES * 0.85);
    }
  });
});
