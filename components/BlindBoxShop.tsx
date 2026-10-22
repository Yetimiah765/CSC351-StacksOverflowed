'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { notifyBalanceChanged } from '../lib/balanceEvents';
import type { Cosmetic } from '../lib/cosmetics';
import BlindBoxReveal, { type BoxResult } from './cosmetics/BlindBoxReveal';
import CosmeticArt from './cosmetics/CosmeticArt';

interface ShopBox {
  boxId: number;
  name: string;
  description: string;
  price: number;
  duplicateRefund: number;
  limited: boolean;
  availableUntil: string | null;
  // SRS-123.9: each regular item's chance and each holographic item's.
  chances: { regular: string | null; holographic: string | null };
  rewards: (Cosmetic & { owned: boolean })[];
}

const KIND: Record<Cosmetic['category'], string> = { Card: 'Card back', Chip: 'Chip', 'Profile Outline': 'Outline' };

const LOAD_FAILED = 'Could not load the blind boxes. Please refresh the page.';
const BUY_FAILED = 'Could not buy the box. You were not charged. Please try again.';

// A limited-time box's last full day, in the Eastern Time the windows use.
// available_until is the midnight it closes, so the last day is the one before.
function lastDay(availableUntil: string) {
  return new Date(Date.parse(availableUntil) - 1).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
}

// The blind boxes on the Cosmetic Shop page (UR-122 - UR-127): each box on
// sale with its description, price, odds and possible rewards (SRS-122.1,
// SRS-122.2, SRS-123.2), a confirmation before any coins are taken
// (SRS-124.1 - SRS-124.3), then the reveal. Guests can browse but must log
// in to buy.
export default function BlindBoxShop() {
  const [token, setToken] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<ShopBox[] | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState<ShopBox | null>(null);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState('');
  const [reveal, setReveal] = useState<{ box: ShopBox; result: BoxResult } | null>(null);

  const load = useCallback(async (playerToken: string | null) => {
    const headers: HeadersInit = playerToken ? { Authorization: `Bearer ${playerToken}` } : {};
    const res = await fetch('/api/shop/boxes', { headers });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || LOAD_FAILED);
      return;
    }
    setBoxes(data.boxes);
    setSignedIn(data.signedIn);
    if (data.signedIn) {
      const balanceRes = await fetch('/api/profile/balance', { headers });
      if (balanceRes.ok) setBalance((await balanceRes.json()).balance);
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('player_token');
    setToken(stored);
    load(stored).catch(() => setError(LOAD_FAILED));
  }, [load]);

  // Escape closes the confirmation without buying (SRS-124.2, SRS-124.3).
  useEffect(() => {
    if (!confirming) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !buying) setConfirming(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [confirming, buying]);

  async function handleBuy() {
    if (!confirming || !token || buying) return;
    const box = confirming;
    setBuying(true);
    setBuyError('');
    try {
      const res = await fetch('/api/shop/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ boxId: box.boxId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBuyError(data.error || BUY_FAILED);
        // The box closed or the balance changed elsewhere: show the shop as it is now.
        if (res.status === 409 || res.status === 400) load(token).catch(() => {});
        return;
      }
      setConfirming(null);
      setBalance(data.balance);
      setReveal({ box, result: { cosmetic: data.cosmetic, wasDuplicate: data.wasDuplicate, refund: data.refund } });
      // The new cosmetic now shows as owned in every box that has it.
      setBoxes((previous) =>
        previous?.map((b) => ({
          ...b,
          rewards: b.rewards.map((r) => (r.cosmeticId === data.cosmetic.cosmeticId ? { ...r, owned: true } : r)),
        })) ?? previous
      );
    } catch {
      setBuyError(BUY_FAILED);
    } finally {
      setBuying(false);
    }
  }

  if (error) {
    return <p className="rounded-xl border border-red-800 bg-red-900/30 p-3 text-sm text-red-300">{error}</p>;
  }
  if (!boxes) return <p className="text-sm text-slate-400">Loading blind boxes…</p>;

  return (
    <section aria-labelledby="blind-boxes-title" className="space-y-4">
      <div>
        <h2 id="blind-boxes-title" className="text-xl font-semibold">Blind boxes</h2>
        <p className="mt-1 text-sm text-slate-400">
          Each box gives you one cosmetic at random. Every regular item in a box is equally likely, and each box also
          has a rare holographic card and chip. If you already own the one you get, half the price comes back as coins.
        </p>
      </div>

      {boxes.length === 0 ? <p className="text-sm text-slate-400">No blind boxes are on sale right now.</p> : null}

      {boxes.map((box) => {
        const short = balance !== null && balance < box.price;
        return (
          <article key={box.boxId} className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl shadow-black/30">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold">{box.name}</h3>
                  {box.limited && box.availableUntil ? (
                    <span className="rounded-full bg-amber-400 px-2.5 py-0.5 text-xs font-semibold text-slate-950">
                      Limited time · last day {lastDay(box.availableUntil)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-slate-400">{box.description}</p>
              </div>
              <p className="shrink-0 text-2xl font-bold text-amber-300">
                {box.price.toLocaleString('en-US')} <span className="text-sm font-medium text-slate-400">coins</span>
              </p>
            </div>

            <p className="mt-2 text-xs text-slate-400">
              {box.rewards.filter((reward) => !reward.isHolographic).length} items · {box.chances.regular} each
              {box.chances.holographic ? (
                <>
                  {' · '}
                  <span className="bg-gradient-to-r from-pink-300 via-amber-200 to-cyan-300 bg-clip-text font-semibold text-transparent">
                    holographic
                  </span>{' '}
                  {box.chances.holographic} each
                </>
              ) : null}{' '}
              · a duplicate refunds {box.duplicateRefund.toLocaleString('en-US')} coins
            </p>

            <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-3">
              {box.rewards.map((reward) => (
                <li key={reward.cosmeticId} className="min-w-0">
                  <div
                    className={`relative flex h-28 items-center justify-center rounded-xl border bg-slate-950 p-2 ${
                      reward.isHolographic ? 'border-fuchsia-300/70 shadow-[0_0_14px_rgba(244,114,182,0.35)]' : 'border-slate-800'
                    }`}
                  >
                    <CosmeticArt artKey={reward.artKey} category={reward.category} />
                    {reward.owned ? (
                      <span className="absolute right-1.5 top-1.5 rounded-full bg-emerald-400 px-1.5 text-[10px] font-bold text-slate-950">
                        Owned
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-xs font-semibold text-slate-200" title={reward.name}>
                    {reward.name}
                  </p>
                  {/* SRS-123.9: each item's chance. */}
                  <p className="text-[11px] text-slate-500">
                    {reward.isHolographic ? (
                      <span className="bg-gradient-to-r from-pink-300 via-amber-200 to-cyan-300 bg-clip-text font-semibold text-transparent">Holographic</span>
                    ) : (
                      KIND[reward.category]
                    )}{' '}
                    · {(reward.isHolographic ? box.chances.holographic : box.chances.regular) ?? ''}
                  </p>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
              {signedIn ? (
                <>
                  {short ? (
                    <span className="text-sm text-slate-400">
                      You need {(box.price - (balance ?? 0)).toLocaleString('en-US')} more coins.
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setBuyError('');
                      setConfirming(box);
                    }}
                    disabled={short}
                    className="rounded-xl bg-emerald-400 px-5 py-2 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Buy for {box.price.toLocaleString('en-US')} coins
                  </button>
                </>
              ) : (
                <Link href="/login" className="rounded-xl border border-slate-700 px-5 py-2 text-sm font-semibold transition hover:border-emerald-400">
                  Log in to buy
                </Link>
              )}
            </div>
          </article>
        );
      })}

      {confirming ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-box-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-6 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-3xl border border-emerald-400/40 bg-slate-900 p-6 shadow-2xl shadow-black/50">
            <h2 id="confirm-box-title" className="text-xl font-semibold">
              Buy the {confirming.name}?
            </h2>
            <p className="mt-3 text-sm text-slate-300">
              {confirming.price.toLocaleString('en-US')} coins will come out of your balance
              {balance !== null ? ` (you have ${balance.toLocaleString('en-US')})` : ''}. You get one of its{' '}
              {confirming.rewards.length} items at random.
            </p>
            <p className="mt-2 text-sm text-slate-400">
              If it&apos;s one you already own, {confirming.duplicateRefund.toLocaleString('en-US')} coins come back.
            </p>
            {buyError ? (
              <p className="mt-4 rounded-xl border border-red-800 bg-red-950/60 p-3 text-sm text-red-200">{buyError}</p>
            ) : null}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                disabled={buying}
                className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-2 text-sm transition hover:border-slate-500 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBuy}
                disabled={buying}
                className="rounded-xl bg-emerald-400 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {buying ? 'Buying…' : `Buy for ${confirming.price.toLocaleString('en-US')} coins`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reveal ? (
        <BlindBoxReveal
          boxName={reveal.box.name}
          rewards={reveal.box.rewards}
          result={reveal.result}
          onStopped={notifyBalanceChanged}
          onClose={() => setReveal(null)}
        />
      ) : null}
    </section>
  );
}
