// Tests for the pure parts of src/organizer.js. Run: node --test tests/worker/*.test.mjs
// The routes themselves are covered by tests/worker/organizer-api.e2e.mjs against `wrangler dev`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEvent, validateZones, shortName, maskEmail, ZONE_COLORS } from '../../src/organizer.js';

const now = Date.UTC(2026, 9, 15);
const good = () => ({
  name: 'Friday Rooftop', venue: 'Rooftop 88', category: 'ปาร์ตี้',
  startsAt: now + 86400000, endsAt: now + 90000000,
  zones: [{ name: 'Standing', price: 500, capacity: 10 }],
});

test('a complete event passes and gets defaults', () => {
  const r = validateEvent(good(), now);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.value.short, 'FRIDAY\nROOFTOP');
  assert.equal(r.value.poster, 0);
  assert.equal(r.value.zones[0].color, ZONE_COLORS[0]);
});

test('text that could break buyer HTML is refused', () => {
  for (const name of ['<img src=x>', 'a"b', "a'b", 'a`b', 'tab\there']) {
    assert.equal(validateEvent({ ...good(), name }, now).errors.name, 'unsafe_characters', name);
  }
  assert.equal(validateEvent({ ...good(), description: 'line 1\nline 2' }, now).ok, true);
  assert.equal(validateEvent({ ...good(), description: '<script>' }, now).errors.description, 'unsafe_characters');
});

test('times must be in the future and in order', () => {
  assert.equal(validateEvent({ ...good(), startsAt: now }, now).errors.startsAt, 'in_past');
  assert.equal(validateEvent({ ...good(), endsAt: now + 1 }, now).errors.endsAt, 'before_start');
  assert.equal(validateEvent({ ...good(), startsAt: '2026-10-20' }, now).errors.startsAt, 'required');
});

test('poster is an index into the fixed list, never free CSS', () => {
  assert.equal(validateEvent({ ...good(), poster: 'red;background:url(//x)' }, now).errors.poster, 'invalid');
  assert.equal(validateEvent({ ...good(), poster: 99 }, now).errors.poster, 'invalid');
});

test('zones: whole baht, capacity, unique names, palette colours', () => {
  const { errors } = validateZones([
    { name: 'A', price: 19, capacity: 1 },
    { name: 'a', price: 100.5, capacity: 0 },
    { name: 'B', price: 100, capacity: 1, color: 'red' },
  ]);
  assert.equal(errors['zones.0.price'], 'invalid');
  assert.equal(errors['zones.1.name'], 'duplicate');
  assert.equal(errors['zones.1.price'], 'invalid');
  assert.equal(errors['zones.1.capacity'], 'invalid');
  assert.equal(errors['zones.2.color'], 'invalid');
  assert.equal(validateZones([]).errors.zones, 'required');
  assert.equal(validateZones(Array.from({ length: 11 }, (_, i) => ({ name: 'Z' + i, price: 100, capacity: 1 }))).errors.zones, 'too_many');
});

test('helpers', () => {
  assert.equal(shortName('  late   night stand-up '), 'LATE\nNIGHT');
  assert.equal(maskEmail('buyer@example.com'), 'bu***@example.com');
  assert.equal(maskEmail('a@x.co'), 'a*@x.co');
  assert.equal(maskEmail(null), '');
});

/* ---------- poster images (0009_posters.sql) ---------- */
import { parsePosterImage, posterUrl, POSTER_MAX_BYTES } from '../../src/organizer.js';

const dataUrl = (mime, bytes) => `data:${mime};base64,` + Buffer.from(bytes).toString('base64');
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP = [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBPVP8 ')];

test('a poster image is accepted only when its bytes match its type', () => {
  assert.equal(parsePosterImage(dataUrl('image/jpeg', JPEG)).value.mime, 'image/jpeg');
  assert.equal(parsePosterImage(dataUrl('image/png', PNG)).value.mime, 'image/png');
  assert.equal(parsePosterImage(dataUrl('image/webp', WEBP)).value.mime, 'image/webp');
  assert.equal(parsePosterImage(dataUrl('image/jpeg', PNG)).error, 'invalid');           // declared type lies
  assert.equal(parsePosterImage(dataUrl('image/svg+xml', [...Buffer.from('<svg/>')])).error, 'invalid');
  assert.equal(parsePosterImage('https://example.com/x.jpg').error, 'invalid');
  assert.equal(parsePosterImage(undefined).error, 'invalid');
});

test('a poster image over the size limit is refused', () => {
  const big = new Uint8Array(POSTER_MAX_BYTES + 1);big.set(JPEG);
  assert.equal(parsePosterImage(dataUrl('image/jpeg', big)).error, 'too_large');
});

test('the poster URL changes with every upload', () => {
  assert.equal(posterUrl('ev-0123456789ab', null), null);
  assert.equal(posterUrl('ev-0123456789ab', 5), '/api/posters/ev-0123456789ab?v=5');
});
