'use client';

import { useEffect, useRef, useState } from 'react';
import AuthLink, { type AuthLinkTo } from './AuthLink';
import CardsAndChipsBackground from './CardsAndChipsBackground';
import PokerWinHeader from './PokerWinHeader';

// The login screen, shared by the login page and the lobby's check-in
// tablet (SRS-103.13), which differ only in what its links do, what happens
// once the player's logged in, and whether it fills the window or the
// tablet.

interface Props {
  /** Just signed up with this username (SRS-101.15): fill it in, say so, and wait in the password box. */
  registered?: string | null;
  /** Logged in: the session's token is already stored. */
  onLoggedIn: () => void;
  /** Where "create one here" (and "sign up", for an account that isn't found) goes. */
  signUp: AuthLinkTo;
  /** On the check-in tablet: fill it, and leave out "Back to home". */
  onTablet?: boolean;
}

export default function LoginScreen({ registered, onLoggedIn, signUp, onTablet = false }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [accountNotFound, setAccountNotFound] = useState(false);
  const [notice, setNotice] = useState('');
  const passwordRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  // SRS-101.15: coming straight from sign-up, the new username is filled in
  // and the cursor waits in the password box.
  useEffect(() => {
    if (!registered) return;
    setUsername(registered);
    setNotice('Account created. Log in with your new password.');
    passwordRef.current?.focus();
  }, [registered]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    setNotice('');
    setAccountNotFound(false);

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();
    setLoading(false);
    if (response.ok) {
      if (data?.token) localStorage.setItem('player_token', data.token);
      onLoggedIn();
    } else {
      setMessage(data.error || 'Login failed.');
      setAccountNotFound(Boolean(data?.accountNotFound));
    }
  }

  // SRS-103.9: the same wide form as sign-up (SRS-101.12), username and
  // password side by side (stacked on a phone), and no website name of its
  // own, since the nav bar shows it (SRS-107.5). SRS-103.10: sign-up's
  // falling cards and chips (SRS-101.13) behind it, and its own header across
  // the top: one animation of a won poker hand, its pot stacked into towers.
  return (
    <main className={`relative ${onTablet ? 'min-h-full' : 'min-h-page'} bg-slate-950 text-slate-100 flex items-center justify-center px-6 py-10`}>
      <CardsAndChipsBackground />
      <section className="relative w-full max-w-4xl rounded-3xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl shadow-black/40 sm:p-12 sm:pb-16">
        <div className="-mx-8 -mt-8 mb-10 overflow-hidden rounded-t-[23px] border-b border-white/10 sm:-mx-12 sm:-mt-12">
          <PokerWinHeader />
        </div>
        <h1 className="text-4xl font-semibold sm:text-5xl">Welcome back</h1>
        {notice ? (
          <p role="status" className="mt-6 rounded-xl border border-emerald-800 bg-emerald-900/30 p-3 text-base text-emerald-200">
            {notice}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-12 grid items-start gap-x-6 gap-y-10 sm:grid-cols-2">
          <label className="block text-base text-slate-200">
            Username
            <input
              type="text"
              value={username}
              autoComplete="username"
              onChange={(event) => setUsername(event.target.value)}
              required
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-5 text-lg text-slate-100 outline-none transition focus:border-emerald-400"
              placeholder="your_username"
            />
          </label>

          <label className="block text-base text-slate-200">
            Password
            <input
              ref={passwordRef}
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-5 text-lg text-slate-100 outline-none transition focus:border-emerald-400"
              placeholder="••••••••"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full rounded-xl bg-emerald-400 px-4 py-5 text-lg font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70 sm:col-span-2"
          >
            {loading ? 'Signing in…' : 'Log in'}
          </button>
        </form>

        {message ? (
          <p role="alert" className="mt-4 rounded-xl border border-slate-700 bg-slate-800/80 p-3 text-base text-slate-100">
            {message}
            {/* SRS-104.7: no such account, so offer to make one. */}
            {accountNotFound ? (
              <>
                {' '}
                <AuthLink to={signUp} className="font-semibold text-emerald-300 hover:underline">
                  Sign up
                </AuthLink>{' '}
                to create an account.
              </>
            ) : null}
          </p>
        ) : null}

        <div className="mt-12 flex flex-wrap justify-between gap-x-6 gap-y-2 text-base text-slate-300">
          <p>
            Need an account?{' '}
            <AuthLink to={signUp} className="text-emerald-300 hover:underline">
              Create one here
            </AuthLink>
          </p>
          {onTablet ? null : (
            <p>
              Back to <AuthLink to={{ href: '/' }} className="text-emerald-300 hover:underline">home</AuthLink>
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
