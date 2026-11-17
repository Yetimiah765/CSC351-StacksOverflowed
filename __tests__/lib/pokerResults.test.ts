import { describe, expect, it, vi } from 'vitest';
import { PokerTable } from '../../lib/pokerTable';
import { createDeck } from '../../lib/pokerCards';
import { persistHandOutcomes } from '../../lib/pokerPersistence';
import { GAMES } from '../../lib/games';
import { functionDefinitions, writesGameStats } from '../helpers/sql';

// Poker's money won and lost (SRS-117, SRS-118): how each player did in each
// hand, added to their profile like sports betting's and blackjack's.

function tableWith(seatNumbers: number[], stacks: Record<number, number> = {}): PokerTable {
  const table = new PokerTable('table-1', 6, 10, 5);
  seatNumbers.forEach((seatNumber) => {
    table.join(`${seatNumber}`, `P${seatNumber}`, stacks[seatNumber] ?? 1000, null, seatNumber);
  });
  return table;
}

/** Deals seats 2, 3, 1 (from the small blind) these cards; seat 1 has aces and wins a showdown. */
function stackedDeck() {
  const holes: Record<number, string[]> = { 2: ['7c', '2d'], 3: ['8h', '3s'], 1: ['As', 'Ad'] };
  const board = ['Kc', 'Qd', '9s', '5h', '4c'];
  const used = new Set([...Object.values(holes).flat(), ...board]);
  const spare = createDeck().filter((card) => !used.has(card));
  return [
    holes[2][0], holes[3][0], holes[1][0], holes[2][1], holes[3][1], holes[1][1],
    spare[0], board[0], board[1], board[2], spare[1], board[3], spare[2], board[4], ...spare.slice(3),
  ];
}

const byPlayer = (outcomes: { playerId: string; net: number }[]) =>
  Object.fromEntries(outcomes.map(({ playerId, net }) => [playerId, net]));

describe("how each player did in a hand (SRS-117 / SRS-118)", () => {
  it('counts the blinds the others lost to a raise everyone folded to', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(() => 0); // button 1, SB 2, BB 3
    table.act('1', 'raise', 100);
    table.act('2', 'fold');
    table.act('3', 'fold');
    // Seat 1 gets their uncalled 90 back and wins the 15 in blinds.
    expect(byPlayer(table.drainHandOutcomes())).toEqual({ '1': 15, '2': -5, '3': -10 });
    // Given once.
    expect(table.drainHandOutcomes()).toEqual([]);
  });

  it('counts a showdown: the winner up by what the others put in', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(() => 0, stackedDeck());
    table.act('1', 'raise', 50);
    table.act('2', 'call');
    table.act('3', 'call');
    for (let street = 0; street < 3; street++) {
      table.act('2', 'check');
      table.act('3', 'check');
      table.act('1', 'check');
    }
    expect(table.getState().lastHandResult?.reason).toBe('showdown');
    expect(byPlayer(table.drainHandOutcomes())).toEqual({ '1': 100, '2': -50, '3': -50 });
  });

  it('adds up to nothing across the table: what one wins, the others lost', () => {
    const table = tableWith([1, 2, 3, 4]);
    table.startHand(() => 0);
    table.act('4', 'call');
    table.act('1', 'raise', 60);
    table.act('2', 'fold');
    table.act('3', 'call');
    table.act('4', 'fold');
    table.act('3', 'check');
    table.act('1', 'bet', 100);
    table.act('3', 'fold');
    const outcomes = table.drainHandOutcomes();
    expect(outcomes.reduce((sum, { net }) => sum + net, 0)).toBe(0);
    expect(outcomes).toHaveLength(4);
  });

  it('counts a player who folds and leaves part-way as they leave', () => {
    const table = tableWith([1, 2, 3]);
    table.startHand(() => 0);
    table.act('1', 'call');
    table.act('2', 'fold');
    table.leave('2'); // the small blind's 5 stays in the pot
    expect(byPlayer(table.drainHandOutcomes())).toEqual({ '2': -5 });
  });

  it('never counts buying in, sitting out a hand, or a hand no one won anything in', () => {
    const table = tableWith([1, 2, 3]);
    expect(table.drainHandOutcomes()).toEqual([]);
    table.startHand(() => 0);
    // Joining mid-hand: not dealt in, so not in this hand's results.
    table.join('4', 'P4', 800, null, 4);
    table.act('1', 'fold');
    table.act('2', 'fold');
    const outcomes = byPlayer(table.drainHandOutcomes());
    expect(outcomes['4']).toBeUndefined();
    expect(outcomes['1']).toBeUndefined(); // folded before putting anything in
  });
});

describe('recording the results (SRS-117 / SRS-118)', () => {
  it('passes them to fn_poker_record_results', async () => {
    const rpc = vi.fn(async () => ({ data: { status: 'recorded', results: 2 }, error: null }));
    expect(await persistHandOutcomes({ rpc } as never, [{ playerId: '7', net: 40 }, { playerId: '9', net: -40 }])).toBe(true);
    expect(rpc).toHaveBeenCalledWith('fn_poker_record_results', { p_results: [{ playerId: 7, net: 40 }, { playerId: 9, net: -40 }] });
  });

  it('has nothing to send for no results', async () => {
    const rpc = vi.fn();
    expect(await persistHandOutcomes({ rpc } as never, [])).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("adds a hand's gain to money won and its loss to money lost, as poker", () => {
    const definitions = functionDefinitions('fn_poker_record_results');
    expect(definitions.length).toBeGreaterThan(0);
    for (const { file, body } of definitions) {
      expect(writesGameStats(body), file).toBe(true);
      expect(body, file).toMatch(/'poker', GREATEST\(v_net, 0\), GREATEST\(-v_net, 0\)/);
    }
  });

  it('never counts buying in, buying back in or cashing out', () => {
    for (const name of ['fn_poker_join', 'fn_poker_rebuy', 'fn_poker_leave', 'fn_poker_hand_finished']) {
      const definitions = functionDefinitions(name);
      expect(definitions.length, name).toBeGreaterThan(0);
      for (const { file, body } of definitions) expect(writesGameStats(body), `${name} in ${file}`).toBe(false);
    }
  });

  it('shows on the profile now that poker records its results', () => {
    expect(GAMES.find((game) => game.id === 'poker')).toMatchObject({ statsCode: 'poker', recordsResults: true });
  });
});
