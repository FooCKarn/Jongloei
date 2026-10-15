# FairTicket

**Scam-proof event booking for small venues.**
U-Hackathon 2026 · Web3 Track · by team **Caffeine Commit**

FairTicket is a booking engine that acts as the middleman between small venues and their guests. Shops create an event in minutes. Guests pay into escrow and receive an NFT ticket on-chain. The smart contract pays the shop after the event, or refunds guests automatically if the event is cancelled.

> *Escrow: your payment is held safely and released automatically by fixed rules, not by a person.*

---

## The problem

Bars, pop-ups and workshops sell tickets through chat (LINE / IG / FB) and bank transfer. Shops check slips by eye, and guests pay first and hope the event happens.

- **Fake slips:** apps are sold that can edit any bank slip, including future-dated ones.
- **No system:** bookings are handled by hand in chat, which leads to overbooking.
- **No staff:** nobody has time to verify every slip at the door.
- **No protection for guests:** deposits are lost if the event flops.

Small shops need a trusted middleman they can run without a tech team.

## Current solutions and the gap

| Option | How it works | Weakness |
|---|---|---|
| Chat + transfer | LINE / IG DM + bank slip | Free, but slips can be faked |
| Manual slip check | Scan in bank app | Works, but needs staff on every order |
| Ticket platforms | Eventpop, Ticketmelon | Built for organizers; guests still have to trust the host |
| NFT ticketing | Fansland, WeloveNFT | Targets organizers and large events |

None protect both shop and guest. **Open gap: escrow booking**, where code holds the money and both sides are protected.

## Key features

- Escrow payment, no slips
- On-chain auto refund if cancelled
- Wallet-signed dynamic QR for entry
- Shop setup in minutes, no tech team

## How it works

1. **Shop creates event on-chain:** price, seats, date.
2. **Guest pays into escrow;** an NFT ticket is minted in the same transaction.
3. **Gate checks the QR against the chain:** owner, expiry, not used.
4. **Contract pays the shop,** or refunds guests if the event is cancelled.

No person holds the money. The contract verifies payment, mints the ticket and releases funds by fixed, public rules.

### Dynamic QR entry (screenshots are useless)

| Step | What happens |
|---|---|
| 1 · Sign | The owner's wallet signs ticket ID + time, every 60 seconds |
| 2 · Owner check | Signer must match the on-chain owner |
| 3 · Freshness + nonce | Older than 60 s or reused is rejected |
| 4 · Check in + lock | Ticket marked used; no transfers after entry |

### Scams blocked

| Scam | Rule that blocks it |
|---|---|
| Fake slip | Payment is confirmed by the contract, not a picture |
| Event flops | Money waits in escrow; auto refund if cancelled |
| Screenshot reuse | QR expires in 60 s; nonce + used flag, so each ticket enters once |
| Overbooking | Atomic mint stops sales at seat capacity |

## User flow

User เข้า web3 ของเราที่เป็นผู้จัดจำหน่ายตั๋ว
→ User sign up เข้าระบบ + รอระบบ thirdweb สร้าง wallet ให้
→ User เลือกซื้อและจ่ายค่าตั๋วผ่าน PromptPay
→ Payment Gateway ขึ้นเพื่อรอประมวลผลและ mint บัตรให้กับ User *(future work)*
→ System mint ticket เข้า wallet user
→ User สามารถซื้อ-ขาย ตั๋ว NFT (อาจจะภายใน 1 ชม. ก่อนงานเริ่ม)
→ User แสดง QR ของตั๋วที่หน้างานเพื่อเข้างาน

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
  
** Payment & Fiat Gateway **
- ** [Stripe](https://stripe.com/) ** - สำหรับประมวลผลการชำระเงินด้วยบัตรเครดิต/เดบิต และระบบ PromptPay Integration เพื่อรับชำระเงิน Fiat Fiat-to-Crypto On-ramp

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
| 1 · Now | Prototype | Escrow booking + auto refund, owner-signed dynamic QR, atomic seat mint with transfers off, shop setup in minutes |
| 2 · Next | Small venues | Bars, pop-ups and workshops; LINE OA booking link; PromptPay on-ramp; U-Pay for tourist guests |
| 3 · Then | Mid-size | Festivals and fan meetings; safe resale (price cap, 2-transfer limit, lock window); organizer dashboard |
| 4 · Later | Big events | Fair Draw lottery vs bots; offline gate for stadiums; pitch with proven traction |

## Front-end mock-up

Clickable mock-up of the guest app (Thai UI, white and crimson theme), with a phone view and a desktop web view. Sign-in with Google is real (below); everything else is sample data.

- Page: `mockup/index.html` (open it directly in a browser)
- Hosting: `wrangler.jsonc` serves `mockup/` as static assets on Cloudflare Workers. In the Cloudflare dashboard, import this repo, leave the build command empty and use `npx wrangler deploy` as the deploy command.

### Google sign-in

`src/worker.js` makes "ดำเนินการต่อด้วย Google" a real Google login: Google always shows its account chooser, the Worker verifies the ID token, stores the user in D1 (`users`, `auth_identities`, `sessions`) and sets an HttpOnly session cookie. Until the two secrets below are set, the button keeps the demo flow.

1. Google Cloud Console > APIs & Services > Credentials > Create credentials > OAuth client ID, type **Web application** (set up the OAuth consent screen first if asked; while it is in Testing, add your team's Gmail addresses as test users).
   - Authorized JavaScript origins: `https://jongloei.foo30749.workers.dev`
   - Authorized redirect URIs: `https://jongloei.foo30749.workers.dev/auth/google/callback` (exactly this, no trailing slash)
2. Cloudflare dashboard > Workers & Pages > jongloei > Settings > Variables and Secrets: add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as type **Secret**, then redeploy.

Sign-in always goes through `PUBLIC_ORIGIN` in `wrangler.jsonc`, so preview URLs use the same registered redirect URI. If the site moves to a custom domain, change `PUBLIC_ORIGIN` and register the new origin and redirect URI. For `npx wrangler dev`, also register `http://localhost:8787` and `http://localhost:8787/auth/google/callback`.

## Database

Account system schema (Cloudflare D1) and setup steps: [`db/README.md`](db/README.md).

## Demo

Live demo on testnet: *(add demo link)*
