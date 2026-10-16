-- Resale on the platform (context 5.6, A7): list, hold, pay with Stripe (PromptPay), 5 checks,
-- then the relayer calls operatorTransfer.
--
-- Resale has its own order table instead of reusing payment_orders, so the seat hold
-- (AVAILABLE_SEATS), the inventory decrement of 0004 and the mint sweep never see a resale order.
-- Nothing here changes 0001-0006 (0007 is the entry-QR work).
--
-- Life cycle:
--   tickets.status 'active' -> 'listed' while a listing is active or sold and not yet transferred.
--   resale_listings  active     on the market; a buyer's pending order is the 10-minute hold
--                    sold       paid and passed the checks; operatorTransfer queued or retrying
--                    completed  transferred on chain; the ticket now belongs to the buyer
--                    cancelled  the seller took it down (only while nobody holds it)
--                    expired    reached the transfer cutoff unsold
--   resale_orders    same statuses as payment_orders (pending/expired/paid/fulfilled/failed/needs_review)
--   resale_payouts   what the platform owes the seller: held until the event is over, then paid
--                    by a person. No code sends money out.
PRAGMA foreign_keys = ON;

-- Per-event rules (context 10.2). Defaults are the production values; set smaller ones by hand
-- on a demo event (e.g. resale_delay_s = 60, transfer_cutoff_s = 30).
ALTER TABLE events ADD COLUMN resale_cap_bps INTEGER NOT NULL DEFAULT 12500
  CHECK (resale_cap_bps BETWEEN 10000 AND 12500);            -- price cap = face x 1.25
ALTER TABLE events ADD COLUMN resale_delay_s INTEGER NOT NULL DEFAULT 21600
  CHECK (resale_delay_s >= 0);                               -- 6 h after the ticket was received
ALTER TABLE events ADD COLUMN transfer_cutoff_s INTEGER NOT NULL DEFAULT 3600
  CHECK (transfer_cutoff_s >= 0);                            -- no transfer in the last hour
ALTER TABLE events ADD COLUMN resale_commission_bps INTEGER NOT NULL DEFAULT 600
  CHECK (resale_commission_bps BETWEEN 0 AND 10000);         -- 6 %, taken from the seller

-- The seeded events only had Thai date text; the transfer cutoff needs a real start time.
-- Times are Bangkok (UTC+7). Organizer events already set starts_at when created.
UPDATE events SET starts_at = CASE id
    WHEN 'neon'    THEN 1795262400000   -- 2026-11-21 19:00 +07
    WHEN 'jazz'    THEN 1796461200000   -- 2026-12-05 16:00 +07
    WHEN 'fan'     THEN 1797157800000   -- 2026-12-13 17:30 +07
    WHEN 'standup' THEN 1799499600000   -- 2027-01-09 20:00 +07
  END
WHERE starts_at IS NULL AND id IN ('neon', 'jazz', 'fan', 'standup');

-- When the current holder received the ticket (mint or last transfer); the 6-hour hold counts
-- from here. Rows minted later leave it NULL and the code reads COALESCE(acquired_at, minted_at).
ALTER TABLE tickets ADD COLUMN acquired_at INTEGER;
UPDATE tickets SET acquired_at = COALESCE(minted_at, created_at) WHERE token_id IS NOT NULL;

CREATE TABLE resale_listings (
  id          TEXT PRIMARY KEY,
  ticket_id   TEXT NOT NULL REFERENCES tickets (id),
  seller_id   TEXT NOT NULL REFERENCES users (id),
  event_id    TEXT NOT NULL,
  price       INTEGER NOT NULL CHECK (price > 0),          -- whole baht, what the buyer pays
  face_price  INTEGER NOT NULL,                            -- baht, the cap is based on this
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'sold', 'completed', 'cancelled', 'expired')),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  closed_at   INTEGER,
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
);
-- One live listing per ticket (context 5.6).
CREATE UNIQUE INDEX resale_listings_one_live_uq ON resale_listings (ticket_id) WHERE status IN ('active', 'sold');
CREATE INDEX resale_listings_market_idx ON resale_listings (status, event_id, created_at);
CREATE INDEX resale_listings_seller_idx ON resale_listings (seller_id, created_at);

CREATE TABLE resale_orders (
  id                    TEXT PRIMARY KEY,
  listing_id            TEXT NOT NULL REFERENCES resale_listings (id),
  ticket_id             TEXT NOT NULL REFERENCES tickets (id),
  buyer_id              TEXT NOT NULL REFERENCES users (id),
  seller_id             TEXT NOT NULL REFERENCES users (id),
  event_id              TEXT NOT NULL,
  buyer_wallet          TEXT NOT NULL,                     -- operatorTransfer target
  stripe_session_id     TEXT UNIQUE,
  stripe_payment_intent TEXT,
  amount                INTEGER NOT NULL CHECK (amount > 0), -- satang = listing price x 100
  currency              TEXT NOT NULL DEFAULT 'thb',
  status                TEXT NOT NULL CHECK (status IN
                          ('pending', 'expired', 'paid', 'fulfilled', 'failed', 'needs_review')),
  expires_at            INTEGER NOT NULL,                  -- end of the 10-minute hold
  review_reason         TEXT,
  transfer_tx_id        TEXT,                              -- thirdweb transaction id; 'sending' while claimed
  transfer_tx_hash      TEXT,
  transfer_attempts     INTEGER NOT NULL DEFAULT 0,
  transfer_error        TEXT,
  created_at            INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  paid_at               INTEGER,
  fulfilled_at          INTEGER,
  updated_at            INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
);
-- A listing can be held or bought by one order at a time.
CREATE UNIQUE INDEX resale_orders_one_hold_uq ON resale_orders (listing_id) WHERE status IN ('pending', 'paid', 'fulfilled');
CREATE INDEX resale_orders_status_idx ON resale_orders (status, expires_at);
CREATE INDEX resale_orders_buyer_idx ON resale_orders (buyer_id, created_at);

-- Seller side of the ledger, one row per completed resale. gross = what the buyer paid,
-- commission = 6 % half-up in satang, net = what the seller is owed. Held until release_after
-- (event end + 24 h dispute window); a person pays it out and sets paid_out. If the event is
-- cancelled the buyer is refunded instead and the row becomes void.
CREATE TABLE resale_payouts (
  id             TEXT PRIMARY KEY,
  order_id       TEXT NOT NULL UNIQUE REFERENCES resale_orders (id),
  listing_id     TEXT NOT NULL REFERENCES resale_listings (id),
  ticket_id      TEXT NOT NULL REFERENCES tickets (id),
  seller_id      TEXT NOT NULL REFERENCES users (id),
  event_id       TEXT NOT NULL,
  gross          INTEGER NOT NULL,
  commission     INTEGER NOT NULL,
  net            INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'paid_out', 'void')),
  release_after  INTEGER,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  settled_at     INTEGER,
  note           TEXT,
  CHECK (gross = commission + net)
);
CREATE INDEX resale_payouts_seller_idx ON resale_payouts (seller_id, created_at);
CREATE INDEX resale_payouts_status_idx ON resale_payouts (status, release_after);
