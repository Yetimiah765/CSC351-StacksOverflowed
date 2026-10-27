// Poker table emotes, in the spirit of Clash Royale's: a seated player taps
// one and it pops up over their seat for everyone at the table. Each emote
// is Chip, the table's poker-chip mascot, pulling a face — drawn in code by
// components/emotes/EmoteArt.tsx, keyed by `id`.
//
// Every player has the default set. Emotes won from shop boxes will be added
// to this list with `isDefault: false`, and owning one will be checked the
// same way cosmetics are; for now only the defaults exist, so everyone can
// send every emote. Shared by the poker server (which checks an emote before
// relaying it), POST /api/poker/action and the table page.

export interface Emote {
  /** Stable id: sent over the wire, and the key of its artwork. */
  id: string;
  /** What it's called in the picker. */
  name: string;
  /** Given to every player (not won from a box). */
  isDefault: boolean;
}

export const EMOTES: Emote[] = [
  { id: 'laugh', name: 'Laugh', isDefault: true },
  { id: 'cry', name: 'Cry', isDefault: true },
  { id: 'angry', name: 'Angry', isDefault: true },
  { id: 'thumbs-up', name: 'Thumbs up', isDefault: true },
  { id: 'thinking', name: 'Thinking', isDefault: true },
  { id: 'shocked', name: 'Shocked', isDefault: true },
  { id: 'cool', name: 'Cool', isDefault: true },
  { id: 'gg', name: 'Good game', isDefault: true },
];

export const DEFAULT_EMOTES = EMOTES.filter((emote) => emote.isDefault);

export function isEmoteId(value: unknown): value is string {
  return typeof value === 'string' && EMOTES.some((emote) => emote.id === value);
}

/** Whether this player may send this emote. Everyone owns the defaults. */
export function canSendEmote(emoteId: string): boolean {
  return DEFAULT_EMOTES.some((emote) => emote.id === emoteId);
}

/** At most one emote per player this often, so nobody can flood the table. */
export const EMOTE_COOLDOWN_MS = 2_500;
/** How long an emote stays up over the seat. */
export const EMOTE_SHOW_MS = 2_600;
