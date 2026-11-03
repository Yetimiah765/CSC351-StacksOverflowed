'use client';

import Link from 'next/link';
import { useState } from 'react';
import CardsAndChipsBackground from '../../components/auth/CardsAndChipsBackground';
import CasinoMoments from '../../components/auth/CasinoMoments';

export default function RegisterPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // SRS-101.14: warn as soon as the second entry differs, and don't send it.
  const mismatch = confirmPassword !== '' && password !== confirmPassword;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mismatch) return;
    setLoading(true);
    setMessage('');

    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName, birthday, username, password, confirmPassword }),
    });

    const data = await response.json();
    setLoading(false);

    if (response.ok) {
      setMessage('Account created. You can log in now.');
      return;
    }

    const detailParts = [data.error || 'Registration failed.'];
    if (data.code) detailParts.push(`code: ${data.code}`);
    setMessage(detailParts.join(' — '));
  }

  // SRS-101.12: a wide form with the fields side by side (names and birthday,
  // then username, password and the password again, SRS-101.14); they stack
  // on a phone. The website's name is
  // in the nav bar (SRS-107.5), so the page doesn't repeat it. SRS-101.13:
  // cards and chips fall behind it, showing faintly through the form (no
  // backdrop blur: re-blurring moving pieces every frame halved the frame
  // rate), and game moments zoom into each other in a header across its top.
  return (
    <main className="relative min-h-page bg-slate-950 text-slate-100 flex items-center justify-center px-6 py-10">
      <CardsAndChipsBackground />
      <section className="relative w-full max-w-4xl rounded-3xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl shadow-black/40 sm:p-12 sm:pb-16">
        <div className="-mx-8 -mt-8 mb-10 overflow-hidden rounded-t-[23px] border-b border-white/10 sm:-mx-12 sm:-mt-12">
          <CasinoMoments />
        </div>
        <h1 className="text-4xl font-semibold sm:text-5xl">Create your account</h1>

        <form onSubmit={handleSubmit} className="mt-12 grid items-start gap-x-6 gap-y-10 sm:grid-cols-6">
          <label className="block text-base text-slate-200 sm:col-span-3 lg:col-span-2">
            First name
            <input
              type="text"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              required
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-5 text-lg text-slate-100 outline-none transition focus:border-emerald-400"
              placeholder="Jamie"
            />
          </label>
          <label className="block text-base text-slate-200 sm:col-span-3 lg:col-span-2">
            Last name
            <input
              type="text"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              required
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-5 text-lg text-slate-100 outline-none transition focus:border-emerald-400"
              placeholder="Rivera"
            />
          </label>

          <label className="block text-base text-slate-200 sm:col-span-6 lg:col-span-2">
            Birthday
            <input
              type="date"
              value={birthday}
              onChange={(event) => setBirthday(event.target.value)}
              required
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-5 text-lg text-slate-100 outline-none transition focus:border-emerald-400"
            />
            <span className="mt-2 block text-sm text-slate-500">You must be at least 21 years old.</span>
          </label>

          <label className="block text-base text-slate-200 sm:col-span-6 lg:col-span-2">
            Username
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              minLength={6}
              maxLength={10}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-5 text-lg text-slate-100 outline-none transition focus:border-emerald-400"
              placeholder="6-10 letters/numbers"
            />
          </label>

          <label className="block text-base text-slate-200 sm:col-span-3 lg:col-span-2">
            Password
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-5 text-lg text-slate-100 outline-none transition focus:border-emerald-400"
              placeholder="8+ letters and numbers"
            />
          </label>

          <label className="block text-base text-slate-200 sm:col-span-3 lg:col-span-2">
            Confirm password
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              aria-invalid={mismatch}
              className={`mt-2 w-full rounded-xl border bg-slate-950 px-4 py-5 text-lg text-slate-100 outline-none transition ${
                mismatch ? 'border-red-400 focus:border-red-400' : 'border-slate-700 focus:border-emerald-400'
              }`}
              placeholder="Type it again"
            />
            {mismatch ? (
              <span aria-live="polite" className="mt-2 block text-sm font-semibold text-red-400">
                The passwords don&apos;t match.
              </span>
            ) : null}
          </label>

          <button
            type="submit"
            disabled={loading || mismatch}
            className="mt-4 w-full rounded-xl bg-emerald-400 px-4 py-5 text-lg font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70 sm:col-span-6"
          >
            {loading ? 'Creating account…' : 'Register'}
          </button>
        </form>

        {message ? <p className="mt-4 rounded-xl border border-slate-700 bg-slate-800/80 p-3 text-base text-slate-100">{message}</p> : null}

        <div className="mt-12 flex flex-wrap justify-between gap-x-6 gap-y-2 text-base text-slate-300">
          <p>
            Already have an account? <Link href="/login" className="text-emerald-300 hover:underline">Sign in</Link>
          </p>
          <p>
            Back to <Link href="/" className="text-emerald-300 hover:underline">home</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
