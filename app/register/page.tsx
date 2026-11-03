'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function RegisterPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName, birthday, username, password }),
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
  // then username and password); they stack on a phone. The website's name is
  // in the nav bar (SRS-107.5), so the page doesn't repeat it.
  return (
    <main className="min-h-page bg-slate-950 text-slate-100 flex items-center justify-center px-6 py-12">
      <section className="w-full max-w-4xl rounded-3xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl shadow-black/30 sm:p-10">
        <h1 className="text-4xl font-semibold">Create your account</h1>

        <form onSubmit={handleSubmit} className="mt-8 grid items-start gap-5 sm:grid-cols-6">
          <label className="block text-base text-slate-200 sm:col-span-3 lg:col-span-2">
            First name
            <input
              type="text"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-lg text-slate-100 outline-none transition focus:border-emerald-400"
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
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-lg text-slate-100 outline-none transition focus:border-emerald-400"
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
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-lg text-slate-100 outline-none transition focus:border-emerald-400"
            />
            <span className="mt-1 block text-sm text-slate-500">You must be at least 21 years old.</span>
          </label>

          <label className="block text-base text-slate-200 sm:col-span-3">
            Username
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              minLength={6}
              maxLength={10}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-lg text-slate-100 outline-none transition focus:border-emerald-400"
              placeholder="6-10 letters/numbers"
            />
          </label>

          <label className="block text-base text-slate-200 sm:col-span-3">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-lg text-slate-100 outline-none transition focus:border-emerald-400"
              placeholder="8+ letters and numbers"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-400 px-4 py-3 text-lg font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70 sm:col-span-6"
          >
            {loading ? 'Creating account…' : 'Register'}
          </button>
        </form>

        {message ? <p className="mt-4 rounded-xl border border-slate-700 bg-slate-800/80 p-3 text-base text-slate-100">{message}</p> : null}

        <div className="mt-6 flex flex-wrap justify-between gap-x-6 gap-y-2 text-base text-slate-300">
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
