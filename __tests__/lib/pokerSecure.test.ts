import { describe, expect, it } from 'vitest';
import {
  RELAY_MAX_AGE_MS,
  openHoleCards,
  sealHoleCards,
  signRelayedAction,
  verifyRelayedAction,
  type RelayedAction,
} from '../../lib/pokerSecure';

const SECRET = 'test-secret-that-is-long-enough';
const NOW = 1_800_000_000_000;

const action: RelayedAction = {
  tableId: 'low-1',
  requestId: 'req-1',
  nonce: 'nonce-1',
  issuedAt: NOW,
  playerId: 42,
  action: 'act',
  move: 'raise',
  amount: 40,
};

describe('relayed action signatures', () => {
  it('accepts an action signed with the secret for this table', () => {
    const signed = signRelayedAction(action, SECRET);

    expect(verifyRelayedAction(signed, SECRET, 'low-1', NOW + 1_000)).toEqual(action);
  });

  it('accepts a signed buy-back', () => {
    const rebuy = { ...action, action: 'rebuy' as const, move: undefined, amount: undefined, buyIn: 500 };
    expect(verifyRelayedAction(signRelayedAction(rebuy, SECRET), SECRET, 'low-1', NOW)).toEqual(rebuy);
  });

  it('rejects an unsigned action, like one a client broadcasts itself', () => {
    expect(verifyRelayedAction(action, SECRET, 'low-1', NOW)).toBeNull();
    expect(verifyRelayedAction({ requestId: 'x', action: 'join', token: 'abc' }, SECRET, 'low-1', NOW)).toBeNull();
  });

  it('rejects an action signed with a different secret', () => {
    expect(verifyRelayedAction(signRelayedAction(action, 'other-secret'), SECRET, 'low-1', NOW)).toBeNull();
  });

  it('rejects a signed action whose fields were changed', () => {
    const signed = signRelayedAction(action, SECRET);

    expect(verifyRelayedAction({ ...signed, playerId: 43 }, SECRET, 'low-1', NOW)).toBeNull();
    expect(verifyRelayedAction({ ...signed, amount: 4000 }, SECRET, 'low-1', NOW)).toBeNull();
    expect(verifyRelayedAction({ ...signed, move: 'fold' }, SECRET, 'low-1', NOW)).toBeNull();
  });

  it('rejects a signed action replayed on another table', () => {
    expect(verifyRelayedAction(signRelayedAction(action, SECRET), SECRET, 'low-2', NOW)).toBeNull();
  });

  it('rejects a stale signed action', () => {
    const signed = signRelayedAction(action, SECRET);

    expect(verifyRelayedAction(signed, SECRET, 'low-1', NOW + RELAY_MAX_AGE_MS + 1)).toBeNull();
  });

  it('rejects malformed payloads', () => {
    expect(verifyRelayedAction(null, SECRET, 'low-1', NOW)).toBeNull();
    expect(verifyRelayedAction('nope', SECRET, 'low-1', NOW)).toBeNull();
    expect(verifyRelayedAction({ ...signRelayedAction(action, SECRET), signature: 'short' }, SECRET, 'low-1', NOW)).toBeNull();
  });
});

describe('sealed hole cards (SRS-6.1)', () => {
  it('opens for the same table, hand, and player', () => {
    const sealed = sealHoleCards(SECRET, 'low-1', 7, '42', ['As', 'Kd']);

    expect(openHoleCards(SECRET, 'low-1', 7, '42', sealed)).toEqual(['As', 'Kd']);
  });

  it('does not contain the cards in readable form', () => {
    const sealed = sealHoleCards(SECRET, 'low-1', 7, '42', ['As', 'Kd']);

    expect(sealed).not.toContain('As');
    expect(Buffer.from(sealed.split('.')[2] as string, 'base64').toString('utf8')).not.toContain('As');
  });

  it('will not open for another player, hand, or table', () => {
    const sealed = sealHoleCards(SECRET, 'low-1', 7, '42', ['As', 'Kd']);

    expect(openHoleCards(SECRET, 'low-1', 7, '43', sealed)).toBeNull();
    expect(openHoleCards(SECRET, 'low-1', 8, '42', sealed)).toBeNull();
    expect(openHoleCards(SECRET, 'low-2', 7, '42', sealed)).toBeNull();
    expect(openHoleCards('other-secret', 'low-1', 7, '42', sealed)).toBeNull();
  });

  it('rejects tampered or malformed input', () => {
    const [iv, tag, ciphertext] = sealHoleCards(SECRET, 'low-1', 7, '42', ['As', 'Kd']).split('.') as [string, string, string];
    const flipped = Buffer.from(ciphertext, 'base64');
    flipped[0] = (flipped[0] as number) ^ 1;

    expect(openHoleCards(SECRET, 'low-1', 7, '42', `${iv}.${tag}.${flipped.toString('base64')}`)).toBeNull();
    expect(openHoleCards(SECRET, 'low-1', 7, '42', 'not-sealed')).toBeNull();
  });

  it('uses a fresh IV each time, so the same cards never look the same', () => {
    expect(sealHoleCards(SECRET, 'low-1', 7, '42', ['As', 'Kd'])).not.toBe(
      sealHoleCards(SECRET, 'low-1', 7, '42', ['As', 'Kd'])
    );
  });
});
