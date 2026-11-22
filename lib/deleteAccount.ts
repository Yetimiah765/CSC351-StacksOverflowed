// Deleting the logged-in player's account (UR-106) from the profile's
// confirmation pop-up, kept apart from the page so it can be tested.

export type DeleteAccountResult =
  | { ok: true }
  // tableKey: the poker table the player has to leave first (SRS-106.10).
  | { ok: false; error: string; expired?: boolean; tableKey?: string };

const FAILED = 'Could not delete your account. Please try again.';

/** Asks the server to delete the account the token belongs to (DELETE /api/profile),
 * with the player's password, which it checks first (SRS-106.2). */
export async function deleteAccount(token: string, password: string): Promise<DeleteAccountResult> {
  try {
    const res = await fetch('/api/profile', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ password }),
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => null);
    // The session ended elsewhere (a newer login, SRS-103.5): log in again.
    if (res.status === 401) return { ok: false, error: 'Your session has ended. Log in again to delete your account.', expired: true };
    if (res.status === 409 && data?.tableKey) return { ok: false, error: data.error || FAILED, tableKey: data.tableKey };
    return { ok: false, error: data?.error || FAILED };
  } catch {
    return { ok: false, error: FAILED };
  }
}
