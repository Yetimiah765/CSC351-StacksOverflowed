import Link from 'next/link';

// SRS-108.5: each game's way back to the home page (the casino floor), since
// the nav bar has no Home button. One look on every game: blackjack,
// roulette, slots, the sportsbook, the poker lobby, and the cosmetic shop;
// and on the player's profile (SRS-111.4).
export default function BackToHome({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex w-fit items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/80 px-3.5 py-1.5 text-sm font-medium text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200 ${className}`}
    >
      <span aria-hidden="true">←</span> Home
    </Link>
  );
}
