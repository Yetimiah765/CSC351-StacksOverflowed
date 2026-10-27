'use client';

// The acting player's controls at a poker table (app/poker/[tableId]/page.tsx):
// fold, check or call, and bet or raise with an amount. What's offered and
// the allowed bet/raise range come from getBettingOptions() in
// lib/pokerTable.ts — the same rules the server enforces — so the buttons
// match what the server will accept (SRS-15.1-15.8).

import { useState } from 'react';
import type { BettingMove, BettingOptions } from '../../lib/pokerTable';

interface BettingControlsProps {
  options: BettingOptions;
  /** Everything in the middle so far: collected pots plus this round's bets. */
  potTotal: number;
  /** This player's round contribution so far. */
  seatBet: number;
  disabled: boolean;
  onAct: (move: BettingMove, amount?: number) => void;
}

export default function BettingControls({ options, potTotal, seatBet, disabled, onAct }: BettingControlsProps) {
  const { canCheck, callAmount, aggressive, minTo, maxTo } = options;
  // Bet/raise-to amount, as typed. Starts at the minimum; the page remounts
  // this component (via `key`) whenever the turn or the bet to match changes.
  const [amountText, setAmountText] = useState(String(minTo));

  const parsedAmount = /^\d+$/.test(amountText) ? Number(amountText) : null;
  const amountValid = parsedAmount !== null && parsedAmount >= minTo && parsedAmount <= maxTo;
  const isAllIn = parsedAmount === maxTo;
  const verb = aggressive === 'bet' ? 'Bet' : 'Raise to';

  // A pot-sized raise: call first, then raise by the size of the pot after
  // that call. Clamped into the legal range.
  function potFraction(fraction: number): number {
    const raiseBy = Math.round(fraction * (potTotal + callAmount));
    return Math.min(maxTo, Math.max(minTo, seatBet + callAmount + raiseBy));
  }

  const quickAmounts =
    minTo === maxTo
      ? []
      : [
          { label: 'Min', amount: minTo },
          { label: '½ Pot', amount: potFraction(0.5) },
          { label: 'Pot', amount: potFraction(1) },
          { label: 'All-in', amount: maxTo },
        ];

  const rangeText = minTo === maxTo ? `All-in only: ${maxTo}` : `${minTo}–${maxTo}`;

  // One row on a wide screen: Fold, Check/Call, then the amount (typed or
  // slid, with shortcuts) and Bet/Raise; stacked on a narrow one.
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="grid grid-cols-2 gap-2 lg:flex lg:shrink-0">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAct('fold')}
          className="rounded-xl border border-red-400/40 bg-red-500/10 px-5 py-3 font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50 lg:w-20"
        >
          Fold
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAct(canCheck ? 'check' : 'call')}
          className="rounded-xl bg-sky-500 px-5 py-3 font-semibold text-slate-950 shadow-lg shadow-sky-500/20 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50 lg:min-w-[7rem]"
        >
          {canCheck ? 'Check' : `Call ${callAmount}`}
        </button>
      </div>

      {aggressive ? (
        <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-2xl border border-white/5 bg-black/25 p-3">
          <div className="flex items-center gap-3">
            <label htmlFor="raise-amount" className="sr-only">
              {aggressive === 'bet' ? 'Bet amount' : 'Raise to'}
            </label>
            <input
              id="raise-amount"
              inputMode="numeric"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value.trim())}
              onBlur={() => {
                if (parsedAmount === null) setAmountText(String(minTo));
              }}
              className="w-24 shrink-0 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-lg font-semibold tabular-nums text-amber-200 outline-none transition focus:border-amber-300"
            />
            {minTo < maxTo ? (
              <input
                type="range"
                aria-label={aggressive === 'bet' ? 'Bet amount' : 'Raise to'}
                min={minTo}
                max={maxTo}
                value={Math.min(Math.max(parsedAmount ?? minTo, minTo), maxTo)}
                onChange={(e) => setAmountText(e.target.value)}
                className="min-w-[5rem] flex-1 accent-amber-300"
              />
            ) : (
              <span className="flex-1" />
            )}
            <button
              type="button"
              disabled={disabled || !amountValid}
              onClick={() => onAct(aggressive, parsedAmount as number)}
              className="shrink-0 rounded-xl bg-amber-400 px-5 py-2.5 font-semibold text-slate-950 shadow-lg shadow-amber-500/25 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
            >
              {amountValid ? (isAllIn ? `All-in ${parsedAmount}` : `${verb} ${parsedAmount}`) : verb}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {quickAmounts.map(({ label, amount }) => (
              <button
                key={label}
                type="button"
                onClick={() => setAmountText(String(amount))}
                className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-300 transition hover:border-amber-300/70"
              >
                {label}
              </button>
            ))}
            <span className="ml-auto text-xs tabular-nums text-slate-500">{rangeText}</span>
          </div>
          {amountText && !amountValid ? (
            // SRS-15.10: say what range is allowed.
            <p className="text-sm text-red-300">
              {minTo === maxTo
                ? `You can only go all-in for ${maxTo}.`
                : `${aggressive === 'bet' ? 'Bet' : 'Raise to'} between ${minTo} and ${maxTo}.`}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="self-center text-sm text-slate-500">You can only call or fold here.</p>
      )}
    </div>
  );
}
