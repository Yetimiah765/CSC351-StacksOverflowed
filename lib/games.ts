// Every game shown on the home page (SRS-107.1), in display order.
//
// To connect a game, set its `href` to the game's page route (for example
// '/blackjack'). Its home page button then changes from a disabled
// "Coming soon" to "Play", and logged-out visitors who click it are sent to
// /login instead (SRS-108.3).
export interface Game {
  id: string;
  name: string;
  description: string;
  href: string | null;
}

export const GAMES: Game[] = [
  {
    id: 'poker',
    name: 'Poker',
    description: "Texas Hold'em against other players at a live table.",
    href: '/poker',
  },
  {
    id: 'blackjack',
    name: 'Blackjack',
    description: 'Get closer to 21 than the dealer without going over.',
    href: null,
  },
  {
    id: 'roulette',
    name: 'Roulette',
    description: 'Bet on where the ball lands on the wheel.',
    href: null,
  },
  {
    id: 'slots',
    name: 'Slots',
    description: 'Spin the reels and line up matching symbols.',
    href: null,
  },
  {
    id: 'sports-betting',
    name: 'Sports Betting',
    description: 'Bet virtual coins on live sports events.',
    href: null,
  },
];
