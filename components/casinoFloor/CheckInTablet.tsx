'use client';

import { useEffect, useRef, useState } from 'react';
import LoginScreen from '../auth/LoginScreen';
import RegisterScreen from '../auth/RegisterScreen';
import type { CheckInForm } from '../../lib/checkIn';

// A check-in tablet up close (SRS-103.13): once the camera has flown into
// one of the front desk's kiosks, its screen fills the window below the nav
// bar, framed by its bezel, with the website's own sign-up and login
// screens (and their animations) running on it. Sign-up comes first (or
// login, when that's what the guest asked for, SRS-103.16), and each links
// to the other; after signing up it's the login screen with the new
// username filled in (SRS-101.15). Escape, or Step away on the bezel,
// closes it. The page draws it outside the casino floor's own part, so the
// screens look exactly as they do on their own pages (not in the floor's
// font).

export default function CheckInTablet({ start = 'signup', onClose, onLoggedIn }: { start?: CheckInForm; onClose: () => void; onLoggedIn: () => void }) {
  const [screen, setScreen] = useState<CheckInForm>(start);
  const [registered, setRegistered] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);

  // Escape steps away; focus goes to the tablet, so the keys are for its
  // forms rather than for walking.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    dialog.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close.current();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label="Check-in kiosk"
      tabIndex={-1}
      className="fixed inset-x-0 bottom-0 top-16 z-40 bg-[#06030a] p-2.5 outline-none sm:p-3"
    >
      <div className="relative h-full rounded-[34px] bg-[#0b0b12] p-[22px] shadow-[inset_0_0_0_1px_#c9a227,0_20px_60px_rgba(0,0,0,0.7)]">
        <span aria-hidden className="absolute left-1/2 top-2 h-[7px] w-[7px] -translate-x-1/2 rounded-full bg-slate-800 shadow-[inset_0_0_0_1.5px_#334155]" />
        <button
          type="button"
          onClick={onClose}
          className="absolute bottom-[3px] right-8 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 transition hover:text-amber-200"
        >
          Esc · Step away
        </button>
        <div className="h-full overflow-y-auto overflow-x-hidden rounded-[14px] bg-slate-950">
          {screen === 'signup' ? (
            <RegisterScreen
              onTablet
              onRegistered={(username) => {
                setRegistered(username);
                setScreen('login');
              }}
              logIn={{ onClick: () => setScreen('login') }}
            />
          ) : (
            <LoginScreen
              onTablet
              registered={registered}
              onLoggedIn={onLoggedIn}
              signUp={{
                onClick: () => {
                  setRegistered(null);
                  setScreen('signup');
                },
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
