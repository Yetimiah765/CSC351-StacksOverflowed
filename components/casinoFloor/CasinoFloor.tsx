'use client';

import { Oswald } from 'next/font/google';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  ENTRANCE_KEY,
  INTERACTIVE_OBJECTS,
  SEAT_KEY,
  SPOT_KEY,
  VISITED_KEY,
  parseSpot,
  parseTakenSeat,
  serializeSpot,
  serializeTakenSeat,
  type FloorObject,
  type StoodSpot,
  type TakenSeat,
} from '../../lib/casinoFloor';
import { notifyBalanceChanged } from '../../lib/balanceEvents';
import { CHECK_IN_EVENT, canDraw3d, takeHandedOverCheckIn, type CheckInForm, type HandOver } from '../../lib/checkIn';
import { logOut, takeWalkOut } from '../../lib/logOut';
import { playHref, useSignedIn } from '../useSignedIn';
import CheckInTablet from './CheckInTablet';
import type { DoorsSide, WalkInput } from './Scene';

// The home page: a 3D casino floor to walk around, the camera following the
// player from behind (./Scene.tsx draws it; lib/casinoFloor.ts has the
// layout and rules). WASD or the arrow keys walk, dragging looks around,
// scrolling zooms, and clicking a spot walks there. Next to a game its
// nearest chair (or screen) is outlined in white, its name floats over it,
// and a help box says how to play
// it; Space, Enter, or clicking the game (or the box) plays it: the player
// sits down in the outlined chair and the camera flies in over the table
// (into the screen at the sports bar), then the game opens — guests are sent
// to log in (SRS-108.3), and a game that isn't ready says so. A plain
// list of the games sits under the floor for anyone who'd rather not walk,
// or whose browser can't draw 3D (SRS-107.1). The seat taken is remembered
// for the tab, so back from the game the player is seen getting up from it
// (SRS-108.6). Through the gate in the rail, at the casino's doors, a
// logged-in player can log out: they're seen walking out through the doors
// into the lobby, a guest again, without the page changing (SRS-105.5).
// Guests sign up or log in at a check-in tablet on the lobby's front desk
// (SRS-103.13), which the Sign up and Log in buttons, the nav bar's profile
// icon and the login and registration pages all walk them to (SRS-103.16).

const display = Oswald({ weight: ['500', '700'], subsets: ['latin'], display: 'swap' });

// three.js is big: load it only on this page, and only in the browser.
const Scene = dynamic(() => import('./Scene'), {
  ssr: false,
  loading: () => <FloorMessage text="Opening the casino…" />,
});

const KEYS: Record<string, Exclude<keyof WalkInput, 'slow'>> = {
  ArrowUp: 'forward',
  ArrowDown: 'back',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'forward',
  s: 'back',
  a: 'left',
  d: 'right',
};

function FloorMessage({ text }: { text: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#06030a] text-sm uppercase tracking-[0.3em] text-slate-400">
      <span className="animate-pulse">{text}</span>
    </div>
  );
}

// The seat lives in sessionStorage, which can be blocked (a private window,
// say); then there's just nothing to get up from.
function readTakenSeat(): TakenSeat | null {
  try {
    return parseTakenSeat(sessionStorage.getItem(SEAT_KEY));
  } catch {
    return null;
  }
}

function rememberTakenSeat(seat: TakenSeat) {
  try {
    sessionStorage.setItem(SEAT_KEY, serializeTakenSeat(seat));
  } catch {
    // Not remembered: the player just appears at the door next time.
  }
}

// Once they're up, a reload starts at the door as usual.
function forgetTakenSeat() {
  try {
    sessionStorage.removeItem(SEAT_KEY);
  } catch {
    // Nothing to forget.
  }
}

// Where the player last stood in this tab (SRS-107.7), if they may still
// stand there.
function readSpot(guest: boolean): StoodSpot | null {
  try {
    return parseSpot(sessionStorage.getItem(SPOT_KEY), guest);
  } catch {
    return null;
  }
}

function rememberSpot(spot: StoodSpot) {
  try {
    sessionStorage.setItem(SPOT_KEY, serializeSpot(spot));
  } catch {
    // Not remembered: they start at the door, or in the lobby, next time.
  }
}

// Walking in (SRS-103.12): the first time the home page opens in the tab,
// and just after logging in (the login page leaves ENTRANCE_KEY), the player
// starts outside and walks in, unless the device asks for reduced motion.
// Once they're in (or if they aren't walking in), the tab remembers it's
// been opened and the login is forgotten. (Only read here, and written when
// it's over, so React running the page's first effect twice in development
// doesn't lose the first visit.)
function wantsEntrance() {
  try {
    const firstVisit = sessionStorage.getItem(VISITED_KEY) === null;
    const justLoggedIn = sessionStorage.getItem(ENTRANCE_KEY) === '1';
    return (firstVisit || justLoggedIn) && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function forgetEntrance() {
  try {
    sessionStorage.removeItem(ENTRANCE_KEY);
    sessionStorage.setItem(VISITED_KEY, '1');
  } catch {
    // Nothing to forget.
  }
}

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export default function CasinoFloor() {
  const router = useRouter();
  const signedIn = useSignedIn();
  const input = useRef<WalkInput>({ forward: false, back: false, left: false, right: false, slow: false });
  const [near, setNear] = useState<FloorObject | null>(null);
  const nearRef = useRef<FloorObject | null>(null);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  // The seat taken to open a game, read once the page is in the browser:
  // undefined until then, null when there's nothing to get up from.
  const [returning, setReturning] = useState<TakenSeat | null | undefined>(undefined);
  // Walking in (SRS-103.12); never when back from a game.
  const [entering, setEntering] = useState(false);
  // Where they last stood, when they're not getting up or walking in (SRS-107.7).
  const [spot, setSpot] = useState<StoodSpot | null>(null);

  // Whether the session this browser holds is still good: one that ended
  // elsewhere (a newer login, or it ran out) makes them a guest, put in the
  // lobby (SRS-107.7). Null until known; false for a guest.
  const [sessionOk, setSessionOk] = useState<boolean | null>(null);
  useEffect(() => {
    if (signedIn === null) return;
    if (!signedIn) {
      setSessionOk(false);
      return;
    }
    let cancelled = false;
    fetch('/api/profile/balance', { headers: { Authorization: `Bearer ${localStorage.getItem('player_token') ?? ''}` } })
      .then((res) => {
        if (cancelled) return;
        if (res.status === 401) {
          localStorage.removeItem('player_token');
          notifyBalanceChanged();
          setSessionOk(false);
        } else {
          setSessionOk(true);
        }
      })
      // Offline or the like: take the session as good; the games check it anyway.
      .catch(() => {
        if (!cancelled) setSessionOk(true);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  useEffect(() => {
    setWebgl(canDraw3d());
  }, []);

  // Once it's known who they are, where they start: getting up from the seat
  // they took to open a game, walking in, or back where they last stood. A
  // guest (perhaps because their session ended) gets up from no seat.
  const placed = useRef(false);
  // Handed over by the login or registration page (SRS-103.16): for a guest,
  // the tablet to open once they're placed (a logged-in player just starts
  // on the floor). Turned away from a game's page, they don't walk in first
  // (SRS-108.8).
  const [handedOver, setHandedOver] = useState<HandOver | null>(null);
  // Logged out on the profile (SRS-105.6): they're shown leaving from where
  // they were (getting up from their seat, or from where they stood on the
  // floor) and walking out into the lobby, a guest from then on; with
  // reduced motion they're just a guest in the lobby.
  const [outAfterProfile, setOutAfterProfile] = useState(false);
  const outAfterProfileRef = useRef(false);
  useEffect(() => {
    if (sessionOk === null || placed.current) return;
    placed.current = true;
    // (Each read, and so forgotten, either way; walking out comes first.)
    const walkOut = takeWalkOut() && !sessionOk && !prefersReducedMotion();
    const handed = takeHandedOverCheckIn();
    const handOver = sessionOk || walkOut ? null : handed;
    setHandedOver(handOver);
    let seat = readTakenSeat();
    if (seat && !sessionOk && !walkOut) {
      forgetTakenSeat();
      seat = null;
    }
    setReturning(seat);
    const walkIn = wantsEntrance() && !seat && !handOver?.play && !walkOut;
    if (!walkIn) forgetEntrance();
    setEntering(walkIn);
    setSpot(!walkIn && !seat ? readSpot(!sessionOk && !walkOut) : null);
    if (walkOut) {
      outAfterProfileRef.current = true;
      setOutAfterProfile(true);
      // Getting up first, if they were seated (see onStood); then the walk.
      if (!seat) setLeaving('walk');
    }
  }, [sessionOk]);

  // The game being sat down at (the scene plays the sitting and the camera
  // flying in), then, once that's over, the one whose page is opening.
  const [playing, setPlaying] = useState<FloorObject | null>(null);
  const [opening, setOpening] = useState(false);

  // Playing a game: the scene sits the player down at it; further presses
  // are ignored until its page opens.
  const play = useRef<(object: FloorObject) => void>(() => {});
  play.current = (object) => {
    if (!object.interactive?.href || playing) return;
    setPlaying(object);
  };
  // Logging out at the casino's doors, or in at a check-in tablet, changes
  // who they are without changing page: null until then, as the session
  // check found.
  const [signedInHere, setSignedInHere] = useState<boolean | null>(null);
  const member = signedInHere ?? sessionOk === true;
  const guest = signedInHere === null ? sessionOk === false : !signedInHere;
  // Leaving through the casino's doors (SRS-105.5): the session ends at once
  // (and the nav bar shows a guest once it has), while the scene walks the
  // player out into the lobby ('walk'), or puts them straight there when the
  // device asks for reduced motion ('now'). From then on they're a guest.
  const canLeave = member;
  // In reach of the casino's doors, from the foyer ('floor') or, for a guest,
  // the lobby ('lobby'), where using them walks the guest to the front desk
  // to check in (SRS-103.15).
  const [nearDoors, setNearDoors] = useState<DoorsSide>(null);
  const nearDoorsRef = useRef<DoorsSide>(null);
  const [leaving, setLeaving] = useState<'walk' | 'now' | null>(null);
  const leave = useRef<() => void>(() => {});
  leave.current = () => {
    if (!canLeave || leaving || playing) return;
    void logOut().then(notifyBalanceChanged);
    setLeaving(prefersReducedMotion() ? 'now' : 'walk');
  };
  const left = useRef<() => void>(() => {});
  left.current = () => {
    setLeaving(null);
    setSignedInHere(false);
    outAfterProfileRef.current = false;
    setOutAfterProfile(false);
  };

  // Checking in at a front-desk tablet (SRS-103.13): the camera flies in
  // (straight there with reduced motion), then the tablet's up close, with
  // the scene paused behind it; stepping away flies back out. Once they've
  // logged in there, the tablet closes the same way and the scene walks them
  // from the desk onto the casino floor (SRS-103.14), or puts them straight
  // there with reduced motion; the nav bar shows their balance.
  const [nearKiosk, setNearKiosk] = useState<number | null>(null);
  const nearKioskRef = useRef<number | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [tabletOpen, setTabletOpen] = useState(false);
  // The form the tablet opens on: sign-up, unless they asked to log in.
  const [tabletForm, setTabletForm] = useState<CheckInForm>('signup');
  // Checking in to play (SRS-108.8): picked from the game list below the
  // floor, or turned away from a game's page, the tablet opens straight
  // away (no walk to the desk, no camera flying in), and once they've
  // logged in it's straight on to that page.
  const [playAfter, setPlayAfter] = useState<string | null>(null);
  const checkIn = useRef<(form?: CheckInForm, play?: string | null) => void>(() => {});
  checkIn.current = (form = 'signup', play = null) => {
    if (!guest || checkingIn || leaving || playing) return;
    setTabletForm(form);
    setPlayAfter(play);
    setCheckingIn(true);
  };
  // Checking in from the page (SRS-103.16): the Sign up and Log in buttons,
  // the nav bar's profile icon (which asks with CHECK_IN_EVENT rather than
  // opening the sign-up page), and a form handed over by the login or
  // registration page all walk a guest to the desk, when the 3D lobby's
  // showing.
  const askedToCheckIn = useRef<(event: Event) => void>(() => {});
  askedToCheckIn.current = (event) => {
    if (!webgl || !guest) return;
    event.preventDefault();
    checkIn.current((event as CustomEvent<CheckInForm>).detail);
  };
  useEffect(() => {
    const ask = (event: Event) => askedToCheckIn.current(event);
    window.addEventListener(CHECK_IN_EVENT, ask);
    return () => window.removeEventListener(CHECK_IN_EVENT, ask);
  }, []);
  useEffect(() => {
    if (!handedOver || !guest || !webgl) return;
    setHandedOver(null);
    checkIn.current(handedOver.form, handedOver.play);
  }, [handedOver, guest, webgl]);
  function checkedIn() {
    setSignedInHere(true);
    notifyBalanceChanged();
    if (playAfter) {
      router.push(playAfter);
      return;
    }
    setTabletOpen(false);
    setCheckingIn(false);
  }

  // Seated, the camera over the table: open the game — guests go to log in
  // (SRS-108.3). The scene stops drawing, holding that last frame while the
  // page (already prefetched) loads.
  const seated = useRef<(object: FloorObject, spot: number | null) => void>(() => {});
  seated.current = (object, spot) => {
    const href = object.interactive?.href;
    if (!href) return;
    rememberTakenSeat({ object, spot });
    setOpening(true);
    router.push(playHref(member, href));
  };

  // Load every game's page in the background, so walking up to one and
  // pressing Space opens it right away.
  useEffect(() => {
    if (sessionOk === null) return;
    for (const object of INTERACTIVE_OBJECTS) {
      if (object.interactive?.href) router.prefetch(playHref(member, object.interactive.href));
    }
  }, [router, sessionOk, member]);

  // Keys: walk while held; Space or Enter checks in at the tablet in reach
  // (or, for a guest, at the casino's doors), leaves through the casino's
  // doors, or plays the game in reach.
  useEffect(() => {
    const typing = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      return Boolean(target?.closest('input, textarea, select, [contenteditable="true"]'));
    };
    const down = (event: KeyboardEvent) => {
      input.current.slow = event.shiftKey;
      if (typing(event) || event.metaKey || event.ctrlKey || event.altKey) return;
      const key = KEYS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (key) {
        event.preventDefault();
        // Walking means playing the floor: let go of a focused link or button
        // (like a game's back button after coming back from it), so
        // Space and Enter then go to the game in reach rather than to it.
        const focused = document.activeElement as HTMLElement | null;
        if (focused?.closest('a, button')) focused.blur();
        input.current[key] = true;
        return;
      }
      if (event.key === ' ' || event.key === 'Enter') {
        // Only take over Space/Enter for the floor, not a focused link or button.
        if ((event.target as HTMLElement | null)?.closest('a, button')) return;
        event.preventDefault();
        if (nearKioskRef.current !== null || nearDoorsRef.current === 'lobby') checkIn.current();
        else if (nearDoorsRef.current === 'floor') leave.current();
        else if (nearRef.current) play.current(nearRef.current);
      }
    };
    const up = (event: KeyboardEvent) => {
      input.current.slow = event.shiftKey;
      const key = KEYS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (key) input.current[key] = false;
    };
    const release = () => {
      input.current = { forward: false, back: false, left: false, right: false, slow: false };
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', release);
    };
  }, []);

  const label = near?.interactive;
  const ready = Boolean(label?.href);

  return (
    <>
      <div className={`${display.className} flex min-h-0 flex-1 flex-col gap-3 px-3 py-3 sm:px-6`}>
        {/* How to play, and (for guests) sign up or log in. The website's name
            is in the nav bar now (SRS-107.5), so it's only named here for
            screen readers. */}
        <header className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300">
          <h1 className="sr-only">Stacks Overflowed Casino</h1>
          <p className="hidden flex-1 text-center uppercase tracking-[0.15em] text-slate-400 md:block">
            WASD to move · Shift to walk · drag to look · Space to play
          </p>
          {guest ? (
            <div className="flex gap-2 uppercase tracking-wider">
              {/* With the 3D lobby, to the front desk (SRS-103.16); without it, the plain pages. */}
              <Link
                href="/register"
                onClick={(event) => {
                  if (!webgl) return;
                  event.preventDefault();
                  checkIn.current('signup');
                }}
                className="rounded bg-emerald-400 px-4 py-2 font-bold text-slate-950 transition hover:bg-emerald-300"
              >
                Sign up
              </Link>
              <Link
                href="/login"
                onClick={(event) => {
                  if (!webgl) return;
                  event.preventDefault();
                  checkIn.current('login');
                }}
                className="rounded border border-slate-600 bg-slate-900 px-4 py-2 text-slate-100 transition hover:border-emerald-300"
              >
                Log in
              </Link>
            </div>
          ) : null}
        </header>

        {/* The floor fills the rest of the window (on a phone, a fixed height). */}
        <div className="relative h-[70vh] min-h-[320px] overflow-hidden rounded-xl border border-white/10 bg-[#06030a] shadow-[0_20px_60px_rgba(0,0,0,0.6)] lg:h-auto lg:min-h-0 lg:flex-1">
          {webgl === null || returning === undefined ? (
            <FloorMessage text="Opening the casino…" />
          ) : webgl ? (
            <div
              className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
              role="img"
              aria-label="The casino floor. Walk with WASD or the arrow keys, or click a spot; press Space or Enter next to a game to play it, or at the casino's doors to log out."
            >
              <Scene
                input={input}
                nearId={near?.id ?? null}
                onNear={(object) => {
                  nearRef.current = object;
                  setNear(object);
                }}
                onPlay={(object) => play.current(object)}
                playing={playing}
                onSeated={(object, spot) => seated.current(object, spot)}
                returning={returning}
                onStood={() => {
                  forgetTakenSeat();
                  // Up after logging out on the profile: on out of the casino (SRS-105.6).
                  if (outAfterProfileRef.current) setLeaving('walk');
                }}
                entering={entering}
                onEntered={forgetEntrance}
                canLeave={canLeave}
                onNearDoors={(near) => {
                  nearDoorsRef.current = near;
                  setNearDoors(near);
                }}
                onLeave={() => leave.current()}
                leaving={leaving !== null}
                leaveAtOnce={leaving === 'now'}
                onLeft={() => left.current()}
                guest={guest && !outAfterProfile}
                spot={spot}
                onSpot={rememberSpot}
                onNearKiosk={(kiosk) => {
                  nearKioskRef.current = kiosk;
                  setNearKiosk(kiosk);
                }}
                onCheckIn={() => checkIn.current()}
                checkingIn={checkingIn}
                checkInAtOnce={prefersReducedMotion() || playAfter !== null}
                onAtKiosk={() => setTabletOpen(true)}
                paused={opening || tabletOpen}
              />
            </div>
          ) : (
            <FloorMessage text="This browser can't show the 3D floor — pick a game below." />
          )}

          {nearKiosk !== null && guest && !checkingIn && !playing ? (
            // At a check-in tablet: the same kind of help box, to check in.
            <button
              type="button"
              onClick={() => checkIn.current()}
              className="absolute left-3 top-3 max-w-[min(22rem,calc(100%-1.5rem))] rounded-md bg-black/75 px-4 py-3 text-left text-white shadow-lg backdrop-blur-sm sm:left-5 sm:top-5"
            >
              <span className="block text-lg font-bold uppercase tracking-wider text-amber-300">Check-in kiosk</span>
              <span className="mt-1 block text-sm leading-snug text-slate-200">Sign up, or log in if you already have an account, to play the games.</span>
              <span className="mt-2 block text-sm">
                Press <Key>Space</Key> to check in
              </span>
            </button>
          ) : nearDoors === 'lobby' && guest && !checkingIn && !playing ? (
            // At the casino's doors from the lobby: only for players who've checked in.
            <button
              type="button"
              onClick={() => checkIn.current()}
              className="absolute left-3 top-3 max-w-[min(22rem,calc(100%-1.5rem))] rounded-md bg-black/75 px-4 py-3 text-left text-white shadow-lg backdrop-blur-sm sm:left-5 sm:top-5"
            >
              <span className="block text-lg font-bold uppercase tracking-wider text-amber-300">Casino floor</span>
              <span className="mt-1 block text-sm leading-snug text-slate-200">Check in at the front desk first: sign up, or log in if you already have an account.</span>
              <span className="mt-2 block text-sm">
                Press <Key>Space</Key> to check in
              </span>
            </button>
          ) : nearDoors === 'floor' && canLeave && !leaving && !playing ? (
            // At the casino's doors: the same kind of help box, to leave.
            <button
              type="button"
              onClick={() => leave.current()}
              className="absolute left-3 top-3 max-w-[min(22rem,calc(100%-1.5rem))] rounded-md bg-black/75 px-4 py-3 text-left text-white shadow-lg backdrop-blur-sm sm:left-5 sm:top-5"
            >
              <span className="block text-lg font-bold uppercase tracking-wider text-amber-300">Casino doors</span>
              <span className="mt-1 block text-sm leading-snug text-slate-200">Head back out into the lobby.</span>
              <span className="mt-2 block text-sm">
                Press <Key>Space</Key> to log out
              </span>
            </button>
          ) : near && label && !playing && !leaving ? (
            // The help box, top left, like an open-world game's prompts.
            <button
              type="button"
              onClick={() => play.current(near)}
              disabled={!ready}
              className="absolute left-3 top-3 max-w-[min(22rem,calc(100%-1.5rem))] rounded-md bg-black/75 px-4 py-3 text-left text-white shadow-lg backdrop-blur-sm disabled:cursor-default sm:left-5 sm:top-5"
            >
              <span className="block text-lg font-bold uppercase tracking-wider text-amber-300">{label.name}</span>
              <span className="mt-1 block text-sm leading-snug text-slate-200">{label.description}</span>
              <span className="mt-2 block text-sm">
                {!ready ? (
                  <span className="text-slate-400">Coming soon</span>
                ) : guest ? (
                  <>
                    Press <Key>Space</Key> to log in and play
                  </>
                ) : (
                  <>
                    Press <Key>Space</Key> to play {label.name}
                  </>
                )}
              </span>
            </button>
          ) : null}

          {leaving ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center">
              <span className="animate-pulse rounded-full bg-black/70 px-4 py-2 text-sm uppercase tracking-[0.25em] text-white backdrop-blur-sm">Logging out…</span>
            </div>
          ) : null}

          {opening && playing ? (
            // The camera's over the table; a word while the game opens.
            <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center">
              <span className="animate-pulse rounded-full bg-black/70 px-4 py-2 text-sm uppercase tracking-[0.25em] text-white backdrop-blur-sm">
                {guest ? 'To the login…' : `Opening ${playing.interactive?.name ?? ''}…`}
              </span>
            </div>
          ) : null}
        </div>

        {/* The same games as a plain list, for anyone who'd rather not walk. */}
        <nav aria-label="Games" className="flex flex-wrap items-center justify-center gap-2 text-xs uppercase tracking-wider text-slate-400">
          <span>Or go straight to:</span>
          {INTERACTIVE_OBJECTS.map((object) =>
            object.interactive?.href ? (
              <Link
                key={object.id}
                href={playHref(member, object.interactive.href)}
                onClick={(event) => {
                  // A guest checks in to play, with the 3D lobby (SRS-108.8).
                  if (!guest || !webgl || !object.interactive?.href) return;
                  event.preventDefault();
                  checkIn.current('signup', object.interactive.href);
                }}
                className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-200 transition hover:border-amber-300 hover:text-amber-200"
              >
                {object.interactive.name}
              </Link>
            ) : (
              <span key={object.id} className="rounded border border-slate-800 px-3 py-1.5 text-slate-600">
                {object.interactive?.name} (soon)
              </span>
            )
          )}
        </nav>
      </div>

      {/* Outside the floor's part of the page, so the tablet's screens are in
          the website's own font, as on the sign-up and login pages. */}
      {tabletOpen ? (
        <CheckInTablet
          start={tabletForm}
          onClose={() => {
            setTabletOpen(false);
            setCheckingIn(false);
            setPlayAfter(null);
          }}
          onLoggedIn={checkedIn}
        />
      ) : null}
    </>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return <kbd className="mx-0.5 rounded border border-white/40 bg-white/10 px-1.5 py-0.5 text-xs font-bold uppercase">{children}</kbd>;
}
