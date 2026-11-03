'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import BackToHome from '../../components/BackToHome';
import RouletteWheel from '../../components/roulette/RouletteWheel';
import SpinResultBanner from '../../components/roulette/SpinResultBanner';
import { notifyBalanceChanged } from '../../lib/balanceEvents';
import { spinButtonLabel, spinOutcome } from '../../lib/roulette/result';
import {
  CHIP_VALUES,
  MAX_TOTAL_BET,
  betsAfterSpin,
  removeChip,
  pocketColor,
  spotKey,
  spotLabel,
  spotWins,
  type BetSpot,
  type OutsideBetType,
  type PocketColor,
  type TableBet,
} from '../../lib/roulette/bets';

type PendingBet = TableBet;

interface SettledBet {
  spot: BetSpot;
  amount: number;
  returned: number;
}

// What POST /api/roulette/spin returns once the spin is committed.
interface SpinResponse {
  number: number;
  staked: number;
  returned: number;
  balance: number;
  bets: { type: string; number: number | null; amount: number; payout: number }[];
}

interface SpinOutcome {
  number: number;
  bets: SettledBet[];
  staked: number;
  returned: number;
}

const POCKET_BG: Record<PocketColor, string> = {
  green: 'bg-emerald-600',
  red: 'bg-red-700',
  black: 'bg-slate-950',
};

const CHIP_STYLE: Record<number, string> = {
  5: 'bg-red-600',
  10: 'bg-blue-600',
  25: 'bg-emerald-600',
  50: 'bg-orange-500',
  100: 'bg-neutral-700',
};

function chipColor(amount: number): string {
  const top = [...CHIP_VALUES].reverse().find((value) => amount >= value) ?? 5;
  return CHIP_STYLE[top];
}

// SRS-301.9: 0 on the left, then 1–36 in twelve groups of three so each line
// of twelve holds one column bet's numbers, with the column, dozen, and
// even-money spots around them.
function numberCell(n: number): CSSProperties {
  return { gridColumn: Math.ceil(n / 3) + 1, gridRow: 3 - ((n - 1) % 3) };
}

const COLUMN_SPOTS: { type: OutsideBetType; row: number }[] = [
  { type: 'Column3', row: 1 },
  { type: 'Column2', row: 2 },
  { type: 'Column1', row: 3 },
];

const DOZEN_SPOTS: { type: OutsideBetType; label: string; col: string }[] = [
  { type: 'Dozen1', label: '1st 12', col: '2 / 6' },
  { type: 'Dozen2', label: '2nd 12', col: '6 / 10' },
  { type: 'Dozen3', label: '3rd 12', col: '10 / 14' },
];

const EVEN_MONEY_SPOTS: { type: OutsideBetType; label: string; col: string }[] = [
  { type: 'Low', label: '1–18', col: '2 / 4' },
  { type: 'Even', label: 'EVEN', col: '4 / 6' },
  { type: 'Red', label: '', col: '6 / 8' },
  { type: 'Black', label: '', col: '8 / 10' },
  { type: 'Odd', label: 'ODD', col: '10 / 12' },
  { type: 'High', label: '19–36', col: '12 / 14' },
];

export default function RoulettePage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [selectedChip, setSelectedChip] = useState<number>(CHIP_VALUES[0]);
  const [bets, setBets] = useState<Record<string, PendingBet>>({});
  const [placements, setPlacements] = useState<{ key: string; amount: number }[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [spinId, setSpinId] = useState(0);
  const [target, setTarget] = useState<number | null>(null);
  const [lastSpin, setLastSpin] = useState<SpinOutcome | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  // Counts results shown, so each one replays the win or loss animation.
  const [resultCount, setResultCount] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  // The committed result, held back until the wheel stops (SRS-304.2).
  const committed = useRef<SpinResponse | null>(null);
  // Whether the spin in progress was started with Let it ride (SRS-305.4).
  const rideRef = useRef(false);

  // SRS-301.10 / SRS-108.3: only signed-in players can play; guests log in first.
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
  }, [router]);

  const pending = Object.values(bets);
  const totalBet = pending.reduce((sum, bet) => sum + bet.amount, 0);
  // SRS-301.8: pending bets aren't deducted, so show what's left to bet with.
  const available = balance === null ? null : balance - totalBet;

  function placeChip(spot: BetSpot) {
    if (spinning) return; // SRS-301.2
    if (totalBet + selectedChip > MAX_TOTAL_BET) {
      setMessage(`The most you can bet on one spin is ${MAX_TOTAL_BET} coins.`); // SRS-301.6
      return;
    }
    if (balance !== null && totalBet + selectedChip > balance) {
      setMessage("You don't have enough coins for that bet."); // SRS-301.7
      return;
    }
    const key = spotKey(spot);
    setMessage(null);
    setBets((prev) => ({
      ...prev,
      [key]: { spot, amount: (prev[key]?.amount ?? 0) + selectedChip, riding: prev[key]?.riding ?? 0 },
    }));
    setPlacements((prev) => [...prev, { key, amount: selectedChip }]);
  }

  function undo() {
    const last = placements[placements.length - 1];
    if (spinning || !last) return;
    setPlacements((prev) => prev.slice(0, -1));
    setBets((prev) => {
      const next = { ...prev };
      const left = removeChip(next[last.key], last.amount);
      if (left) next[last.key] = left;
      else delete next[last.key];
      return next;
    });
    setMessage(null);
  }

  // SRS-305.1: nothing was deducted for pending bets, so clearing moves no coins.
  function clearBets() {
    if (spinning) return; // SRS-305.2
    setBets({});
    setPlacements([]);
    setMessage(null);
  }

  async function spin(letItRide: boolean) {
    if (spinning || pending.length === 0 || !token) return; // SRS-302.4, SRS-302.5
    rideRef.current = letItRide;
    setSpinning(true);
    setMessage(null);

    try {
      const res = await fetch('/api/roulette/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          bets: pending.map(({ spot, amount }) => ({ ...spot, amount })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 401) {
        localStorage.removeItem('player_token');
        router.replace('/login');
        return;
      }
      if (typeof data?.balance === 'number' && !res.ok) setBalance(data.balance);
      if (!res.ok || typeof data?.number !== 'number') throw new Error(data?.error);
      committed.current = data as SpinResponse;
      setTarget(data.number);
      setSpinId((id) => id + 1);
    } catch (err) {
      // SRS-302.6: the bets stay on the table and nothing changes.
      setMessage(err instanceof Error && err.message ? err.message : 'The spin failed. Please try again.');
      setSpinning(false);
    }
  }

  // SRS-303.1–303.2, SRS-304.2: the result, each bet's outcome, and the new
  // balance appear together when the wheel stops, not when the reply arrives.
  function handleStopped() {
    const result = committed.current;
    if (!result) return;
    committed.current = null;
    setLastSpin({
      number: result.number,
      bets: result.bets.map(({ type, number, amount, payout }) => ({
        spot: type === 'Number' ? { type: 'Number', number: number! } : { type: type as OutsideBetType },
        amount,
        returned: payout,
      })),
      staked: result.staked,
      returned: result.returned,
    });
    setBalance(result.balance);
    notifyBalanceChanged();
    setHistory((prev) => [result.number, ...prev].slice(0, 12));
    setResultCount((count) => count + 1);
    // SRS-305.3 / SRS-305.4: settled bets leave the table, except riding
    // ones, which stay until the player clears them.
    const kept = betsAfterSpin(bets, rideRef.current);
    setBets(kept);
    // Each kept bet comes off in one Undo.
    setPlacements(Object.entries(kept).map(([key, bet]) => ({ key, amount: bet.amount })));
    const keptTotal = Object.values(kept).reduce((sum, bet) => sum + bet.amount, 0);
    if (keptTotal > result.balance) {
      setMessage('Your riding bets are now more than your balance. Remove some or clear them to spin again.'); // SRS-301.7
    }
    setSpinning(false);
  }

  function spotProps(spot: BetSpot) {
    return {
      spot,
      amount: bets[spotKey(spot)]?.amount ?? 0,
      riding: bets[spotKey(spot)]?.riding ?? 0,
      won: !spinning && lastSpin !== null && spotWins(spot, lastSpin.number),
      disabled: spinning,
      onPlace: placeChip,
    };
  }

  const net = lastSpin ? lastSpin.returned - lastSpin.staked : 0;
  const outcome = lastSpin ? spinOutcome(lastSpin.staked, lastSpin.returned) : null;

  return (
    <main className="min-h-page bg-[radial-gradient(ellipse_at_top,_#064e3b_0%,_#020617_60%)] px-4 py-8 text-slate-100">
      <div className="mx-auto w-full max-w-6xl">
        <BackToHome className="mb-4" />
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Roulette</h1>
            <p className="text-sm text-emerald-200/70">European wheel · single zero · bets up to {MAX_TOTAL_BET} coins a spin</p>
          </div>
          <div className="flex gap-3 text-sm">
            <Stat label="Available" value={available === null ? '—' : available.toLocaleString()} />
            <Stat label="Total bet" value={totalBet.toLocaleString()} highlight={totalBet > 0} />
          </div>
        </header>

        <div className="mt-6 grid gap-8 lg:grid-cols-[20rem_1fr]">
          {/* Wheel and result */}
          <section className="flex flex-col gap-5">
            {/* SRS-303.5: the win or loss animation plays over the wheel once it zooms back out. */}
            <div className="relative">
              <RouletteWheel target={target} spinId={spinId} onStopped={handleStopped} />
              <SpinResultBanner spinKey={resultCount} mood={outcome?.mood ?? null} amount={outcome?.amount ?? 0} />
            </div>

            <div
              key={resultCount}
              className={`rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-center ${
                !spinning && outcome?.mood === 'win' ? 'roulette-card-win' : ''
              } ${!spinning && outcome?.mood === 'loss' ? 'roulette-card-loss' : ''}`}
            >
              {spinning ? (
                <p className="py-3 text-lg font-semibold text-amber-200">No more bets…</p>
              ) : lastSpin ? (
                <div className="flex items-center justify-center gap-4">
                  <span
                    className={`flex h-16 w-16 items-center justify-center rounded-full border-4 border-yellow-300 text-2xl font-bold ${
                      POCKET_BG[pocketColor(lastSpin.number)]
                    }`}
                  >
                    {lastSpin.number}
                  </span>
                  <div className="text-left">
                    <p className="text-sm capitalize text-slate-300">{pocketColor(lastSpin.number)}</p>
                    <p className={`text-xl font-bold ${net > 0 ? 'text-emerald-300' : net < 0 ? 'text-red-300' : 'text-slate-200'}`}>
                      {outcome?.mood === 'win'
                        ? `Won ${outcome.amount.toLocaleString()} coins`
                        : outcome?.mood === 'loss'
                          ? `Lost ${outcome.amount.toLocaleString()} coins`
                          : 'Broke even'}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="py-3 text-slate-300">Place your bets, then spin.</p>
              )}
            </div>

            {history.length > 0 && (
              <div>
                <p className="mb-2 text-xs uppercase tracking-wider text-slate-400">Recent numbers</p>
                <div className="flex flex-wrap gap-1.5">
                  {history.map((n, i) => (
                    <span
                      key={i}
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${POCKET_BG[pocketColor(n)]} ${
                        i === 0 ? 'ring-2 ring-yellow-300' : 'opacity-80'
                      }`}
                    >
                      {n}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Betting table and controls */}
          <section className="flex min-w-0 flex-col gap-5">
            <div className="overflow-x-auto rounded-3xl border-[10px] border-amber-900 bg-emerald-800 p-4 shadow-2xl shadow-black/60">
              <div className="grid min-w-[44rem] grid-cols-[3.25rem_repeat(12,minmax(0,1fr))_3.75rem] grid-rows-[repeat(3,3.5rem)_3rem_3rem]">
                <Spot {...spotProps({ type: 'Number', number: 0 })} style={{ gridColumn: 1, gridRow: '1 / 4' }} className="rounded-l-full bg-emerald-600 text-xl">
                  0
                </Spot>

                {Array.from({ length: 36 }, (_, i) => i + 1).map((n) => (
                  <Spot key={n} {...spotProps({ type: 'Number', number: n })} style={numberCell(n)} className={`${POCKET_BG[pocketColor(n)]} text-lg`}>
                    {n}
                  </Spot>
                ))}

                {COLUMN_SPOTS.map(({ type, row }) => (
                  <Spot key={type} {...spotProps({ type })} style={{ gridColumn: 14, gridRow: row }} className="bg-emerald-800 text-xs">
                    2 to 1
                  </Spot>
                ))}

                {DOZEN_SPOTS.map(({ type, label, col }) => (
                  <Spot key={type} {...spotProps({ type })} style={{ gridColumn: col, gridRow: 4 }} className="bg-emerald-800 text-sm tracking-wide">
                    {label}
                  </Spot>
                ))}

                {EVEN_MONEY_SPOTS.map(({ type, label, col }) => (
                  <Spot key={type} {...spotProps({ type })} style={{ gridColumn: col, gridRow: 5 }} className="bg-emerald-800 text-sm tracking-wide">
                    {type === 'Red' || type === 'Black' ? (
                      <span
                        className={`h-6 w-6 rotate-45 border border-white/70 ${type === 'Red' ? 'bg-red-700' : 'bg-slate-950'}`}
                        aria-hidden
                      />
                    ) : (
                      label
                    )}
                  </Spot>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <div className="flex items-center gap-2" role="radiogroup" aria-label="Chip value">
                {CHIP_VALUES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selectedChip === value}
                    disabled={spinning}
                    onClick={() => setSelectedChip(value)}
                    className={`flex h-12 w-12 items-center justify-center rounded-full border-4 border-dashed border-white/80 text-sm font-bold shadow-lg transition disabled:opacity-50 ${
                      CHIP_STYLE[value]
                    } ${selectedChip === value ? '-translate-y-1 ring-4 ring-yellow-300' : 'opacity-80 hover:opacity-100'}`}
                  >
                    {value}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={undo}
                  disabled={spinning || placements.length === 0}
                  className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-40"
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={clearBets}
                  disabled={spinning || pending.length === 0}
                  className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-40"
                >
                  Clear Bets
                </button>
                {/* SRS-305.4: spin and keep these bets on the table afterwards. */}
                <button
                  type="button"
                  onClick={() => spin(true)}
                  disabled={spinning || pending.length === 0}
                  title="Spin, then keep the same bets on the table until you clear them"
                  className="rounded-lg border-2 border-emerald-400 bg-emerald-600/80 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:border-dashed disabled:border-emerald-400/70 disabled:bg-transparent disabled:text-emerald-200 disabled:shadow-none"
                >
                  Let it ride
                </button>
                <button
                  type="button"
                  onClick={() => spin(false)}
                  disabled={spinning || pending.length === 0}
                  // SRS-302.4: disabled with no bets, but it says why instead of only fading out.
                  className={`min-w-[11rem] rounded-lg border-2 px-8 py-2 text-base font-black uppercase tracking-wide transition ${
                    spinning
                      ? 'cursor-wait border-amber-400 bg-amber-900/60 text-amber-200'
                      : pending.length === 0
                        ? 'cursor-not-allowed border-dashed border-amber-400/80 bg-slate-950/60 text-amber-200'
                        : 'roulette-spin-ready border-yellow-200 bg-gradient-to-b from-yellow-300 to-amber-500 text-amber-950 shadow-lg shadow-amber-500/40 hover:brightness-110'
                  }`}
                >
                  {spinButtonLabel(spinning, pending.length > 0)}
                </button>
              </div>
            </div>

            {message && (
              <p role="alert" className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {message}
              </p>
            )}

            {lastSpin && !spinning && (
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                <p className="mb-2 text-sm font-semibold text-slate-300">Last spin</p>
                <ul className="divide-y divide-white/5 text-sm">
                  {lastSpin.bets.map((bet) => (
                    <li key={spotKey(bet.spot)} className="flex justify-between py-1.5">
                      <span>
                        {spotLabel(bet.spot)} <span className="text-slate-400">· {bet.amount}</span>
                      </span>
                      {bet.returned > 0 ? (
                        <span className="font-semibold text-emerald-300">Won {bet.returned}</span>
                      ) : (
                        <span className="text-slate-400">Lost</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function Spot({
  spot,
  amount,
  riding,
  won,
  disabled,
  onPlace,
  style,
  className,
  children,
}: {
  spot: BetSpot;
  amount: number;
  riding: number;
  won: boolean;
  disabled: boolean;
  onPlace: (spot: BetSpot) => void;
  style: CSSProperties;
  className: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onPlace(spot)}
      disabled={disabled}
      style={style}
      aria-label={`${spotLabel(spot)}${amount ? `, ${amount} coins bet` : ''}${riding ? `, ${riding} riding` : ''}`}
      className={`relative flex items-center justify-center border border-white/50 font-semibold text-white transition hover:brightness-125 disabled:cursor-not-allowed ${className} ${
        won ? 'z-10 ring-4 ring-inset ring-yellow-300' : ''
      }`}
    >
      {children}
      {amount > 0 && (
        <span
          className={`absolute left-1/2 top-1/2 z-20 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-dashed border-white/80 text-[0.65rem] font-bold shadow-lg shadow-black/60 ${chipColor(
            amount
          )}`}
        >
          {amount}
          {/* SRS-305.4: riding bets are marked, since they stay after the spin. */}
          {riding > 0 && (
            <span
              aria-hidden
              title={`${riding} riding`}
              className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-emerald-500 text-[0.6rem] font-black leading-none text-white"
            >
              ↻
            </span>
          )}
        </span>
      )}
    </button>
  );
}

function Stat({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2">
      <p className="text-[0.65rem] uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`text-lg font-bold ${highlight ? 'text-yellow-300' : 'text-slate-100'}`}>{value}</p>
    </div>
  );
}
