-- Shop verification documents (context 7: "shops are verified at sign-up").
-- The owner uploads one ID card / company certificate; an admin opens it from the review queue
-- and verifies or rejects the shop (POST /api/admin/hosts/verify). A new upload replaces the old one.
--
-- Demo scope: the file sits in D1 (at most 1 MB) and only admins can read it back. Before real
-- users upload ID cards, move the bytes to private storage and encrypt them (PDPA), like *_enc in 0001.
PRAGMA foreign_keys = ON;

CREATE TABLE host_documents (
  host_id      TEXT PRIMARY KEY REFERENCES host_profiles (user_id) ON DELETE CASCADE,
  file_name    TEXT    NOT NULL,
  mime         TEXT    NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size         INTEGER NOT NULL,
  data         BLOB    NOT NULL,
  uploaded_at  INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
);
