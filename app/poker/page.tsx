'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MAX_BUY_IN_MULTIPLIER, MIN_BUY_IN_MULTIPLIER } from '../../lib/pokerTable';
import { getPokerTableConfig } from '../../lib/pokerTables';
import { POKER_LOBBY_CHANNEL_NAME, type PokerLobbyState, type PokerLobbyTable } from '../../lib/pokerRealtime';
import { usePlayerProfile, usePokerChannel } from './usePoker';
import {
  ConnectionPill,
  PokerRoomEyebrow,
  Room,
  RoomMessage,
  STAKES_STYLES,
  StakesChip,
  StatPill,
  type Stakes,
} from './pokerUi';

const STAKES_ORDER: Stakes[] = ['Low', 'Mid', 'High'];

// A small top-down table with a dot per seat. The lobby only knows how many
// seats are taken, not which ones, so the first `seatedCount` dots fill in.
function MiniTable({ table }: { table: PokerLobbyTable }) {
  return (
    <div className="relative mx-auto aspect-[16/10] w-full max-w-[260px]">
      <div className="absolute inset-[12%] rounded-[50%] bg-gradient-to-br from-amber-700 via-amber-900 to-amber-950 shadow-xl shadow-black/60" />
      <div className="absolute inset-[17%] flex items-center justify-center rounded-[50%] bg-[radial-gradient(ellipse_at_center,_#15803d_0%,_#065f46_60%,_#022c22_100%)] shadow-[inset_0_0_24px_rgba(0,0,0,0.6)]">
        <div className="absolute inset-[10%] rounded-[50%] border border-emerald-300/15" />
        <span className="text-lg font-bold tabular-nums tracking-wide text-emerald-100/80">
          {table.smallBlind}/{table.bigBlind}
        </span>
      </div>

      {Array.from({ length: table.maxSeats }, (_, index) => {
        const angle = (2 * Math.PI * index) / table.maxSeats - Math.PI / 2;
        const taken = index < table.seatedCount;
        return (
          <span
            key={index}
            style={{ left: `${50 + 46 * Math.cos(angle)}%`, top: `${50 + 44 * Math.sin(angle)}%` }}
            className={`absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors ${
              taken
                ? 'bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.6)] ring-2 ring-amber-100/40'
                : 'border border-emerald-200/25 bg-slate-900/80'
            }`}
          />
        );
      })}
    </div>
  );
}

function TableCard({ table, stakes }: { table: PokerLobbyTable; stakes: Stakes }) {
  const style = STAKES_STYLES[stakes];
  const openSeats = table.maxSeats - table.seatedCount;
  const isFull = openSeats <= 0;
  const minBuyIn = MIN_BUY_IN_MULTIPLIER * table.bigBlind;
  const maxBuyIn = MAX_BUY_IN_MULTIPLIER * table.bigBlind;

  const status = isFull ? 'Full' : table.seatedCount === 0 ? 'Empty' : `${openSeats} open`;
  const statusStyle = isFull
    ? 'bg-slate-800 text-slate-400'
    : table.seatedCount === 0
      ? 'bg-slate-800/80 text-slate-300'
      : 'bg-emerald-500/15 text-emerald-300';

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-100">{table.name}</h3>
          <p className={`text-xs ${style.accent}`}>Blinds {table.smallBlind}/{table.bigBlind}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle}`}>{status}</span>
          {table.phase === 'in-hand' ? (
            <span className="flex items-center gap-1.5 text-[11px] text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
              In play
            </span>
          ) : table.phase === 'countdown' ? (
            <span className="flex items-center gap-1.5 text-[11px] text-amber-200">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-200" />
              Starting soon
            </span>
          ) : null}
        </div>
      </div>

      <div className="my-3">
        <MiniTable table={table} />
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-black/30 px-3 py-2">
          <dt className="text-[10px] uppercase tracking-wider text-slate-500">Players</dt>
          <dd className="font-semibold tabular-nums">
            {table.seatedCount} / {table.maxSeats}
          </dd>
        </div>
        <div className="rounded-lg bg-black/30 px-3 py-2">
          <dt className="text-[10px] uppercase tracking-wider text-slate-500">Buy-in</dt>
          <dd className="font-semibold tabular-nums">
            {minBuyIn}&ndash;{maxBuyIn}
          </dd>
        </div>
      </dl>

      <span
        className={`mt-4 block rounded-xl px-4 py-2.5 text-center font-semibold transition ${
          isFull
            ? 'bg-slate-800 text-slate-500'
            : 'bg-emerald-400 text-slate-950 group-hover:bg-emerald-300'
        }`}
      >
        {isFull ? 'Table full' : 'Take a seat →'}
      </span>
    </>
  );

  const cardClass =
    'group block rounded-2xl border border-white/5 bg-gradient-to-b from-slate-900/95 to-slate-950/95 p-5 shadow-xl shadow-black/40 backdrop-blur-sm transition';

  if (isFull) {
    return (
      <div aria-disabled className={`${cardClass} opacity-60`}>
        {body}
      </div>
    );
  }

  return (
    <Link
      href={`/poker/${table.tableId}`}
      className={`${cardClass} hover:-translate-y-1 hover:shadow-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 ${style.glow}`}
    >
      {body}
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-white/5 bg-slate-900/70 p-5">
      <div className="h-4 w-28 rounded bg-slate-800" />
      <div className="mt-2 h-3 w-16 rounded bg-slate-800" />
      <div className="mx-auto my-5 aspect-[16/10] w-3/4 rounded-[50%] bg-slate-800/80" />
      <div className="h-10 rounded-xl bg-slate-800" />
    </div>
  );
}

// The poker lobby: every table's blinds and live seat count, from the
// realtime server's lobby channel. A player who is already seated somewhere
// is sent straight to that table instead, since they can only sit at one
// table at a time.
export default function PokerLobbyPage() {
  const router = useRouter();
  const { token, profile, loading: profileLoading, error: profileError } = usePlayerProfile();
  const [lobby, setLobby] = useState<PokerLobbyState | null>(null);

  const { connected, error: channelError } = usePokerChannel<PokerLobbyState>(
    POKER_LOBBY_CHANNEL_NAME,
    Boolean(token && profile),
    setLobby
  );

  const seatedTableId =
    lobby && profile
      ? lobby.tables.find((table) => table.playerIds.includes(String(profile.playerId)))?.tableId ?? null
      : null;

  useEffect(() => {
    if (seatedTableId) router.replace(`/poker/${seatedTableId}`);
  }, [seatedTableId, router]);

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

  const tablesByStakes = STAKES_ORDER.map((stakes) => ({
    stakes,
    tables: (lobby?.tables ?? []).filter((table) => getPokerTableConfig(table.tableId)?.stakes === stakes),
  })).filter((group) => group.tables.length > 0);

  const playersSeated = lobby?.tables.reduce((sum, table) => sum + table.seatedCount, 0) ?? 0;
  const openSeats = lobby?.tables.reduce((sum, table) => sum + table.maxSeats - table.seatedCount, 0) ?? 0;

  return (
    <Room>
      <section className="w-full max-w-4xl">
        <header className="flex flex-col gap-6 border-b border-white/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <PokerRoomEyebrow />
            <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Choose your table</h1>
            <p className="mt-2 text-slate-400">Pick your stakes and take a seat.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            {lobby && !seatedTableId ? (
              <>
                <StatPill>
                  <span className="font-semibold tabular-nums text-amber-300">{playersSeated}</span>{' '}
                  <span className="text-slate-400">{playersSeated === 1 ? 'player' : 'players'} seated</span>
                </StatPill>
                <StatPill>
                  <span className="font-semibold tabular-nums text-emerald-300">{openSeats}</span>{' '}
                  <span className="text-slate-400">open seats</span>
                </StatPill>
              </>
            ) : null}
            <ConnectionPill connected={connected} />
          </div>
        </header>

        {channelError ? (
          <p className="mt-8 rounded-xl border border-red-800 bg-red-950/60 p-3 text-sm text-red-200">
            {channelError}
          </p>
        ) : seatedTableId ? (
          // Shown while redirecting a seated player, so the lobby doesn't
          // flash up before their table opens.
          <p className="mt-12 text-center text-slate-400">Taking you to your table…</p>
        ) : !lobby ? (
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {Array.from({ length: 6 }, (_, index) => (
              <SkeletonCard key={index} />
            ))}
          </div>
        ) : (
          <div className="mt-10 space-y-12">
            {tablesByStakes.map(({ stakes, tables }) => (
              <section key={stakes}>
                <div className="mb-5 flex items-center gap-3">
                  <StakesChip stakes={stakes} />
                  <h2 className="text-xl font-semibold">{stakes} Stakes</h2>
                  <span className={`text-sm tabular-nums ${STAKES_STYLES[stakes].accent}`}>
                    {tables[0].smallBlind}/{tables[0].bigBlind}
                  </span>
                  <span className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                </div>
                <ul className="grid gap-5 sm:grid-cols-2">
                  {tables.map((table) => (
                    <li key={table.tableId}>
                      <TableCard table={table} stakes={stakes} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        <p className="mt-12 text-sm text-slate-400">
          Back to{' '}
          <Link href="/" className="text-emerald-300 hover:underline">
            home
          </Link>
        </p>
      </section>
    </Room>
  );
}
