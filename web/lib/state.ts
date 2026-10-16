// App state: one mutable object S (as in the mock-up), persisted to localStorage, plus a tiny
// subscription so React re-renders after an action calls emit(). Money on the organizer side is
// in satang (see lib/org-logic.js); buyer events carry whole baht.
import { useSyncExternalStore } from "react";
import OLmod from "./org-logic";
import { getLang, tr } from "./i18n";

export const OL: any = OLmod as any;

export const HOUR = 3600000, DAY = 24 * HOUR;
export const CONTRACT = "0x7a3F9e21B4c0D58aE6f1b2C9d04E7f3A15b8c91E";
export const fmt = (n: number) => (getLang() === "en" ? "฿" + n.toLocaleString("en-US") : n.toLocaleString("th-TH") + "฿");
export const short = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);
export const isLocal = (id: string) => String(id || "").startsWith("org-");

export const POSTERS = [
  "linear-gradient(140deg,#A00018,#4A0010 70%,#1E0508)", "linear-gradient(160deg,#C2412D,#7E0013 60%,#2B0A0E)",
  "linear-gradient(150deg,#D6455A,#A00018 45%,#3D0710)", "linear-gradient(130deg,#8A1020,#2A0A0D)",
  "linear-gradient(150deg,#2B4C7E,#1B2A4A 60%,#0D1424)", "linear-gradient(140deg,#B86B12,#7A3D08 60%,#2A1404)",
];

export const FALLBACK_EVENTS = [
  { id: "neon", name: "BKK Neon Nights 2026", short: "NEON\nNIGHTS", tag: "คอนเสิร์ต", date: "ส. 21 พ.ย. 2569", time: "19:00", venue: "อิมแพ็ค อารีนา เมืองทองธานี", bg: POSTERS[0],
    zones: [{ z: "Standing A", p: 2500, left: 182, c: "var(--zone-1)" }, { z: "Seat B", p: 3800, left: 64, c: "var(--zone-2)" }, { z: "VIP Front", p: 5500, left: 9, c: "var(--zone-3)" }], sold: 86 },
  { id: "jazz", name: "Siam River Jazz Festival", short: "RIVER\nJAZZ", tag: "เทศกาลดนตรี", date: "ส. 5 ธ.ค. 2569", time: "16:00", venue: "ลานริมน้ำ เจริญกรุง", bg: POSTERS[1],
    zones: [{ z: "บัตรเข้าชมวันเดียว", p: 1800, left: 420, c: "var(--zone-1)" }, { z: "บัตรเข้าชม 2 วัน", p: 3200, left: 150, c: "var(--zone-2)" }], sold: 58 },
  { id: "fan", name: "Starlight Fan Meeting in Bangkok", short: "STAR\nLIGHT", tag: "แฟนมีตติ้ง", date: "อา. 13 ธ.ค. 2569", time: "17:30", venue: "ธันเดอร์โดม เมืองทองธานี", bg: POSTERS[2],
    zones: [{ z: "Zone C", p: 2900, left: 0, c: "var(--zone-1)" }, { z: "Zone B", p: 4200, left: 31, c: "var(--zone-2)" }, { z: "Hi-Touch A", p: 6900, left: 4, c: "var(--zone-3)" }], sold: 97 },
  { id: "standup", name: "Late Night Stand-up Special", short: "LATE\nNIGHT", tag: "สแตนด์อัปคอมเมดี", date: "ศ. 9 ม.ค. 2570", time: "20:00", venue: "สามย่านมิตรทาวน์ ฮอลล์", bg: POSTERS[3],
    zones: [{ z: "Regular", p: 1500, left: 240, c: "var(--zone-1)" }, { z: "Front Row", p: 2600, left: 22, c: "var(--zone-2)" }], sold: 41 },
];

const BUYER_NAMES = ["ปิยะพงษ์ ศรีสุข", "ณัฐธิดา วงศ์ใหญ่", "ธนกร แก้วมณี", "ศิริพร ทองดี", "กิตติพัฒน์ บุญมา", "พิมพ์ชนก ใจดี",
  "วรเมธ สุวรรณรัตน์", "อรอุมา เพชรงาม", "ภูริ ชัยมงคล", "กมลชนก รุ่งเรือง", "ณัฐพล อินทร์แก้ว", "ชนิดา พรหมมา",
  "อภิสิทธิ์ ศักดิ์ดี", "สุภัสสรา นาคสวัสดิ์", "ธีรเดช มีสุข", "ปาริชาติ ทองคำ", "จิรายุ วงศ์สวัสดิ์", "เบญจมาศ แสงทอง",
  "ศุภกร สมบูรณ์", "ณิชา ปัญญาดี", "พงศกร ศรีวงศ์", "กัญญาณัฐ บุญรอด", "วีรภัทร จันทร์หอม", "มนัสนันท์ ศรีอ่อน"];
export const ORG_PARAMS = { resaleEnabled: true, capMultiplier: 1.25, resaleDelayH: 6, transferCutoffH: 1, disputeWindowH: 24, perUserLimit: 4 };
const DEMO_SHOP = { id: "shop-demo", name: "Midnight Society", kind: "bar", legal: "company", taxId: "0105559012345", contactLine: "@midnightsociety",
  phone: "0812345678", payoutPromptPay: "0105559012345", verification: "verified", docName: "หนังสือรับรองบริษัท.pdf",
  team: [{ email: "owner@midnightsociety.example", role: "owner" }, { email: "door.staff@example.com", role: "gate" }, { email: "manager@example.com", role: "manager" }] };
// organizer accounts are separate from the buyer's Google login; the sample shop's three team members already have one
export const DEMO_ACCOUNTS: Record<string, any> = { "owner@midnightsociety.example": { name: "คุณมินต์ (เจ้าของ Midnight Society)", shopId: "shop-demo" },
  "manager@example.com": { name: "คุณเมย์ (ผู้จัดการระบบ)", shopId: "shop-demo" }, "door.staff@example.com": { name: "พี่โด่ง (เจ้าหน้าที่ปฏิบัติการหน้างาน)", shopId: "shop-demo" } };
const SEED_LISTING = { lid: 9001, ev: "org-fri", zone: "Standing", face: 1000, price: 1150, seller: "0x7C1e…44Ab", transfers: 0, tid: 5002, orgTicketId: "org-fri-std-2" };

/* ---------- state ---------- */
export const S: any = {
  auth: { google: false }, signedIn: false,
  user: { name: "ชนกานต์", email: "chonnakarn@gmail.com", wallet: "0x4B21c7aE90F3d18b52A6e4c0F7D93a1B2e8C5d07" },
  ev: "neon", zone: 0, qty: 1, pay: "promptpay", tickets: [] as any[],
  q: "", cat: "ทั้งหมด", mcat: "all", slide: 0,
  listings: [
    { lid: 1, ev: "fan", zone: "Zone B", face: 4200, price: 4600, seller: "0x91aD…3F0c", transfers: 1, tid: 1182 },
    { lid: 2, ev: "neon", zone: "VIP Front", face: 5500, price: 6200, seller: "0x2C77…e19A", transfers: 0, tid: 66 },
    { lid: 3, ev: "fan", zone: "Zone C", face: 2900, price: 2900, seller: "0x5bE0…7712", transfers: 0, tid: 2045 },
  ],
  sel: null, nextTid: 1311, buyingListing: null, mtab: "active",
  mode: "buyer", org: null as any, orgDemo: null, orgLive: null, orgLiveWanted: false,
  order: null, promo: null, realListings: null, desk: false, copied: false, hideMarketNote: false,
};

// event lists: BASE comes from /api/events (or the fallback); published demo organizer events join it
export const EV: { base: any[]; all: any[] } = { base: FALLBACK_EVENTS, all: FALLBACK_EVENTS };

/* ---------- re-render subscription ---------- */
let version = 0;
const listeners = new Set<() => void>();
export function emit() { version++; listeners.forEach(l => l()); save(); }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function useApp() { useSyncExternalStore(subscribe, () => version, () => 0); return S; }

/* ---------- saved state (this browser only) ---------- */
const KEY = "jongloei-demo-v1";
export const demoOrg = () => (S.org && S.org.live ? S.orgDemo : S.org);
export function save() {
  if (typeof window === "undefined") return;
  // S.org.shop is the live copy of the signed-in organizer's shop; keep the shops list in step before writing
  if (S.org && S.org.shop && S.org.shops) S.org.shops = S.org.shops.map((s: any) => (s.id === S.org.shop.id ? S.org.shop : s));
  // a real shop (S.org.live) is never written here; only the wish to reopen it after a reload
  const live = !!(S.org && S.org.live) || !!S.orgLive;
  try {
    localStorage.setItem(KEY, JSON.stringify({ signedIn: S.signedIn, tickets: S.tickets, listings: S.listings, nextTid: S.nextTid,
      mode: S.mode, org: demoOrg(), orgLive: live, ev: S.ev, zone: S.zone, qty: S.qty, buyingListing: S.buyingListing, sel: S.sel }));
  } catch (_) { /* storage full or blocked: the demo keeps running in memory */ }
}
export function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!d) return;
    Object.assign(S, { signedIn: !!d.signedIn, tickets: d.tickets || [], listings: d.listings || S.listings, nextTid: d.nextTid || S.nextTid,
      mode: d.mode === "org" ? "org" : "buyer", org: d.org || null, orgLiveWanted: !!d.orgLive,
      ev: d.ev || S.ev, zone: d.zone || 0, qty: d.qty || 1, buyingListing: d.buyingListing || null, sel: d.sel || null });
  } catch (_) { /* corrupt storage: start fresh */ }
}
export function resetDemo() { try { localStorage.removeItem(KEY); } catch (_) {} }

/* ---------- buyer events ---------- */
// organizer names are typed by people; React escapes them when rendered, so no extra escaping here
export function toBuyerEvent(ev: any) {
  return { ...OL.toBuyerEvent(ev), image: ev.image || null, desc: ev.description || "", startAt: ev.startAt || null };
}
export function refreshEvents() {
  const o = demoOrg();
  const pub = o ? o.events.filter((e: any) => ["on_sale", "sold_out", "paused"].includes(e.status)).map(toBuyerEvent) : [];
  EV.all = EV.base.concat(pub);
}
// organizer events that left the buyer list (cancelled / ended) still resolve, so tickets for them keep rendering
export function evById(id: string): any {
  const o = demoOrg();
  return EV.all.find(e => e.id === id) || (o && isLocal(id) && o.events.find((e: any) => e.id === id) ? toBuyerEvent(o.events.find((e: any) => e.id === id)) : undefined);
}
export const minPrice = (ev: any) => Math.min(...ev.zones.map((z: any) => z.p));
export const initial = () => [...tr(String(S.user.name || S.user.email || "?")).trim()][0] || "?";

/* ---------- organizer demo seed ---------- */
export function orgSeed(now: number) {
  const hr = Math.floor(now / HOUR) * HOUR;
  const buyers: Record<string, any> = {};
  BUYER_NAMES.forEach((n, i) => { buyers["b" + (i + 1)] = { name: n, email: "buyer" + (i + 1) + "@example.com", phone: "08" + String(12345678 + i * 271828).slice(-8) }; });
  const z = (id: string, name: string, kind: string, baht: number, capacity: number, sold: number, color: string, extra?: any) =>
    ({ id, name, kind, price: baht * 100, capacity, sold, held: 0, color, saleStartAt: null, saleEndAt: null, seatsPerUnit: null, ...extra });
  const ev = (o: any) => ({ shopId: "shop-demo", short: "", description: "", mapUrl: "", cancelReason: "", image: null, params: { ...ORG_PARAMS }, ...o });
  const events = [
    ev({ id: "org-fri", name: "Friday Rooftop Session", short: "ROOFTOP\nFRIDAY", category: "ปาร์ตี้สังสรรค์", venue: "Midnight Society ทองหล่อ", bg: POSTERS[2], status: "on_sale",
      description: "เพลิดเพลินกับดีเจเซ็ตยาวบนดาดฟ้า พร้อมวิวเมืองยามค่ำคืน แต่งกายสบายๆ สำหรับผู้มีอายุ 20 ปีขึ้นไป", doorsAt: hr - HOUR / 2, startAt: hr + HOUR, endAt: hr + 5 * HOUR,
      zones: [z("std", "Standing", "standing", 1000, 120, 64, "#E8485A", { held: 3 }), z("tbl", "โต๊ะ 4 ที่นั่ง", "table", 4000, 10, 6, "#A00018", { seatsPerUnit: 4 }),
        z("vip", "VIP Lounge", "seated", 2500, 20, 12, "#4A0010"), z("cmp", "บัตรเชิญพิเศษ", "comp", 0, 10, 4, "#9A5B00")] }),
    ev({ id: "org-latte", name: "Latte Art Workshop รอบเย็น", short: "LATTE\nART", category: "workshop", venue: "Midnight Society ชั้น 3", bg: POSTERS[5], status: "on_sale",
      description: "เรียนรู้เทคนิคการเทนม Latte Art กับบาริสต้าแชมป์ระดับประเทศ พร้อมลงมือปฏิบัติจริงด้วยเครื่องชงส่วนตัวคนละเครื่อง", doorsAt: hr + 12 * DAY - HOUR / 2, startAt: hr + 12 * DAY, endAt: hr + 12 * DAY + 3 * HOUR,
      zones: [z("seat", "ที่นั่ง Workshop", "seated", 1500, 12, 9, "#E8485A")] }),
    ev({ id: "org-halloween", name: "Halloween Rooftop Party", short: "HALLO\nWEEN", category: "ปาร์ตี้สังสรรค์", venue: "Midnight Society ทองหล่อ", bg: POSTERS[3], status: "draft",
      doorsAt: hr + 16 * DAY - HOUR, startAt: hr + 16 * DAY, endAt: hr + 16 * DAY + 6 * HOUR,
      zones: [z("early", "Early Bird", "standing", 600, 50, 0, "#E8485A", { saleEndAt: hr + 9 * DAY }), z("std", "Standing", "standing", 800, 150, 0, "#A00018")] }),
    ev({ id: "org-jazz", name: "Jazz Night Vol.3", short: "JAZZ\nNIGHT", category: "คอนเสิร์ต", venue: "Midnight Society ทองหล่อ", bg: POSTERS[4], status: "ended",
      doorsAt: hr - 3 * DAY - HOUR, startAt: hr - 3 * DAY, endAt: hr - 3 * DAY + 4 * HOUR, zones: [z("seat", "Seat", "seated", 1200, 60, 52, "#E8485A")] }),
    ev({ id: "org-acoustic", name: "Acoustic Sunday", short: "ACOUSTIC\nSUNDAY", category: "คอนเสิร์ต", venue: "ลานหญ้า Midnight Society", bg: POSTERS[1], status: "cancelled", cancelReason: "สภาพอากาศ",
      doorsAt: hr + 2 * DAY - HOUR, startAt: hr + 2 * DAY, endAt: hr + 2 * DAY + 3 * HOUR, zones: [z("std", "Standing", "standing", 900, 40, 18, "#E8485A")] }),
  ];
  const tickets: any[] = [], ledger: any[] = [], checkinLog: any[] = [];
  let b = 0;
  const nextBuyer = () => "b" + ((b++ % BUYER_NAMES.length) + 1);
  for (const e of events) for (const zz of e.zones) for (let k = 1; k <= zz.sold; k++) {
    const holder = nextBuyer();
    const at = Math.min(e.startAt - HOUR, now) - ((k * 37) % 14) * DAY - ((k * 5) % 12) * HOUR;
    const t: any = { ticketId: `${e.id}-${zz.id}-${k}`, eventId: e.id, zoneId: zz.id, holderId: holder, status: "valid", usedAt: null, checkinMethod: null,
      hops: [{ idx: 0, payerId: holder, paid: zz.price, at }] };
    if (e.status === "ended") t.status = k <= 46 ? "used" : "unavailable";
    if (e.status === "cancelled") t.status = "refunded";
    tickets.push(t);
  }
  const tk = (id: string) => tickets.find(t => t.ticketId === id);
  // one ticket resold twice (context.md 5.6 example), one listed, eight already at the door
  const hop = tk("org-fri-std-1"); hop.hops = [{ idx: 0, payerId: "b1", paid: 100000, at: now - 9 * DAY }, { idx: 1, payerId: "b2", paid: 110000, at: now - 6 * DAY }, { idx: 2, payerId: "b3", paid: 120000, at: now - 2 * DAY }]; hop.holderId = "b3";
  const listed = tk("org-fri-std-2"); listed.status = "listed"; listed.holderId = "b5"; listed.hops[0].payerId = "b5";
  for (let k = 3; k <= 10; k++) {
    const t = tk("org-fri-std-" + k); t.status = "used"; t.usedAt = now - (40 - k * 3) * 60000; t.checkinMethod = "scan";
    checkinLog.unshift({ at: t.usedAt, ticketId: t.ticketId, eventId: "org-fri", valid: true, reason: null, method: "scan", by: "door.staff@example.com" });
  }
  for (const t of tickets) for (const h of t.hops) if (h.paid > 0) ledger.push({ id: "in:" + t.ticketId + ":" + h.idx, eventId: t.eventId, ticketId: t.ticketId, type: "PAYMENT_IN", amount: h.paid, party: h.payerId, status: "DONE", idempotencyKey: "in:" + t.ticketId + ":" + h.idx });
  const ac = events.find(e => e.id === "org-acoustic");
  for (const r of OL.planCancellation(ac, tickets, new Set()).refunds) ledger.push({ id: r.key, eventId: ac.id, ticketId: r.ticketId, type: "REFUND_OUT", amount: r.amount, party: r.payerId, status: "DONE", idempotencyKey: r.key });
  return { account: null, accounts: JSON.parse(JSON.stringify(DEMO_ACCOUNTS)), shops: [JSON.parse(JSON.stringify(DEMO_SHOP))], shop: null, role: null, authMode: "login",
    events, tickets, buyers, ledger, checkinLog, promos: [], announcements: [],
    oev: null, etab: "overview", evFilter: "all", draft: null, wizStep: 1, wizErr: {}, onboard: { step: 1, data: {} }, bq: "", bzone: "all", bstatus: "all", showEmails: false };
}
export function ensureOrg() {
  if (!S.org || !Array.isArray(S.org.events) || !S.org.accounts) {
    S.org = orgSeed(Date.now());
    if (!S.listings.some((l: any) => l.orgTicketId)) S.listings.push({ ...SEED_LISTING });
  }
  refreshEvents();
}
export const orgEv = (id: string) => S.org.events.find((e: any) => e.id === id);
export function replaceOrgEvent(ev: any) { S.org.events = S.org.events.map((e: any) => (e.id === ev.id ? ev : e)); refreshEvents(); }
export function orgPerson(id: string) { if (id === "me") return { name: tr(S.user.name), email: S.user.email, phone: "" }; const b = S.org.buyers[id]; return b ? { ...b, name: tr(b.name) } : { name: id, email: "", phone: "" }; }
export function ledgerAdd(x: any) { if (S.org.ledger.some((l: any) => l.idempotencyKey === x.idempotencyKey)) return false; S.org.ledger.push({ id: x.idempotencyKey, status: "DONE", ...x }); return true; }
export const myEvents = () => S.org.events.filter((e: any) => (e.shopId || "shop-demo") === S.org.shop.id);
export const myEventIds = () => new Set(myEvents().map((e: any) => e.id));
export const evTickets = (id: string) => S.org.tickets.filter((t: any) => t.eventId === id);
// revenue figures from what buyers actually paid (promo discounts included); drafts have no tickets so use list prices
export const evSum = (e: any) => OL.summarize(e, e.status === "draft" || S.org.live ? undefined : evTickets(e.id).filter((t: any) => t.status !== "refunded"));
// keeps the buyer-side copy of a ticket and the organizer ticket in step
export function orgTicketStatus(buyerTicket: any, status: string) {
  const ot = buyerTicket && buyerTicket.orgTicketId && S.org.tickets.find((x: any) => x.ticketId === buyerTicket.orgTicketId);
  if (!ot) return; ot.status = status; if (status === "used") { ot.usedAt = Date.now(); ot.checkinMethod = "scan"; }
}
export const rand = (n: number) => Array.from({ length: n }, () => "0123456789abcdef"[(Math.random() * 16) | 0]).join("");
