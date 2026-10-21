import Link from "next/link";

// Frontend prototype of the blackjack room: the hands, bet, buttons and AI
// suggestion below are placeholders until the game logic is connected.
// Styled to match the home page and the poker table (slate panels, emerald
// accents, wood-rail felt). The coin balance lives in the nav bar, so it
// isn't repeated here.

type Card = { rank: string; suit: "♠" | "♥" | "♦" | "♣" } | "hidden";

const dealerCards: Card[] = [{ rank: "K", suit: "♠" }, "hidden"];
const playerCards: Card[] = [
  { rank: "10", suit: "♥" },
  { rank: "7", suit: "♣" },
];

const CHIPS = [
  { value: 10, color: "bg-sky-500", ring: "border-sky-200" },
  { value: 25, color: "bg-emerald-500", ring: "border-emerald-200" },
  { value: 50, color: "bg-red-500", ring: "border-red-200" },
  { value: 100, color: "bg-slate-800", ring: "border-slate-300" },
];

const ACTIONS = [
  { label: "Hit", hint: "H" },
  { label: "Stand", hint: "S" },
  { label: "Double", hint: "D" },
  { label: "Split", hint: "P" },
];

function PlayingCard({ card, index }: { card: Card; index: number }) {
  const tilt = index % 2 === 0 ? "-rotate-3" : "rotate-3";

  if (card === "hidden") {
    return (
      <div
        className={`${tilt} relative h-28 w-20 rounded-xl border border-white/20 bg-emerald-950 p-1.5 shadow-[0_10px_25px_rgba(0,0,0,0.55)]`}
        aria-label="Face-down card"
      >
        <div className="h-full w-full rounded-lg border border-emerald-300/30 bg-[repeating-linear-gradient(45deg,_#065f46_0px,_#065f46_6px,_#064e3b_6px,_#064e3b_12px)]" />
      </div>
    );
  }

  const red = card.suit === "♥" || card.suit === "♦";

  return (
    <div
      className={`${tilt} relative h-28 w-20 rounded-xl bg-white shadow-[0_10px_25px_rgba(0,0,0,0.55)] ${
        red ? "text-red-600" : "text-slate-900"
      }`}
      aria-label={`${card.rank} of ${card.suit}`}
    >
      <div className="absolute left-1.5 top-1 flex flex-col items-center leading-none">
        <span className="text-base font-bold">{card.rank}</span>
        <span className="text-sm">{card.suit}</span>
      </div>
      <div className="absolute inset-0 flex items-center justify-center text-4xl">{card.suit}</div>
      <div className="absolute bottom-1 right-1.5 flex rotate-180 flex-col items-center leading-none">
        <span className="text-base font-bold">{card.rank}</span>
        <span className="text-sm">{card.suit}</span>
      </div>
    </div>
  );
}

function Hand({ cards }: { cards: Card[] }) {
  return (
    <div className="flex justify-center -space-x-6">
      {cards.map((card, index) => (
        <PlayingCard key={index} card={card} index={index} />
      ))}
    </div>
  );
}

function HandLabel({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-100/70">{name}</span>
      <span className="rounded-full bg-black/40 px-2.5 py-0.5 text-sm font-bold tabular-nums text-amber-200 shadow-inner shadow-black/40">
        {value}
      </span>
    </div>
  );
}

function Chip({ value, color, ring, small }: { value: number; color: string; ring: string; small?: boolean }) {
  return (
    <span
      className={`flex items-center justify-center rounded-full ${color} shadow-[0_3px_8px_rgba(0,0,0,0.5)] ${
        small ? "h-10 w-10" : "h-12 w-12"
      }`}
    >
      <span
        className={`flex h-[78%] w-[78%] items-center justify-center rounded-full border-2 border-dashed ${ring} text-xs font-bold text-white`}
      >
        {value}
      </span>
    </span>
  );
}

export default function BlackjackPage() {
  return (
    <main className="min-h-page bg-[radial-gradient(ellipse_at_top,_#14532d_0%,_#052e16_30%,_#020617_70%)] px-4 pb-10 pt-6 text-slate-100 sm:px-6">
      <div className="mx-auto w-full max-w-4xl">
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

        {/* Table: wood rail around a half-moon felt, dealer at the flat edge */}
        <section className="mt-6 rounded-b-[50%] rounded-t-3xl bg-gradient-to-b from-amber-800 via-amber-900 to-amber-950 p-3 shadow-[0_30px_60px_rgba(0,0,0,0.7)]">
          <div className="relative overflow-hidden rounded-b-[50%] rounded-t-2xl bg-[radial-gradient(ellipse_at_center,_#15803d_0%,_#065f46_55%,_#022c22_100%)] px-4 pb-14 pt-6 shadow-[inset_0_0_60px_rgba(0,0,0,0.65)]">
            {/* Dealer */}
            <div className="flex flex-col items-center gap-3">
              <HandLabel name="Dealer" value="10" />
              <Hand cards={dealerCards} />
            </div>

            {/* Curved table rules */}
            <svg viewBox="0 0 600 120" className="mx-auto mt-2 w-full max-w-lg" aria-hidden="true">
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

            {/* Player */}
            <div className="flex flex-col items-center gap-3">
              <Hand cards={playerCards} />
              <HandLabel name="You" value="17" />

              {/* Betting circle */}
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-amber-300/40 bg-black/10">
                <div className="flex flex-col items-center">
                  <Chip {...CHIPS[2]} small />
                  <span className="mt-0.5 text-xs font-semibold tabular-nums text-amber-100">50</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Controls: bet on the left, moves on the right */}
        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="flex flex-col rounded-3xl border border-white/5 bg-slate-900/80 p-5 shadow-xl shadow-black/40">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Your bet</h2>
              <p className="text-2xl font-bold tabular-nums text-amber-300">
                50 <span className="text-sm font-medium text-slate-400">coins</span>
              </p>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              {CHIPS.map((chip) => (
                <button
                  key={chip.value}
                  disabled
                  aria-label={`Add ${chip.value} coins`}
                  className="cursor-not-allowed rounded-full opacity-60"
                >
                  <Chip {...chip} />
                </button>
              ))}
            </div>
            <div className="mt-auto grid grid-cols-[auto_1fr] gap-2 pt-4">
              <button
                disabled
                className="cursor-not-allowed rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-300 opacity-60"
              >
                Clear
              </button>
              <button
                disabled
                className="cursor-not-allowed rounded-xl bg-emerald-400 py-3 font-semibold text-slate-950 opacity-60 shadow-lg shadow-emerald-500/20"
              >
                Deal
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-white/5 bg-slate-900/80 p-5 shadow-xl shadow-black/40">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Your move</h2>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {ACTIONS.map((action) => (
                <button
                  key={action.label}
                  disabled
                  className="flex cursor-not-allowed items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-semibold text-slate-100 opacity-60"
                >
                  {action.label}
                  <kbd className="rounded-md border border-white/10 px-1.5 text-[11px] font-medium text-slate-400">
                    {action.hint}
                  </kbd>
                </button>
              ))}
            </div>
          </div>
        </section>

        <p className="mt-6 text-center text-xs text-slate-500">Frontend prototype — gameplay isn&apos;t connected yet.</p>
      </div>
    </main>
  );
}
