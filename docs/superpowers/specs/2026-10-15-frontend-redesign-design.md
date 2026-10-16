# Frontend redesign: design spec

Branch: `redesign/web-frontend`. Date: 2026-10-15.

## Goal

Rebuild the guest app from `mockup/index.html` as a real Next.js app in a new `web/` folder. It keeps the same brand, the same Thai UI, and the same screens and flows. It removes the visual habits that make the mock-up read as AI-generated. All data is mock data and lives in the browser.

## Keep untouched

`mockup/`, `src/worker.js`, `wrangler.jsonc`, `db/`, `README.md` and `context.md` are not modified on this branch. The root Worker keeps serving the old mock-up. The new app ships on its own.

## Stack

- Next.js 16 (App Router), React 19, TypeScript strict, Tailwind CSS 4.
- Static export: `output: 'export'`, `trailingSlash: true`, `images.unoptimized: true`. The build output is `web/out/`.
- State: zustand 5 with the `persist` middleware in localStorage, key `jongloei-web-v1`.
- QR codes: the `qrcode` package (real, scannable codes).
- Fonts: General Sans via `next/font/local` (woff2 from Fontshare, ITF Free Font License). Anuphan and Prompt via `next/font/google`, Thai subset only. All are self-hosted at build time, so the browser makes no request to Google or Fontshare.
- Tests: Vitest 5, Testing Library and jsdom for units and components. Playwright 1.64 for an end-to-end smoke test against the static build.
- No network calls at runtime. "Sign in with Google" is the demo flow only (all-mock decision).

## Screens (parity with the mock-up)

| Route | Screen |
|---|---|
| `/` | Home: search, category chips, featured event, event list, empty state |
| `/events/[id]/` | Event detail: poster, info, resale conditions, zone picker, quantity, buy |
| `/checkout/` | Payment method (PromptPay only; card and USDC shown as "เร็ว ๆ นี้"), order summary |
| `/checkout/pay/` | PromptPay QR with a 10-minute countdown, "จำลองว่าชำระเงินแล้ว" (simulate paid), cancel |
| `/checkout/minting/` | 4-step mint progress |
| `/checkout/success/` | The new ticket, plus links to the ticket view and to home |
| `/tickets/` | My tickets, split into ใช้งานได้ (usable), ลงขายอยู่ (listed for sale) and ใช้แล้ว (used) |
| `/tickets/view/?id=<tid>` | Entry QR (rotates every 60 s) or NFT info; resell, transfer, unlist, simulate gate scan |
| `/market/` | Resale market with filtering by event, and buying a listing |
| `/profile/` | Account, wallet address with copy, connect-wallet teaser, log out, reset demo |

Sheets (dialogs): sign in, wallet setup, resell, transfer. Toasts for confirmations.

Layout: below 900 px it is a phone layout with a top app bar and a bottom tab bar (4 tabs). From 900 px up it is a desktop layout with a top nav, an inline search, and two-column detail and checkout pages. It is not a fake device or browser frame.

## Behaviour rules (copied from the mock-up)

- Purchase service fee: 3% of the subtotal, rounded (`Math.round`). Gas is shown as free ("ฟรี ระบบออกให้").
- Account limit: at most 4 tickets per event per account. Every ticket of that event the user holds counts, whatever its status.
- A sold-out zone (`left === 0`) is disabled. Its text points to the resale market.
- Resale cap: `Math.floor(face * 1.2)`. A valid price is a whole number from 1 to the cap.
- Resale platform fee: 5% (`Math.round`). The seller receives the price minus the fee.
- A ticket can be transferred at most 2 times. Only `active` tickets can be resold or transferred.
- Ticket status is `active`, `listed` or `used`. A listed ticket shows no QR ("ตั๋วกำลังลงขายอยู่ ยกเลิกการขายเพื่อใช้ QR"). A used ticket is locked.
- Buying a listing creates a ticket with the listing's token id and `transfers + 1`. Its recorded price is the face value. The listing is removed.
- New token ids start at 1311 and count up.
- The pay QR expires after 10 minutes. On expiry the simulate button becomes "สร้าง QR ใหม่" (make a new QR).
- The entry QR payload changes every 60 s, aligned to the wall-clock minute. A ring and a counter show the seconds left.
- The mint steps advance every 1.1 s, 4 steps. The wallet-setup steps advance every 0.9 s, 3 steps.
- Demo user: ชนกานต์, `chonnakarn@gmail.com`, wallet `0x4B21c7aE90F3d18b52A6e4c0F7D93a1B2e8C5d07`. Contract: `0x7a3F9e21B4c0D58aE6f1b2C9d04E7f3A15b8c91E`. Network label: Avalanche Fuji (ทดสอบ).
- Events, zones, prices, seats left, sold %, and the 3 seed listings are copied from the mock-up.
- UI copy is taken verbatim from the mock-up unless this spec changes it.

## Visual direction: same style, fewer AI tells

Kept: the crimson brand (`#A00018`), the light and dark token sets from the mock-up (same hex values), the logo, Thai copy, and the information hierarchy.

Changed:

1. **Type** (chosen by the user on 2026-10-15):
   - **Latin and digits:** **General Sans**. Semibold 600 for headings, prices and token numbers, Medium 500 for UI labels, Regular 400 for body.
   - **Thai body and UI:** **Anuphan** (400/500/600).
   - **Thai headings:** **Prompt** (500/600).
   - Each stack lists General Sans first, so Latin and digits always come from it.
   - IBM Plex Sans Thai and IBM Plex Mono are dropped.
   - Wallet addresses and tx hashes use the system `ui-monospace` stack (no webfont).
   - Prices and counts use tabular figures.
2. **Posters.** No crimson gradients and no diagonal stripe overlay. Each event has its own flat palette (`bg`, `fg`, `accent`). The layout is a date block (day number plus Thai month) in the top-left and the title at the bottom. An optional `image` field is supported for later. *Updated by plan Design Revision 1 (R1, R4): event photos are now the primary visual on cards, the hero and listings. The flat poster is the fallback and stays on the ticket stub.*
   - neon: `#1B1B3A` / `#FFFFFF` / `#FF4D6D`
   - jazz: `#0F5257` / `#F7F1E3` / `#F2C14E`
   - fan: `#F7D6E0` / `#4A0010` / `#A00018`
   - standup: `#F2E8D5` / `#1E1416` / `#A00018`
3. **No icon-feature grid.** The 3-up "trust" tiles (cube/shield/swap) become one plain resale-conditions block. *Overridden by plan Design Revision 1 (R2.1): the user wants a borderless 2 × 2 icon-above-text grid that includes a "เงื่อนไขการขายต่อ" (resale conditions) item.*
4. **Radius scale** is only 4 / 8 / 12 px. Sheets are 12 px on top, pills are full. A card uses a border or a shadow, never both. Card borders are translucent (ink at 8%), not solid. Shadows are for overlays only (sheet, toast). Nested rounded elements are concentric: inner radius = outer − padding.
5. **Pills only for status:** พร้อมใช้ (ready), ลงขายอยู่ (listed), เข้างานแล้ว (entered), ใกล้เต็ม (almost full), ขายเร็ว (selling fast). Decorative pills ("ตั๋ว NFT", "ERC-721", "สร้างอัตโนมัติ", "ยืนยันเจ้าของบนเชน", "ต่อในอนาคต") become plain muted text.
6. **No uppercase letter-spaced eyebrows.** No check-in-a-rounded-square hero. The success screen leads with the ticket itself.
7. **Google button** uses the official four-colour G mark, not a "G" in a blue circle.
8. **QR codes are real** (encoded payload). No random pixels and no red centre square.
9. **Motion** only on sheets and toasts (enter and a softer exit), the progress steps, button press (`scale 0.97`) and the copy-to-check icon swap. There is no per-screen fade-in, no staggered enters and no motion on page load, and `prefers-reduced-motion` disables all of it. Enters and exits use `ease-out`, every UI animation lasts at most 250 ms, and only `transform`, `opacity` and `filter` animate. A selected or current state never changes font weight. The z-index uses a fixed 4-level scale (sticky, overlay, toast, skip).
10. **No inline `style` attributes.** Everything comes from Tailwind tokens. Per-event poster colours are passed as CSS variables on the poster element only.

## Out of scope

Host pages, the gate scanner app, real payment, the contract, real thirdweb wallets, real Google auth in the new app, and deploying to the existing `jongloei` Worker.
