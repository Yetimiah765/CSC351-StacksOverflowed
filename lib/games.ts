// Every game shown on the home page (SRS-107.1), in display order.
//
// To connect a game, set its `href` to the game's page route (for example
// '/blackjack'). Its home page button then changes from a disabled
// "Coming soon" to "Play", and logged-out visitors who click it are sent to
// /login instead (SRS-108.3). Each game's picture is drawn by
// components/GameArt.tsx, matched by `id`.
export interface Game {
  id: string;
  name: string;
  description: string;
  href: string | null;
  /** A short label shown on the card's picture, e.g. 'Live multiplayer'. */
  tag: string;
}

export const GAMES: Game[] = [
  {
    id: 'poker',
    name: 'Poker',
    description: "Texas Hold'em against other players at a live table. Pick your stakes, take a seat, and play it out to the river.",
    href: '/poker',
    tag: 'Live multiplayer',
  },
  {
    id: 'blackjack',
    name: 'Blackjack',
    description: 'Get closer to 21 than the dealer without going over.',
    href: '/blackjack',
    tag: 'Classic',
  },
  {
    id: 'roulette',
    name: 'Roulette',
    description: 'Bet on where the ball lands on the wheel.',
    href: '/roulette',
    tag: 'Table game',
  },
  {
    id: 'slots',
    name: 'Slots',
    description: 'Spin the reels and line up matching symbols.',
    href: null,
    tag: 'Reels',
  },
  {
    id: 'sports-betting',
    name: 'Sports Betting',
    description: 'Bet virtual coins on live sports events.',
    href: '/sports',
    tag: 'Live odds',
  },
];
