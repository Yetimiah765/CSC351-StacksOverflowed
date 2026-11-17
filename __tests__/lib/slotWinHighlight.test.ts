import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { join } from 'path';
import * as React from 'react';
import { createElement, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import Paytable from '../../components/slots/Paytable';
import SlotReels from '../../components/slots/SlotReels';
import { PAYTABLE, SYMBOL_WEIGHTS, winningReels, winningRow, type SlotSymbolName } from '../../lib/slots';

// Vitest compiles .tsx with the classic JSX transform, which calls the global React.
(globalThis as { React?: typeof React }).React = React;
// The project has no @types/react-dom, so the one function used here is typed by hand.
const { renderToStaticMarkup } = createRequire(__filename)('react-dom/server') as {
  renderToStaticMarkup: (element: ReactElement) => string;
};

const SYMBOLS = SYMBOL_WEIGHTS.map(([symbol]) => symbol);
const noop = () => {};

function reelsHtml(reels: SlotSymbolName[], winning?: number[]) {
  return renderToStaticMarkup(createElement(SlotReels, { from: reels, reels, spinId: 0, onStopped: noop, winning }));
}

describe('which reels form the win (SRS-308.1)', () => {
  it('is all three reels for each three of a kind, and names its paytable row', () => {
    for (const symbol of SYMBOLS) {
      const reels: SlotSymbolName[] = [symbol, symbol, symbol];
      expect(winningReels(reels), symbol).toEqual([0, 1, 2]);
      expect(PAYTABLE[winningRow(reels)!].reels).toEqual(reels);
    }
  });

  it('is only reels 1 and 2 for Cherry, Cherry and any other symbol on reel 3', () => {
    const row = PAYTABLE.findIndex((r) => r.reels[2] === null);
    for (const third of SYMBOLS.filter((symbol) => symbol !== 'Cherry')) {
      expect(winningReels(['Cherry', 'Cherry', third]), third).toEqual([0, 1]);
      expect(winningRow(['Cherry', 'Cherry', third])).toBe(row);
    }
  });

  it('is no reels for a spin that wins nothing', () => {
    for (const reels of [
      ['Cherry', 'Seven', 'Cherry'],
      ['Seven', 'Cherry', 'Cherry'],
      ['Seven', 'Seven', 'Bar'],
      ['Lemon', 'Orange', 'Bell'],
    ] as SlotSymbolName[][]) {
      expect(winningReels(reels)).toEqual([]);
      expect(winningRow(reels)).toBeNull();
    }
  });
});

describe('the highlight on the reels and paytable (SRS-308.1)', () => {
  it('lights the payline and only the winning reels', () => {
    const html = reelsHtml(['Cherry', 'Cherry', 'Lemon'], [0, 1]);
    expect(html).toContain('data-payline="win"');
    expect(html).toContain('Reel 1: Cherry (winning)');
    expect(html).toContain('Reel 2: Cherry (winning)');
    expect(html).toContain('Reel 3: Lemon"');
    expect(html.match(/data-winning="true"/g)).toHaveLength(2);
    expect(html.match(/slots-symbol-win/g)).toHaveLength(2);
  });

  it('lights nothing without a win', () => {
    const html = reelsHtml(['Cherry', 'Seven', 'Cherry']);
    expect(html).toContain('data-payline="idle"');
    expect(html).not.toContain('data-winning');
    expect(html).not.toContain('slots-symbol-win');
  });

  it('lights the paytable row that won, and only that one', () => {
    const html = renderToStaticMarkup(createElement(Paytable, { bet: 10, winningRow: 0 }));
    expect(html.match(/data-winning="true"/g)).toHaveLength(1);
    expect(html).toContain('Seven, Seven, Seven (your win)');
    expect(renderToStaticMarkup(createElement(Paytable, { bet: 10 }))).not.toContain('data-winning');
  });

  it('waits for the last reel to stop: the page only lights the win from the outcome set when the reels stop', () => {
    const page = readFileSync(join(__dirname, '../../app/slots/page.tsx'), 'utf8');
    // The outcome is cleared when a spin starts and set only in handleStopped (SRS-309.5).
    expect(page.match(/setOutcome\(/g)).toHaveLength(2);
    expect(page).toContain('setOutcome(null)');
    const stopped = page.slice(page.indexOf('function handleStopped'), page.indexOf('const won ='));
    expect(stopped).toContain('setOutcome(result)');
    // The highlight comes only from that outcome, and only while not spinning.
    expect(page).toContain('const won = !spinning && outcome !== null && outcome.payout > 0;');
    expect(page).toContain('winning={litReels}');
    expect(page).toContain('winningRow={litRow}');
  });
});
