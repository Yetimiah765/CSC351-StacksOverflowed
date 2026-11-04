// Logging out in the browser (SRS-105.1), from the profile's Log out button
// or by leaving through the casino floor's doors (SRS-105.5).

/**
 * Ends the session on the server too, so this token stops working
 * everywhere, then forgets it here. The local token is cleared even if that
 * request fails, so the player is always logged out of this browser.
 */
export async function logOut(): Promise<void> {
  const token = localStorage.getItem('player_token');
  try {
    if (token) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  } catch {
    // Network failure: still log out locally below.
  }
  localStorage.removeItem('player_token');
}

// Logging out on the profile, the player's then seen leaving the casino on
// the home page (SRS-105.6): the profile leaves WALK_OUT_KEY in
// sessionStorage, and the home page reads it once.
export const WALK_OUT_KEY = 'casino-floor-walk-out';

export function askToWalkOut() {
  try {
    sessionStorage.setItem(WALK_OUT_KEY, '1');
  } catch {
    // Not remembered: the home page just starts them in the lobby.
  }
}

export function takeWalkOut(): boolean {
  try {
    const asked = sessionStorage.getItem(WALK_OUT_KEY) === '1';
    sessionStorage.removeItem(WALK_OUT_KEY);
    return asked;
  } catch {
    return false;
  }
}
