// The nav bar re-reads the balance on every navigation. A page that changes
// the balance without navigating (opening the Daily Login Box, settling a
// bet, buying a blind box) calls notifyBalanceChanged() so the nav bar
// refreshes right away (SRS-110.5, SRS-NFR-104).
export const BALANCE_CHANGED_EVENT = 'player-balance-changed';

export function notifyBalanceChanged() {
  window.dispatchEvent(new Event(BALANCE_CHANGED_EVENT));
}
