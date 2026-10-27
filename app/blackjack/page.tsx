"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { BALANCE_CHANGED_EVENT, notifyBalanceChanged } from "../../lib/balanceEvents";
import {
  BLACKJACK_CHIPS,
  MIN_BLACKJACK_BET,
  chipsFor,
  nearestChipBet,
  type BlackjackHandView,
  type BlackjackMove,
} from "../../lib/blackjack";

// The blackjack room (SRS-901 - SRS-908). The server deals and plays every
// hand (app/api/blackjack/), so this page only sends the bet and the
// player's moves and draws what comes back: the dealer's face-down card and
// the deck never reach the browser. A refresh picks up the hand in play from
// GET /api/blackjack (until the server restarts — hands live in its memory).
// The AI assistant is still a placeholder.
// Styled to match the home page and the poker table (slate panels, emerald
// accents, wood-rail felt). The coin balance lives in the nav bar, so it
// isn't repeated here.

const CHIP_STYLES: Record<number, { color: string; ring: string }> = {
  10: { color: "bg-sky-500", ring: "border-sky-200" },
  25: { color: "bg-emerald-500", ring: "border-emerald-200" },
  50: { color: "bg-red-500", ring: "border-red-200" },
  100: { color: "bg-slate-800", ring: "border-slate-300" },
};

const MOVES: { move: BlackjackMove; label: string; hint: string }[] = [
  { move: "hit", label: "Hit", hint: "H" },
  { move: "stand", label: "Stand", hint: "S" },
];

const SUITS: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

/**
 * SRS-910.5: an "i" button whose explanation shows on hover, on keyboard
 * focus, or on tap (a tap focuses it), and hides again on Escape or when
 * focus moves away. It never performs the move it explains.
 */
function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <span className="group relative flex">
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        onKeyDown={(event) => {
          if (event.key === "Escape") event.currentTarget.blur();
        }}
        className="flex w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:border-emerald-300/60 hover:text-emerald-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true" className="h-5 w-5">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" strokeLinecap="round" />
          <circle cx="12" cy="7.75" r="0.6" fill="currentColor" />
        </svg>
      </button>
      <span
        role="tooltip"
        id={id}
        className="pointer-events-none absolute bottom-full right-0 z-30 mb-2 hidden w-64 rounded-xl border border-white/10 bg-slate-950 p-3 text-left text-xs leading-relaxed text-slate-300 shadow-xl shadow-black/50 group-hover:block group-focus-within:block"
      >
        {children}
      </span>
    </span>
  );
}

/** 'Td' → { rank: '10', suit: '♦' }; null is the face-down card. */
function PlayingCard({ code, index }: { code: string | null; index: number }) {
  const tilt = index % 2 === 0 ? "-rotate-3" : "rotate-3";

  if (code === null) {
    return (
      <div
        className={`${tilt} relative h-28 w-20 rounded-xl border border-white/20 bg-emerald-950 p-1.5 shadow-[0_10px_25px_rgba(0,0,0,0.55)]`}
        aria-label="Face-down card"
      >
        <div className="h-full w-full rounded-lg border border-emerald-300/30 bg-[repeating-linear-gradient(45deg,_#065f46_0px,_#065f46_6px,_#064e3b_6px,_#064e3b_12px)]" />
      </div>
    );
  }

  const rank = code[0] === "T" ? "10" : (code[0] as string);
  const suit = SUITS[code[1] as string] ?? "";
  const red = suit === "♥" || suit === "♦";

  return (
    <div
      className={`${tilt} relative h-28 w-20 rounded-xl bg-white shadow-[0_10px_25px_rgba(0,0,0,0.55)] ${
        red ? "text-red-600" : "text-slate-900"
      }`}
      aria-label={`${rank} of ${suit}`}
    >
      <div className="absolute left-1.5 top-1 flex flex-col items-center leading-none">
        <span className="text-base font-bold">{rank}</span>
        <span className="text-sm">{suit}</span>
      </div>
      <div className="absolute inset-0 flex items-center justify-center text-4xl">{suit}</div>
      <div className="absolute bottom-1 right-1.5 flex rotate-180 flex-col items-center leading-none">
        <span className="text-base font-bold">{rank}</span>
        <span className="text-sm">{suit}</span>
      </div>
    </div>
  );
}

function Hand({ cards }: { cards: (string | null)[] }) {
  return (
    <div className="flex justify-center -space-x-6">
      {cards.map((code, index) => (
        <PlayingCard key={`${index}-${code ?? "down"}`} code={code} index={index} />
      ))}
    </div>
  );
}

function HandLabel({ name, value, bust }: { name: string; value: number; bust?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-100/70">{name}</span>
      <span
        className={`rounded-full bg-black/40 px-2.5 py-0.5 text-sm font-bold tabular-nums shadow-inner shadow-black/40 ${
          bust ? "text-red-300" : "text-amber-200"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function Chip({ value, small }: { value: number; small?: boolean }) {
  const style = CHIP_STYLES[value] ?? CHIP_STYLES[10]!;
  return (
    <span
      className={`flex items-center justify-center rounded-full ${style.color} shadow-[0_3px_8px_rgba(0,0,0,0.5)] ${
        small ? "h-10 w-10" : "h-12 w-12"
      }`}
    >
      <span
        className={`flex h-[78%] w-[78%] items-center justify-center rounded-full border-2 border-dashed ${style.ring} text-xs font-bold text-white`}
      >
        {value}
      </span>
    </span>
  );
}

const WIN_TONE = "border-emerald-300/50 bg-emerald-400/15 text-emerald-200";
const EVEN_TONE = "border-white/20 bg-white/10 text-slate-200";
const LOSS_TONE = "border-red-300/40 bg-red-500/15 text-red-200";

/**
 * The result line shown on the felt once the round is over (SRS-907.1): the
 * hand's result, or after a split the two hands' combined coins.
 */
function describeResult(round: BlackjackHandView): { text: string; tone: string } {
  const net = round.net ?? 0;
  const amount = Math.abs(net).toLocaleString();
  const only = round.hands.length === 1 ? round.hands[0] : null;
  if (net > 0) return { text: only?.blackjack ? `Blackjack! +${amount}` : `You win +${amount}`, tone: WIN_TONE };
  if (net === 0) return { text: only ? "Push — your bet is returned" : "Even — no coins won or lost", tone: EVEN_TONE };
  if (only?.result === "Bust") return { text: `Bust −${amount}`, tone: LOSS_TONE };
  return { text: only ? `Dealer wins −${amount}` : `You lose −${amount}`, tone: LOSS_TONE };
}

/** A small tag under each split hand with its own result. */
function resultTone(result: string | null) {
  if (result === "Win") return "text-emerald-300";
  if (result === "Push") return "text-slate-300";
  return "text-red-300";
}

function getToken() {
  return localStorage.getItem("player_token");
}

// Reads the player's balance the same way the nav bar does; null while
// loading, 0 for guests (SRS-109.4).
function usePlayerBalance() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const handleChange = () => setVersion((v) => v + 1);
    window.addEventListener(BALANCE_CHANGED_EVENT, handleChange);
    return () => window.removeEventListener(BALANCE_CHANGED_EVENT, handleChange);
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setSignedIn(false);
      setBalance(0);
      return;
    }
    setSignedIn(true);
    let cancelled = false;
    fetch("/api/profile/balance", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          setSignedIn(false);
          setBalance(0);
          return;
        }
        if (res.ok) setBalance((await res.json()).balance);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [version]);

  return { signedIn, balance };
}

export default function BlackjackPage() {
  const { signedIn, balance } = usePlayerBalance();
  // Each chip the player has put down, in order, so Undo can take the last
  // one back and the betting circle can show the real stack. Kept after a
  // hand ends, so the same bet is ready for the next one.
  const [betChips, setBetChips] = useState<number[]>([]);
  // What's in the "type an amount" box while the player is editing it;
  // null when it isn't focused, so it just shows the current bet.
  const [typed, setTyped] = useState<string | null>(null);
  const [hand, setHand] = useState<BlackjackHandView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chipTotal = betChips.reduce((sum, chip) => sum + chip, 0);
  const typedAmount = typed ? Number(typed) : 0;
  const typedProblem =
    typed === null || typed === ""
      ? null
      : typedAmount < MIN_BLACKJACK_BET
        ? `The minimum bet is ${MIN_BLACKJACK_BET} coins.`
        : typedAmount > (balance ?? 0)
          ? `You only have ${(balance ?? 0).toLocaleString()} coins.`
          : !chipsFor(typedAmount)
            ? `The chips can't make ${typedAmount.toLocaleString()}. Try ${nearestChipBet(typedAmount).toLocaleString()}.`
            : null;

  // SRS-901.1: the player can also type the bet, but only an amount the
  // chips can make (lib/blackjack.ts chipsFor()). A valid amount replaces the
  // chips straight away; anything else leaves the last valid bet.
  function typeBet(text: string) {
    const digits = text.replace(/\D/g, "").replace(/^0+/, "").slice(0, 9);
    setTyped(digits);
    const amount = Number(digits);
    if (!digits) setBetChips([]);
    else if (amount <= (balance ?? 0)) {
      const chips = chipsFor(amount);
      if (chips) setBetChips(chips);
    }
  }

  const inPlay = hand !== null && !hand.finished;
  const finished = hand !== null && hand.finished;
  // During a round the bet is everything already taken from the balance,
  // including any Double or Split.
  const bet = hand ? hand.totalBet : chipTotal;
  const available = balance ?? 0;
  const canBet = !hand && !busy;

  // Pick up an unfinished hand after a refresh.
  const loadHand = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const res = await fetch("/api/blackjack", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const data = await res.json();
    if (data.hand) setHand(data.hand);
  }, []);

  useEffect(() => {
    loadHand().catch(() => {});
  }, [loadHand]);

  // If the balance drops below the chips set for the next hand (e.g. spent
  // in another tab, or the last hand lost), start the bet over.
  useEffect(() => {
    if (!inPlay && balance !== null && chipTotal > balance) setBetChips([]);
  }, [balance, chipTotal, inPlay]);

  async function post(path: string, body: unknown) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(body),
    });
    return { res, data: await res.json().catch(() => ({})) };
  }

  async function deal() {
    if (!getToken() || chipTotal < MIN_BLACKJACK_BET || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { res, data } = await post("/api/blackjack/deal", { bet: chipTotal });
      if (!res.ok) {
        setError(data.error ?? "Could not deal the hand. Please try again.");
        // e.g. a hand still in play from another tab.
        if (res.status === 409) await loadHand();
        return;
      }
      setHand(data.hand);
      // Refreshes both the nav bar and this page's balance.
      notifyBalanceChanged();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function play(move: BlackjackMove) {
    if (!hand || hand.finished || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { res, data } = await post("/api/blackjack/action", {
        handId: hand.handId,
        move,
        step: hand.step,
      });
      if (!res.ok) {
        setError(data.error ?? "Could not play that move. Please try again.");
        return;
      }
      setHand(data.hand);
      // The balance changes when the player doubles or splits (SRS-910.2,
      // SRS-911.2) and when the round ends (SRS-908.1).
      if (data.balance !== undefined || data.hand.finished) notifyBalanceChanged();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // What Double or Split would cost right now: the round's original bet, or
  // the chips set for the next one.
  const extraCost = hand ? hand.bet : chipTotal;
  const canAfford = available >= extraCost;
  // SRS-910.1: a hand's first two cards, with another bet's worth of coins.
  const doubleAllowed = inPlay && !busy && hand.canDouble && canAfford;
  const doubleReason = !inPlay
    ? "Your moves unlock once the cards are dealt."
    : !hand.canDouble
      ? "You can only double on a hand's first two cards."
      : !canAfford
        ? `You need another ${extraCost.toLocaleString()} coins to double.`
        : undefined;
  // SRS-911.1: a pair, once, with another bet's worth of coins.
  const splitAllowed = inPlay && !busy && hand.canSplit && canAfford;
  const splitReason = !inPlay
    ? "Your moves unlock once the cards are dealt."
    : !hand.canSplit
      ? "You can split only when your first two cards are a pair, once per hand."
      : !canAfford
        ? `You need another ${extraCost.toLocaleString()} coins to split.`
        : undefined;
  const activeHand = inPlay && hand.active !== null ? hand.hands[hand.active] : undefined;

  function newHand() {
    setHand(null);
    setError(null);
  }

  // Keyboard shortcuts for the moves shown on the buttons.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      // Typing a bet amount isn't a move.
      if (event.target instanceof HTMLInputElement) return;
      const key = event.key.toLowerCase();
      if (key === "h") play("hit");
      else if (key === "s") play("stand");
      else if (key === "d" && doubleAllowed) play("double");
      else if (key === "p" && splitAllowed) play("split");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const result = finished ? describeResult(hand) : null;
  // The chips in the betting circle: the real stack when it matches the bet
  // (it won't after a refresh mid-hand), otherwise just the amount.
  // After a Double or Split the bet is the same stack two or three times.
  const repeats = chipTotal > 0 && bet % chipTotal === 0 ? bet / chipTotal : 0;
  const circleChips = Array.from({ length: repeats }, () => betChips).flat().slice(-5);

  return (
    <main className="min-h-page bg-[radial-gradient(ellipse_at_top,_#14532d_0%,_#052e16_30%,_#020617_70%)] px-4 pb-10 pt-6 text-slate-100 sm:px-6">
      <div className="mx-auto w-full max-w-7xl">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm text-slate-400 transition hover:text-emerald-300">
              ← All games
            </Link>
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
              Blackjack
              <span aria-hidden className="text-xl tracking-[0.15em]">
                <span className="text-slate-300">♠</span>
                <span className="text-red-500">♥</span>
              </span>
            </h1>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-medium text-slate-300">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Blackjack pays 3 to 2</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Dealer stands on 17</span>
          </div>
        </header>

        {/* AI assistant: the suggestion shows in the box on the right once
            the player asks for one. */}
        <section className="mt-5 grid gap-4 rounded-3xl border border-emerald-400/15 bg-slate-900/80 p-4 shadow-xl shadow-black/40 sm:grid-cols-[14rem_1fr] sm:p-5">
          <div className="flex flex-col">
            <h2 className="flex items-center gap-2 font-semibold text-emerald-200">
              <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-400/10">
                ✨
              </span>
              AI assistant
            </h2>
            <p className="mt-2 text-sm text-slate-400">Stuck on a hand? Ask for a suggestion on your next move.</p>
            <button
              disabled
              className="mt-3 cursor-not-allowed rounded-xl bg-emerald-400 py-2.5 text-sm font-semibold text-slate-950 opacity-60 shadow-lg shadow-emerald-500/20 sm:mt-auto"
            >
              Get suggestion
            </button>
          </div>

          <div
            aria-live="polite"
            className="flex min-h-[7.5rem] flex-col justify-center rounded-2xl border border-dashed border-white/10 bg-black/20 px-5 py-4"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Suggestion</p>
            <p className="mt-1 text-2xl font-bold text-slate-600">—</p>
            <p className="mt-1 text-sm text-slate-500">
              The assistant&apos;s recommended move and the reason for it will appear here.
            </p>
          </div>
        </section>

        {/* Your bet on the left, the table in the middle, your move on the
            right. Narrower screens show the table first, then the panels. Both
            panels share a minimum height, so they match beside the table. */}
        <div className="mt-6 grid items-center gap-5 md:grid-cols-2 lg:grid-cols-[17rem_minmax(0,1fr)_17rem]">
          {/* Table: wood rail around a half-moon felt, dealer at the flat edge */}
          <section className="rounded-b-[50%] rounded-t-3xl bg-gradient-to-b from-amber-800 via-amber-900 to-amber-950 p-3 shadow-[0_30px_60px_rgba(0,0,0,0.7)] md:col-span-2 lg:order-2 lg:col-span-1">
            <div className="relative overflow-hidden rounded-b-[50%] rounded-t-2xl bg-[radial-gradient(ellipse_at_center,_#15803d_0%,_#065f46_55%,_#022c22_100%)] px-4 pb-14 pt-6 shadow-[inset_0_0_60px_rgba(0,0,0,0.65)]">
              {/* Dealer */}
              <div className="flex min-h-[10.5rem] flex-col items-center gap-3">
                {hand ? (
                  <>
                    <HandLabel name="Dealer" value={hand.dealerTotal} bust={hand.dealerTotal > 21} />
                    <Hand cards={hand.dealerCards} />
                  </>
                ) : (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-100/70">Dealer</p>
                    <Hand cards={[null, null]} />
                  </>
                )}
              </div>

              {/* The result once the hand is over, otherwise the table rules */}
              <div className="relative mx-auto mt-2 max-w-lg" aria-live="polite">
                <svg
                  viewBox="0 0 600 120"
                  className={`w-full transition-opacity ${result ? "opacity-20" : ""}`}
                  aria-hidden="true"
                >
                  <defs>
                    <path id="bj-arc-outer" d="M 30 20 Q 300 115 570 20" />
                    <path id="bj-arc-inner" d="M 90 58 Q 300 140 510 58" />
                  </defs>
                  <text className="fill-amber-300" fontSize="20" fontWeight="700" letterSpacing="5">
                    <textPath href="#bj-arc-outer" startOffset="50%" textAnchor="middle">
                      BLACKJACK PAYS 3 TO 2
                    </textPath>
                  </text>
                  <text className="fill-emerald-100/60" fontSize="12" letterSpacing="2.5">
                    <textPath href="#bj-arc-inner" startOffset="50%" textAnchor="middle">
                      DEALER MUST STAND ON 17 AND DRAW TO 16
                    </textPath>
                  </text>
                </svg>
                {result ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p
                      className={`animate-box-reveal rounded-full border px-6 py-2 text-xl font-bold tabular-nums shadow-lg shadow-black/40 backdrop-blur-sm ${result.tone}`}
                    >
                      {result.text}
                    </p>
                  </div>
                ) : null}
              </div>

              {/* Player */}
              <div className="flex flex-col items-center gap-3">
                {hand ? (
                  <div className="flex flex-wrap items-start justify-center gap-6">
                    {hand.hands.map((playerHand, index) => {
                      const split = hand.hands.length > 1;
                      const playing = split && hand.active === index;
                      const waiting = split && hand.active !== null && hand.active !== index;
                      return (
                        <div
                          key={index}
                          className={`flex flex-col items-center gap-3 rounded-2xl px-3 py-2 transition ${
                            playing ? "bg-emerald-300/10 ring-1 ring-emerald-300/50" : ""
                          } ${waiting ? "opacity-60" : ""}`}
                        >
                          <Hand cards={playerHand.cards} />
                          <HandLabel
                            name={split ? `Hand ${index + 1}` : "You"}
                            value={playerHand.total}
                            bust={playerHand.total > 21}
                          />
                          {split ? (
                            <p className="text-xs tabular-nums text-amber-100/80">
                              {playerHand.bet.toLocaleString()} coins{playerHand.doubled ? " · doubled" : ""}
                              {playerHand.result ? (
                                <span className={`font-semibold ${resultTone(playerHand.result)}`}>
                                  {" "}
                                  · {playerHand.result}
                                </span>
                              ) : null}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <>
                    <Hand cards={[null, null]} />
                    <p className="text-xs text-emerald-100/60">Place your bet and press Deal.</p>
                  </>
                )}

                {/* Betting circle */}
                <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-amber-300/40 bg-black/10">
                  {bet > 0 ? (
                    <div className="flex flex-col items-center">
                      {/* The most recent chips, stacked, newest on top */}
                      <div className="relative h-14 w-10">
                        {(circleChips.length ? circleChips : [MIN_BLACKJACK_BET]).map((value, index) => (
                          <span key={index} className="absolute left-0" style={{ bottom: index * 4 }}>
                            <Chip value={value} small />
                          </span>
                        ))}
                      </div>
                      <span className="text-xs font-semibold tabular-nums text-amber-100">{bet.toLocaleString()}</span>
                    </div>
                  ) : (
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-200/50">Place bet</span>
                  )}
                </div>
              </div>
            </div>
          </section>

            <div className="flex flex-col rounded-3xl border border-white/5 bg-slate-900/80 p-5 shadow-xl shadow-black/40 md:min-h-[23rem] lg:order-1">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Your bet</h2>
                <p className="text-2xl font-bold tabular-nums text-amber-300">
                  {bet.toLocaleString()} <span className="text-sm font-medium text-slate-400">coins</span>
                </p>
              </div>
              <p className="mt-1 text-right text-xs tabular-nums text-slate-500">
                {signedIn === false ? (
                  // Guests have nothing to bet; in the same line, so the panel
                  // stays the same height as Your move.
                  <>
                    <Link href="/login" className="font-semibold text-emerald-300 hover:text-emerald-200">
                      Log in
                    </Link>{" "}
                    to place a bet
                  </>
                ) : balance === null ? (
                  "Loading balance…"
                ) : (
                  `${(hand ? available : available - chipTotal).toLocaleString()} coins left to bet`
                )}
              </p>

              <div className="mt-3 flex items-center justify-between gap-2">
                {BLACKJACK_CHIPS.map((value) => {
                  const tooMuch = chipTotal + value > available;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setTyped(null);
                        setBetChips((chips) => [...chips, value]);
                      }}
                      disabled={!canBet || tooMuch}
                      aria-label={`Add ${value} coins`}
                      title={hand ? "Finish this hand first" : tooMuch ? "Not enough coins" : `Add ${value}`}
                      className="rounded-full transition hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:translate-y-0"
                    >
                      <Chip value={value} />
                    </button>
                  );
                })}
              </div>

              <label className="mt-4 block">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Or type an amount
                </span>
                <span
                  className={`mt-1.5 flex items-center gap-2 rounded-xl border bg-black/30 px-3 transition focus-within:border-emerald-300/70 ${
                    typedProblem ? "border-red-400/60" : "border-white/10"
                  } ${!canBet || available < MIN_BLACKJACK_BET ? "opacity-40" : ""}`}
                >
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={`${MIN_BLACKJACK_BET} or more`}
                    value={typed ?? (chipTotal > 0 ? String(chipTotal) : "")}
                    onFocus={() => setTyped(chipTotal > 0 ? String(chipTotal) : "")}
                    onChange={(event) => typeBet(event.target.value)}
                    onBlur={() => setTyped(null)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                    disabled={!canBet || available < MIN_BLACKJACK_BET}
                    aria-invalid={typedProblem !== null}
                    aria-describedby={typedProblem ? "bet-amount-problem" : undefined}
                    className="w-full min-w-0 bg-transparent py-2.5 text-lg font-semibold tabular-nums text-amber-200 outline-none placeholder:text-base placeholder:font-normal placeholder:text-slate-600 disabled:cursor-not-allowed"
                  />
                  <span className="text-sm text-slate-500">coins</span>
                </span>
                {typedProblem ? (
                  <span id="bet-amount-problem" className="mt-1 block text-xs text-red-400">
                    {typedProblem}
                  </span>
                ) : null}
              </label>


              {inPlay ? (
                <p className="mt-auto pt-4 text-sm text-slate-400">
                  Bet in play — <span className="font-semibold tabular-nums text-amber-200">{bet.toLocaleString()}</span>{" "}
                  coins. Hit, Stand, Double, or Split to play the hand.
                </p>
              ) : finished ? (
                <div className="mt-auto pt-4">
                  <button
                    type="button"
                    onClick={newHand}
                    className="w-full rounded-xl bg-emerald-400 py-3 font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-300"
                  >
                    New hand
                  </button>
                </div>
              ) : (
                <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setTyped(null);
                      setBetChips((chips) => chips.slice(0, -1));
                    }}
                    disabled={chipTotal === 0 || busy}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/10"
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTyped(null);
                      setBetChips([]);
                    }}
                    disabled={chipTotal === 0 || busy}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/10"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={deal}
                    disabled={chipTotal < MIN_BLACKJACK_BET || busy}
                    className="col-span-2 rounded-xl bg-emerald-400 py-3 font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-emerald-400"
                  >
                    {busy ? "Dealing…" : "Deal"}
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col rounded-3xl border border-white/5 bg-slate-900/80 p-5 shadow-xl shadow-black/40 md:min-h-[23rem] lg:order-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Your move</h2>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {MOVES.map(({ move, label, hint }) => (
                  <button
                    key={move}
                    type="button"
                    onClick={() => play(move)}
                    disabled={!inPlay || busy}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-lg font-semibold text-slate-100 transition hover:border-emerald-300/60 hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/10 disabled:hover:bg-white/5"
                  >
                    {label}
                    <kbd className="rounded-md border border-white/10 px-1.5 text-[11px] font-medium text-slate-400">
                      {hint}
                    </kbd>
                  </button>
                ))}
                <div className="col-span-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => play("double")}
                    disabled={!doubleAllowed}
                    title={doubleReason}
                    className="flex flex-1 items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-lg font-semibold text-slate-100 transition hover:border-amber-300/60 hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/10 disabled:hover:bg-white/5"
                  >
                    <span>
                      Double
                      {extraCost > 0 ? (
                        <span className="ml-2 text-sm font-medium tabular-nums text-amber-300/80">
                          +{extraCost.toLocaleString()}
                        </span>
                      ) : null}
                    </span>
                    <kbd className="rounded-md border border-white/10 px-1.5 text-[11px] font-medium text-slate-400">
                      D
                    </kbd>
                  </button>
                  <InfoTip label="What does Double do?">
                    <span className="mb-1 block font-semibold text-amber-200">Double</span>
                    Doubles your bet and gives you exactly one more card, then your turn ends.{" "}
                    {extraCost > 0
                      ? `It costs another ${extraCost.toLocaleString()} coins, so your bet becomes ${(extraCost * 2).toLocaleString()}.`
                      : "It costs the same amount as your bet again."}{" "}
                    Wins and losses are paid on the doubled bet. Only allowed on a hand&apos;s first two cards.
                  </InfoTip>
                </div>
                <div className="col-span-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => play("split")}
                    disabled={!splitAllowed}
                    title={splitReason}
                    className="flex flex-1 items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-lg font-semibold text-slate-100 transition hover:border-sky-300/60 hover:bg-sky-400/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/10 disabled:hover:bg-white/5"
                  >
                    <span>
                      Split
                      {extraCost > 0 ? (
                        <span className="ml-2 text-sm font-medium tabular-nums text-sky-300/80">
                          +{extraCost.toLocaleString()}
                        </span>
                      ) : null}
                    </span>
                    <kbd className="rounded-md border border-white/10 px-1.5 text-[11px] font-medium text-slate-400">
                      P
                    </kbd>
                  </button>
                  <InfoTip label="What does Split do?">
                    <span className="mb-1 block font-semibold text-sky-200">Split</span>
                    When your first two cards are a pair, like 8 and 8, splits them into two separate hands and deals
                    each one a second card. You then play each hand on its own.{" "}
                    {extraCost > 0
                      ? `It costs another ${extraCost.toLocaleString()} coins, one bet for each hand.`
                      : "It costs the same amount as your bet again, one bet for each hand."}{" "}
                    Split aces get only one more card each, and 21 after a split pays 1 to 1, not 3 to 2. Once per hand.
                  </InfoTip>
                </div>
              </div>
              <p className="mt-auto pt-4 text-xs text-slate-500">
                {activeHand
                  ? `${hand!.hands.length > 1 ? `Playing hand ${hand!.active! + 1} of ${hand!.hands.length}: you` : "You"} have ${
                      activeHand.total
                    }. The dealer shows ${hand!.dealerTotal}.`
                  : "Your moves unlock once the cards are dealt."}
              </p>
            </div>
        </div>

        {error ? (
          <p role="alert" className="mt-4 text-center text-sm text-red-400">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}
