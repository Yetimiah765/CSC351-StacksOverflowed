// Parlay rules shared by the bet slip (app/sports/page.tsx) and, from
// SRS-219.3 on, the place-parlay route and fn_place_parlay, so they all give
// the same answer.

// SRS-219.1: a parlay combines between 2 and 10 outcomes.
export const MIN_PARLAY_LEGS = 2;
export const MAX_PARLAY_LEGS = 10;

// The least a leg needs to carry for these rules: the outcome picked and the
// sports event (game) it belongs to. The slip's legs carry more (the market
// and option shown).
export type LegKey = { optionId: number; eventId: number };

export type LegChange<T> = { ok: true; legs: T[] } | { ok: false; legs: T[]; error: string };

export const SAME_GAME_ERROR = 'You already have a pick from this game. A parlay can have only one pick per game.';

// SRS-219.5: whether the parlay already has a pick from this game.
export function hasPickFromEvent(legs: LegKey[], eventId: number): boolean {
  return legs.some((l) => l.eventId === eventId);
}

// SRS-219.5: every pick in the parlay is from a different game.
export function allDifferentEvents(legs: LegKey[]): boolean {
  return new Set(legs.map((l) => l.eventId)).size === legs.length;
}

// SRS-219.1: picking an outcome that's already a leg takes it out again;
// otherwise it's added at the end, as long as the parlay isn't full and
// (SRS-219.5) has no other pick from the same game.
export function toggleLeg<T extends LegKey>(legs: T[], leg: T): LegChange<T> {
  if (legs.some((l) => l.optionId === leg.optionId)) {
    return { ok: true, legs: legs.filter((l) => l.optionId !== leg.optionId) };
  }
  if (hasPickFromEvent(legs, leg.eventId)) {
    return { ok: false, legs, error: SAME_GAME_ERROR };
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

// SRS-219.2: odds are stored with 3 decimals (NUMERIC(7,3)), so each one is a
// whole number of thousandths. Multiplying those as integers gives the exact
// product, the same value Postgres's NUMERIC arithmetic gives when the parlay
// is placed (SRS-219.3); floating-point multiplication can be off in the last
// digit and round a payout to the wrong coin.
const SCALE = BigInt(1000);

function thousandths(odds: number): bigint {
  return BigInt(Math.round(odds * 1000));
}

function exactProduct(odds: number[]): { value: bigint; scale: bigint } {
  let value = BigInt(1);
  let scale = BigInt(1);
  for (const o of odds) {
    value *= thousandths(o);
    scale *= SCALE;
  }
  return { value, scale };
}

// SRS-219.2: a parlay's combined odds are the product of its picks' odds.
// For showing on the slip; the payout is worked out exactly below.
export function parlayOdds(odds: number[]): number {
  const { value, scale } = exactProduct(odds);
  // Two decimals are shown, so split off the whole part to keep precision.
  const whole = value / scale;
  const rest = value % scale;
  return Number(whole) + Number((rest * BigInt(1_000_000)) / scale) / 1_000_000;
}

// SRS-219.2: what a winning parlay pays back in total (stake included),
// rounded down to a whole coin like a single bet (potentialPayout).
export function parlayPayout(amount: number, odds: number[]): number {
  if (!Number.isSafeInteger(amount) || amount <= 0 || odds.length === 0 || !odds.every((o) => o > 1)) return 0;
  const { value, scale } = exactProduct(odds);
  return Number((BigInt(amount) * value) / scale);
}

// A winning parlay must pay back more than its stake (the same rule as
// canWinCoins for a single bet).
export function canParlayWinCoins(amount: number, odds: number[]): boolean {
  return parlayPayout(amount, odds) > amount;
}

// SRS-219.4: how a parlay is settled, from its legs' results (null for a leg
// whose game isn't decided yet). The same rules as fn_settle_parlay in
// supabase/schema.sql, which works out the payout again from the stored odds.
export type ParlayLegOutcome = { result: 'Won' | 'Lost' | 'Refunded' | null; odds: number };
export type ParlayDecision = { result: 'Won' | 'Lost' | 'Refunded'; payout: number };

export function decideParlay(amount: number, legs: ParlayLegOutcome[]): ParlayDecision | null {
  // Lost as soon as any leg loses, even with other games still to play.
  if (legs.some((leg) => leg.result === 'Lost')) return { result: 'Lost', payout: 0 };
  // Otherwise it waits until every leg is decided.
  if (legs.length === 0 || legs.some((leg) => leg.result === null)) return null;

  // Refunded legs drop out and the odds are worked out from the rest; with
  // none left, the stake comes back.
  const won = legs.filter((leg) => leg.result === 'Won');
  if (won.length === 0) return { result: 'Refunded', payout: amount };

  const payout = parlayPayout(amount, won.map((leg) => leg.odds));
  // With refunds taking out most of the odds, the payout can round down to
  // the stake itself; that's a refund, since nothing was won.
  if (payout <= amount) return { result: 'Refunded', payout: amount };
  return { result: 'Won', payout };
}
