import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

// SRS-108.3: a guest who opens a game's page is asked to log in. These pages
// send a guest, or a player whose session has run out (a 401), to /login,
// which hands them to a check-in tablet on the home page and brings them back
// once they've logged in (SRS-108.8). The pages run only in a browser, so
// this checks what they do in their code.

const PAGES = ['blackjack', 'roulette', 'slots', 'sports', 'sports/showdown'];

const source = (page: string) => readFileSync(join(__dirname, '../../app', page, 'page.tsx'), 'utf8');

describe.each(PAGES)('the %s page (SRS-108.3)', (page) => {
  it('sends a guest with no session to log in', () => {
    expect(source(page)).toMatch(/if \(!\w+\) \{[^}]*router\.replace\(["']\/login["']\)/);
  });

  it('sends a player whose session has run out to log in, forgetting it', () => {
    expect(source(page)).toMatch(
      /status === 401\) \{[^}]*localStorage\.removeItem\(["']player_token["']\);[^}]*router\.replace\(["']\/login["']\)/
    );
  });
});
