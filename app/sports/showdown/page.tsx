'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Showdown, ShowdownTeam } from '../../../lib/sports/showdown';
import { projectedPayout } from '../../../lib/sports/showdown';
import { MIN_WAGER, checkWagerAmount } from '../../../lib/sports/wagers';
import { notifyBalanceChanged } from '../../../lib/balanceEvents';
import { getSupabaseBrowserClient } from '../../../lib/supabase';
import { SHOWDOWN_CHANNEL_NAME, SHOWDOWN_EVENT_CHANGED } from '../../../lib/sports/showdownRealtime';
import { LogoNotice, SPORT_ICONS, StatusBadge, formatDateTime, startsIn, teamColor } from '../../../components/sports/shared';
import { ShowdownArena } from '../../../components/sports/ShowdownArena';

// Pools update live over Realtime (useShowdownLive). These regular checks are
// the backup: often when the live connection is down, rarely when it's up.
const REFRESH_MS = 15_000;
const LIVE_REFRESH_MS = 60_000;
// A burst of pings (several bets at once) becomes one reload.
const PING_DEBOUNCE_MS = 300;
const QUICK_AMOUNTS = [50, 100, 250, 500];

type Notice = { kind: 'success' | 'error'; text: string } | null;

// Listens on the public Showdown channel the way app/poker/usePoker.ts does,
// and calls onChanged whenever the server says a pool or result changed.
// Returns whether the live connection is up.
function useShowdownLive(onChanged: () => void): boolean {
  const [live, setLive] = useState(false);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return; // Realtime isn't configured; the regular checks still run.

    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase.channel(SHOWDOWN_CHANNEL_NAME, { config: { broadcast: { self: false } } });
    channel.on('broadcast', { event: SHOWDOWN_EVENT_CHANGED }, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onChangedRef.current(), PING_DEBOUNCE_MS);
    });
    channel.subscribe((status) => {
      const connected = status === 'SUBSCRIBED';
      setLive(connected);
      // Catch up on anything missed while connecting or reconnecting.
      if (connected) onChangedRef.current();
    });

    return () => {
      if (timer) clearTimeout(timer);
      setLive(false);
      supabase.removeChannel(channel);
    };
  }, []);

  return live;
}

function percent(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : 50;
}

// SRS-213.1: one side's coins, players, and share of the pool.
function TeamPanel({
  team,
  pool,
  side,
  winner,
  mine,
}: {
  team: ShowdownTeam;
  pool: number;
  side: 'Away' | 'Home';
  winner: boolean | null;
  mine: boolean;
}) {
  return (
    <div className={`flex flex-col items-center text-center ${winner === false ? 'opacity-50' : ''}`}>
      {winner ? (
        <span className="mb-1 rounded-full bg-amber-300 px-2 py-0.5 text-[0.65rem] font-bold uppercase text-slate-950">Winner</span>
      ) : null}
      <p className="text-sm font-semibold leading-tight sm:text-base">{team.name}</p>
      <p className="text-xs text-slate-500">
        {side}
        {mine ? <span className="text-emerald-300"> · your side</span> : null}
      </p>
      <p className="mt-2 text-lg font-bold tabular-nums sm:text-xl">{team.total.toLocaleString()}</p>
      <p className="text-xs text-slate-400">
        coins · {team.players} {team.players === 1 ? 'player' : 'players'} · {percent(team.total, pool)}%
      </p>
    </div>
  );
}

// How the pool splits between the two sides.
function SplitBar({ away, home, pool }: { away: ShowdownTeam; home: ShowdownTeam; pool: number }) {
  const awayPct = percent(away.total, pool);
  const awayColor = teamColor(away.name);
  const homeColor = teamColor(home.name);
  return (
    <div className="mt-5">
      <div
        className="flex h-3 overflow-hidden rounded-full bg-slate-800"
        role="img"
        aria-label={`${away.name} ${awayPct}%, ${home.name} ${100 - awayPct}% of the pool`}
      >
        {pool > 0 ? (
          <>
            <div className="transition-all duration-700" style={{ width: `${awayPct}%`, backgroundColor: awayColor }} />
            <div className="transition-all duration-700" style={{ width: `${100 - awayPct}%`, backgroundColor: homeColor }} />
          </>
        ) : (
          <div className="w-full bg-[repeating-linear-gradient(90deg,#334155_0_8px,#1e293b_8px_16px)]" />
        )}
      </div>
      <p className="mt-2 text-center text-xs text-slate-500">
        {pool > 0 ? 'Share of the pool on each side' : 'No bets yet. Be the first to pick a side.'}
      </p>
    </div>
  );
}

function BetForm({
  showdown,
  token,
  balance,
  onPlaced,
}: {
  showdown: Showdown;
  token: string;
  balance: number | null;
  onPlaced: (balance: number, notice: Notice) => void;
}) {
  const mineTeamId = showdown.mine?.teamId ?? null;
  const [teamId, setTeamId] = useState<number | null>(mineTeamId);
  const [amountText, setAmountText] = useState('');
  const [stage, setStage] = useState<'edit' | 'confirm' | 'placing'>('edit');
  const [error, setError] = useState('');

  useEffect(() => {
    if (mineTeamId !== null) setTeamId(mineTeamId);
  }, [mineTeamId]);

  const team = teamId === showdown.home.id ? showdown.home : teamId === showdown.away.id ? showdown.away : null;
  const check = checkWagerAmount(amountText);
  const amount = check.ok ? check.amount : null;

  let amountError = '';
  if (amountText && !check.ok) amountError = check.error;
  else if (amount !== null && balance !== null && amount > balance) amountError = "You don't have enough coins for this bet.";

  // "If it ended now": the player's whole stake after this bet, against their
  // side's total and the pool after it.
  const myStakeAfter = (showdown.mine?.amount ?? 0) + (amount ?? 0);
  const preview =
    team && amount !== null && !amountError ? projectedPayout(myStakeAfter, team.total + amount, showdown.pool + amount) : null;

  async function place() {
    if (!team || amount === null) return;
    setStage('placing');
    setError('');
    try {
      const res = await fetch('/api/sports/showdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ showdownId: showdown.id, teamId: team.id, amount }),
      });
      const data = await res.json();
      if (res.ok) {
        setAmountText('');
        onPlaced(data.balance, {
          kind: 'success',
          text:
            data.entryAmount > amount
              ? `Added ${amount.toLocaleString()} coins. You now have ${Number(data.entryAmount).toLocaleString()} on ${team.name}.`
              : `You're in! ${amount.toLocaleString()} coins on ${team.name}.`,
        });
      } else {
        setError(data.error || 'Could not place your bet.');
      }
    } catch {
      setError('Could not reach the server. Your coins were not taken. Please try again.');
    }
    setStage('edit');
  }

  return (
    <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
      <p className="text-sm font-medium text-slate-300">{mineTeamId === null ? 'Pick a side' : 'Add to your side'}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {[showdown.away, showdown.home].map((t) => {
          const locked = mineTeamId !== null && mineTeamId !== t.id;
          const selected = teamId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              disabled={locked || stage !== 'edit'}
              onClick={() => setTeamId(t.id)}
              aria-pressed={selected}
              className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                selected
                  ? 'border-emerald-300 bg-emerald-400 text-slate-950'
                  : 'border-slate-700 bg-slate-800 text-slate-100 hover:border-emerald-400/70'
              } disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900 disabled:text-slate-600`}
            >
              {t.name}
            </button>
          );
        })}
      </div>
      {mineTeamId !== null ? (
        <p className="mt-2 text-xs text-slate-500">You can only add to the side you picked.</p>
      ) : null}

      <label htmlFor={`showdown-amount-${showdown.id}`} className="mt-4 block text-sm text-slate-300">
        Coins (minimum {MIN_WAGER})
      </label>
      <input
        id={`showdown-amount-${showdown.id}`}
        inputMode="numeric"
        value={amountText}
        disabled={stage !== 'edit'}
        onChange={(e) => setAmountText(e.target.value.trim())}
        placeholder={String(MIN_WAGER)}
        className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-lg tabular-nums text-slate-100 outline-none transition focus:border-emerald-400 disabled:opacity-60"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {QUICK_AMOUNTS.map((value) => (
          <button
            key={value}
            type="button"
            disabled={stage !== 'edit'}
            onClick={() => setAmountText(String(value))}
            className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-300 hover:border-emerald-400/70 disabled:opacity-60"
          >
            {value}
          </button>
        ))}
      </div>
      {amountError ? <p className="mt-2 text-sm text-red-300">{amountError}</p> : null}

      {preview !== null && team ? (
        <p className="mt-3 text-sm text-slate-300">
          If <span className="font-semibold">{team.name}</span> win and the pool stays as it is, you&apos;d get{' '}
          <span className="font-semibold text-emerald-300">{preview.toLocaleString()} coins</span>.
          <span className="block text-xs text-slate-500">The final amount depends on how everyone else bets before kickoff.</span>
        </p>
      ) : null}

      {stage === 'edit' ? (
        <button
          type="button"
          disabled={!team || amount === null || !!amountError}
          onClick={() => setStage('confirm')}
          className="mt-4 w-full rounded-xl bg-emerald-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mineTeamId === null ? 'Join the Showdown' : 'Add coins'}
        </button>
      ) : (
        <div className="mt-4 rounded-xl border border-emerald-700/60 bg-emerald-950/40 p-4">
          <p className="text-sm text-slate-200">
            Put <span className="font-semibold">{amount?.toLocaleString()} coins</span> on{' '}
            <span className="font-semibold">{team?.name}</span>? The coins come out of your balance now, and Showdown bets
            can&apos;t be cancelled or switched to the other side.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={place}
              disabled={stage === 'placing'}
              className="flex-1 rounded-xl bg-emerald-400 px-4 py-2.5 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-60"
            >
              {stage === 'placing' ? 'Placing…' : 'Confirm'}
            </button>
            <button
              type="button"
              onClick={() => setStage('edit')}
              disabled={stage === 'placing'}
              className="rounded-xl border border-slate-700 px-4 py-2.5 text-slate-300 transition hover:border-slate-500 disabled:opacity-60"
            >
              Back
            </button>
          </div>
        </div>
      )}
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
    </div>
  );
}

function YourEntry({ showdown }: { showdown: Showdown }) {
  const mine = showdown.mine;
  if (!mine) return null;
  const team = mine.teamId === showdown.home.id ? showdown.home : showdown.away;

  let line: React.ReactNode;
  if (showdown.outcome === 'Settled') {
    const won = showdown.winningTeamId === mine.teamId;
    line = won ? (
      <>
        <span className="font-semibold text-emerald-300">You won!</span> {(mine.payout ?? 0).toLocaleString()} coins paid to your
        balance (+{((mine.payout ?? 0) - mine.amount).toLocaleString()}).
      </>
    ) : (
      <>
        <span className="font-semibold text-red-300">You lost</span> {mine.amount.toLocaleString()} coins.
      </>
    );
  } else if (showdown.outcome === 'Refunded') {
    line = <>Refunded: your {mine.amount.toLocaleString()} coins were returned.</>;
  } else {
    line = (
      <>
        If they win and the pool stays as it is:{' '}
        <span className="font-semibold text-emerald-300">{mine.projectedPayout.toLocaleString()} coins</span>
      </>
    );
  }

  return (
    <div className="mt-5 rounded-2xl border border-emerald-800/60 bg-emerald-950/30 p-4 text-sm">
      <p>
        You&apos;re backing <span className="font-semibold">{team.name}</span> with{' '}
        <span className="font-semibold tabular-nums">{mine.amount.toLocaleString()} coins</span>.
      </p>
      <p className="mt-1 text-slate-300">{line}</p>
    </div>
  );
}

function ShowdownCard({
  showdown,
  token,
  balance,
  onPlaced,
}: {
  showdown: Showdown;
  token: string | null;
  balance: number | null;
  onPlaced: (balance: number, notice: Notice) => void;
}) {
  const settled = showdown.outcome === 'Settled';
  const countdown = showdown.open ? startsIn(showdown.startTime, Date.now()) : null;
  const showScore = showdown.status !== 'Upcoming' && showdown.homeScore !== null && showdown.awayScore !== null;
  const winnerOf = (team: ShowdownTeam) => (settled ? showdown.winningTeamId === team.id : null);

  return (
    <article className="overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span className="flex items-center gap-2">
          <span className="text-base" aria-hidden="true">
            {SPORT_ICONS[showdown.sport] ?? ''}
          </span>
          <span className="rounded-md bg-slate-800 px-1.5 py-0.5 font-semibold text-slate-300">{showdown.league}</span>
          {formatDateTime(showdown.startTime)}
          {countdown ? <span className="text-emerald-300">· {countdown}</span> : null}
        </span>
        <span className="flex items-center gap-2">
          {showdown.outcome === 'Refunded' ? <span className="text-slate-400">Refunded</span> : null}
          {showdown.open ? (
            <span className="rounded-full border border-emerald-600 bg-emerald-500/10 px-2.5 py-0.5 text-emerald-200">Open</span>
          ) : (
            <StatusBadge status={showdown.status} />
          )}
        </span>
      </div>

      <div className="mt-5">
        <ShowdownArena showdown={showdown} />
      </div>

      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-start gap-2 sm:gap-6">
        <TeamPanel team={showdown.away} pool={showdown.pool} side="Away" winner={winnerOf(showdown.away)} mine={showdown.mine?.teamId === showdown.away.id} />
        <div className="flex flex-col items-center">
          {showScore ? (
            <p className="mb-2 text-lg font-bold tabular-nums">
              {showdown.awayScore} – {showdown.homeScore}
            </p>
          ) : null}
          <p className="text-[0.65rem] uppercase tracking-widest text-slate-500">Pool</p>
          <p className="text-xl font-bold tabular-nums text-emerald-300 sm:text-2xl">{showdown.pool.toLocaleString()}</p>
          <p className="text-[0.65rem] text-slate-500">coins</p>
        </div>
        <TeamPanel team={showdown.home} pool={showdown.pool} side="Home" winner={winnerOf(showdown.home)} mine={showdown.mine?.teamId === showdown.home.id} />
      </div>

      <SplitBar away={showdown.away} home={showdown.home} pool={showdown.pool} />
      <YourEntry showdown={showdown} />

      {showdown.open ? (
        token ? (
          <BetForm showdown={showdown} token={token} balance={balance} onPlaced={onPlaced} />
        ) : (
          <Link
            href="/login"
            className="mt-5 block w-full rounded-xl bg-emerald-400 px-6 py-3 text-center font-semibold text-slate-950 transition hover:bg-emerald-300"
          >
            Log in to join the Showdown
          </Link>
        )
      ) : showdown.outcome === 'Pending' ? (
        <p className="mt-5 text-center text-sm text-slate-400">Betting closed at kickoff. The pool pays out after the final score.</p>
      ) : null}
    </article>
  );
}

export default function ShowdownPage() {
  const [showdowns, setShowdowns] = useState<Showdown[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    setToken(localStorage.getItem('player_token'));
  }, []);

  const load = useCallback(async () => {
    try {
      const stored = localStorage.getItem('player_token');
      const res = await fetch('/api/sports/showdown', {
        cache: 'no-store',
        headers: stored ? { Authorization: `Bearer ${stored}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load the Showdowns.');
      setShowdowns(data.showdowns as Showdown[]);
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load the Showdowns.');
    }
  }, []);

  const live = useShowdownLive(load);

  useEffect(() => {
    load();
    const timer = setInterval(load, live ? LIVE_REFRESH_MS : REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, live]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/profile/balance', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setBalance(data?.balance ?? null))
      .catch(() => setBalance(null));
  }, [token]);

  const onPlaced = (next: number, message: Notice) => {
    setBalance(next);
    notifyBalanceChanged();
    setNotice(message);
    load();
  };

  return (
    <main className="min-h-page bg-slate-950 px-4 py-10 text-slate-100 sm:px-6">
      <div className="mx-auto w-full max-w-4xl">
        <div className="flex items-center justify-between">
          <Link href="/sports" className="text-sm text-slate-400 hover:text-slate-200">
            ← Sportsbook
          </Link>
          <span
            className={`flex items-center gap-1.5 text-xs ${live ? 'text-emerald-300' : 'text-slate-500'}`}
            title={live ? 'Pools update the moment anyone bets' : 'Reconnecting… pools still refresh every 15 seconds'}
          >
            <span className={`h-2 w-2 rounded-full ${live ? 'animate-pulse bg-emerald-400' : 'bg-slate-600'}`} aria-hidden="true" />
            {live ? 'Live' : 'Connecting…'}
          </span>
        </div>

        <header className="relative mt-4 overflow-hidden rounded-3xl border border-amber-400/30 bg-gradient-to-br from-amber-500/20 via-slate-900 to-slate-950 p-6 sm:p-8">
          <p className="text-sm uppercase tracking-[0.3em] text-amber-300">One game. Two sides. One pool.</p>
          <h1 className="mt-3 text-4xl font-black uppercase italic tracking-tight sm:text-5xl">The Showdown</h1>
          <p className="mt-3 max-w-xl text-slate-300">
            Each sport gets one featured game. Pick a side, and when the game ends the winners split the whole pool, in
            proportion to how much they put in.
          </p>
          <ol className="mt-5 grid gap-2 text-sm text-slate-300 sm:grid-cols-3">
            <li className="rounded-2xl border border-slate-700/60 bg-slate-950/50 px-4 py-3">
              <span className="font-semibold text-amber-300">1.</span> Back one team, {MIN_WAGER}+ coins.
            </li>
            <li className="rounded-2xl border border-slate-700/60 bg-slate-950/50 px-4 py-3">
              <span className="font-semibold text-amber-300">2.</span> Add more any time before kickoff (same side only).
            </li>
            <li className="rounded-2xl border border-slate-700/60 bg-slate-950/50 px-4 py-3">
              <span className="font-semibold text-amber-300">3.</span> Winners split the pool. Ties are refunded.
            </li>
          </ol>
        </header>

        {notice ? (
          <p
            role={notice.kind === 'error' ? 'alert' : 'status'}
            className={`mt-6 rounded-xl border p-3 text-sm ${
              notice.kind === 'success' ? 'border-emerald-700 bg-emerald-950/60 text-emerald-200' : 'border-red-800 bg-red-950/60 text-red-200'
            }`}
          >
            {notice.text}
          </p>
        ) : null}

        <div className="mt-8 space-y-6">
          {loadError ? <p className="rounded-xl border border-red-800 bg-red-950/60 p-4 text-sm text-red-200">{loadError}</p> : null}
          {!showdowns && !loadError ? <p className="text-slate-400">Loading the Showdowns…</p> : null}
          {showdowns && showdowns.length === 0 ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 text-center">
              <p className="text-lg font-medium">No Showdowns right now</p>
              <p className="mt-2 text-sm text-slate-400">A new one is picked for each sport after the last one kicks off.</p>
            </div>
          ) : null}
          {showdowns?.map((showdown) => (
            <ShowdownCard key={showdown.id} showdown={showdown} token={token} balance={balance} onPlaced={onPlaced} />
          ))}
        </div>

        <LogoNotice />
      </div>
    </main>
  );
}
