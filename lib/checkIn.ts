import { GAMES } from './games';
import { NAV_HISTORY_KEY, parseTrail } from './navHistory';

// Checking in from the page (SRS-103.16): where the browser can draw the 3D
// home page, signing up and logging in happen at a check-in tablet on its
// front desk; where it can't, on the plain sign-up and login pages. The
// login and registration pages hand over to the front desk by leaving their
// form in sessionStorage under CHECK_IN_KEY and opening the home page, along
// with the game's page the guest was turned away from, if they were, to go
// straight on to once they've logged in (SRS-108.8). (Kept apart from
// lib/casinoFloor.ts, since the nav bar on every page uses it.)

export const CHECK_IN_KEY = 'casino-floor-check-in';

/** The two forms a check-in tablet shows. */
export type CheckInForm = 'signup' | 'login';

export function parseCheckInForm(raw: unknown): CheckInForm | null {
  return raw === 'signup' || raw === 'login' ? raw : null;
}

/** A game's page (its main page, or one under it like a poker table) or the Cosmetic Shop's. */
export function isPlayPage(path: string): boolean {
  const pages = [...GAMES.flatMap((game) => (game.href ? [game.href] : [])), '/shop'];
  return pages.some((page) => path === page || path.startsWith(`${page}/`));
}

/** The game's (or shop's) page a guest was turned away from to log in or register, from the tab's trail of pages: the page before the login and registration pages at its end, if it's one. */
export function turnedAwayFrom(trail: string[]): string | null {
  let end = trail.length;
  while (end > 0 && (trail[end - 1] === '/login' || trail[end - 1] === '/register')) end--;
  const page = trail[end - 1];
  return page !== undefined && isPlayPage(page) ? page : null;
}

/** What a login or registration page hands over to the home page: the form to open a tablet on, and the page to go straight on to once logged in, if any. */
export interface HandOver {
  form: CheckInForm;
  play: string | null;
}

export function serializeHandOver(handOver: HandOver): string {
  return JSON.stringify(handOver);
}

/** The hand-over, if it names a form; a page to go on to that isn't a game's or the shop's is dropped. */
export function parseHandOver(raw: string | null): HandOver | null {
  try {
    const value: unknown = JSON.parse(raw ?? '');
    if (!value || typeof value !== 'object') return null;
    const { form, play } = value as { form?: unknown; play?: unknown };
    const checkInForm = parseCheckInForm(form);
    if (!checkInForm) return null;
    return { form: checkInForm, play: typeof play === 'string' && isPlayPage(play) ? play : null };
  } catch {
    return null;
  }
}

/** Whether this browser can draw the 3D home page (WebGL). */
export function canDraw3d() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** The home page listens for this, and checks a guest in on the form it names when it can. */
export const CHECK_IN_EVENT = 'casino-check-in';

/** Asks the home page, if it's open and showing the 3D lobby, to walk the guest to the front desk and open a tablet on `form`. True if it will, so a link to that form's own page needn't be followed. */
export function askHomeToCheckIn(form: CheckInForm): boolean {
  return !window.dispatchEvent(new CustomEvent<CheckInForm>(CHECK_IN_EVENT, { detail: form, cancelable: true }));
}

/** Hands a login or registration page over to the home page's front desk, with the game's page the guest came from, when the browser can show it and remember them: true if it has. */
export function handOverToCheckIn(form: CheckInForm): boolean {
  if (!canDraw3d()) return false;
  try {
    const play = turnedAwayFrom(parseTrail(sessionStorage.getItem(NAV_HISTORY_KEY)));
    sessionStorage.setItem(CHECK_IN_KEY, serializeHandOver({ form, play }));
    return true;
  } catch {
    return false;
  }
}

/** What a login or registration page handed over, if anything, read once. */
export function takeHandedOverCheckIn(): HandOver | null {
  try {
    const handOver = parseHandOver(sessionStorage.getItem(CHECK_IN_KEY));
    sessionStorage.removeItem(CHECK_IN_KEY);
    return handOver;
  } catch {
    return null;
  }
}
