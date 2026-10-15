-- 0001_accounts.sql
-- Account system for FairTicket (Cloudflare D1 / SQLite).
--
-- Sign-in itself is handled by thirdweb In-App Wallets (Google, email OTP,
-- phone OTP, or an existing wallet). This schema maps every thirdweb
-- login to one FairTicket account and keeps the off-chain profile.
--
-- PDPA: only wallet addresses go on-chain. Real names and ID numbers for shop
-- verification are stored encrypted by the backend (*_enc columns); the
-- database never holds them in plain text.
--
-- Conventions: ids are TEXT (UUID v4 or ULID made by the app), timestamps are
-- INTEGER unix epoch milliseconds, booleans are INTEGER 0/1.

PRAGMA foreign_keys = ON;

-- One row per person.
CREATE TABLE users (
  id              TEXT PRIMARY KEY,
  display_name    TEXT,
  email           TEXT COLLATE NOCASE,            -- verified email, if any
  phone           TEXT,                           -- E.164, e.g. +66812345678
  avatar_url      TEXT,
  locale          TEXT    NOT NULL DEFAULT 'th',
  role            TEXT    NOT NULL DEFAULT 'guest'
                  CHECK (role IN ('guest', 'host', 'admin')),
  status          TEXT    NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at      INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  last_login_at   INTEGER,
  deleted_at      INTEGER                         -- soft delete (PDPA erasure request)
);

CREATE UNIQUE INDEX users_email_uq ON users (email) WHERE email IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX users_phone_uq ON users (phone) WHERE phone IS NOT NULL AND deleted_at IS NULL;

-- Login methods. One user can have several (Google + email + phone ...).
-- provider_subject is the stable id from that provider as reported by thirdweb
-- (Google "sub", the email address, the phone number, or a
-- lowercase 0x address for provider = 'wallet').
CREATE TABLE auth_identities (
  id                TEXT PRIMARY KEY,
  user_id           TEXT    NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider          TEXT    NOT NULL
                    CHECK (provider IN ('google', 'email', 'phone', 'wallet')),
  provider_subject  TEXT    NOT NULL,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  last_used_at      INTEGER,
  UNIQUE (provider, provider_subject)
);

CREATE INDEX auth_identities_user_idx ON auth_identities (user_id);

-- Wallets owned by a user.
--   kind = 'inapp'    : created by thirdweb at sign-up (the default ticket wallet)
--   kind = 'external' : the user's own wallet (MetaMask etc.), linked by
--                       signing a message; see future work in README.
-- address is stored lowercase so lookups are exact matches.
CREATE TABLE wallets (
  id            TEXT PRIMARY KEY,
  user_id       TEXT    NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  address       TEXT    NOT NULL
                CHECK (address = lower(address) AND length(address) = 42 AND address LIKE '0x%'),
  kind          TEXT    NOT NULL CHECK (kind IN ('inapp', 'external')),
  chain_id      INTEGER NOT NULL DEFAULT 43113,   -- Avalanche Fuji testnet
  is_primary    INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  label         TEXT,
  verified_at   INTEGER,                          -- signature proof for external wallets
  created_at    INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  removed_at    INTEGER,
  UNIQUE (address, chain_id)
);

CREATE INDEX wallets_user_idx ON wallets (user_id);
-- At most one active primary wallet per user (tickets are minted here).
CREATE UNIQUE INDEX wallets_one_primary_uq ON wallets (user_id)
  WHERE is_primary = 1 AND removed_at IS NULL;

-- Server sessions. Store only a SHA-256 hash of the session token, never the token.
CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT    NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash    TEXT    NOT NULL UNIQUE,
  identity_id   TEXT    REFERENCES auth_identities (id) ON DELETE SET NULL,
  user_agent    TEXT,
  ip_address    TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  last_seen_at  INTEGER,
  expires_at    INTEGER NOT NULL,
  revoked_at    INTEGER
);

CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- Shop / host profile. "Shops are verified at sign-up" because code cannot
-- detect a fake event. Personal data for verification is encrypted by the app.
CREATE TABLE host_profiles (
  user_id               TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  shop_name             TEXT    NOT NULL,
  shop_type             TEXT,                     -- bar, pop-up, workshop ...
  contact_line_id       TEXT,
  contact_phone         TEXT,
  address_text          TEXT,
  payout_wallet_id      TEXT    REFERENCES wallets (id) ON DELETE SET NULL,
  legal_name_enc        BLOB,                     -- encrypted, PDPA
  national_id_enc       BLOB,                     -- encrypted, PDPA (citizen ID / tax ID)
  verification_status   TEXT    NOT NULL DEFAULT 'pending'
                        CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  verification_note     TEXT,
  verified_by           TEXT    REFERENCES users (id) ON DELETE SET NULL,
  verified_at           INTEGER,
  created_at            INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  updated_at            INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
);

CREATE INDEX host_profiles_status_idx ON host_profiles (verification_status);

-- Append-only log of account events (sign-up, login, wallet linked,
-- role change, host verified, PDPA erasure ...).
CREATE TABLE account_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT    REFERENCES users (id) ON DELETE SET NULL,
  actor_id    TEXT    REFERENCES users (id) ON DELETE SET NULL,  -- who did it (admin or self)
  event_type  TEXT    NOT NULL,
  metadata    TEXT    CHECK (metadata IS NULL OR json_valid(metadata)),
  ip_address  TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
);

CREATE INDEX account_events_user_idx ON account_events (user_id, created_at);

-- Keep updated_at fresh.
CREATE TRIGGER users_touch AFTER UPDATE ON users
  WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE users SET updated_at = unixepoch('subsec') * 1000 WHERE id = NEW.id;
END;

CREATE TRIGGER host_profiles_touch AFTER UPDATE ON host_profiles
  WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE host_profiles SET updated_at = unixepoch('subsec') * 1000 WHERE user_id = NEW.user_id;
END;
