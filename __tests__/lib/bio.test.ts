import { describe, expect, it } from 'vitest';
import { BIO_MAX_WORDS, countBioWords } from '../../lib/bio';

describe('Bio rules', () => {
  it('allows at most 50 words (SRS-114.1)', () => {
    expect(BIO_MAX_WORDS).toBe(50);
  });

  it('counts an empty or blank bio as 0 words (SRS-114.2/114.4)', () => {
    expect(countBioWords('')).toBe(0);
    expect(countBioWords('   \n\t  ')).toBe(0);
  });

  it('counts whitespace-separated words after trimming (SRS-114.5)', () => {
    expect(countBioWords('Hello')).toBe(1);
    expect(countBioWords('  Hello there  ')).toBe(2);
  });

  it('treats any run of spaces, tabs, or line breaks as one separator (SRS-114.5)', () => {
    expect(countBioWords('one   two\t\tthree\n\nfour')).toBe(4);
  });

  it('counts punctuation-joined text as one word', () => {
    expect(countBioWords("rock'n'roll, poker-night!")).toBe(2);
  });
});
