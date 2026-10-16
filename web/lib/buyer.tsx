"use client";
// Buyer actions: events, sign-in, purchase (demo PromptPay or Stripe), tickets, resale, filters.
// Ported from the mock-up; every button either calls the Worker API or, in the demo, says it is simulated.
import { useState } from "react";
import { S, EV, OL, emit, save, fmt, short, isLocal, evById, refreshEvents, ledgerAdd, orgTicketStatus, replaceOrgEvent, orgEv,
  rand, initial, resetDemo, HOUR, DAY } from "./state";
import { go, back, currentScreen } from "./nav";
import { toast, mockToast, sheet, closeSheet } from "./ui";
import { enterOrg, orgLiveStart } from "./org";
import { tr, tmap, locale } from "./i18n";

/* ---------- API helpers ---------- */
export const isWeb = () => typeof window !== "undefined" && /^https?:$/.test(location.protocol);
export async function readJsonResponse(response: Response, endpoint: string) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(response.status === 404 ? tr("ไม่พบปลายทาง {a} กรุณาทำการ deploy Worker เวอร์ชันล่าสุด", { a: endpoint })
      : tr("{a} ส่งข้อมูลไม่ใช่รูปแบบ JSON (HTTP {b}) กรุณาตรวจสอบว่าเปิดใช้งานผ่าน Worker URL", { a: endpoint, b: response.status }));
  }
  try { return await response.json(); } catch (_) { throw new Error(tr("{a} ส่งรูปแบบ JSON ไม่ถูกต้อง กรุณาตรวจสอบการตั้งค่า Worker", { a: endpoint })); }
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
    if (!quiet) toast(tr("โหลดรายการอีเวนต์จากระบบไม่สำเร็จ กำลังใช้งานข้อมูลสำรอง"));
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
  else if (result === "ok" && me.user) { toast(tr("เข้าสู่ระบบสำเร็จ")); if (S.afterSignup) { const n = S.afterSignup; S.afterSignup = null; resumeAfter(n); } }
  else if (result === "error") toast(tr("เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"));
}
export function resumeAfter(n: string) { if (n === "orgmode") enterOrg(); else if (n === "orglive") orgLiveStart(); else go(n); }

/* ---------- tickets minted by the Worker (GET /api/tickets) ---------- */
function realTicket(t: any) {
  return { key: t.id, tid: t.tokenId ?? "…", ev: t.eventId, zone: t.zone, price: t.price,
    status: t.status === "minting" || t.status === "mint_failed" ? "active" : t.status,
    minting: t.status === "minting", failed: t.status === "mint_failed", transfers: t.transfers,
    tx: t.txHash ? short(t.txHash) : tr("กำลังส่งคำขอทำธุรกรรม"), explorer: t.explorer, real: true };
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
const RESALE_ERRORS: Record<string, string> = tmap({ holding_period: "สามารถลงประกาศขายต่อได้ภายหลังได้รับบัตรครบ 6 ชั่วโมง", transfer_closed: "ปิดระบบการขายต่อแล้ว (เปิดให้ดำเนินการก่อนอีเวนต์เริ่ม 1 ชั่วโมง)", invalid_price: "ราคาจำหน่ายเกินเพดานกำหนด 125% ของราคาหน้าบัตร",
  already_listed: "บัตรเข้าชมใบนี้อยู่ระหว่างประกาศขายต่อแล้ว", ticket_not_listable: "บัตรเข้าชมใบนี้ไม่สามารถลงประกาศขายต่อได้", event_not_open: "อีเวนต์นี้ปิดให้บริการหรือถูกยกเลิกแล้ว", event_time_unknown: "อีเวนต์นี้ยังไม่มีการกำหนดเวลาเริ่มต้นที่ชัดเจน",
  listing_on_hold: "มีผู้กำลังทำรายการชำระเงินสำหรับบัตรใบนี้ ท่านจะสามารถยกเลิกได้ภายหลังครบกำหนด 10 นาที", listing_closed: "รายการนี้ถูกปิดการใช้งานเรียบร้อยแล้ว" });
async function resaleCall(method: string, path: string, body?: any) {
  const r = await fetch(path, { method, credentials: "same-origin", headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    let m = RESALE_ERRORS[d.error] || tr("ทำรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    if (d.error === "holding_period" && d.listableAt) m += tr(" (ลงขายได้ {a})", { a: new Date(d.listableAt).toLocaleString(locale(), { dateStyle: "short", timeStyle: "short" }) });
    throw new Error(m);
  }
  return d;
}

/* ---------- buying ---------- */
export function openEvent(id: string) {
  const e = evById(id); if (!e) { toast(tr("ไม่พบข้อมูลอีเวนต์นี้")); return; }
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
  const WHY: Record<string, string> = { not_found: tr("ไม่พบรหัสส่วนลดนี้ หรือถูกระงับการใช้งาน"), expired: tr("รหัสส่วนลดหมดอายุหรือยังไม่ถึงกำหนดเริ่มต้นใช้งาน"), used_up: tr("รหัสส่วนลดถูกใช้งานครบจำนวนสิทธิ์แล้ว"), wrong_zone: tr("รหัสส่วนลดนี้ไม่สามารถใช้งานร่วมกับโซนนี้ได้") };
  if (!r.ok) { S.promo = null; emit(); return WHY[r.reason]; }
  S.promo = { ev: e.id, code: code.toUpperCase(), msg: tr("ใช้โค้ด {a} แล้ว ลดเหลือ {b} ต่อใบ", { a: code.toUpperCase(), b: fmt(r.price / 100) }) }; emit(); return "";
}

const STRIPE_ERR: Record<string, string> = tmap({
  authentication_required: "เซสชันการใช้งานหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง", sold_out: "ที่นั่งโซนนี้จำหน่ายหมดแล้ว หรือมีผู้กำลังทำรายการชำระเงินอยู่ กรุณาเลือกโซนอื่นหรือลองใหม่อีกครั้งในภายหลัง",
  ticket_limit: "จำกัดสิทธิ์ซื้อสูงสุด 4 ใบต่อบัญชีต่ออีเวนต์ (รวมรายการที่อยู่ระหว่างการชำระเงิน)", listing_held: "มีผู้กำลังทำรายการชำระเงินสำหรับบัตรใบนี้อยู่ กรุณาลองใหม่อีกครั้งใน 10 นาที",
  listing_unavailable: "บัตรเข้าชมใบนี้ผ่านการจำหน่ายหรือถูกยกเลิกไปแล้ว", own_listing: "ไม่สามารถซื้อบัตรเข้าชมที่ตนเองเป็นผู้ประกาศขายได้", transfer_closed: "ปิดระบบซื้อขายต่อแล้ว (ก่อนเริ่มอีเวนต์ 1 ชั่วโมง)",
  no_wallet: "ยังไม่พบกระเป๋าจัดเก็บเก็บบัตร กรุณาลองออกจากระบบและเข้าสู่ระบบใหม่อีกครั้ง", invalid_ticket: "ข้อมูลบัตรเข้าชมไม่ถูกต้อง กรุณาเลือกใหม่อีกครั้ง",
  stripe_unconfigured: "ระบบยังไม่ได้กำหนดค่า Stripe Secret Key", stripe_request_failed: "ระบบ Stripe ปฏิเสธคำขอ กรุณาตรวจสอบ API Key และบัญชี Stripe ของท่าน",
  payment_storage_unavailable: "ระบบฐานข้อมูลยังไม่พร้อมใช้งาน กรุณาดำเนินการ apply migration 0002_payments.sql บน D1", event_storage_unavailable: "ระบบรายการอีเวนต์ยังไม่พร้อมใช้งาน กรุณาดำเนินการ apply migration 0003_events.sql บน D1",
});
export async function startStripeCheckout() {
  if (!isWeb()) { toast(tr("กรุณาเปิดใช้งานเว็บไซต์ผ่าน URL ของ Cloudflare Worker")); return; }
  if (!S.auth.google) {
    // no Worker / Google here: base events cannot be paid, so the purchase runs as a simulation
    mockToast(tr("เครื่องนี้ยังไม่ได้เชื่อมต่อระบบ Stripe ระบบจะใช้การจำลองการชำระเงินแทน"));
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
    toast(err.message || tr("เชื่อมต่อระบบ Stripe ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"));
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
    toast(tr("ยกเลิกการชำระเงินเรียบร้อยแล้ว คืนที่นั่งสู่ระบบ")); return;
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
  toast(tr("บัตรเข้าชมยังออกไม่เสร็จสมบูรณ์ ระบบจะออกให้โดยอัตโนมัติ สามารถตรวจสอบได้ที่เมนูบัตรเข้าชมของฉัน"));
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
        toast(({ sold_out: tr("พื้นที่นั่งในโซนนี้ไม่เพียงพอ"), over_limit: tr("จำกัดสิทธิ์ซื้อไม่เกิน 4 ใบต่อบัญชีผู้ใช้งาน"), not_on_sale: tr("อีเวนต์นี้อยู่ระหว่างระงับการจำหน่ายชั่วคราว"), invalid_qty: tr("จำนวนบัตรเข้าชมไม่ถูกต้อง") } as any)[r.reason], "err");
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
    try { await resaleCall("POST", "/api/resale/listings", { ticketId: tk.key, price }); closeSheet(); toast(tr("ลงประกาศขายเรียบร้อย สามารถตรวจสอบได้ในตลาดซื้อขายต่อบัตร")); await loadMyTickets(); }
    catch (err: any) { toast(err.message, "err"); }
    return;
  }
  tk.status = "listed"; tk.listPrice = price; orgTicketStatus(tk, "listed");
  S.listings.unshift({ lid: Date.now(), ev: tk.ev, zone: tk.zone, face: tk.price, price, seller: short(S.user.wallet), transfers: tk.transfers, tid: tk.tid, orgTicketId: tk.orgTicketId });
  closeSheet(); emit(); mockToast(tr("ลงขายแล้ว ดูได้ในตลาดขายต่อ"));
}
export async function unlistTicket() {
  const tk = S.sel;
  if (tk.real) {
    if (!tk.listingId) { toast(tk.listingSold ? tr("บัตรถูกจำหน่ายแล้ว กำลังดำเนินการโอนสิทธิ์ให้แก่ผู้ซื้อ") : tr("ไม่พบรายการประกาศขาย")); return; }
    try { await resaleCall("DELETE", "/api/resale/listings/" + encodeURIComponent(tk.listingId)); toast(tr("ยกเลิกการประกาศขายเรียบร้อยแล้ว")); await loadMyTickets(); }
    catch (err: any) { toast(err.message, "err"); }
    return;
  }
  tk.status = "active"; orgTicketStatus(tk, "valid"); S.listings = S.listings.filter((l: any) => l.tid !== tk.tid); emit(); mockToast(tr("ยกเลิกการลงขายแล้ว"));
}
export function transferTicket(to: string) {
  const t = S.sel; S.tickets = S.tickets.filter((x: any) => x !== t); closeSheet(); emit();
  mockToast(tr("โอน Token #{a} ให้ {b} แล้ว", { a: t.tid, b: to })); go("tickets", { replace: true });
}
export function simulateDoorScan() { S.sel.status = "used"; orgTicketStatus(S.sel, "used"); emit(); mockToast(tr("สแกนผ่าน บันทึกเข้างานเรียบร้อย บัตรถูกล็อกสถานะแล้ว")); }

/* ---------- profile ---------- */
export function copyWallet() {
  try {
    navigator.clipboard.writeText(S.user.wallet).then(() => {
      S.copied = true; emit(); toast(tr("คัดลอกที่อยู่กระเป๋าเงิน (Wallet) เรียบร้อยแล้ว"));
      setTimeout(() => { S.copied = false; emit(); }, 2000);
    }, () => toast(tr("ไม่สามารถคัดลอกอัตโนมัติได้ กรุณาใช้วิธีเลือกข้อความด้วยตนเอง")));
  } catch (_) { toast(tr("คัดลอกไม่ได้ ลองเลือกข้อความแทน")); }
}
export function toggleTheme() {
  const light = document.documentElement.dataset.theme !== "light";
  if (light) document.documentElement.dataset.theme = "light"; else delete document.documentElement.dataset.theme;
  try { localStorage.setItem("jongloei-theme", light ? "light" : "dark"); } catch (_) {}
  emit();
}
export function logout() {
  if (S.auth.google) fetch("/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
  S.signedIn = false; emit(); toast(tr("ออกจากระบบเรียบร้อยแล้ว"), "ok"); go("home");
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
export const PRICE_OPTS: [string, string, (p: number) => boolean][] = tmap([
  ["all", "ทุกช่วงราคา", () => true], ["lt1500", "ไม่เกิน 1,500฿", p => p <= 1500],
  ["1500-3000", "1,500฿ – 3,000฿", p => p > 1500 && p <= 3000], ["gt3000", "มากกว่า 3,000฿", p => p > 3000],
]);
export const TIME_OPTS: [string, string, number][] = tmap([["all", "ทุกช่วงเวลา", 0], ["7", "ภายใน 7 วัน", 7], ["30", "ภายใน 30 วัน", 30], ["90", "ภายใน 3 เดือน", 90]]);
export const placeOf = (e: any) => String(e.venue || "").trim() || tr("ไม่ระบุสถานที่");
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
    : [["all", tr("ทุกสถานที่")], ...[...new Set(EV.all.map(placeOf))].map(p => [p, p] as [string, string])];
  const key = kind === "price" ? "fprice" : kind === "time" ? "ftime" : "fplace";
  const [val, setVal] = useState(S[key] || "all");
  const title = { price: tr("ช่วงราคา"), place: tr("สถานที่จัดงาน"), time: tr("เวลาจัดงาน") }[kind];
  return (<>
    <h2 style={{ fontSize: 20 }}>{tr("กรองตาม{a}", { a: title })}</h2>
    <div role="radiogroup" aria-label={title} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {opts.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={val === v} className="zr" onClick={() => setVal(v)}>
          <span className="box">{val === v && <svg><use href="#i-check" /></svg>}</span><b>{l}</b><span />
        </button>
      ))}
    </div>
    <button className="btn" onClick={() => { S[key] = val; emit(); closeSheet(); }}>{tr("ผลลัพธ์การแสดงผล")}</button>
    <button className="btn plain" onClick={() => { S[key] = "all"; emit(); closeSheet(); }}>{tr("ล้างตัวกรองนี้")}</button>
  </>);
}
export const openFilter = (kind: "price" | "place" | "time") => sheet(() => <FilterSheet kind={kind} />);

/* ---------- sheets ---------- */
export function openSignup(after?: string) {
  S.afterSignup = after || null;
  sheet(() => (<>
    <div className="row" style={{ gap: 12 }}><svg width="44" height="44"><use href="#logo" /></svg><div><h2 style={{ fontSize: 19 }}>{tr("เข้าสู่ระบบ JONGLOEI")}</h2><div className="small muted">{tr("ซื้อ ขาย และจัดเก็บบัตรเข้าชมไว้ในที่เดียว")}</div></div></div>
    <button className="social" onClick={() => { if (S.auth.google) { googleLogin(); return; } walletCreating(); }}><span className="g" style={{ background: "#4285F4" }}>G</span>{tr("ดำเนินการต่อด้วยบัญชี Google")}</button>
    <button className="social" onClick={() => { if (S.auth.google) { toast(tr("ระบบเข้าสู่ระบบด้วยอีเมลจะเปิดให้บริการเร็วๆ นี้ ท่านสามารถใช้งานผ่านบัญชี Google ไปก่อนได้")); return; } walletCreating(); }}>{tr("เข้าสู่ระบบด้วยอีเมลและรหัส OTP")}</button>
    {!S.auth.google && <span className="pill warn" style={{ alignSelf: "center" }}>{tr("ระบบจำลอง: เครื่องนี้ยังไม่ได้เชื่อมต่อระบบ Google จริง")}</span>}
    <p className="small muted" style={{ margin: 0, textAlign: "center" }}>{tr("ไม่จำเป็นต้องมีกระเป๋าเงินดิจิทัล ระบบจะสร้างกระเป๋าจัดเก็บบัตรให้ท่านโดยอัตโนมัติ")}</p>
    <div style={{ textAlign: "center" }}><button className="linkbtn" onClick={() => toast(tr("ฟังก์ชันการเชื่อมต่อกระเป๋าเงินเดิมอยู่ระหว่างแผนพัฒนาในลำดับถัดไป"))}>{tr("มีกระเป๋าเงินดิจิทัลอยู่แล้ว? เชื่อมต่อกระเป๋าเงิน")}</button></div>
    <div className="card row between" style={{ gap: 12 }}><div className="small"><b>{tr("ต้องการจัดอีเวนต์เองใช่หรือไม่?")}</b><br /><span className="muted">{tr("ลงทะเบียนหรือเข้าสู่ระบบด้วยบัญชีผู้จัดงาน แยกอิสระจากบัญชีผู้ซื้อ")}</span></div>
      <button className="btn ghost" style={{ width: "auto", padding: "10px 14px", fontSize: 14, whiteSpace: "nowrap" }} onClick={() => { closeSheet(); enterOrg(); }}>{tr("สำหรับผู้จัดงาน")}</button></div>
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
    <h2 style={{ fontSize: 19, textAlign: "center" }}>{tr("กำลังเตรียมบัญชีผู้ใช้งานของท่าน")}</h2>
    <ol className="steps">
      <li className={st(0)}><span className="s"><svg><use href="#i-check" /></svg></span><span><b>{tr("ยืนยันตัวตนผ่านบัญชี Google")}</b><small>{S.user.email}</small></span></li>
      <li className={st(1)}><span className="s"><svg><use href="#i-check" /></svg></span><span><b>{tr("สร้างกระเป๋าจัดเก็บบัตร (Wallet) ให้อัตโนมัติ")}</b><small>{tr("ทำงานผ่านระบบ thirdweb ไม่ต้องจดจำ Seed Phrase")}</small></span></li>
      <li className={st(2)}><span className="s"><svg><use href="#i-check" /></svg></span><span><b>{tr("พร้อมใช้งานทันที")}</b><small className="mono">{short(S.user.wallet)}</small></span></li>
    </ol>
    {i >= 3 && <button className="btn" onClick={() => { closeSheet(); toast(tr("สร้างกระเป๋าจัดเก็บบัตรเรียบร้อยแล้ว")); if (S.afterSignup) { const n = S.afterSignup; S.afterSignup = null; resumeAfter(n); } }}>{tr("เริ่มต้นใช้งาน")}</button>}
  </>);
}
export function walletCreating() { sheet(() => <WalletSteps />); }

function ResellSheet() {
  const t = S.sel, cap = Math.floor(t.price * 1.25), cut = (v: number) => Math.round(v * 6) / 100;
  const [v, setV] = useState(String(t.price));
  const n = +v || 0, ok = n > 0 && n <= cap;
  return (<>
    <h2 style={{ fontSize: 19 }}>{tr("ขายต่อ Token #{a}", { a: t.tid })}</h2>
    <div className="field"><label htmlFor="rprice">{tr("ราคาที่ต้องการตั้งจำหน่าย (บาท)")}</label>
      <input id="rprice" type="number" inputMode="numeric" value={v} min={1} max={cap} onChange={e => setV(e.target.value)} aria-invalid={!ok} />
      <span className={"hint" + (ok ? "" : " err")}>{ok ? tr("ราคาหน้าบัตร {a} · กำหนดสูงสุดได้ไม่เกิน {b} (125%)", { a: fmt(t.price), b: fmt(cap) }) : tr("ตั้งราคาจำหน่ายได้ระหว่าง 1฿ ถึง {a} เพื่อป้องกันการตั้งราคาสูงเกินจริง", { a: fmt(cap) })}</span></div>
    <dl className="kv card small num" style={{ margin: 0 }}><dt>{tr("ค่าคอมมิชชันแพลตฟอร์ม 6%")}</dt><dd>{fmt(cut(n))}</dd><dt><b style={{ color: "var(--ink)" }}>{tr("ยอดสุทธิที่คุณจะได้รับ")}</b></dt><dd style={{ fontWeight: 700, color: "var(--red)" }}>{fmt(n - cut(n))}</dd></dl>
    <div className="small muted">{tr("{a} ตั๋วที่ลงขายจะใช้ QR เข้างานไม่ได้จนกว่าจะยกเลิก การซื้อขายปิดอัตโนมัติ 1 ชั่วโมงก่อนงานเริ่ม", { a: t.real ? tr("ระบบจะจัดเก็บเงินของท่านไว้และโอนให้ภายหลังจบอีเวนต์ 24 ชั่วโมง (ดำเนินการโอนโดยทีมงาน)") : tr("ยอดเงินจะถูกโอนเข้าสู่บัญชี PromptPay ของท่านหลังจบอีเวนต์") })}</div>
    {!t.real && <span className="pill warn" style={{ alignSelf: "flex-start" }}>{tr("ระบบทดลอง: บัตรจำลอง ไม่มีการทำธุรกรรมการเงินจริง")}</span>}
    <button className="btn" disabled={!ok} onClick={() => listTicket(n)}>{tr("ประกาศจำหน่ายในตลาดซื้อขายต่อ")}</button>
    <button className="btn plain" onClick={closeSheet}>{tr("ยกเลิก")}</button>
  </>);
}
export const openResell = () => sheet(() => <ResellSheet />);

function TransferSheet() {
  const t = S.sel; const [to, setTo] = useState("pim.s@gmail.com");
  return (<>
    <h2 style={{ fontSize: 19 }}>{tr("โอนสิทธิ์บัตรให้เพื่อน")}</h2>
    <div className="field"><label htmlFor="tto">{tr("อีเมลหรือหมายเลขโทรศัพท์ของเพื่อน")}</label><input id="tto" value={to} onChange={e => setTo(e.target.value)} placeholder={tr("เช่น friend@gmail.com หรือ 081-234-5678")} />
      <span className="hint">{tr("หากเพื่อนยังไม่มีบัญชี ระบบจะสร้างกระเป๋าเงินให้เมื่อเพื่อนกดรับบัตร")}</span></div>
    <div className="card small" style={{ display: "flex", flexDirection: "column", gap: 4 }}><b>Token #{t.tid} · {evById(t.ev)?.name}</b><span className="muted">{tr("โอนแล้ว {a}/2 ครั้ง · หลังโอน QR เดิมของคุณจะใช้ไม่ได้ทันที", { a: t.transfers })}</span></div>
    <span className="pill warn" style={{ alignSelf: "flex-start" }}>{tr("ระบบทดลอง: ยังไม่ได้เชื่อมต่อ API การโอนสิทธิ์")}</span>
    <button className="btn" disabled={!to.trim()} onClick={() => transferTicket(to.trim())}>{tr("ยืนยันการโอนสิทธิ์")}</button><button className="btn plain" onClick={closeSheet}>{tr("ยกเลิก")}</button>
  </>);
}
export const openTransfer = () => sheet(() => <TransferSheet />);

export function openReset() {
  sheet(() => (<>
    <h2 style={{ fontSize: 20 }}>{tr("ต้องการล้างข้อมูลระบบทดลองหรือไม่?")}</h2><p className="muted" style={{ margin: 0 }}>{tr("ข้อมูลบัตร รายการขายต่อ และประวัติทั้งหมดในระบบทดลองนี้จะถูกล้างและเริ่มต้นใหม่ ไม่สามารถย้อนกลับได้")}</p>
    <button className="btn org-danger-btn" onClick={() => { resetDemo(); location.href = "/"; }}>{tr("ล้างข้อมูลระบบทดลอง")}</button><button className="btn plain" onClick={closeSheet}>{tr("ยกเลิก")}</button>
  </>));
}
export function openRules() {
  sheet(() => (<>
    <h2 style={{ fontSize: 20 }}>{tr("เงื่อนไขและข้อกำหนดการซื้อขายต่อ")}</h2>
    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12, fontSize: 15, lineHeight: 1.5 }}>
      <li><b>{tr("อนุญาตให้ขายต่อเฉพาะภายในแพลตฟอร์มเท่านั้น")}</b><br /><span className="muted small">{tr("บัตรที่ซื้อขายนอกระบบจะไม่สามารถสแกนเข้างานได้")}</span></li>
      <li><b>{tr("ควบคุมเพดานราคาไม่เกิน 1.25 เท่าของราคาหน้าบัตร")}</b><br /><span className="muted small">{tr("ผู้ขายถูกหักค่าธรรมเนียม 6% เมื่อจำหน่ายได้สำเร็จ")}</span></li>
      <li><b>{tr("เปิดให้ขายต่อได้ภายหลังได้รับบัตรแล้ว 6 ชั่วโมง")}</b><br /><span className="muted small">{tr("ปิดระบบการโอนสิทธิ์ 1 ชั่วโมงก่อนเริ่มอีเวนต์")}</span></li>
      <li><b>{tr("กรณียกเลิกอีเวนต์ ระบบคืนเงินเต็มจำนวนตามราคาที่ชำระจริง")}</b><br /><span className="muted small">{tr("ดำเนินการคืนเงินให้แก่ผู้ถือบัตรคนสุดท้าย")}</span></li>
    </ul>
    <button className="btn" onClick={() => { closeSheet(); toast(tr("ยอมรับเงื่อนไขและข้อกำหนดเรียบร้อยแล้ว"), "ok"); }}>{tr("ยอมรับเงื่อนไขและข้อกำหนด")}</button>
    <button className="btn plain" style={{ color: "var(--danger-solid)" }} onClick={() => { closeSheet(); if (currentScreen() === "event") back(); }}>{tr("ปฏิเสธเงื่อนไขและยกเลิกการทำรายการ")}</button>
  </>));
}
export { HOUR, initial, save };
