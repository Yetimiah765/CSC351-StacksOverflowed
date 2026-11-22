'use client';

import { useRouter } from 'next/navigation';
import { backStep, NAV_HISTORY_KEY, NAV_LOADED_KEY, parseLoadMark, parseTrail } from '../lib/navHistory';

// The back button on each game's main page (blackjack, roulette, slots, the
// sportsbook, the poker lobby), the cosmetic shop (SRS-108.5) and the
// player's profile (SRS-111.4). It returns to the page of the website the
// player was on before, e.g. from the profile back to the game they were
// playing, or to the home page (the casino floor) when this is the first page
// of ours opened in the tab, e.g. from a bookmark (SRS-108.7). The trail is
// kept by NavigationTracker. It uses the browser's Back only when that page
// is right behind this one in the browser's history; otherwise it goes to the
// page, since the tab may have been on another website in between, and
// Back would go there. (The name is from when it always went home; it keeps
// it so the pages that use it don't change.)
export default function BackToHome({ className = '' }: { className?: string }) {
  const router = useRouter();

  function goBack() {
    let step = backStep([], 0);
    try {
      step = backStep(
        parseTrail(sessionStorage.getItem(NAV_HISTORY_KEY)),
        parseLoadMark(sessionStorage.getItem(NAV_LOADED_KEY))
      );
    } catch {
      // Storage blocked: go home.
    }
    if (step.by === 'history' && window.history.length > 1) router.back();
    else router.push(step.by === 'link' ? step.path : '/');
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className={`inline-flex w-fit items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/80 px-3.5 py-1.5 text-sm font-medium text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200 ${className}`}
    >
      <span aria-hidden="true">←</span> Back
    </button>
  );
}
