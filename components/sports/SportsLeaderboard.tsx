'use client';

// The sportsbook's Leaderboard tab (UR-216): Top Profit for the week
// (SRS-216.1, 216.3) with the player's own rank (216.4), Biggest Wins
// (216.5), and a This week / Last week toggle (216.6). The week itself is
// worked out on the server (lib/sports/leaderboard.ts, SRS-216.2).

import { useEffect, useState } from 'react';
import type { Leaderboard, TopEarner } from '../../lib/sports/leaderboard';

const MEDALS = ['🥇', '🥈', '🥉'];

function signed(n: number) {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString()}`;
}

function netColor(n: number) {
  return n > 0 ? 'text-emerald-300' : n < 0 ? 'text-red-300' : 'text-slate-300';
}

// "Oct 26 – Nov 1", in Eastern time like the week itself.
function weekLabel(week: Leaderboard['week']) {
  const format = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
  return `${format(week.start)} – ${format(new Date(new Date(week.end).getTime() - 1).toISOString())}`;
}

function RankBadge({ rank }: { rank: number }) {
  return (
    <span className="w-8 shrink-0 text-center text-lg font-black italic tabular-nums text-slate-400">
      {rank <= 3 ? <span aria-label={`Rank ${rank}`}>{MEDALS[rank - 1]}</span> : rank}
    </span>
  );
}

function EarnerRow({ row, isMe }: { row: TopEarner; isMe: boolean }) {
  return (
    <li
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
        isMe ? 'border border-sky-400/50 bg-sky-400/10' : row.rank <= 3 ? 'bg-slate-800/60' : ''
      }`}
    >
      <RankBadge rank={row.rank} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">
          {row.username}
          {isMe ? <span className="ml-2 text-xs font-semibold uppercase text-sky-300">You</span> : null}
        </span>
        <span className="text-xs text-slate-500">
          {row.bets} {row.bets === 1 ? 'bet' : 'bets'} · {row.wins} won
        </span>
      </span>
      <span className={`text-lg font-bold tabular-nums ${netColor(row.net)}`}>{signed(row.net)}</span>
    </li>
  );
}

export function SportsLeaderboard({ token, playerId }: { token: string | null; playerId: number | null }) {
  const [week, setWeek] = useState<'this' | 'last'>('this');
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setBoard(null);
    setError('');
    fetch(`/api/sports/leaderboard${week === 'last' ? '?week=last' : ''}`, {
      cache: 'no-store',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load the leaderboard.');
        if (!cancelled) setBoard(data as Leaderboard);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the leaderboard.');
      });
    return () => {
      cancelled = true;
    };
  }, [week, token]);

  const me = board?.me ?? null;
  const meListed = board && playerId !== null && board.topEarners.some((row) => row.playerId === playerId);

  return (
    <section aria-label="Leaderboard">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-black uppercase italic tracking-wide text-slate-300">
          {board ? `Week of ${weekLabel(board.week)}` : 'Leaderboard'}
        </p>
        <div className="inline-flex rounded-full border border-slate-800 bg-slate-900 p-1" role="group" aria-label="Which week">
          {(
            [
              ['this', 'This week'],
              ['last', 'Last week'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={week === key}
              onClick={() => setWeek(key)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                week === key ? 'bg-sky-400 text-slate-950' : 'text-slate-300 hover:text-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="mt-4 rounded-xl border border-red-800 bg-red-950/60 p-4 text-sm text-red-200">{error}</p> : null}
      {!board && !error ? <p className="mt-4 text-slate-400">Loading the leaderboard…</p> : null}

      {board?.lastWeekChampion ? (
        <p className="mt-4 flex flex-wrap items-center justify-center gap-x-2 rounded-2xl border border-amber-400/50 bg-gradient-to-r from-amber-600/20 via-slate-900 to-amber-600/20 px-4 py-3 text-center">
          <span aria-hidden="true">🏆</span>
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Last week&apos;s champion</span>
          <span className="font-black italic">{board.lastWeekChampion.username}</span>
          <span className="font-bold tabular-nums text-emerald-300">{signed(board.lastWeekChampion.net)}</span>
        </p>
      ) : null}

      {board ? (
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="min-w-0 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5">
            <h2 className="text-xl font-black uppercase italic tracking-tight">Top profit</h2>
            {board.topEarners.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">
                No bets decided {week === 'this' ? 'yet this week. Results land as games finish.' : 'last week.'}
              </p>
            ) : (
              <ol className="mt-3 space-y-1">
                {board.topEarners.map((row) => (
                  <EarnerRow key={row.playerId} row={row} isMe={row.playerId === playerId} />
                ))}
              </ol>
            )}
            {me && !meListed ? (
              <p className="mt-3 flex items-center justify-between rounded-xl border border-sky-400/40 bg-sky-400/10 px-3 py-2.5 text-sm">
                {me.rank === null ? (
                  <span className="text-slate-300">
                    You&apos;re not on the board yet. {week === 'this' ? 'Win a bet this week to get on it.' : ''}
                  </span>
                ) : (
                  <>
                    <span>
                      <span className="font-semibold">You</span> · #{me.rank} · {me.bets} {me.bets === 1 ? 'bet' : 'bets'}
                    </span>
                    <span className={`font-bold tabular-nums ${netColor(me.net)}`}>{signed(me.net)}</span>
                  </>
                )}
              </p>
            ) : null}
          </div>

          <div className="min-w-0 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5">
            <h2 className="text-xl font-black uppercase italic tracking-tight">Biggest wins</h2>
            {board.biggestWins.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">No winning bets {week === 'this' ? 'yet this week.' : 'last week.'}</p>
            ) : (
              <ol className="mt-3 space-y-2">
                {board.biggestWins.map((win) => (
                  <li
                    key={`${win.playerId}-${win.settledAt}-${win.pick}`}
                    className={`rounded-2xl border px-3 py-2.5 ${
                      win.playerId === playerId ? 'border-sky-400/50 bg-sky-400/10' : 'border-slate-800 bg-slate-950/50'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="text-sm">{win.rank <= 3 ? MEDALS[win.rank - 1] : `#${win.rank}`}</span>
                        <span className="truncate font-semibold">{win.username}</span>
                      </span>
                      <span className="text-lg font-bold tabular-nums text-emerald-300">{win.payout.toLocaleString()}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-400">
                      {win.kind === 'showdown' ? <span className="mr-1 font-semibold text-amber-300">Showdown</span> : null}
                      {win.pick} · {win.game}
                    </p>
                    <p className="text-xs text-slate-500">Profit {signed(win.profit)}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
