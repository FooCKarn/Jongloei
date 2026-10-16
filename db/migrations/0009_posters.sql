-- Poster images uploaded by organizers (PUT /api/org/events/:id/poster, src/organizer.js).
--
-- The browser shrinks the picture before upload; the Worker checks its type from the first bytes
-- and its size, then keeps it here. events.poster_image_at is the time of the last upload: the
-- buyer list and the organizer API turn it into /api/posters/<id>?v=<time>, so a new upload gets
-- a new URL and the old one can be cached for good. Without an image the gradient (poster_background)
-- is used as before.
PRAGMA foreign_keys = ON;

ALTER TABLE events ADD COLUMN poster_image_at INTEGER;

CREATE TABLE event_posters (
  event_id    TEXT PRIMARY KEY REFERENCES events (id) ON DELETE CASCADE,
  mime        TEXT NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  data        BLOB NOT NULL,
  bytes       INTEGER NOT NULL CHECK (bytes > 0 AND bytes <= 1000000),
  updated_at  INTEGER NOT NULL
);
