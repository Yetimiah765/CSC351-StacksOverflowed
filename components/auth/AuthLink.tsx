'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

/** Where a link on the login or sign-up screen goes: another page, or (on the check-in tablet) another screen. */
export type AuthLinkTo = { href: string } | { onClick: () => void };

/** A link on the login or sign-up screen: a page link, or a button that looks like one. */
export default function AuthLink({ to, className, children }: { to: AuthLinkTo; className: string; children: ReactNode }) {
  if ('href' in to) {
    return (
      <Link href={to.href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={to.onClick} className={className}>
      {children}
    </button>
  );
}
