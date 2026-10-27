// Team logos and colors for the sportsbook and The Showdown. Keyed by the
// full team name exactly as The Odds API (and so the teams table) spells it.
// Logos load from ESPN's image server by each team's ESPN code; if one fails
// to load, or a team isn't listed (a new sport), TeamCrest falls back to the
// team's initials (components/sports/shared.tsx).

export type TeamInfo = {
  league: 'NFL' | 'NBA';
  // ESPN's team code, used in the logo URL.
  code: string;
  // Official team colors, as hex.
  primary: string;
  secondary: string;
};

export const TEAMS: Record<string, TeamInfo> = {
  // NFL
  'Arizona Cardinals': { league: 'NFL', code: 'ari', primary: '#97233F', secondary: '#FFB612' },
  'Atlanta Falcons': { league: 'NFL', code: 'atl', primary: '#A71930', secondary: '#000000' },
  'Baltimore Ravens': { league: 'NFL', code: 'bal', primary: '#241773', secondary: '#9E7C0C' },
  'Buffalo Bills': { league: 'NFL', code: 'buf', primary: '#00338D', secondary: '#C60C30' },
  'Carolina Panthers': { league: 'NFL', code: 'car', primary: '#0085CA', secondary: '#101820' },
  'Chicago Bears': { league: 'NFL', code: 'chi', primary: '#0B162A', secondary: '#C83803' },
  'Cincinnati Bengals': { league: 'NFL', code: 'cin', primary: '#FB4F14', secondary: '#000000' },
  'Cleveland Browns': { league: 'NFL', code: 'cle', primary: '#311D00', secondary: '#FF3C00' },
  'Dallas Cowboys': { league: 'NFL', code: 'dal', primary: '#003594', secondary: '#869397' },
  'Denver Broncos': { league: 'NFL', code: 'den', primary: '#FB4F14', secondary: '#002244' },
  'Detroit Lions': { league: 'NFL', code: 'det', primary: '#0076B6', secondary: '#B0B7BC' },
  'Green Bay Packers': { league: 'NFL', code: 'gb', primary: '#203731', secondary: '#FFB612' },
  'Houston Texans': { league: 'NFL', code: 'hou', primary: '#03202F', secondary: '#A71930' },
  'Indianapolis Colts': { league: 'NFL', code: 'ind', primary: '#002C5F', secondary: '#A2AAAD' },
  'Jacksonville Jaguars': { league: 'NFL', code: 'jax', primary: '#006778', secondary: '#D7A22A' },
  'Kansas City Chiefs': { league: 'NFL', code: 'kc', primary: '#E31837', secondary: '#FFB81C' },
  'Las Vegas Raiders': { league: 'NFL', code: 'lv', primary: '#000000', secondary: '#A5ACAF' },
  'Los Angeles Chargers': { league: 'NFL', code: 'lac', primary: '#0080C6', secondary: '#FFC20E' },
  'Los Angeles Rams': { league: 'NFL', code: 'lar', primary: '#003594', secondary: '#FFA300' },
  'Miami Dolphins': { league: 'NFL', code: 'mia', primary: '#008E97', secondary: '#FC4C02' },
  'Minnesota Vikings': { league: 'NFL', code: 'min', primary: '#4F2683', secondary: '#FFC62F' },
  'New England Patriots': { league: 'NFL', code: 'ne', primary: '#002244', secondary: '#C60C30' },
  'New Orleans Saints': { league: 'NFL', code: 'no', primary: '#D3BC8D', secondary: '#101820' },
  'New York Giants': { league: 'NFL', code: 'nyg', primary: '#0B2265', secondary: '#A71930' },
  'New York Jets': { league: 'NFL', code: 'nyj', primary: '#125740', secondary: '#FFFFFF' },
  'Philadelphia Eagles': { league: 'NFL', code: 'phi', primary: '#004C54', secondary: '#A5ACAF' },
  'Pittsburgh Steelers': { league: 'NFL', code: 'pit', primary: '#FFB612', secondary: '#101820' },
  'San Francisco 49ers': { league: 'NFL', code: 'sf', primary: '#AA0000', secondary: '#B3995D' },
  'Seattle Seahawks': { league: 'NFL', code: 'sea', primary: '#002244', secondary: '#69BE28' },
  'Tampa Bay Buccaneers': { league: 'NFL', code: 'tb', primary: '#D50A0A', secondary: '#34302B' },
  'Tennessee Titans': { league: 'NFL', code: 'ten', primary: '#0C2340', secondary: '#4B92DB' },
  'Washington Commanders': { league: 'NFL', code: 'wsh', primary: '#5A1414', secondary: '#FFB612' },

  // NBA
  'Atlanta Hawks': { league: 'NBA', code: 'atl', primary: '#E03A3E', secondary: '#C1D32F' },
  'Boston Celtics': { league: 'NBA', code: 'bos', primary: '#007A33', secondary: '#BA9653' },
  'Brooklyn Nets': { league: 'NBA', code: 'bkn', primary: '#000000', secondary: '#FFFFFF' },
  'Charlotte Hornets': { league: 'NBA', code: 'cha', primary: '#1D1160', secondary: '#00788C' },
  'Chicago Bulls': { league: 'NBA', code: 'chi', primary: '#CE1141', secondary: '#000000' },
  'Cleveland Cavaliers': { league: 'NBA', code: 'cle', primary: '#860038', secondary: '#FDBB30' },
  'Dallas Mavericks': { league: 'NBA', code: 'dal', primary: '#00538C', secondary: '#B8C4CA' },
  'Denver Nuggets': { league: 'NBA', code: 'den', primary: '#0E2240', secondary: '#FEC524' },
  'Detroit Pistons': { league: 'NBA', code: 'det', primary: '#C8102E', secondary: '#1D42BA' },
  'Golden State Warriors': { league: 'NBA', code: 'gs', primary: '#1D428A', secondary: '#FFC72C' },
  'Houston Rockets': { league: 'NBA', code: 'hou', primary: '#CE1141', secondary: '#C4CED4' },
  'Indiana Pacers': { league: 'NBA', code: 'ind', primary: '#002D62', secondary: '#FDBB30' },
  'Los Angeles Clippers': { league: 'NBA', code: 'lac', primary: '#C8102E', secondary: '#1D428A' },
  'Los Angeles Lakers': { league: 'NBA', code: 'lal', primary: '#552583', secondary: '#FDB927' },
  'Memphis Grizzlies': { league: 'NBA', code: 'mem', primary: '#5D76A9', secondary: '#12173F' },
  'Miami Heat': { league: 'NBA', code: 'mia', primary: '#98002E', secondary: '#F9A01B' },
  'Milwaukee Bucks': { league: 'NBA', code: 'mil', primary: '#00471B', secondary: '#EEE1C6' },
  'Minnesota Timberwolves': { league: 'NBA', code: 'min', primary: '#0C2340', secondary: '#78BE20' },
  'New Orleans Pelicans': { league: 'NBA', code: 'no', primary: '#0C2340', secondary: '#C8102E' },
  'New York Knicks': { league: 'NBA', code: 'ny', primary: '#006BB6', secondary: '#F58426' },
  'Oklahoma City Thunder': { league: 'NBA', code: 'okc', primary: '#007AC1', secondary: '#EF3B24' },
  'Orlando Magic': { league: 'NBA', code: 'orl', primary: '#0077C0', secondary: '#C4CED4' },
  'Philadelphia 76ers': { league: 'NBA', code: 'phi', primary: '#006BB6', secondary: '#ED174C' },
  'Phoenix Suns': { league: 'NBA', code: 'phx', primary: '#1D1160', secondary: '#E56020' },
  'Portland Trail Blazers': { league: 'NBA', code: 'por', primary: '#E03A3E', secondary: '#000000' },
  'Sacramento Kings': { league: 'NBA', code: 'sac', primary: '#5A2D81', secondary: '#63727A' },
  'San Antonio Spurs': { league: 'NBA', code: 'sa', primary: '#C4CED4', secondary: '#000000' },
  'Toronto Raptors': { league: 'NBA', code: 'tor', primary: '#CE1141', secondary: '#000000' },
  'Utah Jazz': { league: 'NBA', code: 'utah', primary: '#002B5C', secondary: '#F9A01B' },
  'Washington Wizards': { league: 'NBA', code: 'wsh', primary: '#002B5C', secondary: '#E31837' },
};

export function teamInfo(name: string): TeamInfo | null {
  return TEAMS[name] ?? null;
}

// ESPN's logo for a team at `size` pixels, through its resizing service so a
// small crest doesn't download the 500px original. Null for unlisted teams.
export function teamLogoUrl(name: string, size = 96): string | null {
  const team = teamInfo(name);
  if (!team) return null;
  const path = `/i/teamlogos/${team.league.toLowerCase()}/500/${team.code}.png`;
  return `https://a.espncdn.com/combiner/i?img=${path}&h=${size}&w=${size}`;
}

// How light a hex color looks, from 0 (black) to 1 (white).
export function luminance(hex: string): number {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 0xff) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

// A team color that shows up on the site's dark background: the primary
// color, or the secondary when the primary is nearly black (e.g. the
// Raiders). Null for unlisted teams.
export function teamAccent(name: string): string | null {
  const team = teamInfo(name);
  if (!team) return null;
  return luminance(team.primary) < 0.03 ? team.secondary : team.primary;
}
