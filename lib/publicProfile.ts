// Where a player's public profile lives (UR-121). Every link to one is built
// here, so they all point at the real page (app/players/[playerId]): your
// own profile's "View your public profile" and the poker table's seats
// (SRS-121.1). Profiles open by player id only (SRS-121.2).
export function publicProfilePath(playerId: string | number): string {
  return `/players/${encodeURIComponent(String(playerId))}`;
}
