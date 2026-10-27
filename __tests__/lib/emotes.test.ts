import { describe, expect, it } from 'vitest';
import { DEFAULT_EMOTES, EMOTES, canSendEmote, isEmoteId } from '../../lib/emotes';

describe('poker emotes', () => {
  it('has a default set every player gets', () => {
    expect(DEFAULT_EMOTES.length).toBeGreaterThanOrEqual(6);
    expect(DEFAULT_EMOTES.every((emote) => canSendEmote(emote.id))).toBe(true);
  });

  it('gives every emote its own id', () => {
    expect(new Set(EMOTES.map((emote) => emote.id)).size).toBe(EMOTES.length);
  });

  it('recognises only real emote ids', () => {
    expect(isEmoteId('laugh')).toBe(true);
    expect(isEmoteId('dance')).toBe(false);
    expect(isEmoteId(undefined)).toBe(false);
    expect(canSendEmote('dance')).toBe(false);
  });
});
