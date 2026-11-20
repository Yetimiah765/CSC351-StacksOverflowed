// Profile photo upload rules shared by the profile page and the upload route
// (UR-115). Kept free of Node-only imports so the page can check a file
// before sending it.

// SRS-115.3: 5 MB maximum, matching chk_players_profile_photo.
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

// Vercel refuses a request over 4.5 MB before the upload route runs, so the
// page shrinks a photo bigger than this before sending it; the rest of the
// form fits in what's left.
export const UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;

// SRS-115.1: a PNG is known by its first eight bytes, not its name.
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isPng(firstBytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, i) => firstBytes[i] === byte);
}

/** What to scale a photo's width and height by so its PNG comes in under
 * `limit`, with a little to spare: a PNG's size goes roughly with its area.
 * 1 for a photo already small enough. */
export function shrinkScale(bytes: number, limit = UPLOAD_LIMIT_BYTES): number {
  return bytes <= limit ? 1 : Math.sqrt(limit / bytes) * 0.9;
}
