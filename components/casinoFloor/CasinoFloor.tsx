'use client';

import { Oswald } from 'next/font/google';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ENTRANCE_KEY,
  INTERACTIVE_OBJECTS,
  SEAT_KEY,
  SPOT_KEY,
  VISITED_KEY,
  coinLanding,
  isInLobby,
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
import { formatCountdown } from '../../lib/dailyLoginBox';
import { DRINK_KEY, EMPTY_METER, addSip, canOrder, meterAt, parseMeter, serializeMeter, sloshAmount, type DrinkMeter } from '../../lib/drinks';
import { logOut, takeWalkOut } from '../../lib/logOut';
import { WISH_COIN_KEY, parseCoinSpot, serializeCoinSpot, wishDay } from '../../lib/wishingFountain';
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
    <div className="absolute inset-0 flex items-center justify-center bg-black text-sm uppercase tracking-[0.3em] text-slate-400">
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

// The drink meter lives in sessionStorage too, so it carries on (still going
// down) across a game's page and a reload.
function readDrinkMeter(): DrinkMeter {
  try {
    return parseMeter(sessionStorage.getItem(DRINK_KEY));
  } catch {
    return EMPTY_METER;
  }
}

function saveDrinkMeter(meter: DrinkMeter) {
  try {
    sessionStorage.setItem(DRINK_KEY, serializeMeter(meter));
  } catch {
    // Not kept, then: it lasts as long as the page.
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
  // where they would anyway). Turned away from a game's page, they don't walk in first
  // (SRS-108.8).
  const [handedOver, setHandedOver] = useState<HandOver | null>(null);
  // Logged out on the profile (SRS-105.6): they're shown leaving from where
  // they were (getting up from their seat, or from where they stood on the
  // floor) and walking out into the lobby, a guest from then on; with
  // reduced motion they're just a guest in the lobby. Last in the lobby (or
  // nowhere remembered, so where everyone starts), they stay there, a guest.
  const [outAfterProfile, setOutAfterProfile] = useState(false);
  const outAfterProfileRef = useRef(false);
  useEffect(() => {
    if (sessionOk === null || placed.current) return;
    placed.current = true;
    // (Each read, and so forgotten, either way; walking out comes first.)
    let walkOut = takeWalkOut() && !sessionOk && !prefersReducedMotion();
    const handed = takeHandedOverCheckIn();
    let seat = readTakenSeat();
    if (walkOut && !seat) {
      const last = readSpot(false);
      if (!last || isInLobby(last)) walkOut = false;
    }
    const handOver = sessionOk || walkOut ? null : handed;
    setHandedOver(handOver);
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
  // are ignored until its page opens. The bar is the same, except that the
  // player stays on the stool until they walk off.
  const play = useRef<(object: FloorObject) => void>(() => {});
  play.current = (object) => {
    if (!(object.interactive?.href || object.interactive?.lounge) || playing) return;
    setPlaying(object);
  };
  const lounging = Boolean(playing?.interactive?.lounge);
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
  // logged in there, the tablet closes the same way, leaving them at the
  // desk, logged in (SRS-103.14); the nav bar shows their balance.
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

  // Making a wish at the lobby's fountain (SRS-129.1): in reach of it, a
  // logged-in player is offered a wish for 1 coin. Once it's made (or
  // refused: no coins, or already made today), the help box says so until
  // they step away; if it couldn't be made, they can try again. Coming up
  // to it, the page asks whether they've made today's wish, and if so the
  // box counts down to the next one (SRS-129.2) instead of offering one.
  // A wish made, the scene plays the coin toss, and only then does the
  // result show, with the new balance in the box and the nav bar
  // (SRS-129.4); today's coin then lies on the fountain's bottom.
  const [nearFountain, setNearFountain] = useState(false);
  const nearFountainRef = useRef(false);

  // Drinks at the bar: sat on a stool, Space (or the button) orders one, the
  // player sips it, and each sip fills the meter, which goes down slowly
  // over time (lib/drinks.ts). Maxed out, the view sloshes about until it's
  // back down, and the bartender won't pour another until then.
  const [drinkMeter, setDrinkMeter] = useState<DrinkMeter>(EMPTY_METER);
  const [drinkNow, setDrinkNow] = useState(0);
  const [barSeated, setBarSeated] = useState(false);
  const barSeatedRef = useRef(false);
  const [drinkOrder, setDrinkOrder] = useState(0);
  const [drinking, setDrinking] = useState(false);
  const drinkingRef = useRef(false);
  useEffect(() => {
    setDrinkMeter(readDrinkMeter());
    setDrinkNow(Date.now());
  }, []);
  // Ticking while there's anything in it, so it goes down (and the sloshing eases off) on screen.
  const drinkLevel = meterAt(drinkMeter, drinkNow).level;
  useEffect(() => {
    if (drinkLevel <= 0) return;
    const timer = setInterval(() => setDrinkNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [drinkLevel > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const drinkMeterRef = useRef(drinkMeter);
  drinkMeterRef.current = drinkMeter;
  const orderDrink = useRef<() => void>(() => {});
  orderDrink.current = () => {
    if (!barSeatedRef.current || drinkingRef.current || !canOrder(drinkMeterRef.current, Date.now())) return;
    drinkingRef.current = true;
    setDrinking(true);
    setDrinkOrder((count) => count + 1);
  };
  const sipped = () => {
    const now = Date.now();
    const next = addSip(drinkMeterRef.current, now);
    drinkMeterRef.current = next;
    saveDrinkMeter(next);
    setDrinkMeter(next);
    setDrinkNow(now);
  };
  const drunk = () => {
    drinkingRef.current = false;
    setDrinking(false);
  };
  const cutOff = !canOrder(drinkMeter, drinkNow);
  const slosh = sloshAmount(drinkMeter, drinkNow);
  const [makingWish, setMakingWish] = useState(false);
  const [wishNote, setWishNote] = useState<{ text: string; final: boolean } | null>(null);
  // When the next wish can be made, by this browser's clock (from the
  // server's msRemaining), while today's has been; and the clock, ticking
  // while it's shown.
  const [nextWish, setNextWish] = useState<number | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  // (Asked once they're known to be logged in, for today's coin, and each
  // time they come up to the fountain.)
  const wishStatusAsked = useRef(false);
  useEffect(() => {
    if (!member) {
      setNextWish(null);
      return;
    }
    if (!nearFountain && wishStatusAsked.current) return;
    wishStatusAsked.current = true;
    let cancelled = false;
    fetch('/api/wishing-fountain', { headers: { Authorization: `Bearer ${localStorage.getItem('player_token') ?? ''}` } })
      .then((res) => (res.ok ? (res.json() as Promise<{ wishedToday: boolean; msRemaining: number }>) : null))
      .then((status) => {
        if (!cancelled && status) setNextWish(status.wishedToday ? Date.now() + status.msRemaining : null);
      })
      // Not known: offer the wish; the server refuses a second one anyway.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [nearFountain, member]);
  useEffect(() => {
    if (!nearFountain || nextWish === null) return;
    setClock(Date.now());
    const timer = setInterval(() => {
      const now = Date.now();
      setClock(now);
      if (now >= nextWish) {
        // A new day: they can wish again.
        setNextWish(null);
        setWishNote(null);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [nearFountain, nextWish]);
  const [tossing, setTossing] = useState(false);
  const tossResult = useRef<{ reward: number; balance: number | null } | null>(null);
  const [coinSpot, setCoinSpot] = useState<{ x: number; z: number } | null>(null);
  useEffect(() => {
    try {
      setCoinSpot(parseCoinSpot(sessionStorage.getItem(WISH_COIN_KEY), wishDay()));
    } catch {
      // Not remembered: today's coin lies at the front of the fountain.
    }
  }, []);
  const hasWished = nextWish !== null;
  const restingCoin = useMemo(() => (!tossing && hasWished ? coinSpot ?? coinLanding(null, wishDay()) : null), [tossing, hasWished, coinSpot]);
  const tossed = (spot: { x: number; z: number }) => {
    try {
      sessionStorage.setItem(WISH_COIN_KEY, serializeCoinSpot(spot, wishDay()));
    } catch {
      // Not remembered: next time it lies at the front of the fountain.
    }
    setCoinSpot(spot);
    setTossing(false);
    const result = tossResult.current;
    tossResult.current = null;
    notifyBalanceChanged();
    if (result) {
      const outcome = result.reward > 0 ? `Your wish came true: ${result.reward} coins back!` : 'No luck this time.';
      setWishNote({ text: result.balance === null ? outcome : `${outcome} You have ${result.balance.toLocaleString()} coins.`, final: true });
    }
  };
  const wish = useRef<() => void>(() => {});
  wish.current = () => {
    // A guest logs in first, at the front desk (SRS-129.5).
    if (guest) {
      checkIn.current('login');
      return;
    }
    if (!member || makingWish || tossing || wishNote?.final || nextWish !== null || checkingIn || leaving || playing) return;
    setMakingWish(true);
    setWishNote(null);
    fetch('/api/wishing-fountain', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('player_token') ?? ''}` } })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { error?: string; msRemaining?: number; reward?: number; balance?: number };
        if (typeof body.msRemaining === 'number' && body.msRemaining > 0) setNextWish(Date.now() + body.msRemaining);
        if (res.status === 401) {
          // The session ended elsewhere: a guest now, where they stand.
          localStorage.removeItem('player_token');
          setSignedInHere(false);
          notifyBalanceChanged();
          setWishNote({ text: 'Your session has ended. Log in again to make a wish.', final: true });
        } else if (res.ok) {
          // SRS-129.3: 2 coins back, or nothing; it's shown, and the nav bar's
          // balance updated, once the toss is over (SRS-129.4, SRS-NFR-104).
          tossResult.current = { reward: body.reward ?? 0, balance: typeof body.balance === 'number' ? body.balance : null };
          setTossing(true);
        } else {
          setWishNote({ text: body.error ?? 'Could not make your wish. Please try again.', final: res.status !== 500 });
        }
      })
      .catch(() => setWishNote({ text: 'Could not make your wish. Please try again.', final: false }))
      .finally(() => setMakingWish(false));
  };

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
  // doors, makes a wish at the fountain, or plays the game in reach.
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
        if (focused?.closest('a, button, summary')) focused.blur();
        input.current[key] = true;
        return;
      }
      if (event.key === ' ' || event.key === 'Enter') {
        // Only take over Space/Enter for the floor, not a focused link or button.
        if ((event.target as HTMLElement | null)?.closest('a, button, summary')) return;
        event.preventDefault();
        if (barSeatedRef.current) orderDrink.current();
        else if (nearKioskRef.current !== null || nearDoorsRef.current === 'lobby') checkIn.current();
        else if (nearDoorsRef.current === 'floor') leave.current();
        else if (nearFountainRef.current) wish.current();
        else if (nearRef.current) play.current(nearRef.current);
      }
    };
    const up = (event: KeyboardEvent) => {
      input.current.slow = event.shiftKey;
      const key = KEYS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (key) input.current[key] = false;
    };
    const release = () => {
      input.current = { forward: false, back: false, left: false, right: false, slow: false, getUp: false };
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
  const ready = Boolean(label?.href || label?.lounge);

  return (
    <>
      {/* The floor fills the page edge to edge, like a video game, with the
          rest laid over it as a HUD. */}
      <div className={`${display.className} relative flex min-h-0 flex-1 flex-col`}>
        {/* Top right: (for guests) sign up or log in, and the games menu. The
            website's name is in the nav bar (SRS-107.5), so it's only named
            here for screen readers. */}
        <header className="pointer-events-none absolute right-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col items-end gap-2 text-sm text-slate-300 sm:right-5 sm:top-5">
          <h1 className="sr-only">Stacks Overflowed Casino</h1>
          {guest ? (
            <div className="pointer-events-auto flex gap-2 uppercase tracking-wider shadow-lg">
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
          {/* The same games as a plain list, for anyone who'd rather not walk
              (SRS-107.1); open from the start without the 3D floor. */}
          <details open={webgl === false} className="group pointer-events-auto flex flex-col items-end">
            <summary className="ml-auto w-fit cursor-pointer list-none rounded bg-black/70 px-4 py-2 uppercase tracking-wider text-slate-100 shadow-lg backdrop-blur-sm transition hover:text-amber-200 [&::-webkit-details-marker]:hidden">
              Games <span className="inline-block transition group-open:rotate-180">▾</span>
            </summary>
            <nav aria-label="Games" className="mt-2 flex w-56 flex-col gap-1 rounded-md bg-black/75 p-2 text-xs uppercase tracking-wider text-slate-400 shadow-lg backdrop-blur-sm">
              {INTERACTIVE_OBJECTS.filter((object) => !object.interactive?.lounge).map((object) =>
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
                    className="rounded px-3 py-1.5 text-slate-200 transition hover:bg-white/10 hover:text-amber-200"
                  >
                    {object.interactive.name}
                  </Link>
                ) : (
                  <span key={object.id} className="px-3 py-1.5 text-slate-600">
                    {object.interactive?.name} (soon)
                  </span>
                )
              )}
            </nav>
          </details>
        </header>

        {/* The floor itself, filling the window below the nav bar. */}
        <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
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
                  // Up from a game's seat (SRS-108.6), or off a bar stool.
                  forgetTakenSeat();
                  setPlaying(null);
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
                onNearFountain={(near) => {
                  nearFountainRef.current = near;
                  setNearFountain(near);
                  if (!near) setWishNote(null);
                }}
                onWish={() => wish.current()}
                tossing={tossing}
                tossAtOnce={prefersReducedMotion()}
                onTossed={tossed}
                restingCoin={restingCoin}
                onBarSeated={(seated) => {
                  barSeatedRef.current = seated;
                  setBarSeated(seated);
                }}
                drinkOrder={drinkOrder}
                drinkAtOnce={prefersReducedMotion()}
                onSip={sipped}
                onDrinkDone={drunk}
                slosh={slosh}
                sloshGentle={prefersReducedMotion()}
                paused={opening || tabletOpen}
              />
            </div>
          ) : (
            <FloorMessage text="This browser can't show the 3D floor — pick a game from the Games menu." />
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
          ) : nearFountain && guest && !checkingIn && !playing ? (
            // At the lobby's fountain as a guest: log in to make a wish (SRS-129.5).
            <button
              type="button"
              onClick={() => wish.current()}
              className="absolute left-3 top-3 max-w-[min(22rem,calc(100%-1.5rem))] rounded-md bg-black/75 px-4 py-3 text-left text-white shadow-lg backdrop-blur-sm sm:left-5 sm:top-5"
            >
              <span className="block text-lg font-bold uppercase tracking-wider text-amber-300">Wishing fountain</span>
              <span className="mt-1 block text-sm leading-snug text-slate-200">Log in to toss in a coin and make a wish.</span>
              <span className="mt-2 block text-sm">
                Press <Key>Space</Key> to log in
              </span>
            </button>
          ) : nearFountain && member && !tossing && !checkingIn && !playing && !leaving ? (
            // At the lobby's fountain: a wish for 1 coin (SRS-129.1).
            <button
              type="button"
              onClick={() => wish.current()}
              disabled={makingWish || Boolean(wishNote?.final) || nextWish !== null}
              className="absolute left-3 top-3 max-w-[min(22rem,calc(100%-1.5rem))] rounded-md bg-black/75 px-4 py-3 text-left text-white shadow-lg backdrop-blur-sm disabled:cursor-default sm:left-5 sm:top-5"
            >
              <span className="block text-lg font-bold uppercase tracking-wider text-amber-300">Wishing fountain</span>
              <span className="mt-1 block text-sm leading-snug text-slate-200" aria-live="polite">
                {wishNote?.text ?? (nextWish !== null ? "You've made today's wish." : 'Toss in a coin and make a wish.')}
              </span>
              {nextWish !== null ? (
                <span className="mt-2 block text-sm text-slate-300">
                  Your next wish is in <span className="font-mono tabular-nums text-amber-200">{formatCountdown(nextWish - clock)}</span>
                </span>
              ) : wishNote?.final ? null : (
                <span className="mt-2 block text-sm">
                  {makingWish ? (
                    <span className="text-slate-400">Making your wish…</span>
                  ) : (
                    <>
                      Press <Key>Space</Key> to make a wish (1 coin)
                    </>
                  )}
                </span>
              )}
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
                ) : label.lounge ? (
                  <>
                    Press <Key>Space</Key> to take a stool
                  </>
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

          {lounging ? (
            // On a bar stool: order a drink, and how to get up (buttons for touch screens too).
            <div className="absolute inset-x-0 bottom-5 flex flex-wrap items-center justify-center gap-2 px-3">
              {barSeated ? (
                cutOff ? (
                  <span className="rounded-full bg-black/70 px-4 py-2 text-sm uppercase tracking-[0.2em] text-rose-200 backdrop-blur-sm">
                    The bartender&apos;s cut you off for now
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => orderDrink.current()}
                    disabled={drinking}
                    className="rounded-full bg-amber-400/90 px-4 py-2 text-sm font-bold uppercase tracking-[0.2em] text-slate-950 backdrop-blur-sm transition hover:bg-amber-300 disabled:bg-black/70 disabled:font-normal disabled:text-amber-200"
                  >
                    {drinking ? (
                      'Drinking…'
                    ) : (
                      <>
                        <Key>Space</Key> Order a drink
                      </>
                    )}
                  </button>
                )
              ) : null}
              <button
                type="button"
                onClick={() => {
                  input.current.getUp = true;
                }}
                className="rounded-full bg-black/70 px-4 py-2 text-sm uppercase tracking-[0.2em] text-white backdrop-blur-sm transition hover:text-amber-200"
              >
                Walk or tap here to get up
              </button>
            </div>
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

          {drinkLevel > 0.001 ? (
            <DrinkGauge level={drinkLevel} maxed={meterAt(drinkMeter, drinkNow).maxed} />
          ) : null}

          {webgl ? (
            // Bottom left: the controls, small, as a game shows them.
            <p className="pointer-events-none absolute bottom-3 left-3 hidden text-xs uppercase tracking-[0.15em] text-white/50 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)] md:block sm:bottom-5 sm:left-5">
              WASD to move · Shift to walk · drag to look · Space to play
            </p>
          ) : null}
        </div>
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

/** The drink meter, bottom right: fills as the player drinks, goes down slowly over time. */
function DrinkGauge({ level, maxed }: { level: number; maxed: boolean }) {
  const percent = Math.round(level * 100);
  return (
    <div
      role="meter"
      aria-label="Drinks"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={maxed ? `${percent}%, maxed out` : `${percent}%`}
      className="pointer-events-none absolute bottom-16 right-3 w-44 rounded-md bg-black/70 px-3 py-2 text-white shadow-lg backdrop-blur-sm sm:bottom-5 sm:right-5"
    >
      <div className="mb-1.5 flex items-center justify-between text-xs uppercase tracking-[0.2em]">
        <span className="flex items-center gap-1.5">
          <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 fill-amber-300">
            <path d="M3 2h10l-1.2 10.2A2 2 0 0 1 9.8 14H6.2a2 2 0 0 1-2-1.8L3 2Zm1.6 4 .7 6c0 .3.3.5.6.5h4.2c.3 0 .5-.2.6-.5l.7-6H4.6Z" />
          </svg>
          Drinks
        </span>
        <span className={maxed ? 'font-bold text-rose-300' : 'text-amber-200'}>{maxed ? 'Maxed out' : `${percent}%`}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/15">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${maxed ? 'animate-pulse bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500' : 'bg-gradient-to-r from-amber-300 to-amber-500'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return <kbd className="mx-0.5 rounded border border-white/40 bg-white/10 px-1.5 py-0.5 text-xs font-bold uppercase">{children}</kbd>;
}
