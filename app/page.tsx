import Link from 'next/link';
import GameGrid from '../components/GameGrid';
import HomeHero from '../components/HomeHero';
import { DAILY_LOGIN_BOX_REWARDS } from '../lib/dailyLoginBox';

const rewardAmounts = DAILY_LOGIN_BOX_REWARDS.map((reward) => reward.amount);

// SRS-107.1/107.2: lists every game, and guests can view it too.
export default function Home() {
  return (
    <main className="min-h-page bg-slate-950 text-slate-100">
      <HomeHero />

      <section id="games" className="mx-auto w-full max-w-6xl scroll-mt-20 px-6 py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-3xl font-bold tracking-tight">Games</h2>
          <p className="max-w-sm text-sm text-slate-400">
            Every game uses the same coin balance shown in the top bar.
          </p>
        </div>
        <GameGrid />
      </section>

      {/* Daily Login Box (UR-128) */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-14">
        <div className="flex flex-col items-start justify-between gap-6 overflow-hidden rounded-3xl border border-amber-300/20 bg-[radial-gradient(ellipse_at_left,_rgba(251,191,36,0.18)_0%,_transparent_60%)] bg-slate-900/80 p-8 sm:flex-row sm:items-center">
          <div className="flex items-center gap-5">
            <span aria-hidden className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-amber-400/15 text-4xl">
              🎁
            </span>
            <div>
              <h2 className="text-xl font-semibold">Free coins every day</h2>
              <p className="mt-1 text-slate-300">
                Spin the Daily Login Box once every 24 hours for {Math.min(...rewardAmounts).toLocaleString('en-US')}–
                {Math.max(...rewardAmounts).toLocaleString('en-US')} coins.
              </p>
            </div>
          </div>
          <Link
            href="/shop"
            className="shrink-0 rounded-xl bg-amber-400 px-6 py-3 font-semibold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:bg-amber-300"
          >
            Open the shop
          </Link>
        </div>
      </section>
    </main>
  );
}
