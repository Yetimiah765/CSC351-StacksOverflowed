'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { notifyBalanceChanged } from '../../../lib/balanceEvents';
import { MAX_BUY_IN_MULTIPLIER, MIN_BUY_IN_MULTIPLIER } from '../../../lib/pokerTable';
import { getPokerTableConfig } from '../../../lib/pokerTables';
import { pokerTableChannelName } from '../../../lib/pokerRealtime';
import { usePlayerProfile, usePokerChannel } from '../usePoker';
import {
  ConnectionPill,
  PokerRoomEyebrow,
  Room,
  RoomMessage,
  STAKES_STYLES,
  StakesChip,
  StatPill,
} from '../pokerUi';

interface Seat {
  seatNumber: number;
  playerId: string | null;
  username: string | null;
  avatarUrl: string | null;
  chipStack: number | null;
}

interface TableState {
  tableId: string;
  maxSeats: number;
  /** The buy-in range is 50x-200x this (computed below), not a flat amount. */
  bigBlind: number;
  smallBlind: number;
  seatedCount: number;
  seats: Seat[];
}

// Same idea as QUICK_AMOUNTS on the sportsbook page (app/sports/page.tsx),
// but these add to the current amount rather than setting it outright.
const QUICK_BUY_IN_INCREMENTS = [10, 50, 100, 500];

export default function PokerTablePage({ params }: { params: { tableId: string } }) {
  const router = useRouter();
  const config = getPokerTableConfig(params.tableId);
  const { token, profile, setProfile, loading: profileLoading, error: profileError } = usePlayerProfile();

  const [tableState, setTableState] = useState<TableState | null>(null);
  const [joinError, setJoinError] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  // The open seat the player clicked; they pick one before buying in.
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  // Empty until the table's bigBlind is known (from the first table:state),
  // at which point it's initialized to the minimum buy-in once. A string,
  // not a number, so a player can freely type/clear it (same pattern as
  // the wager amount input on the sportsbook page, app/sports/page.tsx).
  const [buyInText, setBuyInText] = useState('');

  const fetchedAvatarsRef = useRef(new Set<string>());

  const {
    connected,
    error: channelError,
    sendAction,
  } = usePokerChannel<TableState>(
    config ? pokerTableChannelName(config.id) : null,
    Boolean(token && profile),
    setTableState
  );

  // Avatars aren't carried through the table:state broadcast (a profile
  // photo as base64 can exceed Realtime's broadcast payload size limit), so
  // each seated player's avatar is fetched separately as seats appear.
  useEffect(() => {
    if (!tableState) return;

    tableState.seats.forEach((seat) => {
      if (!seat.playerId || fetchedAvatarsRef.current.has(seat.playerId)) return;
      fetchedAvatarsRef.current.add(seat.playerId);

      fetch(`/api/players/${seat.playerId}/avatar`)
        .then((res) => res.json())
        .then((data) => setAvatars((prev) => ({ ...prev, [seat.playerId as string]: data.avatarUrl ?? null })))
        .catch(() => setAvatars((prev) => ({ ...prev, [seat.playerId as string]: null })));
    });
  }, [tableState]);

  // Someone else may sit in the seat this player picked before they buy in.
  useEffect(() => {
    if (selectedSeat === null || !tableState) return;
    if (tableState.seats.find((seat) => seat.seatNumber === selectedSeat)?.playerId) {
      setSelectedSeat(null);
    }
  }, [selectedSeat, tableState]);

  const mySeat = useMemo(() => {
    if (!profile || !tableState) return null;
    return tableState.seats.find((seat) => seat.playerId === String(profile.playerId)) ?? null;
  }, [profile, tableState]);

  const isFull = tableState ? tableState.seatedCount >= tableState.maxSeats : false;
  const minBuyIn = tableState ? MIN_BUY_IN_MULTIPLIER * tableState.bigBlind : null;
  const maxBuyIn =
    tableState && profile ? Math.min(MAX_BUY_IN_MULTIPLIER * tableState.bigBlind, profile.balance) : null;
  const canAffordBuyIn = minBuyIn !== null && maxBuyIn !== null && maxBuyIn >= minBuyIn;

  // Same parsing approach as the sportsbook's wager input: only digits count
  // as a valid amount, so an empty/partial/non-numeric entry is just null
  // rather than NaN.
  const parsedBuyIn = /^\d+$/.test(buyInText) ? Number(buyInText) : null;
  let buyInError = '';
  if (buyInText && parsedBuyIn === null) buyInError = 'Enter a whole number of chips.';
  else if (parsedBuyIn !== null && minBuyIn !== null && parsedBuyIn < minBuyIn) {
    buyInError = `Minimum buy-in is ${minBuyIn}.`;
  } else if (parsedBuyIn !== null && maxBuyIn !== null && parsedBuyIn > maxBuyIn) {
    buyInError = `Maximum buy-in is ${maxBuyIn}.`;
  }
  const buyInValid = parsedBuyIn !== null && !buyInError;

  function addToBuyIn(amount: number) {
    if (minBuyIn === null || maxBuyIn === null) return;
    const base = parsedBuyIn ?? minBuyIn;
    setBuyInText(String(Math.min(base + amount, maxBuyIn)));
  }

  // Initialize the input to the minimum once the table's bigBlind (and so
  // minBuyIn) is known — it isn't available until the first table:state.
  // Only once: a player clearing the field to type a new amount shouldn't
  // have it refilled under them (see resetEmptyBuyIn for that instead).
  const buyInInitializedRef = useRef(false);
  useEffect(() => {
    if (!buyInInitializedRef.current && minBuyIn !== null) {
      buyInInitializedRef.current = true;
      setBuyInText(String(minBuyIn));
    }
  }, [minBuyIn]);

  // When the player clicks away from a blank/non-numeric buy-in, put the
  // minimum back rather than leaving the field empty.
  function resetEmptyBuyIn() {
    if (parsedBuyIn === null && minBuyIn !== null) setBuyInText(String(minBuyIn));
  }

  // The buy-in/refund happens server-side against players.balance, but
  // joining doesn't navigate, so the nav bar's own balance fetch (which only
  // re-runs on route change) would otherwise never pick it up. Refresh this
  // page's own copy of the balance too, so the buy-in input's max stays
  // accurate.
  async function refreshBalance() {
    if (!token) return;
    const res = await fetch('/api/profile/balance', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setProfile((prev) => (prev ? { ...prev, balance: data.balance } : prev));
    }
    notifyBalanceChanged();
  }

  async function handleJoin() {
    if (!connected || !token || !buyInValid || parsedBuyIn === null || selectedSeat === null) return;
    setJoinError('');
    const result = await sendAction('join', { token, buyIn: parsedBuyIn, seatNumber: selectedSeat });
    if (result.ok) {
      setSelectedSeat(null);
      await refreshBalance();
    } else {
      setJoinError(result.error || 'Unable to join the table.');
    }
  }

  // Leaving sends the player back to the lobby to pick another table.
  async function handleLeave() {
    if (!connected || !token) return;
    setJoinError('');
    setLeaving(true);
    const result = await sendAction('leave', { token });
    if (result.ok) {
      notifyBalanceChanged();
      router.push('/poker');
    } else {
      setLeaving(false);
      setJoinError(result.error || 'Unable to leave the table.');
    }
  }

  if (!config) {
    return <RoomMessage message="That poker table doesn't exist." href="/poker" linkText="Back to the lobby" />;
  }

  if (profileLoading) {
    return (
      <Room center>
        <p className="text-slate-400">Loading…</p>
      </Room>
    );
  }

  // SRS-1.1 (simplified): the poker room is only accessible to a signed-in player.
  if (!token || !profile) {
    return (
      <RoomMessage
        message={profileError || 'You must be logged in to join the poker table.'}
        href="/login"
        linkText="Go to login"
      />
    );
  }

  const canPickSeat = !mySeat && !leaving;
  const pageError = joinError || channelError;
  const tableMinBuyIn = MIN_BUY_IN_MULTIPLIER * config.bigBlind;
  const tableMaxBuyIn = MAX_BUY_IN_MULTIPLIER * config.bigBlind;
  // The range slider moves in big-blind steps; the text input still takes any amount.
  const sliderValue =
    minBuyIn !== null && maxBuyIn !== null ? Math.min(Math.max(parsedBuyIn ?? minBuyIn, minBuyIn), maxBuyIn) : 0;

  return (
    <Room>
      <section className="w-full max-w-4xl">
        <header className="flex flex-col gap-6 border-b border-white/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {!mySeat ? (
              <Link href="/poker" className="mb-4 inline-block text-sm text-slate-400 transition hover:text-emerald-300">
                ← Lobby
              </Link>
            ) : null}
            <PokerRoomEyebrow>{config.stakes} Stakes</PokerRoomEyebrow>
            <h1 className="mt-3 flex items-center gap-3 text-4xl font-bold tracking-tight sm:text-5xl">
              <StakesChip stakes={config.stakes} size="h-10 w-10" />
              {config.name}
            </h1>
            <p className="mt-2 text-slate-400">
              Blinds{' '}
              <span className={`font-semibold tabular-nums ${STAKES_STYLES[config.stakes].accent}`}>
                {config.smallBlind}/{config.bigBlind}
              </span>{' '}
              · Buy-in{' '}
              <span className="tabular-nums text-slate-300">
                {tableMinBuyIn}&ndash;{tableMaxBuyIn}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            {tableState ? (
              <StatPill>
                <span className="font-semibold tabular-nums text-amber-300">
                  {tableState.seatedCount} / {tableState.maxSeats}
                </span>{' '}
                <span className="text-slate-400">{isFull ? 'seated · full' : 'seated'}</span>
              </StatPill>
            ) : null}
            <ConnectionPill connected={connected} />
          </div>
        </header>

        <div className="relative mx-auto mt-10 h-[340px] w-full max-w-3xl sm:h-[440px]">
          {/* Light over the table */}
          <div className="pointer-events-none absolute inset-x-[10%] -top-8 bottom-0 rounded-[50%] bg-[radial-gradient(ellipse_at_center,_rgba(52,211,153,0.12)_0%,_transparent_65%)]" />

          {/* Wooden rail */}
          <div className="absolute inset-[7%] rounded-[50%] bg-gradient-to-br from-amber-700 via-amber-900 to-amber-950 shadow-[0_30px_60px_rgba(0,0,0,0.7)]">
            <div className="absolute inset-[3px] rounded-[50%] border border-amber-500/20" />
          </div>

          {/* Felt */}
          <div className="absolute inset-[12%] rounded-[50%] bg-[radial-gradient(ellipse_at_center,_#15803d_0%,_#065f46_60%,_#022c22_100%)] shadow-[inset_0_0_60px_rgba(0,0,0,0.65)]">
            {/* Racetrack line */}
            <div className="absolute inset-[8%] rounded-[50%] border border-emerald-300/15" />
            {/* Center emblem */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <StakesChip stakes={config.stakes} size="h-8 w-8" />
              <p className="text-[10px] uppercase tracking-[0.4em] text-emerald-200/30 sm:text-xs">Stacks Overflowed</p>
              <p className="text-2xl font-bold tabular-nums tracking-[0.15em] text-emerald-100/25 sm:text-3xl">
                {config.smallBlind}/{config.bigBlind}
              </p>
            </div>
          </div>

          {tableState?.seats.map((seat, index) => {
            // Seats are placed by angle around an oval, starting at the top
            // and going clockwise, like sitting around a real table.
            const angle = (2 * Math.PI * index) / tableState.maxSeats - Math.PI / 2;
            const left = 50 + 46 * Math.cos(angle);
            const top = 50 + 44 * Math.sin(angle);
            const isOwnSeat = seat.playerId === String(profile.playerId);
            const isSelected = seat.seatNumber === selectedSeat;
            const isPickable = canPickSeat && !seat.playerId;

            return (
              <div
                key={seat.seatNumber}
                style={{ left: `${left}%`, top: `${top}%` }}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              >
                <button
                  type="button"
                  disabled={!isPickable}
                  onClick={() => setSelectedSeat(seat.seatNumber)}
                  aria-label={isPickable ? `Pick seat ${seat.seatNumber}` : undefined}
                  aria-pressed={isPickable ? isSelected : undefined}
                  className={`relative z-10 h-14 w-14 shrink-0 overflow-hidden rounded-full transition disabled:cursor-default sm:h-16 sm:w-16 ${
                    seat.playerId
                      ? isOwnSeat
                        ? 'border-2 border-emerald-300 bg-slate-900 shadow-[0_0_20px_rgba(110,231,183,0.45)]'
                        : 'border-2 border-slate-300/40 bg-slate-900 shadow-lg shadow-black/60'
                      : isSelected
                        ? 'scale-110 border-2 border-amber-300 bg-amber-950/80 shadow-[0_0_22px_rgba(252,211,77,0.55)]'
                        : isPickable
                          ? 'border-2 border-dashed border-emerald-200/40 bg-slate-950/70 hover:scale-105 hover:border-amber-300 hover:bg-amber-950/40'
                          : 'border-2 border-dashed border-slate-600/40 bg-slate-950/60'
                  }`}
                >
                  {seat.playerId ? (
                    avatars[seat.playerId] ? (
                      <img src={avatars[seat.playerId] as string} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-lg font-semibold text-emerald-200">
                        {seat.username?.[0]?.toUpperCase()}
                      </span>
                    )
                  ) : (
                    <span
                      className={`flex h-full w-full items-center justify-center text-xs font-semibold uppercase tracking-wider ${
                        isSelected ? 'text-amber-200' : isPickable ? 'text-emerald-200/70' : 'text-slate-600'
                      }`}
                    >
                      {isPickable ? 'Sit' : seat.seatNumber}
                    </span>
                  )}
                </button>

                {/* Name plate */}
                <div
                  className={`-mt-2 min-w-[76px] max-w-[96px] rounded-lg border px-2 pb-1 pt-2.5 text-center shadow-lg shadow-black/50 ${
                    seat.playerId
                      ? isOwnSeat
                        ? 'border-emerald-300/40 bg-slate-950/95'
                        : 'border-white/10 bg-slate-950/95'
                      : isSelected
                        ? 'border-amber-300/40 bg-slate-950/90'
                        : 'border-transparent bg-black/40'
                  }`}
                >
                  <p
                    className={`truncate text-xs font-medium ${
                      seat.playerId
                        ? isOwnSeat
                          ? 'text-emerald-200'
                          : 'text-slate-100'
                        : isSelected
                          ? 'text-amber-200'
                          : 'text-slate-500'
                    }`}
                  >
                    {seat.playerId ? (isOwnSeat ? 'You' : seat.username) : isSelected ? 'Your pick' : `Seat ${seat.seatNumber}`}
                  </p>
                  {seat.chipStack !== null ? (
                    <p className="flex items-center justify-center gap-1 text-[11px] font-semibold tabular-nums text-amber-300">
                      <span className="h-2 w-2 rounded-full border border-dashed border-white/70 bg-amber-500" />
                      {seat.chipStack}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {/* Controls */}
        <div className="mx-auto mt-8 max-w-3xl rounded-3xl border border-white/5 bg-gradient-to-b from-slate-900/95 to-slate-950/95 p-6 shadow-2xl shadow-black/50">
          <div className="flex flex-col gap-6 md:flex-row md:items-start">
            <div className="flex items-center gap-3 md:w-56 md:shrink-0">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-emerald-300/60 bg-slate-900">
                {profile.profilePhotoDataUrl ? (
                  <img src={profile.profilePhotoDataUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-base font-semibold text-slate-300">
                    {profile.username?.[0]?.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-100">{profile.username}</p>
                <p className="text-sm text-slate-400">
                  Balance <span className="font-semibold tabular-nums text-amber-300">{profile.balance}</span>
                </p>
              </div>
            </div>

            <div className="flex-1 md:border-l md:border-white/10 md:pl-6">
              {!mySeat ? (
                leaving ? (
                  <p className="py-3 text-center text-slate-300">Returning to the lobby…</p>
                ) : isFull ? (
                  <div className="space-y-3 text-center">
                    <p className="text-slate-300">This table is full.</p>
                    <Link
                      href="/poker"
                      className="inline-block rounded-xl border border-white/10 bg-slate-800 px-5 py-2.5 font-semibold text-slate-200 transition hover:border-emerald-400/60"
                    >
                      Find another table
                    </Link>
                  </div>
                ) : minBuyIn === null || maxBuyIn === null ? (
                  <p className="py-3 text-center text-slate-400">Loading table…</p>
                ) : !canAffordBuyIn ? (
                  <div className="space-y-3 text-center">
                    <p className="text-slate-300">
                      You need at least <span className="font-semibold text-amber-300">{minBuyIn}</span> to sit
                      here (your balance: {profile.balance}).
                    </p>
                    <Link
                      href="/poker"
                      className="inline-block rounded-xl border border-white/10 bg-slate-800 px-5 py-2.5 font-semibold text-slate-200 transition hover:border-emerald-400/60"
                    >
                      Try lower stakes
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <ol className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                      <li className={selectedSeat === null ? 'text-amber-200' : 'text-emerald-300'}>
                        <span
                          className={`mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
                            selectedSeat === null ? 'bg-amber-300 text-slate-950' : 'bg-emerald-400 text-slate-950'
                          }`}
                        >
                          {selectedSeat === null ? '1' : '✓'}
                        </span>
                        {selectedSeat === null ? 'Pick an open seat' : `Seat ${selectedSeat}`}
                      </li>
                      <li className={selectedSeat === null ? 'text-slate-500' : 'text-amber-200'}>
                        <span
                          className={`mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
                            selectedSeat === null ? 'bg-slate-800 text-slate-400' : 'bg-amber-300 text-slate-950'
                          }`}
                        >
                          2
                        </span>
                        Choose your buy-in
                      </li>
                    </ol>

                    <div>
                      <div className="flex items-baseline justify-between">
                        <label htmlFor="buy-in-amount" className="text-xs uppercase tracking-wider text-slate-500">
                          Buy-in
                        </label>
                        <span className="text-xs tabular-nums text-slate-500">
                          {minBuyIn}&ndash;{maxBuyIn}
                        </span>
                      </div>
                      <div className="relative mt-1">
                        <input
                          id="buy-in-amount"
                          inputMode="numeric"
                          value={buyInText}
                          onChange={(e) => setBuyInText(e.target.value.trim())}
                          onBlur={resetEmptyBuyIn}
                          placeholder={String(minBuyIn)}
                          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 pr-16 text-2xl font-semibold tabular-nums text-amber-200 outline-none transition focus:border-amber-300"
                        />
                        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                          chips
                        </span>
                      </div>
                      <input
                        type="range"
                        aria-label="Buy-in amount"
                        min={minBuyIn}
                        max={maxBuyIn}
                        step={config.bigBlind}
                        value={sliderValue}
                        onChange={(e) => setBuyInText(e.target.value)}
                        className="mt-3 w-full accent-amber-300"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setBuyInText(String(minBuyIn))}
                        className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-300 transition hover:border-amber-300/70"
                      >
                        Min
                      </button>
                      {QUICK_BUY_IN_INCREMENTS.map((amount) => (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => addToBuyIn(amount)}
                          className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs tabular-nums text-slate-300 transition hover:border-amber-300/70"
                        >
                          +{amount}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setBuyInText(String(maxBuyIn))}
                        className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-300 transition hover:border-amber-300/70"
                      >
                        Max
                      </button>
                    </div>

                    {buyInError ? <p className="text-sm text-red-300">{buyInError}</p> : null}

                    <button
                      type="button"
                      onClick={handleJoin}
                      disabled={!connected || !buyInValid || selectedSeat === null}
                      className="w-full rounded-xl bg-emerald-400 px-6 py-3 font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
                    >
                      {selectedSeat === null
                        ? 'Pick a seat to join'
                        : buyInValid
                          ? `Sit in seat ${selectedSeat} with ${parsedBuyIn} chips`
                          : 'Join table'}
                    </button>
                  </div>
                )
              ) : (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500">Your stack · Seat {mySeat.seatNumber}</p>
                    <p className="mt-1 flex items-center gap-2 text-3xl font-bold tabular-nums text-amber-300">
                      <StakesChip stakes={config.stakes} size="h-7 w-7" />
                      {mySeat.chipStack}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleLeave}
                    disabled={leaving}
                    className="rounded-xl border border-red-400/40 bg-red-500/10 px-6 py-3 font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {leaving ? 'Leaving…' : 'Leave table'}
                  </button>
                </div>
              )}

              {pageError ? (
                <p className="mt-4 rounded-xl border border-red-800 bg-red-950/60 p-3 text-sm text-red-200">{pageError}</p>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </Room>
  );
}
