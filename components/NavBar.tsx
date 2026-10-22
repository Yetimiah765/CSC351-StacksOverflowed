'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { APPEARANCE_CHANGED_EVENT, BALANCE_CHANGED_EVENT } from '../lib/balanceEvents';
import { OUTLINE_ACCENTS } from '../lib/cosmetics';
import DefaultAvatar from './profile/DefaultAvatar';

// The outline artwork is a large module, so it loads only for logged-in
// players, after the page is up, instead of in every page's first load.
const CosmeticArt = dynamic(() => import('./cosmetics/CosmeticArt'), { ssr: false });

// Rendered on every page by app/layout.tsx. It is h-16 (4rem) tall, which
// is why pages use `min-h-page` (see tailwind.config.js) instead of
// `min-h-screen`.
export default function NavBar() {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceVersion, setBalanceVersion] = useState(0);
  // SRS-120.7 / SRS-120.8: the player's photo, inside their equipped outline.
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [outlineArtKey, setOutlineArtKey] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [appearanceVersion, setAppearanceVersion] = useState(0);

  // Pages that change the balance in place call notifyBalanceChanged();
  // the profile page calls notifyAppearanceChanged() after a new photo or
  // outline.
  useEffect(() => {
    const handleBalance = () => setBalanceVersion((version) => version + 1);
    const handleAppearance = () => setAppearanceVersion((version) => version + 1);
    window.addEventListener(BALANCE_CHANGED_EVENT, handleBalance);
    window.addEventListener(APPEARANCE_CHANGED_EVENT, handleAppearance);
    return () => {
      window.removeEventListener(BALANCE_CHANGED_EVENT, handleBalance);
      window.removeEventListener(APPEARANCE_CHANGED_EVENT, handleAppearance);
    };
  }, []);

  // Re-read the session on every navigation, so logging in (which lands on
  // /profile) and logging out (which lands on /) both update the bar, and
  // whenever a page reports a balance change.
  useEffect(() => {
    const token = localStorage.getItem('player_token');
    if (!token) {
      setSignedIn(false);
      setBalance(0); // SRS-109.4: guests see a balance of 0 coins.
      setPlayerId(null);
      setOutlineArtKey(null);
      return;
    }

    setSignedIn(true);
    let cancelled = false;

    async function loadBalance(playerToken: string) {
      const res = await fetch('/api/profile/balance', {
        headers: { Authorization: `Bearer ${playerToken}` },
      });
      if (cancelled) return;

      // The session ended elsewhere (a newer login, SRS-103.5), so this
      // browser is no longer logged in.
      if (res.status === 401) {
        localStorage.removeItem('player_token');
        setSignedIn(false);
        setBalance(0);
        setPlayerId(null);
        setOutlineArtKey(null);
        return;
      }

      if (!res.ok) return;
      const data = await res.json();
      if (cancelled) return;
      setBalance(data.balance);
      setPlayerId(data.playerId ?? null);
      setOutlineArtKey(data.outlineArtKey ?? null);
    }

    loadBalance(token).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname, balanceVersion, appearanceVersion]);

  // The small (96px) avatar, fetched only when the player or their photo
  // changes, not on every navigation.
  useEffect(() => {
    if (playerId === null) {
      setAvatarUrl(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/players/${playerId}/avatar`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setAvatarUrl(data.avatarUrl ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [playerId, appearanceVersion]);

  // SRS-111.3: guests are sent to log in (the login page links to sign up).
  const profileHref = signedIn ? '/profile' : '/login';
  const balanceText = balance === null ? '—' : balance.toLocaleString();
  const accent = signedIn && outlineArtKey ? OUTLINE_ACCENTS[outlineArtKey] : undefined;

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
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
          {/* SRS-120.8: bordered in the equipped outline's colors, as a
              1.5px gradient frame around the pill. */}
          <span
            className="h-12 rounded-full p-[1.5px]"
            style={
              accent
                ? {
                    background: `linear-gradient(90deg, ${accent.colors.join(', ')})`,
                    boxShadow: accent.glow ? `0 0 10px ${accent.glow}55` : undefined,
                  }
                : { background: '#1e293b' }
            }
          >
            <span
              title={`Balance: ${balanceText} coins`}
              className="flex h-full items-center gap-2 rounded-full bg-slate-900 px-4 text-base font-medium text-slate-100"
            >
              <span aria-hidden="true" className="h-4 w-4 rounded-full bg-amber-400 ring-2 ring-amber-300/30" />
              {balanceText}
              <span className="sr-only">coins</span>
            </span>
          </span>
          {signedIn ? (
            <ProfileBadge active={pathname === profileHref} avatarUrl={avatarUrl} outlineArtKey={outlineArtKey} />
          ) : (
            <NavIcon href={profileHref} label="Log in or sign up" active={pathname === profileHref}>
              <circle cx="12" cy="8.5" r="3.5" />
              <path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5" />
            </NavIcon>
          )}
        </div>
      </nav>
    </header>
  );
}

// SRS-120.7: the logged-in player's photo (or the blank icon) inside their
// equipped profile outline. The outline's drawing is 1.5x the photo, so a
// 40px photo takes a 60px badge, which fits the 64px bar; the ring itself
// reaches about 48px across, the height of the other icons and the balance.
function ProfileBadge({ active, avatarUrl, outlineArtKey }: { active: boolean; avatarUrl: string | null; outlineArtKey: string | null }) {
  return (
    <Link
      href="/profile"
      aria-label="Your profile"
      title="Your profile"
      aria-current={active ? 'page' : undefined}
      className="group relative flex h-[60px] w-[60px] items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
    >
      <span
        className={`h-10 w-10 overflow-hidden rounded-full bg-slate-800 transition group-hover:brightness-125 ${
          outlineArtKey ? '' : `border ${active ? 'border-emerald-400' : 'border-slate-700'}`
        }`}
      >
        {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : <DefaultAvatar />}
      </span>
      {outlineArtKey ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0">
          <CosmeticArt artKey={outlineArtKey} avatar={false} className="h-full w-full" />
        </span>
      ) : null}
    </Link>
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
      className={`flex h-12 w-12 items-center justify-center rounded-full border bg-slate-900 transition hover:border-emerald-400 hover:text-emerald-200 ${
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
        className="h-6 w-6"
      >
        {children}
      </svg>
    </Link>
  );
}
