import { describe, expect, it } from 'vitest';
import { MAX_TABLE_SEATS, MIN_TABLE_SEATS, PokerTable } from '../../lib/pokerTable';

describe('PokerTable', () => {
  it('seats a player in the first open seat (SRS-1.1)', () => {
    const table = new PokerTable('table-1', 3);

    const result = table.join('player-1', 'Alice');

    expect(result).toEqual({ ok: true, seatNumber: 1 });
    expect(table.getState().seatedCount).toBe(1);
    expect(table.getState().seats[0]).toEqual({
      seatNumber: 1,
      playerId: 'player-1',
      username: 'Alice',
      avatarUrl: null,
    });
  });

  it('stores the avatar URL passed at join time (SRS-8.1)', () => {
    const table = new PokerTable('table-1', 3);

    table.join('player-1', 'Alice', 'data:image/png;base64,abc123');

    expect(table.getState().seats[0].avatarUrl).toBe('data:image/png;base64,abc123');
  });

  it('fills seats in order as more players join', () => {
    const table = new PokerTable('table-1', 3);

    table.join('player-1', 'Alice');
    table.join('player-2', 'Bob');
    const result = table.join('player-3', 'Carol');

    expect(result.seatNumber).toBe(3);
    expect(table.getState().seatedCount).toBe(3);
  });

  it('rejects a join once the table is full (SRS-1.4, SRS-1.6)', () => {
    const table = new PokerTable('table-1', MIN_TABLE_SEATS);

    table.join('player-1', 'Alice');
    table.join('player-2', 'Bob');
    table.join('player-3', 'Carol');
    const result = table.join('player-4', 'Dave');

    expect(result).toEqual({ ok: false, error: 'This table is full.' });
    expect(table.getState().seatedCount).toBe(MIN_TABLE_SEATS);
  });

  it('rejects an empty or blank username', () => {
    const table = new PokerTable('table-1', 3);

    expect(table.join('player-1', '')).toEqual({
      ok: false,
      error: 'A username is required to join the table.',
    });
    expect(table.join('player-1', '   ')).toEqual({
      ok: false,
      error: 'A username is required to join the table.',
    });
    expect(table.getState().seatedCount).toBe(0);
  });

  it('rejects a second join from the same player id without freeing a seat', () => {
    const table = new PokerTable('table-1', 3);

    table.join('player-1', 'Alice');
    const result = table.join('player-1', 'Alice again');

    expect(result).toEqual({
      ok: false,
      error: 'You are already seated at this table.',
      seatNumber: 1,
    });
    expect(table.getState().seatedCount).toBe(1);
  });

  it('frees a seat when a seated player leaves (SRS-21.1)', () => {
    const table = new PokerTable('table-1', 3);
    table.join('player-1', 'Alice');

    const result = table.leave('player-1');

    expect(result).toEqual({ ok: true, seatNumber: 1 });
    expect(table.getState().seatedCount).toBe(0);
    expect(table.getState().seats[0]).toEqual({
      seatNumber: 1,
      playerId: null,
      username: null,
      avatarUrl: null,
    });
  });

  it('allows a freed seat to be rejoined by a different player', () => {
    const table = new PokerTable('table-1', 3);
    table.join('player-1', 'Alice');
    table.leave('player-1');

    const result = table.join('player-2', 'Bob');

    expect(result).toEqual({ ok: true, seatNumber: 1 });
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
