# Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the guest app from `mockup/index.html` as a Next.js static app in `web/`, with the same brand, screens and flows, all on mock data, and with the AI-looking visual habits removed.

**Architecture:** A Next.js App Router app with a static export.
- `lib/rules.ts` is a deep module. A few pure functions (`quotePurchase`, `purchaseLimit`, `quoteResale`, `ticketPermissions`, `entryQr`, `searchEvents`) hide every price, fee, cap, limit and status rule. The small helpers behind them are not exported.
- A zustand store, persisted to localStorage, holds tickets, listings, the session and one `order` with its own lifecycle (`startOrder` → `completeOrder`). The store is the only seam where mock data could later be replaced with real APIs.
- Pages are client components that read the store. Reusable UI lives in `components/`.

**Tech Stack:** Next.js 16.4, React 19, TypeScript strict, Tailwind CSS 4.3, zustand 5, qrcode 1.5, Vitest 5 + Testing Library + jsdom, Playwright 1.64.

**Spec:** `docs/superpowers/specs/2026-10-15-frontend-redesign-design.md`

## Global Constraints

- Work on branch `redesign/web-frontend`. Create or modify files only under `web/` and `docs/`. Never touch `mockup/`, `src/`, `db/`, `contracts/`, `wrangler.jsonc`, `README.md` or `context.md`.
- Node 20.19 (installed). Run all commands from `web/`.
- `next.config.ts`: `output: 'export'`, `trailingSlash: true`, `images: { unoptimized: true }`.
- No runtime network calls. No `fetch` to `/api` or `/auth`. Sign-in is the demo flow.
- `<html lang="th">`. UI copy is verbatim from `mockup/index.html` unless the spec changes it.
- Colour tokens use the exact hex values in `mockup/index.html:14-40` (light and dark) and are defined once in `src/app/globals.css` via Tailwind `@theme`. Dark mode follows `prefers-color-scheme`.
- Fonts: Latin and digits use **General Sans** for both headings and body. Thai body text uses **Anuphan** and Thai headings use **Prompt**.
  - General Sans (Fontshare, ITF Free Font License) is loaded with `next/font/local` from `web/src/fonts/GeneralSans-{Regular,Medium,Semibold}.woff2` (400/500/600) with `variable: '--font-general'`. The license file is committed next to the fonts.
  - `Anuphan` (400, 500, 600, `subsets: ['thai']`) and `Prompt` (500, 600, `subsets: ['thai']`) are loaded with `next/font/google`.
  - Stacks:
    - `--font-body: var(--font-general), var(--font-anuphan), system-ui, sans-serif`
    - `--font-display: var(--font-general), var(--font-prompt), system-ui, sans-serif`
  - General Sans comes first and has no Thai glyphs, so the browser takes Latin and digits from it and Thai from the next font in the stack. Load only the Thai subset of Anuphan and Prompt, so their Latin glyphs never win.
  - Weights: headings and prices are 600, UI labels 500, body 400.
  - Mono is the `ui-monospace, Menlo, monospace` stack.
- Desktop breakpoint: 900 px, as a custom Tailwind breakpoint `desk` (`--breakpoint-desk: 56.25rem`).
- Radius is only 4 / 8 / 12 px plus `rounded-full` for pills. No `style={{…}}` except the CSS variables passed on `Poster`.
- Persist key: `jongloei-web-v1`.
- Path alias `@/*` → `src/*`. Tests are colocated as `*.test.ts(x)`. E2E tests go in `web/e2e/`.

**Accessibility and interaction rules** (from the Web Interface Guidelines audit of `mockup/index.html`; every task follows them):
- **Tap targets:** every button, link, chip and stepper is at least 44 × 44 px (`min-h-11`, with `min-w-11` for icon-only buttons).
- **Input size:** inputs use a font size of 16 px or more (`text-base`), so iOS does not zoom on focus.
- **Hover:** hover styles only through Tailwind's `hover:` variant, which v4 wraps in `@media (hover: hover)`. No raw `:hover` in CSS.
- **Focus:** use `focus-visible:` styles with a 2 px `outline-red` ring. Never `outline-none` without a visible replacement. A wrapper around an input shows the ring with `focus-within:`.
- **Icons and labels:** decorative icons are `aria-hidden="true"`. Every icon-only button has an `aria-label`. Every input has a `<label>` or an `aria-label`.
- **Headings:** each page has exactly one `<h1>`. On phone it is the app bar title.
- **Selection controls:** controls that pick one option (zone, payment method, category chips) use `role="radiogroup"`/`role="radio"` + `aria-checked`. Segmented view switches use `role="tablist"`/`tab` + `aria-selected`.
- **Forms:** every text input sits in a `<form>` whose submit runs on Enter. Errors set `aria-invalid` and are linked through `aria-describedby`.
- **Destructive actions:** an action that cannot be undone (reset demo data) asks for confirmation in a `Sheet` first.
- **No translation:** add `translate="no"` on the JONGLOEI wordmark, wallet addresses, tx hashes and `Token #…` text.
- **Theme colour:** `<meta name="theme-color">` comes from the Next `viewport` export, light `#F6F3F3` and dark `#120C0D`.
- **Overlays:** the sheet backdrop uses `overscroll-behavior: contain`.

**Polish rules** (from the make-interfaces-feel-better audit of `mockup/index.html`):
- **Concentric radius:** for a rounded element nested in a rounded element, inner radius = outer radius − padding, kept on the 4 / 8 / 12 scale. A 12 px card with 8 px padding holds 4 px children. A 12 px card with 4 px padding holds 8 px children. When the padding is at least the outer radius, inner corners are 4 px. Never give a parent and its child the same radius.
- **Borders:** card borders are translucent, not solid. Add `--color-line-soft: color-mix(in oklab, var(--color-ink) 8%, transparent)` in `@theme` and use it in both themes (`border-line-soft`). Solid `--line` is kept for dividers and progress tracks only. Shadows stay on overlays only (spec rule 4).
- **Font smoothing:** `antialiased` on `<body>`.
- **Numbers:** every number that changes while the page is open uses `tabular-nums`. That covers prices, totals, countdowns, seats left ("เหลือ N ที่"), the wallet chip count ("N ตั๋ว") and the tab counts "(N)".
- **Text wrapping:** headings use `text-balance`. Body paragraphs and hints use `text-pretty`.
- **Transitions:** never `transition: all` (Tailwind `transition` or `transition-all`). Always name the property: `transition-colors`, `transition-transform`, `transition-opacity`, or `transition-[scale,opacity]`. No `will-change` unless a first-frame stutter is measured.
- **Motion:** no staggered enter animations and no motion on page load. Motion stays limited to sheets, toasts, steps, button press and the copy icon (spec rule 9).

**Design-engineering rules** (from the Emil Kowalski design-engineering audit of `mockup/index.html`):
- **Easing and timing:**
  - Enter and exit use `ease-out`; hover and colour changes use `ease`; something moving on screen uses `ease-in-out`.
  - UI motion lasts at most 250 ms.
  - Animate only `transform` and `opacity` (and `filter` for the icon blur). Never animate `height`, `width`, `top` or `left`.
- **z-index scale:** defined once in `@theme` and nowhere else. Never write a raw `z-[n]` or `z-index` number.
  - `--z-sticky: 10` for the app bar, tab bar and sticky CTA.
  - `--z-overlay: 40` for the sheet and its backdrop.
  - `--z-toast: 50`.
  - `--z-skip: 60` for the skip link.
- **No weight shifts:** never change `font-weight` for hover, active, selected or current states, because it reflows text. Show state with colour, background or an indicator bar.
- **Tap highlight:** `-webkit-tap-highlight-color: transparent` on `body`. Our `active:` states give the press feedback instead.
- **Dynamic text widths:** text that swaps in place (countdown → "หมดอายุ", button labels that change) gets a fixed `min-w-[…ch]` and `tabular-nums`, so neighbours don't move.
- **Numeric inputs:** never use `type="number"`. Use `type="text" inputMode="numeric" pattern="[0-9]*"` and parse with `Number()`, so the mouse wheel and spinner arrows can't change a price.
- **Horizontal scrollers:** in a horizontally scrolling row with a hidden scrollbar (chips), a focused item calls `scrollIntoView({ block: 'nearest', inline: 'nearest' })`.

## Review Focus

1. **Hydration:** the static HTML is rendered signed-out and empty, while the persisted state isn't. Pages must not flash wrong data or throw hydration errors. They render nothing store-dependent until `useHydrated()` is true. Test in Task 3.
2. **Deep links with no state:** a direct load or refresh of `/checkout/`, `/checkout/pay/`, `/checkout/minting/` or `/checkout/success/` with no order, or of `/tickets/view/?id=9999`, must not crash. `useOrderGuard` redirects (see Task 8). An unknown ticket shows "ไม่พบตั๋วใบนี้" (ticket not found) with a link to `/tickets/`. Tests in Tasks 8 and 9.
3. **Resale price input:** empty, `0`, negative, decimal (`1000.5`), text (`'abc'`), and above the cap must all disable the list button and show the error hint. `quoteResale` owns this rule. Tests in Tasks 2 and 9.
4. **Double minting:** React StrictMode double effects, navigating away mid-mint, or pressing Back after success must never create tickets twice or create tickets for an abandoned mint. This is enforced by construction: `completeOrder()` mints only an order whose status is `pending`, and a minted order sends every checkout page forward, never back into minting. Tests in Tasks 3 and 8.
5. **Narrow screens:** at 320 px width with the longest Thai event name, no page may scroll horizontally. Test in Task 11.

## Design Revision 1 (user request, 2026-10-15)

**Precedence:** where this section conflicts with a task body, the Global Constraints or the spec, this section wins. Tasks 6, 7 and 10 carry a pointer back here. Items marked **[OPEN]** have a working default and still need the user's confirmation.

Visual reference for event cards: hotel-listing cards. A photo fills the top of the card; below it sit short text lines and a bold price at the bottom. The card has one radius and a soft border, and its corners are concentric.

### R1. Home page (replaces the home layout in Task 6)

Order from top to bottom:

1. **Animated hero banner.**
   - **Content:** a short pitch for the site, then a primary button "Discover more events" that links to `/search/`.
     - **[OPEN] Copy.** Default headline: "ตั๋วงานที่ปลอมไม่ได้ จ่ายปลอดภัย ขายต่อได้ในราคายุติธรรม" (tickets that can't be faked; pay safely; resell at a fair price). Default subline: "ตั๋วทุกใบเป็น NFT ในกระเป๋าของคุณ ไม่ต้องส่งสลิป" (every ticket is an NFT in your wallet; no slips).
     - **[OPEN] Button label language.** English as the user wrote it, or a Thai version such as "ค้นหางานอีเวนต์เพิ่มเติม" (find more events).
   - **Background:** the images of the featured events cross-fade every 6 s. The fade is 800 ms `ease-in-out`, opacity only.
   - **Text:** the headline, subline and button enter once on load (opacity plus `translateY(8px)`, 400 ms `ease-out`, 80 ms stagger). This is the only staggered entrance in the app.
   - **Readability:** a scrim makes the text readable over any image. The scrim is a flat dark overlay, not a decorative gradient.
   - **Controls:** the rotation pauses on hover and focus, and there is a pause/play button (`aria-label` "หยุดภาพเคลื่อนไหว" (pause animation) / "เล่นภาพเคลื่อนไหว" (play animation)), as WCAG 2.2.2 requires.
   - **Reduced motion:** with `prefers-reduced-motion`, the banner shows the first image only, with no rotation and no entrance.
   - **Size:** at least 320 px tall on phone and 420 px on desktop.
2. **Search and filter bar.**
   - The search box, then three filter tabs: **ราคา (price)**, **สถานที่ (venue)** and **เวลา (time)**. Each tab opens a small popover on desktop and a `Sheet` on phone, with single-choice options.
   - An active filter shows its value on the tab, for example "ราคา: ≤ ฿2,000", with a clear (×) control. "ล้างตัวกรอง" (clear filters) resets all of them.
   - State lives in the URL: `?q=&price=&area=&month=`.
   - **[OPEN] Filter options.** Defaults:
     - **Price** buckets, matched on `minPrice`: `≤ ฿2,000` / `฿2,001–4,000` / `> ฿4,000`.
     - **Venue:** the distinct `area` values in the data. Add the field `area` to `EventItem`: neon and fan are เมืองทองธานี, jazz is เจริญกรุง, standup is สามย่าน.
     - **Time:** month buckets derived from the event dates (พ.ย. 2569, ธ.ค. 2569, ม.ค. 2570).
3. **Event cards** in a grid (1 column on phone, 2 at `sm`, 3 at `desk`).
   - Each card is an image card in landscape aspect ratio 4:3: a photo on top, then exactly three details:
     1. the event name;
     2. availability: เต็มแล้ว (sold out), ใกล้เต็ม (almost full) or ยังมีที่ว่าง (seats available);
     3. "เริ่มต้น ฿X" (from ฿X).
   - The whole card is a link to `/events/{id}/`.
   - There is no featured hero card anymore; the banner replaces it.

**New route `/search/`:**
- The full search page. It has the same search and filter bar, a results count "พบ N งาน" (N events found), and the same card grid.
- The home bar submits to `/search/?q=…`. Filters on home also navigate to `/search/` with the filter in the URL.

**[OPEN] Event images.** The mock data needs one photo per event. The default is 4 royalty-free photos (Unsplash licence) saved in `web/public/events/{id}.jpg` at 1600 × 1200, plus `alt` text. The alternative is photos supplied by the team. The flat-palette `Poster` from spec rule 2 stays as the fallback when `image` is missing, and is still used on the ticket stub.

**New rules in `rules.ts`** (keep the deep-module shape):
- `filterEvents(events: EventItem[], seatsLeft: Record<string, number[]>, f: { q: string; price: PriceBucket | null; area: string | null; month: string | null }): EventItem[]`. It replaces `searchEvents`.
- `availability(event: EventItem, seatsLeft: number[]): 'available' | 'almost' | 'soldout'`:
  - `'soldout'` when every zone has 0 seats left;
  - `'almost'` when `soldPct >= 95`;
  - otherwise `'available'`.
- `filterOptions(events: EventItem[]): { areas: string[]; months: { key: string; label: string }[] }`.

### R2. Event detail (replaces parts of Task 7)

1. **Trust grid.**
   - Four items in a **2 × 2 grid**, each an icon above its text (vertical stack), centred, with **no border or card**:
     1. cube icon: "ตั๋วเป็น NFT ของคุณจริง" (your ticket is a real NFT);
     2. shield icon: "ปลอมสลิป ปลอมตั๋วไม่ได้" (slips and tickets can't be faked);
     3. swap icon: "ขายต่อในแอปได้ ราคาคุมเพดาน" (resell in the app, price capped);
     4. info icon: "เงื่อนไขการขายต่อ" (resale conditions). This item is a button that opens a `Sheet` with the full conditions text from `mockup/index.html:488`.
   - This overrides spec rule 3 at the user's request. The old plain resale-conditions block is removed.
2. **Zone selection.**
   - Each zone is a row with a square checkbox mark on the left. It is empty at first, and the row's border is 1 px `line-soft`.
   - When selected, the checkbox fills red with a white check and the row border becomes **2 px red**. There is **no background change**.
   - To avoid layout shift from the thicker border, every row reserves 2 px with `outline` or an inset `box-shadow`, so the border width is visually 2 px but the box size never changes.
   - The semantics stay `role="radio"`, because only one zone can be chosen.
   - The colour dot moves to after the zone name.
3. **Purchase panel.**
   - Selecting a zone slides up a **bottom panel** on phone (non-modal, docked above the safe area, 250 ms `ease-out` `translateY`). On desktop it shows as the sticky side panel.
   - The panel has two **equal-height halves**:
     - top: จำนวน (quantity) stepper with the allowance text;
     - bottom: total price on the left and "ซื้อเลย" (buy now) on the right.
   - The panel stays open while you change zone, and its values update.
   - The page gets bottom padding equal to the panel height, so the content is never hidden behind it.
   - The panel is labelled ("เลือกจำนวนและชำระเงิน", choose quantity and pay) and reachable by keyboard right after the zone list.
   - **[OPEN]** Should the panel have a close/collapse handle, or stay open until you leave the page? The default is no handle; it stays open.

### R3. Resale market (replaces parts of Task 10)

1. **Listing card** (horizontal).
   - The image is on the left, full card height (`aspect-[3/4]`, 112 px wide on phone and 160 px on desktop). The content is on the right, in **two parts with no divider line**: the top has details, the bottom has actions.
   - Top left: the event name, then date and zone. Top right: the price block:
     - **Above:** the face price, struck through, small and muted. It is shown only when the listing price differs from face.
     - **Below:** the current price, large (display font, 20 px or more, `tabular-nums`). Its colour is **red when above face**, **green (`ok`) when below face**, and **ink when equal**. When equal there is no struck price.
   - Bottom: "ซื้อเลย" (buy now), or "ตั๋วของคุณ" (your ticket) for your own listing, plus an **info button** (an "i" icon, `aria-label` "ข้อมูลตั๋ว" (ticket info)).
   - The info button opens a `Sheet` holding everything removed from the card face:
     - seller address (`translate="no"`), Token #, โอนมาแล้ว N/2 ครั้ง (transferred N of 2 times), ยืนยันเจ้าของบนเชน (owner verified on-chain), and the contract.
   - Colour is never the only signal: the price block also has a text label for screen readers ("สูงกว่าราคาหน้าบัตร 10%" (10% above face price), "ต่ำกว่าราคาหน้าบัตร 5%" (5% below face price), or "ราคาหน้าบัตร" (face price)).
   - New rule: `resalePriceTone(price: number, face: number): { tone: 'up' | 'down' | 'flat'; pct: number }`.
2. **Notice as a collapsible, dismissible alert.**
   - It holds "ตั๋วมือสองที่ตรวจสอบได้ทุกใบ" (every resale ticket is verifiable), with the body text from `mockup/index.html:631`.
   - The header row is the title, a chevron that expands or collapses the body (`aria-expanded`), and an × close button (`aria-label` "ปิด" (close)). It starts expanded.
   - Colours: the background matches the theme, `surface` (white in light, `#1C1415` near-black in dark). The **border, header text and the line under the header are red**. The body is ink.
   - Closing hides the alert and remembers it for this browser (localStorage key `jongloei-web-v1:market-notice`, wrapped in try/catch).
3. **Search and filters:** the market gets the same search and filter bar as home (R1.2). Results filter listings by their event's fields, plus `price` applied to the listing price.

### R4. Spec rules this revision overrides
- **Spec rule 2 (posters):** event photos are now the primary visual on cards, the hero and listings. The flat-palette `Poster` stays as the fallback and on the ticket stub.
- **Spec rule 3 (no icon-feature grid):** reversed for the event detail trust grid (R2.1), at the user's request.
- **Spec rule 9 (motion):** the hero banner adds a looping cross-fade (800 ms) and a one-time staggered entrance (400 ms), above the 250 ms UI cap. Both are allowed for this banner only, are pausable, and are fully disabled under reduced motion. The purchase panel's slide-up stays at 250 ms or less.

### R5. Tests to add when the tasks are rewritten
- **Rules:** `filterEvents` (each bucket, combined filters, empty result), `availability` (the 3 cases, using fan/neon data), `resalePriceTone` (4600/4200 is up 10, 2900/2900 is flat 0, 2500/2900 is down 14).
- **Home:** the hero has a link "Discover more events" with href `/search/`; the pause button stops the rotation (fake timers: image index unchanged after 12 s); with reduced motion (`matchMedia` mock) there is no rotation; each card shows exactly name, availability and price.
- **Search:** URL params pre-select the filters; clearing a filter tab updates the URL.
- **Event detail:** the 2 × 2 grid has 4 items; the conditions item opens a sheet; the selected zone has `aria-checked`; the e2e check finds a 2 px red border, an unchanged background colour, and an unchanged row height; the panel appears after selection with 2 equal-height halves (e2e compares their bounding boxes).
- **Market:** the price colour per tone; the struck price is absent when flat; the info sheet holds the seller and token; the notice collapses (`aria-expanded`), and closing it persists across reloads (e2e).

## File Structure (all under `web/`)

| Path | Responsibility |
|---|---|
| `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `package.json` | Build config (from create-next-app, then edited) |
| `vitest.config.ts`, `src/test/setup.ts`, `src/test/router.ts` | Test runner, jest-dom, `next/navigation` mock |
| `playwright.config.ts`, `e2e/*.spec.ts` | E2E against the served `out/` |
| `src/app/globals.css` | Tokens (`@theme`), base styles, reduced motion |
| `src/app/layout.tsx` | Fonts, `<html lang="th">`, `AppShell` |
| `src/app/**/page.tsx` | One file per route in the spec's table |
| `src/lib/types.ts` | `EventItem`, `Zone`, `Ticket`, `Listing`, `Cart`, `Order`, `User`, and the quote/permission result types |
| `src/lib/data.ts` | `EVENTS`, `SEED_LISTINGS`, `DEMO_USER`, `CONTRACT`, `CATEGORIES`, `FIRST_TOKEN_ID` |
| `src/lib/format.ts` | Baht, address, Thai date formatting |
| `src/lib/rules.ts` | Deep module of pure functions: `quotePurchase`, `purchaseLimit`, `quoteResale`, `ticketPermissions`, `entryQr`, `searchEvents`, `minPrice` |
| `src/lib/store.ts` | zustand store with the order lifecycle, actions, and `useHydrated` |
| `src/app/checkout/useOrderGuard.ts` | Routes each checkout page by order status |
| `src/components/ui/` | `Button`, `StatusPill`, `Segmented`, `Sheet`, `Toast`, `Field`, `Steps`, `QrCode`, `Icon` |
| `src/components/shell/` | `AppShell`, `AppBar`, `TabBar`, `DesktopNav`, `SearchBox` |
| `src/components/auth/` | `SignInSheet`, `WalletSetupSheet`, `GoogleMark` |
| `src/components/event/` | `Poster`, `EventCard`, `FeaturedEvent`, `ZonePicker`, `QtyStepper` |
| `src/components/ticket/` | `TicketCard`, `TicketRow`, `EntryQr`, `ResellSheet`, `TransferSheet` |
| `src/components/market/` | `ListingCard` |

---

### Task 1: Scaffold `web/` with the build, tokens, fonts and test runner

**Files:**
- Create: `web/` via create-next-app, `web/vitest.config.ts`, `web/src/test/setup.ts`, `web/src/test/router.ts`, `web/src/app/smoke.test.tsx`, `web/src/app/fonts.ts`, `web/src/fonts/GeneralSans-{Regular,Medium,Semibold}.woff2`, `web/src/fonts/GeneralSans-LICENSE.txt`
- Modify: `web/next.config.ts`, `web/src/app/globals.css`, `web/src/app/layout.tsx`, `web/src/app/page.tsx`, `web/package.json`

**Interfaces:**
- Produces: the `@/` alias, Tailwind tokens (`bg-bg`, `bg-surface`, `bg-surface-2`, `text-ink`, `text-muted`, `border-line`, `bg-brand`, `text-red`, `bg-red`, `bg-red-strong`, `bg-red-soft`, `text-ok`, `bg-ok-soft`, `text-warn`, `bg-warn-soft`, `font-display`, `font-body`, `font-mono`, breakpoint `desk:`), npm scripts `dev`, `build`, `test` (`vitest run`), `e2e`. `src/test/router.ts` exports `mockRouter = { push: vi.fn(), replace: vi.fn(), back: vi.fn() }` and `setPathname(p: string)` and `setSearchParams(q: string)`, all wired through `vi.mock('next/navigation')` in `setup.ts`.

- [ ] **Step 1: Generate the app**

Run (from repo root): `npx create-next-app@16.4.1 web --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes`
Expected: `web/package.json` exists, and `web/src/app/page.tsx` exists.

- [ ] **Step 2: Add test deps**

Run: `npm i -D vitest@5 @vitejs/plugin-react vite-tsconfig-paths jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom` and `npm i zustand@5 qrcode@1.5 && npm i -D @types/qrcode`
Expected: installs succeed.

- [ ] **Step 3: Write the failing smoke test** in `src/app/smoke.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import Home from './page';
test('home renders the brand wordmark', () => {
  render(<Home />);
  expect(screen.getByText('JONGLOEI')).toBeInTheDocument();
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `npx vitest run src/app/smoke.test.tsx`
Expected: FAIL. The first failure is config (no jsdom or jest-dom). After `vitest.config.ts` (plugins react + tsconfigPaths, `environment: 'jsdom'`, `setupFiles: ['src/test/setup.ts']`, `globals: true`) is in place, it fails on the missing text.

- [ ] **Step 5: Implement the config, tokens and layout**

- `next.config.ts`: the export options from Global Constraints.
- Fonts: download General Sans from https://www.fontshare.com/fonts/general-sans. From the zip's `Fonts/WEB/fonts/` folder, copy `GeneralSans-Regular.woff2`, `GeneralSans-Medium.woff2` and `GeneralSans-Semibold.woff2` into `web/src/fonts/`, and copy the zip's license file to `web/src/fonts/GeneralSans-LICENSE.txt`. Create `src/app/fonts.ts`, which exports `general`, `anuphan` and `prompt` as described in Global Constraints.
- `globals.css`: `@import "tailwindcss";`, then `@theme` with every colour token from the mock-up (light values), the radius scale (`--radius-sm: 4px; --radius-md: 8px; --radius-lg: 12px`), `--breakpoint-desk: 56.25rem`, and `--font-display` / `--font-body` mapped to the next/font variables. Add a `@media (prefers-color-scheme: dark)` block overriding the same custom properties with the mock-up's dark values, and a `prefers-reduced-motion` block that zeroes animation and transition. Add `--color-line-soft` (see Polish rules). Body gets `antialiased` and `-webkit-tap-highlight-color: transparent`. Add the z-index tokens (`--z-sticky`, `--z-overlay`, `--z-toast`, `--z-skip`) to `@theme`.
- Theme switch without colour flashing: create `src/app/ThemeTransitionGuard.tsx`, a client component mounted in `layout.tsx`.
  - It listens to `matchMedia('(prefers-color-scheme: dark)')` `change`.
  - On change it adds the class `theme-switching` to `<html>` and removes it two animation frames later.
  - `globals.css`: `.theme-switching * { transition: none !important; }`.
  - Test: `ThemeTransitionGuard.test.tsx` fires a mocked `change` event and expects the class to be present, then absent after 2 rAF ticks.
- `layout.tsx`: put the three font `.variable` classes on `<html>`, and set `lang="th"`. Body is `bg-bg text-ink font-body`. Export `viewport: Viewport = { themeColor: [{ media: '(prefers-color-scheme: light)', color: '#F6F3F3' }, { media: '(prefers-color-scheme: dark)', color: '#120C0D' }] }`.
- `page.tsx`: placeholder that renders the wordmark `JONGLOEI` (replaced in Task 6).

- [ ] **Step 6: Verify the test passes and the build exports**

Run: `npm test` → PASS. Then `npm run build` → completes, `web/out/index.html` exists, and `web/out/_next/static/media/` holds the General Sans, Anuphan and Prompt `.woff2` files. `out/index.html` must not reference `fonts.googleapis.com`.

- [ ] **Step 7: Commit**

```bash
git add web
git commit -m "feat(web): scaffold Next.js static app with tokens, fonts and Vitest"
```

---

### Task 2: Domain types, mock data, formatting and rules

**Files:**
- Create: `web/src/lib/types.ts`, `web/src/lib/data.ts`, `web/src/lib/format.ts`, `web/src/lib/rules.ts`
- Test: `web/src/lib/format.test.ts`, `web/src/lib/rules.test.ts`

**Interfaces:**
- Produces:
  - `type Zone = { name: string; price: number; left: number; color: string }`
  - `type EventItem = { id: string; name: string; short: string; category: string; startsAt: string /* ISO, +07:00 */; venue: string; poster: { bg: string; fg: string; accent: string; image?: string }; zones: Zone[]; soldPct: number }`
  - `type TicketStatus = 'active' | 'listed' | 'used'`
  - `type Ticket = { tid: number; eventId: string; zone: string; price: number; status: TicketStatus; transfers: number; tx: string; listPrice?: number }`
  - `type Listing = { lid: number; eventId: string; zone: string; face: number; price: number; seller: string; transfers: number; tid: number }`
  - `type Cart = { kind: 'event'; eventId: string; zoneIndex: number; qty: number } | { kind: 'listing'; lid: number }`
  - `type Order = { id: string; cart: Cart; status: 'pending' | 'minted'; tid?: number }`
  - `type User = { name: string; email: string; wallet: string }`
  - `type PurchaseQuote = { event: EventItem; zone: string; unit: number; qty: number; subtotal: number; fee: number; total: number; listing?: Listing }`
  - `type PurchaseLimit = { owned: number; maxQty: number; blocked: 'limit' | 'soldout' | null }`
  - `type ResaleQuote = { ok: true; price: number; fee: number; receive: number; cap: number } | { ok: false; cap: number }`
  - `type TicketPermissions = { showQr: boolean; canResell: boolean; canTransfer: boolean; canUnlist: boolean; canScan: boolean }`
  - `data.ts`: `EVENTS: EventItem[]` (4 events from `mockup/index.html:352-361`, `startsAt` from the date/time strings, poster palettes from the spec), `SEED_LISTINGS: Listing[]` (`mockup/index.html:371-373`), `DEMO_USER`, `CONTRACT`, `CATEGORIES = ['ทั้งหมด','คอนเสิร์ต','เทศกาล','แฟนมีตติ้ง','สแตนด์อัป']`, `FIRST_TOKEN_ID = 1311`, `eventById(id: string): EventItem | undefined`
  - `format.ts`: `baht(n: number): string`, `shortAddr(a: string): string`, `thaiDate(iso: string): string`, `thaiTime(iso: string): string`, `posterDate(iso: string): { day: string; month: string }`
  - `rules.ts` exports only the following. Fee, cap and window helpers stay private and are tested only through these.
    - `MAX_PER_EVENT = 4`, `MAX_TRANSFERS = 2` (for copy such as "N/2").
    - `quotePurchase(cart: Cart, listings: Listing[]): PurchaseQuote | null`. Uses the 3% `Math.round` service fee. Returns `null` for an unknown event, zone or listing.
    - `purchaseLimit(tickets: Ticket[], eventId: string, seatsLeft: number): PurchaseLimit`.
      - `owned` counts every ticket of that event, whatever its status.
      - `maxQty = max(0, min(4 − owned, seatsLeft))`.
      - `blocked` is `'soldout'` when `seatsLeft === 0`, else `'limit'` when `4 − owned <= 0`, else `null`.
    - `quoteResale(face: number, input: string): ResaleQuote`.
      - It parses `input.trim()`. Valid input is whole digits only, from 1 to the cap.
      - `cap = Math.floor(face × 1.2)`, `fee = Math.round(price × 0.05)`, `receive = price − fee`.
    - `ticketPermissions(t: Ticket): TicketPermissions`.
      - `showQr`, `canResell` and `canScan` are true only when `status === 'active'`.
      - `canTransfer` is true when `status === 'active'` and `transfers < 2`.
      - `canUnlist` is true when `status === 'listed'`.
    - `entryQr(tid: number, wallet: string, nowMs: number): { payload: string; secondsLeft: number }`. The window is `floor(nowMs / 60000)`. `payload` is `` `jongloei:v1:${tid}:${window}:${wallet.toLowerCase()}` ``. `secondsLeft` is `60 − floor((nowMs mod 60000) / 1000)`.
    - `searchEvents(events: EventItem[], q: string, cat: string): EventItem[]`, `minPrice(e: EventItem): number`.

- [ ] **Step 1: Write failing tests**

```ts
// format.test.ts
expect(baht(2500)).toBe('฿2,500');
expect(shortAddr('0x4B21c7aE90F3d18b52A6e4c0F7D93a1B2e8C5d07')).toBe('0x4B21…5d07');
expect(thaiDate('2026-11-21T19:00:00+07:00')).toBe('ส. 21 พ.ย. 2569');
expect(thaiTime('2026-11-21T19:00:00+07:00')).toBe('19:00');
expect(posterDate('2026-11-21T19:00:00+07:00')).toEqual({ day: '21', month: 'พ.ย.' });

// rules.test.ts — only through the exported interface
expect(quotePurchase({ kind: 'event', eventId: 'neon', zoneIndex: 0, qty: 1 }, SEED_LISTINGS))
  .toMatchObject({ zone: 'Standing A', unit: 2500, subtotal: 2500, fee: 75, total: 2575 });
expect(quotePurchase({ kind: 'event', eventId: 'neon', zoneIndex: 1, qty: 2 }, SEED_LISTINGS))
  .toMatchObject({ subtotal: 7600, fee: 228, total: 7828 });
expect(quotePurchase({ kind: 'listing', lid: 1 }, SEED_LISTINGS))
  .toMatchObject({ zone: 'Zone B', unit: 4600, qty: 1, fee: 138, total: 4738 });
expect(quotePurchase({ kind: 'listing', lid: 999 }, SEED_LISTINGS)).toBeNull();

expect(purchaseLimit([t('neon'), t('neon','used'), t('jazz')], 'neon', 182)).toEqual({ owned: 2, maxQty: 2, blocked: null });
expect(purchaseLimit(fourNeon, 'neon', 182)).toEqual({ owned: 4, maxQty: 0, blocked: 'limit' });
expect(purchaseLimit([], 'fan', 0)).toEqual({ owned: 0, maxQty: 0, blocked: 'soldout' });
expect(purchaseLimit([], 'neon', 2).maxQty).toBe(2);   // seats left caps quantity too

expect(quoteResale(2900, '3480')).toEqual({ ok: true, price: 3480, fee: 174, receive: 3306, cap: 3480 });
expect(quoteResale(4600, ' 4600 ')).toMatchObject({ ok: true, fee: 230, receive: 4370 });
expect(quoteResale(4150, '1')).toMatchObject({ ok: true, cap: 4980 });   // floor(4980.0)
for (const bad of ['', '0', '-1', '1000.5', '3481', 'abc', '1e3'])
  expect(quoteResale(2900, bad)).toEqual({ ok: false, cap: 3480 });

expect(ticketPermissions(active)).toEqual({ showQr: true, canResell: true, canTransfer: true, canUnlist: false, canScan: true });
expect(ticketPermissions({ ...active, transfers: 2 }).canTransfer).toBe(false);
expect(ticketPermissions({ ...active, status: 'listed' })).toEqual({ showQr: false, canResell: false, canTransfer: false, canUnlist: true, canScan: false });
expect(ticketPermissions({ ...active, status: 'used' })).toEqual({ showQr: false, canResell: false, canTransfer: false, canUnlist: false, canScan: false });

expect(entryQr(1311, '0xAbC', Date.UTC(2026,0,1,0,0,15))).toEqual({ payload: 'jongloei:v1:1311:29453760:0xabc', secondsLeft: 45 });

expect(searchEvents(EVENTS, 'เมืองทอง', 'ทั้งหมด').map(e => e.id)).toEqual(['neon', 'fan']);
expect(searchEvents(EVENTS, '', 'เทศกาล').map(e => e.id)).toEqual(['jazz']);
expect(searchEvents(EVENTS, 'JAZZ', 'คอนเสิร์ต')).toEqual([]);
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib` → FAIL (modules missing).

- [ ] **Step 3: Implement**

- Dates use `Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', … })`. The Buddhist year is the th-TH default.
- `searchEvents` lowercases, then matches `name + ' ' + venue + ' ' + category`, and filters by category unless it is `'ทั้งหมด'`.
- `quoteResale` validates with `/^\d+$/` before `Number()`, so `'1e3'` and `'1000.5'` are rejected.
- `quotePurchase` for a listing: `unit = listing.price`, `qty = 1`, `zone = listing.zone`, `event = eventById(listing.eventId)`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/lib` → PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib
git commit -m "feat(web): domain types, mock data and business rules"
```

---

### Task 3: App store (zustand + persist)

**Files:**
- Create: `web/src/lib/store.ts`
- Test: `web/src/lib/store.test.ts`

**Interfaces:**
- Consumes: Task 2 types, data and rules.
- Produces: `useApp` (zustand hook) with this state:
  - `signedIn: boolean`, `user: User`, `tickets: Ticket[]`, `listings: Listing[]`, `seatsLeft: Record<string, number[]>`, `nextTid: number`, `order: Order | null`, `afterSignIn: string | null`
- Actions:
  - `signIn(): void`, `signOut(): void`, `resetDemo(): void`, `setAfterSignIn(path: string | null): void`
  - `startOrder(cart: Cart): void`. Replaces any current order with a new `pending` one (`id = crypto.randomUUID()`).
  - `completeOrder(): Ticket | null`. Mints only when `order?.status === 'pending'`; otherwise it returns `null` and changes nothing. On success it sets `order.status = 'minted'` and `order.tid` (the first ticket of the order), and returns that ticket.
  - `listTicket(tid: number, priceInput: string): boolean`, `unlistTicket(tid: number): void`, `transferTicket(tid: number, to: string): boolean`, `checkIn(tid: number): void`. Each one validates through `ticketPermissions` / `quoteResale` and does nothing (returns `false`) when the rule forbids it.
- Also exports `initialState(): AppState` (for tests) and `useHydrated(): boolean` (true after the persist rehydration finishes).
- There is no `cart`, `cartKey`, `lastMinted` or `cartTotals` in the interface. Pages derive totals with `quotePurchase(order.cart, listings)`.

- [ ] **Step 1: Write failing tests** (`beforeEach(() => useApp.setState(initialState(), true))`)

```ts
test('completeOrder for an event order mints qty tickets, decrements seats, marks the order minted', () => {
  useApp.getState().startOrder({ kind: 'event', eventId: 'neon', zoneIndex: 0, qty: 2 });
  const t = useApp.getState().completeOrder()!;
  const s = useApp.getState();
  expect(s.tickets.map(x => x.tid)).toEqual([1312, 1311]);
  expect(t.tid).toBe(1311);                       // the first ticket of the order is shown
  expect(s.order).toMatchObject({ status: 'minted', tid: 1311 });
  expect(s.seatsLeft.neon[0]).toBe(180);
  expect(s.tickets[0]).toMatchObject({ zone: 'Standing A', price: 2500, status: 'active', transfers: 0 });
});
test('completeOrder is idempotent: a second call mints nothing', () => {
  useApp.getState().startOrder({ kind: 'event', eventId: 'neon', zoneIndex: 0, qty: 1 });
  useApp.getState().completeOrder();
  expect(useApp.getState().completeOrder()).toBeNull();
  expect(useApp.getState().tickets).toHaveLength(1);
});
test('completeOrder with no order returns null', () => { expect(useApp.getState().completeOrder()).toBeNull(); });
test('startOrder after a minted order starts a fresh pending order', () => { /* new id, status pending, tid undefined */ });
test('buying a listing moves it into tickets with transfers+1 and face price', () => {
  useApp.getState().startOrder({ kind: 'listing', lid: 1 });
  const t = useApp.getState().completeOrder()!;
  expect(t).toMatchObject({ tid: 1182, price: 4200, transfers: 2, status: 'active' });
  expect(useApp.getState().listings.find(l => l.lid === 1)).toBeUndefined();
});
test('listTicket("3480") → listed + listing with seller shortAddr; unlist reverses', () => { /* returns true; status, listPrice, listing.price */ });
test('listTicket with an invalid price returns false and changes nothing', () => { /* '99999', 'abc' */ });
test('transfer removes ticket; transfer of a used ticket returns false; checkIn sets used', () => { /* … */ });
test('resetDemo restores seeds, clears the order and signs out', () => { /* … */ });
test('order and afterSignIn are not persisted', () => { /* persist partialize output has no order/afterSignIn keys */ });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/store.test.ts` → FAIL.

- [ ] **Step 3: Implement** with `create(persist(…, { name: 'jongloei-web-v1', partialize: everything except order and afterSignIn }))`

- `completeOrder` reads the price from `quotePurchase`, so purchase prices live only in `rules.ts`.
- The mint `tx` is `'0x' + 4 hex + '…' + 4 hex`.
- `useHydrated` uses `useApp.persist.hasHydrated()` plus `onFinishHydration`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/lib` → PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/store.ts web/src/lib/store.test.ts
git commit -m "feat(web): persisted app store with purchase, resale and transfer actions"
```

---

### Task 4: UI primitives

**Files:**
- Create: `web/src/components/ui/{Button,StatusPill,Segmented,Sheet,ConfirmSheet,Toast,Field,Steps,QrCode,Icon}.tsx`
- Test: `web/src/components/ui/Sheet.test.tsx`, `web/src/components/ui/Steps.test.tsx`, `web/src/components/ui/Toast.test.tsx`, `web/src/components/ui/a11y.test.tsx` (Field, Icon, QrCode, ConfirmSheet)

**Interfaces:**
- Produces:
  - `Button(props: ButtonHTMLAttributes & { variant?: 'primary' | 'outline' | 'plain'; size?: 'md' | 'sm'; href?: string })`. With `href` it renders a `next/link`.
  - `StatusPill({ tone: 'ok' | 'warn' | 'neutral' | 'brand', children })`
  - `Segmented<T extends string>({ options: { value: T; label: string }[]; value: T; onChange(v: T): void; label: string })`. Renders `role="tablist"`. The selected and unselected options have the same `font-weight` (500); the selected one differs only in background and text colour.
  - `Sheet({ open, onClose, title, children })`. A native `<dialog>`, bottom-anchored below `desk` and centred at `desk`. Esc and backdrop click call `onClose`. Focus goes to the first focusable element.
  - `Toast` is a provider with `useToast(): (msg: string) => void`. One toast at a time, `role="status"`, auto-hides after 2600 ms.
  - `Field({ label, id, hint, error?: boolean, ...inputProps })`. The input is `text-base` (16 px). The hint has id `${id}-hint` and is the input's `aria-describedby`. When `error` is set, the input gets `aria-invalid="true"`.
  - `ConfirmSheet({ open, title, body, confirmLabel, onConfirm, onClose })`. It is built on `Sheet`, with a confirm button and a ยกเลิก (cancel) button.
  - `Steps({ items: { title: string; detail?: ReactNode }[]; intervalMs: number; onDone(): void })`. It advances one step per interval and calls `onDone` exactly once.
  - `QrCode({ value: string; size: number; label: string })`. Uses `qrcode.toCanvas` with dark `#1E1416` on white, which stays light in dark mode. The canvas has `role="img"`, `aria-label={label}` and `data-value={value}`.
  - `Icon({ name: 'home'|'swap'|'ticket'|'user'|'back'|'search'|'check'|'shield'|'wallet'|'copy' })`. Path data copied from `mockup/index.html:317-328`. Always renders `aria-hidden="true"` and `focusable="false"`.
  - `Button` is at least 44 px tall (`min-h-11`), and icon-only use requires an `aria-label` (TypeScript: `children` or `aria-label` required).
    - Press feedback: `active:scale-[0.97]` with `transition-[scale,background-color] duration-150 ease-out`.
    - The prop `static?: boolean` turns the press scale off. Use it on the 4 tab bar links and on full-width sticky CTAs inside scrolling lists.
  - `Sheet` has `aria-labelledby` pointing at its title. Focus returns to the element that opened it. The backdrop uses `overscroll-behavior: contain`.
    - Enter: 200 ms ease-out, `translateY(16px)` → 0 with opacity 0 → 1.
    - Exit: 150 ms ease-out, 0 → `translateY(8px)` with opacity 1 → 0.
    - On desktop (centred), the enter starts from `scale(0.98)` instead of a `translateY`.
    - The backdrop fades with opacity only.
    - Close waits for the exit to finish (`transitionend`, with a 200 ms fallback) before calling `dialog.close()`. With reduced motion it closes immediately.
  - `Toast`: the same as the Sheet exit (150 ms, `translateY(8px)` + opacity), so it no longer disappears all at once.
  - `Steps`: the done-marker change uses `transition-colors duration-200`; the check icon fades and scales from 0.8 to 1.

- [ ] **Step 1: Write failing tests**

```tsx
test('Sheet closes on Escape and on backdrop click, not on content click', async () => { /* onClose called 2× */ });
test('Steps calls onDone once after items.length intervals', () => {
  vi.useFakeTimers(); const done = vi.fn();
  render(<Steps items={[{title:'a'},{title:'b'},{title:'c'},{title:'d'}]} intervalMs={1100} onDone={done} />);
  vi.advanceTimersByTime(4399); expect(done).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1); expect(done).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(5000); expect(done).toHaveBeenCalledTimes(1);
});
test('Steps unmounted early never calls onDone', () => { /* unmount at 2000ms, advance 5000 → 0 calls */ });
test('Toast replaces previous message and hides after 2600ms', () => { /* … */ });
test('Sheet is labelled by its title and returns focus to the opener on close', async () => { /* getByRole('dialog', { name: title }); after Esc, opener has focus */ });
test('Field with error sets aria-invalid and aria-describedby to the hint', () => { /* … */ });
test('Icon is hidden from assistive tech', () => { /* svg has aria-hidden="true" */ });
test('QrCode exposes role img with label and data-value', () => { /* … */ });
test('ConfirmSheet calls onConfirm only from the confirm button', async () => { /* ยกเลิก → onClose, no onConfirm */ });
test('Sheet stays mounted during the exit and closes after 200ms fallback', () => { /* fake timers: after Esc, dialog still open at 100ms, closed at 200ms */ });
test('no component uses raw z-index numbers', () => {
  // same raw-source scan as the transition test: no /\bz-\[\d+\]|z-index:\s*\d/ outside globals.css
});
test('no component uses transition-all', () => {
  // read every src/components/**/*.tsx with fs + import.meta.glob('?raw'); expect none to match /\btransition(-all)?\b(?![-\[])/
});
```

jsdom lacks `HTMLDialogElement.showModal`. Polyfill `showModal`/`close` in `src/test/setup.ts`.

Unit tests check behaviour through each component's interface (roles, labels, callbacks). Visual rules (press scale, equal font weights, outlines, fixed widths) are checked by computed style in the browser, in Task 11's `polish.spec.ts`, not by asserting class names. The two source-scan tests above stay, because they enforce project-wide rules rather than one module's internals.

- [ ] **Step 2: Run them to see them fail** → `npx vitest run src/components/ui` FAIL.

- [ ] **Step 3: Implement** the primitives per the spec's visual rules: radius `rounded-md`/`rounded-lg` only, a border or a shadow, motion only in Sheet, Toast and Steps.

- [ ] **Step 4: Run the tests to see them pass** → PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ui web/src/test/setup.ts
git commit -m "feat(web): UI primitives (button, sheet, toast, steps, QR)"
```

---

### Task 5: App shell and sign-in

**Files:**
- Create: `web/src/components/shell/{AppShell,AppBar,TabBar,DesktopNav,SearchBox}.tsx`, `web/src/components/auth/{SignInSheet,WalletSetupSheet,GoogleMark}.tsx`
- Modify: `web/src/app/layout.tsx` (wrap children in `AppShell` + `ToastProvider`)
- Test: `web/src/components/shell/AppShell.test.tsx`, `web/src/components/auth/SignInSheet.test.tsx`

**Interfaces:**
- Consumes: `useApp`, `useHydrated`, `Sheet`, `Steps`, `Button`, `Icon`, `useToast`.
- Produces:
  - `useSignIn(): (after?: string) => void` (exported from `AppShell.tsx`). It opens the sign-in sheet and stores `afterSignIn`.
  - `AppBar({ title?: string; back?: boolean })`, rendered by each page.
  - `SearchBox` is a `<form role="search">` with an input labelled `aria-label="ค้นหางาน ศิลปิน สถานที่"` (search events, artists, venues), `type="search"` and `text-base`. Typing on `/` updates `?q=` with `router.replace` (no history spam). Enter on another page does `router.push('/?q=…')`. The wrapper shows the focus ring with `focus-within:`.
  - `AppBar` renders its title as the page `<h1>`. On desktop, pages that have no app-bar title render their own `<h1>`.
  - The back button's chevron is optically centred: shift it −1 px on x (`-translate-x-px`), because the chevron's visual weight sits right of its box centre.
  - The wallet chip count uses `tabular-nums`.
  - `TabBar` links are `<a>` elements (`next/link`) with `aria-current="page"` on the current tab, each at least 44 px tall. Every tab label uses the same weight (500). The current tab is shown by `text-red` plus a 2 px indicator bar, not by bolder text. The app bar, tab bar and sticky CTA use `z-sticky`.
  - `AppShell` renders a skip link "ข้ามไปเนื้อหา" (skip to content) as the first focusable element. It is visible only on focus, uses `z-skip`, and points to `<main id="main">`.

Shell behaviour:
- **Phone (below `desk`):**
  - The app bar shows the logo or a back button, plus the title.
  - On the right is a wallet chip ("N ตั๋ว", counting tickets whose status isn't `used`) or "เข้าสู่ระบบ" (sign in).
  - The bottom `TabBar` has 4 tabs: หน้าแรก (home), ตลาดรีเซล (resale market), ตั๋วของฉัน (my tickets), บัญชี (account).
  - The tab bar is hidden on `/checkout/*`.
- **Desktop (`desk` and up):** the wordmark JONGLOEI, `DesktopNav` (3 links, no บัญชี), `SearchBox`, the wallet chip, and an avatar initial linking to `/profile/`.
- **Sign-in:**
  - The sheet copy comes from `mockup/index.html:752-756` and uses `GoogleMark`.
  - "Google" and "OTP" both open `WalletSetupSheet`: 3 steps at 900 ms, then the button "เริ่มใช้งาน" (start). Pressing it calls `signIn()`, shows the toast "สร้างกระเป๋าตั๋วเรียบร้อย" (ticket wallet created), and pushes `afterSignIn` if set.
  - "มี wallet อยู่แล้ว?" (already have a wallet?) shows the toast "การเชื่อมต่อ wallet เดิมอยู่ในแผนพัฒนาถัดไป" (connecting an existing wallet is planned for later).

- [ ] **Step 1: Write failing tests**

```tsx
test('tab bar marks the current tab and hides on /checkout', () => { /* setPathname('/market/') → aria-current on ตลาดรีเซล; setPathname('/checkout/pay/') → no tablist nav */ });
test('wallet chip counts non-used tickets', () => { /* 2 active + 1 used → "2 ตั๋ว" */ });
test('sign-in → wallet setup → เริ่มใช้งาน signs in and routes to afterSignIn', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // open via useSignIn('/checkout/'), click "ดำเนินการต่อด้วย Google", advance 2700ms, click "เริ่มใช้งาน"
  expect(useApp.getState().signedIn).toBe(true);
  expect(mockRouter.push).toHaveBeenCalledWith('/checkout/');
});
test('shell renders signed-out chrome until hydrated', () => { /* persisted signedIn=true but hydrated=false → shows เข้าสู่ระบบ */ });
test('search is a labelled search form; Enter on /tickets/ pushes /?q=jazz', async () => { /* getByRole('search'); getByRole('searchbox', { name: 'ค้นหางาน ศิลปิน สถานที่' }) */ });
test('app bar title is the single h1', () => { /* getAllByRole('heading', { level: 1 }) has length 1 */ });
test('wordmark is marked translate="no"', () => { /* … */ });
```

- [ ] **Step 2: Run them to see them fail** → FAIL.

- [ ] **Step 3: Implement.** Responsive switching is CSS only (`hidden desk:flex` and so on), with no JS width checks, so the static HTML matches on every screen size.

- [ ] **Step 4: Run the tests to see them pass** → PASS. Then `npm run build` → OK.

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "feat(web): responsive app shell and demo sign-in with wallet setup"
```

---

### Task 6: Home, Poster and event cards

> **Revised by Design Revision 1 (R1, R4).** The home layout is now: hero banner, search and filter bar, image cards. A new `/search/` route is added, and `filterEvents` replaces `searchEvents`. Where this task body conflicts with R1, R1 wins. The body is rewritten once the [OPEN] items are confirmed.

**Files:**
- Create: `web/src/components/event/{Poster,EventCard,FeaturedEvent}.tsx`
- Modify: `web/src/app/page.tsx` (replace the placeholder; delete `smoke.test.tsx`)
- Test: `web/src/app/home.test.tsx`, `web/src/components/event/Poster.test.tsx`

**Interfaces:**
- Consumes: `EVENTS`, `CATEGORIES`, `searchEvents`, `minPrice`, `posterDate`, `thaiDate`, `thaiTime`, `baht`, `StatusPill`.
- Produces:
  - `Poster({ event: EventItem; size: 'sm' | 'md' | 'lg' })`. It sets `--p-bg`, `--p-fg` and `--p-accent` as inline CSS variables (the only allowed `style`). It shows the date block, the category text and `short` as the title. There is no gradient and no stripes. The root element carries `data-poster`, which Task 11's polish check uses.
    - It carries a 1 px inset outline, `outline outline-1 -outline-offset-1 outline-black/[0.07]` (dark mode: `outline-white/[0.08]`). Without it, the light posters (fan `#F7D6E0`, standup `#F2E8D5`) would blend into `--bg` `#F6F3F3`.
    - Radius follows the concentric rule: `rounded-lg` when standalone, and `outer − padding` inside `EventCard` and `TicketRow`.
  - `EventCard({ event })` links to `/events/{id}/`. `FeaturedEvent({ event })`.

The home page reads `q` from `useSearchParams` (wrapped in `Suspense`) and holds the category in local state. The chip row scrolls horizontally with its scrollbar hidden. Each chip's `onFocus` calls `scrollIntoView({ block: 'nearest', inline: 'nearest' })`, so keyboard focus never lands off-screen. Arrow keys move between chips, following the radiogroup pattern.
- Featured is `EVENTS[0]` and appears only when no filter is active.
- The heading is "งานที่กำลังเปิดขาย" (events on sale) or "พบ N งาน" (N events found), with "ล้างตัวกรอง" (clear filters).
- The empty state reads "ไม่พบงานที่ตรงกับการค้นหา ลองใช้คำอื่น" (no events match; try another term).
- The card status pill is "ใกล้เต็ม" (almost full) when `soldPct >= 95`. Otherwise the card shows no pill.

- [ ] **Step 1: Write failing tests**

```tsx
test('home lists featured + other 3 events when unfiltered', () => { /* 'BKK Neon Nights 2026' once, 3 EventCards */ });
test('?q=jazz shows "พบ 1 งาน" and only River Jazz', () => { setSearchParams('q=jazz'); /* … */ });
test('category chip filters and ล้างตัวกรอง resets', async () => { /* … */ });
test('category chips are a radiogroup with aria-checked on the active chip', () => { /* … */ });
test('focusing a chip scrolls it into view', async () => { /* spy Element.prototype.scrollIntoView; tab to last chip → called with { block: 'nearest', inline: 'nearest' } */ });
test('event cards are links to /events/{id}/', () => { /* getByRole('link', { name: /Late Night Stand-up Special/ }) has href '/events/standup/' */ });
test('Starlight card shows ใกล้เต็ม pill; Neon card shows no "ตั๋ว NFT" pill', () => { /* … */ });
test('Poster has no gradient background and exposes palette vars', () => {
  const { container } = render(<Poster event={eventById('jazz')!} size="md" />);
  const el = container.firstElementChild as HTMLElement;
  expect(el.style.getPropertyValue('--p-bg')).toBe('#0F5257');
  expect(el.outerHTML).not.toMatch(/gradient/);
});
```

- [ ] **Step 2: Run them to see them fail** → FAIL.
- [ ] **Step 3: Implement.** Phone: a list of cards. Desktop: the featured event in 2 columns and a 3-column grid.
- [ ] **Step 4: Run the tests to see them pass** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(web): home with search, categories and flat-palette posters"`

---

### Task 7: Event detail

> **Revised by Design Revision 1 (R2, R4).** Changes: a 2 × 2 borderless trust grid with a conditions sheet; checkbox-style zone rows (red 2 px border and check, no background change); a bottom purchase panel with two equal halves. Where this task body conflicts with R2, R2 wins.

**Files:**
- Create: `web/src/app/events/[id]/page.tsx`, `web/src/app/events/[id]/EventView.tsx`, `web/src/components/event/{ZonePicker,QtyStepper}.tsx`
- Test: `web/src/app/events/[id]/EventView.test.tsx`

**Interfaces:**
- Consumes: `useApp` (`tickets`, `seatsLeft`, `signedIn`, `startOrder`), `purchaseLimit`, `quotePurchase` (for the total), `useSignIn`, `Poster`.
  - The button label, the stepper's maximum and the helper text all come from one `purchaseLimit(tickets, id, seatsLeft[id][zoneIndex])` call. No limit arithmetic in the component.
- Produces: the server `page.tsx` exports `generateStaticParams()` → `EVENTS.map(e => ({ id: e.id }))` and renders the client component `<EventView id={id} />`.

Content:
- The poster `lg`, the name, the date, the time ("น." suffix), and the venue.
- A plain resale-conditions block whose text is verbatim from `mockup/index.html:488`. It replaces the trust tiles.
- A sold-% bar and the zone list. A sold-out zone reads "ขายหมดแล้ว · ดูในตลาดรีเซล" (sold out, see the resale market) and is disabled.
- The link "บางโซนขายหมดแล้ว ดูตั๋วรีเซลของงานนี้" (some zones are sold out; see resale tickets for this event) goes to `/market/?event={id}`.

Quantity and buy button:
- The stepper is clamped to `[1, max(1, limit.maxQty)]`.
- The helper text reads "คุณมีตั๋วงานนี้แล้ว N ใบ · ซื้อได้อีก M ใบ" (you already hold N tickets for this event; you can buy M more).
- The total is shown next to the buy button.
- The button label maps `limit.blocked`: `null` → "ซื้อตั๋ว" (buy tickets), `'limit'` → "ครบ 4 ใบต่อบัญชีแล้ว" (4-per-account limit reached), `'soldout'` → "โซนนี้ขายหมด" (this zone is sold out).
- Buy calls `startOrder({kind:'event',…})`. If signed in it then routes to `/checkout/`; otherwise it calls `useSignIn('/checkout/')`.
- The initially selected zone is the first one with seats left.

- [ ] **Step 1: Write failing tests**

```tsx
test('fan meeting preselects Zone B (Zone C sold out) and disables Zone C', () => { /* … */ });
test('qty stepper caps at allowance (user holds 3 neon → max 1, "ซื้อได้อีก 1 ใบ")', async () => { /* … */ });
test('holding 4 neon disables buy with "ครบ 4 ใบต่อบัญชีแล้ว"', () => { /* … */ });
test('buy signed-in starts a pending order and pushes /checkout/', async () => { /* useApp.getState().order matches { status: 'pending', cart: { kind: 'event', eventId: 'neon' } } */ });
test('buy signed-out opens sign-in sheet', async () => { /* expect dialog "เข้าสู่ระบบ JongLoei" */ });
test('total shows ฿7,600 for Seat B × 2', async () => { /* … */ });
test('zones are a radiogroup; selected zone has aria-checked, sold-out is aria-disabled', () => { /* … */ });
test('qty buttons have aria-labels ลด / เพิ่ม and the count is announced', () => { /* count in an element with aria-live="polite" */ });
```

- [ ] **Step 2: Run them to see them fail** → FAIL.
- [ ] **Step 3: Implement.** Desktop: 2 columns (1.45fr / 1fr), with the zone panel sticky. Phone: a sticky bottom CTA.
- [ ] **Step 4: Run the tests to see them pass**, then `npm run build`. `out/events/neon/index.html` exists.
- [ ] **Step 5: Commit** `git commit -m "feat(web): event detail with zones, quantity limit and buy"`

---

### Task 8: Checkout flow (checkout → pay → minting → success)

**Files:**
- Create: `web/src/app/checkout/page.tsx`, `web/src/app/checkout/pay/page.tsx`, `web/src/app/checkout/minting/page.tsx`, `web/src/app/checkout/success/page.tsx`, `web/src/components/ticket/TicketCard.tsx`, `web/src/app/checkout/useOrderGuard.ts`
- Test: `web/src/app/checkout/checkout.test.tsx`

**Interfaces:**
- Consumes: `useApp` (`order`, `listings`, `tickets`, `completeOrder`), `quotePurchase`, `useHydrated`, `QrCode`, `Steps`, `shortAddr`, `CONTRACT`.
- Produces:
  - `useOrderGuard(stage: 'pay' | 'success'): { order: Order; quote: PurchaseQuote | null } | null`. It is the only place that decides where a checkout page sends you. After hydration:
    - `stage 'pay'` (used by `/checkout/`, `/checkout/pay/`, `/checkout/minting/`):
      - no order → `replace('/')`;
      - a `minted` order → `replace('/checkout/success/')`;
      - a `pending` order → stay.
    - `stage 'success'`:
      - no order or a `pending` order → `replace('/tickets/')`;
      - a `minted` order → stay.
    - It returns `null` while redirecting or before hydration.
  - `TicketCard({ ticket: Ticket; full?: boolean })` is the NFT stub card, reused in Task 9. Its rows: วันที่ (date), โซน (zone), ราคาหน้าบัตร (face price), เจ้าของ (owner). With `full` it adds: สัญญา (contract), ธุรกรรม mint (mint tx), เครือข่าย (network), โอนแล้ว N/2 ครั้ง (transferred N of 2 times), and history.
  - "ERC-721" and "JONGLOEI #tid" are plain text, not pills.

Screens:
- **Checkout:** copy from `mockup/index.html:518-537`. The summary shows ราคาบัตร (ticket price), ค่าบริการ 3% (service fee), ค่าแก๊ส "ฟรี ระบบออกให้" (gas: free, covered by us), and ยอดชำระ (amount due). A resale ticket shows "ตั๋วรีเซล · Token #tid" as muted text. The button reads "ชำระ ฿X ด้วย PromptPay" (pay ฿X with PromptPay) and goes to `/checkout/pay/`.
- **Pay:**
  - The QR value is `promptpay-demo:{total}:{Date.now()}` and the countdown starts at 09:59.
  - At 0 the page shows "หมดอายุ" (expired) and swaps the simulate button for "สร้าง QR ใหม่" (make a new QR), which regenerates the QR and resets the countdown.
  - The countdown element is `tabular-nums` with a fixed `min-w-[6ch] text-end`, so swapping "09:59" for "หมดอายุ" doesn't move the card's layout.
  - "จำลองว่าชำระเงินแล้ว" (simulate paid) does `router.replace('/checkout/minting/')`. ยกเลิก (cancel) does `router.back()`.
- **Minting:** 4 steps at 1100 ms (copy from `mockup/index.html:568-571`). The "ต่อในอนาคต: Payment Gateway" (future: Payment Gateway) note is plain muted text. `onDone` calls `completeOrder()` and then `router.replace('/checkout/success/')`. The page holds no keys or refs for idempotency, because the store owns that.
- **Success:** `useOrderGuard('success')`. It shows the `TicketCard` for `order.tid` first, then "ตั๋วอยู่ในกระเป๋าของคุณแล้ว" (the ticket is in your wallet), the buttons "ดูตั๋วและ QR เข้างาน" (view ticket and entry QR, linking to `/tickets/view/?id=tid`) and "กลับหน้าแรก" (back to home).

- [ ] **Step 1: Write failing tests**

```tsx
test('checkout without an order redirects to /', () => { /* hydrated, order null → mockRouter.replace('/') */ });
test('minting page with a minted order (Back after success) goes forward to success and mints nothing', () => { /* order minted, render MintingPage, advance 5000 → tickets length unchanged; replace('/checkout/success/') */ });
test('success with a pending order redirects to /tickets/', () => { /* … */ });
test('checkout totals for neon Standing A ×1: ฿2,500 / ฿75 / ฿2,575', () => { /* … */ });
test('pay countdown expires at 10:00 and offers สร้าง QR ใหม่', () => { /* fake timers advance 599_000 */ });
test('minting completes once under StrictMode and routes to success', () => {
  vi.useFakeTimers();
  render(<StrictMode><MintingPage /></StrictMode>);
  vi.advanceTimersByTime(4400 * 2);
  expect(useApp.getState().tickets).toHaveLength(1);
  expect(mockRouter.replace).toHaveBeenCalledWith('/checkout/success/');
});
test('leaving minting before done creates no ticket', () => { /* unmount at 2000ms → tickets [] */ });
test('success with no order redirects to /tickets/', () => { /* … */ });
test('payment methods are a radiogroup: PromptPay checked, card and USDC aria-disabled', () => { /* … */ });
```

- [ ] **Step 2: Run them to see them fail** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests to see them pass** → PASS. Then `npm run build` → OK.
- [ ] **Step 5: Commit** `git commit -m "feat(web): checkout, PromptPay QR, mint progress and success"`

---

### Task 9: My tickets and ticket view (entry QR, resell, transfer, scan)

**Files:**
- Create: `web/src/app/tickets/page.tsx`, `web/src/app/tickets/view/page.tsx`, `web/src/app/tickets/view/TicketView.tsx`, `web/src/components/ticket/{TicketRow,EntryQr,ResellSheet,TransferSheet}.tsx`
- Test: `web/src/app/tickets/tickets.test.tsx`, `web/src/components/ticket/ResellSheet.test.tsx`, `web/src/components/ticket/EntryQr.test.tsx`

**Interfaces:**
- Consumes: `useApp` actions (`listTicket`, `unlistTicket`, `transferTicket`, `checkIn`), `entryQr`, `quoteResale`, `ticketPermissions`, `TicketCard`, `Segmented`, `Sheet`, `Field`, `useToast`, `useSignIn`.
  - `TicketView` reads every button state and the QR/locked/listed choice from one `ticketPermissions(ticket)` call. No status checks in the component.
  - `ResellSheet` passes the raw input string to `quoteResale(face, input)` and renders `fee`/`receive`, or "—" when `ok` is false. It does no parsing or arithmetic itself.
- Produces: `EntryQr({ tid: number; wallet: string })`. It re-renders every second and shows `entryQr(tid, wallet, Date.now())`. A ring and "QR ใหม่ใน N วินาที" (new QR in N seconds) show the seconds left. Tests drive time with `vi.useFakeTimers()` + `vi.setSystemTime()`, so there is no clock prop. A clock seam would have only one adapter.

Screens:
- **`/tickets/`:**
  - Signed out, it shows "เข้าสู่ระบบเพื่อดูตั๋วของคุณ" (sign in to see your tickets) and a sign-in button.
  - Signed in, it shows a `Segmented` control with ใช้งานได้ (N) (usable), ลงขายอยู่ (N) (listed) and ใช้แล้ว (N) (used). Each `TicketRow` has a status pill: พร้อมใช้ (ready), the price for a listed ticket, or เข้างานแล้ว (entered).
  - The empty states and the footer note are copied from `mockup/index.html:596-597`.
- **`/tickets/view/?id=`:**
  - It reads `id` via `useSearchParams` inside `Suspense`. An unknown id shows "ไม่พบตั๋วใบนี้" (ticket not found) and a link to `/tickets/`.
  - On phone, a segmented switch toggles QR เข้างาน (entry QR) and ข้อมูล NFT (NFT info). On desktop both columns show and the switch is hidden.
  - A listed ticket shows the listed message instead of the QR. A used ticket shows the locked message (copy from `mockup/index.html:608`).
  - Buttons: ขายต่อ (resell), โอนให้เพื่อน (transfer to a friend), ยกเลิกการลงขาย (cancel the listing, only when listed), and "จำลอง: เจ้าหน้าที่สแกนหน้างาน" (simulate: staff scan at the gate). They are disabled or hidden per `ticketPermissions` (`canResell`, `canTransfer`, `canUnlist`, `canScan`). Scanning calls `checkIn` and shows the toast "สแกนผ่าน เข้างานได้ ตั๋วถูกล็อกแล้ว" (scan OK, entry allowed, ticket locked).
- **ResellSheet:**
  - The price input starts at face value. The hint shows the cap at 120%.
  - The input is `type="text" inputMode="numeric" pattern="[0-9]*"`, never `type="number"`. Its raw string goes straight to `quoteResale`, which owns parsing and validation.
  - Both the fee (5%) and "คุณจะได้รับ" (you will receive) update live.
  - An invalid price shows the error hint "ตั้งราคาได้ระหว่าง ฿1 ถึง ฿cap เพื่อป้องกันการโก่งราคา" (set a price between ฿1 and ฿cap to prevent price gouging) and disables "ลงขายในตลาดรีเซล" (list on the resale market).
  - On success: the toast "ลงขายแล้ว ดูได้ในตลาดรีเซล" (listed; see it in the resale market).
- **ResellSheet form:** it is a `<form>`, so Enter submits when the price is valid. An invalid price sets `aria-invalid`, and the hint is linked through `aria-describedby` (`Field`).
- **TransferSheet:**
  - The input has no prefilled value; its placeholder is copied from the mock-up.
  - The input is `type="text"`, `inputMode="email"`, `autoComplete="off"`, `text-base`.
  - It is a `<form>`, so Enter submits.
  - Submitting empty shows the error "กรอกอีเมลหรือเบอร์โทรของเพื่อน" (enter your friend's email or phone number) through `Field`'s `error`. There is no silent refocus.
  - On confirm it calls `transferTicket`, shows the toast "โอน Token #tid ให้ {to} แล้ว" (Token #tid transferred to {to}), and routes to `/tickets/`.

- [ ] **Step 1: Write failing tests**

```tsx
test('EntryQr shows seconds left and changes payload at the minute boundary', () => {
  vi.useFakeTimers(); vi.setSystemTime(Date.UTC(2026,0,1,0,0,58));
  // render, expect "QR ใหม่ใน 2 วินาที"; read canvas data-value attr (QrCode sets data-value) A
  act(() => vi.advanceTimersByTime(2000));
  // expect "QR ใหม่ใน 60 วินาที" and data-value !== A
});
test.each(['', '0', '-5', '1000.5', '3481', 'abc'])('resell price %s disables listing and shows error', async v => { /* face 2900 */ });
test('resell 3480 lists the ticket and shows fee ฿174 / receive ฿3,306', async () => { /* … */ });
test('view ?id=9999 shows ไม่พบตั๋วใบนี้', () => { /* … */ });
test('listed ticket hides QR and offers ยกเลิกการลงขาย', () => { /* … */ });
test('scan marks used and disables resell + transfer', async () => { /* … */ });
test('tickets tabs show counts and filter', async () => { /* … */ });
test('resell submits on Enter with a valid price', async () => { /* type 3000{Enter} → status listed */ });
test('resell price is a text input with numeric keyboard, and wheel does not change it', async () => {
  // input has type="text", inputMode="numeric"; fireEvent.wheel(input, { deltaY: -100 }) → value unchanged
});
test('transfer: empty submit shows error with aria-invalid; Enter with value transfers', async () => { /* … */ });
test('transfer input starts empty', () => { /* toHaveValue('') */ });
test('ticket rows are links to /tickets/view/?id=…; Token # text has translate="no"', () => { /* … */ });
```

- [ ] **Step 2: Run them to see them fail** → FAIL.
- [ ] **Step 3: Implement.** `QrCode` exposes `data-value={value}` on its canvas so tests can read the payload.
- [ ] **Step 4: Run the tests to see them pass** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(web): my tickets, rotating entry QR, resell and transfer"`

---

### Task 10: Resale market and profile

> **Revised by Design Revision 1 (R3).** Changes: a horizontal listing card with the image on the left and the price block top right (red above face, green below face, ink when equal); seller, token and verification details move into an info sheet; the notice becomes a collapsible, dismissible red-bordered alert; the market gets the same search and filter bar as home. Where this task body conflicts with R3, R3 wins.

**Files:**
- Create: `web/src/app/market/page.tsx`, `web/src/components/market/ListingCard.tsx`, `web/src/app/profile/page.tsx`
- Test: `web/src/app/market/market.test.tsx`, `web/src/app/profile/profile.test.tsx`

**Interfaces:**
- Consumes: `useApp` (`listings`, `startOrder`, `signedIn`, `user`, `tickets`, `signOut`, `resetDemo`), `useSignIn`, `shortAddr`, `baht`, `useToast`, `ConfirmSheet`.

Screens:
- **Market:**
  - The intro block "ตั๋วมือสองที่ตรวจสอบได้ทุกใบ" (every resale ticket is verifiable) is copied from `mockup/index.html:631` without the shield icon tile.
  - Event chips read `?event=` and show `short` with the newline replaced by a space.
  - Each `ListingCard` shows the price, the struck-through face value, the "+N%" or "ราคาหน้าบัตร" (face price) label, the seller address, and "โอนมาแล้ว N/2 ครั้ง" (transferred N of 2 times) as muted text. "ยืนยันเจ้าของบนเชน" (owner verified on-chain) is plain text.
  - The user's own listing (`seller === shortAddr(user.wallet)`) shows "ตั๋วของคุณ" (your ticket) instead of the "ซื้อเลย" (buy now) button.
  - "ซื้อเลย" calls `startOrder({ kind: 'listing', lid })`, then goes to `/checkout/` or to sign-in.
  - The empty states are copied from `mockup/index.html:643`.
- **Profile:**
  - Signed out, it shows "ยังไม่ได้เข้าสู่ระบบ" (not signed in) and a sign-in button.
  - Signed in, it shows:
    - the initial avatar, the name, and the email with "เข้าสู่ระบบด้วย Google" (signed in with Google);
    - the wallet address with a copy button (`navigator.clipboard.writeText`; toast "คัดลอกที่อยู่ wallet แล้ว" (wallet address copied) or the fallback toast);
      - After a successful copy, the icon swaps from `copy` to `check` for 1500 ms. The swap cross-fades both icons in place: `opacity`, `scale` 0.8 → 1 and `blur` 2px → 0, over 150 ms ease-out. The button's `aria-label` changes to "คัดลอกแล้ว" (copied) for the same time.
      - The address sits in a rounded box inside the card, so it follows the concentric rule (card `rounded-lg` with 8 px padding gives a `rounded-sm` box).
    - the kv rows from `mockup/index.html:655`;
    - the connect-wallet block, whose toast reads "ฟีเจอร์นี้อยู่ในแผนพัฒนาถัดไป" (this feature is planned for later);
    - ออกจากระบบ (log out: `signOut`, then `/`);
    - ล้างข้อมูลเดโมทั้งหมด (clear all demo data). It first opens a `ConfirmSheet`:
      - Title: "ล้างข้อมูลเดโมทั้งหมด?" (clear all demo data?)
      - Body: "ตั๋วและรายการขายที่คุณสร้างจะหายทั้งหมด" (all tickets and listings you created will be gone)
      - Confirm button: "ล้างข้อมูล" (clear data)
      - Confirming runs `resetDemo`, then goes to `/`.
  - Wallet address and seller addresses have `translate="no"`.

- [ ] **Step 1: Write failing tests**

```tsx
test('market shows 3 seed listings; ?event=fan shows 2', () => { /* … */ });
test('listing +10% label for 4600 over 4200, ราคาหน้าบัตร for equal', () => { /* … */ });
test('own listing shows ตั๋วของคุณ and no ซื้อเลย', () => { /* … */ });
test('ซื้อเลย signed in starts a pending listing order and pushes /checkout/', async () => { /* … */ });
test('profile copy writes the full wallet to clipboard', async () => { /* … */ });
test('reset demo asks for confirmation; ยกเลิก keeps data', async () => { /* tickets unchanged */ });
test('reset demo confirmed restores seed listings and signs out', async () => { /* … */ });
test('wallet address has translate="no"', () => { /* … */ });
test('copy swaps the icon to check and the label to คัดลอกแล้ว for 1500ms', async () => { /* fake timers; back to คัดลอก after 1500ms */ });
```

- [ ] **Step 2: Run them to see them fail** → FAIL.
- [ ] **Step 3: Implement.** Desktop: listings in a 3-column grid, and the profile in 2 columns.
- [ ] **Step 4: Run the tests to see them pass**, then `npm test` (full suite) → all PASS, and `npm run build` → OK.
- [ ] **Step 5: Commit** `git commit -m "feat(web): resale market and profile"`

---

### Task 11: End-to-end smoke test, layout checks and handoff docs

**Files:**
- Create: `web/playwright.config.ts`, `web/e2e/flow.spec.ts`, `web/e2e/layout.spec.ts`, `web/e2e/a11y.spec.ts`, `web/e2e/polish.spec.ts`, `web/README.md` (dev dep: `@axe-core/playwright`)
- Modify: `web/package.json` (add `"serve": "npx serve@14 out -l 4173"` and `"e2e": "playwright test"`)

**Interfaces:**
- Consumes: the built `out/`. Playwright's `webServer` runs `npm run build && npm run serve` on port 4173. Projects: `phone` (375×812), `narrow` (320×640), `desktop` (1280×800).

- [ ] **Step 1: Write the e2e specs**

```ts
// flow.spec.ts — phone + desktop
test('buy → mint → ticket QR → resell → appears in market', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Late Night Stand-up Special').click();
  await page.getByRole('button', { name: 'ซื้อตั๋ว' }).click();
  await page.getByRole('button', { name: 'ดำเนินการต่อด้วย Google' }).click();
  await page.getByRole('button', { name: 'เริ่มใช้งาน' }).click();
  await page.getByRole('button', { name: /ชำระ ฿1,545 ด้วย PromptPay/ }).click();
  await page.getByRole('button', { name: 'จำลองว่าชำระเงินแล้ว' }).click();
  await expect(page.getByText('ตั๋วอยู่ในกระเป๋าของคุณแล้ว')).toBeVisible({ timeout: 8000 });
  await page.getByRole('link', { name: 'ดูตั๋วและ QR เข้างาน' }).click();
  await expect(page.locator('canvas[data-value^="jongloei:v1:1311:"]')).toBeVisible();
  await page.goBack(); await page.goBack();                 // back through success → no re-mint
  await page.goto('/tickets/');
  await expect(page.getByText('Token #1311')).toHaveCount(1);
  // resell at 1800 → market shows ฿1,800 with ตั๋วของคุณ
});
test('reload keeps tickets (persisted)', async ({ page }) => { /* … */ });

// layout.spec.ts — all projects
for (const path of ['/', '/events/fan/', '/market/', '/tickets/', '/profile/'])
  test(`no horizontal scroll on ${path}`, async ({ page }) => {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
test('no hydration errors in console', async ({ page }) => { /* collect console errors on / and /tickets/ after seeding localStorage */ });

// a11y.spec.ts — phone + desktop, pages: / /events/fan/ /checkout/ (with cart) /tickets/ /tickets/view/?id=… /market/ /profile/
test('no serious or critical axe violations', async ({ page }) => {
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations.filter(v => ['serious', 'critical'].includes(v.impact!))).toEqual([]);
});
test('every visible button and link is at least 44×44', async ({ page }) => { /* boundingBox of each [role=button],button,a:visible ≥ 44 (inline text links inside paragraphs excluded) */ });
test('every input computes font-size ≥ 16px', async ({ page }) => { /* … */ });
test('keyboard: Tab reaches the buy button on /events/neon/ and shows a focus ring', async ({ page }) => { /* outline-width ≠ 0px on :focus-visible */ });
test('theme-color meta exists for light and dark', async ({ page }) => { /* 2 meta[name=theme-color] */ });

// polish.spec.ts — visual rules checked by computed style (moved out of unit tests)
test('tab bar: current and other tabs have the same font-weight', async ({ page }) => { /* phone; getComputedStyle(...).fontWeight equal for all 4 links on /market/ */ });
test('tickets segmented control: selected and unselected tabs have the same font-weight', async ({ page }) => { /* seeded tickets */ });
test('button press scales to ~0.97', async ({ page }) => {
  // /events/neon/: hover "ซื้อตั๋ว", page.mouse.down(), wait 200ms, read getComputedStyle(btn).scale (or transform matrix a) ≈ 0.97, mouse.up()
});
test('posters draw a 1px outline', async ({ page }) => { /* every [data-poster] has outlineWidth '1px' and outlineStyle 'solid' */ });
test('pay countdown keeps its width when it expires', async ({ page }) => {
  // seed a pending order, page.clock.install(), goto /checkout/pay/, measure countdown boundingBox width w1,
  // page.clock.fastForward('10:00'), expect text 'หมดอายุ' and width === w1
});
```

- [ ] **Step 2: Install browsers and run**

Run: `npx playwright install chromium`, then `npm run e2e`.
Expected: all specs pass on all 3 projects. Fix any failures in the owning task's files, then re-run.

- [ ] **Step 3: Write `web/README.md`**

Cover: what this is (the redesign on a branch; the old mock-up stays at `mockup/`), the commands (`npm run dev`, `npm test`, `npm run build`, `npm run e2e`), where the rules live (`src/lib/rules.ts`, which is the only place prices, fees, caps and permissions are decided), the order lifecycle (`startOrder` → `completeOrder`), and that all data is mock data in localStorage (`jongloei-web-v1`).

- [ ] **Step 4: Full verification**

Run: `npm run lint && npm test && npm run build && npm run e2e`.
Expected: everything exits 0.

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "test(web): Playwright flow and layout checks; README"
```
