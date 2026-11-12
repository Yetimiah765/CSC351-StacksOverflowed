'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { removalNotice } from '../lib/pokerRemovals';
import type { RemovalNoticeView } from '../lib/pokerPersistence';

// SRS-9.12: a player the poker table removed while they were disconnected
// (or had stopped acting, or were busted and gone) wasn't there to be told
// why (SRS-9.11). The next time they open the site — rendered once by
// app/layout.tsx, it checks when the page first loads and whenever a
// different player logs in — any such notices are fetched (POST
// /api/poker/notices, which marks them shown) and shown here until dismissed.

export default function PokerRemovalNotices() {
  const pathname = usePathname();
  const [notices, setNotices] = useState<RemovalNoticeView[]>([]);
  // The session token last checked, so each session is only asked about once.
  const checkedToken = useRef<string | null>(null);

  useEffect(() => {
    let token: string | null = null;
    try {
      token = localStorage.getItem('player_token');
    } catch {
      return;
    }
    if (!token || token === checkedToken.current) return;
    checkedToken.current = token;
    fetch('/api/poker/notices', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { notices?: RemovalNoticeView[] } | null) => {
        if (data?.notices && data.notices.length > 0) setNotices((shown) => [...shown, ...(data.notices ?? [])]);
      })
      .catch(() => {});
  }, [pathname]);

  if (notices.length === 0) return null;

  return (
    <div
      role="alertdialog"
      aria-labelledby="poker-removal-title"
      className="fixed inset-x-0 top-20 z-50 mx-auto w-[min(32rem,calc(100%-2rem))] rounded-2xl border border-amber-400/50 bg-slate-950/95 p-4 text-slate-100 shadow-2xl backdrop-blur"
    >
      <h2 id="poker-removal-title" className="text-sm font-bold uppercase tracking-[0.2em] text-amber-300">
        While you were away
      </h2>
      <ul className="mt-2 space-y-2 text-sm">
        {notices.map((notice) => (
          <li key={`${notice.removedAt}-${notice.reason}`}>
            <span className="text-slate-400">
              {notice.tableName ?? 'A poker table'},{' '}
              {new Date(notice.removedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}:
            </span>{' '}
            {removalNotice(notice.reason)}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setNotices([])}
        className="mt-3 rounded bg-amber-400 px-4 py-1.5 text-sm font-bold text-slate-950 transition hover:bg-amber-300"
      >
        OK
      </button>
    </div>
  );
}
