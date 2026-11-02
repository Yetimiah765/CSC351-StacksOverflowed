// Money won and lost are kept in player_game_stats, one row per game
// (SRS-118.1, SRS-118.3). A player's overall figures are always the sums of
// those rows, never stored figures, and both the owner's own statistics and
// their public profile add them up here, so the two can't disagree
// (SRS-118.5, SRS-121.7).

type MoneyColumn = 'money_won' | 'money_lost';

export function sumMoney(rows: Partial<Record<MoneyColumn, number>>[], column: MoneyColumn): number {
  return rows.reduce((total, row) => total + Number(row[column] ?? 0), 0);
}
