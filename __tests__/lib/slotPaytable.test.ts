import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { join } from 'path';
import * as React from 'react';
import { createElement, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import Paytable from '../../components/slots/Paytable';
import { PAYTABLE, SYMBOL_WEIGHTS, payoutMultiplier, type SlotSymbolName } from '../../lib/slots';

// Vitest compiles .tsx with the classic JSX transform, which calls the global React.
(globalThis as { React?: typeof React }).React = React;
// The project has no @types/react-dom, so the one function used here is typed by hand.
const { renderToStaticMarkup } = createRequire(__filename)('react-dom/server') as {
  renderToStaticMarkup: (element: ReactElement) => string;
};

const ROOT = join(__dirname, '../..');
const SYMBOLS = SYMBOL_WEIGHTS.map(([symbol]) => symbol);

// The rows of the SRS-309.2 table in the SRS document, as [combination, multiplier].
function srsPaytable(): [string, number][] {
  const srs = readFileSync(join(ROOT, 'docs/requirements/SRS'), 'utf8');
  const start = srs.indexOf('**SRS-309.2,');
  const section = srs.slice(start, srs.indexOf('*Traces to', start));
  return section
    .split(/\r?\n/)
    .filter((line) => /^\|.*\|\s*\d+\s*\|$/.test(line.trim()))
    .map((line) => {
      const [combination, multiplier] = line.split('|').slice(1, 3).map((cell) => cell.trim());
      return [combination, Number(multiplier)];
    });
}

describe('the paytable shown on the page (SRS-309.4)', () => {
  it('has exactly the rows of the SRS-309.2 table, in the same order', () => {
    const rows = srsPaytable();
    expect(rows).toHaveLength(7);
    expect(PAYTABLE.map((row) => [row.label, row.multiplier])).toEqual(rows);
  });

  it("pays each row's multiplier for the symbols it shows", () => {
    for (const row of PAYTABLE) {
      const [a, b, c] = row.reels;
      // "Any other symbol" on reel 3 means every symbol that doesn't make a better row.
      const thirds: SlotSymbolName[] = c ? [c] : SYMBOLS.filter((symbol) => symbol !== a);
      for (const third of thirds) expect(payoutMultiplier([a, b, third]), row.label).toBe(row.multiplier);
    }
  });

  it('lists every row with its multiplier and what it pays at the selected bet', () => {
    const html = renderToStaticMarkup(createElement(Paytable, { bet: 25 }));
    for (const row of PAYTABLE) {
      expect(html).toContain(row.label);
      expect(html).toContain(`${row.multiplier}×`);
      expect(html).toContain(`${(row.multiplier * 25).toLocaleString()} coins`);
    }
  });

  it('shows the multipliers before the bet amounts have loaded', () => {
    const html = renderToStaticMarkup(createElement(Paytable, { bet: null }));
    expect(html).toContain('200×');
    expect(html).not.toContain('coins');
  });

  it('is on the slot machine page outside the spin result, so it shows before the first spin', () => {
    const page = readFileSync(join(ROOT, 'app/slots/page.tsx'), 'utf8');
    expect(page).toContain("import Paytable from '../../components/slots/Paytable'");
    expect(page).toMatch(/<Paytable bet=\{bet\} \/>/);
  });
});
