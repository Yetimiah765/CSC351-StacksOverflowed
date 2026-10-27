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
  winner,
  mine,
}: {
  team: ShowdownTeam;
  pool: number;
  winner: boolean | null;
  mine: boolean;
}) {
  return (
    <div className={`flex flex-col items-center text-center ${winner === false ? 'opacity-50' : ''}`}>
      <p className="text-sm font-semibold leading-tight sm:text-base">{team.name}</p>
      {/* Same height on both sides, badge or not, so the numbers line up. */}
      <p className="mt-1 flex h-5 gap-1">
        {winner ? (
          <span className="rounded-full bg-amber-300 px-2 py-0.5 text-[0.65rem] font-bold uppercase text-slate-950">Winner</span>
        ) : null}
        {mine ? (
          <span className="rounded-full bg-sky-400/15 px-2 py-0.5 text-[0.65rem] font-semibold uppercase text-sky-300">You</span>
        ) : null}
      </p>
      <p className="mt-1 text-lg font-bold tabular-nums sm:text-xl">{team.total.toLocaleString()}</p>
      <p className="text-xs tabular-nums text-slate-400" title={`${team.players} ${team.players === 1 ? 'player' : 'players'}`}>
        {percent(team.total, pool)}% · 👤 {team.players}
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
      {pool > 0 ? null : <p className="mt-2 text-center text-xs text-slate-500">No bets yet</p>}
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
  else if (amount !== null && balance !== null && amount > balance) amountError = 'Not enough coins.';

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
              ? `+${amount.toLocaleString()} · ${Number(data.entryAmount).toLocaleString()} on ${team.name}`
              : `You're in! ${amount.toLocaleString()} on ${team.name}`,
        });
      } else {
        setError(data.error || 'Could not place your bet.');
      }
    } catch {
      setError("Couldn't connect. No coins were taken.");
    }
    setStage('edit');
  }

  return (
    <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="grid grid-cols-2 gap-2">
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
              title={locked ? 'You can only add to your side' : undefined}
              className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                selected
                  ? 'border-sky-300 bg-sky-400 text-slate-950'
                  : 'border-slate-700 bg-slate-800 text-slate-100 hover:border-sky-400/70'
              } disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900 disabled:text-slate-600`}
            >
              {locked ? <span aria-hidden="true">🔒 </span> : null}
              {t.name}
            </button>
          );
        })}
      </div>

      <input
        id={`showdown-amount-${showdown.id}`}
        aria-label={`Coins, minimum ${MIN_WAGER}`}
        inputMode="numeric"
        value={amountText}
        disabled={stage !== 'edit'}
        onChange={(e) => setAmountText(e.target.value.trim())}
        placeholder={`Coins (min ${MIN_WAGER})`}
        className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-lg tabular-nums text-slate-100 outline-none transition placeholder:text-base placeholder:text-slate-600 focus:border-sky-400 disabled:opacity-60"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {QUICK_AMOUNTS.map((value) => (
          <button
            key={value}
            type="button"
            disabled={stage !== 'edit'}
            onClick={() => setAmountText(String(value))}
            className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-300 hover:border-sky-400/70 disabled:opacity-60"
          >
            {value}
          </button>
        ))}
      </div>
      {amountError ? <p className="mt-2 text-sm text-red-300">{amountError}</p> : null}

      {preview !== null && team ? (
        <p className="mt-3 text-sm text-slate-300" title="Changes as others bet before kickoff">
          Win ≈ <span className="font-semibold text-emerald-300">{preview.toLocaleString()}</span>
        </p>
      ) : null}

      {stage === 'edit' ? (
        <button
          type="button"
          disabled={!team || amount === null || !!amountError}
          onClick={() => setStage('confirm')}
          className="mt-4 w-full rounded-xl bg-sky-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mineTeamId === null ? 'Join' : 'Add coins'}
        </button>
      ) : (
        <div className="mt-4 rounded-xl border border-sky-700/60 bg-sky-950/40 p-4">
          <p className="text-sm text-slate-200">
            <span className="font-semibold">{amount?.toLocaleString()}</span> on <span className="font-semibold">{team?.name}</span>?
            <span className="block text-xs text-slate-400">Final. No cancelling or switching sides.</span>
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={place}
              disabled={stage === 'placing'}
              className="flex-1 rounded-xl bg-sky-400 px-4 py-2.5 font-semibold text-slate-950 transition hover:bg-sky-300 disabled:opacity-60"
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

  let result: React.ReactNode;
  if (showdown.outcome === 'Settled') {
    const won = showdown.winningTeamId === mine.teamId;
    result = won ? (
      <span className="font-semibold text-emerald-300">Won +{((mine.payout ?? 0) - mine.amount).toLocaleString()}</span>
    ) : (
      <span className="font-semibold text-red-300">Lost {mine.amount.toLocaleString()}</span>
    );
  } else if (showdown.outcome === 'Refunded') {
    result = <span className="text-slate-300">Refunded {mine.amount.toLocaleString()}</span>;
  } else {
    result = (
      <span className="text-slate-300" title="If they win and the pool stays as it is">
        Win ≈ <span className="font-semibold text-emerald-300">{mine.projectedPayout.toLocaleString()}</span>
      </span>
    );
  }

  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sky-800/60 bg-sky-950/30 px-4 py-3 text-sm">
      <span>
        Your bet: <span className="font-semibold tabular-nums">{mine.amount.toLocaleString()}</span> on{' '}
        <span className="font-semibold">{team.name}</span>
      </span>
      <span className="tabular-nums">{result}</span>
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
          {countdown ? <span className="text-sky-300">· {countdown}</span> : null}
        </span>
        <span className="flex items-center gap-2">
          {showdown.open ? (
            <span className="rounded-full border border-sky-600 bg-sky-500/10 px-2.5 py-0.5 text-sky-200">Open</span>
          ) : (
            <StatusBadge status={showdown.status} />
          )}
        </span>
      </div>

      <div className="mt-5">
        <ShowdownArena showdown={showdown} />
      </div>

      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-start gap-2 sm:gap-6">
        <TeamPanel team={showdown.away} pool={showdown.pool} winner={winnerOf(showdown.away)} mine={showdown.mine?.teamId === showdown.away.id} />
        <div className="flex flex-col items-center">
          {showScore ? (
            <p className="mb-2 text-lg font-bold tabular-nums">
              {showdown.awayScore} – {showdown.homeScore}
            </p>
          ) : null}
          <p className="text-[0.65rem] uppercase tracking-widest text-slate-500">Pool</p>
          <p className="text-xl font-bold tabular-nums text-emerald-300 sm:text-2xl">{showdown.pool.toLocaleString()}</p>
        </div>
        <TeamPanel team={showdown.home} pool={showdown.pool} winner={winnerOf(showdown.home)} mine={showdown.mine?.teamId === showdown.home.id} />
      </div>

      <SplitBar away={showdown.away} home={showdown.home} pool={showdown.pool} />
      <YourEntry showdown={showdown} />

      {showdown.open ? (
        token ? (
          <BetForm showdown={showdown} token={token} balance={balance} onPlaced={onPlaced} />
        ) : (
          <Link
            href="/login"
            className="mt-5 block w-full rounded-xl bg-sky-400 px-6 py-3 text-center font-semibold text-slate-950 transition hover:bg-sky-300"
          >
            Log in to play
          </Link>
        )
      ) : showdown.outcome === 'Pending' ? (
        <p className="mt-5 text-center text-sm text-slate-400">🔒 Betting closed</p>
      ) : null}
    </article>
  );
}

// SRS-215.1 for the Showdown: how a public bet is won (SRS-214.1), refunded
// (SRS-214.3), and limited (SRS-212.1–212.3), behind the Rules button.
const RULES = [
  `Back one team with ${MIN_WAGER}+ coins.`,
  'Add more any time before kickoff, same side only.',
  'When the game ends, winners split the whole pool by how much they put in.',
  'Ties, cancelled games, or no one on the winning side: everyone is refunded.',
  'Bets are final. No cancelling or switching sides.',
];

function RulesDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="showdown-rules-title"
        className="w-full max-w-md rounded-3xl border border-amber-400/30 bg-slate-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="showdown-rules-title" className="text-2xl font-black uppercase italic tracking-tight">
          Rules
        </h2>
        <ol className="mt-4 space-y-2 text-sm text-slate-300">
          {RULES.map((rule, i) => (
            <li key={rule} className="flex gap-2">
              <span className="font-semibold text-amber-300">{i + 1}.</span>
              {rule}
            </li>
          ))}
        </ol>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-amber-300 px-4 py-2.5 font-semibold text-slate-950 transition hover:bg-amber-200"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

export default function ShowdownPage() {
  const [showdowns, setShowdowns] = useState<Showdown[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [showRules, setShowRules] = useState(false);

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
          <span className="flex items-center gap-3">
            <span
              className={`flex items-center gap-1.5 text-xs ${live ? 'text-emerald-300' : 'text-slate-500'}`}
              title={live ? 'Pools update the moment anyone bets' : 'Reconnecting… pools still refresh every 15 seconds'}
            >
              <span className={`h-2 w-2 rounded-full ${live ? 'animate-pulse bg-emerald-400' : 'bg-slate-600'}`} aria-hidden="true" />
              {live ? 'Live' : 'Connecting…'}
            </span>
            <button
              type="button"
              onClick={() => setShowRules(true)}
              className="rounded-full border border-amber-400/40 px-3 py-1 text-xs font-semibold text-amber-300 transition hover:border-amber-300 hover:text-amber-200"
            >
              Rules
            </button>
          </span>
        </div>
        {showRules ? <RulesDialog onClose={() => setShowRules(false)} /> : null}

        <header className="relative mt-4 overflow-hidden rounded-3xl border border-amber-400/30 bg-gradient-to-br from-amber-500/20 via-slate-900 to-slate-950 px-6 py-8 sm:px-8 sm:py-10">
          <h1 className="text-4xl font-black uppercase italic tracking-tight sm:text-5xl">The Showdown</h1>
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
              <p className="mt-2 text-sm text-slate-400">Check back soon.</p>
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
