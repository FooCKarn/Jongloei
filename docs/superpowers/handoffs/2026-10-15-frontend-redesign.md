# Handoff: frontend redesign (2026-10-15)

## Where things stand

- **Branch:** `redesign/web-frontend`, at `0758b59`, the same as `origin/main`. The user pulled `origin/main` into it at 20:04, which brought in Stripe Checkout and `contracts/`.
- **Local `main`** is at `9875308`, 2 commits behind `origin/main`. It has not been touched.
- **Uncommitted:** only `docs/`, which holds this note, the spec and the plan. No code has been written yet.

## Decided with the user

- Frontend redesign only, on this branch. Keep the old codebase as it is.
- **Stack:** Next.js 16 + TypeScript + Tailwind 4, in a new `web/` folder, built as a static export.
- **Data:** all mock data. No `/api` or `/auth` calls.
- **Look:** keep the same style (crimson brand, Thai UI, same screens). Remove the parts that look AI-made, starting with the fonts. The full list is in the spec under "Visual direction".

## Documents

- **Spec:** `docs/superpowers/specs/2026-10-15-frontend-redesign-design.md`
- **Plan:** `docs/superpowers/plans/2026-10-15-frontend-redesign.md` (11 TDD tasks)

## Open before implementation

1. **The user is reviewing the old design** (`mockup/index.html`) and may change the direction. Wait for their feedback before starting Task 1.
2. **No execution method chosen yet.** I recommended Subagent-driven, because Tasks 5–10 depend on the interfaces from Tasks 2–4.
3. **Plan updates still owed after the pull:**
   - ~~Add `contracts/` to the Global Constraints list of paths not to touch.~~ Done.
   - Done: the accessibility and interaction rules from the Web Interface Guidelines audit of `mockup/index.html` were added to Global Constraints and to the tests in Tasks 1, 4, 5, 6, 7, 8, 9, 10 and 11.
   - Done: the polish rules from the make-interfaces-feel-better audit were added:
     - concentric radius, translucent borders, `antialiased`, `tabular-nums`, `text-pretty`, and no `transition-all`;
     - the Button press scale, and Sheet/Toast exit animations (Task 4);
     - the optical nudge on the back button (Task 5);
     - the Poster outline (Task 6);
     - the copy-icon swap (Task 10).
     The user chose to keep borders (translucent) over shadows, and no staggered animations.
   - Done: the design-engineering rules from the Emil Kowalski audit were added:
     - easing and the 250 ms cap, the 4-level z-index scale, no weight shifts, tap highlight off, fixed widths for swapping text, numeric inputs as `type="text"`, and focused chips scrolling into view;
     - the theme-switch transition guard (Task 1);
     - tests in Tasks 4, 6, 8 and 9.
   - Done: the codebase-design (deep modules) restructure:
     - `rules.ts` now exports only `quotePurchase`, `purchaseLimit`, `quoteResale`, `ticketPermissions`, `entryQr`, `searchEvents` and `minPrice`.
     - The store's cart, cartKey and lastMinted became one `order` lifecycle (`startOrder` → `completeOrder`, idempotent). `useOrderGuard(stage)` owns all checkout redirects.
     - There is no clock, storage or data-source seam, because each would have only one adapter.
     - The class-name assertions moved to `e2e/polish.spec.ts`, which checks computed style.
   - Check whether the Stripe Checkout work (`086e9d5`, `2e5b29c` in `src/worker.js`) changes the payment screens. Card payment may no longer be "เร็ว ๆ นี้" ("coming soon").
   - Re-read `context.md`, which is now v3.4.
4. ~~Font choice~~ Decided: General Sans for Latin and digits, Anuphan for Thai body, Prompt for Thai headings. The 4 per-event poster palettes still need the user's sign-off.
5. Committing `docs/` is pending; the user has not asked for it yet.

## Design Revision 1 (recorded, task bodies not yet rewritten)

The user requested design changes to home, search, event detail and the market. They are recorded in the plan under "Design Revision 1" (R1–R5), with pointers at the top of Tasks 6, 7 and 10:
- **Home:** an animated hero, a search and filter bar (price / venue / time), and image cards.
- **Search:** a new `/search/` route.
- **Event detail:** a 2 × 2 trust grid, checkbox-style zones, and a two-half purchase panel.
- **Market:** horizontal listing cards with a coloured price block and an info sheet, a dismissible red alert, and search and filters.

[OPEN] items need the user's answers before Tasks 6, 7 and 10 are rewritten:
- the hero copy and the button language;
- the filter buckets;
- the image source;
- whether the purchase panel has a close handle.

## Notes on how the user works

- They write in Thai and English; reply in the language they use.
- They rejected me opening a browser and rejected an `AskUserQuestion` call. Before any action, give a short description and wait.
