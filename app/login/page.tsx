'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();
    setLoading(false);
    if (response.ok) {
      if (data?.token) localStorage.setItem('player_token', data.token);
      router.push('/profile');
    } else {
      setMessage(data.error || 'Login failed.');
    }
  }

  // SRS-103.9: the same wide form as sign-up (SRS-101.12), username and
  // password side by side (stacked on a phone), and no website name of its
  // own, since the nav bar shows it (SRS-107.5).
  return (
    <main className="min-h-page bg-slate-950 text-slate-100 flex items-center justify-center px-6 py-12">
      <section className="w-full max-w-4xl rounded-3xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl shadow-black/30 sm:p-10">
        <h1 className="text-4xl font-semibold">Welcome back</h1>

        <form onSubmit={handleSubmit} className="mt-8 grid gap-5 sm:grid-cols-2">
          <label className="block text-base text-slate-200">
            Username
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-lg text-slate-100 outline-none ring-0 transition focus:border-emerald-400"
              placeholder="your_username"
            />
          </label>

          <label className="block text-base text-slate-200">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-lg text-slate-100 outline-none ring-0 transition focus:border-emerald-400"
              placeholder="••••••••"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-400 px-4 py-3 text-lg font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70 sm:col-span-2"
          >
            {loading ? 'Signing in…' : 'Log in'}
          </button>
        </form>

        {message ? <p className="mt-4 rounded-xl border border-slate-700 bg-slate-800/80 p-3 text-base text-slate-100">{message}</p> : null}

        <div className="mt-6 flex flex-wrap justify-between gap-x-6 gap-y-2 text-base text-slate-300">
          <p>
            Need an account? <Link href="/register" className="text-emerald-300 hover:underline">Create one here</Link>
          </p>
          <p>
            Back to <Link href="/" className="text-emerald-300 hover:underline">home</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
