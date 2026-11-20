-- =============================================================================
-- SRS-101.2 (bug #1005): first and last names may contain accented letters,
-- such as José, García, Zoë or Nguyễn. The old checks allowed only A-Z and
-- a-z, so sign-up refused them.
--
-- Letters are now A-Z and a-z plus the Latin-1 Supplement letters (U+00C0 -
-- U+00FF without × and ÷), Latin Extended-A and -B (to U+024F) and Latin
-- Extended Additional (U+1E00 - U+1EFF), the same ranges as NAME_PATTERN in
-- lib/auth.ts. Every name stored today still passes. Safe to re-run.
-- =============================================================================

BEGIN;

ALTER TABLE players DROP CONSTRAINT IF EXISTS chk_players_first_name;
ALTER TABLE players ADD CONSTRAINT chk_players_first_name
    CHECK (first_name ~ '^[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF][A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF'' -]*$');

ALTER TABLE players DROP CONSTRAINT IF EXISTS chk_players_last_name;
ALTER TABLE players ADD CONSTRAINT chk_players_last_name
    CHECK (last_name ~ '^[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF][A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF'' -]*$');

COMMIT;
