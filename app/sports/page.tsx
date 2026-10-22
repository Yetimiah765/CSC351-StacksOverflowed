'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EventListing, OptionSide, SportsEvent, SportsMarket, SportsOption } from '../../lib/sports/events';
import { potentialPayout } from '../../lib/sports/payout';
import { MIN_WAGER, canWinCoins, checkWagerAmount } from '../../lib/sports/wagers';
import { notifyBalanceChanged } from '../../lib/balanceEvents';
import type { MyBet, MyBets, WagerResult } from '../../lib/sports/myBets';
import type { MyShowdownEntry, MyShowdowns } from '../../lib/sports/showdown';
import { LogoNotice, SPORT_ICONS, StatusBadge, TeamCrest, formatDateTime, startsIn } from '../../components/sports/shared';

type Selection = { event: SportsEvent; market: SportsMarket; option: SportsOption };
type SlipMessage = { kind: 'success' | 'error'; text: string } | null;
// GET /api/sports/wagers: regular bets plus the player's Showdown entries.
type BetsData = MyBets & { showdowns: MyShowdowns };

// The sync job only refreshes the database a few times a day, so polling
// our own API (free) once a minute is plenty.
const REFRESH_MS = 60_000;
const QUICK_AMOUNTS = [50, 100, 250, 500];
const COLUMNS: { type: SportsMarket['type']; heading: string }[] = [
  { type: 'point_spread', heading: 'Spread' },
  { type: 'total', heading: 'Total' },
  { type: 'moneyline', heading: 'Moneyline' },
];

function formatOdds(odds: number) {
  return odds.toFixed(2);
}

function formatPoint(point: number) {
  return point > 0 ? `+${point}` : String(point);
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function dayHeading(iso: string) {
  return new Date(iso).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function canBet(event: SportsEvent, market: SportsMarket) {
  return event.status === 'Upcoming' && market.isOpen;
}

// The short text shown inside an odds button; the full label goes in the slip.
function cellCaption(market: SportsMarket, option: SportsOption) {
  if (market.type === 'point_spread') {
    const point = option.side === 'home' ? market.line : market.line === null ? null : -market.line;
    return point === null ? null : formatPoint(point);
  }
  if (market.type === 'total' && market.line !== null) return `${option.side === 'over' ? 'O' : 'U'} ${market.line}`;
  return null;
}

const ROW_SIDES: Record<SportsMarket['type'], [OptionSide, OptionSide, OptionSide]> = {
  point_spread: ['away', 'home', 'draw'],
  total: ['over', 'under', 'draw'],
  moneyline: ['away', 'home', 'draw'],
};

function FilterChip({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-4 py-1.5 text-sm transition ${
        active
          ? 'border-emerald-400 bg-emerald-400/10 text-emerald-200'
          : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500'
      }`}
    >
      {icon ? (
        <span aria-hidden="true" className="mr-1.5">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
}

function EventCard({
  event,
  selectedOptionId,
  onSelect,
}: {
  event: SportsEvent;
  selectedOptionId: number | null;
  onSelect: (selection: Selection) => void;
}) {
  const hasDraw = event.markets.some((m) => m.options.some((o) => o.side === 'draw'));
  const rows = [
    { name: event.awayTeam, score: event.awayScore },
    { name: event.homeTeam, score: event.homeScore },
    ...(hasDraw ? [{ name: 'Draw', score: null }] : []),
  ];
  const showScore = event.status !== 'Upcoming' && event.homeScore !== null && event.awayScore !== null;
  // Finished games stay listed for a day so players can see the result.
  const finished = event.status === 'Completed' || event.status === 'Canceled' || event.status === 'Postponed';

  const countdown = event.status === 'Upcoming' ? startsIn(event.startTime, Date.now()) : null;

  return (
    <article
      className={`rounded-2xl border p-3 transition sm:p-5 ${
        finished
          ? 'border-slate-800/60 bg-slate-900/40 opacity-60'
          : 'border-slate-800 bg-gradient-to-br from-slate-900 to-slate-900/60 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/5'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span className="flex items-center gap-2">
          <span className="rounded-md bg-slate-800 px-1.5 py-0.5 font-semibold text-slate-300">{event.league}</span>
          {formatTime(event.startTime)}
          {countdown ? <span className="text-emerald-300">· {countdown}</span> : null}
        </span>
        <span className="flex items-center gap-2">
          {event.resultPending ? <span className="text-slate-500">Final score pending</span> : null}
          <StatusBadge status={event.status} />
        </span>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[19rem] border-separate border-spacing-x-1 border-spacing-y-1.5 text-sm sm:border-spacing-x-2">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="text-left font-normal">Team</th>
              {COLUMNS.map((c) => (
                <th key={c.type} className="w-16 font-normal sm:w-28">
                  {c.heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.name}>
                <td className="pr-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2.5">
                      {row.name === 'Draw' ? null : <TeamCrest name={row.name} className="hidden sm:flex" />}
                      <span className={`font-medium leading-tight ${row.name === 'Draw' ? 'text-slate-400' : 'text-slate-100'}`}>
                        {row.name}
                        {rowIndex === 1 ? <span className="ml-1.5 text-xs font-normal text-slate-500">home</span> : null}
                      </span>
                    </span>
                    {showScore && row.score !== null ? (
                      <span className="text-lg font-semibold tabular-nums text-slate-100">{row.score}</span>
                    ) : null}
                  </div>
                </td>
                {COLUMNS.map((column) => {
                  const market = event.markets.find((m) => m.type === column.type);
                  const option = market?.options.find((o) => o.side === ROW_SIDES[column.type][rowIndex]);
                  if (!market || !option) {
                    return (
                      <td key={column.type} className="text-center text-slate-600">
                        {row.name === 'Draw' ? '' : '–'}
                      </td>
                    );
                  }

                  const open = canBet(event, market);
                  const selected = option.id === selectedOptionId;
                  const caption = cellCaption(market, option);
                  return (
                    <td key={column.type}>
                      <button
                        type="button"
                        disabled={!open}
                        onClick={() => onSelect({ event, market, option })}
                        aria-pressed={selected}
                        aria-label={`${option.label} at ${formatOdds(option.decimalOdds)}`}
                        className={`flex min-h-[3.25rem] w-full flex-col items-center justify-center rounded-xl border px-1 py-2 transition sm:px-2 ${
                          selected
                            ? 'border-emerald-300 bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20'
                            : 'border-slate-700 bg-slate-800/80 text-slate-100 hover:-translate-y-0.5 hover:border-emerald-400/70 hover:bg-slate-800'
                        } disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900 disabled:text-slate-500`}
                      >
                        {caption ? (
                          <span className={`text-xs ${selected ? 'text-slate-900' : 'text-slate-400'}`}>{caption}</span>
                        ) : null}
                        <span className="font-semibold tabular-nums">{formatOdds(option.decimalOdds)}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function SlipNotice({ message }: { message: SlipMessage }) {
  if (!message) return null;
  return (
    <p
      role={message.kind === 'error' ? 'alert' : 'status'}
      className={`mt-4 rounded-xl border p-3 text-sm ${
        message.kind === 'success'
          ? 'border-emerald-700 bg-emerald-950/60 text-emerald-200'
          : 'border-red-800 bg-red-950/60 text-red-200'
      }`}
    >
      {message.text}
    </p>
  );
}

function BetSlip({
  selection,
  balance,
  token,
  message,
  onMessage,
  onBalance,
  onOddsChanged,
  onRefresh,
  onPlaced,
  onClear,
}: {
  selection: Selection | null;
  balance: number | null;
  token: string | null;
  message: SlipMessage;
  onMessage: (message: SlipMessage) => void;
  onBalance: (balance: number) => void;
  onOddsChanged: (odds: number) => void;
  onRefresh: () => void;
  onPlaced: () => void;
  onClear: () => void;
}) {
  const [amountText, setAmountText] = useState('');
  // SRS-205.2: the wager is only placed once the player confirms it.
  const [stage, setStage] = useState<'edit' | 'confirm' | 'placing'>('edit');

  useEffect(() => {
    setAmountText('');
    setStage('edit');
  }, [selection?.option.id]);

  // If the odds move while the player is confirming, make them look again.
  useEffect(() => {
    setStage((current) => (current === 'confirm' ? 'edit' : current));
  }, [selection?.option.decimalOdds]);

  if (!selection) {
    return (
      <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6">
        <p className="text-sm uppercase tracking-[0.25em] text-emerald-300">Bet slip</p>
        <SlipNotice message={message} />
        <p className="mt-4 text-sm text-slate-400">Pick an outcome to see its rules and what you could win.</p>
      </div>
    );
  }

  const { event, market, option } = selection;
  const check = checkWagerAmount(amountText);
  const amount = check.ok ? check.amount : null;
  const payout = amount ? potentialPayout(amount, option.decimalOdds) : 0;

  // SRS-206.1 / SRS-206.3: the same rules the server enforces, shown early.
  let amountError = '';
  if (amountText && !check.ok) amountError = check.error;
  else if (amount !== null && !canWinCoins(amount, option.decimalOdds)) {
    amountError = "This bet can't win any coins at these odds. Try a larger amount.";
  } else if (amount !== null && balance !== null && amount > balance) {
    amountError = "You don't have enough coins for this bet.";
  }
  const canPlace = amount !== null && !amountError;

  function clearSuccess() {
    if (message?.kind === 'success') onMessage(null);
  }

  async function placeBet() {
    if (!token || amount === null) return;
    setStage('placing');
    onMessage(null);
    try {
      const res = await fetch('/api/sports/wagers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ optionId: option.id, amount, odds: option.decimalOdds }),
      });
      const data = await res.json();

      if (res.ok) {
        onBalance(data.balance);
        onPlaced();
        onMessage({
          kind: 'success',
          text: `Bet placed: ${amount.toLocaleString()} coins on ${option.label} at ${formatOdds(data.wager.odds)}. Pays ${Number(
            data.wager.potentialPayout,
          ).toLocaleString()} coins if it wins.`,
        });
        setAmountText('');
      } else {
        onMessage({ kind: 'error', text: data.error || 'Could not place your bet.' });
        if (typeof data.balance === 'number') onBalance(data.balance);
        if (typeof data.currentOdds === 'number') onOddsChanged(data.currentOdds);
        // The game may have started or the line moved; reload what's open.
        if (res.status === 409 || res.status === 404) onRefresh();
      }
    } catch {
      onMessage({ kind: 'error', text: 'Could not reach the server. Your coins were not taken. Please try again.' });
    }
    setStage('edit');
  }

  return (
    <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl shadow-black/60 lg:border-slate-800">
      <div className="flex items-center justify-between">
        <p className="text-sm uppercase tracking-[0.25em] text-emerald-300">Bet slip</p>
        <button type="button" onClick={onClear} className="text-sm text-slate-400 hover:text-slate-200">
          Clear
        </button>
      </div>

      <p className="mt-4 text-xs text-slate-400">
        {event.awayTeam} @ {event.homeTeam}
      </p>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <p className="text-lg font-semibold">{option.label}</p>
        <p className="text-lg font-semibold tabular-nums text-emerald-300">{formatOdds(option.decimalOdds)}</p>
      </div>
      <p className="text-sm text-slate-400">{market.name}</p>
      <p className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">
        Wins if: {option.winningCondition}.
      </p>

      <SlipNotice message={message} />

      <label htmlFor="wager-amount" className="mt-5 block text-sm text-slate-300">
        Wager (coins, minimum {MIN_WAGER})
      </label>
      <input
        id="wager-amount"
        inputMode="numeric"
        value={amountText}
        disabled={stage !== 'edit'}
        onChange={(e) => {
          setAmountText(e.target.value.trim());
          clearSuccess();
        }}
        placeholder={String(MIN_WAGER)}
        className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-lg tabular-nums text-slate-100 outline-none transition focus:border-emerald-400 disabled:opacity-60"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {QUICK_AMOUNTS.map((value) => (
          <button
            key={value}
            type="button"
            disabled={stage !== 'edit'}
            onClick={() => {
              setAmountText(String(value));
              clearSuccess();
            }}
            className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-300 hover:border-emerald-400/70 disabled:opacity-60"
          >
            {value}
          </button>
        ))}
      </div>
      {amountError ? <p className="mt-2 text-sm text-red-300">{amountError}</p> : null}

      <dl className="mt-5 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-400">Potential payout</dt>
          <dd className="font-semibold tabular-nums">{payout.toLocaleString()} coins</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-400">Profit if it wins</dt>
          <dd className="tabular-nums text-emerald-300">+{Math.max(payout - (amount ?? 0), 0).toLocaleString()}</dd>
        </div>
      </dl>

      {!token ? (
        <Link
          href="/login"
          className="mt-5 block w-full rounded-xl bg-emerald-400 px-6 py-3 text-center font-semibold text-slate-950 transition hover:bg-emerald-300"
        >
          Log in to place bets
        </Link>
      ) : stage === 'edit' ? (
        <button
          type="button"
          disabled={!canPlace}
          onClick={() => setStage('confirm')}
          className="mt-5 w-full rounded-xl bg-emerald-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Place bet
        </button>
      ) : (
        <div className="mt-5 rounded-xl border border-emerald-700/60 bg-emerald-950/40 p-4">
          <p className="text-sm text-slate-200">
            Bet <span className="font-semibold">{amount?.toLocaleString()} coins</span> on{' '}
            <span className="font-semibold">{option.label}</span> at{' '}
            <span className="font-semibold">{formatOdds(option.decimalOdds)}</span>? Pays{' '}
            <span className="font-semibold">{payout.toLocaleString()} coins</span> if it wins. The coins come out of your
            balance now. You can cancel it for a full refund until 1 hour before the game starts.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={placeBet}
              disabled={stage === 'placing'}
              className="flex-1 rounded-xl bg-emerald-400 px-4 py-2.5 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-60"
            >
              {stage === 'placing' ? 'Placing…' : 'Confirm bet'}
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

      <details className="mt-5 text-sm text-slate-400">
        <summary className="cursor-pointer text-slate-300 hover:text-slate-100">How {market.name} bets are settled</summary>
        <div className="mt-2 space-y-2">
          <p>{market.description}</p>
          <p>{market.rules}</p>
          {market.tieRules ? <p>{market.tieRules}</p> : null}
          <p>{market.refundConditions}</p>
        </div>
      </details>
    </div>
  );
}

// SRS-208.1 / SRS-211.1: Pending while open; once decided, the result and the
// coins it paid back (or lost).
function BetOutcome({ bet }: { bet: MyBet }) {
  if (bet.decision === 'Pending') {
    return (
      <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300">Pending</span>
    );
  }
  const styles: Record<WagerResult, string> = {
    Won: 'border-emerald-600 bg-emerald-500/10 text-emerald-200',
    Lost: 'border-red-800 bg-red-950/60 text-red-200',
    Refunded: 'border-slate-600 bg-slate-800 text-slate-200',
    Cancelled: 'border-slate-700 bg-slate-900 text-slate-400',
  };
  const result = bet.result!;
  if (result === 'Cancelled') {
    return (
      <span className={`rounded-full border px-2.5 py-0.5 text-xs ${styles.Cancelled}`}>
        Cancelled · {bet.amount.toLocaleString()} back
      </span>
    );
  }
  const detail =
    result === 'Won'
      ? `+${((bet.payout ?? 0) - bet.amount).toLocaleString()}`
      : result === 'Lost'
        ? `−${bet.amount.toLocaleString()}`
        : `${bet.amount.toLocaleString()} back`;
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs ${styles[result]}`}>
      Decided · {result} {detail}
    </span>
  );
}

function BetCard({
  bet,
  token,
  onCancelled,
}: {
  bet: MyBet;
  token: string | null;
  onCancelled: (balance: number) => void;
}) {
  const { event } = bet;
  const showScore = event.status !== 'Upcoming' && event.homeScore !== null && event.awayScore !== null;
  const [cancelStage, setCancelStage] = useState<'idle' | 'confirm' | 'cancelling'>('idle');
  const [cancelError, setCancelError] = useState('');

  async function cancelBet() {
    if (!token) return;
    setCancelStage('cancelling');
    setCancelError('');
    try {
      const res = await fetch(`/api/sports/wagers/${bet.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        onCancelled(data.balance);
        return;
      }
      setCancelError(data.error || 'Could not cancel your bet.');
    } catch {
      setCancelError('Could not reach the server. Your bet is still active.');
    }
    setCancelStage('idle');
  }

  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span>
          {event.league ? `${event.league} · ` : ''}
          {formatDateTime(event.startTime)}
        </span>
        <StatusBadge status={event.status} />
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-medium text-slate-100">
          {event.awayTeam} @ {event.homeTeam}
        </p>
        {showScore ? (
          <p className="tabular-nums text-slate-200">
            {event.awayScore} – {event.homeScore}
            {event.status === 'Completed' ? <span className="ml-1.5 text-xs text-slate-500">final</span> : null}
          </p>
        ) : null}
      </div>

      <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">
            {bet.selection} <span className="font-normal text-slate-400">· {bet.market}</span>
          </p>
          <BetOutcome bet={bet} />
        </div>
        {bet.winningCondition ? <p className="mt-1 text-sm text-slate-400">Wins if: {bet.winningCondition}.</p> : null}
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-xs text-slate-500">Wager</dt>
          <dd className="tabular-nums">{bet.amount.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Odds</dt>
          <dd className="tabular-nums">{formatOdds(bet.odds)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">{bet.decision === 'Pending' ? 'Pays if it wins' : 'Paid back'}</dt>
          <dd className="tabular-nums">{(bet.decision === 'Pending' ? bet.potentialPayout : bet.payout ?? 0).toLocaleString()}</dd>
        </div>
      </dl>

      {bet.decision === 'Pending' ? (
        <div className="mt-3 border-t border-slate-800 pt-3 text-sm">
          {!bet.canCancel ? (
            <p className="text-xs text-slate-500">Locked in: bets can be cancelled until 1 hour before the game.</p>
          ) : cancelStage === 'idle' ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500">Can cancel until {formatDateTime(bet.cancelUntil)}</p>
              <button
                type="button"
                onClick={() => setCancelStage('confirm')}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:border-red-700 hover:text-red-200"
              >
                Cancel bet
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-slate-300">
                Cancel this bet? You&apos;ll get <span className="font-semibold">{bet.amount.toLocaleString()} coins</span> back.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={cancelBet}
                  disabled={cancelStage === 'cancelling'}
                  className="rounded-lg bg-red-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-red-300 disabled:opacity-60"
                >
                  {cancelStage === 'cancelling' ? 'Cancelling…' : 'Yes, cancel it'}
                </button>
                <button
                  type="button"
                  onClick={() => setCancelStage('idle')}
                  disabled={cancelStage === 'cancelling'}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:border-slate-500 disabled:opacity-60"
                >
                  Keep it
                </button>
              </div>
            </div>
          )}
          {cancelError ? <p className="mt-2 text-xs text-red-300">{cancelError}</p> : null}
        </div>
      ) : null}
    </article>
  );
}

// A Showdown entry's result, from the player's side.
function showdownResult(entry: MyShowdownEntry): 'Won' | 'Lost' | 'Refunded' | null {
  if (entry.outcome === 'Refunded') return 'Refunded';
  if (entry.outcome === 'Settled') return entry.winningTeamId === entry.teamId ? 'Won' : 'Lost';
  return null;
}

function ShowdownEntryCard({ entry }: { entry: MyShowdownEntry }) {
  const team = entry.teamId === entry.home.id ? entry.home : entry.away;
  const result = showdownResult(entry);
  const showScore = entry.status !== 'Upcoming' && entry.homeScore !== null && entry.awayScore !== null;
  const styles = {
    Won: 'border-emerald-600 bg-emerald-500/10 text-emerald-200',
    Lost: 'border-red-800 bg-red-950/60 text-red-200',
    Refunded: 'border-slate-600 bg-slate-800 text-slate-200',
  };
  let detail = '';
  if (result === 'Won') detail = `+${((entry.payout ?? 0) - entry.amount).toLocaleString()}`;
  else if (result === 'Lost') detail = `−${entry.amount.toLocaleString()}`;
  else if (result === 'Refunded') detail = `${entry.amount.toLocaleString()} back`;

  return (
    <article className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-slate-900 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span className="flex items-center gap-2">
          <span className="rounded-md bg-amber-400/15 px-1.5 py-0.5 font-semibold text-amber-200">The Showdown</span>
          {entry.league ? `${entry.league} · ` : ''}
          {formatDateTime(entry.startTime)}
        </span>
        <StatusBadge status={entry.status} />
      </div>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-medium text-slate-100">
          {entry.away.name} @ {entry.home.name}
        </p>
        {showScore ? (
          <p className="tabular-nums text-slate-200">
            {entry.awayScore} – {entry.homeScore}
          </p>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
        <p>
          You backed <span className="font-semibold">{team.name}</span> with{' '}
          <span className="font-semibold tabular-nums">{entry.amount.toLocaleString()} coins</span>
        </p>
        {result ? (
          <span className={`rounded-full border px-2.5 py-0.5 text-xs ${styles[result]}`}>
            Decided · {result} {detail}
          </span>
        ) : (
          <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300">Pending</span>
        )}
      </div>
      <Link href="/sports/showdown" className="mt-3 inline-block text-sm text-amber-300 hover:underline">
        View the Showdown →
      </Link>
    </article>
  );
}

function MyBetsView({
  bets,
  error,
  token,
  onBrowse,
  onCancelled,
}: {
  bets: BetsData | null;
  error: string;
  token: string | null;
  onBrowse: () => void;
  onCancelled: (balance: number) => void;
}) {
  if (error) return <p className="rounded-xl border border-red-800 bg-red-950/60 p-4 text-sm text-red-200">{error}</p>;
  if (!bets) return <p className="text-slate-400">Loading your bets…</p>;
  const showdownEntries = [...bets.showdowns.open, ...bets.showdowns.settled];

  return (
    <div className="space-y-10">
      {showdownEntries.length > 0 ? (
        <section aria-label="The Showdown">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-amber-300">The Showdown ({showdownEntries.length})</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {showdownEntries.map((entry) => (
              <ShowdownEntryCard key={entry.entryId} entry={entry} />
            ))}
          </div>
        </section>
      ) : null}

      <section aria-label="Open bets">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">Open bets ({bets.open.length})</h2>
        {bets.open.length === 0 ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 text-center">
            <p className="text-lg font-medium">No open bets</p>
            <p className="mt-2 text-sm text-slate-400">
              <button type="button" onClick={onBrowse} className="text-emerald-300 hover:underline">
                Browse games
              </button>{' '}
              to place one.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {bets.open.map((bet) => (
              <BetCard key={bet.id} bet={bet} token={token} onCancelled={onCancelled} />
            ))}
          </div>
        )}
      </section>

      <section aria-label="Betting history">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">History ({bets.settled.length})</h2>
        {bets.settled.length === 0 ? (
          <p className="text-sm text-slate-500">Settled bets will show up here once their games are final.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {bets.settled.map((bet) => (
              <BetCard key={bet.id} bet={bet} token={token} onCancelled={onCancelled} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// One line in the results pop-up: a settled wager or Showdown entry.
type ResultItem = {
  key: string;
  selection: string;
  market: string;
  matchup: string;
  result: 'Won' | 'Lost' | 'Refunded';
  amount: number;
  payout: number;
};

function fromWager(bet: MyBet): ResultItem {
  const score = bet.event.awayScore !== null && bet.event.homeScore !== null ? ` · ${bet.event.awayScore}–${bet.event.homeScore} final` : '';
  return {
    key: `w${bet.id}`,
    selection: bet.selection,
    market: bet.market,
    matchup: `${bet.event.awayTeam} @ ${bet.event.homeTeam}${score}`,
    result: bet.result === 'Won' || bet.result === 'Lost' ? bet.result : 'Refunded',
    amount: bet.amount,
    payout: bet.payout ?? 0,
  };
}

function fromShowdown(entry: MyShowdownEntry): ResultItem {
  const team = entry.teamId === entry.home.id ? entry.home : entry.away;
  const score = entry.awayScore !== null && entry.homeScore !== null ? ` · ${entry.awayScore}–${entry.homeScore} final` : '';
  return {
    key: `s${entry.entryId}`,
    selection: team.name,
    market: 'The Showdown',
    matchup: `${entry.away.name} @ ${entry.home.name}${score}`,
    result: showdownResult(entry) ?? 'Refunded',
    amount: entry.amount,
    payout: entry.payout ?? 0,
  };
}

// The coins a settled bet made or lost: profit for a win, the stake for a
// loss, nothing for a refund.
function netChange(item: ResultItem) {
  if (item.result === 'Won') return item.payout - item.amount;
  if (item.result === 'Lost') return -item.amount;
  return 0;
}

// SRS-209.1, SRS-210.2, SRS-210.4, SRS-214.2: shows the results of wagers and
// Showdown entries settled since the player last looked, once. Closing it
// marks them seen on the server.
function ResultsModal({ items, onClose }: { items: ResultItem[]; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const net = items.reduce((sum, item) => sum + netChange(item), 0);
  const wins = items.filter((item) => item.result === 'Won').length;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  let headline = 'Your bets are in';
  if (wins === items.length) headline = items.length === 1 ? 'Your bet won!' : 'All your bets won!';
  else if (wins === 0 && net < 0) headline = 'Tough break';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="results-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl shadow-black/60"
      >
        <p className="text-sm uppercase tracking-[0.25em] text-emerald-300">Bet results</p>
        <h2 id="results-title" className="mt-2 text-2xl font-semibold">
          {headline}
        </h2>
        <p
          className={`mt-3 text-4xl font-bold tabular-nums ${net > 0 ? 'text-emerald-300' : net < 0 ? 'text-red-300' : 'text-slate-200'}`}
        >
          {net > 0 ? '+' : net < 0 ? '−' : ''}
          {Math.abs(net).toLocaleString()} <span className="text-lg font-semibold">coins</span>
        </p>
        <p className="mt-1 text-sm text-slate-400">
          {items.length} {items.length === 1 ? 'bet' : 'bets'} settled while you were away
        </p>

        <ul className="mt-5 space-y-2">
          {items.map((item) => {
            const change = netChange(item);
            return (
              <li key={item.key} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {item.selection} <span className="font-normal text-slate-400">· {item.market}</span>
                    </p>
                    <p className="text-xs text-slate-400">{item.matchup}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                      item.result === 'Won'
                        ? 'border-emerald-600 bg-emerald-500/10 text-emerald-200'
                        : item.result === 'Lost'
                          ? 'border-red-800 bg-red-950/60 text-red-200'
                          : 'border-slate-600 bg-slate-800 text-slate-200'
                    }`}
                  >
                    {item.result}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-300">
                  {item.result === 'Won'
                    ? `+${change.toLocaleString()} profit · ${item.payout.toLocaleString()} coins paid to your balance`
                    : item.result === 'Lost'
                      ? `−${item.amount.toLocaleString()} coins`
                      : `${item.amount.toLocaleString()} coins refunded to your balance`}
                </p>
              </li>
            );
          })}
        </ul>

        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-emerald-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300"
        >
          {net > 0 ? 'Nice!' : 'Got it'}
        </button>
      </div>
    </div>
  );
}

export default function SportsBettingPage() {
  const [listing, setListing] = useState<EventListing | null>(null);
  const [loadError, setLoadError] = useState('');
  const [sport, setSport] = useState<string | null>(null);
  const [leagueId, setLeagueId] = useState<number | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [slipMessage, setSlipMessage] = useState<SlipMessage>(null);
  const [view, setView] = useState<'games' | 'bets'>('games');
  const [myBets, setMyBets] = useState<BetsData | null>(null);
  const [betsError, setBetsError] = useState('');

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/sports/events', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load games.');
      setListing(data as EventListing);
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load games.');
    }
  }, []);

  useEffect(() => {
    loadEvents();
    const timer = setInterval(loadEvents, REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadEvents]);

  const loadMyBets = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/sports/wagers', { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load your bets.');
      setMyBets(data as BetsData);
      setBetsError('');
    } catch (error) {
      setBetsError(error instanceof Error ? error.message : 'Could not load your bets.');
    }
  }, [token]);

  const dismissResults = useCallback(() => {
    const ids = myBets?.unseen.map((bet) => bet.id) ?? [];
    const showdownEntryIds = myBets?.showdowns.unseen.map((entry) => entry.entryId) ?? [];
    setMyBets((current) => (current ? { ...current, unseen: [], showdowns: { ...current.showdowns, unseen: [] } } : current));
    // Winnings were credited when the wager settled; make sure the nav bar shows them.
    notifyBalanceChanged();
    if (token && ids.length + showdownEntryIds.length > 0) {
      fetch('/api/sports/wagers/seen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids, showdownEntryIds }),
      }).catch(() => {
        // If this fails the pop-up shows again next visit, which is harmless.
      });
    }
  }, [myBets, token]);

  // Bets change status as games start and finish, so refresh them with the odds.
  useEffect(() => {
    if (!token) return;
    loadMyBets();
    const timer = setInterval(loadMyBets, REFRESH_MS);
    return () => clearInterval(timer);
  }, [token, loadMyBets]);

  useEffect(() => {
    const stored = localStorage.getItem('player_token');
    setToken(stored);
    if (!stored) return;
    // The nav bar shows the balance; the slip only needs it to warn about
    // wagers the player can't afford.
    fetch('/api/profile/balance', { headers: { Authorization: `Bearer ${stored}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setBalance(data?.balance ?? null))
      .catch(() => setBalance(null));
  }, []);

  // Keep the slip in sync with refreshed odds, and drop it if the market closed.
  useEffect(() => {
    if (!selection || !listing) return;
    const event = listing.events.find((e) => e.id === selection.event.id);
    const market = event?.markets.find((m) => m.id === selection.market.id);
    const option = market?.options.find((o) => o.id === selection.option.id);
    if (!event || !market || !option || !canBet(event, market)) {
      setSelection(null);
      setSlipMessage({ kind: 'error', text: 'Betting on that game has closed.' });
    } else if (option !== selection.option) setSelection({ event, market, option });
  }, [listing]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleLeagues = useMemo(
    () => (listing?.leagues ?? []).filter((l) => !sport || l.sport === sport),
    [listing, sport],
  );

  const openGames = (listing?.events ?? []).filter((e) => e.status === 'Upcoming').length;
  const openCount = myBets ? myBets.open.length + myBets.showdowns.open.length : 0;

  const days = useMemo(() => {
    const events = (listing?.events ?? []).filter(
      (e) => (!sport || e.sport === sport) && (!leagueId || e.leagueId === leagueId),
    );
    const groups = new Map<string, SportsEvent[]>();
    for (const event of events) {
      const key = dayHeading(event.startTime);
      groups.set(key, [...(groups.get(key) ?? []), event]);
    }
    return [...groups.entries()];
  }, [listing, sport, leagueId]);

  return (
    <main className={`min-h-page bg-slate-950 px-4 py-10 text-slate-100 sm:px-6 ${selection && view === 'games' ? 'pb-[28rem] lg:pb-10' : ''}`}>
      <div className="mx-auto w-full max-w-5xl">
        <header className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/15 via-slate-900 to-slate-950 p-6 sm:p-8">
          <div aria-hidden="true" className="pointer-events-none absolute -right-6 -top-8 select-none text-[7rem] leading-none opacity-10 sm:text-[9rem]">
            🏈🏀
          </div>
          <p className="text-sm uppercase tracking-[0.25em] text-emerald-300">Sports Betting</p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Sportsbook</h1>
          <p className="mt-2 max-w-md text-slate-300">Real games, real odds, virtual coins only.</p>
          <dl className="mt-6 grid grid-cols-3 gap-2 text-sm sm:flex sm:flex-wrap sm:gap-3">
            <div className="rounded-2xl border border-slate-700/60 bg-slate-950/50 px-3 py-2 sm:px-4">
              <dt className="text-xs text-slate-400">Open games</dt>
              <dd className="text-lg font-semibold tabular-nums">{openGames}</dd>
            </div>
            <div className="rounded-2xl border border-slate-700/60 bg-slate-950/50 px-3 py-2 sm:px-4">
              <dt className="text-xs text-slate-400">Sports</dt>
              <dd className="text-lg font-semibold">{listing?.sports.length ? listing.sports.map((name) => SPORT_ICONS[name] ?? name).join(' ') : '–'}</dd>
            </div>
            {token ? (
              <div className="rounded-2xl border border-slate-700/60 bg-slate-950/50 px-3 py-2 sm:px-4">
                <dt className="text-xs text-slate-400">Your bets</dt>
                <dd className="text-lg font-semibold tabular-nums">{myBets ? myBets.open.length + myBets.showdowns.open.length : '…'}</dd>
              </div>
            ) : null}
          </dl>
        </header>

        {token ? (
          <div role="tablist" aria-label="Sportsbook views" className="mt-8 inline-flex rounded-full border border-slate-800 bg-slate-900 p-1">
            {(
              [
                ['games', 'Games'],
                ['bets', `My bets${openCount > 0 ? ` (${openCount})` : ''}`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={view === key}
                onClick={() => {
                  setView(key);
                  if (key === 'bets') loadMyBets();
                }}
                className={`rounded-full px-5 py-2 text-sm transition ${
                  view === key ? 'bg-emerald-400 font-semibold text-slate-950' : 'text-slate-300 hover:text-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {view === 'games' ? (
          <Link
            href="/sports/showdown"
            className="group mt-6 flex items-center justify-between gap-4 rounded-3xl border border-amber-400/40 bg-gradient-to-r from-amber-500/20 via-slate-900 to-slate-900 px-5 py-4 transition hover:border-amber-300"
          >
            <span>
              <span className="block text-xs uppercase tracking-[0.25em] text-amber-300">New</span>
              <span className="block text-xl font-black uppercase italic tracking-tight sm:text-2xl">The Showdown</span>
              <span className="block text-sm text-slate-300">One featured game per sport. Pick a side, winners split the pool.</span>
            </span>
            <span className="text-2xl text-amber-300 transition group-hover:translate-x-1" aria-hidden="true">
              →
            </span>
          </Link>
        ) : null}

        {view === 'bets' ? (
          <div className="mt-8">
            <MyBetsView
              bets={myBets}
              error={betsError}
              token={token}
              onBrowse={() => setView('games')}
              onCancelled={(next) => {
                setBalance(next);
                notifyBalanceChanged();
                loadMyBets();
              }}
            />
          </div>
        ) : null}

        {view === 'games' && listing && listing.sports.length > 0 ? (
          <nav aria-label="Filter games" className="mt-8 space-y-3">
            <div className="flex flex-wrap gap-2">
              <FilterChip active={sport === null} onClick={() => { setSport(null); setLeagueId(null); }}>
                All sports
              </FilterChip>
              {listing.sports.map((name) => (
                <FilterChip key={name} icon={SPORT_ICONS[name]} active={sport === name} onClick={() => { setSport(name); setLeagueId(null); }}>
                  {name}
                </FilterChip>
              ))}
            </div>
            {visibleLeagues.length > 1 ? (
              <div className="flex flex-wrap gap-2">
                <FilterChip active={leagueId === null} onClick={() => setLeagueId(null)}>
                  All leagues
                </FilterChip>
                {visibleLeagues.map((league) => (
                  <FilterChip key={league.id} active={leagueId === league.id} onClick={() => setLeagueId(league.id)}>
                    {league.name}
                  </FilterChip>
                ))}
              </div>
            ) : null}
          </nav>
        ) : null}

        <div className={`mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start ${view === 'games' ? '' : 'hidden'}`}>
          <section aria-label="Games" className="space-y-8">
            {loadError ? (
              <p className="rounded-xl border border-red-800 bg-red-950/60 p-4 text-sm text-red-200">{loadError}</p>
            ) : null}

            {!listing && !loadError ? <p className="text-slate-400">Loading games…</p> : null}

            {listing && days.length === 0 ? (
              <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 text-center">
                <p className="text-lg font-medium">No games right now</p>
                <p className="mt-2 text-sm text-slate-400">Odds update a few times a day. Check back soon.</p>
              </div>
            ) : null}

            {days.map(([day, events]) => (
              <div key={day}>
                <h2 className="mb-3 flex items-baseline gap-2 text-sm font-medium uppercase tracking-wide text-slate-400">
                  {day}
                  <span className="text-xs font-normal normal-case tracking-normal text-slate-500">
                    {events.length} {events.length === 1 ? 'game' : 'games'}
                  </span>
                </h2>
                <div className="space-y-3">
                  {events.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      selectedOptionId={selection?.option.id ?? null}
                      onSelect={(next) => {
                        setSelection(next);
                        setSlipMessage(null);
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>

          <aside
            aria-label="Bet slip"
            className={`${selection ? 'fixed inset-x-0 bottom-0 z-20 max-h-[75vh] overflow-y-auto px-3 pb-3' : 'hidden'} lg:sticky lg:top-20 lg:block lg:max-h-none lg:overflow-visible lg:p-0`}
          >
            <BetSlip
              selection={selection}
              balance={balance}
              token={token}
              message={slipMessage}
              onMessage={setSlipMessage}
              onBalance={(next) => {
                setBalance(next);
                notifyBalanceChanged();
              }}
              onOddsChanged={(odds) =>
                setSelection((current) =>
                  current ? { ...current, option: { ...current.option, decimalOdds: odds } } : current,
                )
              }
              onRefresh={loadEvents}
              onPlaced={loadMyBets}
              onClear={() => {
                setSelection(null);
                setSlipMessage(null);
              }}
            />
          </aside>
        </div>
      </div>

      <LogoNotice />

      {myBets && myBets.unseen.length + myBets.showdowns.unseen.length > 0 ? (
        <ResultsModal items={[...myBets.showdowns.unseen.map(fromShowdown), ...myBets.unseen.map(fromWager)]} onClose={dismissResults} />
      ) : null}
    </main>
  );
}
