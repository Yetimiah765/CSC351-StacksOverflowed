
import Link from "next/link";

const dealerCards = [
  { value: "K", suit: "♠" },
  { value: "?", suit: "" },
];

const playerCards = [
  { value: "10", suit: "♥" },
  { value: "7", suit: "♣" },
];

function PlayingCard({
  value,
  suit,
}: {
  value: string;
  suit: string;
}) {
  const hidden = value === "?";
  const red = suit === "♥" || suit === "♦";

  return (
    <div
      className={`flex h-28 w-20 items-center justify-center rounded-xl border-2 shadow-xl ${
        hidden
          ? "border-blue-300 bg-blue-800 text-white"
          : "border-gray-200 bg-white"
      }`}
    >
      {hidden ? (
        <span className="text-4xl">★</span>
      ) : (
        <div
          className={`text-center ${
            red ? "text-red-600" : "text-gray-900"
          }`}
        >
          <div className="text-3xl font-bold">{value}</div>
          <div className="text-3xl">{suit}</div>
        </div>
      )}
    </div>
  );
}

export default function BlackjackPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-950 via-blue-900 to-slate-950 px-5 py-8 text-white">
      <div className="mx-auto max-w-6xl">

        {/* Navigation */}
        <header className="mb-8 flex items-center justify-between">
          <Link
            href="/"
            className="rounded-xl bg-blue-800 px-5 py-3 hover:bg-blue-700"
          >
            ← Back to Games
          </Link>

          <h1 className="text-3xl font-bold">
            Blackjack
          </h1>

          <div className="rounded-full border border-yellow-500 bg-blue-800 px-5 py-3 font-bold">
            🪙 1,000
          </div>
        </header>

        {/* AI Recommendation */}
        <section className="mb-6 rounded-2xl border border-blue-500 bg-blue-900/80 p-5 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">
                ✨ AI Blackjack Assistant
              </h2>
              <p className="mt-2 text-sm text-blue-200">
                Get a suggestion for your next move.
                Available only when requested.
              </p>
            </div>

            <button
              disabled
              className="cursor-not-allowed rounded-xl bg-blue-500 px-6 py-3 font-semibold opacity-60"
            >
              Get AI Suggestion
            </button>
          </div>
        </section>

        {/* Blackjack Table */}
        <section className="rounded-[40px] border-8 border-amber-700 bg-gradient-to-b from-emerald-800 to-green-950 p-6 shadow-2xl md:p-10">

          <div className="mb-8 text-center">
            <h2 className="text-3xl font-extrabold tracking-widest text-yellow-300">
              BLACKJACK
            </h2>
            <p className="mt-2 text-sm text-yellow-100">
              Blackjack Pays 3 to 2 • Dealer Stands on 17
            </p>
          </div>

          {/* Dealer */}
          <div className="mb-12 text-center">
            <h3 className="mb-4 text-xl font-semibold">
              Dealer
            </h3>

            <div className="flex justify-center gap-4">
              {dealerCards.map((card, index) => (
                <PlayingCard
                  key={index}
                  value={card.value}
                  suit={card.suit}
                />
              ))}
            </div>
          </div>

          {/* Table Divider */}
          <div className="mb-10 rounded-full border-2 border-yellow-400/60 py-4 text-center text-yellow-200">
            BLACKJACK PAYS 3 TO 2
          </div>

          {/* Player */}
          <div className="text-center">
            <h3 className="mb-4 text-xl font-semibold">
              Your Hand — 17
            </h3>

            <div className="flex justify-center gap-4">
              {playerCards.map((card, index) => (
                <PlayingCard
                  key={index}
                  value={card.value}
                  suit={card.suit}
                />
              ))}
            </div>

            <p className="mt-5 font-semibold text-yellow-200">
              Current Bet: 50 Coins
            </p>
          </div>
        </section>

        {/* Player Actions */}
        <section className="mt-6 rounded-2xl bg-blue-900/80 p-6">
          <h2 className="mb-4 text-lg font-bold">
            Player Actions
          </h2>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {["Hit", "Stand", "Double", "Split"].map(
              (action) => (
                <button
                  key={action}
                  disabled
                  className="cursor-not-allowed rounded-xl bg-blue-600 py-4 font-semibold opacity-60"
                >
                  {action}
                </button>
              )
            )}
          </div>
        </section>

        {/* Betting */}
        <section className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-blue-900/80 p-6">
          <div>
            <h2 className="text-xl font-bold">
              Place Your Bet
            </h2>
            <p className="mt-1 text-blue-200">
              Bet Amount: 50 Coins
            </p>
          </div>

          <button
            disabled
            className="cursor-not-allowed rounded-xl bg-emerald-500 px-10 py-4 font-bold opacity-60"
          >
            Deal Cards
          </button>
        </section>

        <p className="mt-6 text-center text-sm text-blue-300">
          Blackjack Room — Frontend Prototype
        </p>
      </div>
    </main>
  );
}
