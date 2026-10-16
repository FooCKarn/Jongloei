"use client";
// Buyer actions: events, sign-in, purchase (demo PromptPay or Stripe), tickets, resale, filters.
// Ported from the mock-up; every button either calls the Worker API or, in the demo, says it is simulated.
import { useState } from "react";
import { S, EV, OL, emit, save, fmt, short, isLocal, evById, refreshEvents, ledgerAdd, orgTicketStatus, replaceOrgEvent, orgEv,
  rand, initial, resetDemo, HOUR, DAY } from "./state";
import { go, back, currentScreen } from "./nav";
import { toast, mockToast, sheet, closeSheet } from "./ui";
import { enterOrg, orgLiveStart } from "./org";

/* ---------- API helpers ---------- */
export const isWeb = () => typeof window !== "undefined" && /^https?:$/.test(location.protocol);
export async function readJsonResponse(response: Response, endpoint: string) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(response.status === 404 ? `ไม่พบ ${endpoint} กรุณา deploy Worker เวอร์ชันล่าสุด`
      : `${endpoint} ส่งข้อมูลไม่ใช่ JSON (HTTP ${response.status}) กรุณาตรวจสอบว่าเปิดจาก Worker URL`);
  }
  try { return await response.json(); } catch (_) { throw new Error(`${endpoint} ส่ง JSON ไม่ถูกต้อง กรุณาตรวจสอบ Worker`); }
}

export async function loadEvents(quiet = false) {
  if (!isWeb()) return;
  try {
    const response = await fetch("/api/events", { credentials: "same-origin" });
    const data = await readJsonResponse(response, "/api/events");
    if (!Array.isArray(data) || !data.length) throw new Error("empty_event_list");
    EV.base = data.map((e: any) => ({ ...e, image: e.posterUrl || e.image || null })); refreshEvents(); emit();
  } catch (err) {
    console.error("Event API failed", err);
    if (!quiet) toast("โหลดรายการงานจากระบบไม่สำเร็จ กำลังใช้ข้อมูลสำรอง");
  }
}

/* ---------- Google sign-in (src/worker.js) ---------- */
const AUTH_KEY = "jongloei-auth-after";
export function googleLogin() {
  try { sessionStorage.setItem(AUTH_KEY, JSON.stringify({ after: S.afterSignup, ev: S.ev, zone: S.zone, qty: S.qty, lid: S.buyingListing && S.buyingListing.lid })); } catch (_) {}
  location.href = "/auth/google/start";
}
export async function checkAuth() {
  if (!isWeb()) return;
  let me: any;
  try { const r = await fetch("/api/me", { credentials: "same-origin" }); if (!r.ok) return; me = await readJsonResponse(r, "/api/me"); }
  catch (err) { console.error("Auth API failed", err); return; }
  if (!me || !me.googleEnabled) return;
  S.auth.google = true;
  S.signedIn = !!me.user;
  if (me.user) Object.assign(S.user, { name: me.user.name || me.user.email, email: me.user.email || "" }, me.user.wallet ? { wallet: me.user.wallet } : {});
  const q = new URLSearchParams(location.search), result = q.get("login");
  if (result) { q.delete("login"); history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash); }
  let backTo: any = null;
  try { backTo = JSON.parse(sessionStorage.getItem(AUTH_KEY) || "null"); sessionStorage.removeItem(AUTH_KEY); } catch (_) {}
  if (backTo && me.user) {
    if (backTo.ev && evById(backTo.ev)) { S.ev = backTo.ev; S.zone = backTo.zone || 0; S.qty = backTo.qty || 1; }
    S.buyingListing = backTo.lid ? marketListings().find((l: any) => l.lid == backTo.lid) || null : null; S.afterSignup = backTo.after || null;
  }
  emit();
  if (S.orgLiveWanted && me.user && S.mode === "org" && !(S.org && S.org.live)) orgLiveStart();
  loadMyTickets();
  handleCheckoutReturn();
  if (result === "new" && me.user) walletCreating();
  else if (result === "ok" && me.user) { toast("เข้าสู่ระบบแล้ว"); if (S.afterSignup) { const n = S.afterSignup; S.afterSignup = null; resumeAfter(n); } }
  else if (result === "error") toast("เข้าสู่ระบบไม่สำเร็จ ลองอีกครั้ง");
}
export function resumeAfter(n: string) { if (n === "orgmode") enterOrg(); else if (n === "orglive") orgLiveStart(); else go(n); }

/* ---------- tickets minted by the Worker (GET /api/tickets) ---------- */
function realTicket(t: any) {
  return { key: t.id, tid: t.tokenId ?? "…", ev: t.eventId, zone: t.zone, price: t.price,
    status: t.status === "minting" || t.status === "mint_failed" ? "active" : t.status,
    minting: t.status === "minting", failed: t.status === "mint_failed", transfers: t.transfers,
    tx: t.txHash ? short(t.txHash) : "กำลังส่งธุรกรรม", explorer: t.explorer, real: true };
}
export async function loadMyTickets() {
  if (!S.auth.google || !S.signedIn) return;
  try {
    const response = await fetch("/api/tickets", { credentials: "same-origin" });
    const data = await readJsonResponse(response, "/api/tickets");
    if (!response.ok || !Array.isArray(data.tickets)) return;
    S.tickets = data.tickets.map(realTicket);
    if (S.sel && S.sel.real) S.sel = S.tickets.find((x: any) => x.key === S.sel.key) || S.sel;
    await loadResale();
    if (S.tickets.some((t: any) => t.minting)) setTimeout(loadMyTickets, 5000);
  } catch (err) { console.error("Ticket API failed", err); }
}

/* ---------- resale: Worker listings when signed in with Google, demo listings otherwise ---------- */
export function marketListings(): any[] { return S.auth.google ? (S.realListings || []) : S.listings; }
export async function loadResale() {
  try {
    const [market, mine] = await Promise.all(["/api/resale/listings", "/api/resale/listings?mine=1"].map(u => fetch(u, { credentials: "same-origin" }).then(r => (r.ok ? r.json() : { listings: [] }))));
    S.realListings = market.listings.map((l: any) => ({ lid: l.id, ev: l.eventId, zone: l.zone, face: l.facePrice, price: l.price, seller: l.seller, transfers: l.transfers, tid: l.tokenId, held: l.held, mine: l.mine, real: true }));
    for (const l of mine.listings) { const t = S.tickets.find((x: any) => x.key === l.ticketId); if (t) { t.listPrice = l.price; t.listingId = l.id; t.listingSold = l.status === "sold"; } }
  } catch (err) { console.error("Resale API failed", err); }
  emit();
}
const RESALE_ERRORS: Record<string, string> = { holding_period: "ลงขายได้หลังได้ตั๋วครบ 6 ชั่วโมง", transfer_closed: "ปิดการขายต่อแล้ว (1 ชั่วโมงก่อนงานเริ่ม)", invalid_price: "ราคาเกินเพดาน 125% ของราคาหน้าบัตร",
  already_listed: "ตั๋วใบนี้ลงขายอยู่แล้ว", ticket_not_listable: "ตั๋วใบนี้ลงขายไม่ได้", event_not_open: "งานนี้ปิดหรือถูกยกเลิกแล้ว", event_time_unknown: "งานนี้ยังไม่มีเวลาเริ่มที่ชัดเจน",
  listing_on_hold: "มีคนกำลังชำระตั๋วใบนี้ ยกเลิกได้หลังหมดเวลา 10 นาที", listing_closed: "รายการนี้ปิดไปแล้ว" };
async function resaleCall(method: string, path: string, body?: any) {
  const r = await fetch(path, { method, credentials: "same-origin", headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    let m = RESALE_ERRORS[d.error] || "ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง";
    if (d.error === "holding_period" && d.listableAt) m += " (ลงขายได้ " + new Date(d.listableAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) + ")";
    throw new Error(m);
  }
  return d;
}

/* ---------- buying ---------- */
export function openEvent(id: string) {
  const e = evById(id); if (!e) { toast("ไม่พบงานนี้"); return; }
  S.ev = id; S.promo = null; S.zone = Math.max(0, e.zones.findIndex((z: any) => z.left > 0)); S.qty = 1; emit(); go("event", { id });
}
// price a buyer pays per ticket for an organizer event, with an applied promo code (baht)
export function buyUnit(e: any) {
  const z = e.zones[S.zone];
  if (isLocal(e.id) && S.promo && S.promo.ev === e.id) { const r = OL.applyPromo(S.promo.code, S.org.promos, z.zoneId, Math.round(z.p * 100), Date.now()); if (r.ok) return r.price / 100; }
  return z.p;
}
// total for S.qty tickets: a promo code with fewer uses left than S.qty discounts only that many
export function buyTotal(e: any) {
  const z = e.zones[S.zone], unit = buyUnit(e);
  if (unit === z.p) return unit * S.qty;
  const p = S.org.promos.find((x: any) => x.code === S.promo.code), n = Math.min(S.qty, Math.max(0, p.maxUses - (p.used || 0)));
  return unit * n + z.p * (S.qty - n);
}
export function startBuy() { S.buyingListing = null; emit(); if (!S.signedIn) { openSignup("checkout"); return; } go("checkout"); }
export function buyListing(l: any) { S.buyingListing = l; emit(); if (!S.signedIn) { openSignup("checkout"); return; } go("checkout"); }
const buyingEv = () => (S.buyingListing ? S.buyingListing.ev : S.ev);
export function toPay() { if (isLocal(buyingEv())) go("pay"); else startStripeCheckout(); }
export function paid() { if (isLocal(buyingEv())) go("minting", { replace: true }); else startStripeCheckout(); }
export function applyPromo(code: string) {
  const e = evById(S.ev), z = e.zones[S.zone];
  const r = OL.applyPromo(code, S.org.promos.filter((p: any) => !p.eventId || p.eventId === e.id), z.zoneId, Math.round(z.p * 100), Date.now());
  const WHY: Record<string, string> = { not_found: "ไม่พบโค้ดนี้หรือถูกปิดใช้งาน", expired: "โค้ดหมดอายุหรือยังไม่เริ่มใช้", used_up: "โค้ดถูกใช้ครบจำนวนแล้ว", wrong_zone: "โค้ดนี้ใช้กับโซนนี้ไม่ได้" };
  if (!r.ok) { S.promo = null; emit(); return WHY[r.reason]; }
  S.promo = { ev: e.id, code: code.toUpperCase(), msg: "ใช้โค้ด " + code.toUpperCase() + " แล้ว ลดเหลือ " + fmt(r.price / 100) + " ต่อใบ" }; emit(); return "";
}

const STRIPE_ERR: Record<string, string> = {
  authentication_required: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่", sold_out: "ที่นั่งโซนนี้หมดแล้ว หรือมีคนกำลังชำระอยู่ ลองโซนอื่นหรือรอสักครู่",
  ticket_limit: "ซื้อได้สูงสุด 4 ใบต่อบัญชีต่องาน (รวมรายการที่กำลังชำระ)", listing_held: "มีคนกำลังชำระตั๋วใบนี้อยู่ ลองใหม่ใน 10 นาที",
  listing_unavailable: "ตั๋วใบนี้ถูกขายหรือยกเลิกไปแล้ว", own_listing: "ซื้อตั๋วที่ตัวเองลงขายไม่ได้", transfer_closed: "ปิดการซื้อขายต่อแล้ว (1 ชั่วโมงก่อนงานเริ่ม)",
  no_wallet: "ยังไม่มีกระเป๋าตั๋ว ลองออกจากระบบแล้วเข้าใหม่", invalid_ticket: "ข้อมูลตั๋วไม่ถูกต้อง กรุณาเลือกใหม่",
  stripe_unconfigured: "ระบบยังไม่ได้ตั้งค่า Stripe Secret Key", stripe_request_failed: "Stripe ปฏิเสธคำขอ กรุณาตรวจสอบ API key และบัญชี Stripe",
  payment_storage_unavailable: "ระบบฐานข้อมูลยังไม่พร้อม กรุณา apply migration 0002_payments.sql บน D1", event_storage_unavailable: "ระบบรายการอีเวนต์ยังไม่พร้อม กรุณา apply migration 0003_events.sql บน D1",
};
export async function startStripeCheckout() {
  if (!isWeb()) { toast("กรุณาเปิดเว็บผ่าน URL ของ Cloudflare Worker"); return; }
  if (!S.auth.google) {
    // no Worker / Google here: base events cannot be paid, so the purchase runs as a simulation
    mockToast("ยังไม่ได้เชื่อม Stripe ในเครื่องนี้ จำลองการจ่ายเงินแทน");
    go("minting", { replace: currentScreen() === "pay" }); return;
  }
  const listing = S.buyingListing, eventId = listing ? listing.ev : S.ev;
  const zone = listing ? listing.zone : evById(S.ev).zones[S.zone].z, quantity = listing ? 1 : S.qty;
  S.paying = true; emit();
  try {
    const endpoint = listing && listing.real ? "/api/resale/checkout" : "/api/checkout-session";
    const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify(listing && listing.real ? { listingId: listing.lid } : { eventId, zone, quantity }) });
    const data = await readJsonResponse(response, endpoint);
    if (!response.ok || !data.url) throw new Error(STRIPE_ERR[data.error] || data.error || "checkout_failed");
    location.href = data.url;
  } catch (err: any) {
    console.error("Stripe checkout failed", err);
    S.paying = false; emit();
    toast(err.message || "เชื่อมต่อ Stripe ไม่สำเร็จ กรุณาลองใหม่");
  }
}
async function handleCheckoutReturn() {
  const q = new URLSearchParams(location.search);
  const sessionId = q.get("session_id"), cancelled = q.get("checkout") === "cancelled", orderId = q.get("order");
  if (!q.get("checkout")) return;
  q.delete("checkout"); q.delete("session_id"); q.delete("order");
  history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash);
  if (cancelled) {
    if (orderId && S.signedIn) fetch("/api/checkout-cancel", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId }) })
      .then(() => loadEvents(true)).catch(err => console.error("Cancel failed", err));
    toast("ยกเลิกการชำระเงินแล้ว คืนที่นั่งให้ระบบ"); return;
  }
  if (!sessionId || !S.signedIn) return;
  S.order = { status: "pending" }; emit(); go("paymentSuccess", { replace: true });
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch("/api/checkout-status?session_id=" + encodeURIComponent(sessionId), { credentials: "same-origin" });
      const data = await readJsonResponse(response, "/api/checkout-status");
      if (!response.ok) throw new Error(data.error || "status_failed");
      S.order = data; emit();
      if (data.status === "fulfilled") {
        await loadMyTickets();
        const first = S.tickets.find((t: any) => t.key === (data.tickets[0] && data.tickets[0].id));
        if (first) { S.sel = first; emit(); go("success", { replace: true }); }
        return;
      }
      if (["needs_review", "expired", "failed"].includes(data.status)) return;
    } catch (err) { console.error("Checkout status failed", err); return; }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  toast("ตั๋วยังออกไม่เสร็จ ระบบจะออกให้อัตโนมัติ ดูได้ที่ตั๋วของฉัน");
}

// demo purchase (organizer events, or base events without Stripe here): record the sale, issue tickets
export function finishMint() {
  let t: any;
  if (S.buyingListing) {
    const L = S.buyingListing; S.listings = S.listings.filter((x: any) => x.lid !== L.lid);
    t = { tid: L.tid, ev: L.ev, zone: L.zone, price: L.face, status: "active", transfers: L.transfers + 1, tx: "0x" + rand(4) + "…" + rand(4), orgTicketId: L.orgTicketId };
    const ot = L.orgTicketId && S.org.tickets.find((x: any) => x.ticketId === L.orgTicketId);
    if (ot) {
      const paidSatang = L.price * 100; ot.hops.push({ idx: ot.hops.length, payerId: "me", paid: paidSatang, at: Date.now() }); ot.holderId = "me"; ot.status = "valid";
      ledgerAdd({ type: "PAYMENT_IN", eventId: ot.eventId, ticketId: ot.ticketId, amount: paidSatang, party: "me", idempotencyKey: "in:" + ot.ticketId + ":" + (ot.hops.length - 1) });
    }
    S.tickets.unshift(t); S.buyingListing = null;
  } else {
    const e = evById(S.ev); const z = e.zones[S.zone];
    let sold: any[] | null = null;
    if (isLocal(e.id)) {
      const r = OL.recordPrimarySale(orgEv(e.id), z.zoneId, S.qty, "me", S.tickets.filter((x: any) => x.ev === e.id).length, Date.now());
      if (!r.ok) {
        toast(({ sold_out: "ที่นั่งโซนนี้ไม่พอแล้ว", over_limit: "ซื้อได้ไม่เกิน 4 ใบต่อบัญชี", not_on_sale: "งานนี้ปิดรับชั่วคราว", invalid_qty: "จำนวนตั๋วไม่ถูกต้อง" } as any)[r.reason], "err");
        go("event", { replace: true }); return;
      }
      if (S.promo && S.promo.ev === e.id) for (const ot of r.tickets) {
        const res = OL.applyPromo(S.promo.code, S.org.promos, ot.zoneId, ot.hops[0].paid, Date.now());
        if (res.ok) { ot.hops[0].paid = res.price; const p = S.org.promos.find((x: any) => x.code === S.promo.code); if (p) p.used = (p.used || 0) + 1; }
      }
      S.promo = null;
      replaceOrgEvent(r.event); S.org.tickets.push(...r.tickets); sold = r.tickets;
      for (const ot of r.tickets) if (ot.hops[0].paid > 0) ledgerAdd({ type: "PAYMENT_IN", eventId: e.id, ticketId: ot.ticketId, amount: ot.hops[0].paid, party: "me", idempotencyKey: "in:" + ot.ticketId + ":0" });
    } else z.left = Math.max(0, z.left - S.qty);
    for (let k = 0; k < S.qty; k++) { t = { tid: S.nextTid++, ev: e.id, zone: z.z, price: z.p, status: "active", transfers: 0, tx: "0x" + rand(4) + "…" + rand(4), orgTicketId: sold ? sold[k].ticketId : undefined }; S.tickets.unshift(t); }
    t = S.tickets[S.qty - 1];
  }
  S.sel = t; S.mtab = "active"; emit(); go("success", { replace: true });
}

/* ---------- ticket actions ---------- */
export function openTicket(t: any) { S.sel = t; emit(); go("ticket", { id: String(t.key || t.tid) }); }
export async function listTicket(price: number) {
  const tk = S.sel;
  if (tk.real) {
    try { await resaleCall("POST", "/api/resale/listings", { ticketId: tk.key, price }); closeSheet(); toast("ลงขายแล้ว ดูได้ในตลาดขายต่อ"); await loadMyTickets(); }
    catch (err: any) { toast(err.message, "err"); }
    return;
  }
  tk.status = "listed"; tk.listPrice = price; orgTicketStatus(tk, "listed");
  S.listings.unshift({ lid: Date.now(), ev: tk.ev, zone: tk.zone, face: tk.price, price, seller: short(S.user.wallet), transfers: tk.transfers, tid: tk.tid, orgTicketId: tk.orgTicketId });
  closeSheet(); emit(); mockToast("ลงขายแล้ว ดูได้ในตลาดขายต่อ");
}
export async function unlistTicket() {
  const tk = S.sel;
  if (tk.real) {
    if (!tk.listingId) { toast(tk.listingSold ? "ตั๋วขายแล้ว กำลังโอนให้ผู้ซื้อ" : "ไม่พบรายการขาย"); return; }
    try { await resaleCall("DELETE", "/api/resale/listings/" + encodeURIComponent(tk.listingId)); toast("ยกเลิกการลงขายแล้ว"); await loadMyTickets(); }
    catch (err: any) { toast(err.message, "err"); }
    return;
  }
  tk.status = "active"; orgTicketStatus(tk, "valid"); S.listings = S.listings.filter((l: any) => l.tid !== tk.tid); emit(); mockToast("ยกเลิกการลงขายแล้ว");
}
export function transferTicket(to: string) {
  const t = S.sel; S.tickets = S.tickets.filter((x: any) => x !== t); closeSheet(); emit();
  mockToast("โอน Token #" + t.tid + " ให้ " + to + " แล้ว"); go("tickets", { replace: true });
}
export function simulateDoorScan() { S.sel.status = "used"; orgTicketStatus(S.sel, "used"); emit(); mockToast("สแกนผ่าน เข้างานได้ ตั๋วถูกล็อกแล้ว"); }

/* ---------- profile ---------- */
export function copyWallet() {
  try {
    navigator.clipboard.writeText(S.user.wallet).then(() => {
      S.copied = true; emit(); toast("คัดลอกที่อยู่ wallet แล้ว");
      setTimeout(() => { S.copied = false; emit(); }, 2000);
    }, () => toast("คัดลอกไม่ได้ ลองเลือกข้อความแทน"));
  } catch (_) { toast("คัดลอกไม่ได้ ลองเลือกข้อความแทน"); }
}
export function toggleTheme() {
  const light = document.documentElement.dataset.theme !== "light";
  if (light) document.documentElement.dataset.theme = "light"; else delete document.documentElement.dataset.theme;
  try { localStorage.setItem("jongloei-theme", light ? "light" : "dark"); } catch (_) {}
  emit();
}
export function logout() {
  if (S.auth.google) fetch("/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
  S.signedIn = false; emit(); toast("ออกจากระบบแล้ว", "ok"); go("home");
}

/* ---------- home filters (price, place, time) ---------- */
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
// "ส. 21 พ.ย. 2569" -> epoch ms (Bangkok midnight); organizer events carry startAt already
export function eventTime(e: any): number | null {
  if (e.startAt) return e.startAt;
  const m = /(\d{1,2})\s+(\S+)\s+(\d{4})/.exec(e.date || "");
  if (!m) return null;
  const mon = TH_MONTHS.indexOf(m[2]); if (mon < 0) return null;
  const [hh, mm] = String(e.time || "0:0").split(":").map(Number);
  return Date.UTC(+m[3] - 543, mon, +m[1], (hh || 0) - 7, mm || 0);
}
export const PRICE_OPTS: [string, string, (p: number) => boolean][] = [
  ["all", "ทุกราคา", () => true], ["lt1500", "ไม่เกิน 1,500฿", p => p <= 1500],
  ["1500-3000", "1,500฿ – 3,000฿", p => p > 1500 && p <= 3000], ["gt3000", "มากกว่า 3,000฿", p => p > 3000],
];
export const TIME_OPTS: [string, string, number][] = [["all", "ทุกช่วงเวลา", 0], ["7", "ภายใน 7 วัน", 7], ["30", "ภายใน 30 วัน", 30], ["90", "ภายใน 3 เดือน", 90]];
export const placeOf = (e: any) => String(e.venue || "").trim() || "ไม่ระบุสถานที่";
export function filteredEvents() {
  const q = S.q.trim().toLowerCase(), now = Date.now();
  const price = PRICE_OPTS.find(o => o[0] === (S.fprice || "all"))!, days = (TIME_OPTS.find(o => o[0] === (S.ftime || "all")) || TIME_OPTS[0])[2];
  return EV.all.filter(e => (S.cat === "ทั้งหมด" || e.tag === S.cat)
    && (!q || (e.name + " " + e.venue + " " + e.tag).toLowerCase().includes(q))
    && price[2](Math.min(...e.zones.map((z: any) => z.p)))
    && (!S.fplace || S.fplace === "all" || placeOf(e) === S.fplace)
    && (!days || ((t => t != null && t >= now - DAY && t <= now + days * DAY)(eventTime(e)))));
}
export const filtersActive = () => !!S.q.trim() || S.cat !== "ทั้งหมด" || [S.fprice, S.fplace, S.ftime].some(v => v && v !== "all");
export function clearFilters() { S.q = ""; S.cat = "ทั้งหมด"; S.fprice = S.fplace = S.ftime = "all"; emit(); }

function FilterSheet({ kind }: { kind: "price" | "place" | "time" }) {
  const opts: [string, string][] = kind === "price" ? PRICE_OPTS.map(o => [o[0], o[1]])
    : kind === "time" ? TIME_OPTS.map(o => [o[0], o[1]])
    : [["all", "ทุกสถานที่"], ...[...new Set(EV.all.map(placeOf))].map(p => [p, p] as [string, string])];
  const key = kind === "price" ? "fprice" : kind === "time" ? "ftime" : "fplace";
  const [val, setVal] = useState(S[key] || "all");
  const title = { price: "ราคา", place: "สถานที่", time: "เวลา" }[kind];
  return (<>
    <h2 style={{ fontSize: 20 }}>กรองตาม{title}</h2>
    <div role="radiogroup" aria-label={title} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {opts.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={val === v} className="zr" onClick={() => setVal(v)}>
          <span className="box">{val === v && <svg><use href="#i-check" /></svg>}</span><b>{l}</b><span />
        </button>
      ))}
    </div>
    <button className="btn" onClick={() => { S[key] = val; emit(); closeSheet(); }}>แสดงผล</button>
    <button className="btn plain" onClick={() => { S[key] = "all"; emit(); closeSheet(); }}>ล้างตัวกรองนี้</button>
  </>);
}
export const openFilter = (kind: "price" | "place" | "time") => sheet(() => <FilterSheet kind={kind} />);

/* ---------- sheets ---------- */
export function openSignup(after?: string) {
  S.afterSignup = after || null;
  sheet(() => (<>
    <div className="row" style={{ gap: 12 }}><svg width="44" height="44"><use href="#logo" /></svg><div><h2 style={{ fontSize: 19 }}>เข้าสู่ระบบ JONGLOEI</h2><div className="small muted">ซื้อ ขาย และเก็บตั๋วไว้ในที่เดียว</div></div></div>
    <button className="social" onClick={() => { if (S.auth.google) { googleLogin(); return; } walletCreating(); }}><span className="g" style={{ background: "#4285F4" }}>G</span>ดำเนินการต่อด้วย Google</button>
    <button className="social" onClick={() => { if (S.auth.google) { toast("เข้าสู่ระบบด้วยอีเมลจะเปิดให้ใช้เร็วๆ นี้ ใช้ Google ไปก่อนได้เลย"); return; } walletCreating(); }}>ใช้อีเมลและรหัส OTP</button>
    {!S.auth.google && <span className="pill warn" style={{ alignSelf: "center" }}>จำลอง: เครื่องนี้ยังไม่ได้เชื่อม Google จริง</span>}
    <p className="small muted" style={{ margin: 0, textAlign: "center" }}>ไม่ต้องมี wallet ระบบจะสร้างกระเป๋าตั๋วให้คุณอัตโนมัติ</p>
    <div style={{ textAlign: "center" }}><button className="linkbtn" onClick={() => toast("การเชื่อมต่อ wallet เดิมอยู่ในแผนพัฒนาถัดไป")}>มี wallet อยู่แล้ว? เชื่อมต่อ wallet</button></div>
    <div className="card row between" style={{ gap: 12 }}><div className="small"><b>จัดงานเองใช่ไหม?</b><br /><span className="muted">สมัครหรือเข้าสู่ระบบด้วยบัญชีผู้จัดงาน แยกจากบัญชีผู้ซื้อ</span></div>
      <button className="btn ghost" style={{ width: "auto", padding: "10px 14px", fontSize: 14, whiteSpace: "nowrap" }} onClick={() => { closeSheet(); enterOrg(); }}>สำหรับผู้จัดงาน</button></div>
  </>));
}
function WalletSteps() {
  const [i, setI] = useState(0);
  useState(() => {
    let k = 0;
    const iv = setInterval(() => { k++; setI(k); if (k >= 3) { clearInterval(iv); S.signedIn = true; emit(); } }, 900);
    return iv;
  });
  const st = (n: number) => (n < i ? "done" : n === i ? "active" : "");
  return (<>
    <h2 style={{ fontSize: 19, textAlign: "center" }}>กำลังเตรียมบัญชีของคุณ</h2>
    <ol className="steps">
      <li className={st(0)}><span className="s"><svg><use href="#i-check" /></svg></span><span><b>ยืนยันตัวตนกับ Google</b><small>{S.user.email}</small></span></li>
      <li className={st(1)}><span className="s"><svg><use href="#i-check" /></svg></span><span><b>สร้างกระเป๋าตั๋ว (wallet) ให้อัตโนมัติ</b><small>ผ่าน thirdweb ไม่ต้องจำ seed phrase</small></span></li>
      <li className={st(2)}><span className="s"><svg><use href="#i-check" /></svg></span><span><b>พร้อมใช้งาน</b><small className="mono">{short(S.user.wallet)}</small></span></li>
    </ol>
    {i >= 3 && <button className="btn" onClick={() => { closeSheet(); toast("สร้างกระเป๋าตั๋วเรียบร้อย"); if (S.afterSignup) { const n = S.afterSignup; S.afterSignup = null; resumeAfter(n); } }}>เริ่มใช้งาน</button>}
  </>);
}
export function walletCreating() { sheet(() => <WalletSteps />); }

function ResellSheet() {
  const t = S.sel, cap = Math.floor(t.price * 1.25), cut = (v: number) => Math.round(v * 6) / 100;
  const [v, setV] = useState(String(t.price));
  const n = +v || 0, ok = n > 0 && n <= cap;
  return (<>
    <h2 style={{ fontSize: 19 }}>ขายต่อ Token #{t.tid}</h2>
    <div className="field"><label htmlFor="rprice">ราคาที่ต้องการขาย (บาท)</label>
      <input id="rprice" type="number" inputMode="numeric" value={v} min={1} max={cap} onChange={e => setV(e.target.value)} aria-invalid={!ok} />
      <span className={"hint" + (ok ? "" : " err")}>{ok ? `ราคาหน้าบัตร ${fmt(t.price)} · ตั้งได้สูงสุด ${fmt(cap)} (125%)` : `ตั้งราคาได้ระหว่าง 1฿ ถึง ${fmt(cap)} เพื่อป้องกันการโก่งราคา`}</span></div>
    <dl className="kv card small num" style={{ margin: 0 }}><dt>คอมมิชชันแพลตฟอร์ม 6%</dt><dd>{fmt(cut(n))}</dd><dt><b style={{ color: "var(--ink)" }}>คุณจะได้รับ</b></dt><dd style={{ fontWeight: 700, color: "var(--red)" }}>{fmt(n - cut(n))}</dd></dl>
    <div className="small muted">{t.real ? "ระบบเก็บเงินของคุณไว้และจ่ายหลังงานจบ 24 ชั่วโมง (ทีมงานโอนให้)" : "เงินจะโอนเข้าบัญชี PromptPay ของคุณหลังงานจบ"} ตั๋วที่ลงขายจะใช้ QR เข้างานไม่ได้จนกว่าจะยกเลิก การซื้อขายปิดอัตโนมัติ 1 ชั่วโมงก่อนงานเริ่ม</div>
    {!t.real && <span className="pill warn" style={{ alignSelf: "flex-start" }}>จำลอง: ตั๋วเดโม ไม่มีการโอนเงินจริง</span>}
    <button className="btn" disabled={!ok} onClick={() => listTicket(n)}>ลงขายในตลาดขายต่อ</button>
    <button className="btn plain" onClick={closeSheet}>ยกเลิก</button>
  </>);
}
export const openResell = () => sheet(() => <ResellSheet />);

function TransferSheet() {
  const t = S.sel; const [to, setTo] = useState("pim.s@gmail.com");
  return (<>
    <h2 style={{ fontSize: 19 }}>โอนตั๋วให้เพื่อน</h2>
    <div className="field"><label htmlFor="tto">อีเมลหรือเบอร์โทรของเพื่อน</label><input id="tto" value={to} onChange={e => setTo(e.target.value)} placeholder="เช่น friend@gmail.com หรือ 081-234-5678" />
      <span className="hint">ถ้าเพื่อนยังไม่มีบัญชี ระบบจะสร้าง wallet ให้ตอนเพื่อนกดรับตั๋ว</span></div>
    <div className="card small" style={{ display: "flex", flexDirection: "column", gap: 4 }}><b>Token #{t.tid} · {evById(t.ev)?.name}</b><span className="muted">โอนแล้ว {t.transfers}/2 ครั้ง · หลังโอน QR เดิมของคุณจะใช้ไม่ได้ทันที</span></div>
    <span className="pill warn" style={{ alignSelf: "flex-start" }}>จำลอง: ยังไม่ได้เชื่อม API การโอน</span>
    <button className="btn" disabled={!to.trim()} onClick={() => transferTicket(to.trim())}>ยืนยันการโอน</button><button className="btn plain" onClick={closeSheet}>ยกเลิก</button>
  </>);
}
export const openTransfer = () => sheet(() => <TransferSheet />);

export function openReset() {
  sheet(() => (<>
    <h2 style={{ fontSize: 20 }}>ล้างข้อมูลเดโม?</h2><p className="muted" style={{ margin: 0 }}>ตั๋ว รายการขายต่อ และประวัติทั้งหมดในเดโมนี้จะถูกล้าง แล้วเริ่มใหม่ ย้อนกลับไม่ได้</p>
    <button className="btn org-danger-btn" onClick={() => { resetDemo(); location.href = "/"; }}>ล้างข้อมูลเดโม</button><button className="btn plain" onClick={closeSheet}>ยกเลิก</button>
  </>));
}
export function openRules() {
  sheet(() => (<>
    <h2 style={{ fontSize: 20 }}>เงื่อนไขการขายต่อ</h2>
    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12, fontSize: 15, lineHeight: 1.5 }}>
      <li><b>ขายต่อได้เฉพาะในระบบ</b><br /><span className="muted small">ตั๋วที่ซื้อนอกระบบสแกนเข้างานไม่ได้</span></li>
      <li><b>ราคาไม่เกิน 1.25 เท่าของหน้าบัตร</b><br /><span className="muted small">ผู้ขายถูกหัก 6% เมื่อขายได้</span></li>
      <li><b>ขายต่อได้หลังได้ตั๋ว 6 ชม.</b><br /><span className="muted small">และปิดการโอน 1 ชม. ก่อนงานเริ่ม</span></li>
      <li><b>งานยกเลิก คืนเงินเท่าที่จ่ายจริง</b><br /><span className="muted small">คืนให้คนที่ถือตั๋วคนสุดท้าย</span></li>
    </ul>
    <button className="btn" onClick={() => { closeSheet(); toast("ยอมรับเงื่อนไขแล้ว", "ok"); }}>ยอมรับเงื่อนไข</button>
    <button className="btn plain" style={{ color: "var(--danger-solid)" }} onClick={() => { closeSheet(); if (currentScreen() === "event") back(); }}>ไม่ยอมรับแล้วยกเลิก</button>
  </>));
}
export { HOUR, initial, save };
