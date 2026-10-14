// Server-only crypto that lets the poker room run over Supabase Realtime
// channels, which anyone holding the public anon key can read and write.
// Both halves rely on POKER_SERVER_SECRET, which only the Next server and the
// poker realtime server (server/pokerRealtimeServer.ts) know — never the
// browser.
//
// 1. Relayed actions. A player's join/leave/act goes to POST /api/poker/action
//    over HTTPS with their session token; that route checks the token and
//    broadcasts the action on the table's channel with the player_id and an
//    HMAC signature. The realtime server only accepts signed actions, so the
//    session token never travels over the public channel, and nobody can
//    act as someone else by broadcasting directly. Each relayed action
//    carries a fresh nonce and its issue time, so a copied message can't be
//    replayed later (the realtime server remembers recent nonces).
//
// 2. Hole cards (SRS-6.1). The realtime server broadcasts each player's two
//    cards sealed with AES-256-GCM under a key derived from the secret, the
//    table, the hand number, and that player's id. Only
//    POST /api/poker/hole-cards opens them, and only with the key for the
//    player_id its caller's session token resolves to — so a player can
//    read their own cards and nobody else's, and nothing is stored anywhere.

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { Card } from './pokerCards';
import type { BettingMove } from './pokerTable';

/** Signed actions older (or further in the future) than this are rejected. */
export const RELAY_MAX_AGE_MS = 30_000;

export function getPokerServerSecret(): string | null {
  return process.env.POKER_SERVER_SECRET || null;
}

export type RelayedActionType = 'join' | 'leave' | 'act';

/** What POST /api/poker/action broadcasts on a table's channel. */
export interface RelayedAction {
  tableId: string;
  /** The client's id for matching the server's ack. */
  requestId: string;
  /** Random per relay, so the same message can't be accepted twice. */
  nonce: string;
  /** ms since the epoch, when the Next route signed it. */
  issuedAt: number;
  /** Resolved from the session token by the Next route — never from the client. */
  playerId: number;
  action: RelayedActionType;
  buyIn?: number;
  seatNumber?: number;
  move?: BettingMove;
  amount?: number;
}

export interface SignedRelayedAction extends RelayedAction {
  signature: string;
}

// Fixed field order, so signing and verifying hash exactly the same string.
function canonical(action: RelayedAction): string {
  return JSON.stringify([
    action.tableId,
    action.requestId,
    action.nonce,
    action.issuedAt,
    action.playerId,
    action.action,
    action.buyIn ?? null,
    action.seatNumber ?? null,
    action.move ?? null,
    action.amount ?? null,
  ]);
}

function hmac(secret: string, message: string): Buffer {
  return createHmac('sha256', secret).update(message).digest();
}

export function signRelayedAction(action: RelayedAction, secret: string): SignedRelayedAction {
  return { ...action, signature: hmac(secret, canonical(action)).toString('base64') };
}

const isOptionalNumber = (value: unknown) => value === undefined || typeof value === 'number';

/**
 * The relayed action if `payload` was signed with `secret` for `tableId`
 * and is recent; null for anything forged, tampered with, stale, or meant
 * for another table.
 */
export function verifyRelayedAction(
  payload: unknown,
  secret: string,
  tableId: string,
  now: number
): RelayedAction | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = payload as Partial<SignedRelayedAction>;

  if (
    typeof candidate.signature !== 'string' ||
    typeof candidate.tableId !== 'string' ||
    typeof candidate.requestId !== 'string' ||
    typeof candidate.nonce !== 'string' ||
    typeof candidate.issuedAt !== 'number' ||
    typeof candidate.playerId !== 'number' ||
    !['join', 'leave', 'act'].includes(candidate.action as string) ||
    !isOptionalNumber(candidate.buyIn) ||
    !isOptionalNumber(candidate.seatNumber) ||
    !isOptionalNumber(candidate.amount) ||
    (candidate.move !== undefined && typeof candidate.move !== 'string')
  ) {
    return null;
  }

  const { signature, ...action } = candidate as SignedRelayedAction;
  const expected = hmac(secret, canonical(action));
  const given = Buffer.from(signature, 'base64');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (action.tableId !== tableId) return null;
  if (Math.abs(now - action.issuedAt) > RELAY_MAX_AGE_MS) return null;

  return action;
}

// One key per (table, hand, player): a player's key opens only their own
// cards, and only for that hand.
function holeCardKey(secret: string, tableId: string, handNumber: number, playerId: string): Buffer {
  return hmac(secret, `poker-hole-cards|${tableId}|${handNumber}|${playerId}`);
}

/** `iv.tag.ciphertext`, each base64. */
export function sealHoleCards(
  secret: string,
  tableId: string,
  handNumber: number,
  playerId: string,
  cards: Card[]
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', holeCardKey(secret, tableId, handNumber, playerId), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(cards), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64')).join('.');
}

/** The cards, or null if `sealed` wasn't sealed for exactly this table, hand, and player. */
export function openHoleCards(
  secret: string,
  tableId: string,
  handNumber: number,
  playerId: string,
  sealed: string
): Card[] | null {
  const parts = sealed.split('.');
  if (parts.length !== 3) return null;
  const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, 'base64')) as [Buffer, Buffer, Buffer];
  if (iv.length !== 12 || tag.length !== 16) return null;

  try {
    const decipher = createDecipheriv('aes-256-gcm', holeCardKey(secret, tableId, handNumber, playerId), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    const cards: unknown = JSON.parse(plaintext);
    return Array.isArray(cards) && cards.every((card) => typeof card === 'string') ? (cards as Card[]) : null;
  } catch {
    return null;
  }
}
