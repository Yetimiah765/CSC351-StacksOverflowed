import { describe, expect, it } from 'vitest';
import { LOGIN_LOCK_MINUTES, lockedMessage, MAX_LOGIN_FAILURES } from '../../lib/auth';
import { functionDefinitions, sqlFiles } from '../helpers/sql';

// SRS-104.8: 5 wrong passwords in a row lock an account for 15 minutes.
// fn_record_login was also run on a scratch Postgres (counting, the lock,
// the reset, re-running the migration); these hold the shape every copy of
// it must keep.
describe('the login attempt limit (SRS-104.8)', () => {
  it('is 5 wrong passwords, then 15 minutes', () => {
    expect(MAX_LOGIN_FAILURES).toBe(5);
    expect(LOGIN_LOCK_MINUTES).toBe(15);
  });

  it('tells a locked-out player the minutes left, rounded up', () => {
    expect(lockedMessage(15 * 60_000)).toBe('Too many wrong passwords. Try again in 15 minutes.');
    expect(lockedMessage(61_000)).toBe('Too many wrong passwords. Try again in 2 minutes.');
    expect(lockedMessage(5_000)).toBe('Too many wrong passwords. Try again in 1 minute.');
  });

  const definitions = functionDefinitions('fn_record_login');

  it('has fn_record_login in schema.sql and its migration', () => {
    expect(definitions.map((d) => d.file)).toEqual(expect.arrayContaining(['schema.sql', 'migrations/2026-11-22_login_attempts.sql']));
  });

  it.each(definitions.map((d) => [d.file, d.body] as const))(
    'in %s counts in one statement, locks at the limit and clears on success',
    (_, body) => {
      expect(body).toMatch(/ON CONFLICT \(player_id\) DO UPDATE SET failures = login_attempts\.failures \+ 1\s+RETURNING failures INTO v_failures/);
      expect(body).toMatch(/IF v_failures >= p_max_failures THEN[\s\S]*?locked_until = v_locked/);
      expect(body).toMatch(/IF p_success THEN\s+DELETE FROM login_attempts WHERE player_id = p_player_id/);
    }
  );

  it('lets only the server call it, and keeps the table to the server', () => {
    for (const { name, sql } of sqlFiles().filter((f) => f.sql.includes('FUNCTION fn_record_login'))) {
      expect(sql, name).toContain('REVOKE EXECUTE ON FUNCTION fn_record_login(INTEGER, BOOLEAN, INTEGER, INTEGER) FROM PUBLIC');
      expect(sql, name).toContain('ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY');
    }
  });
});
