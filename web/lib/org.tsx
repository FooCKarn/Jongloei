"use client";
// Organizer actions: demo shop (state in this browser) and the real shop (/api/org/*, src/organizer.js).
// In live mode S.org holds what the server returned and the demo state waits in S.orgDemo.
import { useState } from "react";
import { S, OL, emit, save, HOUR, DAY, POSTERS, ORG_PARAMS, DEMO_ACCOUNTS, isLocal, evById, refreshEvents, ensureOrg, orgEv, replaceOrgEvent,
  orgPerson, ledgerAdd, evTickets } from "./state";
import { go, back, currentScreen } from "./nav";
import { toast, mockToast, sheet, closeSheet, rerenderSheet } from "./ui";
import { googleLogin, loadEvents } from "./buyer";

export const B = (s: number) => OL.fmtBaht(s);
export const live = () => !!(S.org && S.org.live);
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const ROLE_LABEL: Record<string, string> = { owner: "เจ้าของ", manager: "ผู้จัดการ", gate: "พนักงานหน้างาน" };
export const SHOP_KINDS: [string, string][] = [["bar", "บาร์ / ร้านอาหาร"], ["workshop", "Workshop / คลาสเรียน"], ["popup", "Pop-up / ตลาด"], ["concert", "คอนเสิร์ต / แฟนมีต"], ["other", "อื่น ๆ"]];
export const EV_STATUS: Record<string, [string, string]> = { draft: ["ร่าง", "grey"], on_sale: ["เปิดขาย", "ok"], paused: ["พักการขาย", "warn"], sold_out: ["ขายหมด", ""], ended: ["จบแล้ว", "grey"], cancelled: ["ยกเลิก", "danger"] };
export const TICKET_STATUS: Record<string, string> = { valid: "พร้อมใช้", listed: "ลงขายอยู่", used: "ใช้แล้ว", refunded: "คืนเงินแล้ว", unavailable: "ไม่มา" };
export const WIZ_STEPS = ["ข้อมูลงาน", "โซนตั๋ว", "กติกาตั๋ว", "ตรวจและเผยแพร่"];
export const ZONE_KINDS: [string, string][] = [["standing", "ยืน (Standing)"], ["seated", "ที่นั่ง"], ["table", "โต๊ะ"], ["comp", "บัตรเชิญ (ฟรี)"]];
export const ZONE_COLORS: [string, string][] = [["#E8485A", "แดงอ่อน"], ["#A00018", "แดงเข้ม"], ["#4A0010", "น้ำตาลแดง"], ["#B86B12", "ส้มทอง"], ["#2B4C7E", "น้ำเงิน"]];
export const EV_CATS = ["ปาร์ตี้", "คอนเสิร์ต", "เทศกาล", "แฟนมีตติ้ง", "สแตนด์อัป", "workshop"];
const WIZ_TEMPLATES: Record<string, any[]> = {
  bar: [["Standing", "standing", 500, 100], ["โต๊ะ 4 ที่", "table", 3000, 10, 4]],
  workshop: [["ที่นั่ง workshop", "seated", 1500, 12]],
  concert: [["Standing", "standing", 1500, 200], ["Seat", "seated", 2500, 100], ["VIP", "seated", 4500, 20]],
};
export const PROMO_WHY: Record<string, string> = { not_found: "ไม่พบโค้ดนี้หรือถูกปิดใช้งาน", expired: "โค้ดหมดอายุหรือยังไม่เริ่มใช้", used_up: "โค้ดถูกใช้ครบจำนวนแล้ว", wrong_zone: "โค้ดนี้ใช้กับโซนนี้ไม่ได้" };
export const AN_TEMPLATES: Record<string, string> = { time: "เวลาเริ่มงานเปลี่ยนเป็น __:__ น. ตั๋วใบเดิมใช้ได้ตามปกติ ไม่ต้องทำอะไรเพิ่ม",
  place: "สถานที่จัดงานเปลี่ยนเป็น ________ ตั๋วใบเดิมใช้ได้ตามปกติ ขออภัยในความไม่สะดวก",
  weather: "เนื่องจากสภาพอากาศ งานอาจเลื่อนหรือย้ายเข้าในร่ม เราจะแจ้งอีกครั้งภายใน __ ชม. ตั๋วยังใช้ได้" };
export const SIM_CASES: [number, string][] = [[1, "ตั๋วถูกต้อง"], [2, "ตั๋วที่ใช้ไปแล้ว"], [3, "QR เก่า (เกิน 60 วินาที)"], [4, "QR จากอนาคต (เกิน 15 วินาที)"],
  [5, "ตั๋วของงานอื่น"], [6, "งานที่ถูกยกเลิก"], [7, "ผู้ถือคนเก่าที่ขายต่อไปแล้ว"], [8, "ตั๋วที่กำลังลงขาย (ยังเข้าได้)"]];
export const LIVE_REASON: Record<string, string> = {
  malformed: "ไม่ใช่ QR ตั๋วของ JONGLOEI", expired: "QR หมดอายุ (เกิน 60 วินาที) อาจเป็นภาพแคปหน้าจอ ให้ผู้ถือเปิดตั๋วในแอปใหม่",
  future: "เวลาใน QR ล้ำหน้าเกิน 15 วินาที ให้ผู้ถือตรวจเวลาในเครื่อง", unknown_ticket: "ไม่พบตั๋วใบนี้ในระบบ",
  bad_signature: "ลายเซ็นไม่ตรงกับเจ้าของตั๋วปัจจุบัน เช่น QR ของผู้ขายเดิม", wrong_event: "ตั๋วนี้เป็นของงานอื่น",
  event_cancelled: "งานนี้ถูกยกเลิกแล้ว", event_ended: "งานจบแล้ว", already_used: "ตั๋วใบนี้ใช้เข้างานไปแล้ว",
  listed: "ตั๋วกำลังลงขายต่อ ให้ผู้ถือยกเลิกการขายก่อน", not_issued: "ตั๋วยังออกไม่เสร็จ",
  chain_mismatch: "เจ้าของบนบล็อกเชนไม่ตรงกับในระบบ", chain_unavailable: "ตรวจบนบล็อกเชนไม่ได้ชั่วคราว ลองสแกนอีกครั้ง" };
export const ORDER_STATUS: Record<string, string> = { pending: "รอชำระ (Hold)", expired: "หมดเวลา", paid: "ชำระแล้ว", fulfilled: "ออกตั๋วแล้ว", failed: "ไม่สำเร็จ", needs_review: "รอตรวจสอบ" };

export const maskEmail = (m: string) => { const [a, b] = String(m).split("@"); return b ? a.slice(0, 1) + "***@" + b : "***"; };
export const whenText = (ms: number | null) => (ms ? OL.thaiDate(ms) + " · " + OL.thaiTime(ms) + " น." : "ยังไม่กำหนดวัน");
export const shortOf = (e: any) => e.short || String(e.name || "ชื่องาน").split(/\s+/).slice(0, 2).join("\n").toUpperCase();
const myEventsOf = () => S.org.events.filter((e: any) => (e.shopId || "shop-demo") === S.org.shop.id);
export const myEvents = myEventsOf;

/* ---------- mode ---------- */
export function setMode(mode: "buyer" | "org") {
  closeSheet(); camStop();
  // the real shop steps aside while the buyer side runs, so buyer code only ever sees the demo organizer state
  if (mode === "buyer" && S.org && S.org.live) { S.orgLive = S.org; S.org = S.orgDemo; S.orgDemo = null; refreshEvents(); }
  else if (mode === "org" && S.orgLive) { S.orgDemo = S.org; S.org = S.orgLive; S.orgLive = null; }
  S.mode = mode; emit();
  go(mode === "org" ? orgHomeScreen() : "home", { replace: true });
}
// the organizer area has its own account, so it never asks for the buyer's Google sign-in
export function enterOrg() { if (S.orgLiveWanted && S.signedIn && !S.orgLive && !live()) orgLiveStart(); else setMode("org"); }
export function orgHomeScreen() {
  const o = S.org;
  if (!o || !o.account) return "orgWelcome";
  if (!o.shop) return "orgOnboard";
  return o.role === "gate" ? "orgGatePick" : "orgDash";
}
// keeps the screen inside the current mode and the organizer role's allowed screens; returns where to go instead
export function guardFor(cur: string): string | null {
  const isOrg = cur.startsWith("org");
  if (S.mode !== "org") return isOrg ? "home" : null;
  if (!S.org.account) return cur === "orgWelcome" ? null : "orgWelcome";
  if (!S.org.shop) return cur === "orgOnboard" ? null : "orgOnboard";
  if (!isOrg || cur === "orgWelcome" || cur === "orgOnboard") return orgHomeScreen();
  if (S.org.role === "gate" && !["orgGatePick", "orgGate"].includes(cur)) return "orgGatePick";
  if (live() && ["orgFinance", "orgTeam"].includes(cur)) return "orgDash";
  if (S.org.role !== "owner" && ["orgFinance", "orgTeam"].includes(cur)) return "orgDash";
  if (cur === "orgWizard" && !S.org.draft) return "orgDash";
  if ((cur === "orgEvent" || cur === "orgGate") && !(S.org.oev && orgEv(S.org.oev))) return cur === "orgGate" ? "orgGatePick" : "orgEvents";
  return null;
}
export const ORG_TABS: [string, string, string][] = [["orgDash", "i-chart", "ภาพรวม"], ["orgEvents", "i-ticket", "งานของฉัน"], ["orgGatePick", "i-qr", "หน้างาน"], ["orgFinance", "i-wallet", "การเงิน"]];
export function orgTabsFor(role: string) {
  // a real shop has only what the backend serves yet: overview, events and the door
  if (live()) return ORG_TABS.filter(([k]) => (role === "gate" ? k === "orgGatePick" : ["orgDash", "orgEvents", "orgGatePick"].includes(k)));
  return ORG_TABS.filter(([k]) => (role === "gate" ? k === "orgGatePick" : role === "manager" ? k !== "orgFinance" : true));
}

/* ---------- demo organizer accounts ---------- */
const teamShopOf = (email: string) => S.org.shops.find((s: any) => s.team.some((m: any) => m.email === email));
const orgKnown = (email: string) => !!(S.org.accounts[email] || teamShopOf(email));
export function orgLoginAs(email: string) {
  const o = S.org, tshop = teamShopOf(email);
  if (!o.accounts[email]) o.accounts[email] = { name: email.split("@")[0], shopId: tshop ? tshop.id : null };
  const acc = o.accounts[email];
  o.account = { email, name: acc.name };
  o.shop = (acc.shopId && o.shops.find((s: any) => s.id === acc.shopId)) || null;
  const m = o.shop && o.shop.team.find((x: any) => x.email === email); o.role = o.shop ? (m ? m.role : "owner") : null;
  if (!o.shop) o.onboard = { step: 1, data: { kind: "bar", legal: "individual" }, err: {} };
  closeSheet(); emit(); go(orgHomeScreen(), { replace: true });
}
export function orgLogout() {
  if (live()) orgLiveStop();
  const o = S.org; o.account = null; o.shop = null; o.role = null; o.oev = null; o.draft = null; o.wizDirty = false; o.printEv = null;
  closeSheet(); emit(); go("orgWelcome", { replace: true });
}
function OrgChooser({ mode }: { mode: "signup" | "login" }) {
  const [email, setEmail] = useState(""), [name, setName] = useState(""), [err, setErr] = useState<any>({});
  const sample = Object.entries(S.org.accounts).filter(([e]) => DEMO_ACCOUNTS[e]) as [string, any][];
  const submit = () => {
    const em = email.trim().toLowerCase();
    if (!EMAIL_RE.test(em)) return setErr({ email: "อีเมลไม่ถูกต้อง" });
    if (mode === "signup") {
      if (orgKnown(em)) return setErr({ email: "อีเมลนี้มีบัญชีผู้จัดงานแล้ว กดเข้าสู่ระบบแทน" });
      if (!name.trim()) return setErr({ name: "ใส่ชื่อของคุณ" });
      S.org.accounts[em] = { name: name.trim(), shopId: null };
    } else if (!orgKnown(em)) return setErr({ email: "ยังไม่มีบัญชีผู้จัดงานนี้ กดสมัครผู้จัดงานก่อน" });
    orgLoginAs(em);
  };
  return (<>
    <div className="row" style={{ gap: 12 }}><svg width="40" height="40"><use href="#logo" /></svg><div><h2 style={{ fontSize: 19 }}>{mode === "signup" ? "สมัครผู้จัดงาน" : "เข้าสู่ระบบผู้จัดงาน"}</h2>
      <div className="small muted">ด้วยบัญชี Google ของผู้จัดงาน แยกจากบัญชีผู้ซื้อ</div></div></div>
    <span className="pill warn" style={{ alignSelf: "flex-start" }}>จำลอง: ยังไม่ได้เชื่อม Google จริงสำหรับผู้จัดงาน</span>
    <Fld id="og-email" label="อีเมล Google" err={err.email}><input id="og-email" type="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} {...errA("og-email", err.email)} /></Fld>
    {mode === "signup" && <Fld id="og-name" label="ชื่อของคุณ" err={err.name}><input id="og-name" autoComplete="off" value={name} onChange={e => setName(e.target.value)} {...errA("og-name", err.name)} /></Fld>}
    <button className="btn" onClick={submit}>{mode === "signup" ? "สมัครและดำเนินการต่อ" : "เข้าสู่ระบบ"}</button>
    {mode === "login" && sample.length > 0 && <div className="adv"><b className="small">บัญชีตัวอย่าง</b>{sample.map(([e, a]) => (
      <button key={e} className="btn plain" style={{ fontSize: 14, padding: 10 }} onClick={() => orgLoginAs(e)}>{a.name}<br /><span className="small muted">{e}</span></button>))}</div>}
    <button className="btn plain" onClick={closeSheet}>ปิด</button>
  </>);
}
export const orgChooser = (mode: "signup" | "login") => sheet(() => <OrgChooser mode={mode} />);

/* ---------- small form helpers shared by organizer screens ---------- */
export const errA = (id: string, err?: string, hint?: boolean) => ({ "aria-describedby": `${id}-err${hint ? ` ${id}-hint` : ""}`, "aria-invalid": err ? true : undefined });
export function Fld({ id, label, err, hint, children }: { id: string; label: any; err?: string; hint?: any; children: any }) {
  return (<div className="field"><label htmlFor={id}>{label}</label>{children}
    {hint ? <span className="hint" id={`${id}-hint`}>{hint}</span> : null}<span className="hint err" id={`${id}-err`} role="alert">{err || ""}</span></div>);
}

/* ---------- onboarding ---------- */
const OB_CHECK: Record<number, (d: any) => any> = {
  1: d => ({ ...(String(d.name || "").trim().length < 2 || String(d.name).length > 60 ? { name: "ใส่ชื่อร้าน 2-60 ตัวอักษร" } : {}), ...(!/^0\d{9}$/.test(String(d.phone || "").replace(/\D/g, "")) ? { phone: "เบอร์โทร 10 หลัก ขึ้นต้นด้วย 0" } : {}) }),
  2: d => (!/^\d{13}$/.test(String(d.taxId || "").replace(/\D/g, "")) ? { tax: "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก" } : {}),
  3: d => (!/^(0\d{9}|\d{13})$/.test(String(d.pp || "").replace(/\D/g, "")) ? { pp: "ใส่เบอร์มือถือ 10 หลัก หรือเลขบัตร/เลขนิติบุคคล 13 หลัก" } : {}),
  4: d => (!d.docName ? { doc: "แนบเอกสารยืนยันตัวตนก่อนส่ง" } : {}),
};
function obValid() { const ob = S.org.onboard; ob.err = OB_CHECK[ob.step](ob.data); emit(); return !Object.keys(ob.err).length; }
export async function obNext() {
  if (!obValid()) return;
  if (live()) {
    const o = S.org, d = o.onboard.data;
    await liveStep(async () => {
      const r = await orgApi("POST", "/api/org/shop", { name: d.name.trim(), type: d.kind, contactLine: d.line || "", phone: String(d.phone).replace(/\D/g, "") });
      o.shop = fromServerShop(r.shop, o.account.email, r.role); o.shops = [o.shop]; o.role = r.role; emit();
      go("orgDash", { replace: true }); toast("เปิดร้านแล้ว ทีมงาน JONGLOEI จะยืนยันร้านก่อนเผยแพร่งานได้");
    }, err => { S.org.onboard.err = { name: orgErrText(err) }; emit(); });
    return;
  }
  S.org.onboard.step = Math.min(4, S.org.onboard.step + 1); emit();
}
export function obBack() { const ob = S.org.onboard; ob.err = {}; if (ob.step > 1 && !live()) { ob.step--; emit(); } else orgLogout(); }
export function obSubmit() {
  if (!obValid()) return;
  const d = S.org.onboard.data, id = "shop-" + Date.now(), email = S.org.account.email;
  const shop = { id, name: d.name.trim(), kind: d.kind, legal: d.legal, taxId: String(d.taxId).replace(/\D/g, ""), contactLine: d.line, phone: String(d.phone).replace(/\D/g, ""),
    payoutPromptPay: String(d.pp).replace(/\D/g, ""), docName: d.docName, verification: "pending", team: [{ email, role: "owner" }] };
  S.org.shops.push(shop); S.org.accounts[email].shopId = id; S.org.shop = shop; S.org.role = "owner"; S.org.onboard = { step: 1, data: {}, err: {} };
  emit(); go("orgDash", { replace: true });
  mockToast("ส่งเอกสารแล้ว ระบบจะอนุมัติให้ใน 3 วินาที");
  setTimeout(() => {
    const sh = S.org && S.org.shops && S.org.shops.find((x: any) => x.id === id); if (!sh || sh.verification !== "pending") return;
    sh.verification = "verified"; emit(); if (S.mode === "org" && S.org.shop && S.org.shop.id === id) toast("ยืนยันร้านเรียบร้อย เผยแพร่งานได้แล้ว");
  }, 3000);
}

/* ---------- team ---------- */
export async function teamInvite(email: string, role: string) {
  const o = S.org, em = email.trim().toLowerCase();
  if (!EMAIL_RE.test(em)) { o.teamErr = "อีเมลไม่ถูกต้อง"; emit(); return false; }
  if (live()) {
    let ok = false;
    await liveStep(async () => { const r = await orgApi("POST", "/api/org/team", { email: em, role }); o.shop.team = teamFrom(r.team, o.account.email); o.teamErr = ""; ok = true;
      emit(); toast("เพิ่ม " + em + " แล้ว ให้เข้าสู่ระบบด้วย Google อีเมลนี้"); }, err => { o.teamErr = orgErrText(err); emit(); });
    return ok;
  }
  const team = o.shop.team;
  o.teamErr = team.some((m: any) => m.email === em) ? "อีเมลนี้อยู่ในทีมแล้ว" : "";
  if (!o.teamErr) { team.push({ email: em, role }); mockToast("ส่งคำเชิญถึง " + em + " แล้ว"); }
  emit(); return !o.teamErr;
}
export async function teamRemove(email: string) {
  const o = S.org;
  if (live()) { await liveStep(async () => { const r = await orgApi("DELETE", "/api/org/team?email=" + encodeURIComponent(email)); o.shop.team = teamFrom(r.team, o.account.email); emit(); }); return; }
  o.shop.team = o.shop.team.filter((m: any) => m.email !== email || m.role === "owner"); emit(); mockToast("ลบ " + email + " ออกจากทีมแล้ว");
}
export function viewAs(role: string) { if (live()) return notLive(); S.org.role = role; emit(); toast("กำลังดูในฐานะ" + ROLE_LABEL[role]); const g = guardFor(currentScreen()); if (g) go(g, { replace: true }); }
export function copyText(text: string, done: string) { try { navigator.clipboard.writeText(text).then(() => toast(done), () => toast(text)); } catch (_) { toast(text); } }
export function copyInvite() { if (live()) return notLive(); copyText(location.origin + "/?invite=" + encodeURIComponent(S.org.shop.id), "คัดลอกลิงก์เชิญแล้ว (ลิงก์จำลอง)"); }
export const notLive = () => toast("ส่วนนี้ยังไม่เปิดในระบบจริง ใช้ได้ในเดโม");

/* ---------- events: list, menu, open ---------- */
export function orgOpenEvent(id: string, tab = "overview") { closeSheet(); S.org.oev = id; S.org.etab = tab; emit(); go("orgEvent", { id }); }
export function gate(id: string) {
  closeSheet();
  if (S.org.oev !== id) S.org.liveGate = null;
  S.org.oev = id; S.org.gtab = "scan"; emit(); go("orgGate", { id });
}
export function evMenu(id: string) {
  const e = orgEv(id); if (!e) return;
  const it = (fn: () => void, icon: string, label: string) => (
    <button key={label} className="btn plain" style={{ justifyContent: "flex-start", gap: 14 }} role="menuitem" onClick={fn}><svg width="20" height="20"><use href={"#" + icon} /></svg>{label}</button>);
  sheet(() => (<>
    <h2 style={{ fontSize: 20 }}>{e.name}</h2>
    <div role="menu" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {it(() => orgOpenEvent(id), "i-chart", "เปิดจัดการงาน")}
      {["draft", "on_sale", "paused", "sold_out"].includes(e.status) && it(() => { closeSheet(); editEvent(id); }, "i-ticket", "แก้ไขงาน")}
      {it(() => { closeSheet(); evDuplicate(id); }, "i-copy", "ทำซ้ำเป็นงานใหม่")}
      {["on_sale", "sold_out"].includes(e.status) && it(() => gate(id), "i-qr", "ไปหน้างาน")}
    </div>
    <button className="btn plain" onClick={closeSheet}>ปิด</button>
  </>));
}

/* ---------- wizard ---------- */
const newZoneId = () => "z" + Math.random().toString(36).slice(2, 7);
export function mkZone(name: string, kind: string, baht: number, cap: number, seats: number | null, i: number) {
  return { id: newZoneId(), name, kind, price: Math.round(baht * 100), capacity: cap, sold: 0, held: 0, seatsPerUnit: seats || null, saleStartAt: null, saleEndAt: null, color: ZONE_COLORS[(i || 0) % ZONE_COLORS.length][0] };
}
export function newEvent() {
  S.org.draft = { id: "org-" + Date.now().toString(36), shopId: S.org.shop.id, name: "", short: "", category: "ปาร์ตี้", description: "", venue: "", mapUrl: "", bg: POSTERS[0], image: null,
    status: "draft", cancelReason: "", startAt: null, endAt: null, doorsAt: null, params: { ...ORG_PARAMS }, zones: [] };
  S.org.wizStep = 1; S.org.wizShow = false; S.org.wizDirty = false; emit(); go("orgWizard");
}
export function editEvent(id: string) { const e = orgEv(id); S.org.draft = JSON.parse(JSON.stringify(e)); S.org.wizStep = 1; S.org.wizShow = false; S.org.wizDirty = false; emit(); go("orgWizard"); }
export function evDuplicate(id: string) {
  const src = orgEv(id), c = OL.duplicateEvent(src, "org-" + Date.now().toString(36));
  c.image = src.image && !live() ? src.image : null;
  if (live()) { c.live = false; c.zones = c.zones.map((z: any) => ({ ...z, live: false })); } else S.org.events.push(c);
  S.org.draft = JSON.parse(JSON.stringify(c)); S.org.wizStep = 1; S.org.wizShow = false; emit(); toast("ทำซ้ำงานแล้ว ใส่วันเวลาใหม่ได้เลย"); go("orgWizard");
}
// the published copy of the event being edited (null for new events and drafts)
export function wizOrig() { const d = S.org.draft; const e = d && orgEv(d.id); return e && e.status !== "draft" ? e : null; }
const origZone = (z: any) => { const o = wizOrig(); return o && o.zones.find((x: any) => x.id === z.id); };
export const zoneLocked = (z: any) => { const oz = origZone(z); return !!oz && (oz.sold || 0) + (oz.held || 0) > 0; };
export const lockReason = (z: any) => OL.canEditZone(origZone(z), { price: origZone(z).price + 1 }).reason;
export const wizTouch = () => { S.org.wizDirty = true; emit(); };
export function wizErrors() {
  const d = S.org.draft, out: Record<string, string> = { ...OL.validateEvent(d, Date.now()).errors };
  if (wizOrig()) delete out.startAt;                    // already-running events keep their start date
  if (live()) Object.assign(out, liveWizErrors(d));
  d.zones.forEach((z: any, i: number) => { const oz = origZone(z); if (!oz) return; const c = OL.canEditZone(oz, { capacity: z.capacity }); if (!c.ok) out[`zones.${i}.capacity`] = c.reason; });
  return out;
}
const ERR_FIELD: Record<string, string> = { name: "w-name", venue: "w-venue", startAt: "w-start", endAt: "w-end", capMultiplier: "w-capm", zones: "zones" };
const ZERR_FIELD: Record<string, string> = { name: "name", price: "price", capacity: "cap", seatsPerUnit: "seats", saleStartAt: "open", saleEndAt: "close" };
export function errField(key: string) { const m = /^zones\.(\d+)\.(\w+)$/.exec(key); return m ? `z${m[1]}-${ZERR_FIELD[m[2]]}` : ERR_FIELD[key]; }
export const errStep = (key: string) => (key.startsWith("zones") ? 2 : key === "capMultiplier" ? 3 : 1);
export const focusLater = (id: string) => setTimeout(() => { const el = document.getElementById(id); if (el) { el.focus(); el.scrollIntoView({ block: "center" }); } }, 60);
export function zoneTotals(d: any) {
  let cap = 0, rev = 0, fees = 0;
  for (const z of d.zones) { const c = Number.isInteger(z.capacity) ? z.capacity : 0, p = Number.isInteger(z.price) ? z.price : 0; cap += c; if (z.kind !== "comp") { rev += p * c; fees += OL.serviceFee(p) * (p > 0 ? c : 0); } }
  return { cap, rev, fees, net: rev - fees };
}
export function capExample(d: any) {
  const z = d.zones.find((x: any) => x.kind !== "comp" && x.price > 0), face = z ? z.price : 100000, cap = OL.resaleCap(face, d.params.capMultiplier);
  return `ตั๋ว ${B(face)} ขายต่อได้สูงสุด ${B(cap)} · ผู้ขายถูกหัก 6% = ${B(OL.commission(cap))}`;
}
export function wizGo(step: number) { S.org.wizStep = step; S.org.wizShow = false; emit(); window.scrollTo?.(0, 0); document.getElementById("scroll")?.scrollTo(0, 0); }
export function wizNext() {
  const o = S.org, errs = wizErrors(), mine = Object.keys(errs).filter(k => errStep(k) === o.wizStep);
  if (mine.length) { o.wizShow = true; emit(); focusLater(errField(mine[0])); return; }
  wizGo(o.wizStep + 1);
}
export function wizBack() { if (S.org.wizStep > 1) wizGo(S.org.wizStep - 1); else wizLeave(); }
export function wizJump(key: string) { S.org.wizStep = errStep(key); S.org.wizShow = true; emit(); focusLater(errField(key)); }
export function wizTemplate(k: string) { S.org.draft.zones = WIZ_TEMPLATES[k].map((t, i) => mkZone(t[0], t[1], t[2], t[3], t[4], i)); wizTouch(); }
export function wizAddZone() { const d = S.org.draft; d.zones.push(mkZone("", "standing", 0, 0, null, d.zones.length)); wizTouch(); focusLater(`z${d.zones.length - 1}-name`); }
export function wizZoneDel(i: number) { S.org.draft.zones.splice(i, 1); wizTouch(); }
export function wizZoneMove(i: number, d: number) { const z = S.org.draft.zones, j = i + d; if (j < 0 || j >= z.length) return; [z[i], z[j]] = [z[j], z[i]]; wizTouch(); }
function wizUpsert() {
  const o = S.org, d = JSON.parse(JSON.stringify(o.draft)), cur = orgEv(d.id);
  d.zones.forEach((z: any) => { delete z._priceText; const c = cur && cur.zones.find((x: any) => x.id === z.id); if (c) { z.sold = c.sold; z.held = c.held; } });
  if (cur && cur.status !== "draft") d.status = cur.status;
  const i = o.events.findIndex((e: any) => e.id === d.id); if (i < 0) o.events.push(d); else o.events[i] = d;
  refreshEvents(); return d;
}
export async function wizSaveDraft() {
  if (live()) { await liveStep(async () => { if (await liveWizSave()) { emit(); toast("บันทึกแล้ว"); } }); return; }
  wizUpsert(); S.org.wizDirty = false; emit(); mockToast("บันทึกร่างแล้ว");
}
export async function wizPublish() {
  const o = S.org, errs = wizErrors(), keys = Object.keys(errs);
  if (o.shop.verification !== "verified") { toast(live() ? "เผยแพร่ได้หลังทีมงานยืนยันร้าน" : "เผยแพร่ได้หลังยืนยันร้าน"); return; }
  if (keys.length) { o.wizShow = true; emit(); toast("ยังมี " + keys.length + " เรื่องที่ต้องแก้ก่อนเผยแพร่"); return; }
  const edited = !!wizOrig();
  if (live()) {
    await liveStep(async () => {
      const ev = await liveWizSave(); if (!ev) return;
      const fin = ev.status === "draft" ? replaceLive((await orgApi("POST", `/api/org/events/${ev.id}/publish`, {})).event) : ev;
      o.draft = JSON.parse(JSON.stringify(fin)); o.wizEdited = edited; o.wizStep = 5; emit(); loadEvents(true);
    });
    return;
  }
  const d = o.draft; if (!edited) d.status = "on_sale";
  const saved = wizUpsert(); d.status = saved.status; o.wizEdited = edited; o.wizDirty = false; o.wizStep = 5; emit();
}
export async function wizBuyerView() {
  const id = S.org.draft.id; S.org.wizStep = 1; setMode("buyer");
  if (live() || id.startsWith("ev-")) await loadEvents(true);
  const e = evById(id); if (!e) { toast("งานนี้ยังไม่แสดงในหน้าผู้ซื้อ"); return; }
  S.ev = id; S.zone = Math.max(0, e.zones.findIndex((z: any) => z.left > 0)); S.qty = 1; emit(); go("event", { id });
}
export function wizToDash() { S.org.wizStep = 1; S.org.draft = null; emit(); go("orgDash", { replace: true }); }
export function wizLeave() {
  if (!S.org.wizDirty) { S.org.draft = null; emit(); back("orgDash"); return; }
  sheet(() => (<>
    <h2 style={{ fontSize: 19 }}>ยังไม่ได้บันทึก</h2><p className="small muted" style={{ margin: 0 }}>ต้องการเก็บสิ่งที่กรอกไว้เป็นร่างไหม</p>
    <button className="btn" onClick={async () => {
      if (live()) { await liveStep(async () => { if (await liveWizSave()) { closeSheet(); S.org.draft = null; emit(); back("orgDash"); } else closeSheet(); }); return; }
      wizUpsert(); S.org.wizDirty = false; S.org.draft = null; closeSheet(); emit(); mockToast("บันทึกร่างแล้ว"); back("orgDash");
    }}>บันทึกร่าง</button>
    <button className="btn plain" onClick={() => { S.org.wizDirty = false; S.org.draft = null; closeSheet(); emit(); back("orgDash"); }}>ทิ้งการแก้ไข</button>
    <button className="btn plain" onClick={closeSheet}>กรอกต่อ</button>
  </>));
}

/* ---------- poster image upload ----------
   The picture is resized in the browser to at most 1200 px and saved as JPEG (WebP/PNG kept small too).
   Demo: the data URL is kept on the event. Real shop: PUT /api/org/events/:id/poster (D1, migration 0009). */
const POSTER_MAX = 1200, POSTER_BYTES = 1_000_000;
export async function readPoster(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("ใช้ได้เฉพาะรูป JPG, PNG หรือ WebP");
  if (file.size > 15_000_000) throw new Error("รูปใหญ่เกิน 15 MB");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("เปิดรูปนี้ไม่ได้")); i.src = url; });
    const scale = Math.min(1, POSTER_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.85, 0.72, 0.6]) {
      const data = c.toDataURL("image/jpeg", q);
      if (Math.floor((data.length - data.indexOf(",") - 1) * 3 / 4) <= POSTER_BYTES * 0.9) return data;
    }
    throw new Error("รูปยังใหญ่เกิน 1 MB หลังย่อ ลองใช้รูปอื่น");
  } finally { URL.revokeObjectURL(url); }
}
// wizard: keeps the picture on the draft; a real shop uploads it after the event is saved
export async function wizSetPoster(file: File | null) {
  const d = S.org.draft;
  if (!file) { d.image = null; d._posterRemove = true; wizTouch(); return; }
  try { d.image = await readPoster(file); d._posterNew = true; d._posterRemove = false; wizTouch(); toast("ใส่รูปโปสเตอร์แล้ว", "ok"); }
  catch (err: any) { toast(err.message, "err"); }
}
// event settings: saves right away
export async function stSetPoster(file: File | null) {
  const e = orgEv(S.org.oev);
  let image: string | null = null;
  if (file) { try { image = await readPoster(file); } catch (err: any) { toast(err.message, "err"); return; } }
  if (live()) {
    await liveStep(async () => {
      const r = image ? await orgApi("PUT", `/api/org/events/${e.id}/poster`, { image }) : await orgApi("DELETE", `/api/org/events/${e.id}/poster`);
      replaceLive(r.event); emit(); toast(image ? "อัปโหลดโปสเตอร์แล้ว" : "ลบรูปโปสเตอร์แล้ว", "ok"); loadEvents(true);
    });
    return;
  }
  replaceOrgEvent({ ...e, image }); emit(); mockToast(image ? "เปลี่ยนรูปโปสเตอร์แล้ว" : "ลบรูปโปสเตอร์แล้ว");
}
export function stSetSwatch(i: number) {
  const e = orgEv(S.org.oev);
  if (live()) { liveStep(async () => { replaceLive((await orgApi("PATCH", "/api/org/events/" + e.id, { poster: i })).event); emit(); toast("เปลี่ยนพื้นหลังโปสเตอร์แล้ว", "ok"); }); return; }
  replaceOrgEvent({ ...e, bg: POSTERS[i] }); emit(); mockToast("เปลี่ยนพื้นหลังโปสเตอร์แล้ว");
}

/* ---------- event management ---------- */
export function pause() { if (live()) return notLive(); const e = orgEv(S.org.oev); replaceOrgEvent({ ...e, status: "paused" }); emit(); mockToast("พักการขายแล้ว ผู้ซื้อยังเห็นงานแต่ซื้อไม่ได้"); }
export function resume() { if (live()) return notLive(); const e = orgEv(S.org.oev); replaceOrgEvent({ ...e, status: "on_sale" }); emit(); mockToast("เปิดขายต่อแล้ว"); }
export async function zoneSave(i: number, priceText: string | null, capText: string): Promise<string> {
  const e = orgEv(S.org.oev), z = e.zones[i];
  if (live()) {
    const cap = Number(capText.trim()); let price = z.price;
    if (priceText !== null) { const p = OL.toSatang(priceText.trim()); if (Number.isNaN(p) || p % 100 || p < 2000) return "ราคาต้องเป็นบาทเต็ม อย่างน้อย 20฿"; price = p; }
    if (!Number.isInteger(cap) || cap < 1) return "จำนวนต้องเป็นจำนวนเต็มอย่างน้อย 1";
    const zones = e.zones.map((x: any, k: number) => (k === i ? { ...x, price, capacity: cap } : x));
    let msg = "";
    await liveStep(async () => { replaceLive((await orgApi("PATCH", "/api/org/events/" + e.id, { zones: toServerZones(zones) })).event); emit(); toast("บันทึกโซนแล้ว", "ok"); }, err => { msg = orgErrText(err); });
    return msg;
  }
  const patch: any = { capacity: Number(capText.trim() || 0) };
  if (priceText !== null) { const p = OL.toSatang(priceText.trim()); patch.price = Number.isNaN(p) ? 0 : p; }
  const can = OL.canEditZone(z, patch), merged = { ...z, ...patch }, v = OL.validateZone(merged);
  const msg = !can.ok ? can.reason : !v.ok ? (Object.values(v.errors)[0] as string) : "";
  if (msg) return msg;
  replaceOrgEvent({ ...e, zones: e.zones.map((x: any, k: number) => (k === i ? merged : x)) }); emit(); mockToast("บันทึกโซนแล้ว"); return "";
}
export function buyerRows(e: any) {
  const o = S.org, q = (o.bq || "").toLowerCase();
  return evTickets(e.id).map((t: any) => ({ t, p: orgPerson(t.holderId), z: e.zones.find((z: any) => z.id === t.zoneId) || { name: "—" } }))
    .filter((r: any) => (o.bzone === "all" || !o.bzone || r.t.zoneId === o.bzone) && (o.bstatus === "all" || !o.bstatus || r.t.status === o.bstatus)
      && (!q || (r.p.name + " " + r.p.email + " " + r.t.ticketId).toLowerCase().includes(q)));
}
const csvCell = (v: any) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function downloadCsv(name: string, rows: any[][]) {
  const blob = new Blob(["﻿" + rows.map(r => r.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
export function csv() {
  const e = orgEv(S.org.oev);
  if (live()) {
    const rows = S.org.orders[e.id];
    if (!Array.isArray(rows)) { toast("รอโหลดคำสั่งซื้อก่อน"); return; }
    downloadCsv("คำสั่งซื้อ-" + e.id + ".csv", [["ผู้ซื้อ", "อีเมล", "โซน", "ใบ", "ยอด (บาท)", "สถานะ", "ตั๋วที่ออก"], ...rows.map((r: any) => [r.buyer || "", r.email, r.zone, r.quantity, r.amountSatang / 100, ORDER_STATUS[r.status] || r.status, r.minted])]);
    return;
  }
  const em = (x: string) => (S.org.showEmails ? x : maskEmail(x));
  downloadCsv("ผู้ซื้อ-" + e.id + ".csv", [["ชื่อ", "อีเมล", "โซน", "สถานะ", "เลขตั๋ว"], ...buyerRows(e).map((r: any) => [r.p.name, em(r.p.email), r.z.name, TICKET_STATUS[r.t.status] || r.t.status, r.t.ticketId])]);
  toast("ส่งออก CSV แล้ว", "ok");
}
export function rsSave(capm: number) { const e = orgEv(S.org.oev); replaceOrgEvent({ ...e, params: { ...e.params, capMultiplier: capm / 100 } }); emit(); mockToast("บันทึกเพดานแล้ว"); }
export async function stSave(f: { desc: string; venue: string; start: number | null; msg: string }): Promise<Record<string, string>> {
  const e = orgEv(S.org.oev), o = S.org;
  if (!f.start) return { start: "ใส่วันเวลาเริ่มงาน" };
  if (!f.venue.trim()) return { venue: "ใส่สถานที่" };
  const changed = f.venue.trim() !== e.venue || f.start !== e.startAt;
  if (live()) {
    const body: any = { description: f.desc, venue: f.venue.trim() };
    if (f.start !== e.startAt) { body.startsAt = f.start; body.endsAt = e.endAt + (f.start - e.startAt); }
    let out = {};
    await liveStep(async () => { replaceLive((await orgApi("PATCH", "/api/org/events/" + e.id, body)).event); emit();
      toast(f.msg ? "บันทึกแล้ว ระบบจริงยังไม่ส่งข้อความถึงผู้ซื้อ" : "บันทึกการตั้งค่าแล้ว"); loadEvents(true); }, err => { out = { start: orgErrText(err) }; });
    return out;
  }
  if (changed && e.zones.reduce((a: number, z: any) => a + (z.sold || 0), 0) > 0 && !f.msg.trim()) return { msg: "เปลี่ยนสถานที่หรือวันเวลาหลังขายแล้ว ต้องเขียนข้อความแจ้งผู้ซื้อ" };
  const shift = f.start - e.startAt;
  replaceOrgEvent({ ...e, description: f.desc, venue: f.venue.trim(), startAt: f.start, endAt: e.endAt ? e.endAt + shift : e.endAt, doorsAt: e.doorsAt ? e.doorsAt + shift : e.doorsAt });
  if (changed && f.msg.trim()) {
    const n = new Set(evTickets(e.id).filter((t: any) => ["valid", "listed"].includes(t.status)).map((t: any) => t.holderId)).size;
    o.announcements.push({ id: "an-" + Date.now(), eventId: e.id, at: Date.now(), text: f.msg.trim(), recipients: n, zone: "all" }); mockToast("แจ้งผู้ซื้อ " + n + " คนแล้ว");
  } else mockToast("บันทึกการตั้งค่าแล้ว");
  emit(); return {};
}

/* ---------- cancel an event ---------- */
// one refund per paid hop, safe to run again (idempotency keys), buyer tickets follow
function orgCancelEvent(id: string, reason: string) {
  const o = S.org, ev = orgEv(id);
  if (!ev || ["cancelled", "ended", "draft"].includes(ev.status)) return { refunded: 0, total: 0, refunds: [] as any[] };
  const done = new Set(o.ledger.filter((l: any) => l.type === "REFUND_OUT").map((l: any) => l.idempotencyKey));
  const plan = OL.planCancellation(ev, o.tickets, done);
  for (const r of plan.refunds) ledgerAdd({ type: "REFUND_OUT", eventId: id, ticketId: r.ticketId, amount: r.amount, party: r.payerId, idempotencyKey: r.key });
  for (const t of o.tickets) if (t.eventId === id && t.hops.some((h: any) => h.paid > 0)) t.status = "refunded";
  replaceOrgEvent({ ...ev, status: "cancelled", cancelReason: reason || "" });
  S.listings = S.listings.filter((l: any) => l.ev !== id);
  for (const bt of S.tickets) {
    if (bt.ev !== id) continue;
    const mine = plan.refunds.filter((r: any) => r.ticketId === bt.orgTicketId && r.payerId === "me").reduce((a: number, r: any) => a + r.amount, 0);
    bt.status = "refunded"; bt.refundAmount = mine / 100;
  }
  emit(); return { ...plan, refunded: plan.refunds.length };
}
export function cancelStart() {
  const e = orgEv(S.org.oev);
  if (live()) { cancelConfirmSheet(); return; }
  const done = new Set(S.org.ledger.filter((l: any) => l.type === "REFUND_OUT").map((l: any) => l.idempotencyKey));
  const plan = OL.planCancellation(e, S.org.tickets, done), payers = new Set(plan.refunds.map((r: any) => r.payerId));
  sheet(() => (<>
    <h2 style={{ fontSize: 19 }}>ยกเลิก &quot;{e.name}&quot;?</h2>
    <dl className="kv card num" style={{ margin: 0 }}><dt>ผู้ซื้อที่จะได้เงินคืน</dt><dd>{payers.size} คน</dd><dt>จำนวนรายการคืนเงิน</dt><dd>{plan.refunds.length} รายการ</dd>
      <dt style={{ fontWeight: 600, color: "var(--ink)" }}>ยอดคืนรวม</dt><dd style={{ fontWeight: 700, color: "var(--red)" }}>{B(plan.total)}</dd></dl>
    <ul className="small" style={{ margin: 0, paddingLeft: 18 }}><li>ร้านจะไม่ได้รับเงินจากงานนี้</li><li>ไม่เก็บค่าบริการและคอมมิชชันขายต่อ</li><li>ตั๋วทุกใบใช้เข้างานไม่ได้ทันที</li></ul>
    <button className="btn org-danger-btn" onClick={cancelConfirmSheet}>ถัดไป</button><button className="btn plain" onClick={closeSheet}>ไม่ยกเลิก</button>
  </>));
}
function CancelConfirm() {
  const e = orgEv(S.org.oev);
  const [name, setName] = useState(""), [reason, setReason] = useState("สภาพอากาศ"), [err, setErr] = useState("");
  const go2 = async () => {
    if (name.trim() !== e.name) { setErr("ชื่องานไม่ตรง พิมพ์ให้เหมือนกับด้านบน"); return; }
    if (live()) {
      await liveStep(async () => {
        const r = await orgApi("POST", `/api/org/events/${e.id}/cancel`, { reason, confirmName: e.name }); replaceLive(r.event); emit(); loadEvents(true);
        sheet(() => (<>
          <h2 style={{ fontSize: 19 }}>ยกเลิกงานแล้ว</h2>
          <dl className="kv card num" style={{ margin: 0 }}><dt>ที่นั่งที่ Hold อยู่ (คืนแล้ว)</dt><dd>{r.heldReleased} รายการ</dd><dt>คำสั่งซื้อที่ต้องคืนเงิน</dt><dd>{r.toRefund.orders} รายการ</dd>
            <dt style={{ fontWeight: 600, color: "var(--ink)" }}>ยอดที่ต้องคืน</dt><dd style={{ fontWeight: 700, color: "var(--red)" }}>{B(r.toRefund.amountSatang)}</dd></dl>
          <div className="card small">ผู้ซื้อซื้อเพิ่มไม่ได้แล้ว การคืนเงินยังไม่อัตโนมัติ ทีมงาน JONGLOEI จะคืนเงินให้ผู้ซื้อตามรายการนี้</div>
          <button className="btn" onClick={closeSheet}>เสร็จสิ้น</button>
        </>));
      }, er => setErr(orgErrText(er)));
      return;
    }
    const plan = orgCancelEvent(e.id, reason); sheet(() => <CancelProgress plan={plan} />);
  };
  return (<>
    <h2 style={{ fontSize: 19 }}>ยืนยันการยกเลิกงาน</h2>
    <Fld id="cx-name" label="พิมพ์ชื่องานเพื่อยืนยัน" err={err} hint={"ชื่องาน: " + e.name}><input id="cx-name" value={name} onChange={x => setName(x.target.value)} autoComplete="off" {...errA("cx-name", err, true)} /></Fld>
    <Fld id="cx-reason" label="เหตุผล"><select id="cx-reason" value={reason} onChange={x => setReason(x.target.value)}>{["สภาพอากาศ", "ศิลปินยกเลิก", "สถานที่ไม่พร้อม", "ขายไม่ถึงเป้า", "อื่น ๆ"].map(x => <option key={x}>{x}</option>)}</select></Fld>
    <button className="btn org-danger-btn" onClick={go2}>{live() ? "ยกเลิกงาน" : "ยกเลิกงานและคืนเงินทุกคน"}</button><button className="btn plain" onClick={closeSheet}>กลับ</button>
  </>);
}
const cancelConfirmSheet = () => sheet(() => <CancelConfirm />);
function CancelProgress({ plan }: { plan: any }) {
  const by = new Map<string, number>(); for (const r of plan.refunds) by.set(r.payerId, (by.get(r.payerId) || 0) + r.amount);
  const rows = [...by].slice(0, 6);
  const [n, setN] = useState(0);
  useState(() => { let k = 0; const iv = setInterval(() => { k++; setN(k); if (k >= rows.length) clearInterval(iv); }, 350); return iv; });
  return (<>
    <h2 style={{ fontSize: 19 }}>กำลังคืนเงินผู้ซื้อ</h2><span className="pill warn" style={{ alignSelf: "flex-start" }}>จำลอง: เดโมไม่มีการโอนเงินจริง</span>
    <ol className="steps">{rows.map(([p, amt], i) => (<li key={p} className={i < n ? "done" : i === n ? "active" : ""}><span className="s"><svg><use href="#i-check" /></svg></span>
      <span><b>{orgPerson(p).name}</b><small className="num">{B(amt)} · {i < n ? "คืนแล้ว" : "รอ"}</small></span></li>))}</ol>
    {by.size > rows.length && <div className="small muted">และอีก {by.size - rows.length} คน</div>}
    <div className="small muted">รวมคืน {B(plan.total)} · {plan.refunds.length} รายการ</div>
    <button className="btn" onClick={closeSheet}>เสร็จสิ้น</button>
  </>);
}

/* ---------- comps, promo codes, announcements (demo only) ---------- */
export function compIssue(name: string, email: string, zoneId: string): Record<string, string> {
  const e = orgEv(S.org.oev), zone = e.zones.find((z: any) => z.id === zoneId), em = email.trim().toLowerCase();
  if (!name.trim()) return { name: "ใส่ชื่อผู้รับ" };
  if (!EMAIL_RE.test(em)) return { email: "อีเมลไม่ถูกต้อง" };
  if (!zone) return { zone: "เลือกโซน" };
  if (zone.sold + zone.held >= zone.capacity) return { zone: "บัตรเชิญโซนนี้เต็มแล้ว (" + zone.sold + "/" + zone.capacity + ") เพิ่มจำนวนในหน้าแก้ไขงาน" };
  const gid = "guest-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  S.org.buyers[gid] = { name: name.trim(), email: em, phone: "" };
  S.org.tickets.push({ ticketId: e.id + "-" + zone.id + "-" + (zone.sold + 1), eventId: e.id, zoneId: zone.id, holderId: gid, status: "valid", usedAt: null, checkinMethod: null,
    hops: [{ idx: 0, payerId: gid, paid: 0, at: Date.now() }], invite: true });
  replaceOrgEvent({ ...e, zones: e.zones.map((z: any) => (z === zone ? { ...z, sold: z.sold + 1 } : z)) });
  emit(); mockToast("ส่งบัตรเชิญถึง " + em + " แล้ว"); return {};
}
export function promoCreate(f: { code: string; kind: string; value: string; zone: string; start: number | null; end: number | null; max: string }): Record<string, string> {
  const e = orgEv(S.org.oev), errs: Record<string, string> = {}, code = f.code.trim().toUpperCase(), max = Number(f.max);
  if (!/^[A-Z0-9]{3,20}$/.test(code)) errs.code = "โค้ดต้องเป็นอังกฤษหรือตัวเลข 3-20 ตัว";
  else if (S.org.promos.some((p: any) => p.code === code)) errs.code = "มีโค้ดนี้อยู่แล้ว";
  let value = Number(f.value);
  if (f.kind === "percent") { if (!Number.isInteger(value) || value < 1 || value > 100) errs.value = "เปอร์เซ็นต์ต้องเป็นจำนวนเต็ม 1-100"; }
  else { value = OL.toSatang(f.value); if (Number.isNaN(value) || value < 100) errs.value = "ใส่จำนวนเงินอย่างน้อย 1฿"; }
  if (!f.start) errs.start = "ใส่วันเวลาเริ่มใช้";
  if (!f.end) errs.end = "ใส่วันเวลาหมดอายุ"; else if (f.start && f.end <= f.start) errs.end = "หมดอายุต้องหลังวันเริ่มใช้";
  if (!Number.isInteger(max) || max < 1) errs.max = "จำนวนครั้งต้องเป็นจำนวนเต็มอย่างน้อย 1";
  if (Object.keys(errs).length) return errs;
  S.org.promos.push({ code, eventId: e.id, ...(f.kind === "percent" ? { percentOff: value } : { amountOff: value }), ...(f.zone !== "all" ? { zoneId: f.zone } : {}),
    startsAt: f.start, endsAt: f.end, maxUses: max, used: 0, disabled: false });
  emit(); mockToast("สร้างโค้ด " + code + " แล้ว"); return {};
}
export function promoToggle(code: string) { const p = S.org.promos.find((x: any) => x.code === code); if (p) { p.disabled = !p.disabled; emit(); mockToast(p.disabled ? "ปิดโค้ด " + code + " แล้ว" : "เปิดโค้ด " + code + " แล้ว"); } }
export function promoTest(code: string, zoneId: string) {
  const e = orgEv(S.org.oev), z = e.zones.find((x: any) => x.id === zoneId);
  if (!z) return "เลือกโซนก่อน";
  const r = OL.applyPromo(code, S.org.promos.filter((p: any) => !p.eventId || p.eventId === e.id), z.id, z.price, Date.now());
  return r.ok ? "ราคาหลังลด " + B(r.price) + " (จาก " + B(z.price) + ")" : PROMO_WHY[r.reason];
}
export function annSend(zone: string, text: string) {
  const e = orgEv(S.org.oev);
  if (!text.trim()) return "เขียนข้อความก่อนส่ง";
  const n = new Set(evTickets(e.id).filter((t: any) => ["valid", "listed"].includes(t.status) && (zone === "all" || t.zoneId === zone)).map((t: any) => t.holderId)).size;
  S.org.announcements.push({ id: "an-" + Date.now(), eventId: e.id, at: Date.now(), text: text.trim(), recipients: n, zone });
  emit(); mockToast("ส่งประกาศถึง " + n + " คนแล้ว"); return "";
}
// announcements a buyer should see on a ticket: whole event, or their own zone
export function ticketAnnouncements(bt: any) {
  if (!bt || !isLocal(bt.ev) || !S.org) return [];
  const ot = S.org.tickets.find((x: any) => x.ticketId === bt.orgTicketId);
  return S.org.announcements.filter((a: any) => a.eventId === bt.ev && (a.zone === "all" || (ot && a.zone === ot.zoneId))).slice(-2).reverse();
}

/* ---------- finance ---------- */
export function finRow(e: any, now: number) {
  const o = S.org;
  if (e.status === "cancelled") {
    const refunded = o.ledger.filter((l: any) => l.eventId === e.id && l.type === "REFUND_OUT").reduce((a: number, l: any) => a + l.amount, 0);
    return { e, kind: "cancelled", gross: 0, fee: 0, net: 0, refunded, payAt: null, paid: false, label: "ยกเลิก · ไม่มีการจ่าย", tickets: [] as any[] };
  }
  const tickets = evTickets(e.id).filter((t: any) => t.status !== "refunded"), r = OL.settleEvent(e, tickets), payAt = OL.payoutAt(e);
  const gross = tickets.reduce((a: number, t: any) => a + (t.hops[0] ? t.hops[0].paid : 0), 0);
  const over = e.endAt && now >= e.endAt, paid = e.status === "ended" && payAt !== null && payAt <= now;
  const label = paid ? "จ่ายแล้ว" : over || e.status === "ended" ? "รอช่วงตรวจสอบ 24 ชม." : "รองานจบ";
  return { e, kind: "live", gross, fee: r.shopFee, net: r.shopNet, refunded: 0, payAt, paid, label, tickets, settle: r };
}

/* ---------- door (demo simulation) ---------- */
export const gateWho = () => (S.org.account ? S.org.account.email : "—");
export function gateStats(e: any) { const t = evTickets(e.id); return { used: t.filter((x: any) => x.status === "used").length, total: t.filter((x: any) => ["valid", "listed", "used"].includes(x.status)).length }; }
// one door decision: ask checkinResult, write the log, and on success mark the ticket used on both sides
export function gateRun(ev: any, ticket: any, signerId: string, ts: number, method: string) {
  const now = Date.now(), r = OL.checkinResult({ ticket, event: ev, signerId, ts, now });
  S.org.checkinLog.unshift({ at: now, ticketId: ticket ? ticket.ticketId : "—", eventId: ev.id, valid: r.valid, reason: r.reason || null, method, by: gateWho() });
  S.org.checkinLog.length = Math.min(S.org.checkinLog.length, 50);
  if (r.valid) {
    ticket.status = "used"; ticket.usedAt = now; ticket.checkinMethod = method;
    S.listings = S.listings.filter((l: any) => l.orgTicketId !== ticket.ticketId);          // checking in cancels a resale listing
    for (const bt of S.tickets) if (bt.orgTicketId === ticket.ticketId) bt.status = "used";
  }
  return r;
}
// the full-screen result: green (passes, gone in 2 s) or red (stays until closed)
export function gateShow(valid: boolean, text: string, zone?: string) {
  S.gateResult = { valid, text, zone: zone || "", id: Date.now() }; emit();
  if (valid) { if (navigator.vibrate) navigator.vibrate(60); const id = S.gateResult.id; setTimeout(() => { if (S.gateResult && S.gateResult.id === id) { S.gateResult = null; emit(); } }, 2000); }
  else if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
}
export const gateClose = () => { S.gateResult = null; emit(); };
export function callManager() { gateClose(); if (live()) toast("ระบบยังไม่ส่งแจ้งเตือนถึงผู้จัดการ ให้ติดต่อผู้จัดการโดยตรง"); else mockToast("แจ้งผู้จัดการให้มาที่ประตูแล้ว"); }
function simCase(c: number) {
  const e = orgEv(S.org.oev), T = evTickets(e.id), now = Date.now();
  const pick = (pred: (t: any) => boolean) => T.find(pred), other = S.org.tickets.find((t: any) => t.eventId !== e.id), cx = S.org.events.find((x: any) => x.status === "cancelled");
  // plain single-owner ticket for the happy path, so the resold ticket stays available for the old-owner case
  const v = pick((t: any) => t.status === "valid" && t.hops.length === 1) || pick((t: any) => t.status === "valid");
  const dc: Record<number, () => any> = {
    1: () => v && [e, v, v.holderId, now - 3000],
    2: () => { const u = pick((t: any) => t.status === "used"); return u && [e, u, u.holderId, now - 3000]; },
    3: () => v && [e, v, v.holderId, now - 61000],
    4: () => v && [e, v, v.holderId, now + 16000],
    5: () => other && [e, other, other.holderId, now - 3000],
    6: () => { const t = cx && S.org.tickets.find((x: any) => x.eventId === cx.id); return t && [cx, t, t.holderId, now - 3000]; },
    7: () => { const t = pick((x: any) => x.status === "valid" && x.hops.length > 1); return t && [e, t, t.hops[0].payerId, now - 3000]; },
    8: () => { const t = pick((x: any) => x.status === "listed"); return t && [e, t, t.holderId, now - 3000]; },
  };
  return dc[c]();
}
function showRun(r: any, ticket: any, ev: any) {
  const p = ticket ? orgPerson(ticket.holderId) : null, z = ticket && ev.zones.find((x: any) => x.id === ticket.zoneId);
  gateShow(r.valid, r.valid ? (p ? p.name : "") : OL.reasonText(r.reason), r.valid && z ? z.name : "");
}
export function sim(c: number) {
  const args = simCase(c); closeSheet();
  if (!args) { toast("ไม่มีตั๋วตัวอย่างสำหรับกรณีนี้"); return; }
  const [ev, ticket, signer, ts] = args, r = gateRun(ev, ticket, signer, ts, "scan"); emit(); showRun(r, ticket, ev);
}
export function simOpen() {
  sheet(() => (<>
    <h2 style={{ fontSize: 19 }}>จำลองการสแกน</h2><p className="small muted" style={{ margin: 0 }}>เลือกสถานการณ์ ระบบจะหยิบตั๋วจริงของงานนี้มาตรวจ</p>
    {SIM_CASES.map(([c, l]) => <button key={c} className="btn plain" onClick={() => sim(c)}>{c}. {l}</button>)}
    <button className="btn plain" onClick={closeSheet}>ปิด</button>
  </>));
}
export function manualIn(ticketId: string) {
  const e = orgEv(S.org.oev), t = S.org.tickets.find((x: any) => x.ticketId === ticketId), p = orgPerson(t.holderId);
  sheet(() => (<>
    <h2 style={{ fontSize: 19 }}>ยืนยันเช็กอินมือ</h2>
    <dl className="kv card" style={{ margin: 0 }}><dt>ชื่อ</dt><dd>{p.name}</dd><dt>โซน</dt><dd>{(e.zones.find((z: any) => z.id === t.zoneId) || {}).name || ""}</dd><dt>เลขตั๋ว</dt><dd className="mono">{t.ticketId}</dd></dl>
    <p className="small muted" style={{ margin: 0 }}>การเช็กอินมือถูกบันทึกว่าทำโดย {gateWho()} ตรวจบัตรประชาชนหรืออีเมลยืนยันก่อนกดยืนยัน</p>
    <button className="btn" onClick={() => { const r = gateRun(e, t, t.holderId, Date.now(), "manual"); closeSheet(); emit(); if (r.valid) mockToast("เช็กอินแล้ว"); else showRun(r, t, e); }}>ยืนยันเช็กอิน</button>
    <button className="btn plain" onClick={closeSheet}>ยกเลิก</button>
  </>));
}

/* ---------- door (real shop: src/checkin.js) ---------- */
export async function liveGateLoad() {
  const id = S.org.oev;
  try { const d = await orgApi("GET", "/api/checkin/events/" + encodeURIComponent(id)); if (S.org.oev !== id) return; S.org.liveGate = { id, used: d.used, total: d.total, scans: d.scans }; emit(); }
  catch (err: any) { console.error("check-in counts failed", err); if (err.status === 404) toast("บัญชีนี้สแกนงานนี้ไม่ได้"); }
}
export async function liveGateCounts() {
  S.org.gateCountsAt = Date.now();
  try { const d = await orgApi("GET", "/api/checkin/events"); S.org.gateCounts = Object.fromEntries(d.events.map((e: any) => [e.id, { used: e.used, total: e.total }])); emit(); }
  catch (err) { console.error("check-in list failed", err); }
}
const gateCam: { busy: boolean; last: string; lastAt: number } = { busy: false, last: "", lastAt: 0 };
export async function gateCheck(code: string, typed: boolean) {
  code = String(code || "").trim(); const ev = orgEv(S.org.oev);
  if (!code || !ev || gateCam.busy || S.gateResult) return;
  // the camera sees the same QR many times a second; a repeat within 4 s is the same scan
  if (!typed && code === gateCam.last && Date.now() - gateCam.lastAt < 4000) return;
  gateCam.last = code; gateCam.lastAt = Date.now(); gateCam.busy = true;
  try {
    const r = await orgApi("POST", "/api/checkin/events/" + encodeURIComponent(ev.id) + "/scan", { code });
    const text = r.valid ? (r.ticket && r.ticket.holder) || "" : (LIVE_REASON[r.reason] || r.reason) + (r.reason === "already_used" && r.ticket && r.ticket.usedAt ? ` เมื่อ ${OL.thaiTime(r.ticket.usedAt)} น.` : "");
    gateShow(r.valid, text, r.valid && r.ticket ? `${r.ticket.zone} · Token #${r.ticket.tokenId}` : "");
  } catch (err) { console.error("scan failed", err); toast(orgErrText(err)); }
  finally { gateCam.busy = false; liveGateLoad(); }
}
// camera: html5-qrcode reads the QR; one scanner at a time, stopped when the door screen closes
let scanner: any = null;
export const camOn = () => !!scanner;
export async function camStart(elId: string) {
  if (scanner) return;
  try {
    const { Html5Qrcode } = await import("html5-qrcode");
    const s = new Html5Qrcode(elId, { verbose: false } as any); scanner = s; emit();
    await s.start({ facingMode: "environment" }, { fps: 8, qrbox: (w: number, h: number) => { const n = Math.floor(Math.min(w, h) * 0.7); return { width: n, height: n }; } },
      (text: string) => gateCheck(text, false), () => {});
  } catch (err) {
    console.error("camera failed", err); scanner = null; emit();
    toast("เปิดกล้องไม่ได้ ใช้ช่องวางรหัสแทน", "err");
  }
}
export async function camStop() {
  const s = scanner; scanner = null;
  if (s) { try { await s.stop(); s.clear(); } catch (_) {} emit(); }
}

/* ---------- the real shop (live mode) ---------- */
export async function orgApi(method: string, path: string, body?: any) {
  const init: RequestInit = { method, credentials: "same-origin" };
  // the API refuses mutations without a JSON content-type (CSRF guard)
  if (method !== "GET") { init.headers = { "Content-Type": "application/json" }; init.body = JSON.stringify(body || {}); }
  const res = await fetch(path, init);
  let data: any = null; try { data = await res.json(); } catch (_) {}
  if (!res.ok) { const err: any = new Error((data && data.error) || "http_" + res.status); err.status = res.status; err.data = data; throw err; }
  return data;
}
const ORG_ERR: Record<string, string> = { authentication_required: "กรุณาเข้าสู่ระบบใหม่", forbidden: "บทบาทของคุณทำรายการนี้ไม่ได้", shop_not_verified: "เผยแพร่ได้หลังทีมงานยืนยันร้าน",
  not_a_draft: "งานนี้เผยแพร่ไปแล้ว", event_closed: "งานนี้ปิดหรือถูกยกเลิกแล้ว แก้ไขไม่ได้", changed_meanwhile: "มีผู้ซื้อตั๋วระหว่างบันทึก โหลดข้อมูลใหม่แล้วลองอีกครั้ง",
  already_in_shop: "บัญชีนี้อยู่ในร้านอื่นแล้ว", already_cancelled: "งานนี้ถูกยกเลิกไปแล้ว", event_not_found: "ไม่พบงานนี้", no_shop: "บัญชีนี้ยังไม่มีร้าน", member_not_found: "ไม่พบสมาชิกนี้",
  invalid_image: "ไฟล์รูปไม่ถูกต้อง ใช้ JPG, PNG หรือ WebP", image_too_large: "รูปใหญ่เกิน 1 MB" };
const FIELD_ERR: Record<string, string> = { unsafe_characters: "ห้ามใช้อักขระ < > \" ' `", required: "ต้องกรอก", too_long: "ยาวเกินไป", in_past: "ต้องเป็นเวลาในอนาคต", before_start: "ต้องหลังเวลาเริ่ม",
  duplicate: "ชื่อซ้ำกับโซนอื่น", duplicate_name: "ชื่อซ้ำกับโซนเดิม", locked_by_orders: "มีผู้ซื้อแล้ว เปลี่ยนไม่ได้", invalid: "ค่าไม่ถูกต้อง", too_many: "เกินจำนวนที่รับได้",
  mismatch: "ไม่ตรง", unknown_zone: "ไม่พบโซนนี้", not_editable: "แก้โซนนี้ไม่ได้", too_large: "ไฟล์ใหญ่เกิน 1 MB" };
const FIELD_NAME: Record<string, string> = { name: "ชื่อ", venue: "สถานที่", category: "หมวด", description: "รายละเอียด", short: "ชื่อบนโปสเตอร์", poster: "โปสเตอร์", image: "รูปโปสเตอร์", startsAt: "วันเวลาเริ่ม", endsAt: "วันเวลาจบ",
  zones: "โซนตั๋ว", email: "อีเมล", role: "บทบาท", reason: "เหตุผล", confirmName: "ชื่องาน", phone: "เบอร์โทร", type: "ประเภท", contactLine: "LINE OA" };
export function orgErrText(err: any) {
  const d = err && err.data; if (!d) return "เชื่อมต่อระบบไม่สำเร็จ ลองอีกครั้ง";
  const [k, v] = (Object.entries(d.fields || {})[0] || []) as [string, string];
  if (k) {
    const m = /^zones\.(\d+)\.(\w+)$/.exec(k), b = /^below_taken:(\d+)$/.exec(v);
    const where = m ? `โซนที่ ${+m[1] + 1} (${({ name: "ชื่อ", price: "ราคา", capacity: "จำนวน", color: "สี", id: "รหัส" } as any)[m[2]] || m[2]})` : FIELD_NAME[k] || k;
    return where + ": " + (b ? `ลดได้ต่ำสุด ${b[1]} ที่ (ขายแล้วและกำลังจองอยู่)` : FIELD_ERR[v] || v);
  }
  return ORG_ERR[d.error] || "ทำรายการไม่สำเร็จ (" + d.error + ")";
}
const teamFrom = (team: any[], me: string) => team.map(m => ({ email: m.email || me, role: m.role }));
function fromServerShop(s: any, email: string, role: string) {
  return { id: s.id, name: s.name, kind: s.type || "other", contactLine: s.contactLine || "", phone: s.phone || "", verification: s.verification, verificationNote: s.verificationNote || "", team: [{ email, role }] };
}
// server event -> the shape the organizer screens use (money in satang, zones keep their server id)
function fromServerEvent(e: any, shopId: string) {
  let status = ({ draft: "draft", on_sale: "on_sale", sold_out: "sold_out", closed: "ended", cancelled: "cancelled" } as any)[e.status] || e.status;
  if (["on_sale", "sold_out"].includes(status) && e.endsAt && e.endsAt < Date.now()) status = "ended";
  return { id: e.id, shopId, live: true, name: e.name, short: e.short || "", category: e.category || "ปาร์ตี้", description: e.description || "", venue: e.venue || "", mapUrl: "",
    bg: POSTERS[e.poster] || POSTERS[0], image: e.posterUrl || null, status, cancelReason: e.cancelReason || "", startAt: e.startsAt, endAt: e.endsAt, doorsAt: null, chainEventId: e.chainEventId,
    params: { ...ORG_PARAMS },
    zones: (e.zones || []).map((z: any) => ({ id: z.id, live: true, name: z.name, kind: "standing", price: z.price * 100, capacity: z.capacity ?? 0, sold: z.sold ?? 0, held: z.held || 0,
      color: z.color, seatsPerUnit: null, saleStartAt: null, saleEndAt: null, locked: z.locked || { name: false, price: false } })) };
}
const toServerZones = (zones: any[]) => zones.map(z => ({ ...(z.live ? { id: z.id } : {}), name: z.name, price: z.price / 100, capacity: z.capacity, color: z.color }));
const toServerEvent = (d: any) => ({ name: d.name, short: d.short || "", category: d.category, venue: d.venue, description: d.description || "",
  poster: Math.max(0, POSTERS.indexOf(d.bg)), startsAt: d.startAt, endsAt: d.endAt, zones: toServerZones(d.zones) });
// rules the server has on top of the demo's (whole baht, ฿20 minimum, no markup characters, published zones stay)
const UNSAFE_RE = /[<>"'`]/;
function liveWizErrors(d: any) {
  const out: Record<string, string> = {};
  if (UNSAFE_RE.test(d.name || "")) out.name = FIELD_ERR.unsafe_characters;
  if (!String(d.venue || "").trim()) out.venue = "ใส่สถานที่"; else if (UNSAFE_RE.test(d.venue)) out.venue = FIELD_ERR.unsafe_characters;
  if (UNSAFE_RE.test((d.description || "") + (d.short || ""))) out.name = out.name || "รายละเอียดหรือชื่อบนโปสเตอร์มีอักขระ < > \" ' `";
  d.zones.forEach((z: any, i: number) => {
    if (UNSAFE_RE.test(z.name || "")) out[`zones.${i}.name`] = FIELD_ERR.unsafe_characters;
    if (Number.isInteger(z.price) && (z.price % 100 || z.price < 2000)) out[`zones.${i}.price`] = "ระบบจริงรับราคาเป็นบาทเต็ม อย่างน้อย 20฿";
  });
  const o = wizOrig();
  if (o && o.zones.some((z: any) => !d.zones.some((x: any) => x.id === z.id))) out.zones = "โซนที่เผยแพร่แล้วลบไม่ได้ ลดจำนวนที่ขายแทน";
  return out;
}
function liveOrgState(me: any) {
  const shop = me.shop ? fromServerShop(me.shop, me.user.email, me.role) : null;
  return { live: true, account: { email: me.user.email, name: me.user.name || me.user.email }, accounts: {}, shops: shop ? [shop] : [], shop, role: me.role, authMode: "login",
    events: [], tickets: [], buyers: {}, ledger: [], checkinLog: [], promos: [], announcements: [], orders: {},
    oev: null, etab: "overview", evFilter: "all", draft: null, wizStep: 1, wizErr: {}, onboard: { step: 1, data: { kind: "bar", legal: "individual" }, err: {} },
    bq: "", bzone: "all", bstatus: "all", showEmails: false };
}
async function orgLiveReload() {
  const o = S.org; if (!o || !o.live || !o.shop) return;
  const [ev, team] = await Promise.all([orgApi("GET", "/api/org/events"), o.role === "owner" ? orgApi("GET", "/api/org/team") : null]);
  if (S.org !== o) return;
  o.events = ev.events.map((e: any) => fromServerEvent(e, o.shop.id)); o.orders = {};
  if (team) o.shop.team = teamFrom(team.team, o.account.email);
}
let liveBusy = false;
// runs one API step; a second tap while it runs is ignored, a lost session goes back through Google sign-in
export async function liveStep(fn: () => Promise<void>, onErr?: (err: any) => void) {
  if (liveBusy) return; liveBusy = true; S.busy = true; emit();
  try { await fn(); }
  catch (err: any) {
    console.error("Organizer API failed", err);
    if (err && err.status === 401) { S.signedIn = false; S.afterSignup = "orglive"; save(); toast("กรุณาเข้าสู่ระบบใหม่"); googleLogin(); return; }
    if (onErr) onErr(err); else toast(orgErrText(err), "err");
  } finally { liveBusy = false; S.busy = false; emit(); rerenderSheet(); }
}
export async function orgLiveStart() {
  if (!S.auth.google) { toast("ระบบจริงใช้ได้เมื่อเปิดผ่านเว็บไซต์ JONGLOEI"); return; }
  if (!S.signedIn) { S.orgLiveWanted = true; S.afterSignup = "orglive"; googleLogin(); return; }
  await liveStep(async () => {
    const me = await orgApi("GET", "/api/org/me");
    if (!live()) { if (!S.orgLive) ensureOrg(); S.orgLive = null; S.orgDemo = S.org; }
    S.org = liveOrgState(me); S.orgLiveWanted = true;
    if (S.org.shop) await orgLiveReload();
    closeSheet(); S.mode = "org"; emit();
    go(!S.org.shop ? "orgOnboard" : S.org.role === "gate" ? "orgGatePick" : "orgDash", { replace: true });
  });
}
export function orgLiveStop() {
  if (live()) { S.org = S.orgDemo; S.orgDemo = null; }
  S.orgLive = null; S.orgLiveWanted = false; if (!S.org) ensureOrg(); refreshEvents(); emit();
}
function replaceLive(se: any) {
  const o = S.org, ev = fromServerEvent(se, o.shop.id);
  const i = o.events.findIndex((e: any) => e.id === ev.id); if (i < 0) o.events.unshift(ev); else o.events[i] = ev;
  delete o.orders[ev.id]; return ev;
}
async function liveWizSave() {
  const o = S.org, d = o.draft, errs = wizErrors(), keys = Object.keys(errs);
  if (keys.length) { o.wizShow = true; o.wizStep = errStep(keys[0]); emit(); focusLater(errField(keys[0])); toast("ยังมี " + keys.length + " เรื่องที่ต้องแก้ก่อนบันทึก"); return null; }
  const r = d.id.startsWith("ev-") ? await orgApi("PATCH", "/api/org/events/" + d.id, toServerEvent(d)) : await orgApi("POST", "/api/org/events", toServerEvent(d));
  let ev = replaceLive(r.event);
  // the poster picture goes up after the event exists; a failed upload keeps the event and says so
  if (d._posterNew && d.image && d.image.startsWith("data:")) {
    try { ev = replaceLive((await orgApi("PUT", `/api/org/events/${ev.id}/poster`, { image: d.image })).event); }
    catch (err) { toast("บันทึกงานแล้ว แต่อัปโหลดรูปโปสเตอร์ไม่สำเร็จ: " + orgErrText(err), "err"); }
  } else if (d._posterRemove && ev.image) {
    try { ev = replaceLive((await orgApi("DELETE", `/api/org/events/${ev.id}/poster`)).event); } catch (err) { toast(orgErrText(err), "err"); }
  }
  o.draft = JSON.parse(JSON.stringify(ev)); o.wizDirty = false; return ev;
}
export function liveOrders(e: any) {
  const o = S.org, rows = o.orders[e.id];
  if (rows === undefined) {
    o.orders[e.id] = null;
    orgApi("GET", `/api/org/events/${e.id}/orders`).then(d => { o.orders[e.id] = d.orders; }, err => { o.orders[e.id] = { error: orgErrText(err) }; }).finally(emit);
  }
  return o.orders[e.id];
}
export function liveOrdersReload() { delete S.org.orders[S.org.oev]; emit(); }
export { HOUR, DAY };
