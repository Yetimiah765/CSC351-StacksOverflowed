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

  it("doesn't count blind box purchases as money lost (SRS-117.10)", () => {
    const definitions = functionDefinitions('fn_buy_blind_box');
    // The older 3-argument version only hands over to the current one.
    const purchases = definitions.filter(({ body }) => !/^\s*SELECT fn_buy_blind_box\(/.test(body));
    expect(purchases.length).toBeGreaterThan(0);
    for (const { file, body } of definitions) expect(writesGameStats(body), file).toBe(false);
    // Each one charges the price to the balance and records the purchase.
    for (const { file, body } of purchases) {
      expect(body, file).toMatch(/SET balance = balance - v_box\.price/);
      expect(body, file).toMatch(/INSERT INTO blind_box_purchases/);
    }
  });

  it("doesn't count duplicate refunds as money won (SRS-117.11)", () => {
    const purchases = functionDefinitions('fn_buy_blind_box').filter(({ body }) => !/^\s*SELECT fn_buy_blind_box\(/.test(body));
    expect(purchases.length).toBeGreaterThan(0);
    for (const { file, body } of purchases) {
      // A duplicate's refund goes back into the balance in the same update
      // that takes the price, and onto the purchase record...
      expect(body, file).toMatch(/v_refund := CEIL\(v_box\.price \/ 2\.0\)/);
      expect(body, file).toMatch(/SET balance = balance - v_box\.price \+ v_refund/);
      expect(body, file).toMatch(/refund_amount\)\s*VALUES \([^)]*\bv_refund\)/);
      // ...and nowhere else.
      expect(writesGameStats(body), file).toBe(false);
    }
  });
});

describe('One set of rules for overall and per-game money won and lost', () => {
  it('keeps money won and lost only per game, never as separate overall totals (SRS-118.5)', () => {
    // Every table, in every file, that has a money won or lost column.
    const tablesWithMoneyColumns = new Set<string>();
    for (const { sql } of sqlFiles()) {
      for (const [, table, columns] of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)\s*\(([\s\S]*?)\n\);/g)) {
        if (/^\s+\w*money_(?:won|lost)\w*\s/m.test(columns)) tablesWithMoneyColumns.add(table);
      }
      for (const [, table] of sql.matchAll(/ALTER TABLE (?:IF EXISTS )?(\w+)\s+ADD COLUMN (?:IF NOT EXISTS )?\w*money_(?:won|lost)/g)) {
        tablesWithMoneyColumns.add(table);
      }
    }
    expect([...tablesWithMoneyColumns]).toEqual(['player_game_stats']);

    // Each row there is one real game, so there is no "overall" row either.
    const schema = sqlFiles().find((file) => file.name === 'schema.sql')!.sql;
    const seeded = schema.match(/INSERT INTO games \(game_code, display_name\) VALUES([^;]+);/)![1];
    expect([...seeded.matchAll(/\('([a-z_]+)'/g)].map((match) => match[1]).sort()).toEqual(
      ['blackjack', 'poker', 'roulette', 'slots', 'sports_betting']
    );
  });
});
