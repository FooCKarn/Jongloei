-- Organizer backend (B6): shops create and sell their own events.
--
-- Adds columns only, so 0003-0005 and the paid flow keep working as they are:
--   * events.host_id is the shop owner (host_profiles.user_id). NULL = a platform event
--     (the four seeded events).
--   * event_zones.capacity is the zone size the organizer set. remaining keeps its 0004/0005
--     meaning (seats not yet sold); a capacity change moves remaining by the same amount.
--   * events.status keeps its CHECK. Cancelling sets status = 'closed' and cancelled_at.
--   * chain_event_id is given on publish as MAX + 1; events_chain_event_uq (0005) blocks duplicates.
-- Prices stay in whole baht like 0003, because checkout computes unit_amount from them.
PRAGMA foreign_keys = ON;

ALTER TABLE events ADD COLUMN host_id TEXT REFERENCES users (id);
ALTER TABLE events ADD COLUMN description TEXT;
ALTER TABLE events ADD COLUMN starts_at INTEGER;       -- epoch ms; event_date/event_time are its Thai text
ALTER TABLE events ADD COLUMN ends_at INTEGER;
ALTER TABLE events ADD COLUMN published_at INTEGER;
ALTER TABLE events ADD COLUMN cancelled_at INTEGER;
ALTER TABLE events ADD COLUMN cancel_reason TEXT;
CREATE INDEX events_host_idx ON events (host_id, created_at);

ALTER TABLE event_zones ADD COLUMN capacity INTEGER CHECK (capacity IS NULL OR capacity >= 0);

-- Shop team besides the owner. Matched by the e-mail of the Google account at sign-in.
CREATE TABLE host_members (
  host_id     TEXT NOT NULL REFERENCES host_profiles (user_id) ON DELETE CASCADE,
  email       TEXT NOT NULL COLLATE NOCASE,
  role        TEXT NOT NULL CHECK (role IN ('manager', 'gate')),
  invited_by  TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  PRIMARY KEY (host_id, email)
);
-- One shop per person, as in the mock-up.
CREATE UNIQUE INDEX host_members_email_uq ON host_members (email);
