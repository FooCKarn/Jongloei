// App state: one mutable object S (as in the mock-up) plus a tiny
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

export const POSTERS = [
  "linear-gradient(140deg,#A00018,#4A0010 70%,#1E0508)", "linear-gradient(160deg,#C2412D,#7E0013 60%,#2B0A0E)",
  "linear-gradient(150deg,#D6455A,#A00018 45%,#3D0710)", "linear-gradient(130deg,#8A1020,#2A0A0D)",
  "linear-gradient(150deg,#2B4C7E,#1B2A4A 60%,#0D1424)", "linear-gradient(140deg,#B86B12,#7A3D08 60%,#2A1404)",
];

export const ORG_PARAMS = { resaleEnabled: true, capMultiplier: 1.25, resaleDelayH: 6, transferCutoffH: 1, disputeWindowH: 24, perUserLimit: 4 };
/* ---------- state ---------- */
export const S: any = {
  auth: { google: false }, signedIn: false,
  user: { name: "", email: "", wallet: "" },
  ev: "", zone: 0, qty: 1, pay: "stripe", tickets: [] as any[],
  q: "", cat: "ทั้งหมด", mcat: "all", slide: 0,
  listings: [] as any[],
  sel: null, nextTid: 1311, buyingListing: null, mtab: "active",
  mode: "buyer", org: null as any, orgLive: null, orgLiveWanted: false,
  order: null, promo: null, realListings: null, pendingResales: [] as any[], desk: false, copied: false, hideMarketNote: false,
};

// event list: always loaded from /api/events (D1); there is no browser-only fallback
export const EV: { base: any[]; all: any[] } = { base: [], all: [] };

/* ---------- re-render subscription ---------- */
let version = 0;
const listeners = new Set<() => void>();
export function emit() { version++; listeners.forEach(l => l()); }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function useApp() { useSyncExternalStore(subscribe, () => version, () => 0); return S; }

/* ---------- server-backed state: nothing is kept in the browser ---------- */
export const save = () => {};
export const load = () => {};

/* ---------- buyer events ---------- */
// organizer names are typed by people; React escapes them when rendered, so no extra escaping here
export function toBuyerEvent(ev: any) {
  return { ...OL.toBuyerEvent(ev), image: ev.image || null, desc: ev.description || "", startAt: ev.startAt || null };
}
export function refreshEvents() { EV.all = EV.base; }
export const evById = (id: string): any => EV.all.find(e => e.id === id);
export const minPrice = (ev: any) => Math.min(...ev.zones.map((z: any) => z.p));
export const initial = () => [...tr(String(S.user.name || S.user.email || "?")).trim()][0] || "?";

export const ensureOrg = () => S.org;
export const orgEv = (id: string) => S.org.events.find((e: any) => e.id === id);
export function replaceOrgEvent(ev: any) { S.org.events = S.org.events.map((e: any) => (e.id === ev.id ? ev : e)); refreshEvents(); }
export function orgPerson(id: string) { if (id === "me") return { name: tr(S.user.name), email: S.user.email, phone: "" }; const b = S.org.buyers[id]; return b ? { ...b, name: tr(b.name) } : { name: id, email: "", phone: "" }; }
export function ledgerAdd(x: any) { if (S.org.ledger.some((l: any) => l.idempotencyKey === x.idempotencyKey)) return false; S.org.ledger.push({ id: x.idempotencyKey, status: "DONE", ...x }); return true; }
export const myEvents = () => S.org.events.filter((e: any) => (e.shopId || "") === S.org.shop.id);
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
