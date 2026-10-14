'use client';

import Link from 'next/link';
import { GAMES, type Game } from '../lib/games';
import GameArt from './GameArt';
import { playHref, useSignedIn } from './useSignedIn';

// One card per game in lib/games.ts, with its picture from GameArt. A game
// with an href links to it (whole card); the rest are dimmed with "Coming
// soon" until they are connected.
export default function GameGrid() {
  const signedIn = useSignedIn();

  return (
    <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {GAMES.map((game) => (
        <GameCard key={game.id} game={game} href={game.href ? playHref(signedIn, game.href) : null} />
      ))}
    </div>
  );
}

const cardClass =
  'group flex h-full flex-col overflow-hidden rounded-3xl border border-white/5 bg-slate-900/80 shadow-xl shadow-black/40 transition';
const playableClass =
  'hover:-translate-y-1 hover:border-emerald-400/30 hover:shadow-2xl hover:shadow-emerald-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300';

function GameCard({ game, href }: { game: Game; href: string | null }) {
  const body = (
    <>
      <div className="relative aspect-[8/5] overflow-hidden">
        <div className={`h-full w-full transition duration-500 ${href ? 'group-hover:scale-105' : 'grayscale'}`}>
          <GameArt id={game.id} label={`${game.name} illustration`} />
        </div>
        <span className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
          {game.tag}
        </span>
        {!href ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/55">
            <span className="rounded-full border border-white/15 bg-slate-900/90 px-4 py-1.5 text-sm font-semibold text-slate-200">
              Coming soon
            </span>
          </div>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className={`text-lg font-semibold ${href ? 'text-slate-100' : 'text-slate-400'}`}>{game.name}</h3>
        <p className="mt-1 flex-1 text-sm text-slate-400">{game.description}</p>
        {href ? (
          <span className="mt-4 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-emerald-300 transition-all group-hover:gap-2.5">
            Play now <span aria-hidden>→</span>
          </span>
        ) : (
          <span className="mt-4 text-sm text-slate-500">Not open yet</span>
        )}
      </div>
    </>
  );

  return href ? (
    <Link href={href} className={`${cardClass} ${playableClass}`}>
      {body}
    </Link>
  ) : (
    <article aria-disabled className={`${cardClass} opacity-80`}>
      {body}
    </article>
  );
}
