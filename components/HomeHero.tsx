'use client';

import Link from 'next/link';
import { HeroArt } from './GameArt';
import { useSignedIn } from './useSignedIn';

// The top of the home page. Guests are invited to sign up or log in;
// signed-in players get straight to the games.
export default function HomeHero() {
  const signedIn = useSignedIn();

  return (
    <section className="relative overflow-hidden border-b border-white/5 bg-[radial-gradient(ellipse_at_top,_#14532d_0%,_#052e16_35%,_#020617_75%)]">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 py-14 lg:grid-cols-[1.1fr_1fr] lg:py-20">
        <div>
          <p className="flex items-center gap-3 text-sm uppercase tracking-[0.3em] text-emerald-300">
            <span aria-hidden className="tracking-[0.2em]">
              <span className="text-slate-200">♠</span>
              <span className="text-red-500">♥</span>
              <span className="text-red-500">♦</span>
              <span className="text-slate-200">♣</span>
            </span>
            Stacks Overflowed
          </p>
          <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
            Your seat at the table <span className="text-emerald-300">is waiting.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-slate-300">
            Card tables, the wheel, the reels, and live sports — every game on one balance of virtual coins. No
            real money, ever.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {signedIn === false ? (
              <>
                <Link
                  href="/register"
                  className="rounded-xl bg-emerald-400 px-6 py-3 font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-300"
                >
                  Create an account
                </Link>
                <Link
                  href="/login"
                  className="rounded-xl border border-white/15 bg-white/5 px-6 py-3 font-semibold text-slate-100 transition hover:border-emerald-300/60"
                >
                  Log in
                </Link>
              </>
            ) : (
              <>
                <a
                  href="#games"
                  className="rounded-xl bg-emerald-400 px-6 py-3 font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-300"
                >
                  Start playing
                </a>
                <Link
                  href="/shop"
                  className="rounded-xl border border-white/15 bg-white/5 px-6 py-3 font-semibold text-slate-100 transition hover:border-emerald-300/60"
                >
                  Claim free coins
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="mx-auto w-full max-w-md lg:max-w-none">
          <HeroArt />
        </div>
      </div>
    </section>
  );
}
