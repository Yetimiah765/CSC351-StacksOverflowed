'use client';

import { GAMES } from '../../lib/games';

// What GET /api/profile/stats returns.
export interface PlayerStats {
  moneyWon: number;
  moneyLost: number;
  // Keyed by each game's statsCode (lib/games.ts).
  games: Record<string, { moneyWon: number; moneyLost: number }>;
}

// The profile page's statistics section: money won and money lost, with the
// overall totals on top (SRS-117.2, SRS-117.5) and each game's money won and
// lost below (SRS-118.2, SRS-118.4). Time played is no longer tracked (UR-116 was removed on
// 2026-10-27). A game that doesn't save its results yet says so instead of
// showing a misleading 0.
export default function StatsSection({ stats, loadError }: { stats: PlayerStats | null; loadError: string }) {
  const totals = [
    { label: 'Money won', value: stats?.moneyWon, color: 'text-emerald-300' },
    { label: 'Money lost', value: stats?.moneyLost, color: 'text-rose-300' },
  ];

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl shadow-black/30 sm:p-8">
      <h2 className="text-xl font-semibold">Money won and lost</h2>
      {loadError ? <p className="mt-4 text-sm text-red-300">{loadError}</p> : null}

      <div className="mt-5">
        {/* Overall totals */}
        <div className="grid gap-3 sm:grid-cols-2">
          {totals.map(({ label, value, color }) => (
            <div key={label} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-widest text-slate-400">{label}</p>
              {value === undefined ? (
                <p className="mt-1 text-2xl font-semibold text-slate-300">—</p>
              ) : (
                <p className={`mt-1 text-2xl font-semibold ${color}`}>
                  {value.toLocaleString('en-US')} <span className="text-sm font-normal text-slate-400">coins</span>
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Per game */}
        <h3 className="mt-6 text-sm uppercase tracking-widest text-slate-400">By game</h3>
        <ul className="mt-2 divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-950/70">
          {GAMES.map((game) => {
            const result = stats?.games[game.statsCode];
            return (
              <li key={game.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <span className="text-slate-200">{game.name}</span>
                {!game.recordsResults ? (
                  <span className="text-slate-500">Not recorded yet</span>
                ) : result ? (
                  <span className="flex gap-4">
                    <span className="text-emerald-300">Won {result.moneyWon.toLocaleString('en-US')}</span>
                    <span className="text-rose-300">Lost {result.moneyLost.toLocaleString('en-US')}</span>
                  </span>
                ) : (
                  <span className="text-slate-500">—</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
