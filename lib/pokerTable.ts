// Sprint 1 scope: seating only. A player can join an open seat at the single
// table and leave it again, subject to a configurable seat cap. This module
// is intentionally decoupled from any transport (Socket.io, Supabase
// Realtime, or otherwise) so the seating rules can be unit tested without
// standing up a real server.
//
// Traceability (docs/requirements/SRS):
//   SRS-1.1  Join open seat
//   SRS-1.4  Reject join on full table
//   SRS-1.6  Join rejection message
//   SRS-1.7  Public table state contents (seat occupancy, username, and
//            profile picture, for now)
//   SRS-8.1  Display seated players' profile pictures
//   SRS-8.2  Default profile picture (seat.avatarUrl is null)
//   SRS-21.1 Leave between hands (simplified: no in-hand/fold distinction yet,
//            since hand/betting logic has not been built in this sprint)
//   SRS-NFR-022 Maximum seat count (3-9 seats)
//
// playerId identifies the signed-in account (the players.player_id from
// supabase/schema.sql, as a string), not a transport-level connection id —
// the server layer maps each connection to the player_id it authenticated as.
//
// Buy-ins (SRS-1.2, SRS-1.3) deduct/refund against players.balance at the
// transport layer (server/pokerRealtimeServer.ts), which computes the
// allowed buy-in range from this table's bigBlind (50x-200x) and passes an
// already-validated chip count in here — this class just stores and returns
// it. Reconnection grace periods (SRS-10.x, SRS-9.x) and all hand/betting
// logic are deferred to later sprints.

export const MIN_TABLE_SEATS = 3;
export const MAX_TABLE_SEATS = 9;
export const DEFAULT_TABLE_SEATS = 6;
export const DEFAULT_BIG_BLIND = 5;

export interface Seat {
  seatNumber: number;
  playerId: string | null;
  username: string | null;
  avatarUrl: string | null;
  chipStack: number | null;
}

export interface TableState {
  tableId: string;
  maxSeats: number;
  /** The table's configured big blind — the buy-in range is 50x-200x this. */
  bigBlind: number;
  seatedCount: number;
  seats: Seat[];
}

export interface JoinResult {
  ok: boolean;
  error?: string;
  seatNumber?: number;
}

export interface LeaveResult {
  ok: boolean;
  error?: string;
  seatNumber?: number;
  /** The chip stack the freed seat held, so the caller can refund it. */
  chipStack?: number;
}

export class PokerTable {
  readonly tableId: string;
  readonly bigBlind: number;
  private readonly maxSeats: number;
  private seats: Seat[];

  constructor(tableId: string, maxSeats: number = DEFAULT_TABLE_SEATS, bigBlind: number = DEFAULT_BIG_BLIND) {
    if (maxSeats < MIN_TABLE_SEATS || maxSeats > MAX_TABLE_SEATS) {
      throw new Error(
        `Table max seats must be between ${MIN_TABLE_SEATS} and ${MAX_TABLE_SEATS} (SRS-NFR-022).`
      );
    }

    if (!Number.isInteger(bigBlind) || bigBlind <= 0) {
      throw new Error('Table big blind must be a positive integer.');
    }

    this.tableId = tableId;
    this.bigBlind = bigBlind;
    this.maxSeats = maxSeats;
    this.seats = Array.from({ length: maxSeats }, (_, index) => ({
      seatNumber: index + 1,
      playerId: null,
      username: null,
      avatarUrl: null,
      chipStack: null,
    }));
  }

  getState(): TableState {
    return {
      tableId: this.tableId,
      maxSeats: this.maxSeats,
      bigBlind: this.bigBlind,
      seatedCount: this.seats.filter((seat) => seat.playerId !== null).length,
      seats: this.seats.map((seat) => ({ ...seat })),
    };
  }

  private findSeatByPlayerId(playerId: string): Seat | undefined {
    return this.seats.find((seat) => seat.playerId === playerId);
  }

  /** SRS-1.1: occupy any open seat; SRS-1.4: reject when no seats are open. */
  join(playerId: string, username: string, chipStack: number, avatarUrl: string | null = null): JoinResult {
    const trimmedUsername = username.trim();

    if (!trimmedUsername) {
      return { ok: false, error: 'A username is required to join the table.' };
    }

    if (!Number.isInteger(chipStack) || chipStack <= 0) {
      return { ok: false, error: 'A valid buy-in amount is required to join the table.' };
    }

    const existingSeat = this.findSeatByPlayerId(playerId);
    if (existingSeat) {
      return {
        ok: false,
        error: 'You are already seated at this table.',
        seatNumber: existingSeat.seatNumber,
      };
    }

    const openSeat = this.seats.find((seat) => seat.playerId === null);
    if (!openSeat) {
      return { ok: false, error: 'This table is full.' };
    }

    openSeat.playerId = playerId;
    openSeat.username = trimmedUsername;
    openSeat.avatarUrl = avatarUrl;
    openSeat.chipStack = chipStack;

    return { ok: true, seatNumber: openSeat.seatNumber };
  }

  /** SRS-21.1 (simplified): remove a seated player from their seat. */
  leave(playerId: string): LeaveResult {
    const seat = this.findSeatByPlayerId(playerId);
    if (!seat) {
      return { ok: false, error: 'You are not seated at this table.' };
    }

    const seatNumber = seat.seatNumber;
    const chipStack = seat.chipStack ?? 0;
    seat.playerId = null;
    seat.username = null;
    seat.avatarUrl = null;
    seat.chipStack = null;

    return { ok: true, seatNumber, chipStack };
  }
}
