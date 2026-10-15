-- Stripe Checkout orders. Fulfillment must be driven by verified webhooks.
PRAGMA foreign_keys = ON;

CREATE TABLE payment_orders (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  stripe_session_id    TEXT NOT NULL UNIQUE,
  stripe_payment_intent TEXT,
  event_id              TEXT NOT NULL,
  zone                 TEXT NOT NULL,
  quantity             INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 4),
  amount               INTEGER NOT NULL CHECK (amount > 0),
  status               TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed')),
  created_at            INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  paid_at              INTEGER
);

CREATE INDEX payment_orders_user_idx ON payment_orders (user_id, created_at);
