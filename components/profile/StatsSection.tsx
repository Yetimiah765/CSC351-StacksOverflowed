'use client';

import { useState } from 'react';
import { GAMES } from '../../lib/games';

type Tab = 'money' | 'time';

// The profile page's statistics section: a "Money won/lost" tab and a "Time
// played" tab, each with the overall totals on top and one row per game
// below (SRS-116, SRS-117, SRS-118). Sports betting counts toward money but
// not time played (SRS-116.12). Nothing records results yet, so every value
// shows a dash until the statistics step connects the games.
export default function StatsSection() {
  const [tab, setTab] = useState<Tab>('money');
  const games = tab === 'money' ? GAMES : GAMES.filter((game) => game.id !== 'sports-betting');

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl shadow-black/30 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Game statistics</h2>
        <div role="tablist" aria-label="Statistics" className="flex rounded-xl border border-slate-800 bg-slate-950 p-1">
          {(
            [
              ['money', 'Money won/lost'],
              ['time', 'Time played'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-lg px-4 py-1.5 text-sm transition ${
                tab === id ? 'bg-emerald-400 font-semibold text-slate-950' : 'text-slate-300 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel" className="mt-5">
        {/* Overall totals */}
        <div className={`grid gap-3 ${tab === 'money' ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
          {(tab === 'money' ? ['Money won', 'Money lost'] : ['Days', 'Hours', 'Minutes']).map((label) => (
            <div key={label} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-widest text-slate-400">{label}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-300">—</p>
            </div>
          ))}
        </div>

        {/* Per game */}
        <h3 className="mt-6 text-sm uppercase tracking-widest text-slate-400">By game</h3>
        <ul className="mt-2 divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-950/70">
          {games.map((game) => (
            <li key={game.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-slate-200">{game.name}</span>
              <span className="text-slate-500">—</span>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-xs text-slate-500">Statistics start counting once the games record results.</p>
      </div>
    </section>
  );
}
