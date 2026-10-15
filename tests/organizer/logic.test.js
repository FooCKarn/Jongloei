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
