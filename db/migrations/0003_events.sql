-- Events and ticket zones. Admin tooling can manage these rows later.
PRAGMA foreign_keys = ON;

CREATE TABLE events (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  short_name        TEXT NOT NULL,
  category          TEXT NOT NULL,
  event_date        TEXT NOT NULL,
  event_time        TEXT NOT NULL,
  venue             TEXT NOT NULL,
  poster_background  TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'on_sale', 'sold_out', 'closed')),
  sold_percent      INTEGER NOT NULL DEFAULT 0 CHECK (sold_percent BETWEEN 0 AND 100),
  created_at        INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
);

CREATE TABLE event_zones (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  zone_name   TEXT NOT NULL,
  price       INTEGER NOT NULL CHECK (price > 0),
  remaining   INTEGER NOT NULL CHECK (remaining >= 0),
  color       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (event_id, zone_name)
);

CREATE INDEX events_status_date_idx ON events (status, event_date);
CREATE INDEX event_zones_event_idx ON event_zones (event_id, sort_order);

INSERT INTO events (id, name, short_name, category, event_date, event_time, venue, poster_background, status, sold_percent)
VALUES
  ('neon', 'BKK Neon Nights 2026', 'NEON
NIGHTS', 'คอนเสิร์ต', 'ส. 21 พ.ย. 2569', '19:00', 'อิมแพ็ค อารีนา เมืองทองธานี', 'linear-gradient(140deg,#A00018,#4A0010 70%,#1E0508)', 'on_sale', 86),
  ('jazz', 'Siam River Jazz Festival', 'RIVER
JAZZ', 'เทศกาล', 'ส. 5 ธ.ค. 2569', '16:00', 'ลานริมน้ำ เจริญกรุง', 'linear-gradient(160deg,#C2412D,#7E0013 60%,#2B0A0E)', 'on_sale', 58),
  ('fan', 'Starlight Fan Meeting in Bangkok', 'STAR
LIGHT', 'แฟนมีตติ้ง', 'อา. 13 ธ.ค. 2569', '17:30', 'ธันเดอร์โดม เมืองทองธานี', 'linear-gradient(150deg,#D6455A,#A00018 45%,#3D0710)', 'on_sale', 97),
  ('standup', 'Late Night Stand-up Special', 'LATE
NIGHT', 'สแตนด์อัป', 'ศ. 9 ม.ค. 2570', '20:00', 'สามย่านมิตรทาวน์ ฮอลล์', 'linear-gradient(130deg,#8A1020,#2A0A0D)', 'on_sale', 41);

INSERT INTO event_zones (id, event_id, zone_name, price, remaining, color, sort_order)
VALUES
  ('neon-standing-a', 'neon', 'Standing A', 2500, 182, '#E8485A', 1),
  ('neon-seat-b', 'neon', 'Seat B', 3800, 64, '#A00018', 2),
  ('neon-vip-front', 'neon', 'VIP Front', 5500, 9, '#4A0010', 3),
  ('jazz-one-day', 'jazz', 'บัตรวันเดียว', 1800, 420, '#E8485A', 1),
  ('jazz-two-day', 'jazz', 'บัตร 2 วัน', 3200, 150, '#A00018', 2),
  ('fan-zone-c', 'fan', 'Zone C', 2900, 0, '#E8485A', 1),
  ('fan-zone-b', 'fan', 'Zone B', 4200, 31, '#A00018', 2),
  ('fan-hi-touch-a', 'fan', 'Hi-Touch A', 6900, 4, '#4A0010', 3),
  ('standup-regular', 'standup', 'Regular', 1500, 240, '#E8485A', 1),
  ('standup-front-row', 'standup', 'Front Row', 2600, 22, '#A00018', 2);
