import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { MESSAGE_LATENCY_LIMIT_MS, SYNC_LATENCY_LIMIT_MS } from '../../lib/pokerLatency';
import { PokerTable, TURN_TIME_LIMIT_MS, isBustedSeat, timedOutHandsBeforeRemoval } from '../../lib/pokerTable';
import { createDeck } from '../../lib/pokerCards';

// SRS-NFR-020: the messages in SRS-9.8, SRS-9.11 and SRS-12.2 show within a
// second of what triggers them. Each is in the first thing the server sends
// after the change (which reaches the page within SYNC_LATENCY_LIMIT_MS,
// SRS-NFR-017, measured by npm run test:latency), with no timer in between.

function tableWith(seatNumbers: number[], stacks: Record<number, number> = {}): PokerTable {
  const table = new PokerTable('table-1', 6, 10, 5);
  seatNumbers.forEach((seatNumber) => {
    table.join(`${seatNumber}`, `P${seatNumber}`, stacks[seatNumber] ?? 1000, null, seatNumber);
  });
  return table;
}

describe('player-facing message latency (SRS-NFR-020)', () => {
  it('is a second, with room to spare over a state update', () => {
    expect(MESSAGE_LATENCY_LIMIT_MS).toBe(1_000);
    expect(SYNC_LATENCY_LIMIT_MS).toBeLessThan(MESSAGE_LATENCY_LIMIT_MS);
  });

  it('the buy-back-or-leave choice is in the state the moment the hand busts them (SRS-12.2)', () => {
    // Dealt from the small blind (seat 2), then 3, then 1; seat 1 loses.
    const holes: Record<number, string[]> = { 2: ['As', 'Ad'], 3: ['7c', '2d'], 1: ['8h', '3s'] };
    const board = ['Kc', 'Qd', '9s', '5h', '4c'];
    const used = new Set([...Object.values(holes).flat(), ...board]);
    const spare = createDeck().filter((card) => !used.has(card));
    const deck = [
      holes[2][0], holes[3][0], holes[1][0], holes[2][1], holes[3][1], holes[1][1],
      spare[0], board[0], board[1], board[2], spare[1], board[3], spare[2], board[4], ...spare.slice(3),
    ];
    const table = tableWith([1, 2, 3], { 1: 100 });
    table.startHand(() => 0, deck);
    table.act('1', 'raise', 100); // all-in
    table.act('2', 'call');
    table.act('3', 'fold');
    // The board runs out and the hand ends within that one action: the state
    // the server broadcasts next already has seat 1 busted, so their page
    // offers the choice with it.
    const state = table.getState();
    expect(state.phase).not.toBe('in-hand');
    expect(isBustedSeat(state.seats[0])).toBe(true);
  });

  it('the near-removal warning is in the state the moment the turn times out (SRS-9.8)', () => {
    const table = tableWith([1, 2, 3]);
    for (let hand = 0; hand < 3; hand++) {
      table.updateCountdown(0);
      table.startHand(() => 0);
      while (table.getState().phase === 'in-hand') {
        const state = table.getState();
        const active = state.activeSeat as number;
        if (active === 1) {
          table.trackTurn(0);
          table.timeOutTurn(TURN_TIME_LIMIT_MS);
        } else {
          table.act(`${active}`, state.currentBet > state.seats[active - 1].bet ? 'call' : 'check');
        }
      }
    }
    expect(timedOutHandsBeforeRemoval(table.getState().seats[0])).toBe(1);
  });

  it('the server sends each removal notice straight away, and broadcasts after every timer (SRS-9.11)', () => {
    const server = readFileSync('server/pokerRealtimeServer.ts', 'utf8');
    // Notices go out as the removals are settled, not on a timer of their own.
    const settle = server.slice(server.indexOf('async function settleRemovals'), server.indexOf('function sendNotice'));
    expect(settle).toMatch(/sendNotice\(entry, removal\.playerId, reason\)/);
    expect(settle).not.toMatch(/setTimeout/);
    // A busted player removed for not choosing is told as they're removed.
    expect(server).toMatch(/removeTimedOutBusted[\s\S]{0,800}sendNotice\(entry, playerId, 'busted'\)/);
  });
});
