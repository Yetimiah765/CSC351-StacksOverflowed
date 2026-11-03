'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import BackToHome from '../../components/BackToHome';
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

  const won = !spinning && outcome !== null && outcome.payout > 0;
  // The marquee's bulbs chase faster while the reels spin and after a win.
  const bulbSpeed = spinning ? '0.5s' : won ? '0.35s' : '1.6s';

  return (
    <main className="relative min-h-page overflow-hidden bg-[#0c0207] px-4 py-6 text-white">
      {/* Blurred casino lights behind the machine. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(244,63,94,0.25),transparent_25%),radial-gradient(circle_at_85%_30%,rgba(250,204,21,0.18),transparent_22%),radial-gradient(circle_at_70%_85%,rgba(168,85,247,0.18),transparent_25%),radial-gradient(circle_at_25%_80%,rgba(59,130,246,0.15),transparent_22%),radial-gradient(ellipse_at_top,#4c0519_0%,transparent_60%)]"
      />

      <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-4">
        <BackToHome className="self-start" />

        <div className="relative w-full max-w-2xl">
          {/* Topper: the neon title, ringed by chasing bulbs. */}
          <div
            className="relative mx-6 rounded-t-[3rem] border-4 border-b-0 border-amber-400 bg-gradient-to-b from-rose-950 to-black px-6 pb-4 pt-6 text-center"
            style={{ '--bulb-speed': bulbSpeed } as CSSProperties}
          >
            <div aria-hidden className="absolute inset-x-6 top-2 flex justify-between">
              {Array.from({ length: 15 }, (_, i) => (
                <span
                  key={i}
                  className="slots-bulb h-2.5 w-2.5 rounded-full bg-amber-300"
                  style={{ animationDelay: `${(i % 5) * -0.32}s` }}
                />
              ))}
            </div>
            <h1 className="slots-neon text-4xl font-black uppercase italic tracking-wider text-rose-100 sm:text-5xl">
              Slot Machine
            </h1>
            <p className="mt-1 text-xs font-bold uppercase tracking-[0.4em] text-amber-300">★ Lucky Sevens ★</p>
          </div>

          {/* The cabinet body in its chrome-gold frame. */}
          <section
            aria-label="Slot machine"
            className={`rounded-[2rem] bg-gradient-to-b from-amber-200 via-amber-500 to-amber-700 p-1.5 ${won ? 'slots-win' : 'shadow-[0_0_40px_rgba(251,191,36,0.35)]'}`}
          >
            <div className="rounded-[1.7rem] bg-gradient-to-b from-rose-700 via-rose-800 to-rose-950 p-5 shadow-[inset_0_2px_0_rgba(255,255,255,0.25),inset_0_-8px_20px_rgba(0,0,0,0.5)]">
              <SlotReels from={reelsFrom} reels={reels} spinId={spinId} onStopped={handleStopped} />

              {/* Displays: credits (the balance), the bet, and the last win. */}
              <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
                <Led label="Credits" value={balance === null ? '…' : balance.toLocaleString()} />
                <Led label="Bet" value={bet === null ? '…' : String(bet)} />
                <Led label="Win" value={won ? outcome!.payout.toLocaleString() : '0'} tone={won ? 'win' : 'idle'} />
              </div>

              <div aria-live="polite" className="mt-3 min-h-[1.75rem] text-center text-lg font-black">
                {spinning ? (
                  <span className="text-amber-200">Good luck…</span>
                ) : outcome ? (
                  outcome.payout > 0 ? (
                    <span className="text-emerald-300">
                      You won {outcome.payout.toLocaleString()} coins! ({outcome.multiplier}× your bet)
                    </span>
                  ) : (
                    <span className="text-rose-100/80">No win this time.</span>
                  )
                ) : (
                  <span className="text-rose-100/70">Line up three of a kind on the payline.</span>
                )}
              </div>
            </div>
          </section>

          {/* The button deck, tilted towards the player like a real machine's. */}
          <div className="relative mx-3 -mt-1 rounded-b-[1.5rem] border-x-4 border-b-4 border-amber-600 bg-gradient-to-b from-zinc-800 to-zinc-950 px-4 pb-5 pt-4 shadow-[0_18px_30px_rgba(0,0,0,0.6)]">
            {/* SRS-306.1: choose the bet before spinning. */}
            {loadError ? (
              <p role="alert" className="text-center text-sm text-red-300">
                {loadError}
              </p>
            ) : (
              <>
                <p className="mb-2 text-center text-[0.65rem] font-bold uppercase tracking-[0.3em] text-amber-200/80">
                  Choose your bet
                </p>
                <div role="radiogroup" aria-label="Bet amount" className="flex flex-wrap justify-center gap-2 sm:gap-3">
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
                        className={`flex h-14 w-14 items-center justify-center rounded-full border-4 border-dashed border-white/80 text-base font-black shadow-[0_4px_0_rgba(0,0,0,0.6)] transition sm:h-16 sm:w-16 sm:text-lg ${
                          CHIP_STYLE[amount] ?? 'bg-slate-600'
                        } ${selected ? '-translate-y-1 ring-4 ring-amber-300 ring-offset-2 ring-offset-zinc-900' : 'opacity-75 hover:opacity-100'} disabled:cursor-not-allowed`}
                      >
                        {amount}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={spin}
                    disabled={spinning || bet === null || tooLittle}
                    className="w-full max-w-xs rounded-full border-b-[6px] border-red-900 bg-gradient-to-b from-red-400 via-red-600 to-red-700 px-8 py-3 text-2xl font-black uppercase tracking-[0.3em] text-white shadow-[0_0_24px_rgba(239,68,68,0.55)] transition hover:brightness-110 active:translate-y-1 active:border-b-2 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:from-zinc-500 disabled:via-zinc-600 disabled:to-zinc-700 disabled:text-zinc-200 disabled:shadow-none"
                  >
                    {spinning ? 'Spinning…' : 'Spin'}
                  </button>
                  {tooLittle && !spinning && (
                    <p className="text-center text-sm text-red-300">
                      You need at least {bet} coins to spin this bet. Choose a smaller bet.
                    </p>
                  )}
                  {message && (
                    <p role="alert" className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                      {message}
                    </p>
                  )}
                </div>
              </>
            )}

            {/* The coin tray; a win drops coins into it. */}
            <div className="relative mx-auto mt-5 h-12 w-3/4 overflow-hidden rounded-b-2xl rounded-t-md border-2 border-zinc-600 bg-gradient-to-b from-black to-zinc-900 shadow-[inset_0_6px_12px_rgba(0,0,0,0.9)]">
              {won &&
                Array.from({ length: 9 }, (_, i) => (
                  <span
                    key={`${spinId}-${i}`}
                    aria-hidden
                    className="slots-coin absolute bottom-1 h-5 w-5 rounded-full border-2 border-amber-700 bg-gradient-to-br from-yellow-200 to-amber-500"
                    style={{ left: `${10 + i * 9}%`, animationDelay: `${i * 80}ms` }}
                  />
                ))}
            </div>
          </div>

          {/* The lever on the side: pulling it spins, the same as the Spin button. */}
          <div aria-hidden className="absolute -right-10 top-40 hidden h-56 w-10 [perspective:400px] sm:block">
            <div className="absolute bottom-0 left-0 h-16 w-6 rounded-r-lg bg-gradient-to-r from-zinc-500 via-zinc-300 to-zinc-600 shadow-lg" />
            <button
              type="button"
              tabIndex={-1}
              onClick={spin}
              disabled={spinning || bet === null || tooLittle || loadError !== null}
              key={spinId}
              className={`absolute bottom-12 left-1 h-44 w-4 origin-bottom disabled:cursor-not-allowed ${spinId > 0 ? 'slots-lever-pull' : ''}`}
            >
              <span className="absolute inset-x-1 bottom-0 top-6 rounded-full bg-gradient-to-r from-zinc-500 via-zinc-100 to-zinc-500" />
              <span className="absolute -left-2 top-0 h-8 w-8 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fecaca,#dc2626_45%,#7f1d1d)] shadow-[0_4px_10px_rgba(0,0,0,0.6)]" />
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

/** One of the machine's LED displays. */
function Led({ label, value, tone = 'idle' }: { label: string; value: string; tone?: 'idle' | 'win' }) {
  return (
    <div className="rounded-lg border-2 border-zinc-700 bg-black px-2 py-1.5 text-center shadow-[inset_0_2px_8px_rgba(0,0,0,0.9)]">
      <div className="text-[0.6rem] font-bold uppercase tracking-[0.25em] text-amber-200/70">{label}</div>
      <div
        className={`font-mono text-lg font-bold tabular-nums sm:text-2xl ${
          tone === 'win' ? 'text-emerald-300 [text-shadow:0_0_10px_#34d399]' : 'text-amber-300 [text-shadow:0_0_8px_#f59e0b]'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
