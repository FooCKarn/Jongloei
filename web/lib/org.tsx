"use client";
// Organizer actions: always the real shop (/api/org/*, src/organizer.js). S.org holds what the server returned;
// while the buyer side runs it waits in S.orgLive.
import { useState } from "react";
import { S, OL, emit, save, HOUR, DAY, POSTERS, ORG_PARAMS, evById, refreshEvents, orgEv, replaceOrgEvent,
  orgPerson, ledgerAdd, evTickets } from "./state";
import { go, back, currentScreen } from "./nav";
import { toast, mockToast, sheet, closeSheet, rerenderSheet } from "./ui";
import { googleLogin, loadEvents } from "./buyer";
import { tr, tmap, dateOf, timeOf } from "./i18n";

export const B = (s: number) => OL.fmtBaht(s);
export const live = () => !!(S.org && S.org.live);
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const ROLE_LABEL: Record<string, string> = tmap({ owner: "เจ้าของร้าน", manager: "ผู้จัดการระบบ", gate: "เจ้าหน้าที่ปฏิบัติการหน้างาน" });
export const SHOP_KINDS: [string, string][] = tmap([["bar", "บาร์ / ร้านอาหาร"], ["workshop", "Workshop / คลาสเรียน"], ["popup", "Pop-up / ตลาดนัด"], ["concert", "คอนเสิร์ต / แฟนมีตติ้ง"], ["other", "ประเภทอื่นๆ"]]);
export const EV_STATUS: Record<string, [string, string]> = tmap({ draft: ["ฉบับร่าง", "grey"], on_sale: ["เปิดจำหน่าย", "ok"], paused: ["ระงับการจำหน่าย", "warn"], sold_out: ["จำหน่ายหมด", ""], ended: ["เสร็จสิ้น", "grey"], cancelled: ["ยกเลิกแล้ว", "danger"] });
export const TICKET_STATUS: Record<string, string> = tmap({ valid: "พร้อมใช้งาน", listed: "ประกาศขายต่ออยู่", used: "ผ่านการใช้งานแล้ว", refunded: "คืนเงินแล้ว", unavailable: "ไม่มาเข้าร่วม" });
export const WIZ_STEPS = tmap(["ข้อมูลอีเวนต์", "โซนบัตรเข้าชม", "กติกาบัตรเข้าชม", "ตรวจสอบและเผยแพร่"]);
export const ZONE_KINDS: [string, string][] = tmap([["standing", "ยืน (Standing)"], ["seated", "รูปแบบที่นั่ง"], ["table", "โต๊ะ"], ["comp", "บัตรเชิญพิเศษ (ฟรี)"]]);
export const ZONE_COLORS: [string, string][] = tmap([["#E8485A", "แดงอ่อน"], ["#A00018", "แดงเข้ม"], ["#4A0010", "น้ำตาลแดง"], ["#B86B12", "ส้มทอง"], ["#2B4C7E", "น้ำเงิน"]]);
export const EV_CATS = ["ปาร์ตี้สังสรรค์", "คอนเสิร์ต", "เทศกาลดนตรี", "แฟนมีตติ้ง", "สแตนด์อัปคอมเมดี", "workshop"];
const WIZ_TEMPLATES: Record<string, any[]> = tmap({
  bar: [["Standing", "standing", 500, 100], ["โต๊ะ 4 ที่นั่ง", "table", 3000, 10, 4]],
  workshop: [["ที่นั่ง Workshop", "seated", 1500, 12]],
  concert: [["Standing", "standing", 1500, 200], ["Seat", "seated", 2500, 100], ["VIP", "seated", 4500, 20]],
});
export const PROMO_WHY: Record<string, string> = tmap({ not_found: "ไม่พบรหัสส่วนลดนี้ หรือถูกระงับการใช้งาน", expired: "รหัสส่วนลดหมดอายุหรือยังไม่ถึงกำหนดเริ่มต้นใช้งาน", used_up: "รหัสส่วนลดถูกใช้งานครบจำนวนสิทธิ์แล้ว", wrong_zone: "รหัสส่วนลดนี้ไม่สามารถใช้งานร่วมกับโซนนี้ได้" });
export const AN_TEMPLATES: Record<string, string> = tmap({ time: "เวลาเริ่มต้นอีเวนต์เปลี่ยนแปลงเป็น __:__ น. บัตรเข้าชมใบเดิมยังคงใช้งานได้ตามปกติ ไม่จำเป็นต้องดำเนินการใดๆ เพิ่มเติม",
  place: "สถานที่จัดงานเปลี่ยนแปลงเป็น ________ บัตรเข้าชมใบเดิมยังคงใช้งานได้ตามปกติ ขออภัยในความไม่สะดวกมา ณ ที่นี้",
  weather: "เนื่องจากสภาพอากาศที่ไม่เอื้ออำนวย อีเวนต์อาจมีการเลื่อนเวลาหรือย้ายเข้าสู่พื้นที่ในร่ม ทางเราจะแจ้งให้ทราบอีกครั้งภายใน __ ชั่วโมง บัตรเข้าชมยังคงใช้งานได้ปกติ" });
export const SIM_CASES: [number, string][] = tmap([[1, "บัตรถูกต้องสมบูรณ์"], [2, "บัตรผ่านการใช้งานแล้ว"], [3, "QR Code เก่า (เกิน 60 วินาที)"], [4, "QR Code จากอนาคต (ล้ำหน้าเกิน 15 วินาที)"],
  [5, "บัตรของอีเวนต์อื่น"], [6, "อีเวนต์ที่ถูกยกเลิก"], [7, "ผู้ถือครองคนเดิมที่ทำการขายต่อไปแล้ว"], [8, "บัตรอยู่ระหว่างประกาศขายต่อ (ยังสามารถใช้เข้างานได้)"]]);
export const LIVE_REASON: Record<string, string> = tmap({
  malformed: "ไม่ใช่ QR Code บัตรเข้าชมของระบบ JONGLOEI", expired: "QR Code หมดอายุ (เกิน 60 วินาที) อาจเกิดจากการใช้ภาพแคปหน้าจอ กรุณาแนะนำให้ผู้ถือเปิดบัตรเข้าชมผ่านแอปพลิเคชันใหม่อีกครั้ง",
  future: "เวลาใน QR Code ล้ำหน้าเกิน 15 วินาที กรุณาตรวจสอบการตั้งค่าเวลาบนอุปกรณ์ของผู้ถือบัตร", unknown_ticket: "ไม่พบข้อมูลบัตรเข้าชมนี้ในระบบ",
  bad_signature: "ลายเซ็นดิจิทัลไม่ตรงกับเจ้าของบัตรปัจจุบัน เช่น QR Code ของผู้ขายเดิม", wrong_event: "บัตรใบนี้เป็นของอีเวนต์อื่น",
  event_cancelled: "อีเวนต์นี้ถูกยกเลิกเรียบร้อยแล้ว", event_ended: "อีเวนต์สิ้นสุดลงแล้ว", already_used: "บัตรเข้าชมใบนี้ถูกใช้สิทธิ์เข้างานไปแล้ว",
  listed: "บัตรอยู่ระหว่างประกาศขายต่อ กรุณายกเลิกการประกาศขายก่อนดำเนินการ", not_issued: "บัตรเข้าชมยังออกไม่เสร็จสมบูรณ์",
  chain_mismatch: "ข้อมูลเจ้าบนบล็อกเชนไม่ตรงกับข้อมูลในระบบ", chain_unavailable: "ไม่สามารถตรวจสอบบนบล็อกเชนได้ชั่วคราว กรุณาสแกนใหม่อีกครั้ง" });
export const ORDER_STATUS: Record<string, string> = tmap({ pending: "รอชำระเงิน (Hold)", expired: "หมดเวลา", paid: "ชำระเงินแล้ว", fulfilled: "ออกบัตรสำเร็จ", failed: "ไม่สำเร็จ", needs_review: "รอการตรวจสอบ" });

export const maskEmail = (m: string) => { const [a, b] = String(m).split("@"); return b ? a.slice(0, 1) + "***@" + b : "***"; };
export const whenText = (ms: number | null) => (ms ? tr("{a} · {b} น.", { a: dateOf(ms), b: timeOf(ms) }) : tr("ยังไม่ได้กำหนดวันเวลา"));
export const shortOf = (e: any) => e.short || String(e.name || tr("ชื่องานอีเวนต์")).split(/\s+/).slice(0, 2).join("\n").toUpperCase();
const myEventsOf = () => S.org.events.filter((e: any) => (e.shopId || "shop-demo") === S.org.shop.id);
export const myEvents = myEventsOf;

/* ---------- mode ---------- */
export function setMode(mode: "buyer" | "org") {
  closeSheet(); camStop();
  // the real shop steps aside while the buyer side runs
  const leavingLiveOrg = mode === "buyer" && S.org && S.org.live;
  if (leavingLiveOrg) { S.orgLive = S.org; S.org = null; }
  else if (mode === "org" && S.orgLive) { S.org = S.orgLive; S.orgLive = null; }
  S.mode = mode; emit();
  if (leavingLiveOrg) loadEvents().then(() => emit()).catch(err => console.error("Buyer event refresh failed", err));
  go(mode === "org" ? orgHomeScreen() : "home", { replace: true });
}
// the organizer area always uses the signed-in Worker session
export const enterOrg = () => orgLiveStart();
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
  if (!S.org || !S.org.account) return cur === "orgWelcome" ? null : "orgWelcome";
  if (cur === "orgAdmin") return orgIsAdmin() ? null : orgHomeScreen();
  if (!S.org.shop) return cur === "orgOnboard" ? null : "orgOnboard";
  if (!isOrg || cur === "orgWelcome" || cur === "orgOnboard") return orgHomeScreen();
  if (S.org.role === "gate" && !["orgGatePick", "orgGate"].includes(cur)) return "orgGatePick";
  if (live() && ["orgFinance", "orgTeam"].includes(cur)) return "orgDash";
  if (S.org.role !== "owner" && ["orgFinance", "orgTeam"].includes(cur)) return "orgDash";
  if (cur === "orgWizard" && !S.org.draft) return "orgDash";
  if ((cur === "orgEvent" || cur === "orgGate") && !(S.org.oev && orgEv(S.org.oev))) return cur === "orgGate" ? "orgGatePick" : "orgEvents";
  return null;
}
export const ORG_TABS: [string, string, string][] = tmap([["orgDash", "i-chart", "ภาพรวมระบบ"], ["orgEvents", "i-ticket", "อีเวนต์ของฉัน"], ["orgGatePick", "i-qr", "จุดปฏิบัติการหน้างาน"], ["orgFinance", "i-wallet", "ระบบการเงิน"]]);
export function orgTabsFor(role: string) {
  // a real shop has only what the backend serves yet: overview, events and the door
  if (live()) return ORG_TABS.filter(([k]) => (role === "gate" ? k === "orgGatePick" : ["orgDash", "orgEvents", "orgGatePick"].includes(k)));
  return ORG_TABS.filter(([k]) => (role === "gate" ? k === "orgGatePick" : role === "manager" ? k !== "orgFinance" : true));
}

export function orgLogout() {
  orgLiveStop(); S.mode = "buyer";
  closeSheet(); emit(); go("home", { replace: true });
}

/* ---------- small form helpers shared by organizer screens ---------- */
export const errA = (id: string, err?: string, hint?: boolean) => ({ "aria-describedby": `${id}-err${hint ? ` ${id}-hint` : ""}`, "aria-invalid": err ? true : undefined });
export function Fld({ id, label, err, hint, children }: { id: string; label: any; err?: string; hint?: any; children: any }) {
  return (<div className="field"><label htmlFor={id}>{label}</label>{children}
    {hint ? <span className="hint" id={`${id}-hint`}>{typeof hint === "string" ? tr(hint) : hint}</span> : null}<span className="hint err" id={`${id}-err`} role="alert">{err ? tr(err) : ""}</span></div>);
}

/* ---------- shop verification: an ID card or company certificate, reviewed by a JONGLOEI admin ---------- */
export const DOC_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"], DOC_MAX = 1024 * 1024, DOC_ACCEPT = DOC_TYPES.join(",");
export const docProblem = (f: File | null) => !f ? tr("แนบเอกสารยืนยันตัวตนก่อนส่ง") : !DOC_TYPES.includes(f.type) ? tr("รับเฉพาะรูป JPG, PNG, WebP หรือไฟล์ PDF") : f.size > DOC_MAX ? tr("ไฟล์ใหญ่เกิน 1 MB") : "";
const docBody = (f: File) => new Promise<any>((res, rej) => { const r = new FileReader(); r.onload = () => res({ name: f.name, mime: f.type, data: String(r.result).split(",")[1] || "" }); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
const VERIFY: Record<string, [string, string]> = tmap({ verified: ["ยืนยันร้านแล้ว", "ok"], pending: ["รอตรวจเอกสาร", "warn"], rejected: ["เอกสารไม่ผ่าน", "danger"] });
export const verifyLabel = (sh: any) => (sh.verification === "pending" && !sh.docName ? tr("รอแนบเอกสาร") : (VERIFY[sh.verification] || VERIFY.pending)[0]);
export const verifyClass = (sh: any) => (VERIFY[sh.verification] || VERIFY.pending)[1];
export const verifyFields = (s: any) => ({ verification: s.verification, verificationNote: s.verificationNote || "", docName: s.document ? s.document.name : "", docMime: s.document ? s.document.mime : "", docAt: s.document ? s.document.uploadedAt : null });

let obDocFile: File | null = null;
export function obDocChosen(f: File | null) {
  const ob = S.org.onboard, p = f ? docProblem(f) : "";
  obDocFile = p ? null : f; ob.data.docName = obDocFile ? f!.name : ""; ob.err = p ? { doc: p } : {}; emit();
}
// status for the shop's own team, with a file field when the owner still has to send (or resend) a document
export function shopDocChosen(f: File) {
  const sh = S.org.shop, p = docProblem(f);
  if (p) { S.org.docErr = p; emit(); return; }
  S.org.docErr = "";
  liveStep(async () => {
    const r = await orgApi("PUT", "/api/org/shop/document", await docBody(f));
    Object.assign(sh, verifyFields(r.shop)); toast(tr("ส่งเอกสารแล้ว รอทีมงานตรวจ"), "ok");
  }, err => { S.org.docErr = orgErrText(err); emit(); });
}

/* ---------- onboarding ---------- */
const OB_CHECK = (d: any) => ({ ...(String(d.name || "").trim().length < 2 || String(d.name).length > 60 ? { name: tr("กรุณาระบุชื่อร้านความยาว 2-60 ตัวอักษร") } : {}), ...(!/^0\d{9}$/.test(String(d.phone || "").replace(/\D/g, "")) ? { phone: tr("หมายเลขโทรศัพท์ 10 หลัก ขึ้นต้นด้วย 0") } : {}) });
export async function obNext() {
  const ob = S.org.onboard, d = ob.data, docErr = docProblem(obDocFile);
  ob.err = OB_CHECK(d); if (docErr) ob.err.doc = docErr; emit();
  if (Object.keys(ob.err).length) return;
  const o = S.org, file = obDocFile!;
  await liveStep(async () => {
    const r = await orgApi("POST", "/api/org/shop", { name: d.name.trim(), type: d.kind, contactLine: d.line || "", phone: String(d.phone).replace(/\D/g, "") });
    o.shop = fromServerShop(r.shop, o.account.email, r.role); o.shops = [o.shop]; o.role = r.role; obDocFile = null; emit();
    // the shop exists now; a failed upload can be retried from the dashboard
    let msg = tr("เปิดร้านค้าแล้ว ทีมงาน JONGLOEI จะตรวจเอกสารก่อนเปิดให้เผยแพร่อีเวนต์");
    try { Object.assign(o.shop, verifyFields((await orgApi("PUT", "/api/org/shop/document", await docBody(file))).shop)); }
    catch (err) { console.error("document upload failed", err); msg = tr("เปิดร้านค้าแล้ว แต่ส่งเอกสารไม่สำเร็จ แนบใหม่ได้ที่หน้าภาพรวม"); }
    go("orgDash", { replace: true }); toast(msg);
  }, err => { S.org.onboard.err = { name: orgErrText(err) }; emit(); });
}
export function obBack() { orgLogout(); }

/* ---------- team ---------- */
export async function teamInvite(email: string, role: string) {
  const o = S.org, em = email.trim().toLowerCase();
  if (!EMAIL_RE.test(em)) { o.teamErr = tr("อีเมลไม่ถูกต้อง"); emit(); return false; }
  if (live()) {
    let ok = false;
    await liveStep(async () => { const r = await orgApi("POST", "/api/org/team", { email: em, role }); o.shop.team = teamFrom(r.team, o.account.email); o.teamErr = ""; ok = true;
      emit(); toast(tr("เพิ่ม {a} แล้ว ให้เข้าสู่ระบบด้วย Google อีเมลนี้", { a: em })); }, err => { o.teamErr = orgErrText(err); emit(); });
    return ok;
  }
  const team = o.shop.team;
  o.teamErr = team.some((m: any) => m.email === em) ? tr("อีเมลนี้เป็นสมาชิกในทีมอยู่แล้ว") : "";
  if (!o.teamErr) { team.push({ email: em, role }); mockToast(tr("ส่งคำเชิญถึง {a} แล้ว", { a: em })); }
  emit(); return !o.teamErr;
}
export async function teamRemove(email: string) {
  const o = S.org;
  if (live()) { await liveStep(async () => { const r = await orgApi("DELETE", "/api/org/team?email=" + encodeURIComponent(email)); o.shop.team = teamFrom(r.team, o.account.email); emit(); }); return; }
  o.shop.team = o.shop.team.filter((m: any) => m.email !== email || m.role === "owner"); emit(); mockToast(tr("ลบ {a} ออกจากทีมแล้ว", { a: email }));
}
export function viewAs(role: string) { if (live()) return notLive(); S.org.role = role; emit(); toast(tr("กำลังแสดงผลในมุมมองของ{a}", { a: ROLE_LABEL[role] })); const g = guardFor(currentScreen()); if (g) go(g, { replace: true }); }
export function copyText(text: string, done: string) { try { navigator.clipboard.writeText(text).then(() => toast(done), () => toast(text)); } catch (_) { toast(text); } }
export function copyInvite() { if (live()) return notLive(); copyText(location.origin + "/?invite=" + encodeURIComponent(S.org.shop.id), tr("คัดลอกลิงก์คำเชิญเรียบร้อยแล้ว (ลิงก์จำลองระบบ)")); }
export const notLive = () => toast(tr("ฟังก์ชันนี้ยังไม่เปิดให้บริการในระบบงานจริง สามารถใช้งานได้เฉพาะในระบบทดลอง"));

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
    <h2 style={{ fontSize: 20 }}>{tr(e.name)}</h2>
    <div role="menu" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {it(() => orgOpenEvent(id), "i-chart", tr("เปิดจัดการอีเวนต์"))}
      {["draft", "on_sale", "paused", "sold_out"].includes(e.status) && it(() => { closeSheet(); editEvent(id); }, "i-ticket", tr("แก้ไขข้อมูลอีเวนต์"))}
      {it(() => { closeSheet(); evDuplicate(id); }, "i-copy", tr("คัดลอกสร้างเป็นอีเวนต์ใหม่"))}
      {["on_sale", "sold_out"].includes(e.status) && it(() => gate(id), "i-qr", tr("ไปยังจุดปฏิบัติการหน้างาน"))}
    </div>
    <button className="btn plain" onClick={closeSheet}>{tr("ปิด")}</button>
  </>));
}

/* ---------- wizard ---------- */
const newZoneId = () => "z" + Math.random().toString(36).slice(2, 7);
export function mkZone(name: string, kind: string, baht: number, cap: number, seats: number | null, i: number) {
  return { id: newZoneId(), name, kind, price: Math.round(baht * 100), capacity: cap, sold: 0, held: 0, seatsPerUnit: seats || null, saleStartAt: null, saleEndAt: null, color: ZONE_COLORS[(i || 0) % ZONE_COLORS.length][0] };
}
export function newEvent() {
  S.org.draft = { id: "draft-" + Date.now().toString(36), shopId: S.org.shop.id, name: "", short: "", category: "ปาร์ตี้", description: "", venue: "", mapUrl: "", bg: POSTERS[0], image: null,
    status: "draft", cancelReason: "", startAt: null, endAt: null, doorsAt: null, params: { ...ORG_PARAMS }, zones: [] };
  S.org.wizStep = 1; S.org.wizShow = false; S.org.wizDirty = false; emit(); go("orgWizard");
}
export function editEvent(id: string) { const e = orgEv(id); S.org.draft = JSON.parse(JSON.stringify(e)); S.org.wizStep = 1; S.org.wizShow = false; S.org.wizDirty = false; emit(); go("orgWizard"); }
export function evDuplicate(id: string) {
  const src = orgEv(id), c = OL.duplicateEvent(src, "draft-" + Date.now().toString(36));
  c.image = src.image && !live() ? src.image : null;
  if (live()) { c.live = false; c.zones = c.zones.map((z: any) => ({ ...z, live: false })); } else S.org.events.push(c);
  S.org.draft = JSON.parse(JSON.stringify(c)); S.org.wizStep = 1; S.org.wizShow = false; emit(); toast(tr("คัดลอกอีเวนต์สำเร็จ สามารถระบุวันและเวลาใหม่ได้ทันที")); go("orgWizard");
}
// the published copy of the event being edited (null for new events and drafts)
export function wizOrig() { const d = S.org.draft; const e = d && orgEv(d.id); return e && e.status !== "draft" ? e : null; }
const origZone = (z: any) => { const o = wizOrig(); return o && o.zones.find((x: any) => x.id === z.id); };
export const zoneLocked = (z: any) => { const oz = origZone(z); return !!oz && (oz.sold || 0) + (oz.held || 0) > 0; };
export const lockReason = (z: any) => tr(OL.canEditZone(origZone(z), { price: origZone(z).price + 1 }).reason);
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
  return tr("บัตร {a} สามารถตั้งราคาขายต่อสูงสุด {b} · ผู้ขายถูกหักค่าธรรมเนียม 6% = {c}", { a: B(face), b: B(cap), c: B(OL.commission(cap)) });
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
  if (live()) { await liveStep(async () => { if (await liveWizSave()) { emit(); toast(tr("บันทึกข้อมูลเรียบร้อยแล้ว")); } }); return; }
  wizUpsert(); S.org.wizDirty = false; emit(); mockToast(tr("บันทึกฉบับร่างเรียบร้อยแล้ว"));
}
export async function wizPublish() {
  const o = S.org, errs = wizErrors(), keys = Object.keys(errs);
  if (o.shop.verification !== "verified") { toast(live() ? tr("จะสามารถเผยแพร่ได้ภายหลังทีมงานตรวจสอบอนุมัติร้านค้า") : tr("จะสามารถเผยแพร่ได้ภายหลังการอนุมัติร้านค้า")); return; }
  if (keys.length) { o.wizShow = true; emit(); toast(tr("ยังมี {a} เรื่องที่ต้องแก้ก่อนเผยแพร่", { a: keys.length })); return; }
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
  const e = evById(id); if (!e) { toast(tr("อีเวนต์นี้ยังไม่แสดงผลในหน้ามุมมองผู้ซื้อ")); return; }
  S.ev = id; S.zone = Math.max(0, e.zones.findIndex((z: any) => z.left > 0)); S.qty = 1; emit(); go("event", { id });
}
export function wizToDash() { S.org.wizStep = 1; S.org.draft = null; emit(); go("orgDash", { replace: true }); }
export function wizLeave() {
  if (!S.org.wizDirty) { S.org.draft = null; emit(); back("orgDash"); return; }
  sheet(() => (<>
    <h2 style={{ fontSize: 19 }}>{tr("ข้อมูลยังไม่ถูกบันทึก")}</h2><p className="small muted" style={{ margin: 0 }}>{tr("ต้องการจัดเก็บข้อมูลที่กรอกไว้เป็นฉบับร่างหรือไม่?")}</p>
    <button className="btn" onClick={async () => {
      if (live()) { await liveStep(async () => { if (await liveWizSave()) { closeSheet(); S.org.draft = null; emit(); back("orgDash"); } else closeSheet(); }); return; }
      wizUpsert(); S.org.wizDirty = false; S.org.draft = null; closeSheet(); emit(); mockToast(tr("บันทึกร่างแล้ว")); back("orgDash");
    }}>{tr("บันทึกเป็นฉบับร่าง")}</button>
    <button className="btn plain" onClick={() => { S.org.wizDirty = false; S.org.draft = null; closeSheet(); emit(); back("orgDash"); }}>{tr("ละทิ้งการแก้ไข")}</button>
    <button className="btn plain" onClick={closeSheet}>{tr("กรอกข้อมูลต่อ")}</button>
  </>));
}

/* ---------- poster image upload ----------
   The picture is resized in the browser to at most 1200 px and saved as JPEG (WebP/PNG kept small too).
   Demo: the data URL is kept on the event. Real shop: PUT /api/org/events/:id/poster (D1, migration 0009). */
const POSTER_MAX = 1200, POSTER_BYTES = 1_000_000;
export async function readPoster(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error(tr("รองรับเฉพาะไฟล์รูปภาพสกุล JPG, PNG หรือ WebP เท่านั้น"));
  if (file.size > 15_000_000) throw new Error(tr("ขนาดไฟล์รูปภาพใหญ่เกิน 15 MB"));
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error(tr("ไม่สามารถเปิดไฟล์รูปภาพนี้ได้"))); i.src = url; });
    const scale = Math.min(1, POSTER_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.85, 0.72, 0.6]) {
      const data = c.toDataURL("image/jpeg", q);
      if (Math.floor((data.length - data.indexOf(",") - 1) * 3 / 4) <= POSTER_BYTES * 0.9) return data;
    }
    throw new Error(tr("ขนาดไฟล์รูปภาพยังคงใหญ่เกิน 1 MB ภายหลังการย่อขนาด กรุณาลองใช้รูปภาพอื่น"));
  } finally { URL.revokeObjectURL(url); }
}
// wizard: keeps the picture on the draft; a real shop uploads it after the event is saved
export async function wizSetPoster(file: File | null) {
  const d = S.org.draft;
  if (!file) { d.image = null; d._posterRemove = true; wizTouch(); return; }
  try { d.image = await readPoster(file); d._posterNew = true; d._posterRemove = false; wizTouch(); toast(tr("อัปโหลดรูปภาพโปสเตอร์เรียบร้อยแล้ว"), "ok"); }
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
      replaceLive(r.event); emit(); toast(image ? tr("อัปโหลดโปสเตอร์เรียบร้อยแล้ว") : tr("ลบรูปภาพโปสเตอร์เรียบร้อยแล้ว"), "ok"); loadEvents(true);
    });
    return;
  }
  replaceOrgEvent({ ...e, image }); emit(); mockToast(image ? tr("เปลี่ยนแปลงรูปภาพโปสเตอร์เรียบร้อยแล้ว") : tr("ลบรูปโปสเตอร์แล้ว"));
}
export function stSetSwatch(i: number) {
  const e = orgEv(S.org.oev);
  if (live()) { liveStep(async () => { replaceLive((await orgApi("PATCH", "/api/org/events/" + e.id, { poster: i })).event); emit(); toast(tr("เปลี่ยนแปลงพื้นหลังโปสเตอร์เรียบร้อยแล้ว"), "ok"); }); return; }
  replaceOrgEvent({ ...e, bg: POSTERS[i] }); emit(); mockToast(tr("เปลี่ยนพื้นหลังโปสเตอร์แล้ว"));
}

/* ---------- event management ---------- */
export function pause() { if (live()) return notLive(); const e = orgEv(S.org.oev); replaceOrgEvent({ ...e, status: "paused" }); emit(); mockToast(tr("ระงับการจำหน่ายเรียบร้อย ผู้ซื้อยังคงมองเห็นอีเวนต์แต่ไม่สามารถซื้อบัตรได้")); }
export function resume() { if (live()) return notLive(); const e = orgEv(S.org.oev); replaceOrgEvent({ ...e, status: "on_sale" }); emit(); mockToast(tr("เปิดจำหน่ายต่อเรียบร้อยแล้ว")); }
export async function zoneSave(i: number, priceText: string | null, capText: string): Promise<string> {
  const e = orgEv(S.org.oev), z = e.zones[i];
  if (live()) {
    const cap = Number(capText.trim()); let price = z.price;
    if (priceText !== null) { const p = OL.toSatang(priceText.trim()); if (Number.isNaN(p) || p % 100 || p < 2000) return tr("ราคาต้องเป็นจำนวนเต็มในหน่วยบาท และมีมูลค่าอย่างน้อย 20฿"); price = p; }
    if (!Number.isInteger(cap) || cap < 1) return tr("จำนวนต้องเป็นจำนวนเต็มอย่างน้อย 1");
    const zones = e.zones.map((x: any, k: number) => (k === i ? { ...x, price, capacity: cap } : x));
    let msg = "";
    await liveStep(async () => { replaceLive((await orgApi("PATCH", "/api/org/events/" + e.id, { zones: toServerZones(zones) })).event); emit(); toast(tr("บันทึกข้อมูลโซนเรียบร้อยแล้ว"), "ok"); }, err => { msg = orgErrText(err); });
    return msg;
  }
  const patch: any = { capacity: Number(capText.trim() || 0) };
  if (priceText !== null) { const p = OL.toSatang(priceText.trim()); patch.price = Number.isNaN(p) ? 0 : p; }
  const can = OL.canEditZone(z, patch), merged = { ...z, ...patch }, v = OL.validateZone(merged);
  const msg = tr(!can.ok ? can.reason : !v.ok ? (Object.values(v.errors)[0] as string) : "");
  if (msg) return msg;
  replaceOrgEvent({ ...e, zones: e.zones.map((x: any, k: number) => (k === i ? merged : x)) }); emit(); mockToast(tr("บันทึกโซนแล้ว")); return "";
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
    if (!Array.isArray(rows)) { toast(tr("กรุณารอโหลดข้อมูลคำสั่งซื้อสักครู่")); return; }
    downloadCsv(tr("รายการคำสั่งซื้อ{a}.csv", { a: e.id }), [[tr("ข้อมูลผู้ซื้อ"), tr("อีเมล"), tr("โซนที่นั่ง"), tr("จำนวนใบ"), tr("ยอดเงินรวม (บาท)"), tr("สถานะ"), tr("บัตรที่ออก")], ...rows.map((r: any) => [r.buyer || "", r.email, r.zone, r.quantity, r.amountSatang / 100, ORDER_STATUS[r.status] || r.status, r.minted])]);
    return;
  }
  const em = (x: string) => (S.org.showEmails ? x : maskEmail(x));
  downloadCsv(tr("ผู้ซื้อ{a}.csv", { a: e.id }), [[tr("ชื่อ-นามสกุล"), tr("อีเมล"), tr("โซน"), tr("สถานะ"), tr("หมายเลขบัตร")], ...buyerRows(e).map((r: any) => [r.p.name, em(r.p.email), r.z.name, TICKET_STATUS[r.t.status] || r.t.status, r.t.ticketId])]);
  toast(tr("ส่งออกข้อมูลเป็นไฟล์ CSV เรียบร้อยแล้ว"), "ok");
}
export function rsSave(capm: number) { const e = orgEv(S.org.oev); replaceOrgEvent({ ...e, params: { ...e.params, capMultiplier: capm / 100 } }); emit(); mockToast(tr("บันทึกเพดานราคาเรียบร้อยแล้ว")); }
export async function stSave(f: { desc: string; venue: string; start: number | null; msg: string }): Promise<Record<string, string>> {
  const e = orgEv(S.org.oev), o = S.org;
  if (!f.start) return { start: tr("กรุณาระบุวันและเวลาเริ่มต้นอีเวนต์") };
  if (!f.venue.trim()) return { venue: tr("กรุณาระบุสถานที่จัดงาน") };
  const changed = f.venue.trim() !== e.venue || f.start !== e.startAt;
  if (live()) {
    const body: any = { description: f.desc, venue: f.venue.trim() };
    if (f.start !== e.startAt) { body.startsAt = f.start; body.endsAt = e.endAt + (f.start - e.startAt); }
    let out = {};
    await liveStep(async () => { replaceLive((await orgApi("PATCH", "/api/org/events/" + e.id, body)).event); emit();
      toast(f.msg ? tr("บันทึกเรียบร้อย ระบบงานจริงยังไม่ได้ส่งข้อความนี้ตรงถึงผู้ซื้อ") : tr("บันทึกการตั้งค่าเรียบร้อยแล้ว")); loadEvents(true); }, err => { out = { start: orgErrText(err) }; });
    return out;
  }
  if (changed && e.zones.reduce((a: number, z: any) => a + (z.sold || 0), 0) > 0 && !f.msg.trim()) return { msg: tr("กรณียการเปลี่ยนแปลงสถานที่หรือวันเวลาภายหลังการจำหน่ายบัตร จำเป็นต้องระบุข้อความชี้แจงแจ้งให้ผู้ซื้อทราบ") };
  const shift = f.start - e.startAt;
  replaceOrgEvent({ ...e, description: f.desc, venue: f.venue.trim(), startAt: f.start, endAt: e.endAt ? e.endAt + shift : e.endAt, doorsAt: e.doorsAt ? e.doorsAt + shift : e.doorsAt });
  if (changed && f.msg.trim()) {
    const n = new Set(evTickets(e.id).filter((t: any) => ["valid", "listed"].includes(t.status)).map((t: any) => t.holderId)).size;
    o.announcements.push({ id: "an-" + Date.now(), eventId: e.id, at: Date.now(), text: f.msg.trim(), recipients: n, zone: "all" }); mockToast(tr("แจ้งผู้ซื้อ {a} คนแล้ว", { a: n }));
  } else mockToast(tr("บันทึกการตั้งค่าแล้ว"));
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
    <h2 style={{ fontSize: 19 }}>ยกเลิก &quot;{tr(e.name)}&quot;?</h2>
    <dl className="kv card num" style={{ margin: 0 }}><dt>{tr("ผู้ซื้อที่จะได้รับเงินคืน")}</dt><dd>{tr("{a} คน", { a: payers.size })}</dd><dt>{tr("จำนวนรายการคืนเงิน")}</dt><dd>{tr("{a} รายการ", { a: plan.refunds.length })}</dd>
      <dt style={{ fontWeight: 600, color: "var(--ink)" }}>{tr("ยอดคืนเงินรวมทั้งหมด")}</dt><dd style={{ fontWeight: 700, color: "var(--red)" }}>{B(plan.total)}</dd></dl>
    <ul className="small" style={{ margin: 0, paddingLeft: 18 }}><li>{tr("ร้านค้าจะไม่ได้รับรายได้จากอีเวนต์นี้")}</li><li>{tr("ไม่มีค่าธรรมเนียมบริการและไม่มีการหักคอมมิชชันขายต่อ")}</li><li>{tr("บัตรเข้าชมทุกใบจะถูกระงับสิทธิ์การเข้างานทันที")}</li></ul>
    <button className="btn org-danger-btn" onClick={cancelConfirmSheet}>{tr("ดำเนินการถัดไป")}</button><button className="btn plain" onClick={closeSheet}>{tr("ไม่ยกเลิก")}</button>
  </>));
}
function CancelConfirm() {
  const e = orgEv(S.org.oev);
  const [name, setName] = useState(""), [reason, setReason] = useState(tr("สภาพอากาศ")), [err, setErr] = useState("");
  const go2 = async () => {
    if (name.trim() !== e.name) { setErr(tr("ชื่องานอีเวนต์ไม่ถูกต้อง กรุณาพิมพ์ให้ตรงกันกับข้อความด้านบน")); return; }
    if (live()) {
      await liveStep(async () => {
        const r = await orgApi("POST", `/api/org/events/${e.id}/cancel`, { reason, confirmName: e.name }); replaceLive(r.event); emit(); loadEvents(true);
        sheet(() => (<>
          <h2 style={{ fontSize: 19 }}>{tr("ยกเลิกอีเวนต์เรียบร้อยแล้ว")}</h2>
          <dl className="kv card num" style={{ margin: 0 }}><dt>{tr("ที่นั่งที่อยู่ระหว่างการสำรอง (ดำเนินการคืนสู่ระบบแล้ว)")}</dt><dd>{tr("{a} รายการ", { a: r.heldReleased })}</dd><dt>{tr("คำสั่งซื้อที่ต้องดำเนินการคืนเงิน")}</dt><dd>{tr("{a} รายการ", { a: r.toRefund.orders })}</dd>
            <dt style={{ fontWeight: 600, color: "var(--ink)" }}>{tr("ยอดเงินที่ต้องคืน")}</dt><dd style={{ fontWeight: 700, color: "var(--red)" }}>{B(r.toRefund.amountSatang)}</dd></dl>
          <div className="card small">{tr("ผู้ซื้อไม่สามารถทำรายการซื้อเพิ่มได้แล้ว กระบวนการคืนเงินยังไม่เป็นระบบอัตโนมัติ ทีมงาน JONGLOEI จะเป็นผู้ดำเนินการคืนเงินให้แก่ผู้ซื้อตามรายการนี้")}</div>
          <button className="btn" onClick={closeSheet}>{tr("เสร็จสิ้นกระบวนการ")}</button>
        </>));
      }, er => setErr(orgErrText(er)));
      return;
    }
    const plan = orgCancelEvent(e.id, reason); sheet(() => <CancelProgress plan={plan} />);
  };
  return (<>
    <h2 style={{ fontSize: 19 }}>{tr("ยืนยันการยกเลิกอีเวนต์")}</h2>
    <Fld id="cx-name" label={tr("กรุณาพิมพ์ชื่องานเพื่อยืนยัน")} err={err} hint={tr("ชื่องาน: {a}", { a: tr(e.name) })}><input id="cx-name" value={name} onChange={x => setName(x.target.value)} autoComplete="off" {...errA("cx-name", err, true)} /></Fld>
    <Fld id="cx-reason" label={tr("เหตุผลอื่นๆ")}><select id="cx-reason" value={reason} onChange={x => setReason(x.target.value)}>{[tr("สภาพอากาศ"), tr("ศิลปินยกเลิกการแสดง"), tr("สถานที่ไม่พร้อมใช้งาน"), tr("ยอดจำหน่ายไม่ถึงเป้าหมาย"), tr("อื่น ๆ")].map(x => <option key={x}>{x}</option>)}</select></Fld>
    <button className="btn org-danger-btn" onClick={go2}>{live() ? tr("ยกเลิกอีเวนต์") : tr("ยกเลิกอีเวนต์และดำเนินการคืนเงินให้แก่ผู้ซื้อทั้งหมด")}</button><button className="btn plain" onClick={closeSheet}>{tr("ย้อนกลับ")}</button>
  </>);
}
const cancelConfirmSheet = () => sheet(() => <CancelConfirm />);
function CancelProgress({ plan }: { plan: any }) {
  const by = new Map<string, number>(); for (const r of plan.refunds) by.set(r.payerId, (by.get(r.payerId) || 0) + r.amount);
  const rows = [...by].slice(0, 6);
  const [n, setN] = useState(0);
  useState(() => { let k = 0; const iv = setInterval(() => { k++; setN(k); if (k >= rows.length) clearInterval(iv); }, 350); return iv; });
  return (<>
    <h2 style={{ fontSize: 19 }}>{tr("กำลังดำเนินการคืนเงินให้แก่ผู้ซื้อ")}</h2><span className="pill warn" style={{ alignSelf: "flex-start" }}>{tr("ระบบทดลอง: ไม่มีธุรกรรมการโอนเงินจริง")}</span>
    <ol className="steps">{rows.map(([p, amt], i) => (<li key={p} className={i < n ? "done" : i === n ? "active" : ""}><span className="s"><svg><use href="#i-check" /></svg></span>
      <span><b>{orgPerson(p).name}</b><small className="num">{B(amt)} · {i < n ? tr("คืนเงินแล้ว") : tr("รอการดำเนินการ")}</small></span></li>))}</ol>
    {by.size > rows.length && <div className="small muted">{tr("และอีก {a} คน", { a: by.size - rows.length })}</div>}
    <div className="small muted">{tr("รวมคืน {a} · {b} รายการ", { a: B(plan.total), b: plan.refunds.length })}</div>
    <button className="btn" onClick={closeSheet}>{tr("เสร็จสิ้น")}</button>
  </>);
}

/* ---------- comps, promo codes, announcements (demo only) ---------- */
export function compIssue(name: string, email: string, zoneId: string): Record<string, string> {
  const e = orgEv(S.org.oev), zone = e.zones.find((z: any) => z.id === zoneId), em = email.trim().toLowerCase();
  if (!name.trim()) return { name: tr("กรุณาระบุชื่อผู้รับ") };
  if (!EMAIL_RE.test(em)) return { email: tr("อีเมลไม่ถูกต้อง") };
  if (!zone) return { zone: "กรุณาเลือกโซนที่นั่ง" };
  if (zone.sold + zone.held >= zone.capacity) return { zone: tr("บัตรเชิญโซนนี้เต็มจำนวนโควตาแล้ว (") + zone.sold + "/" + zone.capacity + tr(") กรุณาเพิ่มจำนวนโควตาในหน้าแก้ไขข้อมูลอีเวนต์") };
  const gid = "guest-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  S.org.buyers[gid] = { name: name.trim(), email: em, phone: "" };
  S.org.tickets.push({ ticketId: e.id + "-" + zone.id + "-" + (zone.sold + 1), eventId: e.id, zoneId: zone.id, holderId: gid, status: "valid", usedAt: null, checkinMethod: null,
    hops: [{ idx: 0, payerId: gid, paid: 0, at: Date.now() }], invite: true });
  replaceOrgEvent({ ...e, zones: e.zones.map((z: any) => (z === zone ? { ...z, sold: z.sold + 1 } : z)) });
  emit(); mockToast(tr("ส่งบัตรเชิญถึง {a} แล้ว", { a: em })); return {};
}
export function promoCreate(f: { code: string; kind: string; value: string; zone: string; start: number | null; end: number | null; max: string }): Record<string, string> {
  const e = orgEv(S.org.oev), errs: Record<string, string> = {}, code = f.code.trim().toUpperCase(), max = Number(f.max);
  if (!/^[A-Z0-9]{3,20}$/.test(code)) errs.code = tr("รหัสต้องประกอบด้วยตัวอักษรภาษาอังกฤษหรือตัวเลขความยาว 3-20 ตัว");
  else if (S.org.promos.some((p: any) => p.code === code)) errs.code = tr("มีรหัสส่วนลดนี้อยู่ในระบบแล้ว");
  let value = Number(f.value);
  if (f.kind === "percent") { if (!Number.isInteger(value) || value < 1 || value > 100) errs.value = tr("ส่วนลดเป็นเปอร์เซ็นต์ต้องเป็นจำนวนเต็มระหว่าง 1-100"); }
  else { value = OL.toSatang(f.value); if (Number.isNaN(value) || value < 100) errs.value = tr("กรุณาระบุจำนวนเงินส่วนลดอย่างน้อย 1฿"); }
  if (!f.start) errs.start = tr("กรุณาระบุวันและเวลาเริ่มต้นใช้งาน");
  if (!f.end) errs.end = tr("กรุณาระบุวันและเวลาหมดอายุ"); else if (f.start && f.end <= f.start) errs.end = tr("วันเวลาหมดอายุต้องอยู่ภายหลังวันเวลาเริ่มต้นใช้งาน");
  if (!Number.isInteger(max) || max < 1) errs.max = tr("จำนวนสิทธิ์การใช้งานต้องเป็นจำนวนเต็มอย่างน้อย 1");
  if (Object.keys(errs).length) return errs;
  S.org.promos.push({ code, eventId: e.id, ...(f.kind === "percent" ? { percentOff: value } : { amountOff: value }), ...(f.zone !== "all" ? { zoneId: f.zone } : {}),
    startsAt: f.start, endsAt: f.end, maxUses: max, used: 0, disabled: false });
  emit(); mockToast(tr("สร้างโค้ด {a} แล้ว", { a: code })); return {};
}
export function promoToggle(code: string) { const p = S.org.promos.find((x: any) => x.code === code); if (p) { p.disabled = !p.disabled; emit(); mockToast(p.disabled ? tr("ปิดโค้ด {a} แล้ว", { a: code }) : tr("เปิดโค้ด {a} แล้ว", { a: code })); } }
export function promoTest(code: string, zoneId: string) {
  const e = orgEv(S.org.oev), z = e.zones.find((x: any) => x.id === zoneId);
  if (!z) return tr("กรุณาเลือกโซนที่นั่งก่อน");
  const r = OL.applyPromo(code, S.org.promos.filter((p: any) => !p.eventId || p.eventId === e.id), z.id, z.price, Date.now());
  return r.ok ? tr("ราคาหลังลด {a} (จาก {b})", { a: B(r.price), b: B(z.price) }) : PROMO_WHY[r.reason];
}
export function annSend(zone: string, text: string) {
  const e = orgEv(S.org.oev);
  if (!text.trim()) return tr("กรุณาระบุข้อความก่อนทำการส่ง");
  const n = new Set(evTickets(e.id).filter((t: any) => ["valid", "listed"].includes(t.status) && (zone === "all" || t.zoneId === zone)).map((t: any) => t.holderId)).size;
  S.org.announcements.push({ id: "an-" + Date.now(), eventId: e.id, at: Date.now(), text: text.trim(), recipients: n, zone });
  emit(); mockToast(tr("ส่งประกาศถึง {a} คนแล้ว", { a: n })); return "";
}
/* ---------- finance ---------- */
export function finRow(e: any, now: number) {
  const o = S.org;
  if (e.status === "cancelled") {
    const refunded = o.ledger.filter((l: any) => l.eventId === e.id && l.type === "REFUND_OUT").reduce((a: number, l: any) => a + l.amount, 0);
    return { e, kind: "cancelled", gross: 0, fee: 0, net: 0, refunded, payAt: null, paid: false, label: tr("ยกเลิก · ไม่มีกระแสเงินสดทำรายการ"), tickets: [] as any[] };
  }
  const tickets = evTickets(e.id).filter((t: any) => t.status !== "refunded"), r = OL.settleEvent(e, tickets), payAt = OL.payoutAt(e);
  const gross = tickets.reduce((a: number, t: any) => a + (t.hops[0] ? t.hops[0].paid : 0), 0);
  const over = e.endAt && now >= e.endAt, paid = e.status === "ended" && payAt !== null && payAt <= now;
  const label = paid ? tr("จ่ายเงินแล้ว") : over || e.status === "ended" ? tr("รอรอบระยะเวลาตรวจสอบ 24 ชั่วโมง") : tr("รอสิ้นสุดอีเวนต์");
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
export function callManager() { gateClose(); if (live()) toast(tr("ระบบยังไม่ได้ส่งการแจ้งเตือนถึงผู้จัดการโดยตรง กรุณาติดต่อผู้จัดการผ่านช่องทางอื่น")); else mockToast(tr("แจ้งเตือนผู้จัดการประจำจุดตรวจเรียบร้อยแล้ว")); }
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
  gateShow(r.valid, r.valid ? (p ? p.name : "") : tr(OL.reasonText(r.reason)), r.valid && z ? z.name : "");
}
export function sim(c: number) {
  const args = simCase(c); closeSheet();
  if (!args) { toast(tr("ไม่มีข้อมูลบัตรตัวอย่างสำหรับกรณีจำลองนี้")); return; }
  const [ev, ticket, signer, ts] = args, r = gateRun(ev, ticket, signer, ts, "scan"); emit(); showRun(r, ticket, ev);
}
export function simOpen() {
  sheet(() => (<>
    <h2 style={{ fontSize: 19 }}>{tr("จำลองกระบวนการสแกน")}</h2><p className="small muted" style={{ margin: 0 }}>{tr("กรุณาเลือกสถานการณ์จำลอง ระบบจะสุ่มดึงข้อมูลบัตรจริงของอีเวนต์นี้มาตรวจสอบ")}</p>
    {SIM_CASES.map(([c, l]) => <button key={c} className="btn plain" onClick={() => sim(c)}>{c}. {l}</button>)}
    <button className="btn plain" onClick={closeSheet}>{tr("ปิด")}</button>
  </>));
}
export function manualIn(ticketId: string) {
  const e = orgEv(S.org.oev), t = S.org.tickets.find((x: any) => x.ticketId === ticketId), p = orgPerson(t.holderId);
  sheet(() => (<>
    <h2 style={{ fontSize: 19 }}>{tr("ยืนยันการบันทึกเช็กอินด้วยตนเอง")}</h2>
    <dl className="kv card" style={{ margin: 0 }}><dt>{tr("ชื่อ")}</dt><dd>{tr(p.name)}</dd><dt>{tr("โซน")}</dt><dd>{(e.zones.find((z: any) => z.id === t.zoneId) || {}).name || ""}</dd><dt>{tr("เลขตั๋ว")}</dt><dd className="mono">{t.ticketId}</dd></dl>
    <p className="small muted" style={{ margin: 0 }}>{tr("การเช็กอินมือถูกบันทึกว่าทำโดย {a} ตรวจบัตรประชาชนหรืออีเมลยืนยันก่อนกดยืนยัน", { a: gateWho() })}</p>
    <button className="btn" onClick={() => { const r = gateRun(e, t, t.holderId, Date.now(), "manual"); closeSheet(); emit(); if (r.valid) mockToast(tr("เช็กอินเรียบร้อยแล้ว")); else showRun(r, t, e); }}>{tr("ยืนยันการเช็กอิน")}</button>
    <button className="btn plain" onClick={closeSheet}>{tr("ยกเลิก")}</button>
  </>));
}

/* ---------- door (real shop: src/checkin.js) ---------- */
export async function liveGateLoad() {
  const id = S.org.oev;
  try { const d = await orgApi("GET", "/api/checkin/events/" + encodeURIComponent(id)); if (S.org.oev !== id) return; S.org.liveGate = { id, used: d.used, total: d.total, scans: d.scans }; emit(); }
  catch (err: any) { console.error("check-in counts failed", err); if (err.status === 404) toast(tr("บัญชีผู้ใช้นี้ไม่ได้รับสิทธิ์สแกนอีเวนต์นี้")); }
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
    const text = r.valid ? (r.ticket && r.ticket.holder) || "" : (LIVE_REASON[r.reason] || r.reason) + (r.reason === "already_used" && r.ticket && r.ticket.usedAt ? tr(" เมื่อ {a} น.", { a: timeOf(r.ticket.usedAt) }) : "");
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
    toast(tr("ไม่สามารถเปิดใช้งานกล้องได้ กรุณาใช้ช่องกรอกรหัสรหัสแทน"), "err");
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
const ORG_ERR: Record<string, string> = tmap({ no_document: "ร้านนี้ยังไม่ได้แนบเอกสาร", already_verified: "ร้านนี้ยืนยันแล้ว ไม่ต้องส่งเอกสารใหม่", authentication_required: "กรุณาเข้าสู่ระบบใหม่อีกครั้ง", forbidden: "บทบาทสิทธิ์ของผู้ใช้งานไม่สามารถทำรายการนี้ได้", shop_not_verified: "เผยแพร่ได้หลังทีมงานยืนยันร้าน",
  not_a_draft: "อีเวนต์นี้ผ่านการเผยแพร่ไปแล้ว", event_closed: "อีเวนต์นี้ปิดให้บริการหรือถูกยกเลิกแล้ว ไม่สามารถแก้ไขข้อมูลได้", changed_meanwhile: "มีผู้ซื้อบัตรเข้ามาในระหว่างการบันทึกข้อมูล ระบบได้โหลดข้อมูลล่าสุดแล้ว กรุณาลองใหม่อีกครั้ง",
  already_in_shop: "บัญชีผู้ใช้นี้สังกัดอยู่ภายใต้ร้านค้าอื่นแล้ว", already_cancelled: "อีเวนต์นี้ถูกยกเลิกไปแล้ว", event_not_found: "ไม่พบข้อมูลอีเวนต์นี้", no_shop: "บัญชีผู้ใช้นี้ยังไม่มีการสร้างร้านค้า", member_not_found: "ไม่พบข้อมูลสมาชิกรายนี้",
  invalid_image: "ไฟล์รูปภาพไม่ถูกต้อง รองรับเฉพาะสกุล JPG, PNG หรือ WebP เท่านั้น", image_too_large: "ขนาดไฟล์รูปภาพใหญ่เกิน 1 MB" });
const FIELD_ERR: Record<string, string> = tmap({ type_mismatch: "ชนิดไฟล์ไม่ตรงกับเนื้อไฟล์", unsafe_characters: "ห้ามใช้อักขระพิเศษ < > \" ' `", required: "ต้องกรอก", too_long: "ยาวเกินไป", in_past: "ต้องเป็นเวลาในอนาคต", before_start: "ต้องหลังเวลาเริ่ม",
  duplicate: "ชื่อซ้ำซ้อนกับโซนที่นั่งอื่น", duplicate_name: "ชื่อซ้ำซ้อนกับโซนเดิม", locked_by_orders: "มีผู้ซื้อบัตรแล้ว ไม่สามารถเปลี่ยนแปลงข้อมูลได้", invalid: "ค่าข้อมูลไม่ถูกต้อง", too_many: "เกินจำนวนความจุที่รองรับได้",
  mismatch: "ข้อมูลไม่ตรงกัน", unknown_zone: "ไม่พบข้อมูลโซนนี้", not_editable: "ไม่สามารถแก้ไขข้อมูลโซนนี้ได้", too_large: "ไฟล์มีขนาดใหญ่เกิน 1 MB" });
const FIELD_NAME: Record<string, string> = tmap({ name: "ชื่อ", venue: "สถานที่จัดงาน", category: "หมวดหมู่อีเวนต์", description: "รายละเอียดเพิ่มเติม", short: "ชื่อแสดงบนโปสเตอร์", poster: "โปสเตอร์ประชาสัมพันธ์", image: "รูปภาพโปสเตอร์", startsAt: "วันและเวลาเริ่มต้น", endsAt: "วันและเวลาสิ้นสุด",
  zones: "โซนตั๋ว", email: "อีเมล", role: "บทบาทหน้าที่", reason: "เหตุผล", confirmName: "ชื่องาน", phone: "หมายเลขโทรศัพท์", type: "ประเภทธุรกิจ", contactLine: "LINE OA" });
export function orgErrText(err: any) {
  const d = err && err.data; if (!d) return tr("เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  const [k, v] = (Object.entries(d.fields || {})[0] || []) as [string, string];
  if (k) {
    const m = /^zones\.(\d+)\.(\w+)$/.exec(k), b = /^below_taken:(\d+)$/.exec(v);
    const where = m ? tr("โซนที่ {a} ({b})", { a: +m[1] + 1, b: ({ name: tr("ชื่อ"), price: tr("ราคา"), capacity: tr("จำนวน"), color: "สี", id: "รหัส" } as any)[m[2]] || m[2] }) : FIELD_NAME[k] || k;
    return where + ": " + (b ? tr("สามารถลดจำนวนลงได้ต่ำสุด {a} ที่นั่ง (เนื่องจากมีผู้ซื้อและอยู่ระหว่างการจอง)", { a: b[1] }) : FIELD_ERR[v] || v);
  }
  return ORG_ERR[d.error] || tr("ทำรายการไม่สำเร็จ ({a})", { a: d.error });
}
const teamFrom = (team: any[], me: string) => team.map(m => ({ email: m.email || me, role: m.role }));
function fromServerShop(s: any, email: string, role: string) {
  return { id: s.id, name: s.name, kind: s.type || "other", contactLine: s.contactLine || "", phone: s.phone || "", ...verifyFields(s), team: [{ email, role }] };
}
// server event -> the shape the organizer screens use (money in satang, zones keep their server id)
function fromServerEvent(e: any, shopId: string) {
  let status = ({ draft: "draft", on_sale: "on_sale", sold_out: "sold_out", closed: "ended", cancelled: "cancelled" } as any)[e.status] || e.status;
  if (["on_sale", "sold_out"].includes(status) && e.endsAt && e.endsAt < Date.now()) status = "ended";
  return { id: e.id, shopId, live: true, name: e.name, short: e.short || "", category: e.category || tr("ปาร์ตี้"), description: e.description || "", venue: e.venue || "", mapUrl: "",
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
  if (!String(d.venue || "").trim()) out.venue = tr("ใส่สถานที่"); else if (UNSAFE_RE.test(d.venue)) out.venue = FIELD_ERR.unsafe_characters;
  if (UNSAFE_RE.test((d.description || "") + (d.short || ""))) out.name = out.name || tr("รายละเอียดหรือชื่อบนโปสเตอร์มีอักขระอักษรพิเศษที่ไม่ได้รับอนุญาต < > \" ' `");
  d.zones.forEach((z: any, i: number) => {
    if (UNSAFE_RE.test(z.name || "")) out[`zones.${i}.name`] = FIELD_ERR.unsafe_characters;
    if (Number.isInteger(z.price) && (z.price % 100 || z.price < 2000)) out[`zones.${i}.price`] = tr("ระบบงานจริงรองรับราคาหน่วยเป็นบาทเต็ม และมีมูลค่าอย่างน้อย 20฿");
  });
  const o = wizOrig();
  if (o && o.zones.some((z: any) => !d.zones.some((x: any) => x.id === z.id))) out.zones = tr("โซนที่เผยแพร่แล้วไม่สามารถลบออกได้ แนะนำให้ใช้วิธีลดจำนวนการจำหน่ายแทน");
  return out;
}
function liveOrgState(me: any) {
  const shop = me.shop ? fromServerShop(me.shop, me.user.email, me.role) : null;
  return { live: true, admin: !!me.admin, account: { email: me.user.email, name: me.user.name || me.user.email }, accounts: {}, shops: shop ? [shop] : [], shop, role: me.role, authMode: "login",
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
    if (err && err.status === 401) { S.signedIn = false; S.afterSignup = "orglive"; save(); toast(tr("กรุณาเข้าสู่ระบบใหม่")); googleLogin(); return; }
    if (onErr) onErr(err); else toast(orgErrText(err), "err");
  } finally { liveBusy = false; S.busy = false; emit(); rerenderSheet(); }
}
export async function orgLiveStart() {
  if (!S.auth.google) { googleLogin(); return; }
  if (false) { toast(tr("ระบบงานจริงสามารถใช้งานได้เมื่อเปิดผ่านเว็บไซต์ทางการของ JONGLOEI เท่านั้น")); return; }
  if (!S.signedIn) { S.orgLiveWanted = true; S.afterSignup = "orglive"; googleLogin(); return; }
  await liveStep(async () => {
    const me = await orgApi("GET", "/api/org/me");
    S.orgLive = null;
    S.org = liveOrgState(me); S.orgLiveWanted = true;
    if (S.org.shop) await orgLiveReload();
    closeSheet(); S.mode = "org"; emit();
    go(!S.org.shop ? "orgOnboard" : S.org.role === "gate" ? "orgGatePick" : "orgDash", { replace: true });
  });
}
export function orgLiveStop() {
  if (live()) S.org = null;
  S.orgLive = null; S.orgLiveWanted = false; refreshEvents(); emit();
}
/* ---------- JONGLOEI admin: shop review queue (/api/admin/hosts, admins only, checked on the server) ---------- */
export const orgIsAdmin = () => !!(S.org && S.org.live && S.org.admin);
export function adminOpen() { S.org.adminHosts = undefined; go("orgAdmin"); }
export function adminFilter(v: string) { S.org.adminFilter = v; S.org.adminHosts = undefined; emit(); }
// undefined = not asked yet, null = loading, array = rows, { error } = failed
export function adminHosts() {
  const o = S.org, f = o.adminFilter || "pending";
  if (o.adminHosts === undefined) {
    o.adminHosts = null;
    orgApi("GET", "/api/admin/hosts?status=" + f).then(d => { o.adminHosts = d.hosts.map((h: any) => ({ ...fromServerShop(h, h.ownerEmail, "owner"), ownerEmail: h.ownerEmail, createdAt: h.createdAt })); },
      err => { o.adminHosts = { error: orgErrText(err) }; }).finally(() => { if (S.org === o) emit(); });
  }
  return o.adminHosts;
}
export const adminHost = (id: string) => { const l = S.org.adminHosts; return Array.isArray(l) ? l.find((h: any) => h.id === id) : null; };
export function adminApprove(id: string) {
  liveStep(async () => {
    await orgApi("POST", "/api/admin/hosts/verify", { userId: id, status: "verified" });
    const sh = adminHost(id); toast(tr("ยืนยันร้าน {a} แล้ว", { a: sh ? sh.name : "" }), "ok");
    if (S.org.shop && S.org.shop.id === id) S.org.shop.verification = "verified";
    S.org.adminHosts = undefined;
  });
}
function AdminRejectSheet({ id }: { id: string }) {
  const sh = adminHost(id), [note, setNote] = useState(""), [err, setErr] = useState("");
  if (!sh) return null;
  const go_ = () => {
    if (UNSAFE_RE.test(note)) { setErr(tr(FIELD_ERR.unsafe_characters)); return; }
    liveStep(async () => {
      await orgApi("POST", "/api/admin/hosts/verify", { userId: id, status: "rejected", note });
      closeSheet(); S.org.adminHosts = undefined; toast(tr("ส่งผลไม่อนุมัติให้ร้านแล้ว"), "ok");
    }, e => setErr(orgErrText(e)));
  };
  return (<>
    <h2 style={{ fontSize: 20 }}>{tr("ไม่อนุมัติ {a}", { a: sh.name })}</h2>
    <Fld id="rej-note" label={tr("เหตุผลที่ร้านจะเห็น")} err={err} hint={tr("เช่น รูปไม่ชัด ชื่อในเอกสารไม่ตรงกับชื่อผู้ขาย")}><textarea id="rej-note" maxLength={300} value={note} onChange={e => setNote(e.target.value)} {...errA("rej-note", err, true)} /></Fld>
    <button className="btn" disabled={!!S.busy} onClick={go_}>{tr("ไม่อนุมัติ")}</button><button className="btn plain" onClick={closeSheet}>{tr("ยกเลิก")}</button>
  </>);
}
export const adminReject = (id: string) => sheet(() => <AdminRejectSheet id={id} />);

function replaceLive(se: any) {
  const o = S.org, ev = fromServerEvent(se, o.shop.id);
  const i = o.events.findIndex((e: any) => e.id === ev.id); if (i < 0) o.events.unshift(ev); else o.events[i] = ev;
  delete o.orders[ev.id]; return ev;
}
async function liveWizSave() {
  const o = S.org, d = o.draft, errs = wizErrors(), keys = Object.keys(errs);
  if (keys.length) { o.wizShow = true; o.wizStep = errStep(keys[0]); emit(); focusLater(errField(keys[0])); toast(tr("ยังมี {a} เรื่องที่ต้องแก้ก่อนบันทึก", { a: keys.length })); return null; }
  const r = d.id.startsWith("ev-") ? await orgApi("PATCH", "/api/org/events/" + d.id, toServerEvent(d)) : await orgApi("POST", "/api/org/events", toServerEvent(d));
  let ev = replaceLive(r.event);
  // the poster picture goes up after the event exists; a failed upload keeps the event and says so
  if (d._posterNew && d.image && d.image.startsWith("data:")) {
    try { ev = replaceLive((await orgApi("PUT", `/api/org/events/${ev.id}/poster`, { image: d.image })).event); }
    catch (err) { toast(tr("บันทึกงานแล้ว แต่อัปโหลดรูปโปสเตอร์ไม่สำเร็จ: {a}", { a: orgErrText(err) }), "err"); }
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
