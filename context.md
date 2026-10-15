# FairTicket: Project Context

Background for anyone (human or AI) picking up this project. Source: the team's pitch deck in Canva, "U-HACK_Web3_FairTicket_Caffeine Commit" (11 slides), plus the team's own notes on user flow, TO DO and future work.

## Snapshot

- **Product:** FairTicket, scam-proof event booking for small venues.
- **Team:** Caffeine Commit.
- **Event:** U-Hackathon 2026, Web3 Track. Contract, web app and QR scanner built in two days with open-source libraries.
- **Stage:** Prototype on an EVM testnet. Demo link not yet added.
- **One-liner:** The contract is the middleman. Guests pay into escrow, get an NFT ticket, and are refunded automatically if the event is cancelled.

## Target users

- **Shops / hosts:** bars, pop-ups, workshops that currently sell tickets via LINE / IG / FB chat and bank transfer, with no tech team and no staff to check slips.
- **Guests:** people who pay first and currently have no protection if the event flops.
- **Market note (team TO DO):** focus on ticket prices above 1,000 THB where demand is high.

## Problem the deck argues

1. Fake or future-dated bank slips (slip-editing apps exist).
2. Overbooking from handling bookings in chat.
3. Guests lose deposits if events flop.
4. No staff to verify every slip at the door.

Existing options (chat + transfer, manual slip check in bank app, Eventpop / Ticketmelon, NFT ticketing like Fansland / WeloveNFT) do not protect both shop and guest. NFT ticketing exists but targets organizers and large events.

## Core design

### Escrow + NFT mint
- Shop creates event on-chain with price, seats and date.
- Guest pays into escrow and the NFT ticket (ERC-721) is minted in **one transaction**.
- Contract releases funds to the shop after the event, or refunds guests if cancelled.
- **Atomic mint** stops sales at seat capacity, so no double seats.

### Dynamic QR entry
- Fan's app signs `ticketId + timestamp` with the owner's wallet every **60 seconds**.
- Gate scanner verifies: signer equals on-chain owner, signature is under 60 s old, nonce not reused, ticket not used.
- On check-in the ticket is marked used and **locked** (no transfers after entry).

### Scam → rule mapping
| Scam | Rule |
|---|---|
| Fake slip | Payment confirmed by contract |
| Event flops | Escrow + auto refund |
| Screenshot reuse | 60 s expiry + nonce + used flag |
| Overbooking | Atomic mint capped at seats |

### Why blockchain (deck's argument)
Blockchain is the trust layer: it holds the money, owns the ticket and enforces refunds by code. Anyone can verify the real owner, there are zero slips to check, money and ticket move in one tx, and refunds are automatic.

## Stack and constraints

- ERC-721 + OpenZeppelin, EVM chain, testnet or L2 for low fees. No custom chain or token.
- Wallet creation via **thirdweb** at sign-up (from user flow); deck says guests log in with Google and gas is sponsored ("Web2.5 UX").
- **PDPA:** only wallet addresses on-chain; names and IDs encrypted off-chain.
- **Known limit:** code cannot detect a fake event, so shops are verified at sign-up.

## Intended user flow (team notes)

1. User visits our web3 ticket-seller site.
2. User signs up; thirdweb creates a wallet for them.
3. User picks a ticket and pays via PromptPay.
4. Payment gateway processes payment and triggers mint *(marked future work)*.
5. System mints the ticket into the user's wallet.
6. Users can buy / sell the NFT ticket (possibly locked within 1 hour before the event starts).
7. User shows the ticket QR at the gate to enter.

## Open points to be aware of

These are differences between the deck and the team's notes, not decisions:

- **Payment rail:** deck says the demo pays in **stablecoin** and PromptPay is "next" (Phase 2). The user flow puts **PromptPay** in the main path, with the gateway → mint step marked future work. Whoever builds the demo should confirm which one ships.
- **Resale:** deck Phase 1 has "transfers off"; resale with price cap, 2-transfer limit and lock window is Phase 3. The team TO DO wants the demo to clearly show NFT buy/sell/exchange on the platform. Resale timing ("within 1 hour before event") is still undecided.
- **Escrow vs fiat:** if payment comes via PromptPay (fiat), the on-chain escrow / auto-refund needs a defined bridge (e.g. gateway confirms payment → backend mints and records escrow). Not specified in the deck.

## TO DO (team)

- Easy to use; ideally users never deal with the wallet, but those familiar with wallets can opt in.
- Demo that clearly shows the ticket is an NFT and can be traded on the platform.
- Pipeline + payment gateway that verifies the user's payment.
- Find a suitable market: price band above 1,000 THB with high demand.

## Future work (team)

- Can users bring an existing wallet?
- Harden the payment pipeline: who gets the ticket when purchases arrive at the same time.
- Can users pay with crypto? If crypto and PromptPay payments arrive together, who wins?

## Roadmap (deck)

1. **Now, Prototype:** escrow + auto refund, owner-signed dynamic QR, atomic seat mint with transfers off, shop setup in minutes.
2. **Next, Small venues:** bars, pop-ups, workshops; LINE OA booking link; PromptPay on-ramp; U-Pay for tourist guests.
3. **Then, Mid-size:** festivals and fan meetings; safe resale (price cap, 2-transfer limit, lock window); organizer dashboard.
4. **Later, Big events:** Fair Draw lottery vs bots; offline gate for stadiums; pitch with proven traction.

## Source

- Canva deck: https://www.canva.com/design/DAHYDOP6qkg/d0ahB8YBoioS_P_KdMuvpQ/edit
