import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// Reads the database's SQL so tests can check what its functions and
// triggers do. Both sources count: supabase/schema.sql builds the database
// from scratch, and each script in supabase/migrations/ changed the shared
// database in place, so every version of a function in either must agree.

const SUPABASE = join(__dirname, '../../supabase');

export interface SqlFile {
  name: string;
  sql: string;
}

export function sqlFiles(): SqlFile[] {
  const migrations = readdirSync(join(SUPABASE, 'migrations'))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  return [
    { name: 'schema.sql', sql: readFileSync(join(SUPABASE, 'schema.sql'), 'utf8') },
    ...migrations.map((file) => ({
      name: `migrations/${file}`,
      sql: readFileSync(join(SUPABASE, 'migrations', file), 'utf8'),
    })),
  ];
}

// Every definition of the named function, in every file: where it is and the
// body between its $$ quotes.
export function functionDefinitions(name: string): { file: string; body: string }[] {
  const pattern = new RegExp(`CREATE (?:OR REPLACE )?FUNCTION ${name}\\s*\\([\\s\\S]*?\\bAS \\$\\$([\\s\\S]*?)\\$\\$`, 'gi');
  return sqlFiles().flatMap(({ name: file, sql }) => [...sql.matchAll(pattern)].map((match) => ({ file, body: match[1] })));
}

// The functions run by triggers on the named table, in every file.
export function triggerFunctionsOn(table: string): string[] {
  const pattern = new RegExp(`CREATE TRIGGER \\w+\\s+(?:BEFORE|AFTER|INSTEAD OF)[^;]*?\\bON ${table}\\b[^;]*?EXECUTE (?:FUNCTION|PROCEDURE) (\\w+)\\s*\\(`, 'gi');
  return [...new Set(sqlFiles().flatMap(({ sql }) => [...sql.matchAll(pattern)].map((match) => match[1])))];
}

// Whether SQL writes to player_game_stats, where money won and lost are kept.
export function writesGameStats(sql: string): boolean {
  return /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?player_game_stats\b/i.test(sql);
}
