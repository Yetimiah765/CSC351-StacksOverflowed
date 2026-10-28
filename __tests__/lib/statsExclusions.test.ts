import { describe, expect, it } from 'vitest';
import { functionDefinitions, sqlFiles, triggerFunctionsOn, writesGameStats } from '../helpers/sql';

// Coins that don't come from a game or sports-bet result must never reach
// money won or money lost (SRS-117.8 - SRS-117.11). Those totals are only
// ever read from player_game_stats, so each check here is that the database
// code moving those coins never writes to it.

describe('Money won and lost exclusions in the database', () => {
  it('finds the SQL it checks', () => {
    expect(sqlFiles().length).toBeGreaterThan(1);
    expect(writesGameStats('INSERT INTO player_game_stats (player_id) VALUES (1)')).toBe(true);
    expect(writesGameStats('SELECT money_won FROM player_game_stats')).toBe(false);
  });

  it("doesn't count the 1,000 starting coins as money won (SRS-117.8)", () => {
    // The starting coins are the balance column's default, not a credit.
    const schema = sqlFiles().find((file) => file.name === 'schema.sql')!.sql;
    expect(schema).toMatch(/\bbalance\s+BIGINT\s+NOT NULL DEFAULT 1000\b/);

    // Creating the account runs only these triggers, and none of them
    // records statistics.
    const triggers = triggerFunctionsOn('players');
    expect(triggers).toContain('fn_players_grant_default_cosmetics');
    for (const trigger of triggers) {
      const definitions = functionDefinitions(trigger);
      expect(definitions.length, trigger).toBeGreaterThan(0);
      for (const { file, body } of definitions) expect(writesGameStats(body), `${trigger} in ${file}`).toBe(false);
    }
  });

  it("doesn't count Daily Login Box coins as money won or lost (SRS-117.9)", () => {
    const definitions = functionDefinitions('fn_open_daily_login_box');
    expect(definitions.length).toBeGreaterThan(0);
    for (const { file, body } of definitions) {
      // It credits the reward to the balance and records the claim...
      expect(body, file).toMatch(/SET balance = balance \+ p_reward/);
      expect(body, file).toMatch(/INSERT INTO daily_login_box_claims/);
      // ...and nothing else.
      expect(writesGameStats(body), file).toBe(false);
    }
  });
});
