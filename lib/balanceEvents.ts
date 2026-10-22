// The nav bar re-reads the balance on every navigation. A page that changes
// the balance without navigating (opening the Daily Login Box, settling a
// bet, buying a blind box) calls notifyBalanceChanged() so the nav bar
// refreshes right away (SRS-110.5, SRS-NFR-104).
export const BALANCE_CHANGED_EVENT = 'player-balance-changed';

export function notifyBalanceChanged() {
  window.dispatchEvent(new Event(BALANCE_CHANGED_EVENT));
}

// The nav bar also shows the player's photo inside their equipped profile
// outline (SRS-120.7, SRS-120.8). A page that changes either one calls
// notifyAppearanceChanged() so the bar redraws right away (SRS-NFR-104).
export const APPEARANCE_CHANGED_EVENT = 'player-appearance-changed';

export function notifyAppearanceChanged() {
  window.dispatchEvent(new Event(APPEARANCE_CHANGED_EVENT));
}
