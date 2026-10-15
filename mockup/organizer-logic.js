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

function settleEvent(event, tickets) {
  const price = new Map((event.zones || []).map(z => [z.id, z.price]));
  const out = { shopNet: 0, shopFee: 0, commission: 0, totalIn: 0, sellerPayouts: [] };
  for (const t of tickets) {
    if (t.eventId !== event.id) continue;
    const r = settleTicket(t, price.get(t.zoneId) || 0);
    out.shopNet += r.shopNet; out.shopFee += r.shopFee; out.commission += r.commission; out.totalIn += r.totalIn;
    out.sellerPayouts.push(...r.sellerPayouts);
  }
  return out;
}

const OrgLogic = { toSatang, fmtBaht, serviceFee, commission, resaleCap, settleTicket, settleEvent };
globalThis.OrgLogic = OrgLogic;
if (typeof module !== 'undefined') module.exports = OrgLogic;
})();
