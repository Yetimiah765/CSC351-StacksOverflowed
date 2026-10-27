'use client';

// Small pieces shared by the sportsbook (app/sports/page.tsx) and The
// Showdown (app/sports/showdown/page.tsx).

import { useEffect, useState } from 'react';
import type { SportsEvent } from '../../lib/sports/events';
import { teamAccent, teamInfo, teamLogoUrl } from '../../lib/sports/teams';

// Shown on the sport filter buttons and Showdown cards; sports without an
// icon just show text.
export const SPORT_ICONS: Record<string, string> = {
  'American Football': '🏈',
  Basketball: '🏀',
  Baseball: '⚾',
  'Ice Hockey': '🏒',
  Soccer: '⚽',
};

// "Tampa Bay Buccaneers" -> "TBB", "Dallas Cowboys" -> "DC".
export function teamInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
}

// A stable made-up color for teams that aren't in lib/sports/teams.ts.
export function teamHue(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

// The team's color for bars and highlights on the dark background.
export function teamColor(name: string) {
  return teamAccent(name) ?? `hsl(${teamHue(name)} 60% 45%)`;
}

const CREST_SIZES = {
  sm: { box: 'h-8 w-8 text-[0.65rem]', logoPx: 64, border: 2 },
  lg: { box: 'h-20 w-20 text-xl sm:h-28 sm:w-28 sm:text-3xl', logoPx: 224, border: 4 },
};

// A team's logo from ESPN's image server in a light circle ringed in the
// team's color (light, so dark logos like the Raiders' still show). Falls
// back to the team's initials when the logo can't load or the team isn't
// listed in lib/sports/teams.ts.
export function TeamCrest({ name, size = 'sm', className = '' }: { name: string; size?: keyof typeof CREST_SIZES; className?: string }) {
  const { box, logoPx, border } = CREST_SIZES[size];
  const info = teamInfo(name);
  const logo = teamLogoUrl(name, logoPx);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [name]);

  const ring = info?.primary ?? `hsl(${teamHue(name)} 55% 42%)`;

  if (logo && !failed) {
    return (
      <span
        aria-hidden="true"
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full ${box} ${className}`}
        style={{ backgroundColor: '#f8fafc', boxShadow: `0 0 0 ${border}px ${ring}` }}
      >
        {/* A plain <img>: next/image would need ESPN added to next.config.js. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo}
          alt=""
          width={logoPx / 2}
          height={logoPx / 2}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-[78%] w-[78%] object-contain"
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-bold tracking-tight ${box} ${className}`}
      style={
        info
          ? { backgroundColor: info.primary, color: '#ffffff', boxShadow: `0 0 0 ${border}px ${info.secondary}` }
          : {
              backgroundColor: `hsl(${teamHue(name)} 45% 22%)`,
              color: `hsl(${teamHue(name)} 85% 85%)`,
              boxShadow: `0 0 0 ${border / 2}px hsl(${teamHue(name)} 55% 42%)`,
            }
      }
    >
      {teamInitials(name)}
    </span>
  );
}

// Team names and logos belong to the leagues and teams; shown under any page
// that displays the logos.
export function LogoNotice() {
  return (
    <p className="mt-10 text-center text-xs text-slate-600">
      Team names and logos are trademarks of their respective owners. Stacks Overflowed is not affiliated with the NFL, the NBA,
      or the NHL. Logos courtesy of ESPN.
    </p>
  );
}

// "Starts in 2h 15m" for games in the next day; null otherwise.
export function startsIn(iso: string, now: number) {
  const minutes = Math.round((new Date(iso).getTime() - now) / 60_000);
  if (minutes <= 0 || minutes >= 24 * 60) return null;
  if (minutes < 15) return 'Starting soon';
  const hours = Math.floor(minutes / 60);
  return `Starts in ${hours > 0 ? `${hours}h ` : ''}${minutes % 60}m`;
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function StatusBadge({ status }: { status: SportsEvent['status'] }) {
  const styles: Record<SportsEvent['status'], string> = {
    Upcoming: 'border-slate-700 bg-slate-800 text-slate-300',
    'In Progress': 'border-amber-500/50 bg-amber-500/10 text-amber-200',
    Completed: 'border-slate-700 bg-slate-900 text-slate-400',
    Canceled: 'border-red-800 bg-red-950/60 text-red-200',
    Postponed: 'border-red-800 bg-red-950/60 text-red-200',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${styles[status]}`}>
      {status === 'In Progress' ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" /> : null}
      {status}
    </span>
  );
}
