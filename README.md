# JONGLOEI (จองเลย)

**ตั๋วที่ตรวจสอบได้ ซื้อง่ายด้วย PromptPay ขายต่อได้อย่างแฟร์**
U-Hackathon 2026 · Web3 Track · by team **Caffeine Commit** · *(เดิมชื่อ FairTicket)*

JONGLOEI is a ticketing platform for small and mid-size organizers. Shops create an event in minutes. Guests sign in with Google, pay with PromptPay and get an NFT ticket in their own wallet. If an event is cancelled, everyone is refunded automatically, exactly what they paid. Next: moving escrow and payouts into the smart contract, so you don't have to trust us.

> **MVP status:** the ticket is a real NFT (ERC-721) on Avalanche Fuji in the user's thirdweb wallet. The money is **not** held by a contract yet: baht is recorded in the platform's ledger, and the time and price rules are enforced by the backend. On-chain escrow, refund and settlement are future work. The full project context is in [`context.md`](context.md); if this README and `context.md` disagree, `context.md` wins.

---

## The problem

Bars, pop-ups and workshops sell tickets through chat (LINE / IG / FB) and bank transfer. Shops check slips by eye, and guests pay first and hope the event happens.

- **Fake slips:** apps are sold that can edit any bank slip, including future-dated ones.
- **No system:** bookings are handled by hand in chat, which leads to overbooking.
- **No staff:** nobody has time to verify every slip at the door.
- **No protection for guests:** deposits are lost if the event flops.

## Current solutions and the gap

| Option | How it works | Weakness |
|---|---|---|
| Chat + transfer | LINE / IG DM + bank slip | Free, but slips can be faked |
| Manual slip check | Scan in bank app | Works, but needs staff on every order |
| Ticket platforms | Eventpop, Ticketmelon | Built for organizers; guests still have to trust the host |
| NFT ticketing | Fansland, WeloveNFT | Targets organizers and large events |

None of them both verify payment without slips and guarantee a refund if the event is cancelled.

## Key features (MVP)

- PromptPay payment verified with the payment gateway, never by a slip
- NFT ticket minted into the user's wallet after payment is confirmed
- Wallet-signed dynamic QR for entry, Valid / Invalid with a reason
- Resale on the platform in baht, with a price cap and a holding period
- Automatic refund if the event is cancelled; shop and sellers paid after the event (group B, from the ledger)

## How it works (MVP)

1. **Shop creates an event:** price, seats, date.
2. **Guest picks a seat:** the system creates an order and **holds the seat for 10 minutes**, then shows a PromptPay QR tied to that order.
3. **Guest pays with PromptPay:** the gateway sends a webhook and the backend runs **5 checks** before minting: webhook signature, re-query the status from the gateway API, amount and currency, reference and expiry, and that the order has never been minted.
4. **Two-step status:** "ชำระเงินแล้ว กำลังออกตั๋ว" (seat guaranteed) → the backend relayer mints the ERC-721 into the guest's wallet and pays the gas → "ได้รับตั๋วแล้ว" and the QR appears.
5. **Gate checks the QR** against `ownerOf` and the registry, then calls `markUsed`.
6. **After the event:** the shop and each reseller are paid from the ledger. If the event is cancelled, each payer is refunded exactly what they paid. No-shows are not refunded.

### Minimal contract (MVP)

ERC-721 (OpenZeppelin) + AccessControl on Avalanche Fuji: `mint(to, eventId)` for the minter (relayer), `operatorTransfer(tokenId, to)` for the operator (relayer), and `markUsed(tokenId)`. Owners cannot transfer tickets themselves; every transfer goes through the platform. No escrow, `settle` or `refund` in the contract yet.

### Dynamic QR entry (screenshots are useless)

| Step | What happens |
|---|---|
| 1 · Sign | The owner's wallet signs EIP-712 `{tokenId, ts}` every 60 seconds |
| 2 · Owner check | Signer must match the current `ownerOf(tokenId)` |
| 3 · Freshness | Rejected if older than 60 s or more than 15 s in the future |
| 4 · Check in | Ticket marked used; the scan page shows Valid or Invalid with the reason |

### Resale rules

| Rule | Value |
|---|---|
| Number of resales | Unlimited |
| Price cap | 1.25 × the original face price (default, tunable) |
| Holding period | Listable only 6 hours after the ticket was received (`resaleDelay`) |
| Transfer cutoff | 1 hour before the event starts |
| Commission | 6% of the resale price (default, tunable) |

Resale is paid with PromptPay like a first sale. After the 5 checks pass, the relayer calls `operatorTransfer`; the old owner's QR becomes Invalid and the new owner's becomes Valid.

### Scams blocked

| Scam | Rule that blocks it |
|---|---|
| Fake slip | Payment is confirmed with the gateway (5 checks), never by a picture |
| Event flops | Automatic refund to every payer from the ledger |
| Screenshot reuse | QR expires in 60 s and is signed by the current owner; used tickets are rejected |
| Overbooking | Seats are taken with one conditional update (`capacity − sold − held`) |
| Scalping | Price cap + 6-hour holding period on resale |

## User flow

1. User เข้าเว็บ JONGLOEI → sign up ด้วย Google → thirdweb สร้าง wallet ให้อัตโนมัติ (user ไม่เห็นคำว่า wallet / NFT / gas) + กรอกเลขพร้อมเพย์สำหรับรับเงินคืน/รับเงิน (MVP เป็นฟอร์มที่ไม่ตรวจจริง)
2. User เลือกงาน/ที่นั่ง → ระบบสร้าง order และ HOLD ที่นั่ง 10 นาที → ออก PromptPay QR ที่ผูก reference กับ order
3. User จ่ายผ่าน PromptPay → Payment Gateway ส่ง webhook → backend ตรวจ 5 ข้อ
4. verify ผ่าน → สถานะ "ชำระเงินแล้ว กำลังออกตั๋ว" (ที่นั่งการันตีแล้ว)
5. System mint ตั๋ว (ERC-721) เข้า wallet ของ user → สถานะ "ได้รับตั๋วแล้ว" แล้วจึงแสดง QR
6. User ซื้อ-ขายตั๋วต่อบนแพลตฟอร์มด้วยเงินบาท: ลงขายได้หลังได้ตั๋วครบ 6 ชม. และก่อนงานเริ่ม 1 ชม. (ขายต่อได้ไม่จำกัดครั้ง)
7. หน้างาน: User แสดง QR → ระบบ verify → Valid / Invalid พร้อมเหตุผล → mark `used`
8. หลังงาน: จ่ายร้านและผู้ขายทุกเที่ยวตอนงานจบ / ถ้ายกเลิก → คืนเงินอัตโนมัติ / no-show ไม่คืน

## Tech Stack

**Frontend & User Interface**
- **[Next.js](https://nextjs.org/)** - React framework สำหรับสร้างหน้าเว็บที่รวดเร็วและรองรับ SSR
- **[TypeScript](https://www.typescriptlang.org/)** - สำหรับควบคุม Type ให้โค้ดปลอดภัยและลดข้อผิดพลาด
- **[Tailwind CSS](https://tailwindcss.com/)** - สำหรับจัดการ UI และ Styling อย่างรวดเร็วใน 24 ชั่วโมง
- **QR Code Libraries** - `qrcode.react` และ `html5-qrcode` สำหรับสร้างและสแกน Dynamic QR Code หน้างาน

**Web3 & Blockchain Infrastructure**
- **[thirdweb](https://thirdweb.com/)** - Core Web3 SDK สำหรับระบบ In-App Wallets (ล็อกอินผ่าน Google/Social โดยไม่ต้องใช้ MetaMask) และจัดการ Smart Contract
- **[Avalanche Fuji Testnet](https://docs.avax.network/build/dapp/smart-contracts/fuji-testnet)** - เครือข่ายบล็อกเชน (Sponsor Network) สำหรับ Deploy ตั๋ว NFT ที่มีความเร็วสูงและค่าแก๊สต่ำ
- **[Solidity](https://soliditylang.org/)** - ภาษาสำหรับเขียน Smart Contract (มาตรฐาน ERC-721) เพื่อควบคุมสิทธิ์ตั๋วคอนเสิร์ตและเพดานราคาขายต่อ

**Deployment & Version Control**
- **GitHub** - Source code management
- **Cloudfare workers** - (แนะนำ) สำหรับ Deploy หน้าเว็บ Frontend ให้กรรมการทดสอบได้ทันที
  
**Payment Gateway**
- **PromptPay ผ่าน Payment Gateway** - ใช้ sandbox ของผู้ให้บริการที่มี test mode PromptPay (Opn/Omise, 2C2P หรือ GB Prime Pay; ยังไม่ยืนยันว่ารายไหนมี) ถ้าไม่ได้ใช้ mock PSP ที่ส่ง webhook เซ็น HMAC เข้า endpoint จริง ตรรกะ verify 5 ข้อเขียนจริงทั้งสองแบบ
- เงินบาทใน MVP บันทึกอยู่ใน ledger ของแพลตฟอร์ม (D1) ไม่ใช้ USDC/คริปโตในการจ่าย

**Known limit:** code can't stop a fake event on its own, so shops are verified at sign-up.

## TO DO

- ใช้ได้ง่าย user ไม่ต้องเกี่ยวกับ wallet เลยยิ่งดี แต่ถ้าใครคุ้นเคยอยู่แล้วก็เป็นตัวเลือกได้
- มีการ demo ให้เห็นอย่างชัดเจนว่าได้ตั๋วเป็น NFT และสามารถซื้อขายแลกเปลี่ยนใน platform ได้
- มี Pipeline + Payment Gateway ที่ verify การจ่ายเงินของ user ได้
- หา market ที่เหมาะสม ต้องเป็นโซนราคา >1000 บาทที่มีความต้องการสูง

## Future work

- ถ้า user อยากใช้ wallet ที่มีก่อนหน้าจะได้มั้ย
- Reinforce payment pipeline ว่าใครได้ตั๋วไม่ได้ตั๋ว กรณีมาพร้อมกัน
- User จ่ายผ่าน Crypto ได้มั้ย ถ้าจ่ายพร้อมกับ PromptPay ใครจะได้ก่อน

## Roadmap

| Phase | Target | Scope |
|---|---|---|
| 1 · Now | Prototype (Friday 14:00) | PromptPay (sandbox or mock) + 10-minute hold and two-step status + NFT mint into the thirdweb wallet on Fuji + dynamic QR Valid/Invalid + resale in baht with price cap and 6-hour delay + (group B) automatic refund on cancel and payout after the event. Money in the ledger, no escrow contract yet |
| 2 · Next | Small to mid organizers (tickets or deposits >1,000 THB) | Real payment provider; **move escrow, refund and settlement into the contract** + automatic handling of failed mints; LINE OA booking link; bars, pop-ups, workshops |
| 3 · Then | Mid-size events | Festivals and fan meetings; organizer dashboard; full secondary market |
| 4 · Later | Big events | Fair Draw against bots + ticket-holder identity; offline gate for stadiums; pitch with real traction |

## Front-end mock-up

Clickable mock-up of the guest app (Thai UI, white and crimson theme), with a phone view and a desktop web view. Sign-in with Google is real (below); everything else is sample data.

- Page: `mockup/index.html` (open it directly in a browser)
- Hosting: `wrangler.jsonc` serves `mockup/` as static assets on Cloudflare Workers. In the Cloudflare dashboard, import this repo, leave the build command empty and use `npx wrangler deploy` as the deploy command.

### Google sign-in

`src/worker.js` makes "ดำเนินการต่อด้วย Google" a real Google login: Google always shows its account chooser, the Worker verifies the ID token, stores the user in D1 (`users`, `auth_identities`, `sessions`) and sets an HttpOnly session cookie. Until the two secrets below are set, the button keeps the demo flow.

1. Google Cloud Console > APIs & Services > Credentials > Create credentials > OAuth client ID, type **Web application** (set up the OAuth consent screen first if asked; while it is in Testing, add your team's Gmail addresses as test users).
   - Authorized JavaScript origins: `https://jongloei.<your-subdomain>.workers.dev`
   - Authorized redirect URIs: `https://jongloei.<your-subdomain>.workers.dev/auth/google/callback`
2. Cloudflare dashboard > Workers & Pages > jongloei > Settings > Variables and Secrets: add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as type **Secret**, then redeploy.

The redirect URI is built from the address the page was opened on, so add one more origin and redirect URI pair for any other domain (a custom domain, or `http://localhost:8787` for `npx wrangler dev`).

### Ticket wallet at sign-up

After every Google login the Worker checks that the user has a ticket wallet. If not, it asks thirdweb for a **server wallet** (`POST https://api.thirdweb.com/v1/wallets/server` with identifier `jongloei-user-<user id>`) and saves the address in `wallets` as the user's primary wallet on Avalanche Fuji (chain 43113). thirdweb returns the same wallet for the same identifier and the database ignores duplicates, so retries never make a second wallet. If thirdweb is down, login still works and the next login tries again. `/api/me` returns the address as `user.wallet`.

1. thirdweb dashboard (https://thirdweb.com/dashboard) > create a project > copy its **Secret key** (shown once).
2. Cloudflare dashboard > Workers & Pages > jongloei > Settings > Variables and Secrets: add `THIRDWEB_SECRET_KEY` as type **Secret**, then redeploy.

The wallet is held by the platform through thirdweb (users never see a seed phrase); a later "move my tickets to my own wallet" feature can transfer them out.

> **Current implementation vs. context v3.3:** this server wallet is what the code does today. Context v3.3 targets a thirdweb **embedded (in-app) wallet** instead, so the ticket owner's own key can sign the entry QR every 60 seconds. With a platform-held server wallet the user cannot sign the QR themselves, so this part still has to move to an embedded wallet.
### Paid flow: Stripe (PromptPay) → 5 checks → mint

The ticket checkout uses a Stripe-hosted Checkout Session in THB, so the guest can pay with PromptPay (enable it under Stripe Dashboard > Payment methods) or a card. The success URL is never treated as proof of payment.

1. **Seat hold.** `POST /api/checkout-session` takes the seats from `event_zones.remaining` and creates a `pending` order in one D1 transaction, valid for 10 minutes. Limit 4 tickets per account per event, counting orders still being paid.
2. **Hold expiry.** A cron trigger runs every minute (`wrangler.jsonc`). It expires the Stripe session of each hold older than 10 minutes, so it can no longer be paid, then returns the seats. Cancelling on the Stripe page returns them right away (`POST /api/checkout-cancel`).
3. **5 checks** (context 6.1) in `POST /api/stripe/webhook`:
   1. Stripe signature (HMAC, 5-minute tolerance).
   2. The session is fetched again from the Stripe API (5 s timeout, 3 tries); the webhook body is not trusted.
   3. `amount_total` and currency equal the order.
   4. `client_reference_id` / `metadata.order_id` equal the order, and the hold has not ended.
   5. Each Stripe event id is handled once (`webhook_events`), and only one caller can move the order from `pending` to `paid`, so it is minted once.

   A payment that fails 3 or 4 becomes `needs_review` (for example paid after the hold ended), and nothing is minted.
4. **Mint.** The paid order mints `quantity` tickets in one batched thirdweb write from the relayer to the buyer's wallet, using the event's `chain_event_id`. Token ids are read from the receipt's ERC-721 `Transfer` logs (Fuji RPC), and the order becomes `fulfilled`. A failed mint is retried up to 3 times by the cron. A send that may or may not have reached thirdweb goes to `needs_review` instead of being retried, so a ticket is never minted twice.
5. **My tickets.** `GET /api/tickets` lists the signed-in user's tickets. After returning from Stripe, the page polls `GET /api/checkout-status` until the ticket is minted.

Setup:

1. Apply the migrations to the **remote** database: `npx wrangler d1 migrations apply jongloei-db --remote`.
2. Add a restricted Stripe key as the secret `STRIPE_SECRET_KEY` (an `rk_` key with write access to Checkout Sessions).
3. Add a Stripe webhook at `https://<your-domain>/api/stripe/webhook` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` and `checkout.session.expired`, and store its signing secret as `STRIPE_WEBHOOK_SECRET`.
4. `THIRDWEB_SECRET_KEY` must be set for minting. Optional: `FUJI_RPC_URL` overrides the public Fuji RPC.

The checkout works only from the deployed Worker URL (or `npx wrangler dev`) with the real Google sign-in, not with `file://` or the demo login.

### Event catalog

The home page loads on-sale events from D1 through `GET /api/events`; event names, dates, venues, poster styles, zones, prices, and remaining inventory are no longer required to be edited in the frontend. Apply `db/migrations/0003_events.sql` to seed the current events. Seats are taken from `remaining` when an order is created and returned when its hold ends (see the paid flow above). Future admin tooling can edit the `events` and `event_zones` rows without adding frontend buttons.

```sh
npx wrangler d1 migrations apply jongloei-db --remote
```

### Test mint (admin only)

`POST /api/dev/test-mint` mints one ticket from the Fuji ticket contract (`contracts/deployments/fuji.json`) into the signed-in user's own wallet, through the relayer server wallet via thirdweb (`/v1/contracts/write`). Paid orders mint automatically (see the paid flow above); this endpoint stays for testing the relayer. Only users with `role = 'admin'` can call it.

1. Make your account an admin: `UPDATE users SET role = 'admin' WHERE email = '<you>';` in D1.
2. Sign in on the site, open the browser console and run:
   `await (await fetch('/api/dev/test-mint', { method: 'POST', body: JSON.stringify({ eventId: 1 }) })).json()`
3. The response has the transaction status and Snowtrace links for the transaction and your wallet.

Writes go from the relayer's ERC-4337 smart account (thirdweb sponsors gas). If thirdweb reports `Chain does not support EIP-7702`, the request was sent from the signer address instead of the smart account.

## Database

Account system schema (Cloudflare D1) and setup steps: [`db/README.md`](db/README.md).

## Demo

Live demo on testnet: *(add demo link)*
