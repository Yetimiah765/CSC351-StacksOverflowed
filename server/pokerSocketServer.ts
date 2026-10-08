// Standalone Socket.io server for the poker room, matching the "Socket
// Server (WebSocket / Socket.io)" box in docs/architecture/C2.mmd. It runs
// as its own process, separate from the Next.js app and its REST API routes.
//
// Sprint 1 scope: a single hardcoded table that supports joining an open
// seat, leaving a seat, and a hard cap on seat count. Multi-table support,
// buy-ins, reconnection grace periods, and hand/betting logic are deferred
// to later sprints.
//
// Run with: npm run socket

import { createServer } from 'http';
import { Server } from 'socket.io';
import { DEFAULT_TABLE_SEATS, PokerTable } from '../lib/pokerTable';

const PORT = Number(process.env.POKER_SOCKET_PORT) || 4001;
const MAX_SEATS = Number(process.env.POKER_TABLE_MAX_SEATS) || DEFAULT_TABLE_SEATS;
const CLIENT_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

const table = new PokerTable('table-1', MAX_SEATS);

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

function broadcastTableState() {
  io.emit('table:state', table.getState());
}

type Ack<T> = (result: T) => void;

io.on('connection', (socket) => {
  // SRS-1.7/1.8 (simplified): send current state on connect, then push
  // updates to every client whenever the state changes.
  socket.emit('table:state', table.getState());

  socket.on('table:join', (payload: { username?: string } | undefined, ack?: Ack<unknown>) => {
    const result = table.join(socket.id, payload?.username ?? '');
    ack?.(result);
    if (result.ok) {
      broadcastTableState();
    }
  });

  socket.on('table:leave', (ack?: Ack<unknown>) => {
    const result = table.leave(socket.id);
    ack?.(result);
    if (result.ok) {
      broadcastTableState();
    }
  });

  // Simplified for sprint 1: a dropped connection immediately frees the
  // seat. The full reconnection grace period (SRS-10.x / SRS-9.x) is
  // deferred to a later sprint.
  socket.on('disconnect', () => {
    const result = table.leave(socket.id);
    if (result.ok) {
      broadcastTableState();
    }
  });
});

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Poker socket server listening on port ${PORT} (table cap: ${MAX_SEATS} seats)`);
});
