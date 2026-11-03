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
