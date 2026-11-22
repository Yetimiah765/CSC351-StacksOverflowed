import { describe, expect, it } from 'vitest';
import { sqlFiles } from '../helpers/sql';

// SRS-106.3: deleting an account deletes all of its information. The delete
// route deletes only the player's row; the rest goes with it because every
// table that refers to players does so ON DELETE CASCADE. A table added
// later without it would keep the deleted player's rows (or block the
// deletion), so this checks every reference in every SQL file.

interface Reference {
  file: string;
  table: string;
  line: string;
}

function referencesToPlayers(): Reference[] {
  return sqlFiles().flatMap(({ name: file, sql }) => {
    let table = '';
    return sql.split('\n').flatMap((line) => {
      const created = line.match(/CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?(\w+)/i);
      if (created) table = created[1];
      const altered = line.match(/ALTER TABLE (?:IF EXISTS )?(?:ONLY )?(?:public\.)?(\w+)/i);
      if (altered) table = altered[1];
      return /REFERENCES\s+(?:public\.)?players\s*\(\s*player_id\s*\)/i.test(line) ? [{ file, table, line: line.trim() }] : [];
    });
  });
}

describe('Deleting an account deletes all of its information (SRS-106.3)', () => {
  const references = referencesToPlayers();

  it('finds every table that refers to players', () => {
    const tables = new Set(references.filter((r) => r.file === 'schema.sql').map((r) => r.table));
    // Authentication, statistics and cosmetics, as SRS-106.3 lists, plus each game's rows.
    for (const table of ['usernames', 'player_sessions', 'player_game_stats', 'player_cosmetics', 'player_equipped_cosmetics', 'daily_login_box_claims', 'blackjack_hands', 'wagers', 'poker_seats']) {
      expect(tables, table).toContain(table);
    }
  });

  it('deletes their rows along with the player, in schema.sql and every migration', () => {
    const notCascading = references.filter((r) => !/ON DELETE CASCADE/i.test(r.line));
    expect(notCascading.map((r) => `${r.file}: ${r.table}: ${r.line}`)).toEqual([]);
  });
});
