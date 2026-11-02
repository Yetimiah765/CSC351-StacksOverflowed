'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import BackToHome from '../../components/BackToHome';
import SlotSymbol, { type SlotSymbolName } from '../../components/slots/SlotSymbol';
import { initialSlotBet } from '../../lib/slots';

// What the reels show before the first spin.
const IDLE_REELS: SlotSymbolName[] = ['Seven', 'Seven', 'Seven'];

const CHIP_STYLE: Record<number, string> = {
  5: 'bg-red-600',
  10: 'bg-blue-600',
  25: 'bg-emerald-600',
  50: 'bg-orange-500',
  100: 'bg-neutral-700',
};

export default function SlotsPage() {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [betAmounts, setBetAmounts] = useState<number[]>([]);
  const [bet, setBet] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // SRS-306.5 / SRS-108.3: only signed-in players can play; guests log in first.
  useEffect(() => {
    const playerToken = localStorage.getItem('player_token');
    if (!playerToken) {
      router.replace('/login');
      return;
    }

    fetch('/api/profile/balance', { headers: { Authorization: `Bearer ${playerToken}` } })
      .then(async (res) => {
        if (res.status === 401) {
          localStorage.removeItem('player_token');
          router.replace('/login');
          return;
        }
        if (res.ok) setBalance((await res.json()).balance);
      })
      .catch(() => {});

    // SRS-306.1: the bets come from the database, with 5 coins selected.
    fetch('/api/slots/bet-amounts')
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok || !Array.isArray(data?.betAmounts)) throw new Error();
        if (data.betAmounts.length === 0) {
          setLoadError('No bet amounts are set up yet, so the slot machine is closed.');
          return;
        }
        setBetAmounts(data.betAmounts);
        setBet(data.defaultBet ?? initialSlotBet(data.betAmounts));
      })
      .catch(() => setLoadError("Couldn't load the bet amounts. Please refresh the page."));
  }, [router]);

  return (
    <main className="min-h-page bg-[radial-gradient(ellipse_at_top,#4c0519_0%,#1c0510_55%,#0a0206_100%)] px-4 py-8 text-white">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-6">
        <BackToHome className="self-start" />
        <header className="flex w-full flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-amber-300">Slot Machine</h1>
            <p className="text-sm text-rose-100/80">Three reels, one payline. Line up three of a kind to win.</p>
          </div>
          <div className="rounded-lg border border-amber-400/40 bg-black/40 px-4 py-2 text-right">
            <div className="text-xs uppercase tracking-wide text-amber-200/70">Balance</div>
            <div className="text-xl font-bold tabular-nums">
              {balance === null ? '…' : `${balance.toLocaleString()} coins`}
            </div>
          </div>
        </header>

        {/* The cabinet: lights along the top, then the reel window with its payline. */}
        <section
          aria-label="Slot machine"
          className="w-full rounded-[2rem] border-4 border-amber-400 bg-gradient-to-b from-rose-700 via-rose-800 to-rose-950 p-5 shadow-[0_0_40px_rgba(251,191,36,0.35)]"
        >
          <div className="mb-4 flex justify-center gap-3" aria-hidden>
            {Array.from({ length: 9 }, (_, i) => (
              <span
                key={i}
                className={`h-3 w-3 rounded-full ${i % 2 ? 'bg-amber-200' : 'bg-amber-400'} shadow-[0_0_8px_#fcd34d]`}
              />
            ))}
          </div>
          <div className="relative grid grid-cols-3 gap-3 rounded-2xl border-4 border-amber-300 bg-slate-950 p-3">
            {IDLE_REELS.map((symbol, i) => (
              <div
                key={i}
                className="flex h-32 items-center justify-center rounded-xl bg-gradient-to-b from-slate-300 via-white to-slate-300 shadow-inner sm:h-40"
              >
                <SlotSymbol name={symbol} />
              </div>
            ))}
            <div aria-hidden className="pointer-events-none absolute inset-x-1 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/70" />
          </div>
        </section>

        {/* SRS-306.1: choose the bet before spinning. */}
        <section className="w-full rounded-2xl border border-white/10 bg-black/30 p-4">
          <h2 className="mb-3 text-center text-sm font-semibold uppercase tracking-wider text-amber-200">
            Choose your bet
          </h2>
          {loadError ? (
            <p role="alert" className="text-center text-sm text-red-300">
              {loadError}
            </p>
          ) : (
            <div role="radiogroup" aria-label="Bet amount" className="flex flex-wrap justify-center gap-3">
              {betAmounts.map((amount) => {
                const selected = bet === amount;
                return (
                  <button
                    key={amount}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setBet(amount)}
                    className={`flex h-16 w-16 items-center justify-center rounded-full border-4 border-dashed border-white/80 text-lg font-black shadow-lg transition ${
                      CHIP_STYLE[amount] ?? 'bg-slate-600'
                    } ${selected ? 'scale-110 ring-4 ring-amber-300 ring-offset-2 ring-offset-black' : 'opacity-80 hover:opacity-100'}`}
                  >
                    {amount}
                  </button>
                );
              })}
            </div>
          )}
          {!loadError && (
            <p className="mt-3 text-center text-sm text-rose-100/80">
              {bet === null ? 'Loading bets…' : (
                <>
                  Bet: <span className="font-bold text-white">{bet} coins</span> per spin
                </>
              )}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
