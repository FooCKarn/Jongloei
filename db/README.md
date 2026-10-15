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

Conventions: ids are app-generated `TEXT` (UUID / ULID), timestamps are unix epoch **milliseconds**, booleans are `0`/`1`, wallet addresses are stored lowercase.

## Sign-up / login flow against this schema

1. User signs in with thirdweb (Google, email OTP, phone or an existing wallet). thirdweb returns the auth provider, the provider's user id and the in-app wallet address.
2. Backend looks up `auth_identities` by `(provider, provider_subject)`.
   - Found: load the user, update `last_login_at`.
   - Not found: insert `users`, `auth_identities` and a primary `inapp` row in `wallets` in one batch, and log `signup` in `account_events`.
3. Backend creates a `sessions` row and sets the session cookie.

PDPA: only wallet addresses go on-chain. Everything personal stays here, and the sensitive fields are encrypted by the app with a key kept in a Worker secret.

## Set up (once)

```sh
npx wrangler d1 create jongloei-db
```

Let Wrangler add the binding to `wrangler.jsonc` (or paste the block it prints), then add `"migrations_dir": "db/migrations"` to that block:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "jongloei-db",
    "database_id": "<id printed by the command above>",
    "migrations_dir": "db/migrations"
  }
]
```

## Apply migrations

```sh
npx wrangler d1 migrations apply jongloei-db --remote
```

Use `--local` instead of `--remote` to try it against a local database first.
