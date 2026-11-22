import { describe, expect, it } from 'vitest';
import { isValidName } from '../../lib/auth';
import { sqlFiles } from '../helpers/sql';

// SRS-101.2 / SRS-101.3: chk_players_first_name and chk_players_last_name
// must allow exactly the names isValidName() does. A name the app allows but
// the database refuses fails the insert with a server error; one the
// database allows but the app refuses can never be saved.

// The pattern in the latest CHECK on each column, from schema.sql and from
// the newest migration that sets it.
function checks(column: 'first_name' | 'last_name') {
  const found = sqlFiles().flatMap(({ name, sql }) =>
    [...sql.matchAll(new RegExp(`CHECK \\(${column} ~ '((?:[^']|'')*)'\\)`, 'g'))].map((m) => ({
      name,
      pattern: new RegExp(m[1].replace(/''/g, "'")),
    }))
  );
  const latestMigration = found.filter(({ name }) => name.startsWith('migrations/')).pop();
  return [found.find(({ name }) => name === 'schema.sql')!, latestMigration!];
}

const SAMPLES = [
  'José', 'García', 'Zoë', 'Łukasz', 'Nguyễn', 'Ñandú', "O'Brien", 'Mary-Jane', 'De La Cruz', 'ǅemal',
  'Jos3', 'A×B', 'A÷B', 'Ann.', 'Ann!', ' José', "'Ann", '-Ann', 'Иван', 'Ann😀', 'Ann_Lee', '',
  // The first and last letters of each range, and the characters just outside them.
  ...['00BF', '00C0', '00D6', '00D7', '00D8', '00F6', '00F7', '00F8', '024F', '0250', '1DFF', '1E00', '1EFF', '1F00'].map(
    (hex) => `A${String.fromCodePoint(parseInt(hex, 16))}`
  ),
];

describe.each(['first_name', 'last_name'] as const)('the database check on %s', (column) => {
  it.each(checks(column).map((check) => [check.name, check.pattern] as const))(
    'in %s allows exactly the names isValidName() does',
    (_, pattern) => {
      for (const sample of SAMPLES) {
        expect(pattern.test(sample), JSON.stringify(sample)).toBe(isValidName(sample));
      }
    }
  );
});

it('allows accented letters and still refuses digits and symbols (SRS-101.2, SRS-101.3)', () => {
  expect(['José', 'García', 'Zoë', 'Nguyễn'].every(isValidName)).toBe(true);
  expect(['Jos3', 'A×B', 'Ann!'].some(isValidName)).toBe(false);
});
