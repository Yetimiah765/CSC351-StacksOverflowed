'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface Seat {
  seatNumber: number;
  playerId: string | null;
  username: string | null;
}

interface TableState {
  tableId: string;
  maxSeats: number;
  seatedCount: number;
  seats: Seat[];
}

interface ActionResult {
  ok: boolean;
  error?: string;
  seatNumber?: number;
}

const SOCKET_URL = process.env.NEXT_PUBLIC_POKER_SOCKET_URL || 'http://localhost:4001';

export default function PokerTablePage() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [tableState, setTableState] = useState<TableState | null>(null);
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const nextSocket = io(SOCKET_URL);
    setSocket(nextSocket);

    nextSocket.on('connect', () => setConnected(true));
    nextSocket.on('disconnect', () => setConnected(false));
    nextSocket.on('table:state', (state: TableState) => setTableState(state));

    return () => {
      nextSocket.disconnect();
    };
  }, []);

  const mySeat = useMemo(() => {
    if (!socket || !tableState) return null;
    return tableState.seats.find((seat) => seat.playerId === socket.id) ?? null;
  }, [socket, tableState]);

  const isFull = tableState ? tableState.seatedCount >= tableState.maxSeats : false;

  function handleJoin() {
    if (!socket) return;
    setError('');
    socket.emit('table:join', { username }, (result: ActionResult) => {
      if (!result.ok) {
        setError(result.error || 'Unable to join the table.');
      }
    });
  }

  function handleLeave() {
    if (!socket) return;
    setError('');
    socket.emit('table:leave', (result: ActionResult) => {
      if (!result.ok) {
        setError(result.error || 'Unable to leave the table.');
      }
    });
  }

  return (
    <main className="min-h-page bg-slate-950 text-slate-100 flex items-center justify-center px-6 py-12">
      <section className="w-full max-w-3xl rounded-3xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl shadow-black/30">
        <p className="text-sm uppercase tracking-[0.25em] text-emerald-300">Poker Room</p>
        <h1 className="mt-4 text-3xl font-semibold">Table 1</h1>
        <p className="mt-2 text-slate-300">
          {connected ? 'Connected to the table server.' : 'Connecting to the table server…'}
        </p>

        {tableState ? (
          <p className="mt-2 text-sm text-slate-400">
            {tableState.seatedCount} / {tableState.maxSeats} seats filled
            {isFull ? ' — table full' : ''}
          </p>
        ) : null}

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {tableState?.seats.map((seat) => (
            <div
              key={seat.seatNumber}
              className={`rounded-xl border p-4 text-sm ${
                seat.playerId
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-100'
                  : 'border-slate-700 bg-slate-800/60 text-slate-400'
              }`}
            >
              <p className="text-xs uppercase tracking-wide text-slate-500">Seat {seat.seatNumber}</p>
              <p className="mt-1 font-medium">{seat.username ?? 'Open'}</p>
              {seat.playerId === socket?.id ? <p className="mt-1 text-xs text-emerald-300">(you)</p> : null}
            </div>
          ))}
        </div>

        <div className="mt-8 space-y-4">
          {!mySeat ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Enter a username"
                className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-400"
              />
              <button
                type="button"
                onClick={handleJoin}
                disabled={!connected || isFull}
                className="rounded-xl bg-emerald-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Join table
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleLeave}
              className="rounded-xl bg-red-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-red-300"
            >
              Leave seat {mySeat.seatNumber}
            </button>
          )}

          {error ? (
            <p className="rounded-xl border border-red-800 bg-red-950/60 p-3 text-sm text-red-200">{error}</p>
          ) : null}
        </div>

        <p className="mt-6 text-sm text-slate-300">
          Back to{' '}
          <Link href="/" className="text-emerald-300 hover:underline">
            home
          </Link>
        </p>
      </section>
    </main>
  );
}
