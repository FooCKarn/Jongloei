// JONGLOEI organizer logic: pure functions shared by mockup/index.html (organizer mode)
// and tests/organizer/logic.test.js. No DOM, no storage.
// Money is always an integer number of satang (1 baht = 100 satang), per context.md 10.2.
(function () {
'use strict';

const FEE_FIXED = 500;      // 5 baht per ticket, charged to the shop
const FEE_PCT = 3;          // + 3% of face price
const COMMISSION_PCT = 6;   // resale commission, charged to the seller
const CAP_MIN = 1, CAP_MAX = 1.25;

// x * pct / 100, rounded half-up, on integers only.
const pctHalfUp = (x, pct) => Math.floor((x * pct + 50) / 100);

/* ---------- money ---------- */

function toSatang(baht) {
  const s = typeof baht === 'number' ? String(baht) : String(baht ?? '').trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return NaN;
  const [whole, frac = ''] = s.replace('-', '').split('.');
  const v = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return s.startsWith('-') ? -v : v;
}

function fmtBaht(satang) {
  const neg = satang < 0, a = Math.abs(Math.round(satang));
  const whole = Math.floor(a / 100).toLocaleString('en-US'), frac = a % 100;
  return (neg ? '-' : '') + '฿' + whole + (frac ? '.' + String(frac).padStart(2, '0') : '');
}

const serviceFee = face => FEE_FIXED + pctHalfUp(face, FEE_PCT);
const commission = resale => pctHalfUp(resale, COMMISSION_PCT);

function resaleCap(face, capMultiplier) {
  const m = Math.min(CAP_MAX, Math.max(CAP_MIN, Number(capMultiplier) || CAP_MIN));
  return Math.floor(face * Math.round(m * 100) / 100);
}

// Shop gets face − fee; the seller of hop i gets what hop i+1 paid, minus commission.
function settleTicket(ticket, face) {
  const hops = ticket.hops || [];
  const shopFee = hops.length && hops[0].paid > 0 ? serviceFee(face) : 0;
  const shopNet = hops.length && hops[0].paid > 0 ? face - shopFee : 0;
  const sellerPayouts = [];
  let comm = 0;
  for (let i = 0; i + 1 < hops.length; i++) {
    const c = commission(hops[i + 1].paid);
    comm += c;
    sellerPayouts.push({ payerId: hops[i].payerId, amount: hops[i + 1].paid - c });
  }
  const totalIn = hops.reduce((s, h) => s + h.paid, 0);
  return { shopNet, shopFee, commission: comm, totalIn, sellerPayouts };
}

// Face = what the buyer paid for the first hop (list price, or less when a promo code was used).
function settleEvent(event, tickets) {
  const out = { shopNet: 0, shopFee: 0, commission: 0, totalIn: 0, sellerPayouts: [] };
  for (const t of tickets) {
    if (t.eventId !== event.id) continue;
    const r = settleTicket(t, t.hops && t.hops[0] && t.hops[0].paid > 0 ? t.hops[0].paid : 0);
    out.shopNet += r.shopNet; out.shopFee += r.shopFee; out.commission += r.commission; out.totalIn += r.totalIn;
    out.sellerPayouts.push(...r.sellerPayouts);
  }
  return out;
}

/* ---------- rules ---------- */

const isInt = v => typeof v === 'number' && Number.isInteger(v);

function validateZone(z) {
  const errors = {};
  const name = String(z.name ?? '').trim();
  if (!name) errors.name = 'ใส่ชื่อโซน';
  else if (name.length > 40) errors.name = 'ชื่อโซนยาวได้ไม่เกิน 40 ตัวอักษร';
  if (z.kind === 'comp') {
    if (z.price !== 0) errors.price = 'บัตรเชิญต้องเป็นราคา ฿0';
  } else if (!isInt(z.price) || z.price < 100) {
    errors.price = 'ราคาต้องอย่างน้อย ฿1 และมีทศนิยมไม่เกิน 2 ตำแหน่ง';
  }
  if (!isInt(z.capacity) || z.capacity < 1) errors.capacity = 'จำนวนต้องเป็นจำนวนเต็มอย่างน้อย 1';
  if (z.kind === 'table' && (!isInt(z.seatsPerUnit) || z.seatsPerUnit < 2 || z.seatsPerUnit > 20)) {
    errors.seatsPerUnit = 'จำนวนที่นั่งต่อโต๊ะต้องอยู่ระหว่าง 2-20';
  }
  if (z.saleStartAt && z.saleEndAt && z.saleEndAt <= z.saleStartAt) errors.saleEndAt = 'เวลาปิดขายต้องหลังเวลาเปิดขาย';
  return { ok: !Object.keys(errors).length, errors };
}

function validateEvent(ev, now) {
  const errors = {};
  const name = String(ev.name ?? '').trim();
  if (name.length < 3 || name.length > 80) errors.name = 'ชื่องานต้องยาว 3-80 ตัวอักษร';
  if (!ev.startAt) errors.startAt = 'ใส่วันเวลาเริ่มงาน';
  else if (ev.startAt <= now) errors.startAt = 'วันเริ่มงานต้องอยู่ในอนาคต';
  if (!ev.endAt) errors.endAt = 'ใส่วันเวลาจบงาน';
  else if (ev.startAt && ev.endAt <= ev.startAt) errors.endAt = 'เวลาจบต้องหลังเวลาเริ่ม';
  const zones = ev.zones || [];
  if (!zones.length) errors.zones = 'เพิ่มโซนตั๋วอย่างน้อย 1 โซน';
  zones.forEach((z, i) => {
    for (const [k, msg] of Object.entries(validateZone(z).errors)) errors[`zones.${i}.${k}`] = msg;
    if (z.saleStartAt && ev.startAt && z.saleStartAt >= ev.startAt) errors[`zones.${i}.saleStartAt`] = 'ต้องเปิดขายก่อนงานเริ่ม';
  });
  if (zones.length && zones.reduce((s, z) => s + (isInt(z.capacity) ? z.capacity : 0), 0) < 1) errors.zones = 'ความจุรวมต้องอย่างน้อย 1 ที่';
  const cap = ev.params?.capMultiplier;
  if (!(cap >= CAP_MIN && cap <= CAP_MAX)) errors.capMultiplier = 'เพดานขายต่อต้องอยู่ระหว่าง 1.00-1.25 เท่า';
  return { ok: !Object.keys(errors).length, errors };
}

function canEditZone(z, patch) {
  const taken = (z.sold || 0) + (z.held || 0);
  if (taken > 0 && 'price' in patch && patch.price !== z.price) return { ok: false, reason: 'มีผู้ซื้อแล้ว ราคาเปลี่ยนไม่ได้ (สร้างโซนใหม่แทนได้)' };
  if (taken > 0 && 'kind' in patch && patch.kind !== z.kind) return { ok: false, reason: 'มีผู้ซื้อแล้ว ประเภทโซนเปลี่ยนไม่ได้' };
  if ('capacity' in patch && patch.capacity < taken) return { ok: false, reason: `ลดได้ต่ำสุด ${taken} ที่ (ขายแล้วและกำลังจองอยู่)` };
  return { ok: true };
}

// One refund per paid hop, keyed ticketId:idx so a re-run never refunds twice.
function planCancellation(event, tickets, alreadyRefunded) {
  const refunds = [];
  let skipped = 0;
  for (const t of tickets) {
    if (t.eventId !== event.id) continue;
    for (const h of t.hops || []) {
      if (!(h.paid > 0)) continue;
      const key = t.ticketId + ':' + h.idx;
      if (alreadyRefunded.has(key)) { skipped++; continue; }
      refunds.push({ key, ticketId: t.ticketId, payerId: h.payerId, amount: h.paid });
    }
  }
  return { refunds, total: refunds.reduce((s, r) => s + r.amount, 0), skipped };
}

const QR_MAX_AGE_S = 60, QR_MAX_FUTURE_S = 15;

function checkinResult({ ticket, event, signerId, ts, now }) {
  const no = reason => ({ valid: false, reason });
  if (!ticket) return no('unknown_ticket');
  if (ticket.eventId !== event.id) return no('wrong_event');
  if (event.status === 'cancelled') return no('cancelled');
  if (event.status === 'ended') return no('event_ended');
  if (ticket.status === 'used') return no('used');
  if (ticket.status === 'refunded') return no('refunded');
  if (ticket.status === 'unavailable') return no('event_ended');
  if (signerId !== ticket.holderId) return no('not_owner');
  const age = (now - ts) / 1000;
  if (age > QR_MAX_AGE_S) return no('expired_qr');
  if (age < -QR_MAX_FUTURE_S) return no('future_qr');
  return { valid: true };
}

const REASONS = {
  unknown_ticket: 'ไม่พบตั๋วนี้ในระบบ',
  wrong_event: 'ตั๋วนี้เป็นของงานอื่น',
  cancelled: 'งานนี้ถูกยกเลิกแล้ว ตั๋วได้รับเงินคืนแล้ว',
  event_ended: 'งานจบแล้ว ตั๋วใช้ไม่ได้',
  used: 'ตั๋วนี้ถูกใช้เข้างานแล้ว',
  refunded: 'ตั๋วนี้คืนเงินแล้ว',
  not_owner: 'QR ไม่ได้มาจากเจ้าของตั๋วคนปัจจุบัน (อาจขายต่อไปแล้ว)',
  expired_qr: 'QR หมดอายุ (เกิน 60 วินาที) ให้เปิด QR ใหม่',
  future_qr: 'เวลาใน QR ไม่ถูกต้อง (ล้ำอนาคต) ให้ตรวจเวลาเครื่อง',
};
const reasonText = r => REASONS[r] || 'ตรวจสอบไม่ผ่าน';

/* ---------- buyer bridge ---------- */

const TZ = 'Asia/Bangkok';
const fDate = new Intl.DateTimeFormat('th-TH', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fTime = new Intl.DateTimeFormat('th-TH', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const thaiDate = ms => fDate.format(ms);
const thaiTime = ms => fTime.format(ms);

const paidZones = ev => (ev.zones || []).filter(z => z.kind !== 'comp');
const left = z => z.capacity - (z.sold || 0) - (z.held || 0);

// Organizer event (satang) -> the shape of EVENTS in mockup/index.html (baht).
function toBuyerEvent(ev) {
  const zones = paidZones(ev);
  const cap = zones.reduce((s, z) => s + z.capacity, 0);
  const taken = zones.reduce((s, z) => s + (z.sold || 0) + (z.held || 0), 0);
  const short = ev.short || String(ev.name || '').trim().split(/\s+/).slice(0, 2).join('\n').toUpperCase();
  return {
    id: ev.id, source: 'local', name: ev.name, short, tag: ev.category, venue: ev.venue, bg: ev.bg,
    date: ev.startAt ? thaiDate(ev.startAt) : '', time: ev.startAt ? thaiTime(ev.startAt) : '',
    sold: cap ? Math.floor(taken * 100 / cap) : 0, paused: ev.status === 'paused', _startAt: ev.startAt,
    zones: zones.map(z => ({ z: z.name, p: z.price / 100, left: left(z), c: z.color, zoneId: z.id })),
  };
}

function recordPrimarySale(ev, zoneId, qty, buyerId, ownedCount, now) {
  if (ev.status !== 'on_sale') return { ok: false, reason: 'not_on_sale' };
  if (!Number.isInteger(qty) || qty < 1 || qty > 4) return { ok: false, reason: 'invalid_qty' };
  if (ownedCount + qty > (ev.params?.perUserLimit ?? 4)) return { ok: false, reason: 'over_limit' };
  const zone = (ev.zones || []).find(z => z.id === zoneId && z.kind !== 'comp');
  if (!zone || qty > left(zone)) return { ok: false, reason: 'sold_out' };
  const tickets = Array.from({ length: qty }, (_, k) => ({
    ticketId: `${ev.id}-${zone.id}-${zone.sold + k + 1}`, eventId: ev.id, zoneId: zone.id, holderId: buyerId,
    status: 'valid', hops: [{ idx: 0, payerId: buyerId, paid: zone.price, at: now }],
  }));
  const zones = ev.zones.map(z => z === zone ? { ...z, sold: z.sold + qty } : z);
  const next = { ...ev, zones };
  if (paidZones(next).every(z => left(z) <= 0)) next.status = 'sold_out';
  return { ok: true, event: next, tickets };
}

/* ---------- dashboard ---------- */

// With a tickets list, revenue comes from what buyers actually paid (promo discounts included); without, from list prices.
function summarize(ev, tickets) {
  const out = { capacity: 0, sold: 0, held: 0, remaining: 0, gross: 0, fees: 0, net: 0, comps: 0 };
  for (const z of ev.zones || []) {
    out.capacity += z.capacity; out.sold += z.sold || 0; out.held += z.held || 0;
    if (z.kind === 'comp') { out.comps += z.sold || 0; continue; }
    if (tickets) continue;
    out.gross += z.price * (z.sold || 0);
    out.fees += serviceFee(z.price) * (z.sold || 0);
  }
  if (tickets) {
    const comp = new Set((ev.zones || []).filter(z => z.kind === 'comp').map(z => z.id));
    for (const t of tickets) {
      const paid = t.hops && t.hops[0] ? t.hops[0].paid : 0;
      if (t.eventId !== ev.id || comp.has(t.zoneId) || !(paid > 0)) continue;
      out.gross += paid; out.fees += serviceFee(paid);
    }
  }
  out.remaining = out.capacity - out.sold - out.held;
  out.net = out.gross - out.fees;
  return out;
}

function duplicateEvent(ev, newId) {
  const c = JSON.parse(JSON.stringify(ev));
  c.id = newId; c.status = 'draft'; c.name = ev.name + ' (สำเนา)';
  c.startAt = c.endAt = c.doorsAt = null; c.cancelReason = '';
  c.zones = c.zones.map(z => ({ ...z, sold: 0, held: 0 }));
  return c;
}

// First-hop (primary) paid sales per Bangkok calendar day, oldest first. `day` is the day number since epoch.
function salesByDay(tickets, now, days) {
  const OFFSET = 7 * 3600000, DAY = 86400000;
  const last = Math.floor((now + OFFSET) / DAY);
  const out = Array.from({ length: days }, (_, i) => ({ day: last - (days - 1) + i, count: 0, amount: 0 }));
  for (const t of tickets) {
    const h = t.hops && t.hops[0];
    if (!h || !(h.paid > 0)) continue;
    const slot = out[Math.floor((h.at + OFFSET) / DAY) - (last - (days - 1))];
    if (slot) { slot.count++; slot.amount += h.paid; }
  }
  return out;
}

function applyPromo(code, promos, zoneId, priceSatang, now) {
  const fail = reason => ({ ok: false, price: priceSatang, reason });
  const p = promos.find(x => !x.disabled && String(x.code).toUpperCase() === String(code || '').trim().toUpperCase());
  if (!p || !String(code || '').trim()) return fail('not_found');
  if (p.zoneId && p.zoneId !== zoneId) return fail('wrong_zone');
  if (now < p.startsAt || now > p.endsAt) return fail('expired');
  if ((p.used || 0) >= p.maxUses) return fail('used_up');
  const off = p.percentOff ? pctHalfUp(priceSatang, p.percentOff) : p.amountOff || 0;
  return { ok: true, price: Math.max(0, priceSatang - off) };
}

// When the shop is paid: event end + dispute window (context.md 5.6). Cancelled events pay nothing.
function payoutAt(ev) {
  if (ev.status === 'cancelled' || !ev.endAt) return null;
  return ev.endAt + (ev.params?.disputeWindowH ?? 24) * 3600000;
}

const OrgLogic = { applyPromo, summarize, duplicateEvent, salesByDay, payoutAt, toSatang, fmtBaht, serviceFee, commission, resaleCap, settleTicket, settleEvent,
  validateZone, validateEvent, canEditZone, planCancellation, checkinResult, reasonText,
  thaiDate, thaiTime, toBuyerEvent, recordPrimarySale };
globalThis.OrgLogic = OrgLogic;
if (typeof module !== 'undefined') module.exports = OrgLogic;
})();
