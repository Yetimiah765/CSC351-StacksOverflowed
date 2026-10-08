'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EventListing, OptionSide, SportsEvent, SportsMarket, SportsOption } from '../../lib/sports/events';
import { potentialPayout } from '../../lib/sports/payout';

type Selection = { event: SportsEvent; market: SportsMarket; option: SportsOption };

// The sync job only refreshes the database a few times a day, so polling
// our own API (free) once a minute is plenty.
const REFRESH_MS = 60_000;
const QUICK_AMOUNTS = [10, 50, 100, 500];
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

function StatusBadge({ status }: { status: SportsEvent['status'] }) {
  const styles: Record<SportsEvent['status'], string> = {
    Upcoming: 'border-slate-700 bg-slate-800 text-slate-300',
    'In Progress': 'border-amber-500/50 bg-amber-500/10 text-amber-200',
    Completed: 'border-slate-700 bg-slate-900 text-slate-400',
    Canceled: 'border-red-800 bg-red-950/60 text-red-200',
    Postponed: 'border-red-800 bg-red-950/60 text-red-200',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${styles[status]}`}>
      {status === 'In Progress' ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" /> : null}
      {status}
    </span>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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

  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span>
          {event.league} &middot; {formatTime(event.startTime)}
        </span>
        <StatusBadge status={event.status} />
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
                    <span className={`font-medium ${row.name === 'Draw' ? 'text-slate-400' : 'text-slate-100'}`}>
                      {row.name}
                      {rowIndex === 1 ? <span className="ml-1.5 text-xs font-normal text-slate-500">home</span> : null}
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
                            ? 'border-emerald-400 bg-emerald-400 text-slate-950'
                            : 'border-slate-700 bg-slate-800/80 text-slate-100 hover:border-emerald-400/70'
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

function BetSlip({
  selection,
  balance,
  loggedIn,
  onClear,
}: {
  selection: Selection | null;
  balance: number | null;
  loggedIn: boolean;
  onClear: () => void;
}) {
  const [amountText, setAmountText] = useState('');

  useEffect(() => {
    setAmountText('');
  }, [selection?.option.id]);

  if (!selection) {
    return (
      <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6">
        <p className="text-sm uppercase tracking-[0.25em] text-emerald-300">Bet slip</p>
        <p className="mt-4 text-sm text-slate-400">Pick an outcome to see its rules and what you could win.</p>
      </div>
    );
  }

  const { event, market, option } = selection;
  const amount = /^\d+$/.test(amountText) ? Number(amountText) : null;
  const payout = amount ? potentialPayout(amount, option.decimalOdds) : 0;

  // SRS-206.1 / SRS-206.3 previews; the server re-checks on submit.
  let amountError = '';
  if (amountText && (amount === null || amount <= 0)) amountError = 'Enter a whole number of coins greater than 0.';
  else if (amount !== null && balance !== null && amount > balance) amountError = "You don't have enough coins for this bet.";

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

      <label htmlFor="wager-amount" className="mt-5 block text-sm text-slate-300">
        Wager (coins)
      </label>
      <input
        id="wager-amount"
        inputMode="numeric"
        value={amountText}
        onChange={(e) => setAmountText(e.target.value.trim())}
        placeholder="0"
        className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-lg tabular-nums text-slate-100 outline-none transition focus:border-emerald-400"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {QUICK_AMOUNTS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setAmountText(String(value))}
            className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-300 hover:border-emerald-400/70"
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

      {loggedIn ? (
        <>
          <button
            type="button"
            disabled
            className="mt-5 w-full rounded-xl bg-emerald-400 px-6 py-3 font-semibold text-slate-950 transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            Place bet
          </button>
          <p className="mt-2 text-center text-xs text-slate-500">Placing bets is coming in the next update.</p>
        </>
      ) : (
        <Link
          href="/login"
          className="mt-5 block w-full rounded-xl bg-emerald-400 px-6 py-3 text-center font-semibold text-slate-950 transition hover:bg-emerald-300"
        >
          Log in to place bets
        </Link>
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

export default function SportsBettingPage() {
  const [listing, setListing] = useState<EventListing | null>(null);
  const [loadError, setLoadError] = useState('');
  const [sport, setSport] = useState<string | null>(null);
  const [leagueId, setLeagueId] = useState<number | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

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
    if (!event || !market || !option || !canBet(event, market)) setSelection(null);
    else if (option !== selection.option) setSelection({ event, market, option });
  }, [listing]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleLeagues = useMemo(
    () => (listing?.leagues ?? []).filter((l) => !sport || l.sport === sport),
    [listing, sport],
  );

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
    <main className={`min-h-page bg-slate-950 px-4 py-10 text-slate-100 sm:px-6 ${selection ? 'pb-[28rem] lg:pb-10' : ''}`}>
      <div className="mx-auto w-full max-w-5xl">
        <header>
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-emerald-300">Sports Betting</p>
            <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Sportsbook</h1>
            <p className="mt-2 text-slate-400">Real games, real odds, virtual coins only.</p>
          </div>
        </header>

        {listing && listing.sports.length > 0 ? (
          <nav aria-label="Filter games" className="mt-8 space-y-3">
            <div className="flex flex-wrap gap-2">
              <FilterChip active={sport === null} onClick={() => { setSport(null); setLeagueId(null); }}>
                All sports
              </FilterChip>
              {listing.sports.map((name) => (
                <FilterChip key={name} active={sport === name} onClick={() => { setSport(name); setLeagueId(null); }}>
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

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
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
                <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">{day}</h2>
                <div className="space-y-3">
                  {events.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      selectedOptionId={selection?.option.id ?? null}
                      onSelect={setSelection}
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
            <BetSlip selection={selection} balance={balance} loggedIn={!!token} onClear={() => setSelection(null)} />
          </aside>
        </div>
      </div>
    </main>
  );
}
