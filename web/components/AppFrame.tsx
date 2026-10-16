"use client";
// The app shell from the mock-up: device > [organizer sidebar] + app bar + scrolling screen + tab bar.
// Boots the demo state once, keeps the screen inside the current mode, and reads ?id= into the state.
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { S, useApp, load, ensureOrg, emit, evById, initial, orgEv } from "@/lib/state";
import { bindRouter, go, back, SCREEN_OF } from "@/lib/nav";
import { SheetHost, ToastHost, closeSheet } from "@/lib/ui";
import { loadEvents, checkAuth, openSignup } from "@/lib/buyer";
import { enterOrg, setMode, guardFor, orgTabsFor, orgHomeScreen, ROLE_LABEL, gateClose, callManager, camStop } from "@/lib/org";
import { SPRITE } from "./sprite";

const BUYER_TABS: [string, string, string][] = [["home", "i-home", "หน้าแรก"], ["tickets", "i-ticket", "บัตรเข้าชมของฉัน"], ["market", "i-swap", "การจำหน่ายบัตร"], ["profile", "i-user", "โปรไฟล์ผู้ใช้งาน"]];
const FULL_FLOW = ["checkout", "pay", "minting", "orgWizard", "orgOnboard", "orgWelcome"];
const PURCHASE = ["checkout", "pay", "minting", "success", "paymentSuccess"];
const TITLES: Record<string, string> = { home: "JongLoei", checkout: "ตรวจสอบคำสั่งซื้อ", pay: "ชำระเงิน", minting: "กำลังออกบัตรเข้าชม", success: "ได้รับบัตรแล้ว", paymentSuccess: "สถานะการชำระเงิน",
  tickets: "บัตรเข้าชมของฉัน", market: "ขายต่อ", profile: "โปรไฟล์ผู้ใช้งาน", orgWelcome: "สำหรับผู้จัดงาน", orgOnboard: "ลงทะเบียนผู้จัดงาน", orgTeam: "ทีมงาน", orgDash: "ภาพรวม",
  orgEvents: "งานอีเวนต์ของฉัน", orgGatePick: "จุดปฏิบัติการหน้างาน", orgFinance: "การเงิน" };
function titleOf(screen: string) {
  if (screen === "event") return (evById(S.ev) || {}).name || "อีเวนต์";
  if (screen === "ticket") return S.sel ? (evById(S.sel.ev) || {}).name || "บัตรเข้าชม" : "บัตรเข้าชม";
  if (screen === "orgWizard") return S.org && S.org.draft && orgEv(S.org.draft.id) && orgEv(S.org.draft.id).status !== "draft" ? "แก้ไขข้อมูลอีเวนต์" : "สร้างอีเวนต์ใหม่";
  if (screen === "orgEvent") return (S.org && orgEv(S.org.oev) || {}).name || "อีเวนต์";
  if (screen === "orgGate") return "จุดปฏิบัติการหน้างาน · " + ((S.org && orgEv(S.org.oev) || {}).name || "");
  return TITLES[screen] || "JongLoei";
}
const theme = () => (typeof document !== "undefined" && document.documentElement.dataset.theme === "light" ? "light" : "dark");

// ?id= in the address -> the state the screen reads (deep links and reloads)
function syncId(screen: string) {
  const id = new URLSearchParams(location.search).get("id");
  if (!id) return;
  if (screen === "event" && evById(id) && S.ev !== id) { S.ev = id; S.zone = Math.max(0, evById(id).zones.findIndex((z: any) => z.left > 0)); S.qty = 1; S.promo = null; }
  if (screen === "ticket" && !(S.sel && String(S.sel.key || S.sel.tid) === id)) S.sel = S.tickets.find((t: any) => String(t.key || t.tid) === id) || S.sel;
  if ((screen === "orgEvent" || screen === "orgGate") && S.org && orgEv(id)) S.org.oev = id;
}

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const router = useRouter(), path = usePathname();
  const [booted, setBooted] = useState(false);
  useApp();
  bindRouter(router);
  const screen = SCREEN_OF[path.replace(/\/?$/, "/")] || "home";

  useEffect(() => {
    load(); ensureOrg();
    try { if (localStorage.getItem("jongloei-theme") === "light") document.documentElement.dataset.theme = "light"; } catch (_) {}
    const desk = () => { const d = window.innerWidth >= 900; if (d !== S.desk) { S.desk = d; closeSheet(); emit(); } };
    S.desk = window.innerWidth >= 900; window.addEventListener("resize", desk);
    const leave = (e: BeforeUnloadEvent) => { if (S.org && S.org.wizDirty && SCREEN_OF[location.pathname.replace(/\/?$/, "/")] === "orgWizard") { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", leave);
    setBooted(true); emit();
    loadEvents(true).then(() => { syncId(SCREEN_OF[location.pathname.replace(/\/?$/, "/")] || "home"); emit(); });
    checkAuth();
    return () => { window.removeEventListener("resize", desk); window.removeEventListener("beforeunload", leave); };
  }, []);

  // each new screen: read ?id=, check it belongs to the current mode, start at the top
  const redirect = booted ? guardFor(screen) : null;
  useEffect(() => {
    if (!booted) return;
    syncId(screen);
    const g = guardFor(screen);
    if (g) { go(g, { replace: true }); return; }
    if (screen !== "orgGate") camStop();
    document.getElementById("scroll")?.scrollTo(0, 0);
    document.title = titleOf(screen) === "JongLoei" ? "JONGLOEI ตั๋วงานอีเวนต์" : titleOf(screen) + " · JONGLOEI";
    emit();
  }, [booted, path]);

  if (!booted) return <><Sprite /><div className="stage" id="stage"><div className="devwrap"><div className="device" id="device"><main className="scroll" id="scroll" /></div></div></div></>;

  const org = S.mode === "org";
  const sideOn = org && S.desk && !!S.org.account && !!S.org.shop;
  const tabs = org ? orgTabsFor(S.org.role) : BUYER_TABS;
  const top = org ? [...tabs.map(t => t[0]), "orgTeam", "orgWelcome", "orgOnboard"].includes(screen) : BUYER_TABS.some(t => t[0] === screen) || PURCHASE.includes(screen);
  const tabOf = (s: string) => (org ? (s === "orgEvent" || s === "orgWizard" ? "orgEvents" : s === "orgGate" ? "orgGatePick" : s) : s === "event" ? "home" : s === "ticket" ? "tickets" : s);
  const active = tabOf(screen);
  const brand = (onClick: () => void, label: string) => (
    <button className="brand" onClick={onClick} aria-label={label}><svg aria-hidden="true"><use href="#logo" /></svg><span translate="no">JONGLOEI</span></button>);

  let appbar: React.ReactNode = null;
  if (org) {
    if (!sideOn) appbar = top || S.desk
      ? <>{brand(() => go(orgHomeScreen()), "JONGLOEI ผู้จัดงาน")}<button className="chipbtn" onClick={() => setMode("buyer")}>มุมมองผู้ซื้อ</button></>
      : <><button className="ib" onClick={() => back(tabOf(screen))} aria-label="ย้อนกลับ"><svg><use href="#i-back" /></svg></button><div className="ttl">{titleOf(screen)}</div></>;
  } else if (S.desk) {
    appbar = <>{brand(() => go("home"), "JONGLOEI หน้าแรก")}
      <nav className="dnav" aria-label="เมนูหลัก">{[["home", "หน้าแรก"], ["market", "การจำหน่ายบัตร"], ["tickets", "บัตรเข้าชมของฉัน"]].map(([k, v]) => (
        <button key={k} className={active === k ? "on" : ""} aria-current={active === k ? "page" : undefined} onClick={() => go(k)}>{v}</button>))}</nav>
      <label className="dsearch"><svg aria-hidden="true"><use href="#i-search" /></svg>
        <input id="dq" type="search" autoComplete="off" value={S.q} placeholder="ค้นหาอีเวนต์ ศิลปิน หรือสถานที่" aria-label="ค้นหาอีเวนต์"
          onChange={e => { S.q = e.target.value; emit(); if (screen !== "home") go("home"); }} /></label>
      <button className="lnk" style={{ whiteSpace: "nowrap" }} onClick={enterOrg}>สำหรับผู้จัดงาน</button>
      {S.signedIn ? <button className="avatar" onClick={() => go("profile")} aria-label={"โปรไฟล์ " + S.user.name}>{initial()}</button>
        : <button className="btn" style={{ width: "auto", minHeight: 40, padding: "0 18px", fontSize: 14 }} onClick={() => openSignup()}>เข้าสู่ระบบ</button>}</>;
  } else {
    appbar = top
      ? <>{brand(() => go("home"), "JONGLOEI หน้าแรก")}
        {screen === "home" && <button className="ib" aria-label="ค้นหา" onClick={() => { const q = document.getElementById("q"); if (q) { q.scrollIntoView({ block: "center" }); q.focus(); } }}><svg><use href="#i-search" /></svg></button>}
        {!S.signedIn && <button className="chipbtn" onClick={() => openSignup()}>เข้าสู่ระบบ</button>}</>
      : <><button className="ib" onClick={() => back(tabOf(screen))} aria-label="ย้อนกลับ"><svg><use href="#i-back" /></svg></button><div className="ttl">{titleOf(screen)}</div></>;
  }

  const sideTabs = sideOn ? tabs.concat(S.org.role === "owner" && !S.org.live ? [["orgTeam", "i-user", "ทีมงาน"] as [string, string, string]] : []) : [];
  const r = S.gateResult;
  return (<>
    <Sprite />
    <div className={"stage" + (S.desk ? " desk" : "")} id="stage">
      <div className="devwrap"><div className={"device" + (sideOn ? " org-desk" : "")} id="device" data-theme-mode={theme()}>
        {sideOn && <aside className="side" id="side">
          <span className="side-logo"><svg aria-hidden="true"><use href="#logo-w" /></svg><span translate="no">JONGLOEI</span></span>
          <div className="side-shop"><b>{S.org.shop.name}</b><span>{S.org.shop.verification === "verified" ? "ผ่านการยืนยันร้านค้า" : "รอการตรวจสอบตัวตน"}{S.org.role !== "owner" ? " · " + ROLE_LABEL[S.org.role] : ""}</span></div>
          <nav className="side-nav" aria-label="เมนูผู้จัดการอีเวนต์">{sideTabs.map(([k, icon, v]) => (
            <button key={k} aria-current={active === k ? "page" : undefined} onClick={() => { closeSheet(); go(k); }}><svg aria-hidden="true"><use href={"#" + icon} /></svg>{v}</button>))}</nav>
          <button className="side-back" onClick={() => setMode("buyer")}><svg aria-hidden="true"><use href="#i-back" /></svg>กลับสู่มุมมองผู้ซื้อ</button>
        </aside>}
        {!sideOn && <header className="appbar" id="appbar">{appbar}</header>}
        <main className="scroll" id="scroll">{redirect ? null : <div className="screen v2" key={path}>{children}</div>}</main>
        {!FULL_FLOW.includes(screen) && <nav className="tabbar" id="tabbar" style={{ gridTemplateColumns: `repeat(${tabs.length},1fr)` }} aria-label="เมนู">
          {tabs.map(([k, icon, label]) => (
            <button key={k} className={active === k ? "on" : ""} aria-current={active === k ? "page" : undefined} onClick={() => { closeSheet(); go(k); }}><svg><use href={"#" + icon} /></svg>{label}</button>))}
        </nav>}
        {r && <div className={"org-result " + (r.valid ? "ok" : "bad")} role="alertdialog" aria-live="assertive" aria-label={r.valid ? "ผ่านการตรวจสอบ" : "ไม่ผ่านการตรวจสอบ"}>
          <span className="ric"><svg width="72" height="72" aria-hidden="true"><use href={r.valid ? "#i-check" : "#i-x"} /></svg></span>
          <b className="rtitle">{r.valid ? "ผ่านการตรวจสอบ" : "ไม่ผ่านการตรวจสอบ"}</b>
          {r.zone && <span className="rzone">{r.zone}</span>}
          <p className="rtext">{r.text}</p>
          {r.valid ? <span style={{ fontSize: 14, opacity: 0.85 }}>ซ่อนอัตโนมัติใน 2 วินาที</span>
            : <div className="racts"><button className="btn" style={{ background: "#fff", color: "var(--danger-solid)", minHeight: 64, fontSize: 18, borderRadius: 12 }} onClick={callManager}>ติดต่อผู้จัดการ</button>
              <button className="btn" style={{ background: "transparent", color: "#fff", boxShadow: "inset 0 0 0 1.5px rgb(255 255 255 / .8)" }} onClick={gateClose} autoFocus>สแกนรายการถัดไป</button></div>}
        </div>}
        <SheetHost />
        <ToastHost />
      </div></div>
    </div>
  </>);
}

function Sprite() {
  return <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true"><defs dangerouslySetInnerHTML={{ __html: SPRITE }} /></svg>;
}
