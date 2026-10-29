'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { notifyBalanceChanged } from '../../../lib/balanceEvents';
import {
  BUSTED_DECISION_TIMEOUT_MS,
  MAX_BUY_IN_MULTIPLIER,
  MIN_BUY_IN_MULTIPLIER,
  MIN_PLAYERS_TO_START,
  getBettingOptions,
  isBustedSeat,
  type BettingMove,
  type HandResult,
  type Street,
} from '../../../lib/pokerTable';
import { evaluateHand, type Card } from '../../../lib/pokerCards';
import { POKER_TABLES, getPokerTableConfig } from '../../../lib/pokerTables';
import {
  pokerTableChannelName,
  type PokerHoleCardsRequest,
  type PokerEmotePayload,
  type PokerTableBroadcast,
} from '../../../lib/pokerRealtime';
import { EMOTE_SHOW_MS } from '../../../lib/emotes';
import EmoteArt from '../../../components/emotes/EmoteArt';
import type { EquippedArt } from '../../api/players/[playerId]/cosmetics/route';
import { usePlayerProfile, usePokerChannel } from '../usePoker';
import BettingControls from '../BettingControls';
import ActionCallout, { calloutDuration } from '../ActionCallout';
import EmotePicker from '../EmotePicker';
import {
  CardBackCover,
  DEAL_STAGGER_MS,
  DeckStack,
  BOARD_CARD_PITCH,
  ImpactBurst,
  MuckPile,
  SHUFFLE_MS,
  boardHits,
  boardSlam,
  impactTime,
  offsetVars,
  showdownTimeline,
  slamVars,
  tableGeometry,
  useElementSize,
  useMediaQuery,
  type Hit,
  type ShowdownTimeline,
  type Slam,
} from '../tableAnimations';
import {
  ConnectionPill,
  EmptyCardSlot,
  PlayerChip,
  PlayingCard,
  ProfileOutline,
  Room,
  RoomMessage,
  STAKES_STYLES,
  StakesChip,
  StatPill,
} from '../pokerUi';

// Same idea as QUICK_AMOUNTS on the sportsbook page (app/sports/page.tsx),
// but these add to the current amount rather than setting it outright.
const QUICK_BUY_IN_INCREMENTS = [10, 50, 100, 500];

const STREET_LABELS: Record<Street, string> = {
  preflop: 'Preflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
};

// CSS variables for the animations in app/globals.css (poker-*).
const cssVars = (vars: Record<string, string>) => vars as CSSProperties;

// A board card that comes out of the deck face down, rises, flips over and
// slams onto the felt with a shockwave (app/poker/tableAnimations.tsx).
function SlamCard(props: { card: Card; slam: Slam; from: { x: number; y: number }; size: 'md' | 'lg' }) {
  // Timed once, when the card first appears: later updates (the next action,
  // a resize) mustn't move a card that's already mid-air.
  const [{ card, slam, from }] = useState(props);
  return (
    <span className="poker-slam inline-block" style={cssVars({ ...offsetVars('from', from), ...slamVars(slam) })}>
      <PlayingCard card={card} size={props.size} />
      <CardBackCover size={props.size} />
      <ImpactBurst at={impactTime(slam)} power={slam.power} gold={slam.power === 3} />
    </span>
  );
}

// The blinds a seat owes after missing them (SRS-11.12) — or, for a
// newcomer the button is skipping, has chosen to post — or null.
function owedBlindsLabel(seat: {
  missedSmallBlind: boolean;
  missedBigBlind: boolean;
  waitingForButton: boolean;
  postingMissedBlinds: boolean;
}): 'SB' | 'BB' | 'SB+BB' | null {
  if (seat.waitingForButton) return seat.postingMissedBlinds ? 'SB+BB' : null;
  if (seat.missedSmallBlind && seat.missedBigBlind) return 'SB+BB';
  if (seat.missedBigBlind) return 'BB';
  if (seat.missedSmallBlind) return 'SB';
  return null;
}

// The previous hand's board and outcome, shown in the middle of the felt
// until the next hand is dealt.
// Each winner gets a line: "P1 wins 120", then their hand ("Two pair, Kings
// and Fours") after a showdown.
function LastHandSummary({
  result,
  winnerStart,
  renderBoardCard,
}: {
  result: HandResult;
  // When to show who won — after the reveals and any run-out.
  winnerStart: number;
  renderBoardCard: (card: Card, index: number) => ReactNode;
}) {
  return (
    <div key={result.handNumber} className="poker-result-in flex flex-col items-center gap-1.5">
      {result.board.length > 0 ? <div className="flex gap-1.5">{result.board.map(renderBoardCard)}</div> : null}
      <div className="poker-result-in max-w-[80%] space-y-0.5" style={{ animationDelay: `${winnerStart}ms` }}>
        {result.awards.map((award) => (
          <p key={award.seatNumber} className="text-sm font-bold text-amber-200 sm:text-base">
            {award.username ?? `Seat ${award.seatNumber}`} wins <span className="tabular-nums">{award.amount}</span>
            {award.handName ? (
              <span className="block text-[11px] font-semibold text-amber-100/75 sm:text-xs">{award.handName}</span>
            ) : null}
          </p>
        ))}
      </div>
      {result.ranOut ? <p className="text-[10px] text-emerald-100/50">All-in — board run out</p> : null}
    </div>
  );
}

export default function PokerTablePage({ params }: { params: { tableId: string } }) {
  const router = useRouter();
  const config = getPokerTableConfig(params.tableId);
  const { token, profile, setProfile, loading: profileLoading, error: profileError } = usePlayerProfile();

  const [tableState, setTableState] = useState<PokerTableBroadcast | null>(null);
  // The emote showing over each seat right now, by seat number.
  const [seatEmotes, setSeatEmotes] = useState<Record<number, PokerEmotePayload>>({});
  // This player's own hole cards for the current hand, opened by
  // POST /api/poker/hole-cards from the sealed copy in the state (SRS-6.1).
  const [myCards, setMyCards] = useState<{ handNumber: number; cards: Card[] } | null>(null);
  const requestedCardsForHandRef = useRef<number | null>(null);
  const [joinError, setJoinError] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [rebuying, setRebuying] = useState(false);
  const [choosingBlinds, setChoosingBlinds] = useState(false);
  // Asked to leave while in a hand: the server folds this player when it's
  // their turn and removes them when the hand ends (SRS-21.2/21.3).
  const [leavePending, setLeavePending] = useState(false);
  const [acting, setActing] = useState(false);
  const [actError, setActError] = useState('');
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  // Each seated player's equipped card back, chip and profile outline (UR-120).
  const [cosmetics, setCosmetics] = useState<Record<string, EquippedArt>>({});
  // The open seat the player clicked; they pick one before buying in.
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  // Empty until the table's bigBlind is known (from the first table:state),
  // at which point it's initialized to the minimum buy-in once. A string,
  // not a number, so a player can freely type/clear it (same pattern as
  // the wager amount input on the sportsbook page, app/sports/page.tsx).
  const [buyInText, setBuyInText] = useState('');
  // When the pre-hand countdown ends, on this browser's clock — rebuilt from
  // the server's relative countdownMsRemaining on every table:state, so a
  // clock that disagrees with the server's doesn't matter.
  const [countdownEndsAt, setCountdownEndsAt] = useState<number | null>(null);
  // When this player, busted, will be removed unless they buy back in or
  // leave (SRS-12.10) — rebuilt from their seat's bustedMsRemaining the same way.
  const [bustedEndsAt, setBustedEndsAt] = useState<number | null>(null);
  // Removed for not choosing in time; says why until they sit down again (SRS-9.11).
  const [removedForTimeout, setRemovedForTimeout] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const fetchedAvatarsRef = useRef(new Set<string>());
  // The table's size, for the deck/muck flight paths (app/poker/tableAnimations.tsx).
  const tableRef = useRef<HTMLDivElement>(null);
  const tableSize = useElementSize(tableRef);
  // On a laptop or desktop screen the page fits in the window: the table
  // takes whatever room the top bar and the control dock leave.
  const fitScreen = useMediaQuery('(min-width: 1024px) and (min-height: 600px)');
  const tableAreaRef = useRef<HTMLDivElement>(null);
  const tableArea = useElementSize(tableAreaRef);

  const {
    connected,
    error: channelError,
    sendAction,
  } = usePokerChannel<PokerTableBroadcast>(
    config ? pokerTableChannelName(config.id) : null,
    // Connect while the profile loads, not after.
    Boolean(token),
    (state) => {
      setTableState(state);
      setCountdownEndsAt(state.countdownMsRemaining === null ? null : Date.now() + state.countdownMsRemaining);
    },
    (emote) => {
      setSeatEmotes((shown) => ({ ...shown, [emote.seatNumber]: emote }));
      setTimeout(
        () =>
          setSeatEmotes((shown) => {
            if (shown[emote.seatNumber]?.id !== emote.id) return shown;
            const { [emote.seatNumber]: _gone, ...rest } = shown;
            return rest;
          }),
        EMOTE_SHOW_MS
      );
    }
  );

  // Cards landing shake the whole table (alternating classes, so a shake
  // restarts), and the river flashes the felt. Each landing is scheduled for
  // when its slam hits (app/poker/tableAnimations.tsx).
  const [quake, setQuake] = useState({ count: 0, strength: 0 });
  const [flashCount, setFlashCount] = useState(0);
  const hitTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scheduleHits = useCallback((hits: Hit[]) => {
    for (const hit of hits) {
      hitTimersRef.current.push(
        setTimeout(() => {
          setQuake((previous) => ({ count: previous.count + 1, strength: hit.strength }));
          if (hit.flash) setFlashCount((count) => count + 1);
        }, hit.at)
      );
    }
  }, []);
  useEffect(() => () => hitTimersRef.current.forEach(clearTimeout), []);

  // What was already on the table when this page opened — a hand in
  // progress, or the last hand's result — happened before the player was
  // watching, so it's drawn as it stands instead of being played out again.
  const loadedRef = useRef<{ hand: number; inHand: boolean; board: number; result: number | null } | null>(null);
  if (tableState && !loadedRef.current) {
    loadedRef.current = {
      hand: tableState.handNumber,
      inHand: tableState.phase === 'in-hand',
      board: tableState.board.length,
      result: tableState.phase === 'in-hand' ? null : tableState.lastHandResult?.handNumber ?? null,
    };
  }
  // The hand in progress when the page opened.
  const handIsHistory = Boolean(
    tableState && loadedRef.current?.inHand && loadedRef.current.hand === tableState.handNumber
  );

  // A brand-new action's callout (app/poker/ActionCallout.tsx) sweeps across
  // the table first; cards that action brings out wait for it to pass, so
  // they aren't hidden behind it. 0 when there's no new callout — like the
  // action already on the table when the page loads, which ActionCallout
  // doesn't play either.
  const actionSeenRef = useRef<number | null | undefined>(undefined);
  const latestAction = tableState?.lastAction ?? null;
  const calloutWait =
    latestAction && actionSeenRef.current !== undefined && latestAction.id !== actionSeenRef.current
      ? calloutDuration(latestAction)
      : 0;

  // New board cards during a hand. The board already out when the page
  // loads isn't news, so it doesn't shake anything.
  const boardSeenRef = useRef<{ hand: number; length: number } | null>(null);
  const inHandBoardLength = tableState?.phase === 'in-hand' ? tableState.board.length : null;
  const handNumberNow = tableState?.handNumber ?? null;
  useEffect(() => {
    if (inHandBoardLength === null || handNumberNow === null) return;
    const seen = boardSeenRef.current;
    boardSeenRef.current = { hand: handNumberNow, length: inHandBoardLength };
    if (seen && seen.hand === handNumberNow && inHandBoardLength > seen.length) {
      scheduleHits(boardHits(seen.length, inHandBoardLength, calloutWait));
    }
  }, [inHandBoardLength, handNumberNow, scheduleHits, calloutWait]);

  // The end of a hand: reveals, any run-out, then the winners — one
  // timeline for the animations and the shakes.
  const finishedHand = tableState && tableState.phase !== 'in-hand' ? tableState.lastHandResult : null;
  const showdown: ShowdownTimeline | null = useMemo(() => {
    // No timeline (so no reveals, run-out or payout animation) for a result
    // that was already on the table when the page opened.
    if (!finishedHand || loadedRef.current?.result === finishedHand.handNumber) return null;
    const seen = boardSeenRef.current;
    const boardBefore = seen && seen.hand === finishedHand.handNumber ? seen.length : finishedHand.board.length;
    return showdownTimeline(finishedHand, boardBefore, calloutWait);
    // One timeline per finished hand; later broadcasts of it don't restart anything.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedHand?.handNumber]);
  const shookForHandRef = useRef<number | null>(null);
  useEffect(() => {
    if (!finishedHand || !showdown || shookForHandRef.current === finishedHand.handNumber) return;
    shookForHandRef.current = finishedHand.handNumber;
    scheduleHits(showdown.hits);
  }, [finishedHand, showdown, scheduleHits]);

  // After the effects above have used this state's calloutWait.
  useEffect(() => {
    if (tableState) actionSeenRef.current = tableState.lastAction?.id ?? null;
  }, [tableState]);

  // Folded cards on the muck pile: two per folded seat during a hand, then
  // kept on the table until the next hand gathers them into the deck.
  const foldedCards =
    tableState?.phase === 'in-hand' ? tableState.seats.filter((seat) => seat.folded).length * 2 : null;
  const [heldMuck, setHeldMuck] = useState(0);
  useEffect(() => {
    if (foldedCards !== null) setHeldMuck(foldedCards);
  }, [foldedCards]);

  // Tick while a countdown is running so the seconds left re-render.
  useEffect(() => {
    if (countdownEndsAt === null && bustedEndsAt === null) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [countdownEndsAt, bustedEndsAt]);

  const countdownSeconds =
    countdownEndsAt === null ? null : Math.max(0, Math.ceil((countdownEndsAt - now) / 1000));

  // Avatars aren't carried through the table:state broadcast (a profile
  // photo as base64 can exceed Realtime's broadcast payload size limit), so
  // each seated player's avatar is fetched separately as seats appear, along
  // with their equipped cosmetics. Until those arrive, a seat shows the plain
  // card backs and the table's stakes chip.
  useEffect(() => {
    if (!tableState) return;

    tableState.seats.forEach((seat) => {
      const playerId = seat.playerId;
      if (!playerId || fetchedAvatarsRef.current.has(playerId)) return;
      fetchedAvatarsRef.current.add(playerId);

      fetch(`/api/players/${playerId}/avatar`)
        .then((res) => res.json())
        .then((data) => setAvatars((prev) => ({ ...prev, [playerId]: data.avatarUrl ?? null })))
        .catch(() => setAvatars((prev) => ({ ...prev, [playerId]: null })));

      fetch(`/api/players/${playerId}/cosmetics`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: EquippedArt | null) => {
          if (data) setCosmetics((prev) => ({ ...prev, [playerId]: data }));
        })
        .catch(() => {});
    });
  }, [tableState]);

  // Someone else may sit in the seat this player picked before they buy in.
  useEffect(() => {
    if (selectedSeat === null || !tableState) return;
    if (tableState.seats.find((seat) => seat.seatNumber === selectedSeat)?.playerId) {
      setSelectedSeat(null);
    }
  }, [selectedSeat, tableState]);

  const mySeat = useMemo(() => {
    if (!profile || !tableState) return null;
    return tableState.seats.find((seat) => seat.playerId === String(profile.playerId)) ?? null;
  }, [profile, tableState]);

  // SRS-12.1/12.2: out of chips after a hand. The controls panel then offers
  // to buy back in or leave.
  const amBusted = Boolean(mySeat && isBustedSeat(mySeat));

  useEffect(() => {
    const msRemaining = mySeat?.bustedMsRemaining ?? null;
    setBustedEndsAt(msRemaining === null ? null : Date.now() + msRemaining);
  }, [mySeat]);
  const bustedSeconds = bustedEndsAt === null ? null : Math.max(0, Math.ceil((bustedEndsAt - now) / 1000));

  // A busted player's seat disappearing without them clicking Leave means
  // the server removed them for not choosing in time (SRS-12.10).
  const wasBustedRef = useRef(false);
  useEffect(() => {
    if (!tableState) return;
    if (amBusted) {
      wasBustedRef.current = true;
    } else if (mySeat) {
      wasBustedRef.current = false;
    } else if (wasBustedRef.current) {
      wasBustedRef.current = false;
      if (!leaving) setRemovedForTimeout(true);
    }
  }, [tableState, amBusted, mySeat, leaving]);

  // Open this player's sealed hole cards once per hand. The sealed copy
  // changes with every broadcast (fresh IV), so this keys off the hand number.
  const handNumber = tableState?.handNumber ?? null;
  const mySealedCards =
    profile && tableState?.phase === 'in-hand' ? tableState.holeCards[String(profile.playerId)] : undefined;
  useEffect(() => {
    if (!mySealedCards || !token || !config || handNumber === null) return;
    if (requestedCardsForHandRef.current === handNumber) return;
    requestedCardsForHandRef.current = handNumber;

    const request: PokerHoleCardsRequest = { tableId: config.id, handNumber, sealed: mySealedCards };
    fetch('/api/poker/hole-cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(request),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.cards) setMyCards({ handNumber, cards: data.cards });
        // Let the next broadcast try again.
        else requestedCardsForHandRef.current = null;
      })
      .catch(() => {
        requestedCardsForHandRef.current = null;
      });
  }, [mySealedCards, token, config, handNumber]);

  // Once a pending leave goes through at the end of the hand, this player's
  // seat disappears from the state: go back to the lobby, like a normal leave.
  useEffect(() => {
    if (leavePending && tableState && !mySeat) {
      notifyBalanceChanged();
      router.push('/poker');
    }
  }, [leavePending, tableState, mySeat, router]);

  // A rejected action is about the turn it was made on; drop the message
  // once the turn moves on.
  const activeSeat = tableState?.activeSeat ?? null;
  useEffect(() => {
    setActError('');
  }, [activeSeat]);

  const isFull = tableState ? tableState.seatedCount >= tableState.maxSeats : false;
  const minBuyIn = tableState ? MIN_BUY_IN_MULTIPLIER * tableState.bigBlind : null;
  const maxBuyIn =
    tableState && profile ? Math.min(MAX_BUY_IN_MULTIPLIER * tableState.bigBlind, profile.balance) : null;
  const canAffordBuyIn = minBuyIn !== null && maxBuyIn !== null && maxBuyIn >= minBuyIn;

  // Same parsing approach as the sportsbook's wager input: only digits count
  // as a valid amount, so an empty/partial/non-numeric entry is just null
  // rather than NaN.
  const parsedBuyIn = /^\d+$/.test(buyInText) ? Number(buyInText) : null;
  let buyInError = '';
  if (buyInText && parsedBuyIn === null) buyInError = 'Enter a whole number of chips.';
  else if (parsedBuyIn !== null && minBuyIn !== null && parsedBuyIn < minBuyIn) {
    buyInError = `Minimum buy-in is ${minBuyIn}.`;
  } else if (parsedBuyIn !== null && maxBuyIn !== null && parsedBuyIn > maxBuyIn) {
    buyInError = `Maximum buy-in is ${maxBuyIn}.`;
  }
  const buyInValid = parsedBuyIn !== null && !buyInError;

  function addToBuyIn(amount: number) {
    if (minBuyIn === null || maxBuyIn === null) return;
    const base = parsedBuyIn ?? minBuyIn;
    setBuyInText(String(Math.min(base + amount, maxBuyIn)));
  }

  // Initialize the input to the minimum once the table's bigBlind (and so
  // minBuyIn) is known — it isn't available until the first table:state.
  // Only once: a player clearing the field to type a new amount shouldn't
  // have it refilled under them (see resetEmptyBuyIn for that instead).
  const buyInInitializedRef = useRef(false);
  useEffect(() => {
    if (!buyInInitializedRef.current && minBuyIn !== null) {
      buyInInitializedRef.current = true;
      setBuyInText(String(minBuyIn));
    }
  }, [minBuyIn]);

  // On going bust, start the buy-back amount at the minimum again and refresh
  // the balance that caps it.
  useEffect(() => {
    if (!amBusted) return;
    if (minBuyIn !== null) setBuyInText(String(minBuyIn));
    void refreshBalance();
    // Only when the player goes bust, not on every balance change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amBusted]);

  // When the player clicks away from a blank/non-numeric buy-in, put the
  // minimum back rather than leaving the field empty.
  function resetEmptyBuyIn() {
    if (parsedBuyIn === null && minBuyIn !== null) setBuyInText(String(minBuyIn));
  }

  // The buy-in/refund happens server-side against players.balance, but
  // joining doesn't navigate, so the nav bar's own balance fetch (which only
  // re-runs on route change) would otherwise never pick it up. Refresh this
  // page's own copy of the balance too, so the buy-in input's max stays
  // accurate.
  async function refreshBalance() {
    if (!token) return;
    const res = await fetch('/api/profile/balance', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setProfile((prev) => (prev ? { ...prev, balance: data.balance } : prev));
    }
    notifyBalanceChanged();
  }

  async function handleJoin() {
    if (!connected || !token || !buyInValid || parsedBuyIn === null || selectedSeat === null) return;
    setJoinError('');
    const result = await sendAction(token, {
      tableId: params.tableId,
      action: 'join',
      buyIn: parsedBuyIn,
      seatNumber: selectedSeat,
    });
    if (result.ok) {
      setSelectedSeat(null);
      setRemovedForTimeout(false);
      await refreshBalance();
    } else {
      setJoinError(result.error || 'Unable to join the table.');
    }
  }

  // SRS-12.4: a busted player buys back in at their seat. The server checks
  // the amount against the table's range and their balance (SRS-12.6/12.7)
  // and its reason for refusing is shown here (SRS-12.8).
  async function handleRebuy() {
    if (!connected || !token || !buyInValid || parsedBuyIn === null) return;
    setJoinError('');
    setRebuying(true);
    const result = await sendAction(token, { tableId: params.tableId, action: 'rebuy', buyIn: parsedBuyIn });
    setRebuying(false);
    if (result.ok) await refreshBalance();
    else setJoinError(result.error || 'Unable to buy back in.');
  }

  // Leaving sends the player back to the lobby to pick another table —
  // right away between hands, or once the hand ends if they're in it.
  // SRS-11.6: post the blinds this player owes to be dealt into the next
  // hand, or (post = false) go back to waiting for the big blind. The server
  // says why when it can't allow posting yet (SRS-11.9).
  async function handlePostBlinds(post: boolean) {
    if (!connected || !token) return;
    setJoinError('');
    setChoosingBlinds(true);
    const result = await sendAction(token, {
      tableId: params.tableId,
      action: post ? 'post-blinds' : 'wait-for-big-blind',
    });
    setChoosingBlinds(false);
    if (!result.ok) setJoinError(result.error || 'Unable to change that right now.');
  }

  async function handleLeave() {
    if (!connected || !token) return;
    setJoinError('');
    setLeaving(true);
    const result = await sendAction(token, { tableId: params.tableId, action: 'leave' });
    if (result.ok && result.pending) {
      setLeaving(false);
      setLeavePending(true);
    } else if (result.ok) {
      notifyBalanceChanged();
      router.push('/poker');
    } else {
      setLeaving(false);
      setJoinError(result.error || 'Unable to leave the table.');
    }
  }

  // An emote, for everyone at the table to see over this player's seat.
  async function handleEmote(emote: string) {
    if (!connected || !token) return;
    const result = await sendAction(token, { tableId: params.tableId, action: 'emote', emote });
    if (!result.ok && result.error) setActError(result.error);
  }

  async function handleAct(move: BettingMove, amount?: number) {
    if (!connected || !token || acting) return;
    setActError('');
    setActing(true);
    const result = await sendAction(token, { tableId: params.tableId, action: 'act', move, amount });
    setActing(false);
    if (!result.ok) setActError(result.error || 'That action was not accepted.');
  }

  if (!config) {
    return <RoomMessage message="That poker table doesn't exist." href="/poker" linkText="Back to the lobby" />;
  }

  if (profileLoading) {
    return (
      <Room center>
        <p className="text-slate-400">Loading…</p>
      </Room>
    );
  }

  // SRS-1.1 (simplified): the poker room is only accessible to a signed-in player.
  if (!token || !profile) {
    return (
      <RoomMessage
        message={profileError || 'You must be logged in to join the poker table.'}
        href="/login"
        linkText="Go to login"
      />
    );
  }

  const canPickSeat = !mySeat && !leaving;
  const pageError = joinError || channelError;
  const tableMinBuyIn = MIN_BUY_IN_MULTIPLIER * config.bigBlind;
  // Whether some lower-stakes table's minimum buy-in fits the player's balance.
  const canAffordLowerStakes = POKER_TABLES.some(
    (table) => table.bigBlind < config.bigBlind && MIN_BUY_IN_MULTIPLIER * table.bigBlind <= profile.balance
  );
  const tableMaxBuyIn = MAX_BUY_IN_MULTIPLIER * config.bigBlind;
  // The range slider moves in big-blind steps; the text input still takes any amount.
  const sliderValue =
    minBuyIn !== null && maxBuyIn !== null ? Math.min(Math.max(parsedBuyIn ?? minBuyIn, minBuyIn), maxBuyIn) : 0;

  const inHandPhase = tableState?.phase === 'in-hand';
  const isMyTurn = Boolean(mySeat && inHandPhase && tableState?.activeSeat === mySeat.seatNumber);
  const activePlayer = inHandPhase ? tableState?.seats.find((seat) => seat.seatNumber === tableState.activeSeat) : null;
  // Collected pots plus everything bet so far this round.
  const potTotal = tableState ? tableState.pot + tableState.seats.reduce((sum, seat) => sum + seat.bet, 0) : 0;
  const bettingOptions = mySeat && tableState ? getBettingOptions(mySeat, tableState) : null;
  const myHoleCards = inHandPhase && myCards?.handNumber === tableState?.handNumber ? myCards.cards : null;
  const board = tableState?.board ?? [];
  const myHandName = myHoleCards && board.length >= 3 ? evaluateHand([...myHoleCards, ...board]).name : null;
  // The amount input, range slider and quick-add buttons, shared by joining
  // and a busted player's buy-back.
  const buyInFields =
    minBuyIn === null || maxBuyIn === null ? null : (
      <>
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="buy-in-amount" className="text-xs uppercase tracking-wider text-slate-500">
              Buy-in
            </label>
            <span className="text-xs tabular-nums text-slate-500">
              {minBuyIn}&ndash;{maxBuyIn}
            </span>
          </div>
          <div className="relative mt-1">
            <input
              id="buy-in-amount"
              inputMode="numeric"
              value={buyInText}
              onChange={(e) => setBuyInText(e.target.value.trim())}
              onBlur={resetEmptyBuyIn}
              placeholder={String(minBuyIn)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 pr-16 text-2xl font-semibold tabular-nums text-amber-200 outline-none transition focus:border-amber-300"
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-500">
              chips
            </span>
          </div>
          <input
            type="range"
            aria-label="Buy-in amount"
            min={minBuyIn}
            max={maxBuyIn}
            step={config.bigBlind}
            value={sliderValue}
            onChange={(e) => setBuyInText(e.target.value)}
            className="mt-3 w-full accent-amber-300"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setBuyInText(String(minBuyIn))}
            className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-300 transition hover:border-amber-300/70"
          >
            Min
          </button>
          {QUICK_BUY_IN_INCREMENTS.map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => addToBuyIn(amount)}
              className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs tabular-nums text-slate-300 transition hover:border-amber-300/70"
            >
              +{amount}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setBuyInText(String(maxBuyIn))}
            className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-300 transition hover:border-amber-300/70"
          >
            Max
          </button>
        </div>

        {buyInError ? <p className="text-sm text-red-300">{buyInError}</p> : null}
      </>
    );
  // Between hands, the last hand's showdown stays on the table until the next deal.
  const lastResult = !inHandPhase ? tableState?.lastHandResult ?? null : null;
  // Hole cards are dealt one at a time from the small blind clockwise
  // (SRS-16.3); the deal animation follows the same order.
  const smallBlindSeat = tableState?.smallBlindSeat ?? null;
  const dealOrder =
    tableState && inHandPhase && smallBlindSeat !== null
      ? tableState.seats
          .filter((seat) => seat.inHand || seat.folded)
          .map((seat) => seat.seatNumber)
          .sort(
            (a, b) =>
              ((a - smallBlindSeat + tableState.maxSeats) % tableState.maxSeats) -
              ((b - smallBlindSeat + tableState.maxSeats) % tableState.maxSeats)
          )
      : [];
  const myCosmetics = cosmetics[String(profile.playerId)];
  // Fitting the screen: as big as the table area allows, leaving room for
  // the seats that hang over its edge (their centres sit 6% in from the top
  // and bottom and 4% from the sides; a seat reaches ~110px tall, ~110px wide).
  // Seats also grow with the table (up to 30%), so they need more room
  // around it: sized once, then again with the seats' scale.
  // The oval is 1.9 times as wide as it's tall when there's room, and gets
  // rounder (down to 1.4) when width runs short, so it still fills the height.
  const WIDEST_TABLE = 1.9;
  const ROUNDEST_TABLE = 1.4;
  const seatScaleFor = (tableWidth: number) => Math.min(1.3, Math.max(1, tableWidth / 950));
  const fitTable = (scale: number) => {
    const maxWidth = (tableArea.width - 110 * scale) / 0.92;
    const maxHeight = (tableArea.height - 120 * scale) / 0.88;
    const height = Math.max(260, Math.min(maxHeight, maxWidth / ROUNDEST_TABLE, 700));
    const width = Math.min(maxWidth, height * WIDEST_TABLE);
    return { width: Math.round(width), height: Math.round(height) };
  };
  let fittedTable: { width: number; height: number } | null = null;
  if (fitScreen && tableArea.width > 0 && tableArea.height > 0) {
    fittedTable = fitTable(seatScaleFor(fitTable(1).width));
  }
  const seatScale = fittedTable ? seatScaleFor(fittedTable.width) : 1;
  // A big table gets big board cards.
  const boardCardSize: 'md' | 'lg' = fittedTable && fittedTable.width >= 900 ? 'lg' : 'md';
  const geometry = tableGeometry(tableSize, BOARD_CARD_PITCH[boardCardSize]);
  const myOwedLabel = mySeat ? owedBlindsLabel(mySeat) : null;
  // SRS-11.7/11.8: a live big blind and/or a dead small blind — both for a
  // newcomer the button is skipping.
  const myPostCost = !mySeat
    ? 0
    : mySeat.waitingForButton
      ? config.bigBlind + config.smallBlind
      : (mySeat.missedBigBlind ? config.bigBlind : 0) + (mySeat.missedSmallBlind ? config.smallBlind : 0);

  return (
    // One screen on a laptop or desktop: a slim top bar, the table filling the
    // middle, and the controls docked underneath. Narrower screens scroll.
    <main className="flex min-h-page flex-col gap-3 bg-slate-950 bg-[radial-gradient(ellipse_at_top,_#14532d_0%,_#052e16_35%,_#020617_75%)] px-4 pb-4 pt-3 text-slate-100 sm:px-6 lg:h-[calc(100vh-4rem)]">
      <header className="flex w-full shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {!mySeat ? (
            <Link
              href="/poker"
              className="shrink-0 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-slate-300 transition hover:border-emerald-400/60 hover:text-emerald-200"
            >
              ← Lobby
            </Link>
          ) : null}
          <StakesChip stakes={config.stakes} size="h-9 w-9" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{config.name}</h1>
            <p className="truncate text-xs text-slate-400 sm:text-sm">
              <span className="uppercase tracking-[0.2em] text-emerald-300/80">{config.stakes} stakes</span> · Blinds{' '}
              <span className={`font-semibold tabular-nums ${STAKES_STYLES[config.stakes].accent}`}>
                {config.smallBlind}/{config.bigBlind}
              </span>{' '}
              · Buy-in{' '}
              <span className="tabular-nums text-slate-300">
                {tableMinBuyIn}&ndash;{tableMaxBuyIn}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          {tableState ? (
            <StatPill>
              {tableState.phase === 'in-hand' ? (
                <span className="font-semibold text-emerald-300">
                  Hand #{tableState.handNumber}
                  {tableState.street ? ` · ${STREET_LABELS[tableState.street]}` : ''}
                </span>
              ) : tableState.phase === 'countdown' ? (
                <span className="font-semibold text-amber-300">Next hand in {countdownSeconds ?? 0}s</span>
              ) : (
                <span className="text-slate-400">Waiting for players</span>
              )}
            </StatPill>
          ) : null}
          {tableState ? (
            <StatPill>
              <span className="font-semibold tabular-nums text-amber-300">
                {tableState.seatedCount} / {tableState.maxSeats}
              </span>{' '}
              <span className="text-slate-400">{isFull ? 'seated · full' : 'seated'}</span>
            </StatPill>
          ) : null}
          <ConnectionPill connected={connected} />
        </div>
      </header>

      {/* On a wide screen: you and your cards on the left, the table in the
          middle, your actions on the right. Stacked on a phone: the table,
          then your actions, then you. */}
      <div className="flex w-full flex-1 flex-col gap-4 lg:min-h-0 lg:flex-row lg:items-center">
      {/* The table, as big as the room between the side panels allows. */}
      <div ref={tableAreaRef} className="relative flex w-full flex-1 items-center justify-center px-8 py-12 sm:px-10 lg:order-2 lg:min-h-0 lg:self-stretch lg:p-0">
        <div
          ref={tableRef}
          className={`relative ${fittedTable ? '' : 'h-[340px] w-full max-w-3xl sm:h-[440px]'} ${
            quake.count === 0 ? '' : quake.count % 2 ? 'poker-quake-a' : 'poker-quake-b'
          }`}
          style={{
            ...(fittedTable ? { width: fittedTable.width, height: fittedTable.height } : {}),
            ...cssVars({ '--quake': `${quake.strength}px` }),
          }}
        >
          {/* Light over the table */}
          <div className="pointer-events-none absolute inset-x-[10%] -top-8 bottom-0 rounded-[50%] bg-[radial-gradient(ellipse_at_center,_rgba(52,211,153,0.12)_0%,_transparent_65%)]" />

          {/* Wooden rail */}
          <div className="absolute inset-[7%] rounded-[50%] bg-gradient-to-br from-amber-700 via-amber-900 to-amber-950 shadow-[0_30px_60px_rgba(0,0,0,0.7)]">
            <div className="absolute inset-[3px] rounded-[50%] border border-amber-500/20" />
          </div>

          {/* Felt */}
          <div className="absolute inset-[12%] rounded-[50%] bg-[radial-gradient(ellipse_at_center,_#15803d_0%,_#065f46_60%,_#022c22_100%)] shadow-[inset_0_0_60px_rgba(0,0,0,0.65)]">
            {/* Racetrack line */}
            <div className="absolute inset-[8%] rounded-[50%] border border-emerald-300/15" />
            {/* The river's flash */}
            {flashCount > 0 ? (
              <div key={flashCount} className="poker-felt-flash pointer-events-none absolute inset-0 rounded-[50%]" />
            ) : null}
            {/* Center: pot during a hand, the countdown before one, otherwise the emblem */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center">
              {tableState?.phase === 'in-hand' ? (
                <>
                  <p className="text-[10px] uppercase tracking-[0.35em] text-emerald-200/60 sm:text-xs">
                    {tableState.street ? STREET_LABELS[tableState.street] : ''} · Hand #{tableState.handNumber}
                  </p>
                  {/* Community cards (SRS-17) */}
                  <div className="flex gap-1.5">
                    {Array.from({ length: 5 }, (_, index) =>
                      tableState.board[index] && handIsHistory && index < (loadedRef.current?.board ?? 0) ? (
                        // Already out when the page opened.
                        <PlayingCard
                          key={`${tableState.handNumber}-${index}`}
                          card={tableState.board[index]}
                          size={boardCardSize}
                        />
                      ) : tableState.board[index] ? (
                        // A new street's cards leave the deck face down, rise, flip and
                        // slam onto the felt (the flop one after another, the river hardest).
                        <SlamCard
                          key={`${tableState.handNumber}-${index}`}
                          card={tableState.board[index] as Card}
                          slam={boardSlam(index, calloutWait)}
                          from={geometry.boardFromDeck(index)}
                          size={boardCardSize}
                        />
                      ) : (
                        <EmptyCardSlot key={index} size={boardCardSize} />
                      )
                    )}
                  </div>
                  <p
                    key={tableState.pot}
                    className="poker-pop flex items-center gap-2 rounded-full bg-black/35 px-4 py-1.5 text-xl font-bold tabular-nums text-amber-200 shadow-inner shadow-black/40 sm:text-2xl"
                  >
                    <StakesChip stakes={config.stakes} size="h-5 w-5" />
                    Pot {tableState.pot}
                  </p>
                  {tableState.pots.length > 1 ? (
                    // SRS-19: main pot and side pots.
                    <p className="text-[11px] tabular-nums text-emerald-100/60 sm:text-xs">
                      {tableState.pots
                        .map((pot, index) => `${index === 0 ? 'Main' : `Side ${index}`} ${pot.amount}`)
                        .join(' · ')}
                    </p>
                  ) : null}
                  {tableState.currentBet > 0 ? (
                    <p className="text-[11px] text-emerald-100/50 sm:text-xs">Current bet {tableState.currentBet}</p>
                  ) : null}
                </>
              ) : tableState?.phase === 'countdown' && countdownSeconds !== null ? (
                <>
                  {lastResult ? (
                    <LastHandSummary
                      result={lastResult}
                      winnerStart={showdown?.winnerStart ?? 0}
                      renderBoardCard={(card, index) => {
                        const slam = showdown?.runout(index);
                        return slam ? (
                          <SlamCard
                            key={card}
                            card={card}
                            slam={slam}
                            from={geometry.boardFromDeck(index)}
                            size={boardCardSize}
                          />
                        ) : (
                          <PlayingCard key={card} card={card} size={boardCardSize} />
                        );
                      }}
                    />
                  ) : null}
                  <p className="text-[10px] uppercase tracking-[0.35em] text-emerald-200/60 sm:text-xs">
                    {lastResult ? 'Next hand in' : 'Hand starts in'}
                  </p>
                  <p
                    key={countdownSeconds}
                    className={`animate-countdown-tick font-bold tabular-nums text-amber-200 drop-shadow-[0_0_18px_rgba(252,211,77,0.35)] ${
                      lastResult ? 'text-3xl' : 'text-5xl sm:text-6xl'
                    }`}
                  >
                    {countdownSeconds}
                  </p>
                </>
              ) : (
                <>
                  {lastResult ? (
                    <LastHandSummary
                      result={lastResult}
                      winnerStart={showdown?.winnerStart ?? 0}
                      renderBoardCard={(card, index) => {
                        const slam = showdown?.runout(index);
                        return slam ? (
                          <SlamCard
                            key={card}
                            card={card}
                            slam={slam}
                            from={geometry.boardFromDeck(index)}
                            size={boardCardSize}
                          />
                        ) : (
                          <PlayingCard key={card} card={card} size={boardCardSize} />
                        );
                      }}
                    />
                  ) : (
                    <>
                      <StakesChip stakes={config.stakes} size="h-8 w-8" />
                      <p className="text-[10px] uppercase tracking-[0.4em] text-emerald-200/30 sm:text-xs">
                        Stacks Overflowed
                      </p>
                    </>
                  )}
                  {tableState ? (
                    // SRS-20.5: waiting-for-players indicator.
                    <p className="text-xs text-emerald-100/60 sm:text-sm">
                      Waiting for players ·{' '}
                      <span className="tabular-nums">
                        {Math.min(tableState.seatedCount, MIN_PLAYERS_TO_START)}/{MIN_PLAYERS_TO_START}
                      </span>
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </div>

          {/* The deck (gathers and shuffles at each new hand) and the folded cards' muck pile. */}
          {tableState ? (
            <DeckStack
              geometry={geometry}
              handNumber={tableState.handNumber}
              shuffle={tableState.handNumber !== loadedRef.current?.hand}
            />
          ) : null}
          <MuckPile geometry={geometry} count={foldedCards ?? heldMuck} />

          {tableState?.seats.map((seat, index) => {
            // Seats are placed by angle around an oval, starting at the top
            // and going clockwise, like sitting around a real table.
            const angle = (2 * Math.PI * index) / tableState.maxSeats - Math.PI / 2;
            const left = 50 + 46 * Math.cos(angle);
            const top = 50 + 44 * Math.sin(angle);
            const isOwnSeat = seat.playerId === String(profile.playerId);
            const isSelected = seat.seatNumber === selectedSeat;
            const isPickable = canPickSeat && !seat.playerId;
            // Seated, but sat down after this hand was dealt (or out of chips).
            const sittingOut = Boolean(seat.playerId) && inHandPhase && !seat.inHand && !seat.folded;
            const owedLabel = seat.playerId ? owedBlindsLabel(seat) : null;
            const isActive = inHandPhase && tableState.activeSeat === seat.seatNumber;
            const isBusted = isBustedSeat(seat);
            // Cards at the seat: this player's own face up; everyone else
            // still in the hand face down; at showdown, the revealed hands.
            const shown = lastResult?.shown.find(
              (hand) => hand.seatNumber === seat.seatNumber && hand.playerId === seat.playerId
            );
            const wonLastHand = Boolean(lastResult?.awards.some((award) => award.seatNumber === seat.seatNumber));
            const seatCards: (Card | null)[] | null = shown
              ? shown.cards
              : isOwnSeat && myHoleCards && (seat.inHand || seat.folded)
                ? myHoleCards
                : inHandPhase && (seat.inHand || seat.folded)
                  ? [null, null]
                  : null;
            // Folded cards — this player's own too — go to the muck pile.
            const mucked = inHandPhase && seat.folded;
            const dealIndex = Math.max(dealOrder.indexOf(seat.seatNumber), 0);
            const shownIndex = lastResult?.shown.findIndex((hand) => hand.seatNumber === seat.seatNumber) ?? -1;
            // From this seat's cards to the deck (dealing) and to the muck pile (folding).
            const cardsAt = geometry.seatCards(left, top);
            const flightVars = {
              ...offsetVars('deal', { x: geometry.deck.x - cardsAt.x, y: geometry.deck.y - cardsAt.y }),
              ...offsetVars('muck', { x: geometry.muck.x - cardsAt.x, y: geometry.muck.y - cardsAt.y }),
            };
            const award = lastResult?.awards.find((candidate) => candidate.seatNumber === seat.seatNumber);
            const awardIndex = award && lastResult ? lastResult.awards.indexOf(award) : 0;
            const winnerStart = showdown?.winnerStart ?? 0;
            // The button stays on its seat between hands, like a real table.
            const isDealer = Boolean(seat.playerId) && tableState.dealerSeat === seat.seatNumber;
            const seatCosmetics = seat.playerId ? cosmetics[seat.playerId] : undefined;
            // Only until the seat acts: after that the bet is theirs, not just the blind.
            const blindLabel = !inHandPhase || seat.hasActed
              ? null
              : seat.seatNumber === tableState.smallBlindSeat
                ? 'SB'
                : seat.seatNumber === tableState.bigBlindSeat
                  ? 'BB'
                  : null;

            return (
              <Fragment key={seat.seatNumber}>
                {/* Chips this seat has put in, pushed out toward the pot */}
                {seat.bet > 0 ? (
                  <div
                    style={{ left: `${50 + 28 * Math.cos(angle)}%`, top: `${50 + 24 * Math.sin(angle)}%` }}
                    className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
                  >
                    {/* Slides out from the seat each time the bet changes. */}
                    <div
                      key={`${tableState.handNumber}-${tableState.street}-${seat.bet}`}
                      style={cssVars({ '--from-x': `${Math.cos(angle) * 110}px`, '--from-y': `${Math.sin(angle) * 70}px` })}
                      className="poker-chip-in flex items-center gap-1.5 rounded-full border border-white/10 bg-black/60 py-0.5 pl-0.5 pr-2.5 shadow-lg shadow-black/50"
                    >
                      <PlayerChip artKey={seatCosmetics?.chip} stakes={config.stakes} size="h-5 w-5" />
                      <span className="text-xs font-semibold tabular-nums text-amber-100">{seat.bet}</span>
                      {blindLabel ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">{blindLabel}</span>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {/* The pot sliding over to a winner, one winner after another. */}
                {award && lastResult && showdown ? (
                  <span
                    key={`won-${lastResult.handNumber}`}
                    style={cssVars({
                      '--to-left': `${50 + 28 * Math.cos(angle)}%`,
                      '--to-top': `${50 + 24 * Math.sin(angle)}%`,
                      '--delay': `${winnerStart + 300 + awardIndex * 350}ms`,
                    })}
                    className="poker-pot-to-winner pointer-events-none absolute z-30 flex -translate-x-1/2 -translate-y-1/2 -space-x-3"
                  >
                    <StakesChip stakes={config.stakes} size="h-6 w-6" />
                    <StakesChip stakes={config.stakes} size="h-6 w-6" />
                    <StakesChip stakes={config.stakes} size="h-6 w-6" />
                  </span>
                ) : null}

                {/* Blinds owed (SRS-11.12): missed while not dealt in, until they're dealt back in */}
                {owedLabel ? (
                  <span
                    title={`Owes the ${owedLabel === 'SB+BB' ? 'small and big blind' : owedLabel === 'SB' ? 'small blind' : 'big blind'}`}
                    style={{ left: `${50 + 34 * Math.cos(angle - 0.38)}%`, top: `${50 + 31 * Math.sin(angle - 0.38)}%` }}
                    className="absolute z-20 flex h-6 min-w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-dashed border-amber-300 bg-slate-950/90 px-1 text-[9px] font-black text-amber-200 shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
                  >
                    {owedLabel}
                  </span>
                ) : null}

                {/* This seat's emote, popping up over the player's photo */}
                {seat.playerId && seatEmotes[seat.seatNumber]?.playerId === seat.playerId ? (
                  <span
                    style={{ left: `${left}%`, top: `${top}%` }}
                    className="pointer-events-none absolute z-40 -translate-x-1/2 -translate-y-[calc(100%+2.5rem)]"
                  >
                    <span key={seatEmotes[seat.seatNumber]?.id} className="emote-pop block">
                      <EmoteArt
                        emoteId={seatEmotes[seat.seatNumber]?.emote ?? ''}
                        className={`h-24 w-24 drop-shadow-[0_6px_10px_rgba(0,0,0,0.5)] emote-move-${seatEmotes[seat.seatNumber]?.emote}`}
                      />
                    </span>
                  </span>
                ) : null}

                {/* Dealer button (SRS-13.5) */}
                {isDealer ? (
                  <span
                    title="Dealer"
                    style={{ left: `${50 + 34 * Math.cos(angle + 0.38)}%`, top: `${50 + 31 * Math.sin(angle + 0.38)}%` }}
                    className="absolute z-20 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-slate-300 bg-white text-[11px] font-black text-slate-900 shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
                  >
                    D
                  </span>
                ) : null}

                <div
                  // Seats grow with a big table (the CSS scale property, so it
                  // doesn't fight the centring transform).
                  style={{ left: `${left}%`, top: `${top}%`, scale: seatScale === 1 ? undefined : String(seatScale) }}
                  className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center transition-opacity ${
                    sittingOut || seat.folded ? 'opacity-45' : ''
                  }`}
                >
                  {seatCards ? (
                    <div className="absolute -right-5 top-0 z-20 flex -space-x-2.5 sm:-right-6">
                      {seatCards.map((card, cardIndex) => {
                        // Dealt from the deck once it's shuffled, one card at a time
                        // in deal order (this player's own arrive face up); thrown
                        // onto the muck on a fold; at showdown flipped over, hand by
                        // hand in the order they're shown.
                        const motion = mucked ? 'muck' : shown ? 'reveal' : 'deal';
                        if (motion === 'reveal' && showdown) {
                          // Shown hands slam down one after another; winners with a gold burst.
                          const slam = showdown.reveal(Math.max(shownIndex, 0), cardIndex);
                          return (
                            <span
                              key={`${tableState.handNumber}-reveal-${card ?? 'back'}-${cardIndex}`}
                              className={cardIndex === 0 ? '-rotate-6' : 'rotate-6'}
                            >
                              <span className="poker-slam inline-block" style={cssVars(slamVars(slam))}>
                                <PlayingCard card={card} size="sm" highlight={Boolean(shown && wonLastHand)} />
                                <CardBackCover size="sm" />
                                <ImpactBurst at={impactTime(slam)} power={wonLastHand ? 2 : 1} gold={wonLastHand} />
                              </span>
                            </span>
                          );
                        }
                        // Already dealt (or folded, or shown) before the page opened: no replay.
                        if ((handIsHistory && motion !== 'reveal') || (motion === 'reveal' && !showdown)) {
                          if (motion === 'muck') return null;
                          return (
                            <span
                              key={`${tableState.handNumber}-still-${card ?? 'back'}-${cardIndex}`}
                              className={cardIndex === 0 ? '-rotate-6' : 'rotate-6'}
                            >
                              <PlayingCard
                                card={card}
                                size="sm"
                                highlight={Boolean(shown && wonLastHand)}
                                backArtKey={seatCosmetics?.card}
                              />
                            </span>
                          );
                        }
                        const delay =
                          motion === 'deal' ? SHUFFLE_MS + (cardIndex * dealOrder.length + dealIndex) * DEAL_STAGGER_MS : 0;
                        return (
                          <span
                            key={`${tableState.handNumber}-${motion}-${card ?? 'back'}-${cardIndex}`}
                            className={cardIndex === 0 ? '-rotate-6' : 'rotate-6'}
                          >
                            <span
                              className={`inline-block ${motion === 'deal' ? 'poker-deal' : motion === 'muck' ? 'poker-muck' : 'poker-flip'}`}
                              style={cssVars({ ...flightVars, '--delay': `${delay}ms` })}
                            >
                              <PlayingCard
                                card={card}
                                size="sm"
                                highlight={Boolean(shown && wonLastHand)}
                                backArtKey={seatCosmetics?.card}
                              />
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                  {/* "+120" over a winner, once the pot reaches them. */}
                  {award && lastResult && showdown ? (
                    <span
                      key={`won-${lastResult.handNumber}`}
                      style={cssVars({ '--delay': `${winnerStart + 1300 + awardIndex * 350}ms` })}
                      className="poker-win-float pointer-events-none absolute bottom-full left-1/2 z-40 mb-1 whitespace-nowrap rounded-full bg-amber-300 px-2.5 py-0.5 text-sm font-black tabular-nums text-slate-950 shadow-lg shadow-black/50"
                    >
                      +{award.amount}
                    </span>
                  ) : null}
                  {/* The equipped profile outline hangs outside the photo, so it
                      sits beside the button rather than in its clipped circle. */}
                  <div
                    className={`relative z-10 h-14 w-14 shrink-0 rounded-full sm:h-16 sm:w-16 ${award && showdown ? 'poker-win-glow' : ''}`}
                    style={award && showdown ? cssVars({ animationDelay: `${winnerStart + 1300 + awardIndex * 350}ms` }) : undefined}
                  >
                    <button
                      type="button"
                      disabled={!isPickable}
                      onClick={() => setSelectedSeat(seat.seatNumber)}
                      aria-label={isPickable ? `Pick seat ${seat.seatNumber}` : undefined}
                      aria-pressed={isPickable ? isSelected : undefined}
                      className={`h-full w-full overflow-hidden rounded-full transition disabled:cursor-default ${
                        isActive
                          ? 'border-2 border-amber-300 bg-slate-900 ring-4 ring-amber-300/40 shadow-[0_0_26px_rgba(252,211,77,0.6)] animate-pulse'
                          : seat.playerId
                            ? seatCosmetics?.outline
                              ? 'border-2 border-transparent bg-slate-900 shadow-lg shadow-black/60'
                              : isOwnSeat
                                ? 'border-2 border-emerald-300 bg-slate-900 shadow-[0_0_20px_rgba(110,231,183,0.45)]'
                                : 'border-2 border-slate-300/40 bg-slate-900 shadow-lg shadow-black/60'
                            : isSelected
                              ? 'scale-110 border-2 border-amber-300 bg-amber-950/80 shadow-[0_0_22px_rgba(252,211,77,0.55)]'
                              : isPickable
                                ? 'border-2 border-dashed border-emerald-200/40 bg-slate-950/70 hover:scale-105 hover:border-amber-300 hover:bg-amber-950/40'
                                : 'border-2 border-dashed border-slate-600/40 bg-slate-950/60'
                      }`}
                    >
                      {seat.playerId ? (
                        avatars[seat.playerId] ? (
                          <img src={avatars[seat.playerId] as string} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-lg font-semibold text-emerald-200">
                            {seat.username?.[0]?.toUpperCase()}
                          </span>
                        )
                      ) : (
                        <span
                          className={`flex h-full w-full items-center justify-center text-xs font-semibold uppercase tracking-wider ${
                            isSelected ? 'text-amber-200' : isPickable ? 'text-emerald-200/70' : 'text-slate-600'
                          }`}
                        >
                          {isPickable ? 'Sit' : seat.seatNumber}
                        </span>
                      )}
                    </button>
                    {seat.playerId ? <ProfileOutline artKey={seatCosmetics?.outline} /> : null}
                  </div>

                  {/* Name plate, dropped a little to clear an outline */}
                  <div
                    className={`${seat.playerId && seatCosmetics?.outline ? 'relative z-30 mt-1.5' : '-mt-2'} min-w-[76px] max-w-[96px] rounded-lg border px-2 pb-1 pt-2.5 text-center shadow-lg shadow-black/50 ${
                      seat.playerId
                        ? isOwnSeat
                          ? 'border-emerald-300/40 bg-slate-950/95'
                          : 'border-white/10 bg-slate-950/95'
                        : isSelected
                          ? 'border-amber-300/40 bg-slate-950/90'
                          : 'border-transparent bg-black/40'
                    }`}
                  >
                    <p
                      className={`truncate text-xs font-medium ${
                        seat.playerId
                          ? isOwnSeat
                            ? 'text-emerald-200'
                            : 'text-slate-100'
                          : isSelected
                            ? 'text-amber-200'
                            : 'text-slate-500'
                      }`}
                    >
                      {seat.playerId ? (isOwnSeat ? 'You' : seat.username) : isSelected ? 'Your pick' : `Seat ${seat.seatNumber}`}
                    </p>
                    {seat.chipStack !== null ? (
                      <p className="flex items-center justify-center gap-1 text-[11px] font-semibold tabular-nums text-amber-300">
                        {seatCosmetics?.chip ? (
                          <PlayerChip artKey={seatCosmetics.chip} stakes={config.stakes} size="h-3.5 w-3.5" />
                        ) : (
                          <span className="h-2 w-2 rounded-full border border-dashed border-white/70 bg-amber-500" />
                        )}
                        {seat.chipStack}
                      </p>
                    ) : null}
                    {shown ? (
                      // Named once the hand lands — or, after an all-in, once the
                      // board has run out, so the name doesn't give it away.
                      <p
                        className={`poker-pop-in max-w-[96px] truncate text-[10px] font-semibold ${
                          wonLastHand ? 'text-amber-300' : 'text-slate-300'
                        }`}
                        style={{
                          animationDelay: `${
                            lastResult?.ranOut
                              ? winnerStart
                              : showdown
                                ? impactTime(showdown.reveal(Math.max(shownIndex, 0), 1))
                                : 0
                          }ms`,
                        }}
                      >
                        {shown.handName}
                      </p>
                    ) : isActive ? (
                      // SRS-3.2: active turn indicator.
                      <p key="to-act" className="poker-pop-in text-[10px] font-bold uppercase tracking-wider text-amber-300">
                        To act
                      </p>
                    ) : seat.allIn ? (
                      <p key="all-in" className="poker-pop-in text-[10px] font-bold uppercase tracking-wider text-red-300">
                        All-in
                      </p>
                    ) : seat.folded ? (
                      <p key="folded" className="poker-pop-in text-[10px] uppercase tracking-wider text-slate-400">
                        Folded
                      </p>
                    ) : seat.lastAction ? (
                      <p
                        key={`action-${seat.lastAction}`}
                        className="poker-pop-in text-[10px] font-semibold uppercase tracking-wider text-sky-300"
                      >
                        {seat.lastAction}
                      </p>
                    ) : isBusted ? (
                      <p className="text-[10px] uppercase tracking-wider text-slate-400">Out of chips</p>
                    ) : (owedLabel || seat.waitingForButton) && !seat.inHand ? (
                      <p className="text-[10px] uppercase tracking-wider text-amber-300/80">
                        {seat.postingMissedBlinds
                          ? 'Posting next hand'
                          : seat.waitingForButton
                            ? 'Sits out a hand'
                            : 'Waiting for BB'}
                      </p>
                    ) : sittingOut ? (
                      <p className="text-[10px] uppercase tracking-wider text-slate-400">Next hand</p>
                    ) : null}
                  </div>
                </div>
              </Fragment>
            );
          })}

          {/* Every action gets a comic callout across the table. Mounted with the
              first state, so the action already on the table isn't replayed. */}
          {tableState ? (
            <ActionCallout
              action={tableState.lastAction}
              actionKey={tableState.lastAction ? String(tableState.lastAction.id) : null}
              ownSeatNumber={mySeat?.seatNumber ?? null}
            />
          ) : null}
        </div>

        {/* Emotes, any time while seated */}
        {mySeat ? (
          <div className="absolute bottom-2 left-2 z-40 lg:bottom-4 lg:left-4">
            <EmotePicker onSend={handleEmote} />
          </div>
        ) : null}
      </div>

        {/* Left: who you are — photo, balance, stack and Leave — and your cards */}
        <aside className="rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900/95 to-slate-950/95 p-4 shadow-2xl shadow-black/60 order-3 flex flex-col gap-4 lg:order-1 lg:w-60 lg:shrink-0">
          <div className="flex flex-wrap items-center gap-4 lg:flex-col lg:flex-nowrap lg:items-stretch">
            <div className="flex min-w-0 items-center gap-3">
              <div className={`relative h-11 w-11 shrink-0 ${myCosmetics?.outline ? 'm-2.5' : ''}`}>
                <div
                  className={`h-full w-full overflow-hidden rounded-full border-2 bg-slate-900 ${
                    myCosmetics?.outline ? 'border-transparent' : 'border-emerald-300/60'
                  }`}
                >
                  {profile.profilePhotoDataUrl ? (
                    <img src={profile.profilePhotoDataUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-base font-semibold text-slate-300">
                      {profile.username?.[0]?.toUpperCase()}
                    </span>
                  )}
                </div>
                <ProfileOutline artKey={myCosmetics?.outline} />
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-100">{profile.username}</p>
                <p className="text-sm text-slate-400">
                  Balance <span className="font-semibold tabular-nums text-amber-300">{profile.balance}</span>
                </p>
              </div>
            </div>
            {mySeat && !amBusted ? (
              <div className="ml-auto flex items-center gap-4 lg:ml-0 lg:justify-between lg:border-t lg:border-white/10 lg:pt-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Stack · Seat {mySeat.seatNumber}</p>
                  <p className="flex items-center gap-1.5 text-2xl font-bold tabular-nums text-amber-300">
                    <PlayerChip artKey={myCosmetics?.chip} stakes={config.stakes} size="h-6 w-6" />
                    {mySeat.chipStack}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleLeave}
                  disabled={leaving || leavePending}
                  title={
                    leavePending
                      ? "You'll fold when it's your turn and leave when this hand ends — anything you win this hand comes with you."
                      : inHandPhase && mySeat.inHand
                        ? "Leaving during a hand folds you when it's your turn; you leave once the hand ends."
                        : undefined
                  }
                  className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {leaving
                      ? 'Leaving…'
                      : leavePending
                        ? 'Leaving after this hand'
                        : mySeat.inHand && inHandPhase
                          ? 'Leave'
                          : 'Leave table'}
                </button>
              </div>
            ) : null}
          </div>
          {mySeat && myHoleCards ? (
            <div className="flex items-center gap-3 lg:flex-col lg:items-stretch lg:border-t lg:border-white/10 lg:pt-4">
              <div className="flex gap-1.5">
                {myHoleCards.map((card) => (
                  <PlayingCard key={card} card={card} size="lg" />
                ))}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Your hand</p>
                <p className="font-semibold leading-tight text-slate-100">
                  {mySeat.folded ? 'Folded' : myHandName ?? 'Waiting for the flop'}
                </p>
              </div>
            </div>
          ) : null}
        </aside>

        {/* Right: what you can do right now */}
        <aside className="rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900/95 to-slate-950/95 p-4 shadow-2xl shadow-black/60 order-2 flex flex-col gap-3 lg:order-3 lg:max-h-full lg:w-80 lg:shrink-0 lg:overflow-y-auto">
            {removedForTimeout && !mySeat ? (
              // SRS-9.11: why they lost their seat.
              <p className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                You were removed from your seat because you didn&apos;t buy back in or leave within{' '}
                {BUSTED_DECISION_TIMEOUT_MS / 1000} seconds of running out of chips.
              </p>
            ) : null}
            {!mySeat ? (
              leaving ? (
                <p className="py-3 text-center text-slate-300">Returning to the lobby…</p>
              ) : isFull ? (
                <div className="flex flex-wrap items-center justify-center gap-4">
                  <p className="text-slate-300">This table is full.</p>
                  <Link
                    href="/poker"
                    className="rounded-xl border border-white/10 bg-slate-800 px-5 py-2.5 font-semibold text-slate-200 transition hover:border-emerald-400/60"
                  >
                    Find another table
                  </Link>
                </div>
              ) : minBuyIn === null || maxBuyIn === null ? (
                <p className="py-3 text-center text-slate-400">Loading table…</p>
              ) : !canAffordBuyIn ? (
                <div className="flex flex-wrap items-center justify-center gap-4">
                  <p className="text-slate-300">
                    You need at least <span className="font-semibold text-amber-300">{minBuyIn}</span> to sit here (your
                    balance: {profile.balance}).
                  </p>
                  {canAffordLowerStakes ? (
                    <Link
                      href="/poker"
                      className="rounded-xl border border-white/10 bg-slate-800 px-5 py-2.5 font-semibold text-slate-200 transition hover:border-emerald-400/60"
                    >
                      Try lower stakes
                    </Link>
                  ) : (
                    // Already the lowest stakes (or can't afford those either): the
                    // shop's Daily Login Box is where free coins come from.
                    <Link
                      href="/shop"
                      className="rounded-xl border border-white/10 bg-slate-800 px-5 py-2.5 font-semibold text-slate-200 transition hover:border-emerald-400/60"
                    >
                      Get free coins in the shop
                    </Link>
                  )}
                </div>
              ) : (
                // Pick a seat on the table, choose a buy-in, sit down.
                <div className="grid gap-4">
                  <ol className="flex flex-wrap gap-x-6 gap-y-2 text-sm lg:flex-col">
                    <li className={selectedSeat === null ? 'text-amber-200' : 'text-emerald-300'}>
                      <span
                        className={`mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
                          selectedSeat === null ? 'bg-amber-300 text-slate-950' : 'bg-emerald-400 text-slate-950'
                        }`}
                      >
                        {selectedSeat === null ? '1' : '✓'}
                      </span>
                      {selectedSeat === null ? 'Pick an open seat' : `Seat ${selectedSeat}`}
                    </li>
                    <li className={selectedSeat === null ? 'text-slate-500' : 'text-amber-200'}>
                      <span
                        className={`mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
                          selectedSeat === null ? 'bg-slate-800 text-slate-400' : 'bg-amber-300 text-slate-950'
                        }`}
                      >
                        2
                      </span>
                      Choose your buy-in
                    </li>
                  </ol>
                  <div className="min-w-0 space-y-2">{buyInFields}</div>
                  <button
                    type="button"
                    onClick={handleJoin}
                    disabled={!connected || !buyInValid || selectedSeat === null}
                    className="rounded-xl bg-emerald-400 px-6 py-4 font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
                  >
                    {selectedSeat === null
                      ? 'Pick a seat to join'
                      : buyInValid
                        ? `Sit in seat ${selectedSeat} with ${parsedBuyIn} chips`
                        : 'Join table'}
                  </button>
                </div>
              )
            ) : (
              <>
                {amBusted ? (
                  // SRS-12.2: buy back in, or leave (SRS-12.3).
                  <div className="rounded-2xl border border-red-400/30 bg-red-500/[0.05] p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="text-lg font-semibold text-red-200">You&apos;re out of chips</p>
                      {bustedSeconds !== null ? (
                        <p className="text-sm font-semibold text-amber-200">
                          Choose within <span className="tabular-nums">{bustedSeconds}s</span> or you&apos;ll be removed
                        </p>
                      ) : null}
                    </div>
                    <p className="text-sm text-slate-400">
                      Buy back in to keep your seat ({mySeat.seatNumber}), or leave the table. You&apos;ll sit out until
                      you buy back in.
                    </p>
                    {canAffordBuyIn ? (
                      <div className="mt-3 grid gap-3">
                        <div className="min-w-0 space-y-2">{buyInFields}</div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleRebuy}
                            disabled={!connected || !buyInValid || rebuying || leaving}
                            className="flex-1 rounded-xl bg-emerald-400 px-6 py-3 font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
                          >
                            {rebuying ? 'Buying back in…' : buyInValid ? `Buy back in with ${parsedBuyIn}` : 'Buy back in'}
                          </button>
                          <button
                            type="button"
                            onClick={handleLeave}
                            disabled={leaving || rebuying}
                            className="rounded-xl border border-red-400/40 bg-red-500/10 px-6 py-3 font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {leaving ? 'Leaving…' : 'Leave table'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <p className="text-sm text-slate-300">
                          Buying back in takes at least <span className="font-semibold text-amber-300">{minBuyIn}</span>{' '}
                          (your balance: {profile.balance}).
                        </p>
                        <Link
                          href="/shop"
                          className="rounded-xl border border-white/10 bg-slate-800 px-5 py-2.5 text-center font-semibold text-slate-200 transition hover:border-emerald-400/60"
                        >
                          Get free coins in the shop
                        </Link>
                        <button
                          type="button"
                          onClick={handleLeave}
                          disabled={leaving}
                          className="rounded-xl border border-red-400/40 bg-red-500/10 px-5 py-2.5 font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {leaving ? 'Leaving…' : 'Leave table'}
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}

                {(myOwedLabel || mySeat.waitingForButton) && !amBusted && !mySeat.inHand ? (
                  // SRS-11.5/11.6: wait for the big blind, or post what's owed to play the next hand. A
                  // newcomer the button is about to skip posts both blinds, or sits one hand out.
                  <div className="flex flex-col gap-3 rounded-2xl border border-amber-300/30 bg-amber-300/[0.04] p-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-amber-200">
                        {mySeat.waitingForButton
                          ? 'The button is about to reach your seat'
                          : `You owe the ${myOwedLabel === 'SB+BB' ? 'small and big blind' : myOwedLabel === 'SB' ? 'small blind' : 'big blind'}`}
                      </p>
                      <p className="text-sm text-slate-400">
                        {mySeat.postingMissedBlinds
                          ? `You'll post ${myPostCost} and be dealt into the next hand.`
                          : mySeat.waitingForButton
                            ? `The button skips new players, so you'll sit out the next hand and be dealt in free after that — or post both blinds (${myPostCost}) to play it.`
                            : `You'll be dealt in when the big blind reaches your seat — or post ${myPostCost} to play the next hand.`}
                      </p>
                      {(mySeat.waitingForButton || (mySeat.missedSmallBlind && mySeat.missedBigBlind)) &&
                      !mySeat.postingMissedBlinds ? (
                        <p className="mt-1 text-xs text-slate-500">
                          Posting puts in a live big blind ({config.bigBlind}) that counts toward your bet, plus a dead
                          small blind ({config.smallBlind}) that goes straight into the pot.
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => handlePostBlinds(!mySeat.postingMissedBlinds)}
                      disabled={!connected || choosingBlinds}
                      className={`shrink-0 rounded-xl px-6 py-3 font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                        mySeat.postingMissedBlinds
                          ? 'border border-white/10 bg-slate-800 text-slate-200 hover:border-amber-300/60'
                          : 'bg-amber-300 text-slate-950 shadow-lg shadow-amber-500/20 hover:bg-amber-200'
                      }`}
                    >
                      {mySeat.postingMissedBlinds
                        ? mySeat.waitingForButton
                          ? 'Sit out one hand instead'
                          : 'Wait for the big blind instead'
                        : `Post ${myPostCost} and play next hand`}
                    </button>
                  </div>
                ) : null}

                {!amBusted ? (
                  <div>
                    <div>
                      {isMyTurn && bettingOptions && tableState ? (
                        <div className="rounded-2xl border border-amber-300/40 bg-amber-300/[0.06] p-3 shadow-[0_0_28px_rgba(252,211,77,0.12)]">
                          <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-amber-200">Your turn</p>
                          <BettingControls
                            // Fresh controls (and amount) for every turn and every change in the bet to match.
                            key={`${tableState.handNumber}-${tableState.street}-${tableState.currentBet}-${mySeat.bet}`}
                            options={bettingOptions}
                            potTotal={potTotal}
                            seatBet={mySeat.bet}
                            disabled={acting || !connected}
                            onAct={handleAct}
                          />
                        </div>
                      ) : inHandPhase && mySeat.inHand ? (
                        <p className="text-sm text-slate-400">
                          {mySeat.allIn
                            ? "You're all-in — sit tight until the hand is over."
                            : `Waiting for ${activePlayer?.username ?? 'the next player'} to act…`}
                        </p>
                      ) : inHandPhase && !mySeat.folded && !mySeat.inHand && !myOwedLabel && !mySeat.waitingForButton ? (
                        <p className="text-sm text-slate-400">You sat down mid-hand, so you&apos;ll be dealt in next hand.</p>
                      ) : !inHandPhase && !myOwedLabel && !mySeat.waitingForButton ? (
                        <p className="text-sm text-slate-400">
                          {tableState?.phase === 'countdown'
                            ? `Next hand in ${countdownSeconds ?? 0}s…`
                            : 'Waiting for more players to start the next hand…'}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {actError ? (
                  <p className="rounded-xl border border-red-800 bg-red-950/60 p-3 text-sm text-red-200">{actError}</p>
                ) : null}
              </>
            )}

            {pageError ? (
              <p className="rounded-xl border border-red-800 bg-red-950/60 p-3 text-sm text-red-200">{pageError}</p>
            ) : null}
        </aside>
      </div>
    </main>
  );
}
