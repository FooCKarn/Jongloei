-- Door check-in (context A6): signed entry QR, scan, markUsed on chain.
--
-- Adds columns and one table only; tickets keeps its 0005 CHECK, which already has 'used'.
--   * A scan that passes moves the ticket from 'active' to 'used' in one guarded UPDATE, so the
--     same ticket can never get in twice, even when two doors scan it at the same moment.
--   * markUsed on the contract runs after that, from the Worker (relayer). The mark_used_*
--     columns follow it the way payment_orders.mint_* follow minting: tx id 'sending' while
--     claimed, then the thirdweb transaction id, then the hash once confirmed.
--   * ticket_scans keeps every scan, valid or not, with its reason for the door's history.
PRAGMA foreign_keys = ON;

ALTER TABLE tickets ADD COLUMN used_at INTEGER;
ALTER TABLE tickets ADD COLUMN used_by TEXT REFERENCES users (id);  -- staff member who scanned it
ALTER TABLE tickets ADD COLUMN mark_used_tx_id TEXT;
ALTER TABLE tickets ADD COLUMN mark_used_tx_hash TEXT;
ALTER TABLE tickets ADD COLUMN mark_used_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tickets ADD COLUMN mark_used_error TEXT;

CREATE INDEX tickets_event_status_idx ON tickets (event_id, status);
CREATE INDEX tickets_mark_used_idx ON tickets (status, mark_used_tx_hash);

CREATE TABLE ticket_scans (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id    TEXT NOT NULL,
  ticket_id   TEXT REFERENCES tickets (id),      -- NULL when the code named no known ticket
  token_id    INTEGER,
  scanned_by  TEXT NOT NULL REFERENCES users (id),
  valid       INTEGER NOT NULL CHECK (valid IN (0, 1)),
  reason      TEXT,                              -- why it was refused (see src/checkin.js REASONS)
  created_at  INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
);
CREATE INDEX ticket_scans_event_idx ON ticket_scans (event_id, created_at);
