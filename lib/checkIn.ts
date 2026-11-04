// Checking in from the page (SRS-103.16): where the browser can draw the 3D
// home page, signing up and logging in happen at a check-in tablet on its
// front desk; where it can't, on the plain sign-up and login pages. The
// login and registration pages hand over to the front desk by leaving their
// form in sessionStorage under CHECK_IN_KEY and opening the home page. (Kept
// apart from lib/casinoFloor.ts, since the nav bar on every page uses it.)

export const CHECK_IN_KEY = 'casino-floor-check-in';

/** The two forms a check-in tablet shows. */
export type CheckInForm = 'signup' | 'login';

export function parseCheckInForm(raw: string | null): CheckInForm | null {
  return raw === 'signup' || raw === 'login' ? raw : null;
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

/** Hands a login or registration page over to the home page's front desk, when the browser can show it and remember the form: true if it has. */
export function handOverToCheckIn(form: CheckInForm): boolean {
  if (!canDraw3d()) return false;
  try {
    sessionStorage.setItem(CHECK_IN_KEY, form);
    return true;
  } catch {
    return false;
  }
}

/** The form a login or registration page handed over, if any, read once. */
export function takeHandedOverCheckIn(): CheckInForm | null {
  try {
    const form = parseCheckInForm(sessionStorage.getItem(CHECK_IN_KEY));
    sessionStorage.removeItem(CHECK_IN_KEY);
    return form;
  } catch {
    return null;
  }
}
