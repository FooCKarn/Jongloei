"use client";
// Buyer screens, ported from the mock-up's VIEWS (same class names and copy).
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { S, EV, emit, fmt, short, isLocal, evById, minPrice, initial } from "@/lib/state";
import { go, back } from "@/lib/nav";
import { toast, mockToast } from "@/lib/ui";
import { openEvent, buyUnit, buyTotal, startBuy, buyListing, toPay, paid, applyPromo, finishMint, openTicket, unlistTicket, simulateDoorScan,
  marketListings, copyWallet, toggleTheme, logout, filteredEvents, filtersActive, clearFilters, openFilter, PRICE_OPTS, TIME_OPTS, openSignup,
  openResell, openTransfer, openReset, openRules, loadMyTickets, startStripeCheckout } from "@/lib/buyer";
import { enterOrg, ticketAnnouncements } from "@/lib/org";
import { Icon, Thumb, Pst, ZChip, TkPill, TitleRow, Crumb, NftCard, OkCircle, EntryQR, posterStyle, imgCls } from "../bits";
import { OL } from "@/lib/state";

const STR = "repeating-linear-gradient(135deg,rgb(255 255 255 / .07) 0 2px,transparent 2px 14px),";
const CATS = ["ทั้งหมด", "คอนเสิร์ต", "เทศกาลดนตรี", "แฟนมีตติ้ง", "สแตนด์อัปคอมเมดี", "ปาร์ตี้สังสรรค์", "workshop"];
const lines = (s: string) => String(s || "").split("\n").join(" ");

/* ---------- home ---------- */
export function Home() {
  const found = filteredEvents(), filtered = filtersActive();
  const slides = [null as any].concat(EV.all.slice(0, 3));
  const i = (((S.slide || 0) % slides.length) + slides.length) % slides.length, cur = slides[i];
  const setSlide = (n: number) => { S.slide = n; emit(); };
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) { S.slide = (S.slide || 0) + 1; emit(); } }, 7000); return () => clearInterval(t); }, []);
  const scrollTo = () => document.getElementById("onsale")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const fl = (k: "price" | "place" | "time") => {
    const v = k === "price" ? S.fprice : k === "time" ? S.ftime : S.fplace, on = v && v !== "all";
    const label = !on ? { price: "ช่วงราคา", place: "สถานที่จัดงาน", time: "เวลาจัดงาน" }[k] : k === "price" ? PRICE_OPTS.find(o => o[0] === v)![1] : k === "time" ? TIME_OPTS.find(o => o[0] === v)![1] : v;
    return <button key={k} type="button" aria-haspopup="dialog" className={on ? "on" : ""} aria-pressed={!!on} onClick={() => openFilter(k)}>{label}<Icon id="i-down" /></button>;
  };
  const heroBg = cur ? (cur.image ? `linear-gradient(to top, rgb(0 0 0 / .6), rgb(0 0 0 / .1)), url("${cur.image}") center / cover` : STR + cur.bg) : STR + "linear-gradient(135deg,#C2001F,#7E0013 55%,#2A0A0D)";
  return (<>
    <h1 className="sr-only">JONGLOEI บัตรเข้าร่วมงานอีเวนต์</h1>
    <section className="hero" aria-roledescription="carousel" aria-label="แบนเนอร์ประชาสัมพันธ์" style={{ "--hbg": heroBg } as any}>
      {cur ? <>
        {!cur.image && <span className="mark" aria-hidden="true" translate="no">{cur.short}</span>}
        <div className="hero-in ev"><span className="date num">{cur.date}</span><h2>{cur.name}</h2><p className="num">{cur.date} · {cur.time} · {cur.venue}</p>
          <button className="cta num" onClick={() => openEvent(cur.id)}>ซื้อตั๋ว เริ่มต้น {fmt(minPrice(cur))}<Icon id="i-arrow" /></button></div></>
        : <div className="hero-in"><h2>บัตรเข้าร่วมงานที่ปลอดภัย ป้องกันการปลอมแปลง พร้อมระบบซื้อขายต่อที่เป็นธรรม</h2><p>ชำระเงินสะดวกผ่าน PromptPay ไม่มีค่าธรรมเนียม พร้อมระบบคืนเงินอัตโนมัติเต็มจำนวนหากมีการยกเลิกงาน และควบคุมเพดานราคาขายต่อในระบบไม่เกิน 125%</p>
          <button className="cta" onClick={scrollTo}>ดูอีเวนต์ทั้งหมด<Icon id="i-arrow" /></button></div>}
      <div className="hero-ctl"><button className="arw l" onClick={() => setSlide(i - 1)} aria-label="สไลด์ก่อนหน้า"><svg><use href="#i-back" /></svg></button>
        <div className="dots" role="group" aria-label="เลือกสไลด์">{slides.map((s, k) => (
          <button key={k} onClick={() => setSlide(k)} aria-pressed={k === i} aria-label={k ? "สไลด์ " + (k + 1) + ": " + s.name : "สไลด์ 1: แนะนำแพลตฟอร์ม"}><span /></button>))}</div>
        <button className="arw r" onClick={() => setSlide(i + 1)} aria-label="สไลด์ถัดไป"><svg><use href="#i-next" /></svg></button></div>
    </section>
    <div className="wrap">
      <form className="hsearch" role="search" onSubmit={e => { e.preventDefault(); scrollTo(); }}>
        <label><Icon id="i-search" /><input id="q" type="search" autoComplete="off" value={S.q} onChange={e => { S.q = e.target.value; emit(); }} placeholder="ค้นหาอีเวนต์ ศิลปิน หรือสถานที่" aria-label="ค้นหาอีเวนต์" /></label>
        <div className="flt">{fl("price")}{fl("place")}{fl("time")}</div>
        <button type="submit" className="go">ค้นหา</button></form>
      <section id="onsale" aria-labelledby="h-onsale" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="secthead"><h2 id="h-onsale" className="h2" aria-live="polite">{filtered ? "พบ " + found.length + " รายการอีเวนต์" : "อีเวนต์ที่เปิดจำหน่าย"}</h2>{filtered && <button className="lnk" onClick={clearFilters}>ล้างตัวกรอง</button>}</div>
        <div className="chips" role="group" aria-label="ประเภทอีเวนต์">{CATS.map(c => (
          <button key={c} className={"chip " + (S.cat === c ? "on" : "")} aria-pressed={S.cat === c} onClick={() => { S.cat = c; emit(); }}>{c}</button>))}</div>
        {found.length ? <div className="evgrid">{found.map(e => (
          <button key={e.id} className="evc" onClick={() => openEvent(e.id)}>
            <Pst e={e}><div className="tags"><span className="tag">{e.tag}</span>{e.paused ? <span className="tag grey">ระงับการจำหน่ายชั่วคราว</span> : e.sold >= 95 ? <span className="tag warn">ใกล้จำหน่ายหมด</span> : e.sold >= 85 ? <span className="tag red">จำหน่ายรวดเร็ว</span> : null}</div></Pst>
            <div className="body"><div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}><h3>{e.name}</h3><span className="meta num">{e.date} · {e.time}</span><span className="meta">{e.venue}</span></div>
              <div className="from"><small>เริ่มต้น</small><b className="num">{fmt(minPrice(e))}</b></div></div></button>))}</div>
          : <div className="empty">ไม่พบอีเวนต์ที่ตรงกับเงื่อนไขการค้นหา กรุณาลองใหม่อีกครั้ง หรือ<button className="linkbtn" onClick={clearFilters}>ล้างตัวกรอง</button></div>}
      </section>
      <div className="card row between d-hide" style={{ gap: 12 }}><div className="small"><b>ต้องการจัดอีเวนต์ของคุณเองใช่หรือไม่?</b><br /><span className="muted">เปิดจำหน่ายบัตรโดยไม่ต้องตรวจสอบสลิปการโอนเงิน</span></div>
        <button className="btn ghost" style={{ width: "auto", padding: "10px 14px", fontSize: 14 }} onClick={enterOrg}>สำหรับผู้จัดงาน</button></div>
    </div>
    <footer className="foot"><div className="in">
      <div><b translate="no" style={{ fontFamily: "var(--f-display)", fontSize: 18, letterSpacing: ".04em" }}>JONGLOEI</b><span>บัตรเข้าร่วมงานที่ปลอดภัย ป้องกันการปลอมแปลง พร้อมระบบซื้อขายต่อที่เป็นธรรม</span></div>
      <div><b>ผู้ซื้อ</b><button onClick={scrollTo}>วิธีการสั่งซื้อบัตร</button><button onClick={openRules}>เงื่อนไขขายต่อ</button></div>
      <div><b>ผู้จัดงาน</b><button onClick={enterOrg}>เริ่มจำหน่ายบัตร</button><button onClick={enterOrg}>ค่าธรรมเนียมบริการ</button></div>
      <div><b>ศูนย์ช่วยเหลือ</b><button onClick={() => mockToast("ระบบได้รับข้อความของท่านเรียบร้อยแล้ว ทีมงานจะติดต่อกลับทางอีเมล")}>ติดต่อเรา</button><button onClick={() => toast("หน้านโยบายความเป็นส่วนตัวจะเปิดให้บริการพร้อมระบบเวอร์ชันสมบูรณ์")}>นโยบายความเป็นส่วนตัว</button></div>
    </div></footer>
  </>);
}

/* ---------- event detail ---------- */
export function EventScreen() {
  const e = evById(S.ev);
  if (!e) return <div className="wrap"><div className="empty">ไม่พบข้อมูลอีเวนต์นี้ <button className="linkbtn" onClick={() => go("home")}>กลับหน้าแรก</button></div></div>;
  const z = e.zones[S.zone] || e.zones[0];
  const owned = S.tickets.filter((t: any) => t.ev === e.id).length, cap = Math.max(0, 4 - owned);
  const qty = Math.min(S.qty, Math.max(1, cap));
  const local = isLocal(e.id), sub = z.p * qty, fee = local ? 0 : Math.round(sub * 0.03);
  const off = cap === 0 || z.left <= 0 || e.paused;
  const cta = e.paused ? "ระงับการจำหน่ายชั่วคราว" : cap === 0 ? "ครบกำหนดจำกัดสูงสุด 4 ใบต่อบัญชี" : z.left <= 0 ? "บัตรโซนนี้จำหน่ายหมดแล้ว" : "ดำเนินการชำระเงิน";
  const setQty = (d: number) => { S.qty = Math.max(1, Math.min(cap, qty + d)); emit(); };
  const zones = (<><div className="zrows" role="radiogroup" aria-label="เลือกโซนที่ต้องการ">{e.zones.map((zz: any, i: number) => {
    const on = i === S.zone && zz.left > 0 && !e.paused;
    return (<button key={zz.z} className="zr" role="radio" aria-checked={on} disabled={zz.left === 0 || e.paused} onClick={() => { S.zone = i; S.promo = null; emit(); }}>
      <span className="box">{on && <svg><use href="#i-check" /></svg>}</span>
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}><b>{zz.z}</b><span className="left num">{zz.left === 0 ? "บัตรจำหน่ายหมดแล้ว กรุณาตรวจสอบในตลาดซื้อขายต่อ" : "เหลือ " + zz.left + " ที่นั่ง"}</span></span>
      <span className="pr num">{fmt(zz.p)}</span></button>);
  })}</div>
    {e.zones.some((x: any) => x.left === 0) && <button className="lnk" style={{ alignSelf: "flex-start" }} onClick={() => { S.mcat = e.id; emit(); go("market"); }}>บางโซนจำหน่ายหมดแล้ว ท่านสามารถตรวจสอบบัตรซื้อขายต่อสำหรับอีเวนต์นี้ได้</button>}</>);
  const about = e.desc || e.description || `${e.name} ณ ${e.venue} ประตูเปิดก่อนเวลาเริ่มการแสดง 1 ชั่วโมง กรุณาแสดง QR Code ในแอปพลิเคชันบริเวณทางเข้า บัตรสามารถโอนหรือขายต่อได้ภายในแอปพลิเคชันเท่านั้น`;
  return (<>
    <div className="wrap">
      <Crumb label="หน้าแรก" fallback="home" />
      <div className="dgrid">
        <div className="dcol">
          <Pst e={e} cls="dposter"><div className="tags" style={{ display: "flex", gap: 6 }}><span className="tag">{e.tag}</span></div></Pst>
          <div className="dinfo"><h1>{e.name}</h1><ul>
            <li className="num"><Icon id="i-cal" /><span>{e.date} · {e.time} น.</span></li>
            <li><Icon id="i-pin" /><span>{e.venue}</span></li>
            {e.org && <li><Icon id="i-store" /><span>จัดโดย {e.org} · ยืนยันร้านแล้ว</span></li>}
          </ul></div>
          {e.paused && <div className="alert" role="status"><Icon id="i-info" /><div><b>ระงับการจำหน่ายชั่วคราว</b><br />ผู้จัดงานระงับการจำหน่ายชั่วคราวสำหรับอีเวนต์นี้ แต่บัตรที่ซื้อไปแล้วยังคงใช้งานได้ตามปกติ</div></div>}
          <section className="trust2" aria-label="จุดเด่นของบริการเรา">
            <div><Icon id="i-shield" /><div><b>ป้องกันการปลอมแปลง 100%</b><p>ตรวจสอบความเป็นเจ้าของได้โปร่งใส</p></div></div>
            <div><Icon id="i-swap" /><div><b>ควบคุมราคาขายต่อไม่เกิน 1.25 เท่า</b><p><button className="lnk" style={{ fontSize: 13 }} onClick={openRules}>อ่านเงื่อนไขขายต่อ</button></p></div></div>
            <div><Icon id="i-refund" /><div><b>ระบบยกเลิกและคืนเงินอัตโนมัติกรณีอีเวนต์ยกเลิก</b><p>รับเงินคืนเต็มจำนวนตามยอดที่ชำระจริง</p></div></div>
            <div><Icon id="i-qrpay" /><div><b>รองรับการชำระผ่าน PromptPay</b><p>สะดวก รวดเร็ว ไม่ต้องส่งสลิปหลักฐานการโอน</p></div></div>
          </section>
          <section aria-labelledby="h-about" style={{ display: "flex", flexDirection: "column", gap: 8 }}><h2 id="h-about" className="h2">รายละเอียดอีเวนต์</h2><p className="muted" style={{ margin: 0, fontSize: 15 }}>{about}</p></section>
          <section className="vstack d-hide" aria-labelledby="h-zones-m"><h2 id="h-zones-m" className="h2">เลือกโซนที่ต้องการ</h2>{zones}</section>
        </div>
        <aside className="panel sticky" aria-label="สรุปรายการคำสั่งซื้อ">
          <section className="vstack m-hide"><h2 style={{ fontSize: 18 }}>เลือกโซนที่ต้องการ</h2>{zones}</section>
          <div className="vstack d-hide" style={{ gap: 2 }}><span className="small muted">โซนที่เลือก</span><b style={{ fontFamily: "var(--f-display)", fontSize: 18 }}>{z.left > 0 ? z.z : "—"}</b></div>
          <div className="qtyrow"><div style={{ display: "flex", flexDirection: "column" }}><span style={{ fontWeight: 500 }}>จำนวน</span><span className="small muted num">{owned ? "มีอยู่ในครอบครองแล้ว " + owned + " ใบ · " : ""}ซื้อได้อีก {cap} ใบ (ไม่เกิน 4 ใบต่อคน)</span></div>
            <div className="stepper"><button onClick={() => setQty(-1)} aria-label="ลดจำนวนลง" disabled={qty <= 1}><svg width="18" height="18"><use href="#i-minus" /></svg></button><output className="num" aria-live="polite">{qty}</output>
              <button onClick={() => setQty(1)} aria-label="เพิ่มจำนวนขึ้น" disabled={qty >= cap}><svg width="18" height="18"><use href="#i-plus" /></svg></button></div></div>
          <dl className="sum num"><dt>{z.z} × {qty}</dt><dd>{fmt(sub)}</dd><dt>ค่าบริการ{local ? "" : " 3%"}</dt><dd>{fmt(fee)}</dd><dt>ค่าธรรมเนียมเครือข่าย</dt><dd>ไม่มีค่าใช้จ่าย</dd><dt className="tot">ยอดรวมทั้งสิ้น</dt><dd>{fmt(sub + fee)}</dd></dl>
          <button className="bigbtn m-hide" onClick={() => { S.qty = qty; startBuy(); }} disabled={off}>{cta}{!off && <Icon id="i-arrow" />}</button>
          <p className="small muted" style={{ margin: 0 }}>ระบบสำรองที่นั่งให้ท่านเป็นเวลา 10 นาทีภายหลังกดทำรายการชำระเงิน</p>
        </aside>
      </div></div>
    <div className="buybar"><div className="t"><span>รวม {qty} ใบ</span><b className="num">{fmt(sub + fee)}</b></div><button className="bigbtn" onClick={() => { S.qty = qty; startBuy(); }} disabled={off} style={{ flex: 1 }}>{cta}</button></div>
  </>);
}

/* ---------- purchase flow ---------- */
function purchase() {
  const L = S.buyingListing, e = evById(L ? L.ev : S.ev);
  if (!e) return null;
  const zone = L ? L.zone : e.zones[S.zone].z, qty = L ? 1 : S.qty, local = isLocal(e.id), face = L ? L.price : e.zones[S.zone].p;
  const sub = L ? L.price : buyTotal(e), fee = local || L ? 0 : Math.round(sub * 0.03);   // organizer events: the shop pays the fee; resale: the seller pays 6%
  return { L, e, zone, qty, local, face, sub, fee, total: sub + fee, disc: face * qty - sub };
}
export function Checkout() {
  const p = purchase(); const [code, setCode] = useState(S.promo && S.promo.ev === S.ev ? S.promo.code : ""), [msg, setMsg] = useState("");
  if (!p) return <div className="wrap narrow-w"><div className="empty">ยังไม่ได้เลือกบัตรเข้าชม <button className="linkbtn" onClick={() => go("home")}>เลือกอีเวนต์</button></div></div>;
  const { L, e, zone, qty, local, face, sub, fee, disc } = p;
  return (<div className="wrap narrow-w">
    <TitleRow title="ตรวจสอบความถูกต้องของคำสั่งซื้อ" fallback="event" />
    <section className="ocard" aria-label="รายการสินค้าที่สั่งซื้อ"><Thumb e={e} />
      <div className="info"><b>{e.name}</b><span className="num muted">{e.date} · {e.time} น.</span><span className="muted">{e.venue}</span><span className="num">จำนวน {qty} ใบ</span>{L && <span className="pill info" style={{ alignSelf: "flex-start", marginTop: 4 }}>ตลาดซื้อขายต่อบัตร</span>}</div>
      <ZChip e={e} name={zone} /></section>
    <section className="sect"><h2>ช่องทางชำระเงิน</h2>
      {local ? <button className="payopt" aria-pressed="true"><span className="lg">QR</span><span><b>PromptPay</b> <span className="pill warn">ระบบจำลองการทำรายการ</span><br /><span className="small muted">อีเวนต์ตัวอย่างจากผู้จัดงานในระบบทดลอง ไม่มีการหักเงินจริง</span></span><span className="rd" /></button>
        : <button className="payopt" aria-pressed="true"><span className="lg">STRIPE</span><span><b>Stripe Checkout</b>{!S.auth.google && <> <span className="pill warn">ระบบจำลองการทำรายการ</span></>}<br /><span className="small muted">{S.auth.google ? "ชำระผ่าน PromptPay หรือบัตรเครดิตผ่านหน้าต่าง Stripe" : "เครื่องนี้ยังไม่ได้เชื่อมต่อระบบ Stripe ระบบจะใช้การจำลองการชำระเงินแทน"}</span></span><span className="rd" /></button>}
    </section>
    {local && !L && <div className="field"><label htmlFor="promo-input">รหัสส่วนลดโปรโมชัน</label><div className="row"><input id="promo-input" value={code} onChange={x => setCode(x.target.value)} autoComplete="off" style={{ flex: 1 }} aria-describedby="promo-msg" />
      <button className="btn plain" style={{ width: "auto", padding: "10px 14px", fontSize: 14 }} onClick={() => setMsg(applyPromo(code))}>ใช้รหัสส่วนลด</button></div>
      <span className={"hint" + (msg ? " err" : "")} id="promo-msg" role="status">{msg || (S.promo && S.promo.ev === e.id ? S.promo.msg : "")}</span></div>}
    <dl className="sum num" style={{ padding: 16, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--line-soft)" }}>
      <dt>ราคาบัตร {qty} ใบ</dt><dd>{fmt(face * qty)}</dd>{disc > 0 && <><dt className="disc">ส่วนลดที่ได้รับ</dt><dd>−{fmt(disc)}</dd></>}
      <dt>ค่าบริการ{local || L ? "" : " 3%"}</dt><dd>{L ? "ไม่มีค่าใช้จ่ายเพิ่มเติม (ผู้ขายเป็นผู้รับผิดชอบค่าคอมมิชชัน)" : fmt(fee)}</dd><dt>ค่าธรรมเนียมเครือข่าย</dt><dd>ไม่มีค่าใช้จ่าย</dd><dt className="tot">ยอดชำระสุทธิ</dt><dd>{fmt(sub + fee)}</dd></dl>
    <button className="bigbtn" onClick={toPay} disabled={S.paying}>{S.paying ? "กำลังเชื่อมต่อระบบ Stripe…" : "ดำเนินการชำระเงิน"}</button>
    <p className="note">(ภายหลังกดทำรายการ ระบบจะสำรองที่นั่งให้ 10 นาที โดยยังไม่มีการหักยอดเงินทันที)</p>
  </div>);
}
export function Pay() {
  const p = purchase();
  const [left, setLeft] = useState(600), [seed, setSeed] = useState(() => "pp" + Date.now());
  useEffect(() => { const t = setInterval(() => setLeft(s => Math.max(0, s - 1)), 1000); return () => clearInterval(t); }, [seed]);
  if (!p) return <div className="wrap narrow-w"><div className="empty">ยังไม่ได้เลือกตั๋ว <button className="linkbtn" onClick={() => go("home")}>เลือกอีเวนต์</button></div></div>;
  const { e, zone, qty, total, local } = p;
  return (<div className="wrap narrow-w ctr">
    <TitleRow title="ดำเนินการชำระเงิน" fallback="checkout" />
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><p style={{ margin: 0, fontSize: 15 }}>ระบบได้ทำการสำรองที่นั่งให้ท่านเรียบร้อยแล้ว</p>
      <p className="cd">{left > 0 ? <>เหลือ <b className="num">{String(Math.floor(left / 60)).padStart(2, "0")}:{String(left % 60).padStart(2, "0")}</b> กรุณาดำเนินการก่อนหมดเวลา</> : <b>หมดอายุ</b>}</p></div>
    <div className="qrcard"><div className="tqr"><span>THAI QR PAYMENT</span><span>PromptPay</span></div>
      <QRCodeSVG value={seed} size={200} marginSize={1} role="img" aria-label="ตัวอย่าง QR Code PromptPay" style={{ width: 200, height: 200, opacity: left > 0 ? 1 : 0.25 }} />
      <div style={{ lineHeight: 1.3 }}><div style={{ fontSize: 13, color: "#6E6265" }}>บริษัท จองเลย จำกัด (ตัวอย่าง)</div><div className="amt num">{fmt(total)}</div></div></div>
    <dl className="rows num"><dt style={{ fontWeight: 600 }}>{e.name}</dt><dd style={{ fontWeight: 600 }}>{fmt(total)}</dd><dt>ที่นั่ง {zone}</dt><dd>จำนวน {qty} ใบ</dd></dl>
    <p className="small muted" style={{ margin: 0 }}>เปิดแอปพลิเคชันธนาคารและสแกน QR Code ยอดเงินจะปรากฏอัตโนมัติ ไม่จำเป็นต้องจัดส่งสลิปหลักฐาน</p>
    <div className="btncol">{left <= 0 ? <button className="bigbtn" onClick={() => { setSeed("pp" + Date.now()); setLeft(600); toast("สร้าง QR Code ชุดใหม่เรียบร้อย ขยายเวลาสำรองที่นั่งออกไปอีก 10 นาที", "ok"); }}>สร้าง QR Code ใหม่</button>
      : <button className="bigbtn" onClick={paid}>{local ? "จำลองการชำระเงิน (ระบบทดลอง)" : "ชำระผ่านระบบ Stripe"}</button>}
      <button className="bigbtn plain" onClick={() => back("checkout")}>ยกเลิก</button></div>
  </div>);
}
export function Minting() {
  const pp = isLocal(S.buyingListing ? S.buyingListing.ev : S.ev);
  const [i, setI] = useState(0);
  useEffect(() => { let k = 0; const t = setInterval(() => { k++; setI(k); if (k >= 4) { clearInterval(t); finishMint(); } }, 1100); return () => clearInterval(t); }, []);
  const st = (n: number) => (n < i ? "done" : n === i ? "active" : "");
  const steps: [string, string][] = [[pp ? "ได้รับการชำระเงินผ่านระบบ PromptPay" : "ได้รับการชำระเงินผ่านระบบ Stripe", pp ? "ผู้ให้บริการรับชำระเงินแจ้งยอดเรียบร้อยแล้ว (จำลอง)" : "ระบบได้รับการยืนยันสถานะจาก Stripe (จำลอง)"],
    ["ตรวจยอดเงิน", pp ? "ตรวจสอบยอดเงิน หมายเลขอ้างอิง และอายุคำสั่งซื้อ" : "ตรวจสอบรายการลงนามที่ถูกต้องและไม่ซ้ำซ้อน"], ["ออกบัตรเข้าชมบนเทคโนโลยีบล็อกเชน", "ออกบัตรเข้าชมที่ปลอดภัยและล็อกที่นั่งให้ท่าน"], ["โอนเข้าสู่บัญชีผู้ใช้งานของท่าน", short(S.user.wallet)]];
  return (<div className="wrap narrow-w ctr">
    <span className="pill ok">การชำระเงินสำเร็จ (ระบบจำลอง)</span>
    <h1 className="ftitle">กำลังออกบัตรเข้าชม</h1><p className="muted" style={{ margin: 0 }}>กรุณาอย่าปิดหน้าต่างนี้ กระบวนการใช้เวลาไม่เกิน 1 นาที</p>
    <ol className="steps" aria-live="polite">{steps.map(([b, s], n) => <li key={b} className={st(n)}><span className="s"><svg><use href="#i-check" /></svg></span><span><b>{b}</b><small className={n === 3 ? "mono" : ""}>{s}</small></span></li>)}</ol>
  </div>);
}
export function Success() {
  const t = S.sel;
  if (!t) return <div className="wrap narrow-w"><div className="empty">ไม่พบข้อมูลบัตรเข้าชม <button className="linkbtn" onClick={() => go("tickets")}>ไปที่บัตรเข้าชมของฉัน</button></div></div>;
  return (<div className="wrap narrow-w ctr">
    <OkCircle />
    <h1 className="ftitle">ได้รับบัตรเข้าชมสำเร็จ</h1><p className="muted" style={{ margin: 0 }}>บัตรเข้าชมถูกจัดเก็บในบัญชีของท่านแล้ว สามารถใช้ QR Code ในเมนูบัตรเข้าชมเพื่อเข้างาน</p>
    <NftCard t={t} />
    <div className="btncol row2"><button className="bigbtn" onClick={() => openTicket(t)}>ดูบัตรเข้าชมและ QR Code สำหรับเข้างาน</button><button className="bigbtn plain" onClick={() => go("home")}>กลับหน้าแรก</button></div>
  </div>);
}
const ORDER_TEXT: Record<string, any> = {
  pending: { title: "กำลังยืนยันผลการชำระเงิน", sub: "รอผลการชำระเงินจากระบบ Stripe", pill: "warn", label: "รอการยืนยัน", note: "ระบบตรวจสอบยอดเงินกับ Stripe โดยตรง ไม่ต้องจัดส่งสลิป" },
  paid: { title: "การชำระเงินสำเร็จสมบูรณ์", sub: "ตรวจสอบยอดเงินกับ Stripe เรียบร้อยแล้ว", pill: "ok", label: "กำลังออกบัตรเข้าชม", note: "กำลังออกบัตรเข้าสู่บัญชีของท่าน ใช้เวลาดำเนินการประมาณ 1 นาที" },
  fulfilled: { title: "ได้รับบัตรเข้าชมสำเร็จ", sub: "บัตรเข้าชมอยู่ในบัญชีผู้ใช้งานของท่านแล้ว", pill: "ok", label: "ออกบัตรสำเร็จ", note: "ตรวจสอบบัตรเข้าชมและ QR Code ได้ที่เมนูบัตรเข้าชมของฉัน" },
  needs_review: { title: "ทีมงานกำลังตรวจสอบความถูกต้องของรายการ", sub: "ได้รับการชำระเงินแล้ว แต่รายการนี้จำเป็นต้องตรวจสอบเพิ่มเติม", pill: "warn", label: "อยู่ระหว่างรอการตรวจสอบ", note: "กรณีชำระเงินเกินกำหนดเวลาสำรองที่นั่ง ทีมงานจะดำเนินการออกบัตรหรือคืนเงินให้ตามขั้นตอน" },
  expired: { title: "หมดเวลาสำรองที่นั่ง", sub: "ยังไม่มีการหักยอดเงิน", pill: "grey", label: "หมดเวลาทำรายการ", note: "คืนที่นั่งสู่ระบบเรียบร้อยแล้ว ท่านสามารถทำรายการสั่งซื้อใหม่อีกครั้ง" },
  failed: { title: "การชำระเงินทำรายการไม่สำเร็จ", sub: "ยังไม่มีการหักยอดเงิน", pill: "grey", label: "ทำรายการไม่สำเร็จ", note: "คืนที่นั่งสู่ระบบเรียบร้อยแล้ว ท่านสามารถทำรายการสั่งซื้อใหม่อีกครั้ง" },
};
export function PaymentSuccess() {
  const key = S.order && S.order.status, st = ORDER_TEXT[key] || ORDER_TEXT.pending, ok = key === "fulfilled" || key === "paid";
  return (<div className="wrap narrow-w ctr">
    {ok ? <OkCircle /> : <span className="okc" aria-hidden="true" style={{ background: `var(--${st.pill === "warn" ? "warn" : "neutral"}-solid)`, animation: "none" }}><svg width="38" height="38"><use href="#i-info" /></svg></span>}
    <h1 className="ftitle">{st.title}</h1><p className="muted" style={{ margin: 0 }}>{st.sub}</p>
    <div className="rows" style={{ display: "flex", flexDirection: "column", gap: 8 }}><div className="row between"><span>สถานะคำสั่งซื้อ</span><span className={"pill " + st.pill} role="status">{st.label}</span></div><p className="small muted" style={{ margin: 0 }}>{st.note}</p></div>
    <div className="btncol row2"><button className="bigbtn" onClick={() => go("tickets")}>ไปที่บัตรเข้าชมของฉัน</button><button className="bigbtn plain" onClick={() => go("home")}>กลับหน้าแรก</button></div>
  </div>);
}

/* ---------- tickets ---------- */
function SignInFirst({ title, sub }: { title: string; sub: string }) {
  return (<div className="wrap narrow-w ctr" style={{ paddingTop: 56 }}><span className="okc" style={{ background: "var(--surface-2)", color: "var(--muted)", animation: "none" }} aria-hidden="true"><svg width="34" height="34"><use href="#i-ticket" /></svg></span>
    <h1 className="h2">{title}</h1><p className="muted" style={{ margin: 0 }}>{sub}</p><button className="bigbtn" onClick={() => openSignup()} style={{ maxWidth: 320 }}>เข้าสู่ระบบ</button></div>);
}
export function Tickets() {
  if (!S.signedIn) return <SignInFirst title="เข้าสู่ระบบเพื่อตรวจสอบบัตรเข้าชม" sub="ใช้บัญชี Google เพียงบัญชีเดียว จัดเก็บบัตรได้ครบทุกอุปกรณ์" />;
  const groups: Record<string, string> = { active: "สถานะพร้อมใช้งาน", listed: "กำลังลงประกาศขายต่อ", used: "ผ่านการใช้งานแล้ว", refunded: "ดำเนินการคืนเงินแล้ว" };
  const list = S.tickets.filter((t: any) => t.status === S.mtab);
  return (<div className="wrap">
    <div className="row between"><h1 className="ftitle">บัตรเข้าชมของฉัน</h1>{S.auth.google && <button className="lnk" onClick={() => { loadMyTickets(); toast("กำลังโหลดข้อมูลบัตรล่าสุด"); }}>โหลดข้อมูลใหม่</button>}</div>
    <div className="chips" role="group" aria-label="สถานะบัตรเข้าชม">{Object.entries(groups).map(([k, v]) => (
      <button key={k} className={"chip " + (S.mtab === k ? "on" : "")} aria-pressed={S.mtab === k} onClick={() => { S.mtab = k; emit(); }}>{v} <span className="num">{S.tickets.filter((t: any) => t.status === k).length}</span></button>))}</div>
    {list.length ? <div className="tklist">{list.map((t: any) => { const e = evById(t.ev) || { name: "—", short: "", bg: "", date: "", time: "", zones: [] }; return (
      <button key={t.key || t.tid} className="tk" onClick={() => openTicket(t)}><Thumb e={e} />
        <div className="info"><h3>{e.name}</h3><span className="meta num">{e.date} · {e.time} น.</span><span><ZChip e={e} name={t.zone} /></span></div><TkPill t={t} /></button>); })}</div>
      : <div className="empty">{S.mtab === "active" ? "ยังไม่มีบัตรเข้าชม บัตรที่ท่านซื้อหรือได้รับโอนจะแสดงผล ณ ที่นี้ พร้อม QR Code สำหรับเข้างาน" : "ไม่พบบัตรเข้าชมในหมวดหมู่นี้"}
        {S.mtab === "active" && <><br /><br /><button className="btn" onClick={() => go("home")} style={{ maxWidth: 280, margin: "0 auto" }}>ดูอีเวนต์ทั้งหมด</button></>}</div>}
    <p className="small muted" style={{ margin: 0 }}>บัตรทุกใบจัดเก็บปลอดภัยในบัญชีที่ระบบสร้างให้โดยอัตโนมัติ ไม่จำเป็นต้องจำรหัสกู้คืนหรือชำระค่าธรรมเนียมเครือข่ายเอง</p>
  </div>);
}
export function Ticket() {
  const t = S.sel, e = t && evById(t.ev);
  if (!t || !e) return <div className="wrap"><div className="empty">ไม่พบข้อมูลบัตรเข้าชมนี้ <button className="linkbtn" onClick={() => go("tickets")}>ไปที่บัตรเข้าชมของฉัน</button></div></div>;
  const locked = t.status !== "active" || t.minting || t.failed, ann = ticketAnnouncements(t);
  const qr = t.minting || t.failed ? <div className="qrstate">{t.minting ? <>กำลังดำเนินการออกบัตรบนบล็อกเชน<br />QR Code จะแสดงผลเมื่อกระบวนการออกบัตรเสร็จสิ้น</> : <>พบข้อขัดข้องในการออกบัตรเข้าชม<br />ทีมงานกำลังตรวจสอบข้อมูล</>}</div>
    : t.status === "refunded" ? <div className="qrstate" style={{ color: "#DC2626", fontWeight: 600 }}>อีเวนต์นี้ถูกยกเลิก<br /><span style={{ fontWeight: 400, color: "#6E6265" }}>คืนเงิน {fmt(t.refundAmount || 0)} แล้ว ตั๋วใบนี้ใช้เข้างานไม่ได้</span></div>
    : t.status === "listed" ? <div className="qrstate">บัตรอยู่ระหว่างประกาศขาย<br />ยกเลิกการลงประกาศขายเพื่อใช้งาน QR Code</div>
    : t.status === "used" ? <div className="qrstate" style={{ color: "#1D7A48", fontWeight: 600 }}>บันทึกการเข้างานเรียบร้อย<br /><span style={{ fontWeight: 400, color: "#6E6265" }}>บัตรถูกล็อกสถานะ ไม่สามารถโอนหรือขายต่อได้</span></div>
    : <EntryQR t={t} onGone={loadMyTickets} />;
  return (<div className="wrap">
    <Crumb label="บัตรเข้าชมของฉัน" fallback="tickets" />
    {ann.length > 0 && <div className="card" style={{ display: "flex", flexDirection: "column", gap: 6 }} role="status"><b>ประกาศสำคัญจากผู้จัดงาน</b>
      {ann.map((a: any) => <div key={a.id} className="small">{a.text}<div className="muted">{OL.thaiDate(a.at)} · {OL.thaiTime(a.at)} น.</div></div>)}</div>}
    <div className="tgrid2">
      <div className="vstack" style={{ gap: 16 }}>
        <div className="qrcard"><div style={{ textAlign: "center", lineHeight: 1.4 }}><b style={{ fontFamily: "var(--f-display)", fontSize: 17 }}>{e.name}</b><div style={{ fontSize: 13, color: "#6E6265" }}>{e.date} · {e.time} น. · {t.zone}</div></div>{qr}</div>
        <p className="small muted" style={{ margin: 0, display: "flex", gap: 10 }}><Icon id="i-shield" className="ic" /><span>QR Code นี้จะรีเฟรชทุก 60 วินาที จึงไม่สามารถใช้ภาพแคปหน้าจอเข้างานได้ ภายหลังการสแกน บัตรจะถูกล็อกทันทีและไม่สามารถโอนต่อได้</span></p>
      </div>
      <div className="vstack" style={{ gap: 16 }}>
        <NftCard t={t} full />
        <div className="btncol row2"><button className="bigbtn sec" onClick={openResell} disabled={locked}>ประกาศขายต่อ</button>
          <button className="bigbtn sec" onClick={openTransfer} disabled={locked || t.real || t.transfers >= 2}>โอนสิทธิ์ให้เพื่อน</button></div>
        {t.status === "listed" && <button className="bigbtn plain" onClick={unlistTicket}>ยกเลิกการประกาศขาย</button>}
        {t.real ? <p className="small muted" style={{ margin: 0 }}>สามารถลงประกาศขายได้ภายหลังได้รับบัตร 6 ชั่วโมง สำหรับฟังก์ชันการโอนให้เพื่อนจะเปิดให้บริการในเวอร์ชันถัดไป</p>
          : <button className="bigbtn plain" onClick={simulateDoorScan} disabled={t.status !== "active"}>ระบบจำลอง: เจ้าหน้าที่ทำการสแกนหน้างาน</button>}
      </div>
    </div></div>);
}

/* ---------- resale market ---------- */
export function Market() {
  const ls = marketListings().filter((l: any) => S.mcat === "all" || l.ev === S.mcat);
  return (<div className="wrap">
    <h1 className="ftitle">ตลาดซื้อขายต่อบัตร</h1>
    {!S.hideMarketNote && <div className="alert red" role="note"><Icon id="i-shield" /><div><b>บัตรซื้อขายต่อทุกใบผ่านการตรวจสอบว่าเป็นของแท้</b><br />ควบคุมราคาไม่เกิน 1.25 เท่าของราคาหน้าบัตร ระบบจะดำเนินการโอนบัตรให้ภายหลังยืนยันการชำระเงินเรียบร้อยแล้วเท่านั้น</div>
      <button className="x" onClick={() => { S.hideMarketNote = true; emit(); }} aria-label="ปิดประกาศ"><svg><use href="#i-x" /></svg></button></div>}
    <div className="chips" role="group" aria-label="เลือกอีเวนต์"><button className={"chip " + (S.mcat === "all" ? "on" : "")} aria-pressed={S.mcat === "all"} onClick={() => { S.mcat = "all"; emit(); }}>ทั้งหมด</button>
      {EV.all.map(e => <button key={e.id} className={"chip " + (S.mcat === e.id ? "on" : "")} aria-pressed={S.mcat === e.id} onClick={() => { S.mcat = e.id; emit(); }}>{lines(e.short)}</button>)}</div>
    {S.auth.google && !S.realListings ? <div className="empty">กำลังโหลดรายการซื้อขายต่อ…</div>
      : ls.length ? <div className="lgrid2">{ls.map((l: any) => {
        const e = evById(l.ev); if (!e) return null;
        const mine = l.real ? l.mine : l.seller === short(S.user.wallet), tone = l.price < l.face ? "low" : l.price > l.face ? "high" : "";
        return (<div key={l.lid} className="lst"><Thumb e={e} />
          <div className="info"><h3>{e.name}</h3><span className="small muted num">{e.date} · {e.time} น.</span><div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><ZChip e={e} name={l.zone} /><span className="small muted">ขายต่อมาแล้ว {l.transfers} ครั้ง</span></div></div>
          <div className="foot2"><div className={"ptone " + tone}>{tone === "low" ? <><span className="was num">{fmt(l.face)}</span><span className="now num">{fmt(l.price)}</span></>
            : <><span className="now num">{fmt(l.price)}</span><span className="orig num">{tone ? "(ราคาเดิม " + fmt(l.face) + ")" : "(ราคาหน้าบัตร)"}</span></>}</div>
            {mine ? <span className="pill grey">บัตรเข้าชมของคุณ</span> : l.held ? <span className="pill warn">มีผู้กำลังทำรายการชำระเงิน</span>
              : <button className="btn" style={{ width: "auto", minHeight: 44, padding: "0 24px" }} onClick={() => buyListing(l)} aria-label={`สั่งซื้อบัตร ${e.name} ${l.zone} ${fmt(l.price)}`}>สั่งซื้อ</button>}</div>
        </div>);
      })}</div>
      : <div className="empty">{S.mcat === "all" ? "ยังไม่มีประกาศขายต่อ เมื่อมีผู้ลงประกาศ ราคาจะถูกจำกัดไม่เกิน 1.25 เท่าของราคาหน้าบัตรเสมอ" : "ยังไม่มีประกาศขายต่อบัตรสำหรับอีเวนต์นี้"}</div>}
  </div>);
}

/* ---------- profile ---------- */
const G = (<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.6 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z" /><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.8 6C6.6 42.6 14.6 48 24 48z" /></svg>);
export function Profile() {
  const light = typeof document !== "undefined" && document.documentElement.dataset.theme === "light";
  const orgCard = (<div className="pcard"><div className="row between"><b>สำหรับผู้จัดงาน</b><span className="pill info">ใหม่</span></div>
    <span className="small muted">สร้างอีเวนต์ แบ่งโซนบัตร ตรวจสอบการเข้างาน และดูรายงานยอดขายได้โดยไม่ต้องตรวจสอบสลิป</span><button className="bigbtn sec" onClick={enterOrg}>เข้าสู่โหมดผู้จัดงาน</button></div>);
  const theme = (<div className="pcard" style={{ flexDirection: "row", alignItems: "center" }}><span style={{ flex: 1, display: "flex", flexDirection: "column" }}><b id="th-l">ธีมการแสดงผลมืด</b><span className="small muted">ตั้งค่าเริ่มต้นของเว็บไซต์ ปิดใช้งานเพื่อใช้โหมดสว่าง</span></span>
    <button className="sw" role="switch" aria-checked={!light} aria-labelledby="th-l" onClick={toggleTheme}><span /></button></div>);
  if (!S.signedIn) return (<div className="wrap narrow-w"><h1 className="ftitle">โปรไฟล์ผู้ใช้งาน</h1>
    <div className="pcard ctr" style={{ padding: "32px 20px" }}><h2 className="h2">ยังไม่ได้เข้าสู่ระบบ</h2><p className="muted" style={{ margin: 0 }}>ใช้บัญชี Google เพียงบัญชีเดียว เพื่อซื้อ จัดเก็บ และขายต่อบัตรได้ทุกอีเวนต์</p><button className="gbtn" onClick={() => openSignup()}>{G}ดำเนินการต่อด้วย Google</button></div>
    {theme}{orgCard}</div>);
  return (<div className="wrap"><h1 className="ftitle">โปรไฟล์ผู้ใช้งาน</h1>
    <div className="pgrid">
      <div className="vstack" style={{ gap: 16 }}>
        <div className="prof"><span className="av" aria-hidden="true">{initial()}</span><div><h2 style={{ fontSize: 20 }}>{S.user.name}</h2><div className="small muted">{S.user.email} · เข้าสู่ระบบด้วย Google{!S.auth.google && " (ระบบจำลอง)"}</div></div></div>
        <div className="pcard"><div className="row between"><b>กระเป๋าจัดเก็บบัตรของคุณ</b><span className="pill ok">สร้างระบบอัตโนมัติ</span></div>
          <div className="addr"><span className="mono">{S.user.wallet}</span><button onClick={copyWallet} aria-label="คัดลอกที่อยู่" className={S.copied ? "done" : ""}><svg><use href={"#" + (S.copied ? "i-check" : "i-copy")} /></svg></button></div>
          <dl className="kv2"><dt>เครือข่าย</dt><dd>Avalanche Fuji (เครือข่ายทดสอบ)</dd><dt>บัตรเข้าชม</dt><dd className="num">{S.tickets.length} ใบ</dd><dt>ค่าธรรมเนียมเครือข่าย</dt><dd>ออกให้โดยระบบทั้งหมด</dd></dl></div>
        {orgCard}
      </div>
      <div className="vstack" style={{ gap: 16 }}>
        {theme}
        <div className="pcard"><b className="small">สำหรับผู้ใช้งานที่มีความคุ้นเคยกับกระเป๋าเงินดิจิทัล</b><span className="small muted">เชื่อมต่อกระเป๋าเงินดิจิทัลส่วนตัวของคุณ หรือย้ายบัตรไปจัดเก็บยังช่องทางอื่น ซึ่งไม่จำเป็นสำหรับการใช้งานทั่วไป</span>
          <button className="bigbtn plain" onClick={() => toast("ฟังก์ชันการเชื่อมต่อกระเป๋าเงินเดิมอยู่ระหว่างแผนพัฒนาในลำดับถัดไป")}>เชื่อมต่อกระเป๋าเงินของฉัน</button></div>
        <button className="bigbtn plain" onClick={logout}>ออกจากระบบ</button>
        <button className="lnk" onClick={openReset} style={{ alignSelf: "center" }}>ล้างข้อมูลระบบทดลองทั้งหมด</button>
      </div>
    </div></div>);
}
export { posterStyle, imgCls, startStripeCheckout };
