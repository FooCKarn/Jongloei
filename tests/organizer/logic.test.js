// Tests for mockup/organizer-logic.js. Run: node --test tests/organizer
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../../mockup/organizer-logic.js');

/* ---------- money ---------- */

test('serviceFee is 5 baht + 3% per ticket', () => {
  assert.equal(L.serviceFee(100000), 3500);
  assert.equal(L.serviceFee(10000), 800);
  assert.equal(L.serviceFee(50000), 2000);
});

test('commission is 6% rounded half-up', () => {
  assert.equal(L.commission(110000), 6600);
  assert.equal(L.commission(120000), 7200);
  assert.equal(L.commission(1), 0);
  assert.equal(L.commission(25), 2);
});

test('resaleCap clamps the multiplier to 1.00-1.25', () => {
  assert.equal(L.resaleCap(100000, 1.25), 125000);
  assert.equal(L.resaleCap(100000, 1.0), 100000);
  assert.equal(L.resaleCap(100000, 2), 125000);
  assert.equal(L.resaleCap(100000, 0.5), 100000);
});

test('toSatang converts baht and rejects bad input', () => {
  assert.equal(L.toSatang(1000), 100000);
  assert.equal(L.toSatang('10.5'), 1050);
  assert.ok(Number.isNaN(L.toSatang(10.555)));
  assert.ok(Number.isNaN(L.toSatang('abc')));
});

test('fmtBaht shows satang only when needed', () => {
  assert.equal(L.fmtBaht(100000), '฿1,000');
  assert.equal(L.fmtBaht(100050), '฿1,000.50');
});

const threeHops = () => ({
  ticketId: 't1', eventId: 'org-1', zoneId: 'z1', holderId: 'C', status: 'valid',
  hops: [{ idx: 0, payerId: 'A', paid: 100000 }, { idx: 1, payerId: 'B', paid: 110000 }, { idx: 2, payerId: 'C', paid: 120000 }],
});

test('settleTicket matches the three-hop example in context.md 5.6', () => {
  const r = L.settleTicket(threeHops(), 100000);
  assert.equal(r.shopNet, 96500);
  assert.equal(r.shopFee, 3500);
  assert.deepEqual(r.sellerPayouts, [{ payerId: 'A', amount: 103400 }, { payerId: 'B', amount: 112800 }]);
  assert.equal(r.commission, 13800);
  assert.equal(r.totalIn, 330000);
  assert.equal(r.shopNet + r.shopFee + 103400 + 112800 + r.commission, r.totalIn);
});

test('settleTicket with a single hop pays no sellers', () => {
  const t = threeHops(); t.hops = t.hops.slice(0, 1);
  const r = L.settleTicket(t, 100000);
  assert.equal(r.sellerPayouts.length, 0);
  assert.equal(r.commission, 0);
});

test('settleEvent sums tickets using the zone price as face', () => {
  const ev = { id: 'org-1', zones: [{ id: 'z1', price: 100000 }] };
  const single = { ...threeHops(), ticketId: 't2', hops: [{ idx: 0, payerId: 'D', paid: 100000 }] };
  const r = L.settleEvent(ev, [threeHops(), single]);
  assert.equal(r.shopNet, 193000);
  assert.equal(r.shopFee, 7000);
  assert.equal(r.commission, 13800);
  assert.equal(r.totalIn, 430000);
  assert.equal(r.sellerPayouts.length, 2);
});

/* ---------- rules ---------- */

const zone = over => ({ id: 'z1', name: 'Standing', kind: 'standing', price: 100000, capacity: 100, sold: 0, held: 0, ...over });

test('validateZone rejects bad prices', () => {
  assert.ok(L.validateZone(zone({ price: 0 })).errors.price);
  assert.ok(L.validateZone(zone({ price: -100 })).errors.price);
  assert.ok(L.validateZone(zone({ price: NaN })).errors.price);
  assert.ok(L.validateZone(zone({ price: 12345.5 })).errors.price);
  assert.equal(L.validateZone(zone()).ok, true);
});

test('validateZone allows only price 0 for comp zones', () => {
  assert.equal(L.validateZone(zone({ kind: 'comp', price: 0 })).ok, true);
  assert.ok(L.validateZone(zone({ kind: 'comp', price: 100 })).errors.price);
});

test('validateZone checks capacity, name and table size', () => {
  assert.ok(L.validateZone(zone({ capacity: 0 })).errors.capacity);
  assert.ok(L.validateZone(zone({ capacity: 2.5 })).errors.capacity);
  assert.ok(L.validateZone(zone({ name: 'x'.repeat(41) })).errors.name);
  assert.ok(L.validateZone(zone({ name: '  ' })).errors.name);
  assert.ok(L.validateZone(zone({ kind: 'table' })).errors.seatsPerUnit);
  assert.equal(L.validateZone(zone({ kind: 'table', seatsPerUnit: 4 })).ok, true);
  assert.ok(L.validateZone(zone({ saleStartAt: 2000, saleEndAt: 1000 })).errors.saleEndAt);
});

const NOW = Date.UTC(2026, 9, 15, 12);
const DAY = 86400000;
const event = over => ({
  id: 'org-1', name: 'Friday Rooftop Session', status: 'draft', startAt: NOW + 7 * DAY, endAt: NOW + 7 * DAY + 4 * 3600000,
  params: { resaleEnabled: true, capMultiplier: 1.25, resaleDelayH: 6, transferCutoffH: 1, disputeWindowH: 24, perUserLimit: 4 },
  zones: [zone()], ...over,
});

test('validateEvent accepts a complete event', () => {
  assert.equal(L.validateEvent(event(), NOW).ok, true);
});

test('validateEvent rejects bad dates', () => {
  const e = event();
  assert.ok(L.validateEvent({ ...e, endAt: e.startAt }, NOW).errors.endAt);
  assert.ok(L.validateEvent({ ...e, startAt: NOW, endAt: NOW + 1000 }, NOW).errors.startAt);
});

test('validateEvent rejects missing or bad zones', () => {
  assert.ok(L.validateEvent(event({ zones: [] }), NOW).errors.zones);
  assert.ok(L.validateEvent(event({ zones: [zone({ price: 0 })] }), NOW).errors['zones.0.price']);
  const e = event();
  assert.ok(L.validateEvent({ ...e, zones: [zone({ saleStartAt: e.startAt })] }, NOW).errors['zones.0.saleStartAt']);
});

test('validateEvent checks name length and cap multiplier', () => {
  assert.ok(L.validateEvent(event({ name: 'ab' }), NOW).errors.name);
  const e = event(); e.params = { ...e.params, capMultiplier: 1.3 };
  assert.ok(L.validateEvent(e, NOW).errors.capMultiplier);
});

test('canEditZone locks price once tickets are sold or held', () => {
  assert.equal(L.canEditZone(zone({ sold: 5 }), { price: 90000 }).ok, false);
  assert.ok(L.canEditZone(zone({ sold: 5 }), { price: 90000 }).reason);
  assert.equal(L.canEditZone(zone({ held: 1 }), { kind: 'seated' }).ok, false);
  assert.equal(L.canEditZone(zone(), { price: 90000 }).ok, true);
});

test('canEditZone never lets capacity drop below sold + held', () => {
  assert.equal(L.canEditZone(zone({ sold: 5, held: 2 }), { capacity: 6 }).ok, false);
  assert.equal(L.canEditZone(zone({ sold: 5, held: 2 }), { capacity: 7 }).ok, true);
  assert.equal(L.canEditZone(zone({ sold: 5, held: 2 }), { capacity: 500 }).ok, true);
});

const ticket = (id, hops, over) => ({ ticketId: id, eventId: 'org-1', zoneId: 'z1', holderId: hops[hops.length - 1].payerId,
  status: 'valid', hops: hops.map((h, idx) => ({ idx, ...h })), ...over });

test('planCancellation refunds each payer what they paid', () => {
  const r = L.planCancellation(event(), [ticket('t1', [{ payerId: 'A', paid: 100000 }]), ticket('t2', [{ payerId: 'B', paid: 100000 }])], new Set());
  assert.equal(r.total, 200000);
  assert.equal(r.refunds.length, 2);
});

test('planCancellation refunds every hop of a resold ticket without commission', () => {
  const t = ticket('t1', [{ payerId: 'A', paid: 100000 }, { payerId: 'B', paid: 110000 }, { payerId: 'C', paid: 120000 }]);
  const r = L.planCancellation(event(), [t], new Set());
  assert.deepEqual(r.refunds.map(x => x.amount), [100000, 110000, 120000]);
  assert.deepEqual(r.refunds.map(x => x.payerId), ['A', 'B', 'C']);
  assert.deepEqual(r.refunds.map(x => x.key), ['t1:0', 't1:1', 't1:2']);
  assert.equal(r.total, 330000);
});

test('planCancellation is idempotent and handles empty events', () => {
  const t = ticket('t1', [{ payerId: 'A', paid: 100000 }, { payerId: 'B', paid: 110000 }, { payerId: 'C', paid: 120000 }]);
  const r = L.planCancellation(event(), [t], new Set(['t1:0', 't1:1', 't1:2']));
  assert.equal(r.refunds.length, 0);
  assert.equal(r.skipped, 3);
  assert.equal(L.planCancellation(event(), [], new Set()).total, 0);
});

test('planCancellation skips comp hops and other events', () => {
  const comp = ticket('t9', [{ payerId: 'X', paid: 0 }]);
  const other = ticket('t8', [{ payerId: 'Y', paid: 100000 }], { eventId: 'org-2' });
  assert.equal(L.planCancellation(event(), [comp, other], new Set()).refunds.length, 0);
});

const scan = over => {
  const t = ticket('t1', [{ payerId: 'u1', paid: 100000 }]);
  return { ticket: t, event: event({ status: 'on_sale' }), signerId: 'u1', ts: NOW - 5000, now: NOW, ...over };
};

test('checkinResult accepts a fresh QR signed by the holder', () => {
  assert.deepEqual(L.checkinResult(scan()), { valid: true });
  assert.equal(L.checkinResult(scan({ ts: NOW + 14000 })).valid, true);
});

test('checkinResult rejects QR codes outside the time window', () => {
  assert.equal(L.checkinResult(scan({ ts: NOW - 61000 })).reason, 'expired_qr');
  assert.equal(L.checkinResult(scan({ ts: NOW + 16000 })).reason, 'future_qr');
});

test('checkinResult gives a specific reason for each invalid ticket', () => {
  const s = scan();
  assert.equal(L.checkinResult({ ...s, ticket: undefined }).reason, 'unknown_ticket');
  assert.equal(L.checkinResult({ ...s, ticket: { ...s.ticket, eventId: 'org-2' } }).reason, 'wrong_event');
  assert.equal(L.checkinResult({ ...s, event: { ...s.event, status: 'cancelled' } }).reason, 'cancelled');
  assert.equal(L.checkinResult({ ...s, event: { ...s.event, status: 'ended' } }).reason, 'event_ended');
  assert.equal(L.checkinResult({ ...s, ticket: { ...s.ticket, status: 'used' } }).reason, 'used');
  assert.equal(L.checkinResult({ ...s, ticket: { ...s.ticket, status: 'refunded' } }).reason, 'refunded');
  assert.equal(L.checkinResult({ ...s, signerId: 'u2' }).reason, 'not_owner');
});

test('checkinResult lets a listed ticket in', () => {
  const s = scan();
  assert.equal(L.checkinResult({ ...s, ticket: { ...s.ticket, status: 'listed' } }).valid, true);
});

/* ---------- dashboard ---------- */

test('summarize counts seats, revenue and fees; comp seats earn nothing', () => {
  const ev = event({ zones: [
    zone({ price: 100000, capacity: 100, sold: 40, held: 5 }),
    zone({ id: 'z9', kind: 'comp', price: 0, capacity: 10, sold: 3 }),
  ] });
  const s = L.summarize(ev);
  assert.equal(s.capacity, 110);
  assert.equal(s.sold, 43);
  assert.equal(s.held, 5);
  assert.equal(s.remaining, 62);
  assert.equal(s.gross, 4000000);
  assert.equal(s.fees, 140000);
  assert.equal(s.net, 3860000);
  assert.equal(s.comps, 3);
});

test('summarize of an event with no zones is all zero', () => {
  assert.deepEqual(L.summarize(event({ zones: [] })), { capacity: 0, sold: 0, held: 0, remaining: 0, gross: 0, fees: 0, net: 0, comps: 0 });
});

test('duplicateEvent makes a clean draft keeping zones and rules', () => {
  const src = event({ status: 'on_sale', doorsAt: 5, zones: [zone({ sold: 40, held: 3 })] });
  const d = L.duplicateEvent(src, 'org-new');
  assert.equal(d.id, 'org-new');
  assert.equal(d.status, 'draft');
  assert.equal(d.name, 'Friday Rooftop Session (สำเนา)');
  assert.equal(d.startAt, null); assert.equal(d.endAt, null); assert.equal(d.doorsAt, null);
  assert.equal(d.zones[0].sold, 0); assert.equal(d.zones[0].held, 0);
  assert.equal(d.zones[0].price, 100000);
  assert.deepEqual(d.params, src.params);
  assert.equal(src.zones[0].sold, 40, 'source untouched');
});

test('salesByDay buckets first-hop purchases by Bangkok day, oldest first', () => {
  const day = 86400000, now = Date.UTC(2026, 9, 15, 5); // 12:00 Bangkok on 15 Oct
  const mk = (id, at, paid) => ({ ticketId: id, eventId: 'org-1', hops: [{ idx: 0, payerId: 'a', paid, at }] });
  const r = L.salesByDay([
    mk('a', now - 1000, 100000), mk('b', now - 2000, 100000),
    mk('c', now - day, 50000),
    mk('d', now - 30 * day, 100000),          // outside window
    { ticketId: 'e', eventId: 'org-1', hops: [{ idx: 0, payerId: 'a', paid: 0, at: now }] }, // comp
  ], now, 14);
  assert.equal(r.length, 14);
  assert.deepEqual(r[13], { day: r[13].day, count: 2, amount: 200000 });
  assert.deepEqual([r[12].count, r[12].amount], [1, 50000]);
  assert.equal(r.reduce((s, x) => s + x.count, 0), 3);
  assert.ok(r[0].day < r[13].day);
});

test('payoutAt is event end plus the dispute window, null when cancelled', () => {
  const e = event({ endAt: Date.UTC(2026, 10, 21, 16, 0) });
  assert.equal(L.payoutAt(e), Date.UTC(2026, 10, 22, 16, 0));
  assert.equal(L.payoutAt({ ...e, status: 'cancelled' }), null);
  assert.equal(L.payoutAt({ ...e, endAt: null }), null);
});

/* ---------- promo codes & discounts ---------- */

const promo = over => ({ code: 'EARLY10', percentOff: 10, startsAt: NOW - DAY, endsAt: NOW + DAY, maxUses: 5, used: 0, ...over });

test('applyPromo takes a percentage or a fixed amount off, never below zero', () => {
  assert.deepEqual(L.applyPromo('EARLY10', [promo()], 'z1', 100000, NOW), { ok: true, price: 90000 });
  assert.deepEqual(L.applyPromo('FIX', [promo({ code: 'FIX', percentOff: undefined, amountOff: 50000 })], 'z1', 30000, NOW), { ok: true, price: 0 });
  assert.equal(L.applyPromo('FULL', [promo({ code: 'FULL', percentOff: 100 })], 'z1', 100000, NOW).price, 0);
});

test('applyPromo is case-insensitive and reports why a code fails', () => {
  assert.equal(L.applyPromo('early10', [promo()], 'z1', 100000, NOW).ok, true);
  assert.deepEqual(L.applyPromo('NOPE', [promo()], 'z1', 100000, NOW), { ok: false, price: 100000, reason: 'not_found' });
  assert.equal(L.applyPromo('EARLY10', [promo({ endsAt: NOW - 1 })], 'z1', 100000, NOW).reason, 'expired');
  assert.equal(L.applyPromo('EARLY10', [promo({ startsAt: NOW + 1 })], 'z1', 100000, NOW).reason, 'expired');
  assert.equal(L.applyPromo('EARLY10', [promo({ used: 5 })], 'z1', 100000, NOW).reason, 'used_up');
  assert.equal(L.applyPromo('EARLY10', [promo({ zoneId: 'z2' })], 'z1', 100000, NOW).reason, 'wrong_zone');
  assert.equal(L.applyPromo('EARLY10', [promo({ disabled: true })], 'z1', 100000, NOW).reason, 'not_found');
  assert.equal(L.applyPromo('', [promo()], 'z1', 100000, NOW).reason, 'not_found');
});

test('summarize with tickets uses what buyers actually paid, so discounts show up', () => {
  const ev = event({ zones: [zone({ price: 100000, capacity: 100, sold: 2 })] });
  const tk = [ticket('t1', [{ payerId: 'A', paid: 100000 }]), ticket('t2', [{ payerId: 'B', paid: 90000 }])];
  const s = L.summarize(ev, tk);
  assert.equal(s.gross, 190000);
  assert.equal(s.fees, 3500 + L.serviceFee(90000));
  assert.equal(s.net, s.gross - s.fees);
  assert.equal(L.summarize(ev).gross, 200000, 'without tickets it still uses list prices');
});

test('settleEvent charges the service fee on the discounted price', () => {
  const ev = event({ zones: [zone({ price: 100000 })] });
  const r = L.settleEvent(ev, [ticket('t2', [{ payerId: 'B', paid: 90000 }])]);
  assert.equal(r.shopFee, L.serviceFee(90000));
  assert.equal(r.shopNet, 90000 - L.serviceFee(90000));
});

/* ---------- buyer bridge ---------- */

test('thaiDate and thaiTime match the buyer EVENTS format', () => {
  const t = Date.UTC(2026, 10, 21, 12); // 19:00 in Bangkok
  assert.equal(L.thaiDate(t), 'ส. 21 พ.ย. 2569');
  assert.equal(L.thaiTime(t), '19:00');
});

const saleEvent = over => event({ status: 'on_sale', zones: [
  zone({ sold: 40, held: 5, color: '#E8485A' }),
  zone({ id: 'z9', name: 'Guest', kind: 'comp', price: 0, capacity: 10, sold: 3 }),
], ...over });

test('toBuyerEvent converts to the buyer shape without comp zones', () => {
  const b = L.toBuyerEvent(saleEvent({ bg: 'linear-gradient(#000,#111)', venue: 'Rooftop 88', category: 'ปาร์ตี้' }));
  assert.equal(b.id, 'org-1');
  assert.equal(b.source, 'local');
  assert.equal(b.zones.length, 1);
  assert.deepEqual(b.zones[0], { z: 'Standing', p: 1000, left: 55, c: '#E8485A', zoneId: 'z1' });
  assert.equal(b.sold, 45);
  assert.equal(b.tag, 'ปาร์ตี้');
  assert.equal(b.venue, 'Rooftop 88');
  assert.equal(b.date, L.thaiDate(b._startAt));
});

test('toBuyerEvent derives a two-line poster title when short is empty', () => {
  assert.equal(L.toBuyerEvent(saleEvent()).short, 'FRIDAY\nROOFTOP');
  assert.equal(L.toBuyerEvent(saleEvent({ short: 'ROOF\nTOP' })).short, 'ROOF\nTOP');
});

test('recordPrimarySale adds sold seats and tickets without mutating the input', () => {
  const ev = saleEvent();
  const r = L.recordPrimarySale(ev, 'z1', 2, 'me', 0, NOW);
  assert.equal(r.ok, true);
  assert.equal(r.event.zones[0].sold, 42);
  assert.equal(ev.zones[0].sold, 40);
  assert.equal(r.tickets.length, 2);
  assert.notEqual(r.tickets[0].ticketId, r.tickets[1].ticketId);
  assert.deepEqual(r.tickets[0].hops, [{ idx: 0, payerId: 'me', paid: 100000, at: NOW }]);
  assert.equal(r.tickets[0].holderId, 'me');
  assert.equal(r.tickets[0].status, 'valid');
});

test('recordPrimarySale refuses to oversell or exceed the per-user limit', () => {
  const last = saleEvent({ zones: [zone({ capacity: 10, sold: 8, held: 1 })] });
  assert.deepEqual(L.recordPrimarySale(last, 'z1', 2, 'me', 0, NOW), { ok: false, reason: 'sold_out' });
  assert.deepEqual(L.recordPrimarySale(saleEvent(), 'z1', 2, 'me', 3, NOW), { ok: false, reason: 'over_limit' });
  assert.deepEqual(L.recordPrimarySale(saleEvent(), 'z1', 5, 'me', 0, NOW), { ok: false, reason: 'invalid_qty' });
  assert.deepEqual(L.recordPrimarySale(saleEvent(), 'z1', 0, 'me', 0, NOW), { ok: false, reason: 'invalid_qty' });
  assert.deepEqual(L.recordPrimarySale(saleEvent(), 'z1', 1.5, 'me', 0, NOW), { ok: false, reason: 'invalid_qty' });
  assert.deepEqual(L.recordPrimarySale(saleEvent({ status: 'draft' }), 'z1', 1, 'me', 0, NOW), { ok: false, reason: 'not_on_sale' });
  assert.deepEqual(L.recordPrimarySale(saleEvent(), 'nope', 1, 'me', 0, NOW), { ok: false, reason: 'sold_out' });
});

test('recordPrimarySale marks the event sold out when the last paid seat goes', () => {
  const last = saleEvent({ zones: [zone({ capacity: 10, sold: 9 }), zone({ id: 'z9', kind: 'comp', price: 0, capacity: 5 })] });
  const r = L.recordPrimarySale(last, 'z1', 1, 'me', 0, NOW);
  assert.equal(r.event.status, 'sold_out');
});

test('reasonText has Thai text for every reason', () => {
  for (const r of ['unknown_ticket', 'wrong_event', 'cancelled', 'event_ended', 'used', 'refunded', 'not_owner', 'expired_qr', 'future_qr']) {
    assert.match(L.reasonText(r), /[ก-๙]/);
  }
});
