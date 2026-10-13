'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { notifyBalanceChanged } from '../lib/balanceEvents';
import { DAILY_LOGIN_BOX_REWARDS, formatCountdown } from '../lib/dailyLoginBox';
import SlotReveal from './SlotReveal';

type BoxState =
  | { kind: 'loading' }
  | { kind: 'guest' }
  | { kind: 'available' }
  // readyAt is a browser-clock time, computed from the server's msRemaining.
  | { kind: 'cooldown'; readyAt: number };

const OPEN_FAILED = 'Could not open the Daily Login Box. Please try again.';

// The Daily Login Box card on the Cosmetic Shop page (UR-128). Its state
// always comes from the server, so after a refresh or a closed tab the page
// shows the saved cooldown rather than replaying a reveal (SRS-128.16,
// SRS-128.17, SRS-128.18).
export default function DailyLoginBox() {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<BoxState>({ kind: 'loading' });
  const [opening, setOpening] = useState(false);
  const [reward, setReward] = useState<number | null>(null);
  const [showSpin, setShowSpin] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const loadStatus = useCallback(async (playerToken: string) => {
    const res = await fetch('/api/daily-login-box', {
      headers: { Authorization: `Bearer ${playerToken}` },
    });
    if (res.status === 401) {
      setState({ kind: 'guest' });
      return;
    }
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Could not load the Daily Login Box.');
      return;
    }
    setNow(Date.now());
    setState(data.available ? { kind: 'available' } : { kind: 'cooldown', readyAt: Date.now() + data.msRemaining });
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('player_token');
    setToken(stored);
    if (!stored) {
      setState({ kind: 'guest' });
      return;
    }
    loadStatus(stored).catch(() => setError('Could not load the Daily Login Box.'));
  }, [loadStatus]);

  // SRS-128.13 / SRS-128.14: tick the countdown each second, then re-check
  // with the server when it reaches zero, without reloading the page.
  useEffect(() => {
    if (state.kind !== 'cooldown') return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= state.readyAt && token) {
        clearInterval(timer);
        loadStatus(token).catch(() => setError('Could not load the Daily Login Box.'));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [state, token, loadStatus]);

  async function handleOpen() {
    if (!token || opening) return;
    setOpening(true);
    setError('');
    setReward(null);
    try {
      const res = await fetch('/api/daily-login-box', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        // The reward is already saved (SRS-128.9) before the spin reveals it
        // (SRS-128.10), so leaving mid-spin loses nothing. The nav bar's
        // balance refreshes when the reels stop (onStopped below), about
        // 1.5 s from now, so it doesn't spoil the spin but still lands
        // inside SRS-NFR-104's 2 seconds.
        setNow(Date.now());
        setReward(data.reward);
        setShowSpin(true);
        setState({ kind: 'cooldown', readyAt: Date.now() + data.msRemaining });
      } else if (res.status === 409) {
        // Already opened elsewhere, e.g. in another tab (SRS-128.19).
        setNow(Date.now());
        setState({ kind: 'cooldown', readyAt: Date.now() + data.msRemaining });
        setError(data.error);
      } else if (res.status === 401) {
        setState({ kind: 'guest' });
      } else {
        // SRS-128.21: nothing was saved, so the box stays available.
        setError(data.error || OPEN_FAILED);
      }
    } catch {
      // The request may or may not have reached the server, so ask it.
      setError(OPEN_FAILED);
      loadStatus(token).catch(() => {});
    } finally {
      setOpening(false);
    }
  }

  return (
    <article className="rounded-3xl border border-amber-400/40 bg-slate-900/90 p-6 shadow-2xl shadow-black/30">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-amber-300">Free · Every 24 hours</p>
          <h2 className="mt-2 text-2xl font-semibold">Daily Login Box</h2>
          <p className="mt-1 text-sm text-slate-400">Open it for a random coin reward.</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          {state.kind === 'guest' ? (
            // SRS-128.20: guests have to log in first.
            <Link
              href="/login"
              className="rounded-xl bg-emerald-400 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
            >
              Log in to open
            </Link>
          ) : (
            <button
              type="button"
              onClick={handleOpen}
              disabled={state.kind !== 'available' || opening}
              className="rounded-xl bg-amber-400 px-6 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-400"
            >
              {state.kind === 'loading' ? 'Loading…' : opening ? 'Spinning…' : 'Spin'}
            </button>
          )}
          {state.kind === 'cooldown' ? (
            <p className="text-sm text-slate-400">
              Next box in <span className="font-mono text-slate-200">{formatCountdown(state.readyAt - now)}</span>
            </p>
          ) : null}
        </div>
      </div>

      {/* SRS-128.7: every possible reward and its chance, shown before opening. */}
      <ul className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {DAILY_LOGIN_BOX_REWARDS.map((option) => (
          <li
            key={option.amount}
            className={`rounded-xl border px-3 py-2 text-center ${
              reward === option.amount && !showSpin ? 'border-amber-400 bg-amber-400/10' : 'border-slate-800 bg-slate-950/60'
            }`}
          >
            <p className="font-semibold text-slate-100">{option.amount} coins</p>
            <p className="text-xs text-slate-400">{option.percent}% chance</p>
          </li>
        ))}
      </ul>

      {reward !== null && !showSpin ? (
        <p className="mt-4 text-sm text-slate-300">
          You won <span className="font-semibold text-amber-300">{reward} coins</span> today.
        </p>
      ) : null}

      {reward !== null && showSpin ? (
        <SlotReveal reward={reward} onStopped={notifyBalanceChanged} onClose={() => setShowSpin(false)} />
      ) : null}

      {error ? (
        <p className="mt-4 rounded-xl border border-red-800 bg-red-950/60 p-3 text-sm text-red-200">{error}</p>
      ) : null}
    </article>
  );
}
