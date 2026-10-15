# Database: account system

Cloudflare D1 (SQLite). Migrations live in `db/migrations/` and are plain SQL, applied in file-name order.

## Tables

| Table | What it holds |
|---|---|
| `users` | One row per person: display name, verified email / phone, role (`guest`, `host`, `admin`), status, soft-delete for PDPA erasure |
| `auth_identities` | Login methods linked to a user (`google`, `email`, `phone`, `wallet`). `(provider, provider_subject)` is unique, so the same Google account always maps to the same user |
| `wallets` | Wallets the user owns. `inapp` = created by thirdweb at sign-up, `external` = the user's own wallet linked by signature (future work). At most one active primary wallet per user; tickets are minted to it |
| `sessions` | Server sessions. Only the SHA-256 hash of the token is stored |
| `host_profiles` | Shop details and verification status (shops are verified at sign-up). Legal name and ID number are stored encrypted (`*_enc`), never in plain text |
| `account_events` | Append-only log: sign-up, login, wallet linked, role change, host verified, erasure |
| `events` | Event catalog and sale status |
| `event_zones` | Ticket zones, prices, colors, and remaining inventory |
| `payment_orders` | Orders: seat hold (`pending` until `expires_at`, counted against `remaining` without changing it), Stripe session, payment checks, mint progress. Status `pending` → `paid` (decrements `remaining`, 0004) → `fulfilled`, or `expired` / `failed` (hold freed) / `needs_review` |
| `tickets` | One row per ticket: owner wallet, on-chain `token_id`, mint transaction, status (`minting`, `active`, `listed`, `used`, `mint_failed`) |
| `webhook_events` | Stripe event ids already handled, so a replayed webhook is ignored |
| `host_members` | Shop team besides the owner (`manager`, `gate`), matched by Google e-mail. One shop per e-mail (0006) |
| `ticket_scans` | Every door scan, valid or not, with the refusal reason and who scanned it (0007) |

`0006_organizer.sql` also adds `events.host_id` (the shop owner; `NULL` for platform events), `description`, `starts_at`, `ends_at`, `published_at`, `cancelled_at`, `cancel_reason`, and `event_zones.capacity`. A cancelled event has `status = 'closed'` and `cancelled_at` set.

`0007_checkin.sql` adds to `tickets`: `used_at`, `used_by` (the staff member who scanned it), and `mark_used_tx_id` / `mark_used_tx_hash` / `mark_used_attempts` / `mark_used_error`, which follow the `markUsed` write on the contract the way `payment_orders.mint_*` follow minting.

Conventions: ids are app-generated `TEXT` (UUID / ULID), timestamps are unix epoch **milliseconds**, booleans are `0`/`1`, wallet addresses are stored lowercase.

## Sign-up / login flow against this schema

1. User signs in with thirdweb (Google, email OTP, phone or an existing wallet). thirdweb returns the auth provider, the provider's user id and the in-app wallet address.
2. Backend looks up `auth_identities` by `(provider, provider_subject)`.
   - Found: load the user, update `last_login_at`.
   - Not found: insert `users`, `auth_identities` and a primary `inapp` row in `wallets` in one batch, and log `signup` in `account_events`.
3. Backend creates a `sessions` row and sets the session cookie.

Google sign-in is live today without thirdweb: `src/worker.js` verifies Google's ID token itself and runs steps 2 and 3 (the `google` identity's `provider_subject` is Google's `sub`). The in-app wallet row is added once thirdweb is wired in.

PDPA: only wallet addresses go on-chain. Everything personal stays here, and the sensitive fields are encrypted by the app with a key kept in a Worker secret.

## Where it lives

The production database `jongloei-db` (region APAC) already exists and `0001_accounts.sql` has been applied. The root `wrangler.jsonc` binds it to the Worker as `env.DB`; `src/worker.js` uses it for Google sign-in (see the main README).

## Apply new migrations

Add the next numbered file in `db/migrations/`, then:

```sh
npx wrangler d1 migrations apply jongloei-db --remote
```

Use `--local` instead of `--remote` to try it against a local database first.
