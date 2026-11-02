'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import SlotReels from '../../components/slots/SlotReels';
import { notifyBalanceChanged } from '../../lib/balanceEvents';
import { initialSlotBet, type SlotSymbolName } from '../../lib/slots';

// What POST /api/slots/spin returns once the spin is committed.
interface SpinResponse {
  reels: SlotSymbolName[];
  bet: number;
  multiplier: number;
  payout: number;
  balance: number;
}

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
  const [token, setToken] = useState<string | null>(null);
  const [reels, setReels] = useState<SlotSymbolName[]>(IDLE_REELS);
  const [reelsFrom, setReelsFrom] = useState<SlotSymbolName[]>(IDLE_REELS);
  const [spinId, setSpinId] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [outcome, setOutcome] = useState<SpinResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // The committed result, held back until the last reel stops (SRS-309.5).
  const committed = useRef<SpinResponse | null>(null);

  // SRS-306.5 / SRS-108.3: only signed-in players can play; guests log in first.
  useEffect(() => {
    const playerToken = localStorage.getItem('player_token');
    if (!playerToken) {
      router.replace('/login');
      return;
    }
    setToken(playerToken);

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

  // SRS-306.3: the selected bet must fit in the balance.
  const tooLittle = bet !== null && balance !== null && bet > balance;

  async function spin() {
    if (spinning || bet === null || tooLittle || !token) return; // SRS-307.4
    setSpinning(true);
    setMessage(null);
    setOutcome(null);

    try {
      // SRS-306.4: the bet sent here is the one this spin is settled with.
      const res = await fetch('/api/slots/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bet }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 401) {
        localStorage.removeItem('player_token');
        router.replace('/login');
        return;
      }
      if (typeof data?.balance === 'number' && !res.ok) setBalance(data.balance);
      if (!res.ok || !Array.isArray(data?.reels)) throw new Error(data?.error);
      committed.current = data as SpinResponse;
      setReelsFrom(reels);
      setReels(data.reels);
      setSpinId((id) => id + 1);
    } catch (err) {
      // SRS-307.5: nothing was taken, so only the message changes.
      setMessage(err instanceof Error && err.message ? err.message : 'The spin failed. Please try again.');
      setSpinning(false);
    }
  }

  // SRS-309.5: the balance and the outcome change when the last reel stops.
  function handleStopped() {
    const result = committed.current;
    if (!result) return;
    committed.current = null;
    setBalance(result.balance);
    notifyBalanceChanged();
    setOutcome(result);
    setSpinning(false);
  }

  return (
    <main className="min-h-page bg-[radial-gradient(ellipse_at_top,#4c0519_0%,#1c0510_55%,#0a0206_100%)] px-4 py-8 text-white">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-6">
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
          <SlotReels from={reelsFrom} reels={reels} spinId={spinId} onStopped={handleStopped} />
          <div aria-live="polite" className="mt-4 min-h-[2rem] text-center text-xl font-black">
            {spinning ? (
              <span className="text-amber-200">Spinning…</span>
            ) : outcome ? (
              outcome.payout > 0 ? (
                <span className="text-emerald-300">
                  You won {outcome.payout.toLocaleString()} coins! ({outcome.multiplier}× your bet)
                </span>
              ) : (
                <span className="text-rose-100/80">No win this time.</span>
              )
            ) : null}
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
                    disabled={spinning}
                    className={`flex h-16 w-16 items-center justify-center rounded-full border-4 border-dashed border-white/80 text-lg font-black shadow-lg transition ${
                      CHIP_STYLE[amount] ?? 'bg-slate-600'
                    } ${selected ? 'scale-110 ring-4 ring-amber-300 ring-offset-2 ring-offset-black' : 'opacity-80 hover:opacity-100'} disabled:cursor-not-allowed`}
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
          {!loadError && (
            <div className="mt-4 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={spin}
                disabled={spinning || bet === null || tooLittle}
                className="w-full max-w-xs rounded-full border-b-4 border-red-900 bg-gradient-to-b from-red-500 to-red-700 px-8 py-3 text-2xl font-black uppercase tracking-widest text-white shadow-lg shadow-red-900/50 transition hover:brightness-110 active:translate-y-0.5 active:border-b-2 disabled:cursor-not-allowed disabled:border-slate-700 disabled:from-slate-500 disabled:to-slate-600 disabled:text-slate-200"
              >
                {spinning ? 'Spinning…' : 'Spin'}
              </button>
              {tooLittle && !spinning && (
                <p className="text-sm text-red-300">You need at least {bet} coins to spin this bet. Choose a smaller bet.</p>
              )}
              {message && (
                <p role="alert" className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {message}
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
