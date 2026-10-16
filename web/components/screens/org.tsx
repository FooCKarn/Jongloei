"use client";
// Organizer screens, ported from the mock-up's ORG_VIEWS. Demo actions say "(ข้อมูลจำลองระบบ)"; the real shop calls /api/org/*.
import { useEffect, useRef, useState } from "react";
import { S, OL, emit, DAY, POSTERS, orgEv, orgPerson, evTickets, evSum, myEventIds } from "@/lib/state";
import { go } from "@/lib/nav";
import { toast } from "@/lib/ui";
import * as O from "@/lib/org";
import { B, Fld, errA, live } from "@/lib/org";
import { Icon, Thumb, Poster, PBar, OrgHead, LineSteps, StatusPill, DateTime, posterStyle, imgCls } from "../bits";

const thumbOf = (e: any) => ({ ...e, short: O.shortOf(e) });
const AccountCard = () => (<div className="card row between" id="org-account"><div style={{ minWidth: 0 }}><b>{S.org.account.name}</b><div className="small muted">{S.org.account.email} · {O.ROLE_LABEL[S.org.role]}</div></div>
  <button className="btn plain" style={{ width: "auto", padding: "9px 14px", fontSize: 14 }} onClick={O.orgLogout}>ออกจากระบบผู้จัดงาน</button></div>);
const NewBtn = () => <button className="btn" onClick={O.newEvent}><svg width="18" height="18"><use href="#i-plus" /></svg>สร้างอีเวนต์ใหม่</button>;
const busy = () => !!S.busy;

/* ---------- welcome ---------- */
export function OrgWelcome() {
  return (<>
    <section className="ohero"><div className="in"><h1>จำหน่ายบัตรได้อย่างราบรื่นโดยไม่ต้องตรวจสอบสลิป ไม่ต้องบริหารจัดการเรื่องการคืนเงินด้วยตนเอง</h1>
      <p>เหมาะสำหรับร้านค้า บาร์ ผู้จัดงาน Pop-up ครูผู้สอน Workshop และทีมจัดแฟนมีตที่ไม่มีทีมงานไอที ตั้งค่าอีเวนต์เสร็จสิ้นภายในไม่กี่นาที</p>
      {S.auth.google ? <><div className="acts"><button className="pri" onClick={O.orgLiveStart} disabled={busy()}>ลงทะเบียนร้านค้าหรือเข้าสู่ระบบด้วยบัญชี Google</button><button className="sec" onClick={() => O.orgChooser("signup")}>ทดลองระบบ</button></div>
        <p className="small">{S.signedIn ? "ใช้บัญชี " + S.user.email + " ที่เข้าสู่ระบบอยู่ในปัจจุบัน" : "ระบบจะนำท่านเข้าสู่ระบบผ่าน Google ก่อนดำเนินการต่อ"} · ร้านและงานถูกบันทึกจริง ส่วนเดโมเก็บข้อมูลไว้ในเบราว์เซอร์นี้</p></>
        : <><div className="acts"><button className="pri" onClick={() => O.orgChooser("signup")}>ลงทะเบียนร้านค้า</button><button className="sec" onClick={() => O.orgChooser("login")}>เข้าสู่ระบบผู้จัดงาน</button></div>
          <p className="small">ระบบทดลอง: ข้อมูลทั้งหมดจะถูกจัดเก็บไว้ภายในเบราว์เซอร์นี้เท่านั้น</p></>}</div></section>
    <div className="wrap"><div className="wgrid">
      <section aria-labelledby="h-why" style={{ display: "flex", flexDirection: "column", gap: 16 }}><h2 id="h-why" className="h2">สิ่งที่ระบบดำเนินการแทนคุณ</h2>
        <ol className="benefits">
          <li><span className="n num">1</span><div><b>ระบบตรวจสอบยอดเงินอัตโนมัติ</b><p>ผู้ซื้อชำระเงินผ่าน PromptPay ระบบดำเนินการตรวจสอบยอดกับผู้ให้บริการรับชำระเงินโดยตรง ไม่จำเป็นต้องตรวจสอบสลิปทีละรายการ</p></div></li>
          <li><span className="n num">2</span><div><b>ยกเลิกอีเวนต์และดำเนินการคืนเงินให้แก่ผู้ซื้อทั้งหมด</b><p>กรณีเกิดเหตุสุดวิสัย เช่น สภาพอากาศไม่เอื้ออำนวย หรือศิลปินป่วย สามารถกดยกเลิกได้เพียงครั้งเดียว ผู้ซื้อทั้งหมดจะได้รับเงินคืนเท่าที่จ่ายจริงโดยอัตโนมัติ</p></div></li>
          <li><span className="n num">3</span><div><b>ป้องกันปัญหาบัตรผีและการโก่งราคา</b><p>บัตรสามารถขายต่อได้เฉพาะภายในระบบเท่านั้น จำกัดเพดานราคาไม่เกิน 1.25 เท่า และตรวจสอบสิทธิ์การเข้างานเฉพาะผู้ถือบัตรจริงเท่านั้น</p></div></li>
        </ol></section>
      <div className="vstack" style={{ gap: 16 }}>
        <aside className="pcard" aria-labelledby="h-fee"><h2 id="h-fee" style={{ fontSize: 18 }}>ค่าธรรมเนียมบริการ</h2><p style={{ margin: 0 }}>ค่าบริการ 5 บาท + 3% ต่อใบ จัดเก็บจากฝั่งร้านค้า ผู้ซื้อไม่มีค่าใช้จ่ายเพิ่มเติม</p>
          <dl className="fee num"><dt>บัตรเข้าชม</dt><dd>1,000฿</dd><dt>ค่าธรรมเนียมบริการ</dt><dd>35฿</dd><dt className="t">รายรับที่คุณได้รับต่อใบ</dt><dd>965฿</dd></dl>
          <p className="small muted" style={{ margin: 0 }}>ไม่มีค่าใช้จ่ายแรกเข้า ไม่มีค่าบริการรายเดือน และสามารถรับเงินได้ภายใน 24 ชั่วโมงหลังจบอีเวนต์</p></aside>
        <div className="pcard"><b className="small">ทดลองใช้งานด้วยบัญชีตัวอย่าง (ระบบทดลอง)</b>
          <button className="btn plain" onClick={() => O.orgLoginAs("owner@midnightsociety.example")}>เจ้าของร้าน Midnight Society</button>
          <button className="btn plain" onClick={() => O.orgLoginAs("manager@example.com")}>ผู้จัดการระบบ</button>
          <button className="btn plain" onClick={() => O.orgLoginAs("door.staff@example.com")}>เจ้าหน้าที่ปฏิบัติการหน้างาน</button></div>
      </div>
    </div></div>
  </>);
}

/* ---------- onboarding ---------- */
export function OrgOnboard() {
  const ob = S.org.onboard || (S.org.onboard = { step: 1, data: {}, err: {} }), d = ob.data, e = ob.err || {};
  const set = (k: string) => (x: any) => { d[k] = x.target.value; emit(); };
  const labels = ["ข้อมูลร้านค้า", "ข้อมูลผู้ขาย", "บัญชีรับเงิน", "การยืนยันตัวตน"];
  return (<div className="wrap narrow-w">
    <div className="titlerow"><button className="back" onClick={O.obBack} aria-label="ย้อนกลับ"><svg><use href="#i-back" /></svg></button><h1>ลงทะเบียนเป็นผู้จัดงาน</h1></div>
    {live() ? <p className="small muted" style={{ margin: 0 }}>กรุณากรอกข้อมูลร้านค้าแล้วกดเปิดร้าน ทีมงาน JONGLOEI จะทำการตรวจสอบและอนุมัติก่อนเผยแพร่อีเวนต์</p> : <LineSteps labels={labels} cur={ob.step} />}
    {ob.step === 1 && <><h2 style={{ fontSize: 18 }}>ข้อมูลร้านค้า</h2>
      <Fld id="ob-name" label="ชื่อร้านค้าหรือชื่อผู้จัดงาน" err={e.name}><input id="ob-name" value={d.name || ""} onChange={set("name")} autoComplete="organization" {...errA("ob-name", e.name)} /></Fld>
      <Fld id="ob-kind" label="ประเภทธุรกิจ"><select id="ob-kind" value={d.kind || "bar"} onChange={set("kind")}>{O.SHOP_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Fld>
      <Fld id="ob-line" label="LINE Official Account (ไม่บังคับ)" hint="เช่น @midnightsociety ผู้ซื้อจะสามารถมองเห็นได้ในหน้าอีเวนต์"><input id="ob-line" value={d.line || ""} onChange={set("line")} {...errA("ob-line", "", true)} /></Fld>
      <Fld id="ob-phone" label="หมายเลขโทรศัพท์ติดต่อ" err={e.phone}><input id="ob-phone" type="tel" inputMode="tel" autoComplete="tel" value={d.phone || ""} onChange={set("phone")} {...errA("ob-phone", e.phone)} /></Fld></>}
    {ob.step === 2 && <><h2 style={{ fontSize: 18 }}>ข้อมูลผู้ขาย</h2>
      <Fld id="ob-legal" label="ดำเนินการในนาม"><select id="ob-legal" value={d.legal || "individual"} onChange={set("legal")}><option value="individual">บุคคลธรรมดา</option><option value="company">นิติบุคคล (บริษัท / หจก.)</option></select></Fld>
      <Fld id="ob-tax" label="เลขประจำตัวผู้เสียภาษีอากร" err={e.tax} hint="บุคคลธรรมดากรุณาใช้หมายเลขบัตรประจำตัวประชาชน 13 หลัก"><input id="ob-tax" inputMode="numeric" maxLength={17} value={d.taxId || ""} onChange={set("taxId")} {...errA("ob-tax", e.tax, true)} /></Fld></>}
    {ob.step === 3 && <><h2 style={{ fontSize: 18 }}>บัญชีรับเงิน</h2>
      <Fld id="ob-pp" label="บัญชี PromptPay สำหรับรับเงินยอดขาย" err={e.pp} hint="หมายเลขโทรศัพท์มือถือ 10 หลัก หรือเลขประจำตัว 13 หลัก"><input id="ob-pp" inputMode="numeric" value={d.pp || ""} onChange={set("pp")} {...errA("ob-pp", e.pp, true)} /></Fld>
      <div className="card small" style={{ display: "flex", flexDirection: "column", gap: 6 }}><b>ชื่อบัญชีผู้รับเงินจะต้องตรงกับชื่อผู้ขายที่ผ่านการยืนยันตัวตน</b>
        <span className="muted">รายรับจากอีเวนต์จะถูกโอนเข้าสู่บัญชีนี้ภายใน 24 ชั่วโมงหลังจบงาน ในกรณีที่อีเวนต์ถูกยกเลิก ระบบจะดำเนินการคืนเงินให้แก่ผู้ซื้อแทนการโอนให้ร้านค้า</span>
        <span className="pill warn" style={{ alignSelf: "flex-start" }}>ระบบจำลอง: ยังไม่มีการตรวจสอบบัญชีจริง</span></div></>}
    {ob.step === 4 && <><h2 style={{ fontSize: 18 }}>การยืนยันตัวตน</h2>
      <p className="small muted" style={{ margin: 0 }}>แนบสำเนาบัตรประจำตัวประชาชน (สำหรับบุคคลธรรมดา) หรือหนังสือรับรองบริษัท (สำหรับนิติบุคคล) เพื่อป้องกันร้านค้าปลอมแปลง ผู้ซื้อจะพบเครื่องหมาย “ผ่านการอนุมัติ” แสดงผลในหน้าอีเวนต์</p>
      <div className="field"><label htmlFor="ob-doc">เอกสารประกอบ</label><input id="ob-doc" type="file" accept="image/*,.pdf" aria-describedby="ob-doc-err" onChange={x => { const f = x.target.files && x.target.files[0]; d.docName = f ? f.name : ""; ob.err = {}; emit(); }} />
        {d.docName && <span className="hint">เลือกแล้ว: {d.docName}</span>}<span className="hint err" id="ob-doc-err" role="alert">{e.doc || ""}</span></div>
      <span className="pill warn" style={{ alignSelf: "flex-start" }}>ระบบจำลอง: ไฟล์ไม่ถูกอัปโหลดจริง ระบบจะอนุมัติให้โดยอัตโนมัติภายใน 3 วินาที</span></>}
    <div className="row"><button className="btn plain" onClick={O.obBack}>{ob.step === 1 || live() ? "ยกเลิก" : "ย้อนกลับ"}</button>
      {ob.step < 4 ? <button className="btn" onClick={O.obNext} disabled={busy()}>{live() ? "เปิดร้านค้า" : "ถัดไป"}</button> : <button className="btn" onClick={O.obSubmit}>ส่งข้อมูลยืนยันตัวตน</button>}</div>
  </div>);
}

/* ---------- team ---------- */
export function OrgTeam() {
  const sh = S.org.shop; const [email, setEmail] = useState(""), [role, setRole] = useState("gate");
  return (<div className="wrap org"><OrgHead title="ทีมงานผู้ดูแลระบบ" /><div className="cols">
    <div className="col">
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>{sh.team.map((m: any, i: number) => (<div key={m.email}>{i > 0 && <hr className="sep" />}
        <div className="row between"><div style={{ minWidth: 0 }}><b>{m.email}{S.org.account && m.email === S.org.account.email ? " (คุณ)" : ""}</b><div className="small muted">{O.ROLE_LABEL[m.role]}</div></div>
          {m.role === "owner" ? <span className="pill grey">เจ้าของร้าน</span> : <button className="btn plain" style={{ width: "auto", padding: "8px 12px", fontSize: 13 }} onClick={() => O.teamRemove(m.email)} aria-label={"ลบรายการ " + m.email}>ลบรายการ</button>}</div></div>))}</div>
      <h2 style={{ fontSize: 16 }}>ขอบเขตสิทธิ์ของแต่ละบทบาท</h2>
      <dl className="kv card small" style={{ margin: 0 }}><dt>เจ้าของร้าน</dt><dd>สิทธิ์เข้าถึงทั้งหมด รวมไปถึงระบบการเงินและจัดการทีมงาน</dd><dt>ผู้จัดการระบบ</dt><dd>สร้าง/แก้ไขอีเวนต์ ตรวจสอบยอดขาย และเช็กอิน (ไม่สามารถเข้าถึงระบบการเงิน)</dd><dt>เจ้าหน้าที่ปฏิบัติการหน้างาน</dt><dd>สิทธิ์การสแกนและเช็กอินหน้างานเท่านั้น</dd></dl>
    </div>
    <div className="col cside">
      <h2 style={{ fontSize: 16 }}>เชิญสมาชิกเข้าร่วมทีม</h2>
      <Fld id="team-email" label="อีเมลติดต่อ" err={S.org.teamErr}><input id="team-email" type="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} {...errA("team-email", S.org.teamErr)} /></Fld>
      <Fld id="team-role" label="บทบาทหน้าที่"><select id="team-role" value={role} onChange={e => setRole(e.target.value)}><option value="gate">เจ้าหน้าที่ปฏิบัติการหน้างาน</option><option value="manager">ผู้จัดการระบบ</option></select></Fld>
      <button className="btn" disabled={busy()} onClick={async () => { if (await O.teamInvite(email, role)) setEmail(""); }}>ส่งคำเชิญ</button>
      <button className="btn plain" onClick={O.copyInvite}>คัดลอกลิงก์คำเชิญ</button>
      {!live() && <div className="adv"><b className="small">ระบบทดลอง: แสดงผลในมุมมองของ</b><div className="seg three">{["owner", "manager", "gate"].map(r => (
        <button key={r} className={S.org.role === r ? "on" : ""} aria-pressed={S.org.role === r} onClick={() => O.viewAs(r)}>{O.ROLE_LABEL[r]}</button>))}</div></div>}
    </div></div></div>);
}

/* ---------- dashboard ---------- */
function Chart({ days }: { days: any[] }) {
  const [tip, setTip] = useState<null | { i: number; x: number }>(null), box = useRef<HTMLDivElement>(null);
  const W = 560, H = 180, pl = 34, pb = 26, pt = 14, max = Math.max(1, ...days.map(d => d.count));
  const top = max <= 4 ? 4 : Math.ceil(max / 4) * 4, plotH = H - pb - pt, slot = (W - pl - 8) / days.length, bw = Math.min(24, slot - 8);
  const y = (v: number) => pt + plotH - (v / top) * plotH;
  const dl = (d: number) => { const x = new Date(d * DAY); return x.getUTCDate() + "/" + (x.getUTCMonth() + 1); };
  const peak = days.reduce((m, d, i) => (d.count > days[m].count ? i : m), 0);
  const show = (i: number, el: Element) => { const r = el.getBoundingClientRect(), br = box.current!.getBoundingClientRect(); setTip({ i, x: Math.max(0, Math.min(br.width - 150, r.left - br.left - 40)) }); };
  return (<div className="org-chart" ref={box} style={{ position: "relative" }}>
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="group" aria-label="แผนภูมิแท่งแสดงจำนวนบัตรที่จำหน่ายได้ต่อวัน (ย้อนหลัง 14 วัน)">
      {[0, top / 2, top].map(v => <g key={v}><line x1={pl} x2={W - 8} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" /><text x={pl - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{v}</text></g>)}
      <line x1={pl} x2={W - 8} y1={y(0)} y2={y(0)} stroke="var(--muted)" strokeWidth="1" />
      {days.map((d, i) => {
        const x = pl + i * slot + (slot - bw) / 2, h = Math.max(d.count ? 4 : 0, (d.count / top) * plotH), yy = pt + plotH - h, r = Math.min(4, h);
        const path = d.count ? `M${x},${yy + h}V${yy + r}Q${x},${yy} ${x + r},${yy}H${x + bw - r}Q${x + bw},${yy} ${x + bw},${yy + r}V${yy + h}Z` : "";
        return (<g key={i}>
          <rect x={pl + i * slot} y={pt} width={slot} height={plotH + pb} fill="transparent" tabIndex={0} role="img" aria-label={`${dl(d.day)}: ${d.count} ใบ`}
            onPointerEnter={e => show(i, e.currentTarget)} onPointerMove={e => show(i, e.currentTarget)} onFocus={e => show(i, e.currentTarget)} onPointerLeave={() => setTip(null)} onBlur={() => setTip(null)} />
          {path && <path d={path} fill={tip && tip.i === i ? "var(--brand, var(--red))" : "var(--red)"} pointerEvents="none" />}
          {i % 2 === (days.length - 1) % 2 && <text x={pl + i * slot + slot / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{dl(d.day)}</text>}
          {i === peak && d.count > 0 && <text x={pl + i * slot + slot / 2} y={yy - 5} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--ink)">{d.count}</text>}
        </g>);
      })}
    </svg>
    {tip && <div className="org-tip" role="status" style={{ left: tip.x }}><b>{days[tip.i].count} ใบ</b><span> · {dl(days[tip.i].day)} · {B(days[tip.i].amount)}</span></div>}
    <details className="small" style={{ marginTop: 6 }}><summary>แสดงผลในรูปแบบตาราง</summary>
      <table className="org-table"><thead><tr><th scope="col">วันที่</th><th scope="col">จำนวนบัตร (ใบ)</th><th scope="col">ยอดจำหน่าย</th></tr></thead>
        <tbody>{days.map(d => <tr key={d.day}><th scope="row">{dl(d.day)}</th><td className="num">{d.count}</td><td className="num">{B(d.amount)}</td></tr>)}</tbody></table></details>
  </div>);
}
export function OrgDash() {
  const sh = S.org.shop, now = Date.now(), mgr = S.org.role !== "owner", lock = "สำหรับเจ้าของร้านค้าเท่านั้น";
  const evs = O.myEvents(), counted = evs.filter((e: any) => ["on_sale", "sold_out", "paused", "ended"].includes(e.status));
  const net = counted.map(evSum).reduce((a: number, s: any) => a + s.net, 0), held = evs.reduce((a: number, e: any) => a + evSum(e).held, 0);
  const days = OL.salesByDay(S.org.tickets.filter((t: any) => counted.some((e: any) => e.id === t.eventId)), now, 14), today = days[days.length - 1];
  const nextPay = counted.map((e: any) => ({ e, at: OL.payoutAt(e) })).filter((x: any) => x.at && x.at > now).sort((a: any, b: any) => a.at - b.at)[0];
  const todo: any[] = [];
  if (sh.verification !== "verified") todo.push(<li key="v"><b>อยู่ระหว่างรอการอนุมัติร้านค้า</b><span className="small muted"> · สามารถเผยแพร่อีเวนต์ได้ภายหลังการอนุมัติเสร็จสิ้น</span></li>);
  for (const e of evs.filter((x: any) => x.status === "draft")) todo.push(<li key={"d" + e.id}><b>{e.name || "แบบร่างไม่มีชื่อ"}</b><span className="small muted"> · รายการร่างที่ยังไม่ได้เผยแพร่</span> <button className="linkbtn" onClick={() => O.editEvent(e.id)}>แก้ไขข้อมูล</button></li>);
  for (const e of evs.filter((x: any) => x.status === "on_sale" && x.startAt - now < DAY && x.endAt > now)) todo.push(<li key={"g" + e.id}><b>{e.name}</b><span className="small muted"> · เริ่ม{e.startAt <= now ? "ที่ผ่านมา" : "ภายใน 24 ชม."}</span> <button className="linkbtn" onClick={() => O.gate(e.id)}>เปิดจุดปฏิบัติการหน้างาน</button></li>);
  for (const e of evs.filter((x: any) => x.status === "on_sale")) {
    const s = evSum(e), paid = e.zones.filter((z: any) => z.kind !== "comp"), pc = paid.reduce((a: number, z: any) => a + z.capacity, 0), ptk = paid.reduce((a: number, z: any) => a + z.sold + z.held, 0);
    if (pc && ptk / pc >= 0.9) todo.push(<li key={"f" + e.id}><b>{e.name}</b><span className="small muted"> · ตั๋วเหลือ {s.remaining} ที่ ใกล้เต็ม</span></li>);
  }
  const stat = (label: string, v: string, sub: string, locked?: boolean) => <div className={"stat" + (locked ? " locked" : "")}><span>{label}</span><b className="num">{v}</b><small>{sub}</small></div>;
  return (<div className="wrap org"><OrgHead title="ภาพรวมระบบ" action={<NewBtn />} />
    {sh.verification !== "verified" && <div className="alert warn" role="status"><Icon id="i-alert" /><div><b>ร้านค้าอยู่ระหว่างรอการยืนยันตัวตน</b><br />สร้างร่างงานได้ตามปกติ ปุ่มเผยแพร่จะใช้ได้หลัง{live() ? "ทีมงานผู้สนับสนุน JONGLOEI " : "ทีมงานผู้ดูแลระบบ"}ยืนยันร้านแล้ว</div></div>}
    {live() && <div className="alert" role="note"><Icon id="i-info" /><div>ระบบจริงยังไม่ส่งยอดขายรายวันมาที่หน้านี้ ตัวเลขด้านล่างนับจากโซนของแต่ละงาน</div></div>}
    <div className="stats">{stat("บัตรที่จำหน่ายได้ในวันนี้", today.count + " ใบ", B(today.amount))}
      {stat("รายรับสุทธิรวมทั้งหมด", mgr ? "—" : B(net), mgr ? lock : "ภายหลังหักค่าธรรมเนียมบริการ", mgr)}
      {stat("ยอดเงินที่จะได้รับในรอบถัดไป", mgr ? "—" : nextPay ? B(evSum(nextPay.e).net) : "—", mgr ? lock : nextPay ? OL.thaiDate(nextPay.at) + " · ภายใน 24 ชั่วโมงหลังจบอีเวนต์" : "ยังไม่มีรายการรอการจ่ายเงิน", mgr)}
      {stat("ที่นั่งที่อยู่ระหว่างการสำรอง (Hold)", held + " ที่", "ระบบจะปล่อยคืนสู่ระบบอัตโนมัติหากไม่ชำระเงินภายใน 10 นาที")}</div>
    <div className="split84">
      <section className="ocard2" aria-labelledby="chart-h"><div className="row between"><h2 id="chart-h" style={{ fontSize: 17 }}>บัตรที่จำหน่ายได้ย้อนหลัง 14 วัน</h2><span className="small muted num">รวม {days.reduce((a: number, d: any) => a + d.count, 0)} ใบ</span></div><Chart days={days} /></section>
      <section className="ocard2" aria-labelledby="todo-h"><h2 id="todo-h">รายการที่ต้องดำเนินการทันที</h2>{todo.length ? <ul className="org-todo">{todo}</ul> : <div className="small muted">ไม่มีรายการค้างดำเนินการ</div>}</section>
    </div>
    <AccountCard /></div>);
}

/* ---------- event list ---------- */
function OrgEvCard({ e }: { e: any }) {
  const s = evSum(e), pct = s.capacity ? Math.min(100, Math.round(((s.sold + s.held) * 100) / s.capacity)) : 0;
  return (<article className="oev">
    <div className="oev-top"><button className="oev-open" onClick={() => O.orgOpenEvent(e.id)}><Thumb e={thumbOf(e)} />
      <span className="oev-info"><b>{e.name || "แบบร่างไม่มีชื่อ"}</b><span className="small muted num">{O.whenText(e.startAt)}</span><StatusPill s={e.status} /></span></button>
      <button className="oev-menu" onClick={() => O.evMenu(e.id)} aria-label={"จัดการอีเวนต์ " + e.name} aria-haspopup="menu"><svg><use href="#i-dots" /></svg></button></div>
    {e.status === "draft" ? <p className="small muted" style={{ margin: 0 }}>ยังไม่เผยแพร่ · {e.zones.length} โซน ความจุ {s.capacity} ที่</p>
      : <div className="pbar"><div className="row between small num"><span className="muted">จำหน่ายแล้ว</span><span>{s.sold} / {s.capacity}</span></div>
        <PBar pct={pct} label={"ขายแล้ว " + pct + "%"} />
        <div className="small muted num" style={{ textAlign: "right" }}>รายรับสุทธิ {B(s.net)}</div></div>}
  </article>);
}
export function OrgEvents() {
  const f = S.org.evFilter || "all", all = O.myEvents();
  const match = (e: any, k: string) => k === "all" || e.status === k || (k === "on_sale" && ["sold_out", "paused"].includes(e.status));
  const filters = [["all", "ทั้งหมด"], ["on_sale", "เปิดจำหน่าย"], ["draft", "ร่าง"], ["ended", "จบแล้ว"], ["cancelled", "ยกเลิก"]];
  const list = all.filter((e: any) => match(e, f));
  return (<div className="wrap org"><OrgHead title="อีเวนต์ของฉัน" action={S.org.role !== "gate" && <NewBtn />} />
    <div className="chips" role="group" aria-label="กรองตามสถานะ">{filters.map(([k, v]) => (
      <button key={k} className={"chip " + (f === k ? "on" : "")} aria-pressed={f === k} onClick={() => { S.org.evFilter = k; emit(); }}>{v} <span className="num">{all.filter((e: any) => match(e, k)).length}</span></button>))}</div>
    {list.length ? <div className="oevgrid">{list.map((e: any) => <OrgEvCard key={e.id} e={e} />)}</div>
      : <div className="empty">ไม่พบอีเวนต์ในสถานะนี้ กรุณาเลือกสถานะอื่น หรือ<button className="linkbtn" onClick={O.newEvent}>สร้างอีเวนต์ใหม่</button></div>}
  </div>);
}

/* ---------- poster picker: picture upload + gradient fallback ---------- */
function PosterPicker({ e, onFile, onSwatch, id }: { e: any; onFile: (f: File | null) => void; onSwatch: (i: number) => void; id: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const pick = (f?: File | null) => { if (f) onFile(f); if (input.current) input.current.value = ""; };
  return (<div className="field upl"><span className="eyebrow" id={id + "-l"}>โปสเตอร์ประชาสัมพันธ์</span>
    {e.image ? <div className="upl-prev" style={{ backgroundImage: `url("${e.image}")` }} role="img" aria-label="รูปภาพโปสเตอร์ที่อัปโหลด" />
      : <button type="button" className="upl-drop" style={drag ? { boxShadow: "inset 0 0 0 2.5px var(--red)", background: "var(--surface-2)" } : undefined}
        onClick={() => input.current?.click()} onDragOver={x => { x.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={x => { x.preventDefault(); setDrag(false); pick(x.dataTransfer.files[0]); }} aria-describedby={id + "-h"}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
        <b>อัปโหลดรูปภาพโปสเตอร์</b><span className="small muted">ลากไฟล์รูปภาพมาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์</span></button>}
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={x => pick(x.target.files && x.target.files[0])} aria-label="เลือกรูปภาพโปสเตอร์" />
    <span className="hint" id={id + "-h"}>JPG, PNG หรือ WebP ระบบย่อเหลือไม่เกิน 1200 px ให้อัตโนมัติ{live() ? "" : " · ระบบทดลองจะจัดเก็บรูปภาพไว้ภายในเบราว์เซอร์นี้"}</span>
    {e.image && <div className="row" style={{ flexWrap: "wrap" }}><button type="button" className="btn plain" style={{ width: "auto", padding: "9px 14px", fontSize: 14 }} onClick={() => input.current?.click()} disabled={busy()}>เปลี่ยนรูปภาพ</button>
      <button type="button" className="btn plain" style={{ width: "auto", padding: "9px 14px", fontSize: 14, color: "var(--danger-solid)" }} onClick={() => onFile(null)} disabled={busy()}>ลบรูปภาพและใช้พื้นหลังสีแทน</button></div>}
    {!e.image && <><span className="small muted">หรือเลือกใช้พื้นหลังสีทึบ</span><div className="row" role="radiogroup" aria-labelledby={id + "-l"} style={{ flexWrap: "wrap" }}>
      {POSTERS.map((bg, i) => <button key={i} type="button" role="radio" className={"org-swatch " + (e.bg === bg ? "on" : "")} style={{ background: bg }} onClick={() => onSwatch(i)} aria-label={"รูปแบบพื้นหลังสีที่ " + (i + 1)} aria-checked={e.bg === bg} />)}</div></>}
  </div>);
}

/* ---------- create / edit wizard ---------- */
export function OrgWizard() {
  const o = S.org, d = o.draft;
  if (!d) return null;
  if (o.wizStep === 5) return <WizDone />;
  const errs: Record<string, string> = o.wizShow || o.wizStep === 4 ? O.wizErrors() : {};
  const set = (k: string, v: any) => { d[k] = v; O.wizTouch(); };
  return (<div className="wrap org"><div className="org-wiz cols"><div className="col">
    <LineSteps labels={O.WIZ_STEPS} cur={o.wizStep} onPick={O.wizGo} />
    <div className="row between"><span className="small muted">ขั้นที่ {o.wizStep} จาก 4 · {O.WIZ_STEPS[o.wizStep - 1]}</span><button className="linkbtn" onClick={O.wizSaveDraft} disabled={busy()}>บันทึกเป็นฉบับร่าง</button></div>
    {o.wizStep === 1 && <WizStep1 d={d} errs={errs} set={set} />}
    {o.wizStep === 2 && <WizStep2 d={d} errs={errs} />}
    {o.wizStep === 3 && <WizStep3 d={d} errs={errs} />}
    {o.wizStep === 4 && <WizStep4 d={d} errs={errs} />}
    <div className="row"><button className="btn plain" onClick={O.wizBack}>{o.wizStep === 1 ? "ยกเลิก" : "ย้อนกลับ"}</button>{o.wizStep < 4 && <button className="btn" onClick={O.wizNext}>ถัดไป</button>}</div>
  </div><div className="col cside"><WizPreview d={d} /></div></div></div>);
}
function WizStep1({ d, errs, set }: { d: any; errs: Record<string, string>; set: (k: string, v: any) => void }) {
  const dur = d.startAt && d.endAt && d.endAt > d.startAt ? Math.round((d.endAt - d.startAt) / 360000) / 10 : null;
  const editing = !!O.wizOrig();
  return (<>
    <Fld id="w-name" label="ชื่องานอีเวนต์" err={errs.name}><input id="w-name" maxLength={80} value={d.name} onChange={e => set("name", e.target.value)} {...errA("w-name", errs.name)} /></Fld>
    <Fld id="w-short" label="ชื่อย่อสำหรับแสดงบนโปสเตอร์ (ไม่บังคับ)" hint="สามารถขึ้นบรรทัดใหม่ได้ไม่เกิน 2 บรรทัด เช่น ROOFTOP แล้วขึ้นบรรทัด FRIDAY">
      <textarea id="w-short" rows={2} maxLength={30} value={d.short} onChange={e => set("short", e.target.value.split("\n").slice(0, 2).join("\n"))} {...errA("w-short", "", true)} /></Fld>
    <div className="field"><span className="eyebrow" id="w-cat-l">หมวดหมู่อีเวนต์</span><div className="chips" role="radiogroup" aria-labelledby="w-cat-l">{O.EV_CATS.map(c => (
      <button key={c} type="button" role="radio" className={"chip " + (d.category === c ? "on" : "")} aria-checked={d.category === c} onClick={() => set("category", c)}>{c}</button>))}</div></div>
    <div className="field"><label htmlFor="w-desc" style={{ display: "flex", justifyContent: "space-between" }}>รายละเอียดเพิ่มเติม <span className="muted small num">{d.description.length}/1000</span></label>
      <textarea id="w-desc" rows={4} maxLength={1000} value={d.description} onChange={e => set("description", e.target.value)} /></div>
    <Fld id="w-venue" label="สถานที่จัดงาน" err={errs.venue}><input id="w-venue" value={d.venue} onChange={e => set("venue", e.target.value)} {...errA("w-venue", errs.venue)} /></Fld>
    <Fld id="w-map" label="ลิงก์แผนที่ตั้ง (ไม่บังคับ)" hint="ลิงก์แผนที่ Google Maps"><input id="w-map" type="url" value={d.mapUrl} onChange={e => set("mapUrl", e.target.value)} {...errA("w-map", "", true)} /></Fld>
    <div className="field"><span className="eyebrow">เวลาเริ่มต้นอีเวนต์</span>
      <DateTime id="w-start" label="เวลาเริ่มต้นอีเวนต์" value={d.startAt} invalid={!!errs.startAt} describedBy="w-start-err" disabled={editing} defaultTime="19:00"
        onChange={v => { const shift = v && d.startAt ? v - d.startAt : 0; d.startAt = v; if (v && d.endAt && shift) d.endAt += shift; if (v && !d.endAt) d.endAt = v + 4 * 3600000; O.wizTouch(); }} />
      {editing && <span className="hint">อีเวนต์ที่เผยแพร่แล้วสามารถเปลี่ยนแปลงวันเริ่มต้นได้ที่แท็บการตั้งค่าของอีเวนต์</span>}
      <span className="hint err" id="w-start-err" role="alert">{errs.startAt || ""}</span></div>
    <div className="field"><span className="eyebrow">เวลาสิ้นสุดอีเวนต์</span>
      <DateTime id="w-end" label="เวลาสิ้นสุดอีเวนต์" value={d.endAt} min={d.startAt} invalid={!!errs.endAt} describedBy="w-end-err w-end-h" quick={["00:00", "02:00", "04:00"]} defaultTime="23:00" onChange={v => set("endAt", v)} />
      <span className="hint" id="w-end-h">{dur ? `ระยะเวลาอีเวนต์ ${dur} ชั่วโมง` + (O.whenText(d.endAt).slice(0, 12) !== O.whenText(d.startAt).slice(0, 12) ? " · สิ้นสุดในวันถัดไป" : "") : ""}</span>
      <span className="hint err" id="w-end-err" role="alert">{errs.endAt || ""}</span></div>
    <div className="field"><span className="eyebrow">เวลาเปิดประตู (ไม่บังคับ)</span>
      <DateTime id="w-doors" label="เวลาเปิดประตู" value={d.doorsAt} quick={["18:00", "19:00", "20:30"]} defaultTime="18:00" describedBy="w-doors-h" onChange={v => set("doorsAt", v)} />
      <span className="hint" id="w-doors-h">ผู้ซื้อจะมองเห็นเวลานี้แสดงผลบนบัตรเข้าชม</span></div>
    <PosterPicker e={d} id="w-poster" onFile={O.wizSetPoster} onSwatch={i => set("bg", POSTERS[i])} />
  </>);
}
function WizZone({ z, i, n, errs }: { z: any; i: number; n: number; errs: Record<string, string> }) {
  const locked = O.zoneLocked(z), e = (k: string) => errs[`zones.${i}.${k}`], id = (k: string) => `z${i}-${k}`;
  const upd = (patch: any) => { Object.assign(z, patch); O.wizTouch(); };
  const priceText = z._priceText !== undefined ? z._priceText : z.price ? String(z.price / 100) : "";
  return (<div className="card org-zone" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <div className="row between"><b style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ width: 12, height: 12, borderRadius: 4, background: z.color }} />โซน {i + 1}{z.name ? " · " + z.name : ""}</b>
      <span className="row" style={{ gap: 4 }}><button className="iconbtn" onClick={() => O.wizZoneMove(i, -1)} aria-label={`เลื่อนโซน ${i + 1} ขึ้นด้านบน`} disabled={i === 0}>↑</button>
        <button className="iconbtn" onClick={() => O.wizZoneMove(i, 1)} aria-label={`เลื่อนโซน ${i + 1} ลงด้านล่าง`} disabled={i === n - 1}>↓</button>
        <button className="iconbtn" onClick={() => O.wizZoneDel(i)} aria-label={`ลบโซน ${i + 1}`} disabled={locked}><svg><use href="#i-x" /></svg></button></span></div>
    <Fld id={id("name")} label="ชื่อโซนที่นั่ง" err={e("name")}><input id={id("name")} maxLength={40} value={z.name} onChange={x => upd({ name: x.target.value })} {...errA(id("name"), e("name"))} /></Fld>
    <div className="field"><span className="eyebrow" id={id("kind-l")}>ประเภทธุรกิจ</span><div className="chips" role="radiogroup" aria-labelledby={id("kind-l")}>
      {(live() ? O.ZONE_KINDS.slice(0, 2) : O.ZONE_KINDS).map(([k, l]) => <button key={k} type="button" role="radio" className={"chip " + (z.kind === k ? "on" : "")} aria-checked={z.kind === k} disabled={locked}
        onClick={() => upd({ kind: k, price: k === "comp" ? 0 : z.price, seatsPerUnit: k === "table" ? z.seatsPerUnit || 4 : null })}>{l}</button>)}</div></div>
    <Fld id={id("price")} label="ราคาจำหน่าย (บาท)" err={e("price")} hint={locked ? O.lockReason(z) : z.kind === "comp" ? "บัตรเชิญไม่มีค่าใช้จ่าย" : ""}>
      <input id={id("price")} inputMode="decimal" disabled={locked || z.kind === "comp"} value={z.kind === "comp" ? "0" : priceText}
        onChange={x => { const p = OL.toSatang(x.target.value.trim()); upd({ _priceText: x.target.value, price: Number.isNaN(p) ? 0 : p }); }} {...errA(id("price"), e("price"), true)} /></Fld>
    <Fld id={id("cap")} label={z.kind === "table" ? "จำนวนโต๊ะ" : "จำนวนที่เปิดจำหน่าย"} err={e("capacity")}><input id={id("cap")} inputMode="numeric" value={String(z.capacity || "")}
      onChange={x => { const v = x.target.value.trim(), c = v === "" ? 0 : Number(v); upd({ capacity: Number.isNaN(c) ? 0 : c }); }} {...errA(id("cap"), e("capacity"))} /></Fld>
    {z.kind === "table" && !live() && <Fld id={id("seats")} label="จำนวนที่นั่งต่อโต๊ะ" err={e("seatsPerUnit")} hint="ผู้ซื้อ 1 ท่าน ชำระยอดเดียวครอบคลุมทั้งโต๊ะ">
      <input id={id("seats")} inputMode="numeric" value={String(z.seatsPerUnit || "")} onChange={x => upd({ seatsPerUnit: Number(x.target.value) || 0 })} {...errA(id("seats"), e("seatsPerUnit"), true)} /></Fld>}
    {!live() && <>
      <div className="field"><span className="eyebrow">เปิดจำหน่าย (ไม่บังคับ)</span><DateTime id={id("open")} label={`โซน ${i + 1} เปิดขาย`} value={z.saleStartAt} invalid={!!e("saleStartAt")} describedBy={id("open") + "-err"} defaultTime="10:00" onChange={v => upd({ saleStartAt: v })} />
        <span className="hint err" id={id("open") + "-err"} role="alert">{e("saleStartAt") || ""}</span></div>
      <div className="field"><span className="eyebrow">ช่วงเวลาปิดจำหน่าย (ไม่บังคับ)</span><DateTime id={id("close")} label={`โซน ${i + 1} ปิดจำหน่าย`} value={z.saleEndAt} min={z.saleStartAt} invalid={!!e("saleEndAt")} describedBy={id("close") + "-err " + id("close") + "-h"} defaultTime="23:00" onChange={v => upd({ saleEndAt: v })} />
        <span className="hint" id={id("close") + "-h"}>สามารถสร้างโปรโมชัน Early Bird ได้โดยการสร้างสองโซนที่กำหนดเวลาปิดจำหน่ายต่างกัน</span><span className="hint err" id={id("close") + "-err"} role="alert">{e("saleEndAt") || ""}</span></div></>}
    <div className="field"><span className="eyebrow" id={id("color-l")}>สีสัญลักษณ์โซน</span><div className="zsw" role="radiogroup" aria-labelledby={id("color-l")}>
      {O.ZONE_COLORS.map(([c, l]) => <button key={c} type="button" role="radio" aria-checked={z.color === c} aria-label={l} title={l} style={{ background: c }} onClick={() => upd({ color: c })}>
        {z.color === c && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</button>)}</div></div>
  </div>);
}
function Summary({ d }: { d: any }) {
  const t = O.zoneTotals(d);
  return (<dl className="kv card num" style={{ margin: 0 }} aria-live="polite"><dt>ความจุรองรับรวมทั้งหมด</dt><dd>{t.cap} ที่</dd><dt>รายได้สูงสุดที่เป็นไปได้</dt><dd>{B(t.rev)}</dd>
    <dt>ค่าธรรมเนียมบริการ (5฿ + 3% ต่อใบ)</dt><dd>{B(t.fees)}</dd><dt style={{ fontWeight: 600, color: "var(--ink)" }}>รายรับสุทธิสูงสุด</dt><dd style={{ fontWeight: 700, color: "var(--red)" }}>{B(t.net)}</dd></dl>);
}
function WizStep2({ d, errs }: { d: any; errs: Record<string, string> }) {
  return (<>
    {!O.wizOrig() && <div className="chips" role="group" aria-label="แม่แบบโครงสร้างโซน"><span className="small muted" style={{ alignSelf: "center" }}>เริ่มต้นจากแม่แบบสำเร็จรูป:</span>
      <button className="chip" onClick={() => O.wizTemplate("bar")}>บาร์ / ร้านอาหาร</button><button className="chip" onClick={() => O.wizTemplate("workshop")}>Workshop</button><button className="chip" onClick={() => O.wizTemplate("concert")}>คอนเสิร์ต</button></div>}
    <span className="hint err" id="zones" tabIndex={-1} role="alert">{errs.zones || ""}</span>
    {d.zones.map((z: any, i: number) => <WizZone key={z.id} z={z} i={i} n={d.zones.length} errs={errs} />)}
    <button className="btn plain" onClick={O.wizAddZone}><svg width="18" height="18"><use href="#i-plus" /></svg>เพิ่มโซนที่นั่ง</button>
    <Summary d={d} />
  </>);
}
function WizStep3({ d, errs }: { d: any; errs: Record<string, string> }) {
  const p = d.params;
  return (<>
    {live() && <div className="card small" role="status"><b>ระบบงานจริงยังคงใช้ระเบียบข้อบังคับมาตรฐาน</b><br /><span className="muted">เพดานราคาและเงื่อนไขการปิดขายต่อยังไม่ถูกบันทึกในระบบงานจริง ค่าข้อมูลด้านล่างนี้จึงยังไม่มีผลบังคับใช้</span></div>}
    <label className="card row between" htmlFor="w-resale" style={{ cursor: "pointer" }}><span><b>เปิดระบบอนุญาตให้ขายต่อภายในแพลตฟอร์ม</b><br /><span className="small muted">ผู้ซื้อสามารถประกาศขายต่อได้เฉพาะบนแพลตฟอร์มเท่านั้น ผู้จัดงานไม่มีค่าใช้จ่ายเพิ่มเติมและไม่ได้รับส่วนแบ่งส่วนนี้</span></span>
      <input type="checkbox" id="w-resale" checked={p.resaleEnabled} onChange={e => { p.resaleEnabled = e.target.checked; O.wizTouch(); }} style={{ width: 22, height: 22 }} /></label>
    <div className="field"><label htmlFor="w-capm">เพดานกำหนดราคาขายต่อ <b>{p.capMultiplier.toFixed(2)} เท่า</b></label>
      <input id="w-capm" type="range" min={100} max={125} step={5} value={Math.round(p.capMultiplier * 100)} disabled={!p.resaleEnabled} onChange={e => { p.capMultiplier = Math.round(Number(e.target.value)) / 100; O.wizTouch(); }} aria-describedby="w-capm-err w-cap-example" />
      <span className="hint" id="w-cap-example">{O.capExample(d)}</span><span className="hint err" id="w-capm-err" role="alert">{errs.capMultiplier || ""}</span></div>
    <div className="card small" style={{ display: "flex", flexDirection: "column", gap: 6 }}><b>ข้อกำหนดมาตรฐานของระบบ (ไม่สามารถเปลี่ยนแปลงได้)</b>
      <span>• หน่วงเวลาการขายต่อ 6 ชั่วโมงหลังได้รับบัตร ป้องกันการเก็งกำไรทันทีหลังซื้อ</span><span>• ปิดระบบโอนสิทธิ์ 1 ชั่วโมงก่อนเริ่มงาน เพื่อให้จุดตรวจหน้างานสามารถตรวจสอบเจ้าของบัตรได้อย่างแน่นอน</span>
      <span>• จำกัดสิทธิ์การซื้อไม่เกิน 4 ใบต่อท่าน เพื่อลดปัญหาการกวาดซื้อบัตร</span><span>• ร้านค้าจะได้รับเงินภายใน 24 ชั่วโมงหลังจบอีเวนต์ เผื่อกรณีการยกเลิกหรือมีข้อพิพาท</span></div>
    <div className="card small"><b>นโยบายและเงื่อนไขที่ผู้ซื้อรับทราบก่อนชำระเงิน</b><br /><span className="muted">ยกเลิกอีเวนต์: คืนเงินอัตโนมัติเต็มจำนวน · ไม่เข้าร่วมงาน: สงวนสิทธิ์ไม่คืนเงิน</span></div>
  </>);
}
function WizStep4({ d, errs }: { d: any; errs: Record<string, string> }) {
  const keys = Object.keys(errs), t = O.zoneTotals(d), unverified = S.org.shop.verification !== "verified";
  return (<>
    <dl className="kv card" style={{ margin: 0 }}><dt>ชื่องานอีเวนต์</dt><dd>{d.name || "—"}</dd><dt>วันและเวลาจัดงาน</dt><dd>{d.startAt ? O.whenText(d.startAt) : "—"}</dd>
      <dt>สถานที่จัดงาน</dt><dd>{d.venue || "—"}</dd><dt>โปสเตอร์ประชาสัมพันธ์</dt><dd>{d.image ? "รูปภาพที่อัปโหลด" : "พื้นหลังสีทึบ"}</dd><dt>โซนที่นั่ง</dt><dd>{d.zones.length} โซน · {t.cap} ที่</dd>
      <dt>การขายต่อ</dt><dd>{d.params.resaleEnabled ? "เปิดการใช้งาน · ไม่เกิน " + d.params.capMultiplier.toFixed(2) + " เท่าของราคาหน้าบัตร" : "ปิดการใช้งาน"}</dd></dl>
    <Summary d={d} />
    {keys.length > 0 && <div className="card" role="alert"><b>ต้องแก้ {keys.length} เรื่องก่อนเผยแพร่</b><ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{keys.map(k => (
      <li key={k}>{errs[k]} <button className="linkbtn" onClick={() => O.wizJump(k)}>กลับไปแก้ไข</button></li>))}</ul></div>}
    {unverified && <div className="card small" role="status"><b>จะสามารถเผยแพร่ได้ภายหลังการอนุมัติร้านค้า</b><br /><span className="muted">สามารถบันทึกเป็นฉบับร่างไว้ก่อนได้ ระบบจะแจ้งเตือนเมื่อการตรวจสอบยืนยันเสร็จสิ้น</span></div>}
    <button className="btn" onClick={O.wizPublish} disabled={unverified || busy()}>{busy() ? "กำลังดำเนินการบันทึกข้อมูล…" : O.wizOrig() ? "บันทึกการแก้ไข" : "เผยแพร่อีเวนต์"}</button>
  </>);
}
function WizPreview({ d }: { d: any }) {
  const ev = { bg: d.bg, image: d.image, tag: d.category, short: O.shortOf(d) };
  return (<div style={{ display: "flex", flexDirection: "column", gap: 10 }}><span className="eyebrow">มุมมองการแสดงผลสำหรับผู้ซื้อ</span><Poster e={ev} cls="lg" />
    <div><b style={{ fontSize: 17 }}>{d.name || "ชื่องานอีเวนต์"}</b><div className="small muted">{O.whenText(d.startAt)}</div><div className="small muted">{d.venue || "ยังไม่ได้ระบุสถานที่จัดงาน"}</div></div>
    {d.zones.filter((z: any) => z.kind !== "comp").map((z: any) => <div key={z.id} className="row between small"><span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: z.color, marginRight: 6 }} />{z.name || "โซนที่นั่ง"}</span><b className="num">{z.price ? B(z.price) : "—"}</b></div>)}
  </div>);
}
function WizDone() {
  const d = S.org.draft, base = typeof location !== "undefined" && location.origin && location.origin !== "null" ? location.origin : "https://jongloei.example";
  const link = base + "/event/?id=" + d.id;
  return (<div className="narrow"><div className="hero-ok"><div className="big"><svg><use href="#i-check" /></svg></div><h1 style={{ fontSize: 21 }}>{S.org.wizEdited ? "บันทึกการแก้ไขเรียบร้อยแล้ว" : "เผยแพร่อีเวนต์เรียบร้อยแล้ว"}</h1>
    <p className="small muted" style={{ margin: 0 }}>{d.name} ขึ้นหน้าแรกของผู้ซื้อแล้ว</p></div>
    <div className="wallet-addr"><span className="mono">{link}</span><button className="iconbtn" onClick={() => O.copyText(link, "คัดลอกลิงก์เรียบร้อยแล้ว")} aria-label="คัดลอกลิงก์เข้าถึงอีเวนต์"><svg><use href="#i-copy" /></svg></button></div>
    {!live() && <span className="pill warn" style={{ alignSelf: "center" }}>ลิงก์นี้สามารถใช้งานได้เฉพาะภายในเบราว์เซอร์นี้เท่านั้น (ระบบทดลอง)</span>}
    <button className="btn" onClick={O.wizBuyerView}>ดูหน้าอีเวนต์ในมุมมองผู้ซื้อ</button>
    <button className="btn plain" onClick={() => { const id = d.id; S.org.wizStep = 1; S.org.draft = null; O.orgOpenEvent(id); }}>จัดการอีเวนต์นี้</button>
    <button className="btn plain" onClick={O.wizToDash}>กลับสู่หน้าภาพรวม</button></div>);
}

/* ---------- one event ---------- */
export function OrgEvent() {
  const e = orgEv(S.org.oev);
  if (!e) return null;
  const all = [["overview", "ภาพรวมระบบ"], ["buyers", "ข้อมูลผู้ซื้อ"], ["resale", "การขายต่อ"], ["extras", "ระบบโปรโมชัน"], ["settings", "ตั้งค่าระบบ"]];
  const tabs = live() ? all.filter(([k]) => ["overview", "buyers", "settings"].includes(k)) : all;
  const t = tabs.some(([k]) => k === S.org.etab) ? S.org.etab : "overview";
  const open = ["on_sale", "paused", "sold_out"].includes(e.status);
  return (<div className="wrap org">
    <button className="crumb m-hide" onClick={() => go("orgEvents")}><Icon id="i-back" />อีเวนต์ของฉัน</button>
    <div className="ehead"><div className="row1"><Thumb e={thumbOf(e)} />
      <div className="nm"><div className="row" style={{ flexWrap: "wrap", gap: 10 }}><h1>{e.name}</h1><StatusPill s={e.status} /></div>
        <span className="small muted num">{O.whenText(e.startAt)}</span><span className="small muted">{e.venue || ""}</span></div></div>
      <div className="acts">
        {e.status === "on_sale" && !live() && <button className="btn ghost" onClick={O.pause}>ระงับการจำหน่าย</button>}
        {e.status === "paused" && <button className="btn" onClick={O.resume}>เปิดจำหน่ายต่อ</button>}
        {e.status === "draft" && <button className="btn" onClick={() => O.editEvent(e.id)}>แก้ไขและเผยแพร่</button>}
        {open && <button className="btn ghost" onClick={() => O.editEvent(e.id)}>แก้ไขข้อมูลอีเวนต์ทั้งหมด</button>}
        {open && <button className="btn" onClick={() => O.gate(e.id)}>ไปยังจุดปฏิบัติการหน้างาน</button>}
        {["ended", "cancelled"].includes(e.status) && <button className="btn ghost" onClick={() => O.evDuplicate(e.id)}>คัดลอกสร้างเป็นอีเวนต์ใหม่</button>}
      </div></div>
    {e.status === "paused" && <div className="alert warn" role="status"><Icon id="i-info" /><div><b>อยู่ระหว่างระงับการจำหน่าย</b> ผู้ซื้อจะพบสถานะ “ระงับการจำหน่ายชั่วคราว” แต่บัตรที่จำหน่ายไปแล้วยังคงสามารถใช้เข้างานได้ตามปกติ</div></div>}
    {e.status === "cancelled" && <div className="alert danger" role="status"><Icon id="i-alert" /><div><b>อีเวนต์นี้ถูกยกเลิกเรียบร้อยแล้ว</b> {live() ? "ทีมงานกำลังดำเนินการคืนเงินให้แก่ผู้ซื้อ" : "คืนเงินให้แก่ผู้ซื้อเรียบร้อยแล้ว"} แก้ไขไม่ได้</div></div>}
    <div className="utabs" role="tablist" aria-label="ข้อมูลส่วนประกอบอีเวนต์">{tabs.map(([k, v]) => <button key={k} role="tab" aria-selected={t === k} onClick={() => { S.org.etab = k; emit(); }}>{v}</button>)}</div>
    <div role="tabpanel">
      {t === "overview" && <EvOverview e={e} />}
      {t === "buyers" && (live() ? <LiveBuyers e={e} /> : <EvBuyers e={e} />)}
      {t === "resale" && <EvResale e={e} />}
      {t === "extras" && <EvExtras e={e} />}
      {t === "settings" && <EvSettings e={e} />}
    </div>
  </div>);
}
function ZoneRow({ e, z, i, ro }: { e: any; z: any; i: number; ro: boolean }) {
  const locked = (z.sold || 0) + (z.held || 0) > 0, left = z.capacity - z.sold - z.held, pct = z.capacity ? ((z.sold + z.held) * 100) / z.capacity : 0;
  const [price, setPrice] = useState(String(z.price / 100)), [cap, setCap] = useState(String(z.capacity)), [err, setErr] = useState("");
  const priceLocked = live() ? !!(z.locked && z.locked.price) : locked;
  return (<div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <div className="row between"><b style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ width: 12, height: 12, borderRadius: 4, background: z.color }} />{z.name}</b>
      <span className="small muted num">ขาย {z.sold} · Hold {z.held} · เหลือ {left}{z.kind === "comp" ? "" : " · " + B(z.price * z.sold)}</span></div>
    <PBar pct={pct} label={`โซน ${z.name} จำหน่ายไปแล้ว ${Math.round(pct)}%`} />
    {!ro && <>
      {z.kind !== "comp" && <Fld id={`ez${i}-price`} label="ราคาจำหน่าย (บาท)" hint={priceLocked ? (live() ? "มีผู้ซื้อบัตรแล้ว ไม่สามารถเปลี่ยนแปลงราคาได้" : OL.canEditZone(z, { price: z.price + 1 }).reason) : ""}>
        <input id={`ez${i}-price`} inputMode="decimal" value={price} disabled={priceLocked} onChange={x => setPrice(x.target.value)} {...errA(`ez${i}-price`, "", priceLocked)} /></Fld>}
      <Fld id={`ez${i}-cap`} label="จำนวนที่เปิดจำหน่าย" err={err}><input id={`ez${i}-cap`} inputMode="numeric" value={cap} onChange={x => setCap(x.target.value)} {...errA(`ez${i}-cap`, err)} /></Fld>
      <button className="btn plain" disabled={busy()} onClick={async () => setErr(await O.zoneSave(i, z.kind === "comp" || priceLocked ? null : price, cap))}>บันทึกข้อมูลโซนนี้</button></>}
  </div>);
}
function EvOverview({ e }: { e: any }) {
  const s = evSum(e), ro = ["ended", "cancelled"].includes(e.status);
  return (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div className="org-stats"><div className="card org-stat"><span className="small muted">จำหน่ายแล้ว</span><b className="num">{s.sold}/{s.capacity}</b></div>
      <div className="card org-stat"><span className="small muted">รายรับสุทธิ</span><b className="num">{B(s.net)}</b></div></div>
    <h2 style={{ fontSize: 17 }}>โซนบัตรเข้าชม</h2>
    {e.zones.map((z: any, i: number) => <ZoneRow key={z.id + ":" + z.price + ":" + z.capacity} e={e} z={z} i={i} ro={ro} />)}
  </div>);
}
function EvBuyers({ e }: { e: any }) {
  const o = S.org, rows = O.buyerRows(e), em = (x: string) => (o.showEmails ? x : O.maskEmail(x));
  const set = (k: string) => (x: any) => { o[k] = x.target.value; emit(); };
  return (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div className="field"><label htmlFor="bq">ค้นหา (ชื่อ / อีเมล / หมายเลขบัตร)</label><input id="bq" type="search" value={o.bq || ""} onChange={set("bq")} autoComplete="off" /></div>
    <div className="row"><div className="field" style={{ flex: 1 }}><label htmlFor="bzone">โซนที่นั่ง</label><select id="bzone" value={o.bzone || "all"} onChange={set("bzone")}><option value="all">ทั้งหมด</option>{e.zones.map((z: any) => <option key={z.id} value={z.id}>{z.name}</option>)}</select></div>
      <div className="field" style={{ flex: 1 }}><label htmlFor="bstatus">สถานะการทำรายการ</label><select id="bstatus" value={o.bstatus || "all"} onChange={set("bstatus")}><option value="all">ทั้งหมด</option>{Object.entries(O.TICKET_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div></div>
    <div className="row" style={{ flexWrap: "wrap" }}><button className="btn plain" style={{ width: "auto", padding: "9px 14px", fontSize: 14 }} onClick={O.csv}>ส่งออกข้อมูลเป็นไฟล์ CSV</button>
      {o.role === "owner" && <button className="btn plain" style={{ width: "auto", padding: "9px 14px", fontSize: 14 }} aria-pressed={!!o.showEmails} onClick={() => { o.showEmails = !o.showEmails; emit(); }}>{o.showEmails ? "ซ่อนข้อมูลอีเมล" : "แสดงข้อมูลอีเมลเต็ม"}</button>}
      <span className="small muted" style={{ alignSelf: "center" }}>{rows.length} รายการ · อีเมลถูกปิดบังบางส่วนตามค่าเริ่มต้น</span></div>
    <div style={{ overflowX: "auto" }}><table className="org-table"><thead><tr><th scope="col">ชื่อ-นามสกุล</th><th scope="col">อีเมลติดต่อ</th><th scope="col">โซนที่นั่ง</th><th scope="col">สถานะการทำรายการ</th><th scope="col">หมายเลขบัตรเข้าชม</th></tr></thead>
      <tbody>{rows.map((r: any) => <tr key={r.t.ticketId}><th scope="row">{r.p.name}</th><td style={{ textAlign: "left" }}>{em(r.p.email)}</td><td style={{ textAlign: "left" }}>{r.z.name}</td><td style={{ textAlign: "left" }}>{O.TICKET_STATUS[r.t.status] || r.t.status}</td><td className="mono" style={{ textAlign: "left" }}>{r.t.ticketId}</td></tr>)}</tbody></table>
      {!rows.length && <div className="empty">ไม่พบข้อมูลผู้ซื้อที่ตรงกับเงื่อนไขการกรอง</div>}</div>
  </div>);
}
function LiveBuyers({ e }: { e: any }) {
  const rows = O.liveOrders(e);
  if (!rows) return <div className="empty">กำลังโหลดข้อมูลคำสั่งซื้อ…</div>;
  if (rows.error) return <div className="empty">{rows.error} <button className="linkbtn" onClick={O.liveOrdersReload}>ลองใหม่อีกครั้ง</button></div>;
  return (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div className="row between" style={{ flexWrap: "wrap" }}><span className="small muted">คำสั่งซื้อ {rows.length} รายการ · อีเมลถูกปิดบังบางส่วน</span>
      <span className="row"><button className="btn plain" style={{ width: "auto", padding: "9px 14px", fontSize: 14 }} onClick={O.csv}>ส่งออกข้อมูลเป็นไฟล์ CSV</button>
        <button className="btn plain" style={{ width: "auto", padding: "9px 14px", fontSize: 14 }} onClick={O.liveOrdersReload}>โหลดข้อมูลใหม่</button></span></div>
    {rows.length ? <div style={{ overflowX: "auto" }}><table className="org-table"><thead><tr><th scope="col">ข้อมูลผู้ซื้อ</th><th scope="col">อีเมลติดต่อ</th><th scope="col">โซนที่นั่ง</th><th scope="col">ใบ</th><th scope="col">ยอดรวม</th><th scope="col">สถานะการทำรายการ</th><th scope="col">จำนวนบัตรที่ออก</th></tr></thead>
      <tbody>{rows.map((r: any, i: number) => <tr key={i}><th scope="row">{r.buyer || "—"}</th><td style={{ textAlign: "left" }}>{r.email}</td><td style={{ textAlign: "left" }}>{r.zone}</td><td className="num">{r.quantity}</td>
        <td className="num">{B(r.amountSatang)}</td><td style={{ textAlign: "left" }}>{O.ORDER_STATUS[r.status] || r.status}</td><td className="num">{r.minted}</td></tr>)}</tbody></table></div>
      : <div className="empty">ยังไม่มีรายการคำสั่งซื้อ</div>}
  </div>);
}
function EvResale({ e }: { e: any }) {
  const tk = evTickets(e.id).filter((t: any) => t.hops.length > 1 || t.status === "listed"), has = tk.length > 0, p = e.params;
  const comm = tk.reduce((a: number, t: any) => a + OL.settleTicket(t, (e.zones.find((z: any) => z.id === t.zoneId) || { price: 0 }).price).commission, 0);
  const [capm, setCapm] = useState(Math.round(p.capMultiplier * 100));
  return (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div className="card small"><b>ร้านค้าได้รับราคาหน้าบัตรตามเดิม</b><br /><span className="muted">ค่าคอมมิชชัน 6% จากราคาขายต่อหักจากผู้ขายและเป็นรายได้ของแพลตฟอร์ม ผู้จัดงานไม่มีค่าใช้จ่ายเพิ่มเติมและไม่ได้รับส่วนแบ่ง</span></div>
    {has ? <><div className="row between"><b>ตั๋วที่ขายต่อ / ลงขาย {tk.length} ใบ</b><span className="small muted num">คอมมิชชันแพลตฟอร์ม {B(comm)}</span></div>
      <div style={{ overflowX: "auto" }}><table className="org-table"><thead><tr><th scope="col">บัตรเข้าชม</th><th scope="col">เส้นทางการทำธุรกรรม (รอบที่ 0 = การซื้อครั้งแรก)</th><th scope="col">สถานะการทำรายการ</th></tr></thead>
        <tbody>{tk.map((t: any) => <tr key={t.ticketId}><th scope="row" className="mono">{t.ticketId}</th><td style={{ textAlign: "left" }}>{t.hops.map((h: any) => orgPerson(h.payerId).name + " " + B(h.paid)).join(" → ")}</td><td style={{ textAlign: "left" }}>{O.TICKET_STATUS[t.status]}</td></tr>)}</tbody></table></div></>
      : <div className="empty">ยังไม่มีประวัติการขายต่อ</div>}
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}><b>เพดานราคาขายต่อ: {p.capMultiplier.toFixed(2)} เท่า</b>
      {has ? <span className="small muted">มีรายการขายต่อเกิดขึ้นแล้ว ไม่สามารถปรับเปลี่ยนเพดานราคาได้ เพื่อไม่ให้ส่งผลกระทบต่อผู้ซื้อที่ประกาศขายไปก่อนหน้า</span>
        : <><label htmlFor="rs-capm" className="small">ปรับเปลี่ยนเพดานราคา (สามารถทำได้ก่อนมีรายการขายต่อเกิดขึ้น): <b className="num">{(capm / 100).toFixed(2)} เท่า</b></label>
          <input id="rs-capm" type="range" min={100} max={125} step={5} value={capm} onChange={x => setCapm(Number(x.target.value))} />
          <button className="btn plain" onClick={() => O.rsSave(capm)}>บันทึกเพดานราคา</button></>}</div>
  </div>);
}
function EvExtras({ e }: { e: any }) {
  const x = S.org.xtab || "comp";
  return (<div className="org-extras" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div className="chips" role="tablist">{[["comp", "บัตรเชิญพิเศษ"], ["promo", "รหัสส่วนลด"], ["ann", "ประกาศประชาสัมพันธ์"]].map(([k, v]) => (
      <button key={k} role="tab" aria-selected={x === k} className={"chip " + (x === k ? "on" : "")} onClick={() => { S.org.xtab = k; emit(); }}>{v}</button>))}</div>
    {x === "comp" && <XComp e={e} />}{x === "promo" && <XPromo e={e} />}{x === "ann" && <XAnn e={e} />}
  </div>);
}
function XComp({ e }: { e: any }) {
  const cz = e.zones.filter((z: any) => z.kind === "comp");
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [zone, setZone] = useState(cz[0] ? cz[0].id : ""), [err, setErr] = useState<any>({});
  if (!cz.length) return (<><div className="card small"><b>อีเวนต์นี้ยังไม่มีการตั้งค่าโซนบัตรเชิญ</b><br /><span className="muted">กรุณาเพิ่มโซนประเภท “บัตรเชิญพิเศษ (ฟรี)” ในหน้าแก้ไขอีเวนต์ จากนั้นจึงกลับมาดำเนินการออกบัตร</span></div>
    <button className="btn plain" onClick={() => O.editEvent(e.id)}>แก้ไขข้อมูลอีเวนต์</button></>);
  const tk = evTickets(e.id).filter((t: any) => cz.some((z: any) => z.id === t.zoneId));
  return (<>
    <div className="card small"><b>บัตรเชิญได้รับการยกเว้นกระบวนการชำระเงิน</b><br /><span className="muted">ไม่มีกระแสเงินสดเข้า-ออก ไม่มีค่าธรรมเนียมบริการ และไม่สามารถขายต่อได้ ผู้รับจะได้รับบัตรผ่านทางอีเมลที่ระบุ</span></div>
    <Fld id="cp-name" label="ชื่อผู้รับบัตร" err={err.name}><input id="cp-name" value={name} onChange={x => setName(x.target.value)} {...errA("cp-name", err.name)} /></Fld>
    <Fld id="cp-email" label="อีเมลผู้รับบัตร" err={err.email}><input id="cp-email" type="email" autoComplete="off" value={email} onChange={x => setEmail(x.target.value)} {...errA("cp-email", err.email)} /></Fld>
    <Fld id="cp-zone" label="โซนบัตรเชิญ" err={err.zone}><select id="cp-zone" value={zone} onChange={x => setZone(x.target.value)}>{cz.map((z: any) => <option key={z.id} value={z.id}>{z.name} (ออกแล้ว {z.sold}/{z.capacity})</option>)}</select></Fld>
    <button className="btn" onClick={() => { const r = O.compIssue(name, email, zone); setErr(r); if (!Object.keys(r).length) { setName(""); setEmail(""); } }}>ออกบัตรเชิญพิเศษ</button>
    <h2 style={{ fontSize: 16 }}>รายชื่อผู้ได้รับบัตรเชิญ ({tk.length})</h2>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{tk.length ? tk.map((t: any) => { const p = orgPerson(t.holderId); return (
      <div key={t.ticketId} className="card row between"><div style={{ minWidth: 0 }}><b>{p.name}</b><div className="small muted">{O.maskEmail(p.email || "")} · ขายต่อไม่ได้</div></div><span className={"pill " + (t.status === "used" ? "grey" : "ok")}>{t.status === "used" ? "ผ่านการใช้งาน" : "จัดส่งสำเร็จ"}</span></div>); })
      : <div className="empty">ยังไม่มีการออกบัตรเชิญ</div>}</div>
  </>);
}
function XPromo({ e }: { e: any }) {
  const paid = e.zones.filter((z: any) => z.kind !== "comp"), pr = S.org.promos.filter((p: any) => !p.eventId || p.eventId === e.id);
  const [f, setF] = useState<any>({ code: "", kind: "percent", value: "", zone: "all", start: Date.now(), end: e.startAt || null, max: "50" }), [err, setErr] = useState<any>({});
  const [tc, setTc] = useState(""), [tz, setTz] = useState(paid[0] ? paid[0].id : ""), [tr, setTr] = useState("");
  const up = (k: string) => (x: any) => setF({ ...f, [k]: x && x.target ? x.target.value : x });
  return (<>
    <Fld id="pm-code" label="รหัสโค้ด" err={err.code} hint="ใช้ตัวอักษรภาษาอังกฤษหรือตัวเลขความยาว 3-20 ตัว เช่น EARLY10"><input id="pm-code" autoCapitalize="characters" autoComplete="off" value={f.code} onChange={x => setF({ ...f, code: x.target.value.toUpperCase() })} {...errA("pm-code", err.code, true)} /></Fld>
    <div className="row"><div style={{ flex: 1 }}><Fld id="pm-kind" label="รูปแบบส่วนลด"><select id="pm-kind" value={f.kind} onChange={up("kind")}><option value="percent">ส่วนลดเป็นเปอร์เซ็นต์ (%)</option><option value="amount">ส่วนลดเป็นจำนวนเงิน (บาท)</option></select></Fld></div>
      <div style={{ flex: 1 }}><Fld id="pm-value" label="มูลค่าส่วนลด" err={err.value}><input id="pm-value" inputMode="decimal" value={f.value} onChange={up("value")} {...errA("pm-value", err.value)} /></Fld></div></div>
    <Fld id="pm-zone" label="กำหนดใช้เฉพาะโซน"><select id="pm-zone" value={f.zone} onChange={up("zone")}><option value="all">ทุกโซนที่นั่ง</option>{paid.map((z: any) => <option key={z.id} value={z.id}>{z.name}</option>)}</select></Fld>
    <div className="field"><span className="eyebrow">วันเวลาเริ่มต้นใช้งาน</span><DateTime id="pm-start" label="วันเวลาเริ่มต้นใช้งาน" value={f.start} invalid={!!err.start} describedBy="pm-start-err" defaultTime="10:00" onChange={up("start")} /><span className="hint err" id="pm-start-err" role="alert">{err.start || ""}</span></div>
    <div className="field"><span className="eyebrow">วันเวลาหมดอายุ</span><DateTime id="pm-end" label="วันเวลาหมดอายุ" value={f.end} min={f.start} invalid={!!err.end} describedBy="pm-end-err" defaultTime="23:00" onChange={up("end")} /><span className="hint err" id="pm-end-err" role="alert">{err.end || ""}</span></div>
    <Fld id="pm-max" label="จำนวนสิทธิ์การใช้งาน" err={err.max}><input id="pm-max" inputMode="numeric" value={f.max} onChange={up("max")} {...errA("pm-max", err.max)} /></Fld>
    <button className="btn" onClick={() => { const r = O.promoCreate(f); setErr(r); if (!Object.keys(r).length) setF({ ...f, code: "", value: "" }); }}>สร้างรหัสส่วนลด</button>
    <h2 style={{ fontSize: 16 }}>โค้ดทั้งหมด ({pr.length})</h2>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{pr.length ? pr.map((p: any) => (
      <div key={p.code} className="card" style={{ display: "flex", flexDirection: "column", gap: 4 }}><div className="row between"><b className="mono">{p.code}</b><span className={"pill " + (p.disabled ? "grey" : "ok")}>{p.disabled ? "ระงับการใช้งาน" : "สถานะใช้งานได้"}</span></div>
        <div className="small muted">ลด {p.percentOff ? p.percentOff + "%" : B(p.amountOff)} · {p.zoneId ? (e.zones.find((z: any) => z.id === p.zoneId) || { name: "—" }).name : "ทุกโซนที่นั่ง"} · {OL.thaiDate(p.startsAt)}–{OL.thaiDate(p.endsAt)} · ใช้แล้ว {p.used || 0}/{p.maxUses}</div>
        <button className="btn plain" style={{ padding: 8, fontSize: 14, minHeight: 44 }} onClick={() => O.promoToggle(p.code)}>{p.disabled ? "เปิดใช้งานรหัส" : "ปิดการใช้งานรหัส"}</button></div>))
      : <div className="empty">ยังไม่มีการสร้างรหัสส่วนลด</div>}</div>
    {paid.length > 0 && <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}><b>ทดลองกรอกรหัสส่วนลด</b>
      <Fld id="pt-code" label="รหัสโค้ด"><input id="pt-code" value={tc} onChange={x => setTc(x.target.value)} /></Fld>
      <Fld id="pt-zone" label="โซนที่นั่ง"><select id="pt-zone" value={tz} onChange={x => setTz(x.target.value)}>{paid.map((z: any) => <option key={z.id} value={z.id}>{z.name} · {B(z.price)}</option>)}</select></Fld>
      <button className="btn plain" onClick={() => setTr(O.promoTest(tc, tz))}>ตรวจสอบราคาภายหลังหักส่วนลด</button><span className="hint" role="status">{tr}</span></div>}
  </>);
}
function XAnn({ e }: { e: any }) {
  const hist = S.org.announcements.filter((a: any) => a.eventId === e.id).slice().reverse();
  const zn = (id: string) => (id === "all" ? "ทุกโซนที่นั่ง" : (e.zones.find((z: any) => z.id === id) || { name: id }).name);
  const [zone, setZone] = useState("all"), [text, setText] = useState(""), [err, setErr] = useState("");
  return (<>
    <Fld id="an-zone" label="ส่งประกาศถึง"><select id="an-zone" value={zone} onChange={x => setZone(x.target.value)}><option value="all">ผู้ถือบัตรเข้าชมทุกท่าน</option>{e.zones.filter((z: any) => z.kind !== "comp").map((z: any) => <option key={z.id} value={z.id}>เฉพาะโซน {z.name}</option>)}</select></Fld>
    <div className="chips" role="group" aria-label="เทมเพลตข้อความ">{[["time", "เปลี่ยนแปลงเวลา"], ["place", "เปลี่ยนแปลงสถานที่"], ["weather", "ประกาศสถานการณ์สภาพอากาศ"]].map(([k, l]) => <button key={k} className="chip" onClick={() => setText(O.AN_TEMPLATES[k])}>{l}</button>)}</div>
    <Fld id="an-text" label="ข้อความประชาสัมพันธ์" err={err} hint="ผู้ซื้อจะมองเห็นข้อความนี้แสดงผลในหน้าบัตรเข้าชม"><textarea id="an-text" rows={4} value={text} onChange={x => setText(x.target.value)} {...errA("an-text", err, true)} /></Fld>
    <button className="btn" onClick={() => { const r = O.annSend(zone, text); setErr(r); if (!r) setText(""); }}>ส่งประกาศ</button>
    <h2 style={{ fontSize: 16 }}>ประวัติการส่ง ({hist.length})</h2>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{hist.length ? hist.map((a: any) => <div key={a.id} className="card small"><div className="row between"><b>{zn(a.zone)}</b><span className="muted num">ถึง {a.recipients} คน · {OL.thaiTime(a.at)} น.</span></div><div>{a.text}</div></div>)
      : <div className="empty">ยังไม่เคยมีการส่งประกาศ</div>}</div>
  </>);
}
function EvSettings({ e }: { e: any }) {
  const cancellable = ["on_sale", "paused", "sold_out"].includes(e.status), ro = ["ended", "cancelled"].includes(e.status);
  const [f, setF] = useState({ desc: e.description || "", venue: e.venue || "", start: e.startAt as number | null, msg: "" }), [err, setErr] = useState<any>({});
  return (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    {ro ? <div className="card small muted">งานนี้{e.status === "ended" ? "จบแล้ว" : "ยกเลิกการจัดงานเรียบร้อยแล้ว" + (e.cancelReason ? " (" + e.cancelReason + ")" : "")} แก้ไขไม่ได้</div> : <>
      <Fld id="st-desc" label="รายละเอียดข้อมูลอีเวนต์"><textarea id="st-desc" rows={4} value={f.desc} onChange={x => setF({ ...f, desc: x.target.value })} /></Fld>
      <Fld id="st-venue" label="สถานที่จัดงาน" err={err.venue}><input id="st-venue" value={f.venue} onChange={x => setF({ ...f, venue: x.target.value })} {...errA("st-venue", err.venue)} /></Fld>
      <div className="field"><span className="eyebrow">วันและเวลาเริ่มต้นอีเวนต์</span><DateTime id="st-start" label="วันและเวลาเริ่มต้นอีเวนต์" value={f.start} invalid={!!err.start} describedBy="st-start-err st-start-h" onChange={v => setF({ ...f, start: v })} />
        <span className="hint" id="st-start-h">เวลาสิ้นสุดและเวลาเปิดประตูจะถูกปรับเลื่อนตามโดยอัตโนมัติ</span><span className="hint err" id="st-start-err" role="alert">{err.start || ""}</span></div>
      <PosterPicker e={e} id="st-poster" onFile={O.stSetPoster} onSwatch={O.stSetSwatch} />
      <Fld id="st-msg" label="ข้อความชี้แจงถึงผู้ซื้อ (จำเป็นต้องกรอกกรณีมีการเปลี่ยนแปลงสถานที่หรือวันเวลาภายหลังการจำหน่ายบัตร)" err={err.msg} hint={live() ? "ระบบงานจริงยังไม่ได้ส่งข้อความนี้ตรงถึงผู้ซื้อ" : "ผู้ซื้อทุกคนจะมองเห็นข้อความนี้แสดงผลในหน้าบัตรเข้าชม"}>
        <textarea id="st-msg" rows={3} value={f.msg} onChange={x => setF({ ...f, msg: x.target.value })} {...errA("st-msg", err.msg, true)} /></Fld>
      <button className="btn" disabled={busy()} onClick={async () => { const r = await O.stSave(f); setErr(r); if (!Object.keys(r).length) setF({ ...f, msg: "" }); }}>บันทึกการตั้งค่า</button></>}
    {cancellable && <div className="card org-danger" style={{ display: "flex", flexDirection: "column", gap: 8 }}><b>ขอยกเลิกการจัดอีเวนต์</b>
      <span className="small muted">{live() ? "หยุดการจำหน่ายทันทีและคืนที่นั่งที่อยู่ระหว่างการสำรอง ทีมงาน JONGLOEI จะดำเนินการคืนเงินให้แก่ผู้ซื้อ ร้านค้าจะไม่ได้รับรายได้จากอีเวนต์นี้ และไม่สามารถย้อนกลับการดำเนินการได้" : "ผู้ซื้อทุกท่านจะได้รับเงินคืนอัตโนมัติเท่ากับยอดที่ชำระจริง ร้านค้าจะไม่ได้รับรายได้จากอีเวนต์นี้ และไม่สามารถย้อนกลับการดำเนินการได้"}</span>
      <button className="btn org-danger-btn" onClick={O.cancelStart}>ยืนยันยกเลิกอีเวนต์นี้</button></div>}
  </div>);
}

/* ---------- door: pick an event ---------- */
export function OrgGatePick() {
  const evs = O.myEvents().filter((e: any) => ["on_sale", "sold_out", "paused"].includes(e.status)).sort((a: any, b: any) => (a.startAt || 0) - (b.startAt || 0));
  const counts = live() ? S.org.gateCounts || {} : null, today = new Date().toDateString();
  useEffect(() => { if (live() && Date.now() - (S.org.gateCountsAt || 0) > 15000) O.liveGateCounts(); }, []);
  return (<div className="wrap org"><OrgHead title="จุดปฏิบัติการหน้างาน" />
    <p className="muted" style={{ margin: 0 }}>เลือกอีเวนต์ที่ต้องการตรวจสอบการเข้างาน เรียงลำดับจากอีเวนต์ที่ใกล้ที่สุด</p>
    {evs.length ? <div className="lgrid2">{evs.map((e: any) => { const g = counts ? counts[e.id] : O.gateStats(e); return (
      <button key={e.id} className="gpick" onClick={() => O.gate(e.id)}><Thumb e={thumbOf(e)} />
        <span className="oev-info"><span className="row" style={{ gap: 8, flexWrap: "wrap" }}><b>{e.name}</b>{e.startAt && new Date(e.startAt).toDateString() === today && <span className="pill">วันนี้</span>}</span>
          <span className="small muted num">{e.startAt ? O.whenText(e.startAt) : ""}</span>{g && <span className="num" style={{ fontSize: 14, fontWeight: 600 }}>เข้างานแล้ว {g.used} / {g.total}</span>}</span>
        <Icon id="i-next" className="ic" /></button>); })}</div>
      : <div className="empty"><b>ไม่มีอีเวนต์ที่เปิดจำหน่ายอยู่ในขณะนี้</b><br />อีเวนต์ที่เปิดจำหน่ายหรือจำหน่ายหมดแล้วจะแสดงผลที่นี่ในวันจัดงาน</div>}
    <AccountCard /></div>);
}

/* ---------- door: scan ---------- */
const CamFrame = () => <svg className="frame" viewBox="0 0 100 100" aria-hidden="true" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M2 18V6a4 4 0 0 1 4-4h12M82 2h12a4 4 0 0 1 4 4v12M98 82v12a4 4 0 0 1-4 4H82M18 98H6a4 4 0 0 1-4-4V82" /></svg>;
export function OrgGate() {
  const e = orgEv(S.org.oev);
  useEffect(() => { if (e && live() && !(S.org.liveGate && S.org.liveGate.id === e.id)) O.liveGateLoad(); return () => { O.camStop(); }; }, [e && e.id]);
  if (!e) return null;
  const isLive = live(), t = S.org.gtab || "scan";
  const g = isLive ? (S.org.liveGate && S.org.liveGate.id === e.id ? S.org.liveGate : null) : O.gateStats(e);
  const pct = g && g.total ? (g.used * 100) / g.total : 0;
  const tabs = isLive ? [["scan", "สแกน QR Code"], ["log", "ประวัติการตรวจสอบ"]] : [["scan", "สแกน QR Code"], ["search", "ค้นหาจากชื่อ"], ["log", "ประวัติการตรวจสอบ"]];
  return (<div className="wrap narrow-w">
    <button className="crumb m-hide" onClick={() => go("orgGatePick")}><Icon id="i-back" />เลือกอีเวนต์</button>
    <div className="gcount"><span className="small muted">{e.name}</span>
      <div className="num" aria-live="polite">{g ? `บันทึกเข้างานแล้ว ${g.used} / ${g.total} คน` : "กำลังโหลดข้อมูล…"}</div>
      <PBar pct={pct} label={`บันทึกเข้างานแล้ว ${Math.round(pct)}%`} /></div>
    <div className={"seg" + (tabs.length === 3 ? " three" : "")} role="tablist">{tabs.map(([k, v]) => (
      <button key={k} role="tab" aria-selected={t === k} className={t === k ? "on" : ""} onClick={() => { if (k !== "scan") O.camStop(); S.org.gtab = k; emit(); }}>{v}</button>))}</div>
    {t === "scan" && (isLive ? <LiveScan /> : <>
      <div className="cam" role="img" aria-label="กล้องสแกน (ระบบจำลอง)"><CamFrame /><span className="line" /><span className="hint2">หันกล้องไปยัง QR Code ของผู้ซื้อ · ระบบจำลอง ไม่มีการเปิดใช้งานกล้องจริง</span></div>
      <button className="btn" onClick={O.simOpen} style={{ minHeight: 64, fontSize: 18, borderRadius: 12 }}>จำลองกระบวนการสแกน</button>
      <div className="small muted">QR Code ของผู้ถือบัตรจะเปลี่ยนแปลงทุก 60 วินาที จึงไม่สามารถใช้ภาพแคปหน้าจอแทนได้</div></>)}
    {t === "search" && <GateSearch e={e} />}
    {t === "log" && <GateLog e={e} />}
  </div>);
}
function LiveScan() {
  const [code, setCode] = useState(""), on = O.camOn();
  return (<>
    <div className="cam"><div id="gate-reader" style={{ position: "absolute", inset: 0 }} />{!on && <CamFrame />}
      <span className="hint2">{on ? "จัดวาง QR Code ให้อยู่ภายในกรอบสแกน" : "คลิกเปิดกล้องเพื่อเริ่มกระบวนการสแกน"}</span></div>
    <button className="btn" onClick={() => (on ? O.camStop() : O.camStart("gate-reader"))} style={{ minHeight: 64, fontSize: 18, borderRadius: 12 }}>{on ? "ปิดการใช้งานกล้อง" : "เปิดใช้งานกล้อง"}</button>
    <form className="field" autoComplete="off" onSubmit={x => { x.preventDefault(); const v = code; setCode(""); O.gateCheck(v, true); }}>
      <label htmlFor="gate-code">ไม่พบอุปกรณ์กล้อง หรือใช้เครื่องมือสแกนแบบเชื่อมต่อภายนอก: กรุณาวางรหัส QR Code</label>
      <div className="row"><input id="gate-code" placeholder="JL1.…" value={code} onChange={x => setCode(x.target.value)} style={{ flex: 1 }} /><button className="btn" type="submit" style={{ width: "auto", padding: "10px 18px" }} disabled={!code.trim()}>ตรวจสอบ</button></div></form>
    <div className="small muted">QR Code ของผู้ถือบัตรจะเปลี่ยนแปลงทุก 60 วินาที จึงไม่สามารถใช้ภาพแคปหน้าจอแทนได้</div>
  </>);
}
function GateSearch({ e }: { e: any }) {
  const q = (S.org.gq || "").trim().toLowerCase(), q4 = q.replace(/\D/g, "");
  const rows = q ? evTickets(e.id).map((t: any) => ({ t, p: orgPerson(t.holderId) })).filter((r: any) => (r.p.name + " " + r.p.email + " " + r.t.ticketId).toLowerCase().includes(q) || (q4.length === 4 && String(r.p.phone).endsWith(q4))).slice(0, 20) : [];
  return (<>
    <div className="field"><label htmlFor="gq">ค้นหาผู้เข้าร่วมงาน</label><input id="gq" type="search" autoComplete="off" value={S.org.gq || ""} onChange={x => { S.org.gq = x.target.value; emit(); }} placeholder="ค้นหาจาก ชื่อ · อีเมล · หมายเลขบัตร · หมายเลขโทรศัพท์ 4 ตัวท้าย" /></div>
    <div aria-live="polite">{!q ? <div className="empty">พิมพ์ชื่อ อีเมล หมายเลขบัตร หรือเบอร์โทรศัพท์ 4 ตัวท้าย</div> : !rows.length ? <div className="empty">ไม่พบบัตรเข้าชมที่ตรงกับคำค้นหา</div>
      : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{rows.map(({ t, p }: any) => (
        <div key={t.ticketId} className="card row between"><div style={{ minWidth: 0 }}><b>{p.name}</b><div className="small muted">{O.maskEmail(p.email || "")} · {(e.zones.find((z: any) => z.id === t.zoneId) || {}).name || ""}</div><div className="mono small">{t.ticketId}</div></div>
          {t.status === "used" ? <span className="pill grey">เช็กอินแล้ว {OL.thaiTime(t.usedAt)} น.</span>
            : ["valid", "listed"].includes(t.status) ? <button className="btn" style={{ width: "auto", padding: "10px 16px", fontSize: 15 }} onClick={() => O.manualIn(t.ticketId)}>บันทึกเช็กอิน</button>
            : <span className="pill">{O.TICKET_STATUS[t.status] || t.status}</span>}</div>))}</div>}</div>
  </>);
}
function GateLog({ e }: { e: any }) {
  if (live()) {
    const g = S.org.liveGate && S.org.liveGate.id === e.id ? S.org.liveGate : null;
    if (!g) return <div className="empty">กำลังโหลดข้อมูล…</div>;
    return g.scans.length ? (<div style={{ overflowX: "auto" }}><table className="org-table"><thead><tr><th scope="col">เวลาที่ทำรายการ</th><th scope="col">บัตรเข้าชม</th><th scope="col">ผลการตรวจสอบ</th><th scope="col">เหตุผล</th><th scope="col">เจ้าหน้าที่ผู้สแกน</th></tr></thead>
      <tbody>{g.scans.map((l: any, i: number) => <tr key={i}><th scope="row">{OL.thaiTime(l.at)}</th><td style={{ textAlign: "left" }} className="num">{l.tokenId != null ? "#" + l.tokenId : "—"}{l.zone ? " · " + l.zone : ""}</td>
        <td style={{ textAlign: "left" }}>{l.valid ? "ผ่านการตรวจสอบ" : "ไม่ผ่านการตรวจสอบ"}</td><td style={{ textAlign: "left" }}>{l.valid ? "—" : O.LIVE_REASON[l.reason] || l.reason || ""}</td><td style={{ textAlign: "left" }}>{l.staff || ""}</td></tr>)}</tbody></table></div>)
      : <div className="empty">ยังไม่มีประวัติการสแกนในอีเวนต์นี้</div>;
  }
  const rows = S.org.checkinLog.filter((l: any) => l.eventId === e.id).slice(0, 20);
  return rows.length ? (<div style={{ overflowX: "auto" }}><table className="org-table"><thead><tr><th scope="col">เวลาที่ทำรายการ</th><th scope="col">ผลการตรวจสอบ</th><th scope="col">เหตุผล</th><th scope="col">วิธีการดำเนินการ</th><th scope="col">ผู้ปฏิบัติงาน</th></tr></thead>
    <tbody>{rows.map((l: any, i: number) => <tr key={i}><th scope="row">{OL.thaiTime(l.at)}</th><td style={{ textAlign: "left" }}>{l.valid ? "ผ่านการตรวจสอบ" : "ไม่ผ่านการตรวจสอบ"}</td><td style={{ textAlign: "left" }}>{l.valid ? "—" : OL.reasonText(l.reason)}</td>
      <td style={{ textAlign: "left" }}>{l.method === "manual" ? "บันทึกเช็กอินด้วยตนเอง" : "สแกนผ่านระบบ"}</td><td style={{ textAlign: "left" }}>{l.by}</td></tr>)}</tbody></table></div>)
    : <div className="empty">ยังไม่มีประวัติการสแกนในรอบเวลานี้</div>;
}

/* ---------- finance ---------- */
export function OrgFinance() {
  const o = S.org, now = Date.now(), sh = o.shop;
  const rows = O.myEvents().filter((e: any) => e.status !== "draft").map((e: any) => O.finRow(e, now)).sort((a: any, b: any) => (b.e.startAt || 0) - (a.e.startAt || 0));
  if (o.printEv) { const r = rows.find((x: any) => x.e.id === o.printEv); if (r) return <FinPrint r={r} />; }
  const sum = (f: (r: any) => boolean) => rows.filter(f).reduce((a: number, r: any) => a + r.net, 0);
  const mine = myEventIds(), refunded = o.ledger.filter((l: any) => l.type === "REFUND_OUT" && mine.has(l.eventId)).reduce((a: number, l: any) => a + l.amount, 0);
  const stat = (label: string, v: string, sub: string) => <div className="stat"><span>{label}</span><b className="num">{v}</b><small>{sub}</small></div>;
  const csvAll = () => O.downloadCsv("รายอีเวนต์การเงิน" + sh.id + ".csv", [["อีเวนต์", "วันที่จัดงาน", "สถานะการทำรายการ", "ยอดจำหน่ายรวม (บาท)", "ค่าธรรมเนียมบริการ (บาท)", "รายรับสุทธิ (บาท)", "ยอดคืนเงินผู้ซื้อ (บาท)", "วันที่รับเงิน"],
    ...rows.map((r: any) => [r.e.name, r.e.startAt ? OL.thaiDate(r.e.startAt) : "", r.label, r.gross / 100, r.fee / 100, r.net / 100, r.refunded / 100, r.payAt ? OL.thaiDate(r.payAt) : ""])]);
  return (<div className="wrap org"><OrgHead title="ระบบการเงิน" action={<button className="btn ghost" onClick={csvAll}>ส่งออกข้อมูลเป็นไฟล์ CSV</button>} />
    <div className="stats">{stat("ยอดรอการจ่ายรวม", B(sum(r => !r.paid && r.kind !== "cancelled")), "รายการอีเวนต์ที่ยังไม่สิ้นสุดหรืออยู่ระหว่างรอบการตรวจสอบ")}{stat("ดำเนินการจ่ายแล้ว", B(sum(r => r.paid)), "โอนเข้าบัญชี PromptPay เรียบร้อยแล้ว")}
      {stat("ค่าธรรมเนียมบริการรวม", B(rows.reduce((a: number, r: any) => a + r.fee, 0)), "5฿ + 3% ต่อใบ")}{stat("คืนเงินให้แก่ผู้ซื้อ", B(refunded), "ยอดจากอีเวนต์ที่ยกเลิก")}</div>
    <div className="pcard" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 16 }}><span className="acct-ic" aria-hidden="true"><svg><use href="#i-wallet" /></svg></span>
      <div style={{ flex: 1, minWidth: 160 }}><b>บัญชีรับเงิน (PromptPay)</b><div className="small muted mono">•••• •• {String(sh.payoutPromptPay || "").slice(-4)}</div></div>
      {sh.verification === "verified" ? <span className="pill ok">ผ่านการยืนยันแล้ว</span> : <span className="pill warn">อยู่ระหว่างรอการยืนยัน</span>}
      <p className="small muted" style={{ margin: 0, flexBasis: "100%" }}>เงินจะโอนเข้าบัญชีภายใน 24 ชั่วโมงหลังจบอีเวนต์ เผื่อกรณีการยกเลิกหรือมีข้อพิพาท หากอีเวนต์ถูกยกเลิก ระบบจะดำเนินการคืนเงินให้ผู้ซื้อแทนการโอนให้ร้านค้า (ข้อมูลจำลอง)</p></div>
    <h2 className="h2">รายงานสรุปแยกตามอีเวนต์</h2>
    <div className="fgrid">{rows.map((r: any) => { const open = !!(o.finOpen && o.finOpen[r.e.id]); return (
      <div key={r.e.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="row between" style={{ alignItems: "flex-start" }}><div style={{ minWidth: 0 }}><b>{r.e.name}</b><div className="small muted">{r.e.startAt ? OL.thaiDate(r.e.startAt) : ""}</div></div><span className={"pill " + (r.paid ? "ok" : r.kind === "cancelled" ? "danger" : "warn")}>{r.label}</span></div>
        <dl className="kv num" style={{ margin: 0 }}><dt>ยอดจำหน่าย</dt><dd>{B(r.gross)}</dd><dt>ค่าธรรมเนียมบริการ</dt><dd>{B(r.fee)}</dd>
          <dt style={{ color: "var(--ink)", fontWeight: 600 }}>{r.kind === "cancelled" ? "คืนเงินให้แก่ผู้ซื้อ" : "รายรับสุทธิ"}</dt><dd style={{ fontWeight: 700 }}>{r.kind === "cancelled" ? B(r.refunded) : B(r.net)}</dd>
          <dt>วันที่รับเงิน</dt><dd>{r.payAt ? OL.thaiDate(r.payAt) : "—"}</dd></dl>
        <div className="row"><button className="btn plain" style={{ padding: 9, fontSize: 14, minHeight: 44 }} aria-expanded={open} onClick={() => { o.finOpen = { ...(o.finOpen || {}), [r.e.id]: !open }; emit(); }}>รายการแยกตามรายใบ</button>
          <button className="btn plain" style={{ padding: 9, fontSize: 14, minHeight: 44 }} onClick={() => { o.printEv = r.e.id; emit(); }}>พิมพ์รายงานสรุป</button></div>
        {open && <FinDetail r={r} />}
      </div>); })}</div>
  </div>);
}
function FinDetail({ r }: { r: any }) {
  const e = r.e; if (r.kind === "cancelled") return <div className="small muted">อีเวนต์นี้ถูกยกเลิกแล้ว ผู้ซื้อทุกท่านได้รับเงินคืนตามยอดที่ชำระจริง</div>;
  const multi = r.tickets.filter((t: any) => t.hops.length > 1), single = r.tickets.filter((t: any) => t.hops.length === 1 && t.hops[0].paid > 0);
  const price = (t: any) => (e.zones.find((z: any) => z.id === t.zoneId) || { price: 0 }).price;
  const singleNet = single.reduce((a: number, t: any) => a + OL.settleTicket(t, price(t)).shopNet, 0);
  return (<div className="small" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <div>ตั๋วขายครั้งเดียว {single.length} ใบ · ร้านได้ {B(singleNet)}</div>
    {multi.length > 0 && <div style={{ overflowX: "auto" }}><table className="org-table"><thead><tr><th scope="col">บัตรที่มีการขายต่อ</th><th scope="col">รายรับส่วนของร้านค้า</th><th scope="col">ค่าธรรมเนียมบริการ</th><th scope="col">สัดส่วนรายรับของผู้ขายแต่ละรอบ</th><th scope="col">ค่าคอมมิชชัน 6%</th></tr></thead>
      <tbody>{multi.map((t: any) => { const s = OL.settleTicket(t, price(t)); return <tr key={t.ticketId}><th scope="row" className="mono">{t.ticketId}</th><td>{B(s.shopNet)}</td><td>{B(s.shopFee)}</td>
        <td style={{ textAlign: "left" }}>{s.sellerPayouts.map((p: any, i: number) => <div key={i}>{orgPerson(p.payerId).name} {B(p.amount)}</div>)}</td><td>{B(s.commission)}</td></tr>; })}</tbody></table></div>}
  </div>);
}
function FinPrint({ r }: { r: any }) {
  const sh = S.org.shop, e = r.e;
  return (<div className="org-printdoc">
    <div className="row between no-print"><button className="btn plain" style={{ width: "auto", padding: "9px 14px", fontSize: 14 }} onClick={() => { S.org.printEv = null; emit(); }}>กลับสู่หน้าก่อนหน้า</button>
      <button className="btn" style={{ width: "auto", padding: "9px 18px", fontSize: 14 }} onClick={() => window.print()}>พิมพ์ / บันทึกเอกสารเป็น PDF</button></div>
    <h1 style={{ fontSize: 22 }}>เอกสารสรุปรายการทางบัญชี</h1>
    <p className="small muted" style={{ margin: 0 }}>เอกสารสรุปจากระบบ JONGLOEI สำหรับใช้ประกอบการจัดทำบัญชีภายใน <b>มิใช่ใบกำกับภาษี</b> · ข้อมูลตัวอย่างสำหรับสาธิต</p>
    <dl className="kv card" style={{ margin: 0 }}><dt>ผู้จัดงาน</dt><dd>{sh.name}</dd><dt>อีเวนต์</dt><dd>{e.name}</dd><dt>วันที่จัดงาน</dt><dd>{e.startAt ? O.whenText(e.startAt) : "—"}</dd>
      <dt>สถานะอีเวนต์</dt><dd><StatusPill s={e.status} /></dd><dt>ออกเอกสารรายงาน</dt><dd>{OL.thaiDate(Date.now())}</dd></dl>
    <dl className="kv card num" style={{ margin: 0 }}>{r.kind === "cancelled"
      ? <><dt>เหตุผลในการยกเลิก</dt><dd>{e.cancelReason || "—"}</dd><dt>ยอดคืนเงินผู้ซื้อ</dt><dd>{B(r.refunded)}</dd><dt>ยอดเงินที่ร้านค้าได้รับ</dt><dd>—</dd></>
      : <><dt>จำนวนบัตรที่จำหน่ายได้</dt><dd>{r.tickets.filter((t: any) => t.hops[0] && t.hops[0].paid > 0).length} ใบ</dd><dt>ยอดจำหน่ายรวมทั้งหมด</dt><dd>{B(r.gross)}</dd><dt>ค่าธรรมเนียมบริการ (5฿ + 3% ต่อใบ)</dt><dd>{B(r.fee)}</dd>
        <dt style={{ color: "var(--ink)", fontWeight: 600 }}>รายรับสุทธิ</dt><dd style={{ fontWeight: 700 }}>{B(r.net)}</dd><dt>วันที่รับเงิน</dt><dd>{r.payAt ? OL.thaiDate(r.payAt) : "—"} ({r.label})</dd></>}</dl>
  </div>);
}
export { posterStyle, imgCls, toast };
