// Parlay rules shared by the bet slip (app/sports/page.tsx) and, from
// SRS-219.3 on, the place-parlay route and fn_place_parlay, so they all give
// the same answer.

// SRS-219.1: a parlay combines between 2 and 10 outcomes.
export const MIN_PARLAY_LEGS = 2;
export const MAX_PARLAY_LEGS = 10;

// The least a leg needs to carry for these rules; the slip's legs carry more
// (the game, market and option shown).
export type LegKey = { optionId: number };

export type LegChange<T> = { ok: true; legs: T[] } | { ok: false; legs: T[]; error: string };

// SRS-219.1: picking an outcome that's already a leg takes it out again;
// otherwise it's added at the end, as long as the parlay isn't full.
export function toggleLeg<T extends LegKey>(legs: T[], leg: T): LegChange<T> {
  if (legs.some((l) => l.optionId === leg.optionId)) {
    return { ok: true, legs: legs.filter((l) => l.optionId !== leg.optionId) };
  }
  if (legs.length >= MAX_PARLAY_LEGS) {
    return { ok: false, legs, error: `A parlay can have at most ${MAX_PARLAY_LEGS} picks.` };
  }
  return { ok: true, legs: [...legs, leg] };
}

export function removeLeg<T extends LegKey>(legs: T[], optionId: number): T[] {
  return legs.filter((l) => l.optionId !== optionId);
}

// What the slip says about the parlay's size, or null when it can be placed.
export function legCountProblem(count: number): string | null {
  if (count < MIN_PARLAY_LEGS) {
    const more = MIN_PARLAY_LEGS - count;
    return `Add ${more} more ${more === 1 ? 'pick' : 'picks'} to make a parlay (${MIN_PARLAY_LEGS} to ${MAX_PARLAY_LEGS}).`;
  }
  if (count > MAX_PARLAY_LEGS) return `A parlay can have at most ${MAX_PARLAY_LEGS} picks.`;
  return null;
}

export function isParlaySize(count: number): boolean {
  return legCountProblem(count) === null;
}
