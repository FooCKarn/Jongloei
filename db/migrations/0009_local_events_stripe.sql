-- Promote the organizer events that previously lived only in the mock-up into D1.
-- They are platform-owned catalog entries because the old local demo has no
-- trustworthy Google user/shop owner to attach to them. Their IDs stay stable so
-- existing links continue to resolve, while checkout can now find them in D1.
PRAGMA foreign_keys = ON;

INSERT INTO events (
  id, name, short_name, category, event_date, event_time, venue, poster_background,
  status, sold_percent, description, starts_at, ends_at, published_at, chain_event_id
)
SELECT
  'org-fri', 'Friday Rooftop Session', 'ROOFTOP
FRIDAY', 'ปาร์ตี้', 'ศ. 16 ต.ค. 2569', '19:00', 'Rooftop 88 ทองหล่อ',
  'linear-gradient(150deg,#D6455A,#A00018 45%,#3D0710)', 'on_sale', 54,
  'ดีเจเซ็ตยาวบนดาดฟ้า วิวเมืองทั้งคืน แต่งตัวสบาย ๆ อายุ 20 ปีขึ้นไป',
  unixepoch('now', '+1 hour') * 1000, unixepoch('now', '+5 hours') * 1000,
  unixepoch('now') * 1000, COALESCE((SELECT MAX(chain_event_id) FROM events), 0) + 1
WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'org-fri');

INSERT INTO event_zones (id, event_id, zone_name, price, remaining, color, sort_order, capacity)
SELECT 'org-fri-std', 'org-fri', 'Standing', 1000, 56, '#E8485A', 1, 120
WHERE NOT EXISTS (SELECT 1 FROM event_zones WHERE id = 'org-fri-std');
INSERT INTO event_zones (id, event_id, zone_name, price, remaining, color, sort_order, capacity)
SELECT 'org-fri-tbl', 'org-fri', 'โต๊ะ 4 ที่', 4000, 4, '#A00018', 2, 10
WHERE NOT EXISTS (SELECT 1 FROM event_zones WHERE id = 'org-fri-tbl');
INSERT INTO event_zones (id, event_id, zone_name, price, remaining, color, sort_order, capacity)
SELECT 'org-fri-vip', 'org-fri', 'VIP Lounge', 2500, 8, '#4A0010', 3, 20
WHERE NOT EXISTS (SELECT 1 FROM event_zones WHERE id = 'org-fri-vip');

INSERT INTO events (
  id, name, short_name, category, event_date, event_time, venue, poster_background,
  status, sold_percent, description, starts_at, ends_at, published_at, chain_event_id
)
SELECT
  'org-latte', 'Latte Art Workshop รอบเย็น', 'LATTE
ART', 'workshop', 'พ. 28 ต.ค. 2569', '19:00', 'Rooftop 88 ชั้น 3',
  'linear-gradient(140deg,#B86B12,#7A3D08 60%,#2A1404)', 'on_sale', 75,
  'เรียนเทนมลาเต้อาร์ตกับบาริสต้าแชมป์ประเทศ ได้ลงมือจริงคนละเครื่อง',
  unixepoch('now', '+12 days') * 1000, unixepoch('now', '+12 days', '+3 hours') * 1000,
  unixepoch('now') * 1000, COALESCE((SELECT MAX(chain_event_id) FROM events), 0) + 1
WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'org-latte');

INSERT INTO event_zones (id, event_id, zone_name, price, remaining, color, sort_order, capacity)
SELECT 'org-latte-seat', 'org-latte', 'ที่นั่ง workshop', 1500, 3, '#E8485A', 1, 12
WHERE NOT EXISTS (SELECT 1 FROM event_zones WHERE id = 'org-latte-seat');

INSERT INTO events (
  id, name, short_name, category, event_date, event_time, venue, poster_background,
  status, sold_percent, description, starts_at, ends_at, chain_event_id
)
SELECT
  'org-halloween', 'Halloween Rooftop Party', 'HALLO
WEEN', 'ปาร์ตี้', 'อา. 1 พ.ย. 2569', '19:00', 'Rooftop 88 ทองหล่อ',
  'linear-gradient(130deg,#8A1020,#2A0A0D)', 'draft', 0, NULL,
  unixepoch('now', '+16 days') * 1000, unixepoch('now', '+16 days', '+6 hours') * 1000,
  NULL
WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'org-halloween');

INSERT INTO event_zones (id, event_id, zone_name, price, remaining, color, sort_order, capacity)
SELECT 'org-halloween-early', 'org-halloween', 'Early Bird', 600, 50, '#E8485A', 1, 50
WHERE NOT EXISTS (SELECT 1 FROM event_zones WHERE id = 'org-halloween-early');
INSERT INTO event_zones (id, event_id, zone_name, price, remaining, color, sort_order, capacity)
SELECT 'org-halloween-std', 'org-halloween', 'Standing', 800, 150, '#A00018', 2, 150
WHERE NOT EXISTS (SELECT 1 FROM event_zones WHERE id = 'org-halloween-std');

INSERT INTO events (
  id, name, short_name, category, event_date, event_time, venue, poster_background,
  status, sold_percent, description, starts_at, ends_at, chain_event_id, cancelled_at, cancel_reason
)
SELECT
  'org-jazz', 'Jazz Night Vol.3', 'JAZZ
NIGHT', 'คอนเสิร์ต', 'อ. 13 ต.ค. 2569', '19:00', 'Rooftop 88 ทองหล่อ',
  'linear-gradient(150deg,#2B4C7E,#1B2A4A 60%,#0D1424)', 'closed', 87, NULL,
  unixepoch('now', '-3 days') * 1000, unixepoch('now', '-3 days', '+4 hours') * 1000,
  NULL, unixepoch('now') * 1000, 'event ended before Stripe migration'
WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'org-jazz');

INSERT INTO event_zones (id, event_id, zone_name, price, remaining, color, sort_order, capacity)
SELECT 'org-jazz-seat', 'org-jazz', 'Seat', 1200, 8, '#E8485A', 1, 60
WHERE NOT EXISTS (SELECT 1 FROM event_zones WHERE id = 'org-jazz-seat');

INSERT INTO events (
  id, name, short_name, category, event_date, event_time, venue, poster_background,
  status, sold_percent, description, starts_at, ends_at, chain_event_id, cancelled_at, cancel_reason
)
SELECT
  'org-acoustic', 'Acoustic Sunday', 'ACOUSTIC
SUNDAY', 'คอนเสิร์ต', 'อา. 18 ต.ค. 2569', '19:00', 'ลานหญ้า Rooftop 88',
  'linear-gradient(160deg,#C2412D,#7E0013 60%,#2B0A0E)', 'closed', 45, NULL,
  unixepoch('now', '+2 days') * 1000, unixepoch('now', '+2 days', '+3 hours') * 1000,
  NULL, unixepoch('now') * 1000, 'สภาพอากาศ'
WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = 'org-acoustic');

INSERT INTO event_zones (id, event_id, zone_name, price, remaining, color, sort_order, capacity)
SELECT 'org-acoustic-std', 'org-acoustic', 'Standing', 900, 22, '#E8485A', 1, 40
WHERE NOT EXISTS (SELECT 1 FROM event_zones WHERE id = 'org-acoustic-std');
