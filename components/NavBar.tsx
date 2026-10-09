'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

// Rendered on every page by app/layout.tsx. It is h-14 (3.5rem) tall, which
// is why pages use `min-h-page` (see tailwind.config.js) instead of
// `min-h-screen`.
export default function NavBar() {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);

  // Re-read the session on every navigation, so logging in (which lands on
  // /profile) and logging out (which lands on /) both update the bar.
  useEffect(() => {
    const token = localStorage.getItem('player_token');
    if (!token) {
      setSignedIn(false);
      setBalance(0); // SRS-109.4: guests see a balance of 0 coins.
      return;
    }

    setSignedIn(true);
    let cancelled = false;

    async function loadBalance() {
      const res = await fetch('/api/profile/balance', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (cancelled) return;

      // The session ended elsewhere (a newer login, SRS-103.5), so this
      // browser is no longer logged in.
      if (res.status === 401) {
        localStorage.removeItem('player_token');
        setSignedIn(false);
        setBalance(0);
        return;
      }

      if (!res.ok) return;
      const data = await res.json();
      if (!cancelled) setBalance(data.balance);
    }

    loadBalance().catch(() => {});

    // Pages that change the balance without navigating anywhere (e.g. a
    // poker buy-in or refund) dispatch this so the bar updates immediately
    // instead of waiting for the next route change.
    window.addEventListener('balance:refresh', loadBalance);

    return () => {
      cancelled = true;
      window.removeEventListener('balance:refresh', loadBalance);
    };
  }, [pathname]);

  // SRS-111.3: guests are sent to log in (the login page links to sign up).
  const profileHref = signedIn ? '/profile' : '/login';
  const balanceText = balance === null ? '—' : balance.toLocaleString();

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <nav className="mx-auto flex h-full max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <NavIcon href="/" label="Home" active={pathname === '/'}>
            <path d="M3 11.5 12 4l9 7.5" />
            <path d="M5.5 10v9.5h13V10" />
            <path d="M10 19.5v-5h4v5" />
          </NavIcon>
          <NavIcon href="/shop" label="Cosmetic shop" active={pathname === '/shop'}>
            <path d="M3 4.5h2.3l2.2 10h10.3l2.2-7.5H6.2" />
            <circle cx="9.5" cy="19" r="1.3" />
            <circle cx="17" cy="19" r="1.3" />
          </NavIcon>
        </div>

        <div className="flex items-center gap-3">
          <span
            title={`Balance: ${balanceText} coins`}
            className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-100"
          >
            <span aria-hidden="true" className="h-3.5 w-3.5 rounded-full bg-amber-400 ring-2 ring-amber-300/30" />
            {balanceText}
            <span className="sr-only">coins</span>
          </span>
          <NavIcon
            href={profileHref}
            label={signedIn ? 'Your profile' : 'Log in or sign up'}
            active={pathname === profileHref}
          >
            <circle cx="12" cy="8.5" r="3.5" />
            <path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5" />
          </NavIcon>
        </div>
      </nav>
    </header>
  );
}

function NavIcon({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      aria-current={active ? 'page' : undefined}
      className={`flex h-10 w-10 items-center justify-center rounded-full border bg-slate-900 transition hover:border-emerald-400 hover:text-emerald-200 ${
        active ? 'border-emerald-400 text-emerald-200' : 'border-slate-800 text-slate-200'
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="h-5 w-5"
      >
        {children}
      </svg>
    </Link>
  );
}
