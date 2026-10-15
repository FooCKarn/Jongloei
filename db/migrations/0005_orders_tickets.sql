-- Paid flow end to end (context 6.1): seat hold, verified payment, mint, tickets.
--
-- Seats are now taken when the order is created (the hold), not when the payment arrives, so
-- 0004's inventory_update_token is no longer used and is dropped with the rebuild below.
-- payment_orders is rebuilt because SQLite cannot change a CHECK constraint. Order life cycle:
--   pending      seats are held (event_zones.remaining already reduced) until expires_at
--   expired      hold ran out or the Stripe session expired; seats were given back
--   paid         all 5 payment checks passed; minting is owned by exactly one worker
--   fulfilled    every ticket of the order is minted on chain
--   failed       Stripe reported the payment failed; seats were given back
--   needs_review paid at Stripe but a check failed (amount, reference, late payment)
--                or minting cannot be retried safely; a person must look at it
PRAGMA foreign_keys = ON;

ALTER TABLE events ADD COLUMN chain_event_id INTEGER;
UPDATE events SET chain_event_id = CASE id
  WHEN 'neon' THEN 1 WHEN 'jazz' THEN 2 WHEN 'fan' THEN 3 WHEN 'standup' THEN 4 END;
CREATE UNIQUE INDEX events_chain_event_uq ON events (chain_event_id) WHERE chain_event_id IS NOT NULL;

CREATE TABLE payment_orders_new (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  stripe_session_id     TEXT UNIQUE,              -- NULL only while the session is being created
  stripe_payment_intent TEXT,
  event_id              TEXT NOT NULL,
  zone                  TEXT NOT NULL,
  quantity              INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 4),
  unit_amount           INTEGER NOT NULL CHECK (unit_amount > 0),       -- satang, fee included
  amount                INTEGER NOT NULL CHECK (amount > 0),            -- satang, unit_amount * quantity
  currency              TEXT NOT NULL DEFAULT 'thb',
  status                TEXT NOT NULL CHECK (status IN
                          ('pending', 'expired', 'paid', 'fulfilled', 'failed', 'needs_review')),
  expires_at            INTEGER NOT NULL,          -- end of the seat hold
  review_reason         TEXT,
  mint_tx_id            TEXT,                      -- thirdweb transaction id; 'sending' while claimed
  mint_tx_hash          TEXT,
  mint_attempts         INTEGER NOT NULL DEFAULT 0,
  mint_error            TEXT,
  created_at            INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  paid_at               INTEGER,
  fulfilled_at          INTEGER,
  updated_at            INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
);

-- Old pending orders never took seats, so they close as expired without giving any back.
-- Old paid orders already took their seats (0004) but were never minted: a person reviews them.
INSERT INTO payment_orders_new (id, user_id, stripe_session_id, stripe_payment_intent, event_id, zone,
  quantity, unit_amount, amount, status, expires_at, review_reason, created_at, paid_at)
SELECT id, user_id, stripe_session_id, stripe_payment_intent, event_id, zone, quantity,
  amount / quantity, amount,
  CASE status WHEN 'pending' THEN 'expired' WHEN 'paid' THEN 'needs_review' ELSE status END,
  created_at + 600000,
  CASE status WHEN 'paid' THEN 'paid before automatic minting existed' END,
  created_at, paid_at
FROM payment_orders;

DROP TABLE payment_orders;
ALTER TABLE payment_orders_new RENAME TO payment_orders;
CREATE INDEX payment_orders_user_idx ON payment_orders (user_id, created_at);
CREATE INDEX payment_orders_status_idx ON payment_orders (status, expires_at);

-- One row per ticket. token_id is filled in from the mint receipt.
CREATE TABLE tickets (
  id            TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL REFERENCES payment_orders (id),
  user_id       TEXT NOT NULL REFERENCES users (id),
  event_id      TEXT NOT NULL,
  zone          TEXT NOT NULL,
  face_price    INTEGER NOT NULL,                  -- baht, without the service fee
  owner_wallet  TEXT NOT NULL,
  token_id      INTEGER UNIQUE,
  status        TEXT NOT NULL DEFAULT 'minting'
                CHECK (status IN ('minting', 'active', 'listed', 'used', 'mint_failed')),
  transfers     INTEGER NOT NULL DEFAULT 0,
  mint_tx_hash  TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  minted_at     INTEGER
);

CREATE INDEX tickets_user_idx ON tickets (user_id, created_at);
CREATE INDEX tickets_order_idx ON tickets (order_id);

-- Stripe event ids already handled, so a replayed webhook is ignored (check 5).
CREATE TABLE webhook_events (
  id           TEXT PRIMARY KEY,
  provider     TEXT NOT NULL DEFAULT 'stripe',
  type         TEXT NOT NULL,
  received_at  INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
);
