# Stacks Overflowed

## Software Requirements Specification (SRS)

CSC 351

Prepared from the Stacks Overflowed User Requirements Document (URD) 

1. # Introduction

**1.1 Purpose**

This Software Requirements Specification (SRS) translates the user requirements captured in the Stacks Overflowed User Requirements Document (URD) into detailed, testable system requirements. Where the URD describes what users need and why, this SRS defines exactly what the system shall do in response, in terms precise enough for a developer to implement and a tester to verify.

**1.2 Scope**

The system is a web-based virtual gambling entertainment platform offering poker, roulette, slots, blackjack, sports betting, and a cosmetic shop, backed by user profiles, statistics, and a virtual currency. No real money is accepted, wagered, or withdrawn anywhere on the platform.

**1.3 Intended Audience**

This document is intended for the development team, instructor, testers, and stakeholders responsible for building, verifying, and evaluating the system.

**1.4 User Classes**

Player: A registered user who plays games, wagers virtual currency, and manages their profile.

Guest: A visitor who must register or log in before accessing games.

**1.5 Operating Environment**

The system is a web application accessed through a modern browser, composed of a frontend, backend, database, and a websocket layer supporting real-time multiplayer features.

**1.6 Document Conventions**

Each functional requirement is numbered SRS-\#.\#, where the leading number matches the URD item it expands (e.g., URD-3 expands into SRS-3.1, SRS-3.2, ...). Non-functional requirements are numbered separately as SRS-NFR-\#. Every requirement lists the author's initials and the URD item(s) it traces to. Per current course instructions, Given/When/Then acceptance criteria are intentionally omitted from this submission.

Two items in the URD (the "view other players' profiles" item under Profile Page, and the second occurrence of UR-207 under Sports Betting) were not assigned distinct numbers in the source document. They are labeled UR-111a and UR-207b respectively in this SRS solely to preserve traceability; this is noted at each occurrence.

 

2. # **Poker Room**

## **Definitions**

**Eligible player:** A seated player who is not marked disconnected (SRS-10.1 or SRS-10.2) and not marked busted (SRS-12.1) without having since bought back in (SRS-12.5). An eligible player is physically able to be dealt into a hand.

**Clear player:** An eligible player who has no missed-blind marker recorded under SRS-11.1 through SRS-11.4.

**Dealt-in player:** A player included in a given hand per SRS-13.4: every clear player, the player occupying the big blind seat, and every player whose missed-blind election was accepted under SRS-11.6.

**In-hand player:** A dealt-in player who has not folded in the current hand.

**Able-to-act player:** An in-hand player who is not all-in.

# **Table access and turn handling**

**UR-001, JN – Multiplayer Functionality**

*User story: As a player, I want to join an online table with other players in real time, so that I can play poker with people and friends regardless of physical location.*

**SRS-1.1, Join open seat.** The system shall allow a player to occupy any open seat at a selected table when the table has fewer seated players than its configured maximum seat count (SRS-NFR-022), subject to SRS-1.2 and SRS-1.3.

*Traces to: UR-001*

**SRS-1.2, Buy-in on join.** The system shall seat a player only after transferring that player's chosen buy-in amount from their persistent account balance to their table stack.

*Traces to: UR-001*

**SRS-1.3, Reject invalid join buy-in.** Upon receiving a join request whose buy-in amount is outside the range in SRS-NFR-021 or exceeds the player's persistent account balance, the system shall reject the request.

*Traces to: UR-001*

**SRS-1.4, Reject join on full table.** Upon receiving a join request for a table with zero open seats, the system shall not seat the requesting player.

*Traces to: UR-001*

**SRS-1.5, Reject join to occupied seat.** Upon receiving a join request for a specific seat that is already occupied, the system shall not seat the requesting player in that seat.

*Traces to: UR-001*

**SRS-1.6, Join rejection message.** Upon rejecting a join request under SRS-1.3, SRS-1.4, or SRS-1.5, the system shall display an error message stating the reason for rejection on the requesting player's client.

*Traces to: UR-001*

**SRS-1.7, Public table state contents.** The system shall include at least the following in the public table state: seat occupancy, each seated player's username and chip stack, each player's round contribution, the amount of each pot, the community cards, the dealer button seat, the small and big blind seats, the current bet, the seat holding the active turn, the most recent player action, the waiting-for-players indicator, and the blind-owed indicator.

*Traces to: UR-001*

**SRS-1.8, Real-time state synchronization.** Upon any change to the public table state, the system shall transmit the updated public table state to every seated player's client within the latency in SRS-NFR-017.

*Traces to: UR-001*

**UR-002, JN – Player Reconnection**

*User story: As a player, I want to have the option to rejoin my seat if I get disconnected, so that a dropped connection doesn't cost me my seat, without forcing other players to wait on me for hands I miss while disconnected.*

**SRS-2.1, Reconnect to held seat.** The system shall allow a disconnected player to resume their held seat upon reconnection detected per SRS-10.3, at any point before that player is removed from their seat.

*Traces to: UR-002*

**SRS-2.2, Check on behalf of disconnected player.** When action reaches an able-to-act player who is marked disconnected and does not face a bet, the system shall check on that player's behalf immediately, without starting the per-turn countdown in SRS-4.1.

*Traces to: UR-002*

**SRS-2.3, Fold on behalf of disconnected player.** When action reaches an able-to-act player who is marked disconnected and faces a bet, the system shall fold that player's hand immediately, without starting the per-turn countdown in SRS-4.1.

*Traces to: UR-002*

**SRS-2.4, Resume participation on reconnect.** Upon detecting a player's reconnection per SRS-10.3, the system shall treat that player as an eligible player from the next hand start, provided that player has not been removed from their seat.

*Traces to: UR-002*

**UR-003, JN – Turn-Based Fairness**

*User story: As a player, I want the game to only accept actions from whoever's turn it currently is, so that no player can act out of turn or gain an unfair information advantage.*

**SRS-3.1, Reject out-of-turn actions.** Upon receiving a betting action from any client other than that of the player holding the active turn, the system shall reject the action, leaving the pot, the board, and every player's stack unchanged.

*Traces to: UR-003*

**SRS-3.2, Display active turn indicator.** While a player holds the active turn, the system shall display an active-turn indicator on that player's seat to every seated player's client.

*Traces to: UR-003*

**UR-004, JN – Automatic Timeout Handling**

*User story: As a player, I want other players who are slow to act or have gone AFK to be automatically checked or folded after a time limit, so that the game doesn't stall waiting on someone who isn't responding.*

**SRS-4.1, Per-turn countdown display.** From the moment a connected player's turn begins, the system shall display that player's remaining turn time to every seated player's client.

*Traces to: UR-004*

**SRS-4.2, Auto-check on turn timeout.** When the per-turn time limit in SRS-NFR-018 elapses without a submitted action and the acting player does not face a bet, the system shall check on that player's behalf.

*Traces to: UR-004*

**SRS-4.3, Auto-fold on turn timeout.** When the per-turn time limit in SRS-NFR-018 elapses without a submitted action and the acting player faces a bet, the system shall fold that player's hand.

*Traces to: UR-004*

**SRS-4.4, Advance after automatic action.** Upon completing an automatic action under SRS-2.2, SRS-2.3, SRS-4.2, or SRS-4.3, the system shall determine the next step of the hand per SRS-18.3 and SRS-18.5.

*Traces to: UR-004*

# **Hand resolution, privacy, persistence, and profiles**

**UR-005, JN – Accurate Hand Resolution**

*User story: As a player, I want my final hand to be correctly evaluated and compared against other players at showdown, so that the pot is always awarded to the rightful winner(s), including split pots on ties.*

**SRS-5.1, Best-hand selection.** At showdown, the system shall determine each in-hand player's best five-card hand from the seven cards formed by that player's two hole cards and the five community cards.

*Traces to: UR-005*

**SRS-5.2, Hand category order.** The system shall rank hand categories from highest to lowest as: straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, one pair, high card.

*Traces to: UR-005*

**SRS-5.3, Tiebreak within a category.** When two hands share a category, the system shall rank them by comparing card ranks in order of significance for that category (for example, for a full house, the three-of-a-kind rank before the pair rank), then by remaining kickers from highest to lowest.

*Traces to: UR-005*

**SRS-5.4, Ace in straights.** The system shall treat an ace as either the highest card (10-J-Q-K-A) or the lowest card (A-2-3-4-5, the lowest straight) in a straight, and shall not recognize wraparound straights such as Q-K-A-2-3.

*Traces to: UR-005*

**SRS-5.5, Suits do not rank.** The system shall not use card suits to rank hands or break ties.

*Traces to: UR-005*

**SRS-5.6, Award each pot.** At showdown, the system shall award each pot to the player holding the highest-ranked hand among the players eligible for that pot per SRS-19.4.

*Traces to: UR-005*

**SRS-5.7, Split pot on tie.** When two or more players eligible for a pot hold hands of identical rank under SRS-5.2 through SRS-5.5, and no eligible player holds a higher hand, the system shall divide that pot equally among those players, in whole units of the table's smallest chip denomination.

*Traces to: UR-005*

**SRS-5.8, Odd-chip allocation.** When a pot cannot be divided equally under SRS-5.7, the system shall award each remaining smallest-denomination chip, one at a time, to the tied winners in clockwise order, starting from the first tied winner clockwise of the dealer button.

*Traces to: UR-005*

**UR-006, JN – Private Cards**

*User story: As a player, I want my cards to stay hidden from other players until showdown, so that no one can gain an unfair advantage by seeing cards they shouldn't.*

**SRS-6.1, Hole-card confidentiality.** The system shall not transmit the values of a player's hole cards to any client other than that player's, from the deal until those cards are revealed per SRS-6.2 or SRS-6.4.

*Traces to: UR-006*

**SRS-6.2, Reveal at showdown.** At showdown, the system shall reveal the hole cards of each in-hand player to every seated player, in the order defined in SRS-6.5.

*Traces to: UR-006*

**SRS-6.3, Folded hands never revealed.** The system shall not reveal the hole cards of a folded hand to any client other than its owner's, at any time.

*Traces to: UR-006*

**SRS-6.4, Reveal on all-in run-out.** When SRS-17.8 applies, the system shall reveal the hole cards of every in-hand player to every seated player before dealing the remaining community cards.

*Traces to: UR-006*

**SRS-6.5, Showdown reveal order.** At showdown, the system shall reveal hands starting with the last player to bet or raise in the final betting round, then proceeding clockwise; if no bet was made in the final round, it shall start with the first in-hand player clockwise of the dealer button.

*Traces to: UR-006*

**UR-007, JN – Persistent Stack Tracking**

*User story: As a player, I want my chip stack to be accurately tracked across hands and sessions, so that I don't lose chips due to bugs, disconnects, or server restarts.*

**SRS-7.1, Stack carries forward between hands.** The system shall carry a player's ending chip stack from one hand forward as their starting stack for the next hand at the same table.

*Traces to: UR-007*

**SRS-7.2, Persist stack after each hand.** Upon completion of each hand, the system shall write every seated player's chip stack to persistent storage within the time in SRS-NFR-019.

*Traces to: UR-007*

**SRS-7.3, Restore persisted stack.** Upon a player's return after logout, disconnection, or server restart, the system shall restore that player's chip stack from the most recently persisted value.

*Traces to: UR-007*

**SRS-7.4, Void interrupted hand.** Upon restarting after an interruption that occurred during a hand in progress, the system shall void that hand and restore every dealt-in player's stack to its persisted value from before that hand began.

*Traces to: UR-007*

**UR-008, JN – Players' Profile Pictures**

*User story: As a player, I want my opponents' profile pictures to be visible and clickable to show a quick bio, so that we can express ourselves through photos and I can view their profile.*

**SRS-8.1, Display seated players' profile pictures.** The system shall display each seated player's profile picture at that player's table position.

*Traces to: UR-008*

**SRS-8.2, Default profile picture.** The system shall display a default profile picture at the table position of any seated player who has not uploaded a profile picture.

*Traces to: UR-008*

**SRS-8.3, Profile summary on selection.** When a seated player's profile picture is selected, the system shall display that player's username, profile picture, and bio text.

*Traces to: UR-008*

# **Inactivity, connection, missed blinds, and busted players**

**UR-009, JN – Removal for Prolonged Inactivity**

*User story: As a player, I want the system to automatically remove a player who is unable or unwilling to participate, whether through prolonged disconnection or repeated timed-out turns while connected, so that a seat isn't held indefinitely and the table can keep moving for everyone else.*

**SRS-9.1, Skip disconnected players at hand start.** The system shall not deal in any player who is marked disconnected per SRS-10.1 or SRS-10.2 at hand start.

*Traces to: UR-009*

**SRS-9.2, Start disconnection timer.** Upon marking a player disconnected per SRS-10.1 or SRS-10.2, the system shall start a continuous-disconnection timer for that player.

*Traces to: UR-009*

**SRS-9.3, Reset disconnection timer.** Upon detecting a player's reconnection per SRS-10.3, the system shall reset that player's continuous-disconnection timer to zero.

*Traces to: UR-009*

**SRS-9.4, Removal on disconnection timeout.** When a player's continuous-disconnection timer reaches the duration in SRS-NFR-013, the system shall remove that player from their seat, subject to SRS-9.13.

*Traces to: UR-009*

**SRS-9.5, Increment timeout counter.** Upon the first automatic action taken for a player under SRS-4.2 or SRS-4.3 in a given hand, the system shall increment that player's consecutive-timeout counter by one.

*Traces to: UR-009*

**SRS-9.6, Reset timeout counter.** Upon a player submitting a voluntary betting action, the system shall reset that player's consecutive-timeout counter to zero.

*Traces to: UR-009*

**SRS-9.7, Removal on timeout threshold.** When a player's consecutive-timeout counter reaches the threshold in SRS-NFR-014, the system shall remove that player from their seat, subject to SRS-9.13.

*Traces to: UR-009*

**SRS-9.8, Near-removal warning.** When a player's consecutive-timeout counter reaches one less than the threshold in SRS-NFR-014, the system shall display a warning stating the number of remaining timed-out hands before removal on that player's client, within the latency in SRS-NFR-020.

*Traces to: UR-009*

**SRS-9.9, Stack transfer on removal.** Upon removing a player under SRS-9.4, SRS-9.7, SRS-12.3, SRS-12.10, SRS-21.1, or SRS-21.3, the system shall transfer that player's chip stack, excluding chips already committed to any pot, to that player's persistent account balance.

*Traces to: UR-009*

**SRS-9.10, Seat released on removal.** Upon completing a player's removal, the system shall mark that player's seat as open.

*Traces to: UR-009*

**SRS-9.11, Removal notification while connected.** Upon removing a player under SRS-9.4, SRS-9.7, or SRS-12.10 while that player is marked connected, the system shall display a notification stating the reason for removal on that player's client, within the latency in SRS-NFR-020.

*Traces to: UR-009*

**SRS-9.12, Removal notification after disconnection.** Upon a player who was removed under SRS-9.4, SRS-9.7, or SRS-12.10 while marked disconnected next opening the application, the system shall display a notification stating the reason for removal.

*Traces to: UR-009*

**SRS-9.13, Defer removal of in-hand player.** When a player meets a removal condition under SRS-9.4 or SRS-9.7 while in-hand, the system shall defer that player's removal until the hand ends.

*Traces to: UR-009*

**SRS-9.14, Deferred player remains eligible.** The system shall keep a player whose removal is deferred under SRS-9.13 eligible for every pot to which that player contributed, provided that player does not fold.

*Traces to: UR-009*

**UR-010, JN – Connection Health Monitoring**

*User story: As a player, I want the table to detect when a seated player's connection has dropped, so that reconnection handling and inactivity removal apply at the correct time.*

**SRS-10.1, Disconnection detection by silence.** The system shall mark a seated player as disconnected when it has received no communication from that player's client for 30 consecutive seconds.

*Traces to: UR-010*

**SRS-10.2, Disconnection detection by termination.** The system shall mark a seated player as disconnected within 1 second of that player's client connection being terminated.

*Traces to: UR-010*

**SRS-10.3, Reconnection detection.** The system shall mark a disconnected player as reconnected upon receiving an authenticated request from that player's client.

*Traces to: UR-010*

**UR-011, JN – Missed Blind Handling**

*User story: As a player, I want any player who misses the small or big blind, for any reason, to either post the missed blinds or wait for the big blind before being dealt back in, so that no one can avoid paying blinds by disconnecting, busting, or joining mid-orbit.*

**SRS-11.1, Record missed big blind.** At each hand start after a table's first hand, the system shall record a missed big blind for each seated player who is not dealt in and whose seat lies, in clockwise order, after the previous hand's big blind seat and at or before the current hand's big blind seat.

*Traces to: UR-011*

**SRS-11.2, Record missed small blind.** At each hand start after a table's first hand, the system shall record a missed small blind for each seated player who is not dealt in and whose seat lies, in clockwise order, after the previous hand's small blind seat and at or before the current hand's small blind seat.

*Traces to: UR-011*

**SRS-11.3, New players owe the big blind.** Upon seating a player at a table whose dealer button has already been assigned, the system shall record a missed big blind for that player.

*Traces to: UR-011*

**SRS-11.4, Retain both markers.** The system shall retain both a missed small blind and a missed big blind for a player who misses both, rather than replacing one with the other.

*Traces to: UR-011*

**SRS-11.5, Wait-for-big-blind re-entry.** The system shall deal in a player who has a missed-blind marker in the hand in which that player's seat is designated the big blind per SRS-14.2.

*Traces to: UR-011*

**SRS-11.6, Post missed blinds to re-enter.** Upon an eligible player with a missed-blind marker electing, before hand start, to post missed blinds, the system shall deal that player into that hand, subject to SRS-11.9.

*Traces to: UR-011*

**SRS-11.7, Live big blind on posting.** For a player dealt in under SRS-11.6 with a missed big blind recorded, the system shall deduct the configured big blind amount from that player's stack as a live round contribution.

*Traces to: UR-011*

**SRS-11.8, Dead small blind on posting.** For a player dealt in under SRS-11.6 with a missed small blind recorded, the system shall deduct the configured small blind amount from that player's stack into the pot as a dead contribution.

*Traces to: UR-011*

**SRS-11.9, Position restriction on posting.** The system shall reject an election under SRS-11.6 when, treating that player as a clear player, that player's seat would receive the dealer button, the small blind, or the big blind in the next hand.

*Traces to: UR-011*

**SRS-11.10, Clear markers on re-entry.** Upon a player being dealt in under SRS-11.5 or SRS-11.6, the system shall clear all of that player's missed-blind markers.

*Traces to: UR-011*

**SRS-11.11, Clear markers in waiting state.** Upon a table entering a waiting state per SRS-20.2, the system shall clear every missed-blind marker at that table.

*Traces to: UR-011*

**SRS-11.12, Display blind-owed indicator.** The system shall display an indicator, visible to every seated player, on the seat of any player with a missed-blind marker.

*Traces to: UR-011*

**UR-012, JN – Busted Player Options**

*User story: As a player, I want to be given the choice to leave the table or buy back in with additional chips when I lose my entire chip stack, so that I'm not stuck unable to play and can decide whether to continue.*

**SRS-12.1, Detect zero-chip stack.** The system shall mark a player busted when that player's chip stack is zero at the end of a hand.

*Traces to: UR-012*

**SRS-12.2, Present buy-in or leave options.** Upon marking a player busted per SRS-12.1, the system shall present that player with the choice to leave the table or buy back in, within the latency in SRS-NFR-020.

*Traces to: UR-012*

**SRS-12.3, Leave option.** Upon a busted player selecting the leave option, the system shall remove that player from their seat.

*Traces to: UR-012*

**SRS-12.4, Buy-back transfer.** Upon a busted player completing a buy-back-in for an amount not rejected under SRS-12.6 or SRS-12.7, the system shall transfer that amount from the player's persistent account balance to their table stack.

*Traces to: UR-012*

**SRS-12.5, Clear busted status.** Upon completing a transfer under SRS-12.4, the system shall clear that player's busted status.

*Traces to: UR-012*

**SRS-12.6, Reject out-of-range buy-back.** Upon receiving a buy-back-in request for an amount outside the range in SRS-NFR-021, the system shall reject the request.

*Traces to: UR-012*

**SRS-12.7, Reject insufficient balance.** Upon receiving a buy-back-in request for an amount greater than the player's persistent account balance, the system shall reject the request.

*Traces to: UR-012*

**SRS-12.8, Buy-back rejection message.** Upon rejecting a request under SRS-12.6 or SRS-12.7, the system shall display an error message stating the reason on the player's client.

*Traces to: UR-012*

**SRS-12.9, Exclude busted players from deal.** The system shall not deal in a busted player until that player's busted status is cleared per SRS-12.5.

*Traces to: UR-012*

**SRS-12.10, Timeout on no response.** When a busted player has not selected the leave or buy-in option within the timeout in SRS-NFR-015, the system shall remove that player from their seat.

*Traces to: UR-012*

# **Button, blinds, betting actions, and dealing**

**UR-013, JN – Dealer Button Rotation**

*User story: As a player, I want the dealer button to move to a new seat after each hand, so that the order of action and who posts blinds rotates fairly around the table over time.*

**SRS-13.1, Initial button assignment.** At the first hand start of a table, the system shall randomly assign the dealer button to the seat of one clear player.

*Traces to: UR-013*

**SRS-13.2, Button rotation.** At each later hand start, the system shall move the dealer button to the first seat clockwise of the previous hand's button seat that holds a clear player.

*Traces to: UR-013*

**SRS-13.3, Hand setup order.** At hand start, the system shall determine, in this order: the dealer button seat per SRS-13.1 or SRS-13.2, the small blind seat per SRS-14.1, the big blind seat per SRS-14.2, and the dealt-in players per SRS-13.4.

*Traces to: UR-013*

**SRS-13.4, Dealt-in players.** The system shall deal into each hand every clear player, the player in the big blind seat, and every player whose election was accepted under SRS-11.6.

*Traces to: UR-013*

**SRS-13.5, Display button position.** The system shall display a marker on the seat holding the dealer button to every seated player's client.

*Traces to: UR-013*

**Figure 1: Hand-setup sequence**

flowchart LR

   A\[Hand start\] \--\> B\[Move button\<br/\>SRS-13.2\]

   B \--\> C\[Small blind\<br/\>SRS-14.1\]

   C \--\> D\[Big blind\<br/\>SRS-14.2\]

   D \--\> E\[Dealt-in players\<br/\>SRS-13.4\]

   E \--\> F{3 or more?\<br/\>SRS-20.1}

   F \--\>|Yes| G\[Post blinds, deal\<br/\>UR-014, UR-016\]

   F \--\>|No| H\[Waiting state\<br/\>SRS-20.2\]

*The hand-setup sequence runs once per hand. A failed setup (fewer than three dealt-in players) leaves the dealer button at its previous seat, records no missed-blind markers, and posts no blinds, per SRS-20.7.*

**UR-014, JN – Forced Blind Posting**

*User story: As a player, I want the small blind and big blind to be automatically posted by the correct seats at the start of each hand, so that every hand starts with a pot worth playing for without requiring manual action.*

**SRS-14.1, Small blind designation.** At hand start, the system shall designate as the small blind the first seat clockwise of the dealer button that holds a clear player.

*Traces to: UR-014*

**SRS-14.2, Big blind designation.** At hand start, the system shall designate as the big blind the first seat clockwise of the small blind seat that holds an eligible player.

*Traces to: UR-014*

**SRS-14.3, Automatic small blind posting.** After hand setup per SRS-13.3, provided the minimum player count in SRS-20.1 is satisfied, and before any cards are dealt, the system shall move the configured small blind amount from the small blind seat's chip stack to the pot.

*Traces to: UR-014*

**SRS-14.4, Automatic big blind posting.** After hand setup per SRS-13.3, provided the minimum player count in SRS-20.1 is satisfied, and before any cards are dealt, the system shall move the configured big blind amount from the big blind seat's chip stack to the pot.

*Traces to: UR-014*

**SRS-14.5, Partial blind on insufficient stack.** When a blind seat's chip stack is less than the blind amount owed, the system shall post that player's entire remaining stack as the blind.

*Traces to: UR-014*

**SRS-14.6, All-in on partial blind.** Upon posting a partial blind under SRS-14.5, the system shall mark that player all-in.

*Traces to: UR-014*

**SRS-14.7, Full big blind sets the current bet.** The system shall set the preflop current bet to the configured big blind amount, regardless of the amount the big blind seat actually posted.

*Traces to: UR-014*

**SRS-14.8, Display posted blinds.** Upon posting blinds, the system shall display the amount posted by the small blind seat and the big blind seat to every seated player's client.

*Traces to: UR-014*

**UR-015, JN – Betting Actions and Limits**

*User story: As a player, I want to choose from the standard no-limit betting actions with correct minimums, so that every hand is played by the real rules of Texas Hold'em.*

**SRS-15.1, Actions when no bet is faced.** The system shall offer the acting player the options to check, bet, or fold when that player does not face a bet.

*Traces to: UR-015*

**SRS-15.2, Actions when a bet is faced.** The system shall offer the acting player the options to fold, call, or raise when that player faces a bet.

*Traces to: UR-015*

**SRS-15.3, Minimum opening bet.** The system shall reject any opening bet smaller than the configured big blind amount, unless the bet is the player's entire stack.

*Traces to: UR-015*

**SRS-15.4, Minimum raise enforcement.** When the acting player faces a bet, the system shall reject any raise whose increment over the current bet is smaller than the minimum raise increment defined in SRS-15.5, unless the raise is the player's entire stack.

*Traces to: UR-015*

**SRS-15.5, Minimum raise increment value.** The system shall set the minimum raise increment to the size of the most recent full bet or raise in the current betting round, or to the configured big blind amount if no bet or raise has yet occurred in that round per SRS-18.8.

*Traces to: UR-015*

**SRS-15.6, No-limit maximum.** The system shall permit a player to bet or raise any amount up to that player's entire remaining stack.

*Traces to: UR-015*

**SRS-15.7, All-in call.** When a player facing a bet has a stack smaller than the amount needed to call, the system shall permit that player to call for their entire remaining stack.

*Traces to: UR-015*

**SRS-15.8, Incomplete raise does not reopen betting.** When an all-in raise is smaller than the minimum raise increment in SRS-15.5, the system shall offer only call or fold to each player who had already acted in that round since the last full bet or raise.

*Traces to: UR-015*

**SRS-15.9, Reject invalid amount.** Upon receiving a bet or raise that violates SRS-15.3 or SRS-15.4, or exceeds the acting player's stack, the system shall reject the action and leave the turn with that player.

*Traces to: UR-015*

**SRS-15.10, Invalid amount message.** Upon rejecting an action under SRS-15.9, the system shall display an error message stating the allowed range on the acting player's client.

*Traces to: UR-015*

**UR-016, JN – Hole Card Dealing**

*User story: As a player, I want to receive two private hole cards at the start of each hand, so that I have cards to play with.*

**SRS-16.1, Shuffle before deal.** Before dealing each hand, the system shall shuffle a standard 52-card deck such that every ordering of the deck is equally likely, as verified per SRS-NFR-023.

*Traces to: UR-016*

**SRS-16.2, Deal two hole cards per player.** After blinds are posted per SRS-14.3 and SRS-14.4, the system shall deal exactly two hole cards to each dealt-in player.

*Traces to: UR-016*

**SRS-16.3, Deal order.** The system shall deal hole cards one card at a time, in two passes, starting from the small blind seat and proceeding clockwise, skipping any seat not dealt in.

*Traces to: UR-016*

**SRS-16.4, No duplicate cards.** The system shall not deal the same card more than once within a single hand.

*Traces to: UR-016*

# **Streets, betting rounds, side pots, player count, and leaving**

**UR-017, JN – Community Card Dealing**

*User story: As a player, I want the flop, turn, and river to be dealt automatically to the board as the hand progresses, so that the community cards appear at the correct point in the hand.*

**SRS-17.1, Burn card before flop.** Immediately before dealing the flop, the system shall discard the top card of the deck without revealing it.

*Traces to: UR-017*

**SRS-17.2, Deal flop.** When the preflop betting round completes per SRS-18.3, two or more in-hand players remain, and SRS-17.8 does not apply, the system shall deal three community cards face up to the board.

*Traces to: UR-017*

**SRS-17.3, Burn card before turn.** Immediately before dealing the turn, the system shall discard the top card of the deck without revealing it.

*Traces to: UR-017*

**SRS-17.4, Deal turn.** When the flop betting round completes per SRS-18.3, two or more in-hand players remain, and SRS-17.8 does not apply, the system shall deal one community card face up to the board.

*Traces to: UR-017*

**SRS-17.5, Burn card before river.** Immediately before dealing the river, the system shall discard the top card of the deck without revealing it.

*Traces to: UR-017*

**SRS-17.6, Deal river.** When the turn betting round completes per SRS-18.3, two or more in-hand players remain, and SRS-17.8 does not apply, the system shall deal one community card face up to the board.

*Traces to: UR-017*

**SRS-17.7, Award without showdown.** When only one in-hand player remains, the system shall award every pot to that player without a showdown, after returning any uncalled bet per SRS-19.5.

*Traces to: UR-017*

**SRS-17.8, Run out remaining streets when betting is capped.** When the current betting round is complete per SRS-18.3, two or more in-hand players remain, and fewer than two of them are able-to-act players, the system shall deal all remaining community cards, with burn cards per SRS-17.1, SRS-17.3, and SRS-17.5, without further betting rounds.

*Traces to: UR-017*

**SRS-17.9, Showdown after run-out.** Upon dealing the final community card under SRS-17.8, the system shall proceed to showdown per UR-005.

*Traces to: UR-017*

**UR-018, JN – Betting Round Action Order and Progression**

*User story: As a player, I want each betting round to proceed in the correct order and advance to the next street at the right time, so that the hand plays out fairly and correctly.*

**SRS-18.1, Preflop first-to-act.** The system shall designate the first able-to-act player clockwise of the big blind seat as first to act in the preflop betting round.

*Traces to: UR-018*

**SRS-18.2, Postflop first-to-act.** The system shall designate the first able-to-act player clockwise of the dealer button as first to act in the flop, turn, and river betting rounds.

*Traces to: UR-018*

**SRS-18.3, Betting round completion.** The system shall end the current betting round when every able-to-act player has taken at least one action in that round and every able-to-act player's round contribution equals the current bet.

*Traces to: UR-018*

**SRS-18.4, Blinds are not actions.** The system shall not count posting a blind or a missed blind as an action for the purposes of SRS-18.3.

*Traces to: UR-018*

**SRS-18.5, Pass turn only to able-to-act players.** When passing the turn, the system shall skip every seat that does not hold an able-to-act player.

*Traces to: UR-018*

**SRS-18.6, Immediate hand end on single remaining player.** When only one in-hand player remains, the system shall end the hand immediately, without waiting for any other player to act.

*Traces to: UR-018*

**SRS-18.7, Reset current bet on new street.** At the start of each of the flop, turn, and river betting rounds, the system shall reset the current bet to zero.

*Traces to: UR-018*

**SRS-18.8, Reset minimum raise on each round.** At the start of each betting round, the system shall reset the minimum raise increment to the configured big blind amount.

*Traces to: UR-018*

**SRS-18.9, Advance on round completion.** When a betting round completes per SRS-18.3 with two or more in-hand players remaining, the system shall immediately proceed to the next community card deal per UR-017, the run-out per SRS-17.8, or showdown per UR-005 if the river round has completed.

*Traces to: UR-018*

**UR-019, JN – Side Pot Handling**

*User story: As a player, I want side pots to be created correctly whenever players are all-in for different amounts, so that I can only win chips from opponents I've matched.*

**SRS-19.1, Pot cap for all-in player.** When an in-hand player is all-in, the system shall limit the amount each other player contributes, across the whole hand, to each pot for which that all-in player is eligible, to that all-in player's total contribution for the hand.

*Traces to: UR-019*

**SRS-19.2, Side pot creation.** The system shall place each player's contributions beyond the cap in SRS-19.1 into a side pot for which the all-in player is not eligible.

*Traces to: UR-019*

**SRS-19.3, Multiple side pots.** When more than one player is all-in for different amounts within the same hand, the system shall create a separate side pot for each distinct all-in amount.

*Traces to: UR-019*

**SRS-19.4, Pot eligibility.** The system shall restrict eligibility to win each pot to in-hand players who contributed to that pot.

*Traces to: UR-019*

**SRS-19.5, Return uncalled bet.** At the end of each betting round, including a round ended under SRS-18.6, when one player's round contribution exceeds every other player's, the system shall return the difference between that contribution and the next-largest round contribution to that player's stack before forming pots.

*Traces to: UR-019*

**UR-020, JN – Minimum Player Count to Start and Continue**

*User story: As a player, I want a new hand to start only when there are at least three players able to play, and for the table to pause if that number drops below three, so that hands aren't dealt with too few players and the game automatically resumes once enough players are present.*

**SRS-20.1, Minimum player count to start a hand.** The system shall not begin dealing a new hand unless hand setup per SRS-13.3 yields at least three dealt-in players.

*Traces to: UR-020*

**SRS-20.2, Enter waiting state.** When hand setup per SRS-13.3 yields fewer than three dealt-in players, the system shall place the table in a waiting state.

*Traces to: UR-020*

**SRS-20.3, Resume dealing.** Once hand setup per SRS-13.3 would yield three or more dealt-in players at a waiting table, the system shall begin dealing a new hand within the latency in SRS-NFR-016.

*Traces to: UR-020*

**SRS-20.4, Complete in-progress hand regardless of count.** The system shall continue and complete a hand already in progress per UR-016 through UR-019 even if the number of eligible players drops below three during that hand.

*Traces to: UR-020*

**SRS-20.5, Waiting-for-players indicator.** While a table is in a waiting state, the system shall display a waiting-for-players indicator to every seated player's client.

*Traces to: UR-020*

**SRS-20.6, Joins permitted while waiting.** The system shall allow a player to join an open seat per SRS-1.1 at a table that is in a waiting state.

*Traces to: UR-020*

**SRS-20.7, Discard failed setup.** When hand setup per SRS-13.3 yields fewer than three dealt-in players, the system shall keep the dealer button at its previous seat, shall record no missed-blind markers for that setup, and shall not post any blinds for that setup.

*Traces to: UR-020*

**UR-021, JN – Voluntary Leave**

*User story: As a player, I want to leave the table whenever I choose and take my remaining chips with me, so that I'm never forced to stay seated.*

**SRS-21.1, Leave between hands.** Upon receiving a leave request from a seated player who is not in-hand, the system shall remove that player from their seat.

*Traces to: UR-021*

**SRS-21.2, Fold on leave during a hand.** Upon receiving a leave request from an able-to-act player, the system shall fold that player's hand when action next reaches that player.

*Traces to: UR-021*

**SRS-21.3, Remove after hand ends.** Upon the end of a hand in which an in-hand player submitted a leave request, the system shall remove that player from their seat.

*Traces to: UR-021*

# **Non-functional requirements**

*Every configured value referenced above is fixed here, with a number, a unit, and a condition. Numbering continues from the preceding sections of the full specification.*

**SRS-NFR-013, Disconnection removal duration.** The configured continuous-disconnection removal duration shall be 2 minutes.

*Traces to: UR-009*

**SRS-NFR-014, Consecutive-timeout removal threshold.** The configured consecutive-timeout removal threshold shall be 4 hands.

*Traces to: UR-009*

**SRS-NFR-015, Busted-player decision timeout.** The configured busted-player decision timeout shall be 60 seconds.

*Traces to: UR-012*

**SRS-NFR-016, Table resume latency.** The system shall begin dealing the next hand within 5 seconds of a waiting table's hand setup first yielding three or more dealt-in players.

*Traces to: UR-020*

**SRS-NFR-017, Public state sync latency.** The system shall deliver at least 95% of public table state updates to each seated player's client within 500 ms of the state change, for clients with a round-trip time to the server of 200 ms or less.

*Traces to: UR-001*

**SRS-NFR-018, Per-turn time limit.** The configured per-turn time limit shall be 20 seconds.

*Traces to: UR-004*

**SRS-NFR-019, Stack persistence latency.** The system shall complete the stack write in SRS-7.2 within 1 second of hand completion.

*Traces to: UR-007*

**SRS-NFR-020, Player-facing message latency.** The system shall display the messages in SRS-9.8, SRS-9.11, and SRS-12.2 within 1 second of the triggering condition.

*Traces to: UR-009, UR-012*

**SRS-NFR-021, Buy-in range.** The configured minimum buy-in shall be 40 times the big blind, and the configured maximum buy-in shall be 100 times the big blind.

*Traces to: UR-001, UR-012*

**SRS-NFR-022, Maximum seat count.** The configured maximum seat count for a table shall be between 3 and 9 seats.

*Traces to: UR-001*

**SRS-NFR-023, Shuffle uniformity.** Over 1,000,000 test shuffles, the frequency of each card in each deck position shall not differ from a uniform distribution at the 0.01 significance level under a chi-square test.

*Traces to: UR-016*

* # Login/Registration Page

* ### **UR-101, JO – Sign Up**

  * **SRS-101.1, Required registration information.** The system shall require a new player to provide a first name, last name, birthday, username, and password before creating an account.  
    Traces to: UR-101  
  * **SRS-101.2, Name validation.** The system shall allow first and last names to contain letters, spaces, apostrophes, and hyphens. The system shall reject names containing numbers or other special characters.  
    Traces to: UR-101  
  * **SRS-101.3, Username length.** The system shall require usernames to contain between 6 and 10 characters.  
    Traces to: UR-101  
  * **SRS-101.4, Username characters.** The system shall allow only letters and numbers in usernames and shall reject spaces and special characters.  
    Traces to: UR-101  
  * **SRS-101.5, Username uniqueness.** The system shall reject account creation when the requested username is already assigned to or temporarily reserved by another account.  
    Traces to: UR-101  
  * **SRS-101.6, Case-insensitive usernames.** The system shall treat usernames as case-insensitive when identifying accounts and checking username uniqueness.  
    Traces to: UR-101  
  * **SRS-101.7, Password composition.** The system shall require passwords to contain at least 8 characters, at least one letter, and at least one number. Passwords shall contain only letters and numbers.  
    Traces to: UR-101  
  * **SRS-101.8, Case-sensitive passwords.** The system shall treat uppercase and lowercase letters in passwords as different characters.  
    Traces to: UR-101  
  * **SRS-101.9, No email requirement.** The system shall not require an email address during registration.  
    Traces to: UR-101  
  * **SRS-101.10, No account recovery.** The system shall not provide an account-recovery or password-recovery feature.  
    Traces to: UR-101

* ### **UR-102, JO – Age Requirement**

  * **SRS-102.1, Minimum age.** The system shall permit account creation only when the birthday provided during registration indicates that the player is at least 21 years old.  
    Traces to: UR-102  
  * **SRS-102.2, Birthday persistence.** The system shall store the birthday provided during registration and shall not provide a function for the player to edit it after account creation.  
    Traces to: UR-102, UR-112

* ### **UR-103, JO – Log In**

  * **SRS-103.1, Login credentials.** The system shall allow a registered player to log in using their username and password.  
    Traces to: UR-103  
  * **SRS-103.2, Account restoration.** After successful login, the system shall retrieve the player's saved profile information, balance, statistics, owned cosmetics, and equipped cosmetics.  
    Traces to: UR-103  
  * **SRS-103.3, Session persistence.** The system shall keep the player logged in while the active website tab remains open unless the player manually logs out or the session is invalidated.  
    Traces to: UR-103  
  * **SRS-103.4, Single active session.** The system shall allow only one authenticated browser tab or window to use an account at a time.  
    Traces to: UR-103  
  * **SRS-103.5, Replacement login.** When the same account successfully logs in from another browser tab or window, the system shall invalidate the previously active authenticated session.  
    Traces to: UR-103  
  * **SRS-103.6, Duplicated-tab handling.** If an authenticated browser tab is duplicated and causes the same account session to exist in more than one tab, the system shall invalidate both tabs and redirect both to the login/registration page.  
    Traces to: UR-103  
  * **SRS-103.7, Reauthentication after duplication.** After duplicated authenticated tabs are invalidated, the player shall be required to successfully log in again before accessing the account.  
    Traces to: UR-103

* ### **UR-104, JO – Account Validation**

  * **SRS-104.1, Registration validation.** The system shall validate all registration fields before creating an account.  
    Traces to: UR-104  
  * **SRS-104.2, Credential verification.** The system shall verify the submitted username and password against the stored credentials before granting account access.  
    Traces to: UR-104  
  * **SRS-104.3, Invalid registration information.** The system shall reject registration information that does not satisfy the applicable registration requirements.  
    Traces to: UR-104  
  * **SRS-104.4, Password hashing.** The system shall store passwords using a secure password-hashing method and shall never store passwords in plaintext.  
    Traces to: UR-104  
  * **SRS-104.5, Password verification.** Login and password-confirmation operations shall verify submitted passwords against the stored password hash rather than against plaintext password data.  
    Traces to: UR-104

* ### **UR-105, JO – Log Out**

  * **SRS-105.1, Manual logout.** The system shall provide a logout control that ends the player's current authenticated session.  
    Traces to: UR-105  
  * **SRS-105.2, Tab closure.** The system shall end the player's authenticated session when the active website tab is closed.  
    Traces to: UR-105  
  * **SRS-105.3, Session restoration.** The system shall not automatically restore the previous authenticated session when the website is reopened after the active tab was closed.  
    Traces to: UR-105

* ### **UR-106, JO – Delete Account**

  * **SRS-106.1, Account-deletion confirmation.** The system shall display a confirmation prompt before beginning permanent account deletion.  
    Traces to: UR-106  
  * **SRS-106.2, Password verification for deletion.** The system shall require the player to enter and successfully verify their current password before account deletion can begin.  
    Traces to: UR-106  
  * **SRS-106.3, Permanent account deletion.** When final deletion occurs, the system shall permanently delete all information associated with the account, including profile information, balance, statistics, cosmetics, and authentication information.  
    Traces to: UR-106  
  * **SRS-106.4, No deleted-account recovery.** The system shall not provide a method for recovering a permanently deleted account.  
    Traces to: UR-106  
  * **SRS-106.5, Username release after deletion.** After an account is permanently deleted, the system shall make the deleted account's username available for registration or use by another account.  
    Traces to: UR-106  
  * **SRS-106.6, Pending-deletion state.** If the player confirms account deletion while unresolved account activity exists, the system shall place the account into a pending-deletion state.  
    Traces to: UR-106  
  * **SRS-106.7, Pending-deletion access restriction.** While an account is pending deletion, the system shall prevent the player from accessing or using the account.  
    Traces to: UR-106  
  * **SRS-106.8, Pending-deletion activity restriction.** A pending-deletion account shall not be permitted to begin new games, place new wagers, make purchases, edit profile information, or perform other player-initiated account actions.  
    Traces to: UR-106  
  * **SRS-106.9, Existing activity settlement.** The system shall continue processing unresolved activity that existed before the account entered the pending-deletion state until that activity reaches a final result.  
    Traces to: UR-106  
  * **SRS-106.10, Final deletion.** After all unresolved account activity reaches a final result, the system shall permanently delete the account and all associated account data.  
    Traces to: UR-106

  * # Home Page

* ### **UR-107, JO – View Available Games**

  * **SRS-107.1, Display available games.** The system shall display the games currently available from the home page.  
    Traces to: UR-107  
  * **SRS-107.2, Guest home-page access.** The system shall allow unauthenticated guests to view the home page and available game listings.  
    Traces to: UR-107

* ### **UR-108, JO – Select Game**

  * **SRS-108.1, Player game selection.** The system shall allow a logged-in player to select an available game from the home page.  
    Traces to: UR-108  
  * **SRS-108.2, Game navigation.** Selecting an available game while authenticated shall navigate the player to that game's interface.  
    Traces to: UR-108  
  * **SRS-108.3, Guest game restriction.** If an unauthenticated guest attempts to enter a game, the system shall redirect the guest to the login/registration page and shall not begin gameplay.  
    Traces to: UR-108

* ### **UR-109, JO – View Balance**

  * **SRS-109.1, Player balance display.** The system shall display the authenticated player's current virtual-currency balance.  
    Traces to: UR-109  
  * **SRS-109.2, Persistent balance.** The system shall preserve the player's balance across logout, tab closure, disconnection, and future login sessions.  
    Traces to: UR-109  
  * **SRS-109.3, Insufficient-balance protection.** The system shall prevent a transaction or wager that requires more virtual currency than the player currently possesses.  
    Traces to: UR-109  
  * **SRS-109.4, Guest balance display.** The system shall display a balance of 0 coins to unauthenticated guests.  
    Traces to: UR-109

* ### **UR-110, JO – Receive Virtual Currency**

  * **SRS-110.1, Initial currency.** The system shall assign 1,000 coins to the player's balance when the account is successfully created.  
    Traces to: UR-110  
  * **SRS-110.2, Daily-reward eligibility.** The system shall make an account eligible for daily currency only after the account has existed for at least 24 hours.  
    Traces to: UR-110  
  * **SRS-110.3, First daily award.** After the account becomes eligible, the system shall add the first 1,000-coin daily reward at the next 12:00 AM calendar-day boundary in the America/New\_York time zone.  
    Traces to: UR-110  
  * **SRS-110.4, Recurring daily award.** After the first daily award, the system shall add another 1,000 coins at each subsequent 12:00 AM America/New\_York calendar-day boundary.  
    Traces to: UR-110  
  * **SRS-110.5, Login-independent accrual.** The system shall ensure that eligible daily rewards are credited regardless of whether the player logs into the system.  
    Traces to: UR-110  
  * **SRS-110.6, Missed-day accrual.** If a player does not log in for multiple eligible calendar days, the player's balance shall include every daily 1,000-coin increase accumulated during that period.  
    Traces to: UR-110  
  * **SRS-110.7, Automatic daily rewards.** The system shall add daily rewards without requiring the player to manually claim them.  
    Traces to: UR-110  
  * **SRS-110.8, No daily-reward popup.** The system shall not require the player to acknowledge a popup or other notification when a daily reward is added.  
    Traces to: UR-110  
  * **SRS-110.9, Live balance update.** If a daily 1,000-coin reward is credited while the player has an active session, the system shall update the displayed balance without requiring a page refresh or reload.  
    Traces to: UR-110

  * # Profile Page

* ### **UR-111, JO – View Profile**

  * **SRS-111.1, Profile navigation.** The system shall provide a method for the logged-in player to navigate to their own profile page.  
    Traces to: UR-111  
  * **SRS-111.2, Profile content.** The player's profile page shall display their permitted account information, statistics, owned cosmetics, and equipped cosmetics.  
    Traces to: UR-111  
  * **SRS-111.3, Guest profile restriction.** If an unauthenticated guest attempts to access a profile, the system shall redirect the guest to the login/registration page.  
    Traces to: UR-111

* ### **UR-112, JO – Edit Profile**

  * **SRS-112.1, Editable information.** The system shall allow the player to edit their first name, last name, username, profile photo, and bio. Password changes shall be handled only through the Change Password functionality defined under UR-113.  
    Traces to: UR-112  
  * **SRS-112.2, Birthday restriction.** The system shall not allow the player to edit their birthday after account creation.  
    Traces to: UR-112  
  * **SRS-112.3, Edited-name validation.** Edited first and last names shall satisfy the same name requirements used during registration.  
    Traces to: UR-112  
  * **SRS-112.4, Username-change validation.** A changed username shall satisfy the same length, character, uniqueness, and case-insensitivity requirements used during registration.  
    Traces to: UR-112  
  * **SRS-112.5, Username-change authentication.** The system shall not require the player to re-enter their password solely to change their username.  
    Traces to: UR-112  
  * **SRS-112.6, Username-change frequency.** The system shall allow a player to change their username no more than once within any 24-hour period.  
    Traces to: UR-112  
  * **SRS-112.7, Previous-username reservation.** After a username change, the system shall keep the previous username unavailable for 24 hours.  
    Traces to: UR-112  
  * **SRS-112.8, Previous-username release.** After the 24-hour reservation period expires, the system shall make the previous username available for registration or use by another account.  
    Traces to: UR-112

* ### **UR-113, JO – Change Password**

  * **SRS-113.1, Current-password requirement.** The system shall require the player to enter their current password before allowing the password to be changed.  
    Traces to: UR-113  
  * **SRS-113.2, Current-password verification.** The system shall verify the submitted current password before saving a new password.  
    Traces to: UR-113  
  * **SRS-113.3, New-password validation.** The new password shall satisfy the same password length, composition, character, and case-sensitivity requirements used during registration.  
    Traces to: UR-113

* ### **UR-114, JO – Edit Bio**

  * **SRS-114.1, Bio maximum length.** The system shall limit a player's profile bio to a maximum of 50 words.  
    Traces to: UR-114  
  * **SRS-114.2, Optional bio.** The system shall allow the player to leave the bio empty.  
    Traces to: UR-114  
  * **SRS-114.3, Remove bio.** The system shall allow an existing bio to be cleared completely.  
    Traces to: UR-114  
  * **SRS-114.4, Bio word-count calculation.** The system shall determine the bio word count using whitespace-separated words after removing leading and trailing whitespace and treating consecutive whitespace characters as a single separator.  
    Traces to: UR-114

* ### **UR-115, JO – Edit Profile Photo**

  * **SRS-115.1, Profile-photo format validation.** The system shall accept only valid PNG image files as uploaded profile photos and shall verify the actual file format rather than relying only on the .png filename extension.  
    Traces to: UR-115  
  * **SRS-115.2, Profile-photo size.** The system shall reject profile-photo files larger than 5 MB.  
    Traces to: UR-115  
  * **SRS-115.3, Default profile icon.** The system shall display a blank default profile icon for accounts that do not have an uploaded profile photo.  
    Traces to: UR-115  
  * **SRS-115.4, Remove profile photo.** The system shall allow the player to remove an uploaded profile photo and return to the blank default icon.  
    Traces to: UR-115

* ### **UR-116, JO – View Time Played**

  * **SRS-116.1, Total time played.** The system shall store and display the player's total active casino-game playtime.  
    Traces to: UR-116  
  * **SRS-116.2, Per-game time played.** The system shall store and display active playtime separately for each supported casino game.  
    Traces to: UR-116  
  * **SRS-116.3, Gameplay-start requirement.** The system shall begin measuring playtime only when the player begins actively participating in a game. Opening or viewing the game page shall not begin the timer.  
    Traces to: UR-116  
  * **SRS-116.4, Active-game timing.** The system shall continue measuring time while an active game, hand, round, or equivalent gameplay sequence remains in progress and the player remains an active participant.  
    Traces to: UR-116  
  * **SRS-116.5, Between-round inactivity.** Time spent after a completed hand or round and before the player begins another gameplay sequence shall not be added to playtime.  
    Traces to: UR-116  
  * **SRS-116.6, Early exit.** If the player leaves before the active gameplay sequence is completed, the active time accumulated before leaving shall remain included in the player's statistics.  
    Traces to: UR-116  
  * **SRS-116.7, Timeout handling.** When a player reaches the timeout condition defined by the current game, the system shall stop adding time to the player's playtime.  
    Traces to: UR-116  
  * **SRS-116.8, Gameplay resumption.** After a timeout or interruption, the system shall begin adding time again only after the player resumes active gameplay.  
    Traces to: UR-116  
  * **SRS-116.9, Game-specific timeouts.** Each supported game shall define its own timeout duration and timeout behavior in that game's individual requirements.  
    Traces to: UR-116  
  * **SRS-116.10, Sports-betting exclusion.** The system shall not include time spent browsing, placing, monitoring, or resolving sports bets in the player's time-played statistics.  
    Traces to: UR-116  
  * **SRS-116.11, Multiplayer waiting time.** During an active multiplayer hand or round, time spent waiting for other active players to complete their turns shall count toward the player's time played.  
    Traces to: UR-116

* ### **UR-117, JO – View Overall Money Won and Lost**

  * **SRS-117.1, Total money won.** The system shall store and display the player's cumulative virtual-currency profit from completed gameplay and sports-betting outcomes.  
    Traces to: UR-117  
  * **SRS-117.2, Profit calculation.** When an outcome produces a positive net result, the system shall add only the amount of profit to total money won rather than the full payout.  
    Traces to: UR-117  
  * **SRS-117.3, Total money lost.** The system shall store and display the cumulative virtual currency lost from completed gameplay and sports-betting outcomes.  
    Traces to: UR-117  
  * **SRS-117.4, Loss calculation.** When an outcome produces a negative net result, the system shall add the absolute value of that negative result to total money lost.  
    Traces to: UR-117  
  * **SRS-117.5, Tie or push.** When an outcome produces no net gain or loss, the system shall add zero to both money won and money lost.  
    Traces to: UR-117  
  * **SRS-117.6, Initial-currency exclusion.** The initial 1,000 coins received at account creation shall not count as money won.  
    Traces to: UR-117  
  * **SRS-117.7, Daily-currency exclusion.** Daily 1,000-coin rewards shall not count as money won.  
    Traces to: UR-117  
  * **SRS-117.8, Cosmetic-purchase exclusion.** Currency spent purchasing cosmetics or blind boxes shall not count as money lost.  
    Traces to: UR-117  
  * **SRS-117.9, Duplicate-refund exclusion.** Currency received from a duplicate-cosmetic refund shall not count as money won.  
    Traces to: UR-117

* ### **UR-118, JO – View Money Won and Lost by Game**

  * **SRS-118.1, Per-game winnings.** The system shall track and display virtual-currency profit separately for each supported casino game and sports betting.  
    Traces to: UR-118  
  * **SRS-118.2, Per-game losses.** The system shall track and display virtual-currency losses separately for each supported casino game and sports betting.  
    Traces to: UR-118  
  * **SRS-118.3, Consistent calculations.** Per-game statistics shall use the same profit, loss, tie, and exclusion rules used for the player's overall statistics.  
    Traces to: UR-118

* ### **UR-119, JO – View Owned Cosmetics**

  * **SRS-119.1, Cosmetic inventory.** The system shall store and display all cosmetics currently owned by the player.  
    Traces to: UR-119  
  * **SRS-119.2, Cosmetic categories.** The system shall support card cosmetics, chip cosmetics, and profile-outline cosmetics.  
    Traces to: UR-119  
  * **SRS-119.3, Default owned cosmetics.** When an account is created, the system shall add one default card cosmetic, one default chip cosmetic, and one default profile-outline cosmetic to the player's owned cosmetic collection.  
    Traces to: UR-119

* ### **UR-120, JO – Manage Equipped Cosmetics**

  * **SRS-120.1, Required equipped cosmetics.** The system shall maintain exactly one equipped cosmetic in each supported cosmetic category.  
    Traces to: UR-120  
  * **SRS-120.2, Initial equipped cosmetics.** The system shall equip the default card, chip, and profile-outline cosmetics when the account is created.  
    Traces to: UR-120  
  * **SRS-120.3, Equip owned cosmetic.** The system shall allow the player to equip an owned cosmetic in its corresponding cosmetic category.  
    Traces to: UR-120  
  * **SRS-120.4, Replace equipped cosmetic.** Equipping a cosmetic shall replace the previously equipped cosmetic in the same category without removing the previous cosmetic from the player's collection.  
    Traces to: UR-120  
  * **SRS-120.5, No unequipped category.** The system shall not allow a cosmetic category to have no equipped cosmetic.  
    Traces to: UR-120

* ### **UR-121, JO – View Other Players' Profiles**

  * **SRS-121.1, Gameplay profile access.** The system shall allow a player to open another player's public profile by selecting that player's displayed username or profile photo during gameplay.  
    Traces to: UR-121  
  * **SRS-121.2, No player search.** The system shall not provide a username-search feature for locating player profiles.  
    Traces to: UR-121  
  * **SRS-121.3, Public username.** The public profile shall display the player's username.  
    Traces to: UR-121  
  * **SRS-121.4, Public bio.** The public profile shall display the player's bio when one has been provided.  
    Traces to: UR-121  
  * **SRS-121.5, Public profile photo.** The public profile shall display the player's uploaded profile photo or blank default icon.  
    Traces to: UR-121  
  * **SRS-121.6, Public overall time played.** The public profile shall display the player's overall time played.  
    Traces to: UR-121  
  * **SRS-121.7, Public overall money won and lost.** The public profile shall display the player's overall money won and overall money lost.  
    Traces to: UR-121  
  * **SRS-121.8, Public owned cosmetics.** The public profile shall display all cosmetics owned by the player.  
    Traces to: UR-121  
  * **SRS-121.9, Private per-game statistics.** The system shall not display another player's per-game time-played or per-game money-won/money-lost statistics on their public profile.  
    Traces to: UR-121  
  * **SRS-121.10, Private account information.** The system shall not display another player's first name, last name, birthday, password, or virtual-currency balance on their public profile.  
    Traces to: UR-121  
  * **SRS-121.11, Public equipped cosmetics.** The public profile shall identify the player's currently equipped card cosmetic, chip cosmetic, and profile-outline cosmetic in addition to displaying the player's owned cosmetic collection.  
    Traces to: UR-121

# Cosmetic Shop Page

* ### **UR-122, JO – Browse Blind Boxes**

  * **SRS-122.1, Display available blind boxes.** The system shall display all blind boxes currently available for purchase.  
    Traces to: UR-122  
  * **SRS-122.2, Blind-box information.** Each blind box shall display its description, price, and possible cosmetic rewards.  
    Traces to: UR-122

* ### **UR-123, JO – View Reward Probabilities**

  * **SRS-123.1, Equal reward probability.** The system shall assign equal selection probability to every cosmetic contained within the same blind box.  
    Traces to: UR-123  
  * **SRS-123.2, Probability formula.** If a blind box contains n possible rewards, the probability of selecting each reward shall be 1/n.  
    Traces to: UR-123  
  * **SRS-123.3, Complete probability distribution.** The probabilities of all possible rewards in a blind box shall total 100%.  
    Traces to: UR-123  
  * **SRS-123.4, No custom-weight boxes.** The system shall not use event boxes or other blind boxes with individually assigned reward weights.  
    Traces to: UR-123  
  * **SRS-123.5, Default-cosmetic exclusion.** The system shall not include the default card cosmetic, default chip cosmetic, or default profile-outline cosmetic in any blind-box reward pool.  
    Traces to: UR-123  
  * **SRS-123.6, Minimum reward count.** Every available blind box shall contain at least one possible cosmetic reward.  
    Traces to: UR-123  
  * **SRS-123.7, Valid probability calculation.** The system shall calculate equal reward probabilities only for blind boxes containing one or more possible rewards, ensuring that n≥1.  
    Traces to: UR-123

* ### **UR-124, JO – Purchase Blind Box**

  * **SRS-124.1, Sufficient balance.** The system shall permit a blind-box purchase only when the player's current balance is greater than or equal to the box's purchase price.  
    Traces to: UR-124  
  * **SRS-124.2, Purchase confirmation.** Before deducting any currency, the system shall display a confirmation prompt asking the player to confirm the selected blind-box purchase.  
    Traces to: UR-124  
  * **SRS-124.3, Cancel purchase.** If the player declines the confirmation prompt, the system shall not deduct currency or open the blind box.  
    Traces to: UR-124  
  * **SRS-124.4, Deduct purchase price.** After the player confirms a valid purchase, the system shall deduct the full purchase price from the player's balance.  
    Traces to: UR-124  
  * **SRS-124.5, Insufficient balance.** The system shall reject the purchase without deducting currency when the player's balance is lower than the purchase price.  
    Traces to: UR-124  
  * **SRS-124.6, Immediate opening.** After a successful purchase, the system shall immediately begin the blind-box reward-selection process and shall not store an unopened blind box in the player's inventory.  
    Traces to: UR-124, UR-125

* ### **UR-125, JO – Receive Randomized Cosmetic**

  * **SRS-125.1, Random reward selection.** The system shall randomly select one cosmetic from the purchased blind box using the equal 1/n reward probabilities.  
    Traces to: UR-125  
  * **SRS-125.2, New cosmetic storage.** If the selected cosmetic is not already owned, the system shall add it to the player's cosmetic collection.  
    Traces to: UR-125  
  * **SRS-125.3, Purchase completion after interruption.** Once the blind-box purchase price has been successfully deducted, the system shall complete and persist the reward outcome even if the player closes the tab, disconnects, times out, or otherwise leaves before viewing the result.  
    Traces to: UR-125  
  * **SRS-125.4, Interrupted new-cosmetic delivery.** If the player leaves before viewing a newly selected cosmetic, the system shall still add that cosmetic to the player's owned cosmetic collection.  
    Traces to: UR-125  
  * **SRS-125.5, Interrupted cosmetic availability.** A cosmetic added after an interrupted blind-box purchase shall be available for selection or equipping the next time the player accesses their profile.  
    Traces to: UR-125  
  * **SRS-125.6, Interrupted duplicate refund.** If an interrupted blind-box purchase produces a duplicate cosmetic, the system shall still apply the duplicate refund to the player's balance.  
    Traces to: UR-125, UR-126  
  * **SRS-125.7, No delayed blind-box presentation.** If the player leaves before viewing the blind-box result, the system shall not replay the blind-box animation or display a delayed result popup when the player later returns.  
    Traces to: UR-125

* ### **UR-126, JO – Handle Duplicate Cosmetics**

  * **SRS-126.1, Duplicate detection.** The system shall determine whether the cosmetic selected from the blind box is already owned by the player.  
    Traces to: UR-126  
  * **SRS-126.2, No duplicate storage.** If the selected cosmetic is already owned, the system shall not add another copy to the player's cosmetic collection.  
    Traces to: UR-126  
  * **SRS-126.3, Duplicate refund.** The system shall add a refund equal to 50% of the blind box's purchase price to the player's balance when the selected cosmetic is a duplicate.  
    Traces to: UR-126  
  * **SRS-126.4, Refund rounding.** If the calculated 50% refund is not a whole number of coins, the system shall round the refund upward to the nearest whole coin.  
    Traces to: UR-126  
  * **SRS-126.5, Automatic duplicate handling.** The duplicate-refund process shall occur automatically without requiring the player to choose whether to keep or sell the duplicate.  
    Traces to: UR-126  
  * **SRS-126.6, Refund statistics exclusion.** Duplicate refunds shall not increase the player's money-won statistics.  
    Traces to: UR-126, UR-117

* ### **UR-127, JO – View Received Cosmetic**

  * **SRS-127.1, Display reward result.** If the player remains present when the blind-box reward-selection process completes, the system shall display the cosmetic that was selected.  
    Traces to: UR-127  
  * **SRS-127.2, New-cosmetic message.** If the selected cosmetic is new and the player remains present, the system shall indicate that the cosmetic was added to the player's collection.  
    Traces to: UR-127  
  * **SRS-127.3, Duplicate-result message.** If the selected cosmetic was already owned and the player remains present, the system shall indicate that the reward was a duplicate and display the refund that was added to the player's balance.  
    Traces to: UR-127  
  * **SRS-127.4, Interrupted-result behavior.** If the player leaves before the reward result is displayed, the system shall not display a delayed result popup or replay the blind-box animation when the player later returns.  
    Traces to: UR-127

# **7\. Sports Betting on Live Sports**

**UR-201, SP \- Browse Sports Events**

**User story:** As a player, I want to browse available events by sport or league, so that I can quickly find games I am interested in betting on.

**SRS-201.1, Filterable event list.** The system shall display a list of available sports events and shall allow the player to filter the list by sport and by league.

Traces to: UR-201

**UR-202, SP \- View Event Information and Status**

**\+**

**User story:** As a player, I want to see important information about an event, including whether it is upcoming, in progress, or completed, so that I can understand the event before deciding whether to bet on it.

**SRS-202.1, Display event status.** The system shall display each event's current status as one of "Upcoming," "In Progress," or "Completed."

Traces to: UR-202

**SRS-202.2, Display event details.** The system shall display each event's scheduled start time and participating teams alongside its status.

Traces to: UR-202

**UR-203, SP \- View and Understand Available Bets**

**User story:** As a player, I want to see the betting options available for an event and understand what each option means, so that I can choose the outcome I want to wager on.

**SRS-203.1, List betting options with descriptions.** The system shall display each available betting option for a selected event along with a plain-language description of what that option means.

Traces to: UR-203

**SRS-203.2, Support available betting markets.** The system shall support available betting markets provided by the sports odds data source, including team win/loss bets, point spreads, totals such as over/under bets, and other supported market types.

Traces to: UR-203

**UR-204, SP \- View Odds and Potential Winnings**

**User story:** As a player, I want to see the odds and potential virtual-currency payout for a wager, so that I can understand the possible risk and reward before placing my bet.

**SRS-204.1, Display current odds.** The system shall display the current odds for each available betting option.

Traces to: UR-204

**SRS-204.2, Calculate potential payout before submission.** The system shall calculate and display the player's potential total payout, including the original wager amount and any winnings, for a wager amount entered by the player before the wager is submitted.

Traces to: UR-204

**UR-205, SP \- Place a Sports Wager**

**User story:** As a player, I want to choose an available sports outcome and wager an amount of my virtual currency on it, so that I can participate in sports betting without risking real money.

**SRS-205.1, Submit a wager.** The system shall allow the player to select an available betting outcome and enter a wager amount drawn from their virtual-currency balance.

Traces to: UR-205

**SRS-205.2, Deduct and record wager on confirmation.** The system shall deduct the wager amount from the player's balance and record the wager as active when the player confirms the bet.

Traces to: UR-205

**SRS-205.3, Record odds at placement.** The system shall record the odds associated with the selected betting option at the time the wager is confirmed.

Traces to: UR-205

**SRS-205.4, Allow wagers on different markets for the same event.** The system shall allow a player to place wagers on different betting markets for the same event, such as wagering on the winning team and separately wagering on an over/under total.

Traces to: UR-205

**SRS-205.5, Close betting when event begins.** The system shall stop accepting new wagers for an event once the event has started or the selected betting market has otherwise closed.

Traces to: UR-205

**UR-206, SP \- Prevent Invalid Wagers**

**User story:** As a player, I want the system to prevent wagers that are invalid, that I cannot afford, or that are no longer available, so that I do not accidentally place an invalid bet.

**SRS-206.1, Reject wager exceeding balance.** The system shall reject a wager submission and display an error message when the wager amount exceeds the player's current balance.

Traces to: UR-206

**SRS-206.2, Reject wager on closed betting option.** The system shall reject a wager submission and display an error message when the selected betting option is no longer available because the related event has started or the betting market has closed.

Traces to: UR-206

**SRS-206.3, Reject invalid wager amount.** The system shall reject a wager submission and display an error message when the entered wager amount is zero, negative, non-numeric, or otherwise invalid.

Traces to: UR-206

**UR-207, SP \- Track Active Bets**

**User story:** As a player, I want to see my active wagers and their important details, including my selection, wager amount, odds, and potential payout, so that I can keep track of the bets I have placed.

**SRS-207.1, List active wagers.** The system shall display a list of the player's active wagers, each showing the event, selection, wager amount, recorded odds, and potential total payout.

Traces to: UR-207

**UR-208, SP \- Follow Bet and Game Status**

**User story:** As a player, I want to see whether my wager is still pending or has been decided, along with whether the related game is upcoming, in progress, or completed and its score when available, so that I can follow the progress of my bet.

**SRS-208.1, Display wager decision status.** The system shall display each active wager's status as either "Pending" or "Decided."

Traces to: UR-208

**SRS-208.2, Display related game status and score.** The system shall display the related game's status as "Upcoming," "In Progress," or "Completed" alongside each active wager and shall display the current or final score whenever available.

Traces to: UR-208

**UR-209, SP \- View Finalized Bet Results**

**User story:** As a player, I want to see whether a completed wager was won, lost, or refunded and know when its result is final, so that I clearly understand the outcome of my bet.

**SRS-209.1, Mark and display final result.** The system shall mark a finalized wager as "Won," "Lost," or "Refunded" and display the result to the player once the related event or betting market is finalized.

Traces to: UR-209

**SRS-209.2, Handle applicable tie outcomes.** The system shall account for tie outcomes when the selected betting market allows a tie result and shall determine the wager result according to that market's rules.

Traces to: UR-209

**SRS-209.3, Handle canceled or postponed events.** The system shall void affected wagers and mark them as "Refunded" when the related event is canceled or postponed and the wager can no longer be completed as originally placed.

Traces to: UR-209

**SRS-209.4, Apply market-specific result rules.** The system shall determine wager results according to the rules of the selected betting market. Tie handling shall not be applied to over/under wagers unless the market rules specifically require a refund or push.

Traces to: UR-209

**UR-210, SP \- Receive Winnings and Refunds**

**User story:** As a player, I want winning bets to reward me with the correct amount of virtual currency and invalidated bets to return my original wager, so that my balance accurately reflects my betting results.

**SRS-210.1, Credit correct payout amount.** The system shall credit the player's balance with the total payout calculated from the wager amount and the odds recorded at the time of placement when a wager is determined to be a winner.

Traces to: UR-210

**SRS-210.2, Display credited amount.** The system shall display the exact virtual-currency amount credited to the player alongside a winning wager's result.

Traces to: UR-210

**SRS-210.3, Refund voided wagers.** The system shall return the full original wager amount to the player's virtual-currency balance when a wager is voided because of a canceled, postponed, tied, or otherwise invalidated event when applicable to that betting market.

Traces to: UR-210

**SRS-210.4, Display refunded amount.** The system shall display the exact virtual-currency amount returned to the player when a wager is refunded.

Traces to: UR-210

**UR-211, SP \- Review Betting History**

**User story:** As a player, I want to review my previous wagers, including their events, selections, wager amounts, odds, results, and payouts or refunds, so that I can look back at my past betting activity.

**SRS-211.1, Display betting history list.** The system shall display a historical list of the player's completed wagers, each showing the event, selection, wager amount, recorded odds, result, and payout, loss, or refund amount.

Traces to: UR-211

**UR-212, SP \- Join a Public Bet**

**User story:** As a player, I want to wager virtual currency on which team will win a public sports event, so that I can compete against other players making the opposite prediction.

**SRS-212.1, Place a public-bet wager.** The system shall allow a player to place a virtual-currency wager on one team to win a designated public sports event.

Traces to: UR-212

**SRS-212.2, Restrict player to one side.** The system shall prevent a player from wagering on both teams within the same public bet.

Traces to: UR-212

**SRS-212.3, Close public betting when event begins.** The system shall stop accepting wagers for a public bet once the related sports event begins.

Traces to: UR-212

**UR-213, SP \- View Public Bet Participation**

**User story:** As a player, I want to see how much virtual currency has been wagered on each team in a public bet, so that I can see how the community is betting.

**SRS-213.1, Display total wagered per team.** The system shall display the total virtual currency wagered on each team for a public bet.

Traces to: UR-213

**SRS-213.2, Display total public betting pool.** The system shall display the combined amount of virtual currency wagered by all participating players in the public bet.

Traces to: UR-213

**UR-214, SP \- Receive Public Bet Payout**

**User story:** As a player who selected the winning team in a public bet, I want to receive a proportional share of the total betting pool based on how much I wagered, so that larger contributions to the winning side receive a larger portion of the payout.

**SRS-214.1, Calculate proportional public-bet payout.** The system shall calculate each winning player's share of the total public betting pool based on the proportion of that player's wager compared with the total amount wagered by all players on the winning team.

Traces to: UR-214

**SRS-214.2, Credit public-bet payout.** The system shall credit each winning player's calculated share of the public betting pool to their virtual-currency balance after the event is finalized.

Traces to: UR-214

**SRS-214.3, Refund invalidated public bets.** The system shall return each player's original wager when the related public-bet event is canceled, postponed, tied when a winner cannot be determined, or otherwise invalidated.

Traces to: UR-214

**UR-215, SP \- Understand Betting Rules**

**User story:** As a player, I want the rules and conditions of an available bet to be clear, so that I understand what must happen for my wager to win.

**SRS-215.1, Display bet win conditions.** The system shall display the rules and conditions that determine a winning outcome for a bet when the player views that bet's details.

Traces to: UR-215

**SRS-215.2, Display market-specific rules.** The system shall display rules relevant to the selected betting market, including how wins, losses, ties, refunds, and other applicable outcomes are handled.

Traces to: UR-215

# **8\. Roulette**

**UR-301, CL \- Place Roulette Bets**

***User story:** As a roulette player, I want to place bets on options like red/black, odd/even, or specific numbers, so that I can choose the type of risk and payout I prefer.*

**SRS-301.1, Place pre-spin bets.** The system shall allow a player to place one or more bets on roulette betting options, including color, odd/even, and specific number, before a spin begins.

*Traces to: UR-301*

**SRS-301.2, Reject bets after spin start.** The system shall reject any bet placement submitted after a spin has begun.

*Traces to: UR-301*

**UR-302, CL \- Spin the Roulette Wheel**

***User story:** As a roulette player, I want to spin the roulette wheel, so that I can see the outcome of my bets.*

**SRS-302.1, Generate spin result.** The system shall generate a random winning number and color when the player selects "Spin."

*Traces to: UR-302*

**UR-303, CL \- View Spin Result**

***User story:** As a roulette player, I want the game to clearly display the winning number and color, so that I immediately know whether I won.*

**SRS-303.1, Display winning number and color.** The system shall display the winning number and its corresponding color immediately after a spin completes.

*Traces to: UR-303*

**UR-304, CL \- Automatic Bet Settlement**

***User story:** As a roulette player, I want the game to automatically calculate my winnings or losses, so that my currency balance updates without extra steps.*

**SRS-304.1, Auto-settle placed bets.** The system shall calculate winnings or losses for every placed bet based on the spin result and shall update the player's balance automatically, without requiring further player action.

*Traces to: UR-304*

**UR-305, CL \- Clear All Bets**

***User story:** As a roulette player, I want a quick way to clear all my current bets, so that I can easily start a new round without manually removing each bet.*

**SRS-305.1, Clear all placed bets.** The system shall remove every currently placed, unresolved bet from the table when the player selects "Clear Bets."

*Traces to: UR-305*

# 

# **9\. Slot Machine**

**UR-306, CL \- Select Bet Amount**

***User story:** As a slot machine player, I want to choose my bet amount before spinning, so that I can control how much of my currency I risk each round.*

**SRS-306.1, Choose bet amount before spin.** The system shall allow the player to select a bet amount from the game's available bet-amount options before a spin begins.

*Traces to: UR-306*

**UR-307, CL \- Spin the Reels**

***User story:** As a slot machine player, I want to spin the reels, so that I can play the game and see whether I win.*

**SRS-307.1, Generate reel result.** The system shall generate a random symbol combination across the reels when the player selects "Spin."

*Traces to: UR-307*

**UR-308, CL \- Highlight Winning Lines**

***User story:** As a slot machine player, I want the game to highlight any winning lines after a spin, so that I can easily understand why I won or lost.*

**SRS-308.1, Highlight winning paylines.** The system shall visually highlight every payline that produced a win on the reel display after a spin that results in a win.

*Traces to: UR-308*

**UR-309, CL \- Automatic Payouts**

***User story:** As a slot machine player, I want my winnings to be added to my currency balance automatically, so that I don't have to manually claim rewards.*

**SRS-309.1, Auto-credit winnings.** The system shall add any winnings to the player's balance automatically immediately after a winning spin, without requiring the player to manually claim the reward.

*Traces to: UR-309*

# **10\. Blackjack**

**UR-901, HC \- Place Blackjack Bet**

***User story:** As a blackjack player, I want to choose how much virtual currency to bet before a hand begins, so that I can control how much I risk.*

**SRS-901.1, Set bet before hand begins.** The system shall allow the player to enter a bet amount, drawn from their available balance, before a blackjack hand begins.

*Traces to: UR-901*

**SRS-901.2, Reject bet exceeding balance.** The system shall reject a bet amount that exceeds the player's current balance and shall display an error message.

*Traces to: UR-901*

**UR-902, HC \- Deal Cards**

***User story:** As a blackjack player, I want the game to deal cards to me and the dealer, so that I can begin a blackjack hand.*

**SRS-902.1, Initial deal.** The system shall deal two cards to the player and two cards to the dealer, with one dealer card face down, at the start of each blackjack hand.

*Traces to: UR-902*

**UR-903, HC \- Hit**

***User story:** As a blackjack player, I want to request another card, so that I can try to get closer to 21\.*

**SRS-903.1, Deal card on Hit.** The system shall deal one additional card to the player's hand when the player selects "Hit" during their turn.

*Traces to: UR-903*

**UR-904, HC \- Stand**

***User story:** As a blackjack player, I want to stand with my current hand, so that I can end my turn without receiving another card.*

**SRS-904.1, End turn on Stand.** The system shall end the player's turn without dealing any additional card when the player selects "Stand."

*Traces to: UR-904*

**UR-905, HC \- Calculate Hand Value**

***User story:** As a blackjack player, I want the game to automatically calculate the value of my hand, including correctly handling Aces, so that I always know my current total.*

**SRS-905.1, Compute hand total with soft/hard Aces.** The system shall calculate a hand's total by counting each Ace as 11 unless doing so would cause the total to exceed 21, in which case that Ace shall be counted as 1\.

*Traces to: UR-905*

**UR-906, HC \- Dealer Turn**

***User story:** As a blackjack player, I want the dealer to automatically play according to the game's rules after my turn, so that each hand can be completed fairly.*

**SRS-906.1, Automated dealer play.** The system shall deal additional cards to the dealer's hand, drawing on any total of 16 or less and stopping on any total of 17 or more, after the player's turn ends.

*Traces to: UR-906*

**UR-907, HC \- Determine Winner**

***User story:** As a blackjack player, I want the game to compare my hand with the dealer's hand, so that I can clearly see whether I won, lost, busted, or tied.*

**SRS-907.1, Compare final totals and declare result.** The system shall compare the player's final hand total with the dealer's final hand total and shall declare the hand's result as Win, Lose, Bust, or Push according to standard blackjack rules.

*Traces to: UR-907*

**UR-908, HC \- Automatic Payout**

***User story:** As a blackjack player, I want winnings and losses to automatically update my virtual-currency balance, so that my balance accurately reflects the result of each hand.*

**SRS-908.1, Auto-update balance on hand result.** The system shall credit or debit the player's balance according to the declared hand result immediately after that result is determined.

*Traces to: UR-908*

**UR-909, HC \- View Game History**

***User story:** As a blackjack player, I want to view my previous blackjack results, bets, and winnings or losses, so that I can track my playing history.*

**SRS-909.1, Display blackjack hand history.** The system shall display a history of the player's previous blackjack hands, each showing the bet amount, result, and winnings or losses.

*Traces to: UR-909*

# **11\. AI Suggestions**

**UR-1001, HC \- AI Cost** 

**User story:** As a player, I want to spend a percentage of my active bet to receive an AI suggestion, so that the cost of advice scales dynamically with the risk of my hand. 

     **SRS-1001.1,** **Deduct percentage based suggestion fee**. The system shall calculate the AI suggestion fee as 10% of the player's active hand bet and deduct this amount from the player's available virtual-currency balance upon generating the suggestion. 

**SRS-1001.2, Insufficient balance.** The system shall reject an AI suggestion request and display an error message when the player's available balance is less than the required suggestion fee.

*Traces to: UR-1001* 

**UR-1002, HC \- Request AI Suggestion**

***User story:** As a player, I want to request an AI suggestion during a blackjack game, so that I can receive help deciding my next move only when I ask for it.*

**SRS-1002.1, On-demand suggestion request.** The system shall generate an AI move recommendation for the player's current blackjack hand only when the player selects a "Get Suggestion" control during their turn.

*Traces to: UR-1002*

**UR-1003, HC \- Explain Suggestion**

***User story:** As a player, I want to see a short explanation of why the AI recommended an action, so that I can understand the suggestion.*

**SRS-1003.1, Display suggestion rationale.** The system shall display a short text explanation of the reasoning behind the recommended action alongside every AI suggestion.

*Traces to: UR-1003*

**UR-1004, HC \- Player Decision**

***User story:** As a player, I want to choose whether to follow or ignore the AI suggestion, so that I remain in control of my gameplay.*

**SRS-1004.1, Suggestion is non-binding.** The system shall allow the player to select any legal blackjack action, regardless of the action recommended by the AI suggestion.

*Traces to: UR-1004*

**UR-1005, HC \- Sports Betting Suggestions**

***User story:** As a player, I want to receive AI-generated suggestions based on available sports information, so that I can use additional information when choosing my virtual sports bets.*

**SRS-1005.1, On-demand sports betting suggestion.** The system shall generate an AI-based suggestion for a sports wager, using available event data, only when the player requests a suggestion for that event.

*Traces to: UR-1005*

 

# **12\. Non-Functional Requirements**

The following requirements capture system-wide or cross-cutting quality constraints (performance, security, reliability, accessibility) that do not belong bundled into a single functional requirement.

**SRS-NFR-1, JN, Real-Time Game State Latency.**

The system shall propagate an updated game state (pot, board, or player action) to every connected client within 1 second of the state change occurring on the server, measured from server-side state change to client receipt.

*Applies to: All real-time multiplayer game tables (poker, blackjack, roulette, slots).*

*Traces to: URD-001, URD-002, URD-003*

**SRS-NFR-2, JO, Password Storage Security.**

The system shall store every player password using a salted cryptographic hash (e.g., bcrypt with a minimum cost factor of 10\) and shall never store a password in plaintext or reversibly-encrypted form.

*Applies to: Account registration and authentication, system-wide.*

*Traces to: URD-101, URD-103*

**SRS-NFR-3, JO, Idle Session Timeout.**

The system shall automatically terminate an authenticated session and require re-login after 30 consecutive minutes with no player interaction.

*Applies to: All authenticated pages.*

*Traces to: URD-102, URD-104*

**SRS-NFR-4, SP, Atomic Balance Updates.**

The system shall commit every virtual-currency balance change (debit or credit) as a single atomic transaction, such that no game or purchase outcome can leave the recorded balance inconsistent with the corresponding transaction log entry.

*Applies to: All currency-affecting transactions across poker, roulette, slots, blackjack, sports betting, and the cosmetic shop.*

*Traces to: URD-007, URD-114, URD-205, URD-209, URD-304, URD-309, URD-908*

**SRS-NFR-5, CN, Random Outcome Fairness.**

The system shall generate every randomized game outcome (blind box rewards, roulette spins, slot reel results, card shuffles and deals) using a cryptographically secure random number generator, and the observed frequency of each outcome shall be within 0.1% of its published probability across a sample of 100,000 simulated trials.

*Applies to: Blind box rewards, roulette, slots, poker and blackjack card dealing.*

*Traces to: URD-113, URD-115, URD-302, URD-307, URD-902*

**SRS-NFR-6, JN, Reconnection Grace Period.**

The system shall preserve a disconnected player's poker seat and chip stack for 60 seconds following disconnection, and shall allow the player to reconnect to the same seat and hand within that window.

*Applies to: Poker Room.*

*Traces to: URD-002*

**SRS-NFR-7, JO, Accessibility Conformance.**

Every page shall conform to WCAG 2.1 Level AA success criteria, as verified by an automated accessibility audit tool with zero critical or serious violations.

*Applies to: Entire website.*

*Traces to: System-wide*

**SRS-NFR-8, JO, Home Page Load Time.**

The home page shall complete rendering within 3 seconds of navigation, measured via browser load-time metrics on a 25 Mbps broadband connection.

*Applies to: Home page.*

*Traces to: URD-105*

**SRS-NFR-9, JO, Public Profile Data Minimization.**

The system shall exclude private account information, including email address, password hash, and payment or billing details, from any profile view accessible to a player other than the account owner.

*Applies to: Public profile pages.*

*Traces to: URD-111 (unnumbered public-profile item)*

**SRS-NFR-10, Team, No Real-Currency Transactions.**

The system shall not accept, process, store, or disburse any real-world currency or payment instrument at any point on the platform; all balances, wagers, and payouts shall be denominated exclusively in virtual currency.

*Applies to: Entire website.*

*Traces to: URD Scope, Section 1.2*