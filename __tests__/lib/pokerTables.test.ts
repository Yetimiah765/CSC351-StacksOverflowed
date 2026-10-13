import { describe, expect, it } from 'vitest';
import { PokerTable } from '../../lib/pokerTable';
import { POKER_TABLES, getPokerTableConfig } from '../../lib/pokerTables';

describe('POKER_TABLES', () => {
  it('has six tables: two each at 2/5, 5/10 and 10/20', () => {
    expect(POKER_TABLES).toHaveLength(6);

    const blinds = POKER_TABLES.map((table) => `${table.smallBlind}/${table.bigBlind}`);
    expect(blinds.filter((b) => b === '2/5')).toHaveLength(2);
    expect(blinds.filter((b) => b === '5/10')).toHaveLength(2);
    expect(blinds.filter((b) => b === '10/20')).toHaveLength(2);
  });

  it('gives every table a unique, URL-safe id', () => {
    const ids = POKER_TABLES.map((table) => table.id);

    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^[a-z0-9-]+$/));
  });

  it('only lists tables a PokerTable can actually be built from', () => {
    POKER_TABLES.forEach((config) => {
      expect(() => new PokerTable(config.id, config.maxSeats, config.bigBlind, config.smallBlind)).not.toThrow();
    });
  });

  it('looks tables up by id', () => {
    expect(getPokerTableConfig(POKER_TABLES[0].id)).toBe(POKER_TABLES[0]);
    expect(getPokerTableConfig('no-such-table')).toBeUndefined();
  });
});
