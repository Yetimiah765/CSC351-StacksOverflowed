'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { GAMES } from '../lib/games';

// One card per game in lib/games.ts. A game with an href gets a Play button;
// the rest show a disabled "Coming soon" button until they are connected.
export default function GameGrid() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(Boolean(localStorage.getItem('player_token')));
  }, []);

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {GAMES.map((game) => (
        <article
          key={game.id}
          className={`flex flex-col rounded-3xl border p-6 shadow-2xl shadow-black/30 ${
            game.href ? 'border-slate-800 bg-slate-900/90' : 'border-slate-800/60 bg-slate-900/40'
          }`}
        >
          <h2 className={`text-xl font-semibold ${game.href ? 'text-slate-100' : 'text-slate-400'}`}>{game.name}</h2>
          <p className="mt-2 flex-1 text-sm text-slate-400">{game.description}</p>
          {game.href ? (
            // SRS-108.2/108.3: logged-in players go to the game; guests go to log in.
            <Link
              href={signedIn ? game.href : '/login'}
              className="mt-6 w-fit rounded-xl bg-emerald-400 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
            >
              Play
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="mt-6 w-fit cursor-not-allowed rounded-xl border border-slate-700 bg-slate-800 px-5 py-2 text-sm text-slate-400"
            >
              Coming soon
            </button>
          )}
        </article>
      ))}
    </div>
  );
}
