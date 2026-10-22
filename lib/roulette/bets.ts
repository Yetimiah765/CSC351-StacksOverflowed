// Roulette rules from the SRS, shared by the roulette page and (later) the
// spin API: the single-zero wheel, pocket colors, bet types and payouts
// (SRS-301.3, SRS-301.4), chip values (SRS-301.5), and the per-spin limit
// (SRS-301.6). Pure and DB-free.

export type OutsideBetType =
  | 'Red'
  | 'Black'
  | 'Odd'
  | 'Even'
  | 'Low'
  | 'High'
  | 'Dozen1'
  | 'Dozen2'
  | 'Dozen3'
  | 'Column1'
  | 'Column2'
  | 'Column3';

export type BetSpot = { type: 'Number'; number: number } | { type: OutsideBetType };

export type PocketColor = 'green' | 'red' | 'black';

export const CHIP_VALUES = [5, 10, 25, 50, 100] as const;
export const MAX_TOTAL_BET = 500;

// Pocket order around a European wheel, clockwise from 0.
export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14,
  31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export function pocketColor(n: number): PocketColor {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

/** A stable id for a betting spot, e.g. "Number:17" or "Dozen2". */
export function spotKey(spot: BetSpot): string {
  return spot.type === 'Number' ? `Number:${spot.number}` : spot.type;
}

const OUTSIDE_LABELS: Record<OutsideBetType, string> = {
  Red: 'Red',
  Black: 'Black',
  Odd: 'Odd',
  Even: 'Even',
  Low: '1–18',
  High: '19–36',
  Dozen1: '1st 12',
  Dozen2: '2nd 12',
  Dozen3: '3rd 12',
  Column1: '1st column',
  Column2: '2nd column',
  Column3: '3rd column',
};

export function spotLabel(spot: BetSpot): string {
  return spot.type === 'Number' ? `Straight ${spot.number}` : OUTSIDE_LABELS[spot.type];
}

/** The x in an x:1 payout (SRS-301.3). */
export function payoutMultiplier(spot: BetSpot): number {
  switch (spot.type) {
    case 'Number':
      return 35;
    case 'Dozen1':
    case 'Dozen2':
    case 'Dozen3':
    case 'Column1':
    case 'Column2':
    case 'Column3':
      return 2;
    default:
      return 1;
  }
}

/** Whether a bet on `spot` wins when the ball lands on `n`. */
export function spotWins(spot: BetSpot, n: number): boolean {
  if (spot.type === 'Number') return spot.number === n;
  // SRS-301.4: every outside bet loses on 0.
  if (n === 0) return false;

  switch (spot.type) {
    case 'Red':
      return pocketColor(n) === 'red';
    case 'Black':
      return pocketColor(n) === 'black';
    case 'Odd':
      return n % 2 === 1;
    case 'Even':
      return n % 2 === 0;
    case 'Low':
      return n <= 18;
    case 'High':
      return n >= 19;
    case 'Dozen1':
      return n <= 12;
    case 'Dozen2':
      return n >= 13 && n <= 24;
    case 'Dozen3':
      return n >= 25;
    case 'Column1':
      return n % 3 === 1;
    case 'Column2':
      return n % 3 === 2;
    case 'Column3':
      return n % 3 === 0;
  }
}

/** Coins a bet returns: its stake plus x times its stake on a win, else 0 (SRS-304.1). */
export function betReturn(spot: BetSpot, amount: number, n: number): number {
  return spotWins(spot, n) ? amount * (payoutMultiplier(spot) + 1) : 0;
}
