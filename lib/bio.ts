// Bio rules shared by the profile API and the bio editor (UR-114), so the
// word count the player sees always matches the one the server enforces.

// SRS-114.1: a bio holds at most 50 words.
export const BIO_MAX_WORDS = 50;

/**
 * SRS-114.5: words are separated by whitespace after trimming both ends, and
 * any run of spaces, tabs, or line breaks counts as one separator. An empty
 * or all-whitespace bio has 0 words.
 */
export function countBioWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
