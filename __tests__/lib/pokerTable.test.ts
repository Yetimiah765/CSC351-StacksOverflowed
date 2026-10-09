import { describe, expect, it } from 'vitest';
import { DEFAULT_BIG_BLIND, MAX_TABLE_SEATS, MIN_TABLE_SEATS, PokerTable } from '../../lib/pokerTable';

describe('PokerTable', () => {
  it('defaults to DEFAULT_BIG_BLIND and exposes it via getState()', () => {
    const table = new PokerTable('table-1', 3);

    expect(table.bigBlind).toBe(DEFAULT_BIG_BLIND);
    expect(table.getState().bigBlind).toBe(DEFAULT_BIG_BLIND);
  });

  it('accepts a custom big blind', () => {
    const table = new PokerTable('table-1', 3, 10);

    expect(table.getState().bigBlind).toBe(10);
  });

  it('rejects a non-positive or non-integer big blind', () => {
    expect(() => new PokerTable('table-1', 3, 0)).toThrow();
    expect(() => new PokerTable('table-1', 3, -5)).toThrow();
    expect(() => new PokerTable('table-1', 3, 2.5)).toThrow();
  });

  it('seats a player in the first open seat (SRS-1.1)', () => {
    const table = new PokerTable('table-1', 3);

    const result = table.join('player-1', 'Alice', 500);

    expect(result).toEqual({ ok: true, seatNumber: 1 });
    expect(table.getState().seatedCount).toBe(1);
    expect(table.getState().seats[0]).toEqual({
      seatNumber: 1,
      playerId: 'player-1',
      username: 'Alice',
      avatarUrl: null,
      chipStack: 500,
    });
  });

  it('stores the avatar URL passed at join time (SRS-8.1)', () => {
    const table = new PokerTable('table-1', 3);

    table.join('player-1', 'Alice', 500, 'data:image/png;base64,abc123');

    expect(table.getState().seats[0].avatarUrl).toBe('data:image/png;base64,abc123');
  });

  it('rejects a non-positive or non-integer chip stack', () => {
    const table = new PokerTable('table-1', 3);

    expect(table.join('player-1', 'Alice', 0)).toEqual({
      ok: false,
      error: 'A valid buy-in amount is required to join the table.',
    });
    expect(table.join('player-1', 'Alice', -100)).toEqual({
      ok: false,
      error: 'A valid buy-in amount is required to join the table.',
    });
    expect(table.join('player-1', 'Alice', 100.5)).toEqual({
      ok: false,
      error: 'A valid buy-in amount is required to join the table.',
    });
    expect(table.getState().seatedCount).toBe(0);
  });

  it('fills seats in order as more players join', () => {
    const table = new PokerTable('table-1', 3);

    table.join('player-1', 'Alice', 500);
    table.join('player-2', 'Bob', 500);
    const result = table.join('player-3', 'Carol', 500);

    expect(result.seatNumber).toBe(3);
    expect(table.getState().seatedCount).toBe(3);
  });

  it('rejects a join once the table is full (SRS-1.4, SRS-1.6)', () => {
    const table = new PokerTable('table-1', MIN_TABLE_SEATS);

    table.join('player-1', 'Alice', 500);
    table.join('player-2', 'Bob', 500);
    table.join('player-3', 'Carol', 500);
    const result = table.join('player-4', 'Dave', 500);

    expect(result).toEqual({ ok: false, error: 'This table is full.' });
    expect(table.getState().seatedCount).toBe(MIN_TABLE_SEATS);
  });

  it('rejects an empty or blank username', () => {
    const table = new PokerTable('table-1', 3);

    expect(table.join('player-1', '', 500)).toEqual({
      ok: false,
      error: 'A username is required to join the table.',
    });
    expect(table.join('player-1', '   ', 500)).toEqual({
      ok: false,
      error: 'A username is required to join the table.',
    });
    expect(table.getState().seatedCount).toBe(0);
  });

  it('rejects a second join from the same player id without freeing a seat', () => {
    const table = new PokerTable('table-1', 3);

    table.join('player-1', 'Alice', 500);
    const result = table.join('player-1', 'Alice again', 500);

    expect(result).toEqual({
      ok: false,
      error: 'You are already seated at this table.',
      seatNumber: 1,
    });
    expect(table.getState().seatedCount).toBe(1);
  });

  it('frees a seat when a seated player leaves (SRS-21.1) and returns the freed chip stack', () => {
    const table = new PokerTable('table-1', 3);
    table.join('player-1', 'Alice', 500);

    const result = table.leave('player-1');

    expect(result).toEqual({ ok: true, seatNumber: 1, chipStack: 500 });
    expect(table.getState().seatedCount).toBe(0);
    expect(table.getState().seats[0]).toEqual({
      seatNumber: 1,
      playerId: null,
      username: null,
      avatarUrl: null,
      chipStack: null,
    });
  });

  it('allows a freed seat to be rejoined by a different player', () => {
    const table = new PokerTable('table-1', 3);
    table.join('player-1', 'Alice', 500);
    table.leave('player-1');

    const result = table.join('player-2', 'Bob', 300);

    expect(result).toEqual({ ok: true, seatNumber: 1 });
    expect(table.getState().seats[0].chipStack).toBe(300);
  });

  it('rejects a leave request from a player who is not seated', () => {
    const table = new PokerTable('table-1', 3);

    const result = table.leave('ghost-player');

    expect(result).toEqual({ ok: false, error: 'You are not seated at this table.' });
  });

  it('enforces the configured seat cap bounds (SRS-NFR-022)', () => {
    expect(() => new PokerTable('table-1', MIN_TABLE_SEATS - 1)).toThrow();
    expect(() => new PokerTable('table-1', MAX_TABLE_SEATS + 1)).toThrow();
    expect(() => new PokerTable('table-1', MIN_TABLE_SEATS)).not.toThrow();
    expect(() => new PokerTable('table-1', MAX_TABLE_SEATS)).not.toThrow();
  });
});
