// SRS-204.2 / SRS-210.1: total payout (stake + winnings) for a wager at the
// given decimal odds. Rounds down to whole coins, since balances are BIGINT.
// Odds are scaled to integer thousandths first to avoid float drift
// (e.g. 10 * 1.15 = 11.499999999999998).
export function potentialPayout(amount: number, decimalOdds: number): number {
  if (!Number.isInteger(amount) || amount <= 0 || !(decimalOdds > 1)) return 0;
  return Math.floor((amount * Math.round(decimalOdds * 1000)) / 1000);
}
