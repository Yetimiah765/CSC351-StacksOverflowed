import { describe, expect, it } from 'vitest';
import { functionDefinitions, sqlFiles } from '../helpers/sql';

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

// fn_delete_account (supabase/schema.sql and the 2026-11-21 migration):
// checked on a scratch Postgres too, but these hold the shape every copy of
// the function must keep.
describe('fn_delete_account (SRS-106.3, SRS-106.10)', () => {
  const definitions = functionDefinitions('fn_delete_account');

  it('is defined in schema.sql and a migration', () => {
    expect(definitions.map((d) => d.file)).toEqual(expect.arrayContaining(['schema.sql', 'migrations/2026-11-21_delete_account.sql']));
  });

  it.each(definitions.map((d) => [d.file, d.body] as const))(
    'in %s locks the player, refuses while seated at poker, and only then deletes',
    (_, body) => {
      const lock = body.search(/FROM players\s+WHERE player_id = p_player_id\s+FOR UPDATE/);
      const seat = body.search(/FROM poker_seats/);
      const refuse = body.search(/'status', 'seated'/);
      const remove = body.search(/DELETE FROM players WHERE player_id = p_player_id/);
      expect([lock, seat, refuse, remove].every((at) => at >= 0)).toBe(true);
      expect(lock).toBeLessThan(seat);
      expect(seat).toBeLessThan(refuse);
      expect(refuse).toBeLessThan(remove);
    }
  );

  it('can be called only by the server, in every file', () => {
    for (const { name, sql } of sqlFiles().filter((f) => f.sql.includes('FUNCTION fn_delete_account'))) {
      expect(sql, name).toContain('REVOKE EXECUTE ON FUNCTION fn_delete_account(INTEGER) FROM PUBLIC');
      expect(sql, name).toContain("REVOKE EXECUTE ON FUNCTION fn_delete_account(INTEGER) FROM anon, authenticated");
    }
  });
});
