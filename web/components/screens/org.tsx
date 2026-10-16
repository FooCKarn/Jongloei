"use client";
// Organizer screens, ported from the mock-up's ORG_VIEWS. Demo actions say "(ข้อมูลจำลอง)"; the real shop calls /api/org/*.
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
const NewBtn = () => <button className="btn" onClick={O.newEvent}><svg width="18" height="18"><use href="#i-plus" /></svg>สร้างงานใหม่</button>;
const busy = () => !!S.busy;

/* ---------- welcome ---------- */
export function OrgWelcome() {
  return (<>
    <section className="ohero"><div className="in"><h1>ขายตั๋วโดยไม่ต้องตรวจสลิป ไม่ต้องตามเงินคืนเอง</h1>
      <p>สำหรับร้าน บาร์ ผู้จัด pop-up ครู workshop และทีมจัดแฟนมีต ที่ไม่มีทีมไอที ตั้งงานเสร็จในไม่กี่นาที</p>
      {S.auth.google ? <><div className="acts"><button className="pri" onClick={O.orgLiveStart} disabled={busy()}>สมัครร้านหรือเข้าสู่ระบบด้วย Google</button><button className="sec" onClick={() => O.orgChooser("signup")}>ลองเดโม</button></div>
        <p className="small">{S.signedIn ? "ใช้บัญชี " + S.user.email + " ที่เข้าสู่ระบบอยู่" : "ระบบจะพาไปเข้าสู่ระบบ Google ก่อน"} · ร้านและงานถูกบันทึกจริง ส่วนเดโมเก็บข้อมูลไว้ในเบราว์เซอร์นี้</p></>
        : <><div className="acts"><button className="pri" onClick={() => O.orgChooser("signup")}>สมัครร้าน</button><button className="sec" onClick={() => O.orgChooser("login")}>เข้าสู่ระบบผู้จัด</button></div>
          <p className="small">เดโม: ข้อมูลเก็บไว้ในเบราว์เซอร์นี้เท่านั้น</p></>}</div></section>
    <div className="wrap"><div className="wgrid">
      <section aria-labelledby="h-why" style={{ display: "flex", flexDirection: "column", gap: 16 }}><h2 id="h-why" className="h2">สิ่งที่ระบบทำแทนคุณ</h2>
        <ol className="benefits">
          <li><span className="n num">1</span><div><b>ตรวจเงินให้เอง</b><p>ผู้ซื้อจ่ายผ่าน PromptPay ระบบยืนยันยอดกับผู้ให้บริการชำระเงิน ไม่ต้องเปิดดูสลิปทีละใบ</p></div></li>
          <li><span className="n num">2</span><div><b>ยกเลิกงานแล้วคืนเงินให้ทุกคน</b><p>ฝนตก ศิลปินป่วย กดยกเลิกครั้งเดียว ผู้ซื้อทุกคนได้เงินคืนเท่าที่จ่ายจริงอัตโนมัติ</p></div></li>
          <li><span className="n num">3</span><div><b>ไม่มีตั๋วผี ไม่มีราคาโก่ง</b><p>ตั๋วขายต่อได้เฉพาะในระบบ ราคาไม่เกิน 1.25 เท่า และสแกนเข้างานได้แค่คนที่ถือตั๋วจริง</p></div></li>
        </ol></section>
      <div className="vstack" style={{ gap: 16 }}>
        <aside className="pcard" aria-labelledby="h-fee"><h2 id="h-fee" style={{ fontSize: 18 }}>ค่าบริการ</h2><p style={{ margin: 0 }}>5 บาท + 3% ต่อใบ เก็บจากร้าน ผู้ซื้อไม่เสียเพิ่ม</p>
          <dl className="fee num"><dt>ตั๋ว</dt><dd>1,000฿</dd><dt>ค่าบริการ</dt><dd>35฿</dd><dt className="t">คุณได้รับต่อใบ</dt><dd>965฿</dd></dl>
          <p className="small muted" style={{ margin: 0 }}>ไม่มีค่าแรกเข้า ไม่มีรายเดือน รับเงิน 24 ชม. หลังงานจบ</p></aside>
        <div className="pcard"><b className="small">ลองด้วยบัญชีตัวอย่าง (เดโม)</b>
          <button className="btn plain" onClick={() => O.orgLoginAs("owner@rooftop88.example")}>เจ้าของร้าน Rooftop 88</button>
          <button className="btn plain" onClick={() => O.orgLoginAs("manager@example.com")}>ผู้จัดการ</button>
          <button className="btn plain" onClick={() => O.orgLoginAs("door.staff@example.com")}>พนักงานหน้างาน</button></div>
      </div>
    </div></div>
  </>);
}

/* ---------- onboarding ---------- */
export function OrgOnboard() {
  const ob = S.org.onboard || (S.org.onboard = { step: 1, data: {}, err: {} }), d = ob.data, e = ob.err || {};
  const set = (k: string) => (x: any) => { d[k] = x.target.value; emit(); };
  const labels = ["ข้อมูลร้าน", "ผู้ขาย", "บัญชีรับเงิน", "ยืนยันตัวตน"];
  return (<div className="wrap narrow-w">
    <div className="titlerow"><button className="back" onClick={O.obBack} aria-label="ย้อนกลับ"><svg><use href="#i-back" /></svg></button><h1>สมัครเป็นผู้จัดงาน</h1></div>
    {live() ? <p className="small muted" style={{ margin: 0 }}>ใส่ข้อมูลร้านแล้วกดเปิดร้าน ทีมงาน JONGLOEI จะยืนยันร้านก่อนเผยแพร่งานได้</p> : <LineSteps labels={labels} cur={ob.step} />}
    {ob.step === 1 && <><h2 style={{ fontSize: 18 }}>ข้อมูลร้าน</h2>
      <Fld id="ob-name" label="ชื่อร้านหรือชื่อผู้จัด" err={e.name}><input id="ob-name" value={d.name || ""} onChange={set("name")} autoComplete="organization" {...errA("ob-name", e.name)} /></Fld>
      <Fld id="ob-kind" label="ประเภท"><select id="ob-kind" value={d.kind || "bar"} onChange={set("kind")}>{O.SHOP_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Fld>
      <Fld id="ob-line" label="LINE OA (ไม่บังคับ)" hint="เช่น @rooftop88 ผู้ซื้อจะเห็นในหน้างาน"><input id="ob-line" value={d.line || ""} onChange={set("line")} {...errA("ob-line", "", true)} /></Fld>
      <Fld id="ob-phone" label="เบอร์โทรติดต่อ" err={e.phone}><input id="ob-phone" type="tel" inputMode="tel" autoComplete="tel" value={d.phone || ""} onChange={set("phone")} {...errA("ob-phone", e.phone)} /></Fld></>}
    {ob.step === 2 && <><h2 style={{ fontSize: 18 }}>ผู้ขาย</h2>
      <Fld id="ob-legal" label="ขายในนาม"><select id="ob-legal" value={d.legal || "individual"} onChange={set("legal")}><option value="individual">บุคคลธรรมดา</option><option value="company">นิติบุคคล (บริษัท / หจก.)</option></select></Fld>
      <Fld id="ob-tax" label="เลขประจำตัวผู้เสียภาษี" err={e.tax} hint="บุคคลธรรมดาใช้เลขบัตรประชาชน 13 หลัก"><input id="ob-tax" inputMode="numeric" maxLength={17} value={d.taxId || ""} onChange={set("taxId")} {...errA("ob-tax", e.tax, true)} /></Fld></>}
    {ob.step === 3 && <><h2 style={{ fontSize: 18 }}>บัญชีรับเงิน</h2>
      <Fld id="ob-pp" label="พร้อมเพย์สำหรับรับเงินจากการขาย" err={e.pp} hint="เบอร์มือถือ 10 หลัก หรือเลข 13 หลัก"><input id="ob-pp" inputMode="numeric" value={d.pp || ""} onChange={set("pp")} {...errA("ob-pp", e.pp, true)} /></Fld>
      <div className="card small" style={{ display: "flex", flexDirection: "column", gap: 6 }}><b>ชื่อบัญชีต้องตรงกับชื่อผู้ขายที่ยืนยัน</b>
        <span className="muted">เงินจากงานจะโอนเข้าบัญชีนี้ 24 ชั่วโมงหลังงานจบ ถ้างานถูกยกเลิก ระบบคืนเงินผู้ซื้อแทนการโอนให้ร้าน</span>
        <span className="pill warn" style={{ alignSelf: "flex-start" }}>จำลอง: ยังไม่ตรวจบัญชีจริง</span></div></>}
    {ob.step === 4 && <><h2 style={{ fontSize: 18 }}>ยืนยันตัวตน</h2>
      <p className="small muted" style={{ margin: 0 }}>แนบรูปบัตรประชาชน (บุคคลธรรมดา) หรือหนังสือรับรองบริษัท (นิติบุคคล) เพื่อป้องกันร้านปลอม ผู้ซื้อจะเห็นเครื่องหมาย &quot;ยืนยันแล้ว&quot; ที่หน้างานของคุณ</p>
      <div className="field"><label htmlFor="ob-doc">เอกสาร</label><input id="ob-doc" type="file" accept="image/*,.pdf" aria-describedby="ob-doc-err" onChange={x => { const f = x.target.files && x.target.files[0]; d.docName = f ? f.name : ""; ob.err = {}; emit(); }} />
        {d.docName && <span className="hint">เลือกแล้ว: {d.docName}</span>}<span className="hint err" id="ob-doc-err" role="alert">{e.doc || ""}</span></div>
      <span className="pill warn" style={{ alignSelf: "flex-start" }}>จำลอง: ไฟล์ไม่ถูกอัปโหลด ระบบอนุมัติให้ใน 3 วินาที</span></>}
    <div className="row"><button className="btn plain" onClick={O.obBack}>{ob.step === 1 || live() ? "ยกเลิก" : "ย้อนกลับ"}</button>
      {ob.step < 4 ? <button className="btn" onClick={O.obNext} disabled={busy()}>{live() ? "เปิดร้าน" : "ถัดไป"}</button> : <button className="btn" onClick={O.obSubmit}>ส่งยืนยันตัวตน</button>}</div>
  </div>);
}

/* ---------- team ---------- */
export function OrgTeam() {
  const sh = S.org.shop; const [email, setEmail] = useState(""), [role, setRole] = useState("gate");
  return (<div className="wrap org"><OrgHead title="ทีมงาน" /><div className="cols">
    <div className="col">
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>{sh.team.map((m: any, i: number) => (<div key={m.email}>{i > 0 && <hr className="sep" />}
        <div className="row between"><div style={{ minWidth: 0 }}><b>{m.email}{S.org.account && m.email === S.org.account.email ? " (คุณ)" : ""}</b><div className="small muted">{O.ROLE_LABEL[m.role]}</div></div>
          {m.role === "owner" ? <span className="pill grey">เจ้าของ</span> : <button className="btn plain" style={{ width: "auto", padding: "8px 12px", fontSize: 13 }} onClick={() => O.teamRemove(m.email)} aria-label={"ลบ " + m.email}>ลบ</button>}</div></div>))}</div>
      <h2 style={{ fontSize: 16 }}>สิทธิ์ของแต่ละบทบาท</h2>
      <dl className="kv card small" style={{ margin: 0 }}><dt>เจ้าของ</dt><dd>ทุกอย่าง รวมการเงินและทีมงาน</dd><dt>ผู้จัดการ</dt><dd>สร้าง/แก้งาน ดูยอดขาย เช็กอิน (ไม่เห็นการเงิน)</dd><dt>พนักงานหน้างาน</dt><dd>สแกนและเช็กอินเท่านั้น</dd></dl>
    </div>
    <div className="col cside">
      <h2 style={{ fontSize: 16 }}>เชิญสมาชิก</h2>
      <Fld id="team-email" label="อีเมล" err={S.org.teamErr}><input id="team-email" type="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} {...errA("team-email", S.org.teamErr)} /></Fld>
      <Fld id="team-role" label="บทบาท"><select id="team-role" value={role} onChange={e => setRole(e.target.value)}><option value="gate">พนักงานหน้างาน</option><option value="manager">ผู้จัดการ</option></select></Fld>
      <button className="btn" disabled={busy()} onClick={async () => { if (await O.teamInvite(email, role)) setEmail(""); }}>ส่งคำเชิญ</button>
      <button className="btn plain" onClick={O.copyInvite}>คัดลอกลิงก์เชิญ</button>
      {!live() && <div className="adv"><b className="small">เดโม: ดูในฐานะ</b><div className="seg three">{["owner", "manager", "gate"].map(r => (
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
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="group" aria-label="กราฟแท่งตั๋วที่ขายได้ต่อวัน 14 วันล่าสุด">
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
    <details className="small" style={{ marginTop: 6 }}><summary>ดูเป็นตาราง</summary>
      <table className="org-table"><thead><tr><th scope="col">วันที่</th><th scope="col">ตั๋ว (ใบ)</th><th scope="col">ยอดขาย</th></tr></thead>
        <tbody>{days.map(d => <tr key={d.day}><th scope="row">{dl(d.day)}</th><td className="num">{d.count}</td><td className="num">{B(d.amount)}</td></tr>)}</tbody></table></details>
  </div>);
}
export function OrgDash() {
  const sh = S.org.shop, now = Date.now(), mgr = S.org.role !== "owner", lock = "เฉพาะเจ้าของร้าน";
  const evs = O.myEvents(), counted = evs.filter((e: any) => ["on_sale", "sold_out", "paused", "ended"].includes(e.status));
  const net = counted.map(evSum).reduce((a: number, s: any) => a + s.net, 0), held = evs.reduce((a: number, e: any) => a + evSum(e).held, 0);
  const days = OL.salesByDay(S.org.tickets.filter((t: any) => counted.some((e: any) => e.id === t.eventId)), now, 14), today = days[days.length - 1];
  const nextPay = counted.map((e: any) => ({ e, at: OL.payoutAt(e) })).filter((x: any) => x.at && x.at > now).sort((a: any, b: any) => a.at - b.at)[0];
  const todo: any[] = [];
  if (sh.verification !== "verified") todo.push(<li key="v"><b>รอยืนยันร้าน</b><span className="small muted"> · เผยแพร่งานได้หลังยืนยันเสร็จ</span></li>);
  for (const e of evs.filter((x: any) => x.status === "draft")) todo.push(<li key={"d" + e.id}><b>{e.name || "ร่างไม่มีชื่อ"}</b><span className="small muted"> · ร่างที่ยังไม่เผยแพร่</span> <button className="linkbtn" onClick={() => O.editEvent(e.id)}>แก้ไข</button></li>);
  for (const e of evs.filter((x: any) => x.status === "on_sale" && x.startAt - now < DAY && x.endAt > now)) todo.push(<li key={"g" + e.id}><b>{e.name}</b><span className="small muted"> · เริ่ม{e.startAt <= now ? "แล้ว" : "ภายใน 24 ชม."}</span> <button className="linkbtn" onClick={() => O.gate(e.id)}>เปิดหน้างาน</button></li>);
  for (const e of evs.filter((x: any) => x.status === "on_sale")) {
    const s = evSum(e), paid = e.zones.filter((z: any) => z.kind !== "comp"), pc = paid.reduce((a: number, z: any) => a + z.capacity, 0), ptk = paid.reduce((a: number, z: any) => a + z.sold + z.held, 0);
    if (pc && ptk / pc >= 0.9) todo.push(<li key={"f" + e.id}><b>{e.name}</b><span className="small muted"> · ตั๋วเหลือ {s.remaining} ที่ ใกล้เต็ม</span></li>);
  }
  const stat = (label: string, v: string, sub: string, locked?: boolean) => <div className={"stat" + (locked ? " locked" : "")}><span>{label}</span><b className="num">{v}</b><small>{sub}</small></div>;
  return (<div className="wrap org"><OrgHead title="ภาพรวม" action={<NewBtn />} />
    {sh.verification !== "verified" && <div className="alert warn" role="status"><Icon id="i-alert" /><div><b>ร้านรอยืนยันตัวตน</b><br />สร้างร่างงานได้ตามปกติ ปุ่มเผยแพร่จะใช้ได้หลัง{live() ? "ทีมงาน JONGLOEI " : "ทีมงาน"}ยืนยันร้านแล้ว</div></div>}
    {live() && <div className="alert" role="note"><Icon id="i-info" /><div>ระบบจริงยังไม่ส่งยอดขายรายวันมาที่หน้านี้ ตัวเลขด้านล่างนับจากโซนของแต่ละงาน</div></div>}
    <div className="stats">{stat("ตั๋วที่ขายวันนี้", today.count + " ใบ", B(today.amount))}
      {stat("รายรับสุทธิรวม", mgr ? "—" : B(net), mgr ? lock : "หลังหักค่าบริการ", mgr)}
      {stat("เงินที่จะได้รับครั้งถัดไป", mgr ? "—" : nextPay ? B(evSum(nextPay.e).net) : "—", mgr ? lock : nextPay ? OL.thaiDate(nextPay.at) + " · หลังงานจบ 24 ชม." : "ยังไม่มีงานรอจ่าย", mgr)}
      {stat("ที่นั่งที่กำลังถูก Hold", held + " ที่", "ปล่อยคืนเองถ้าไม่จ่ายใน 10 นาที")}</div>
    <div className="split84">
      <section className="ocard2" aria-labelledby="chart-h"><div className="row between"><h2 id="chart-h" style={{ fontSize: 17 }}>ตั๋วที่ขายได้ 14 วันล่าสุด</h2><span className="small muted num">รวม {days.reduce((a: number, d: any) => a + d.count, 0)} ใบ</span></div><Chart days={days} /></section>
      <section className="ocard2" aria-labelledby="todo-h"><h2 id="todo-h">ต้องทำตอนนี้</h2>{todo.length ? <ul className="org-todo">{todo}</ul> : <div className="small muted">ไม่มีอะไรค้าง</div>}</section>
    </div>
    <AccountCard /></div>);
}

/* ---------- event list ---------- */
function OrgEvCard({ e }: { e: any }) {
  const s = evSum(e), pct = s.capacity ? Math.min(100, Math.round(((s.sold + s.held) * 100) / s.capacity)) : 0;
  return (<article className="oev">
    <div className="oev-top"><button className="oev-open" onClick={() => O.orgOpenEvent(e.id)}><Thumb e={thumbOf(e)} />
      <span className="oev-info"><b>{e.name || "ร่างไม่มีชื่อ"}</b><span className="small muted num">{O.whenText(e.startAt)}</span><StatusPill s={e.status} /></span></button>
      <button className="oev-menu" onClick={() => O.evMenu(e.id)} aria-label={"เมนูงาน " + e.name} aria-haspopup="menu"><svg><use href="#i-dots" /></svg></button></div>
    {e.status === "draft" ? <p className="small muted" style={{ margin: 0 }}>ยังไม่เผยแพร่ · {e.zones.length} โซน ความจุ {s.capacity} ที่</p>
      : <div className="pbar"><div className="row between small num"><span className="muted">ขายแล้ว</span><span>{s.sold} / {s.capacity}</span></div>
        <PBar pct={pct} label={"ขายแล้ว " + pct + "%"} />
        <div className="small muted num" style={{ textAlign: "right" }}>รายรับสุทธิ {B(s.net)}</div></div>}
  </article>);
}
export function OrgEvents() {
  const f = S.org.evFilter || "all", all = O.myEvents();
  const match = (e: any, k: string) => k === "all" || e.status === k || (k === "on_sale" && ["sold_out", "paused"].includes(e.status));
  const filters = [["all", "ทั้งหมด"], ["on_sale", "เปิดขาย"], ["draft", "ร่าง"], ["ended", "จบแล้ว"], ["cancelled", "ยกเลิก"]];
  const list = all.filter((e: any) => match(e, f));
  return (<div className="wrap org"><OrgHead title="งานของฉัน" action={S.org.role !== "gate" && <NewBtn />} />
    <div className="chips" role="group" aria-label="กรองตามสถานะ">{filters.map(([k, v]) => (
      <button key={k} className={"chip " + (f === k ? "on" : "")} aria-pressed={f === k} onClick={() => { S.org.evFilter = k; emit(); }}>{v} <span className="num">{all.filter((e: any) => match(e, k)).length}</span></button>))}</div>
    {list.length ? <div className="oevgrid">{list.map((e: any) => <OrgEvCard key={e.id} e={e} />)}</div>
      : <div className="empty">ไม่มีงานในสถานะนี้ ลองเลือกสถานะอื่น หรือ<button className="linkbtn" onClick={O.newEvent}>สร้างงานใหม่</button></div>}
  </div>);
}

/* ---------- poster picker: picture upload + gradient fallback ---------- */
function PosterPicker({ e, onFile, onSwatch, id }: { e: any; onFile: (f: File | null) => void; onSwatch: (i: number) => void; id: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const pick = (f?: File | null) => { if (f) onFile(f); if (input.current) input.current.value = ""; };
  return (<div className="field upl"><span className="eyebrow" id={id + "-l"}>โปสเตอร์</span>
    {e.image ? <div className="upl-prev" style={{ backgroundImage: `url("${e.image}")` }} role="img" aria-label="รูปโปสเตอร์ที่อัปโหลด" />
      : <button type="button" className="upl-drop" style={drag ? { boxShadow: "inset 0 0 0 2.5px var(--red)", background: "var(--surface-2)" } : undefined}
        onClick={() => input.current?.click()} onDragOver={x => { x.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={x => { x.preventDefault(); setDrag(false); pick(x.dataTransfer.files[0]); }} aria-describedby={id + "-h"}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
        <b>อัปโหลดรูปโปสเตอร์</b><span className="small muted">ลากรูปมาวาง หรือกดเพื่อเลือกไฟล์</span></button>}
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={x => pick(x.target.files && x.target.files[0])} aria-label="เลือกรูปโปสเตอร์" />
    <span className="hint" id={id + "-h"}>JPG, PNG หรือ WebP ระบบย่อเหลือไม่เกิน 1200 px ให้อัตโนมัติ{live() ? "" : " · เดโมเก็บรูปไว้ในเบราว์เซอร์นี้"}</span>
    {e.image && <div className="row" style={{ flexWrap: "wrap" }}><button type="button" className="btn plain" style={{ width: "auto", padding: "9px 14px", fontSize: 14 }} onClick={() => input.current?.click()} disabled={busy()}>เปลี่ยนรูป</button>
      <button type="button" className="btn plain" style={{ width: "auto", padding: "9px 14px", fontSize: 14, color: "var(--danger-solid)" }} onClick={() => onFile(null)} disabled={busy()}>ลบรูป ใช้พื้นหลังสีแทน</button></div>}
    {!e.image && <><span className="small muted">หรือใช้พื้นหลังสี</span><div className="row" role="radiogroup" aria-labelledby={id + "-l"} style={{ flexWrap: "wrap" }}>
      {POSTERS.map((bg, i) => <button key={i} type="button" role="radio" className={"org-swatch " + (e.bg === bg ? "on" : "")} style={{ background: bg }} onClick={() => onSwatch(i)} aria-label={"พื้นหลังแบบที่ " + (i + 1)} aria-checked={e.bg === bg} />)}</div></>}
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
    <div className="row between"><span className="small muted">ขั้นที่ {o.wizStep} จาก 4 · {O.WIZ_STEPS[o.wizStep - 1]}</span><button className="linkbtn" onClick={O.wizSaveDraft} disabled={busy()}>บันทึกร่าง</button></div>
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
    <Fld id="w-name" label="ชื่องาน" err={errs.name}><input id="w-name" maxLength={80} value={d.name} onChange={e => set("name", e.target.value)} {...errA("w-name", errs.name)} /></Fld>
    <Fld id="w-short" label="ชื่อย่อบนโปสเตอร์ (ไม่บังคับ)" hint="ขึ้นบรรทัดใหม่ได้ ไม่เกิน 2 บรรทัด เช่น ROOFTOP แล้วขึ้นบรรทัด FRIDAY">
      <textarea id="w-short" rows={2} maxLength={30} value={d.short} onChange={e => set("short", e.target.value.split("\n").slice(0, 2).join("\n"))} {...errA("w-short", "", true)} /></Fld>
    <div className="field"><span className="eyebrow" id="w-cat-l">หมวด</span><div className="chips" role="radiogroup" aria-labelledby="w-cat-l">{O.EV_CATS.map(c => (
      <button key={c} type="button" role="radio" className={"chip " + (d.category === c ? "on" : "")} aria-checked={d.category === c} onClick={() => set("category", c)}>{c}</button>))}</div></div>
    <div className="field"><label htmlFor="w-desc" style={{ display: "flex", justifyContent: "space-between" }}>รายละเอียด <span className="muted small num">{d.description.length}/1000</span></label>
      <textarea id="w-desc" rows={4} maxLength={1000} value={d.description} onChange={e => set("description", e.target.value)} /></div>
    <Fld id="w-venue" label="สถานที่" err={errs.venue}><input id="w-venue" value={d.venue} onChange={e => set("venue", e.target.value)} {...errA("w-venue", errs.venue)} /></Fld>
    <Fld id="w-map" label="ลิงก์แผนที่ (ไม่บังคับ)" hint="ลิงก์ Google Maps"><input id="w-map" type="url" value={d.mapUrl} onChange={e => set("mapUrl", e.target.value)} {...errA("w-map", "", true)} /></Fld>
    <div className="field"><span className="eyebrow">เริ่มงาน</span>
      <DateTime id="w-start" label="เริ่มงาน" value={d.startAt} invalid={!!errs.startAt} describedBy="w-start-err" disabled={editing} defaultTime="19:00"
        onChange={v => { const shift = v && d.startAt ? v - d.startAt : 0; d.startAt = v; if (v && d.endAt && shift) d.endAt += shift; if (v && !d.endAt) d.endAt = v + 4 * 3600000; O.wizTouch(); }} />
      {editing && <span className="hint">งานที่เผยแพร่แล้วเปลี่ยนวันเริ่มได้ในแท็บตั้งค่าของงาน</span>}
      <span className="hint err" id="w-start-err" role="alert">{errs.startAt || ""}</span></div>
    <div className="field"><span className="eyebrow">จบงาน</span>
      <DateTime id="w-end" label="จบงาน" value={d.endAt} min={d.startAt} invalid={!!errs.endAt} describedBy="w-end-err w-end-h" quick={["00:00", "02:00", "04:00"]} defaultTime="23:00" onChange={v => set("endAt", v)} />
      <span className="hint" id="w-end-h">{dur ? `งานยาว ${dur} ชั่วโมง` + (O.whenText(d.endAt).slice(0, 12) !== O.whenText(d.startAt).slice(0, 12) ? " · จบวันถัดไป" : "") : ""}</span>
      <span className="hint err" id="w-end-err" role="alert">{errs.endAt || ""}</span></div>
    <div className="field"><span className="eyebrow">ประตูเปิด (ไม่บังคับ)</span>
      <DateTime id="w-doors" label="ประตูเปิด" value={d.doorsAt} quick={["18:00", "19:00", "20:30"]} defaultTime="18:00" describedBy="w-doors-h" onChange={v => set("doorsAt", v)} />
      <span className="hint" id="w-doors-h">ผู้ซื้อเห็นเวลานี้บนตั๋ว</span></div>
    <PosterPicker e={d} id="w-poster" onFile={O.wizSetPoster} onSwatch={i => set("bg", POSTERS[i])} />
  </>);
}
function WizZone({ z, i, n, errs }: { z: any; i: number; n: number; errs: Record<string, string> }) {
  const locked = O.zoneLocked(z), e = (k: string) => errs[`zones.${i}.${k}`], id = (k: string) => `z${i}-${k}`;
  const upd = (patch: any) => { Object.assign(z, patch); O.wizTouch(); };
  const priceText = z._priceText !== undefined ? z._priceText : z.price ? String(z.price / 100) : "";
  return (<div className="card org-zone" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <div className="row between"><b style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ width: 12, height: 12, borderRadius: 4, background: z.color }} />โซน {i + 1}{z.name ? " · " + z.name : ""}</b>
      <span className="row" style={{ gap: 4 }}><button className="iconbtn" onClick={() => O.wizZoneMove(i, -1)} aria-label={`เลื่อนโซน ${i + 1} ขึ้น`} disabled={i === 0}>↑</button>
        <button className="iconbtn" onClick={() => O.wizZoneMove(i, 1)} aria-label={`เลื่อนโซน ${i + 1} ลง`} disabled={i === n - 1}>↓</button>
        <button className="iconbtn" onClick={() => O.wizZoneDel(i)} aria-label={`ลบโซน ${i + 1}`} disabled={locked}><svg><use href="#i-x" /></svg></button></span></div>
    <Fld id={id("name")} label="ชื่อโซน" err={e("name")}><input id={id("name")} maxLength={40} value={z.name} onChange={x => upd({ name: x.target.value })} {...errA(id("name"), e("name"))} /></Fld>
    <div className="field"><span className="eyebrow" id={id("kind-l")}>ประเภท</span><div className="chips" role="radiogroup" aria-labelledby={id("kind-l")}>
      {(live() ? O.ZONE_KINDS.slice(0, 2) : O.ZONE_KINDS).map(([k, l]) => <button key={k} type="button" role="radio" className={"chip " + (z.kind === k ? "on" : "")} aria-checked={z.kind === k} disabled={locked}
        onClick={() => upd({ kind: k, price: k === "comp" ? 0 : z.price, seatsPerUnit: k === "table" ? z.seatsPerUnit || 4 : null })}>{l}</button>)}</div></div>
    <Fld id={id("price")} label="ราคา (บาท)" err={e("price")} hint={locked ? O.lockReason(z) : z.kind === "comp" ? "บัตรเชิญไม่มีราคา" : ""}>
      <input id={id("price")} inputMode="decimal" disabled={locked || z.kind === "comp"} value={z.kind === "comp" ? "0" : priceText}
        onChange={x => { const p = OL.toSatang(x.target.value.trim()); upd({ _priceText: x.target.value, price: Number.isNaN(p) ? 0 : p }); }} {...errA(id("price"), e("price"), true)} /></Fld>
    <Fld id={id("cap")} label={z.kind === "table" ? "จำนวนโต๊ะ" : "จำนวนที่ขาย"} err={e("capacity")}><input id={id("cap")} inputMode="numeric" value={String(z.capacity || "")}
      onChange={x => { const v = x.target.value.trim(), c = v === "" ? 0 : Number(v); upd({ capacity: Number.isNaN(c) ? 0 : c }); }} {...errA(id("cap"), e("capacity"))} /></Fld>
    {z.kind === "table" && !live() && <Fld id={id("seats")} label="ที่นั่งต่อโต๊ะ" err={e("seatsPerUnit")} hint="ผู้ซื้อ 1 คนจ่ายยอดเดียวต่อโต๊ะ">
      <input id={id("seats")} inputMode="numeric" value={String(z.seatsPerUnit || "")} onChange={x => upd({ seatsPerUnit: Number(x.target.value) || 0 })} {...errA(id("seats"), e("seatsPerUnit"), true)} /></Fld>}
    {!live() && <>
      <div className="field"><span className="eyebrow">เปิดขาย (ไม่บังคับ)</span><DateTime id={id("open")} label={`โซน ${i + 1} เปิดขาย`} value={z.saleStartAt} invalid={!!e("saleStartAt")} describedBy={id("open") + "-err"} defaultTime="10:00" onChange={v => upd({ saleStartAt: v })} />
        <span className="hint err" id={id("open") + "-err"} role="alert">{e("saleStartAt") || ""}</span></div>
      <div className="field"><span className="eyebrow">ปิดขาย (ไม่บังคับ)</span><DateTime id={id("close")} label={`โซน ${i + 1} ปิดขาย`} value={z.saleEndAt} min={z.saleStartAt} invalid={!!e("saleEndAt")} describedBy={id("close") + "-err " + id("close") + "-h"} defaultTime="23:00" onChange={v => upd({ saleEndAt: v })} />
        <span className="hint" id={id("close") + "-h"}>ทำ Early Bird ได้ด้วยการสร้างสองโซนที่ปิดขายคนละเวลา</span><span className="hint err" id={id("close") + "-err"} role="alert">{e("saleEndAt") || ""}</span></div></>}
    <div className="field"><span className="eyebrow" id={id("color-l")}>สีโซน</span><div className="zsw" role="radiogroup" aria-labelledby={id("color-l")}>
      {O.ZONE_COLORS.map(([c, l]) => <button key={c} type="button" role="radio" aria-checked={z.color === c} aria-label={l} title={l} style={{ background: c }} onClick={() => upd({ color: c })}>
        {z.color === c && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</button>)}</div></div>
  </div>);
}
function Summary({ d }: { d: any }) {
  const t = O.zoneTotals(d);
  return (<dl className="kv card num" style={{ margin: 0 }} aria-live="polite"><dt>ความจุรวม</dt><dd>{t.cap} ที่</dd><dt>รายได้สูงสุดที่เป็นไปได้</dt><dd>{B(t.rev)}</dd>
    <dt>ค่าบริการ (5฿ + 3% ต่อใบ)</dt><dd>{B(t.fees)}</dd><dt style={{ fontWeight: 600, color: "var(--ink)" }}>รายรับสุทธิสูงสุด</dt><dd style={{ fontWeight: 700, color: "var(--red)" }}>{B(t.net)}</dd></dl>);
}
function WizStep2({ d, errs }: { d: any; errs: Record<string, string> }) {
  return (<>
    {!O.wizOrig() && <div className="chips" role="group" aria-label="แม่แบบโซน"><span className="small muted" style={{ alignSelf: "center" }}>เริ่มจากแม่แบบ:</span>
      <button className="chip" onClick={() => O.wizTemplate("bar")}>บาร์ / ร้านอาหาร</button><button className="chip" onClick={() => O.wizTemplate("workshop")}>Workshop</button><button className="chip" onClick={() => O.wizTemplate("concert")}>คอนเสิร์ต</button></div>}
    <span className="hint err" id="zones" tabIndex={-1} role="alert">{errs.zones || ""}</span>
    {d.zones.map((z: any, i: number) => <WizZone key={z.id} z={z} i={i} n={d.zones.length} errs={errs} />)}
    <button className="btn plain" onClick={O.wizAddZone}><svg width="18" height="18"><use href="#i-plus" /></svg>เพิ่มโซน</button>
    <Summary d={d} />
  </>);
}
function WizStep3({ d, errs }: { d: any; errs: Record<string, string> }) {
  const p = d.params;
  return (<>
    {live() && <div className="card small" role="status"><b>ระบบจริงยังใช้กติกามาตรฐาน</b><br /><span className="muted">เพดานขายต่อและการปิดขายต่อยังไม่ถูกบันทึกในระบบจริง ค่าด้านล่างจึงยังไม่มีผล</span></div>}
    <label className="card row between" htmlFor="w-resale" style={{ cursor: "pointer" }}><span><b>เปิดให้ขายต่อในระบบ</b><br /><span className="small muted">ผู้ซื้อลงขายต่อได้เฉพาะบนแพลตฟอร์ม ผู้จัดไม่เสียเงินเพิ่มและไม่ได้ส่วนแบ่ง</span></span>
      <input type="checkbox" id="w-resale" checked={p.resaleEnabled} onChange={e => { p.resaleEnabled = e.target.checked; O.wizTouch(); }} style={{ width: 22, height: 22 }} /></label>
    <div className="field"><label htmlFor="w-capm">เพดานราคาขายต่อ <b>{p.capMultiplier.toFixed(2)} เท่า</b></label>
      <input id="w-capm" type="range" min={100} max={125} step={5} value={Math.round(p.capMultiplier * 100)} disabled={!p.resaleEnabled} onChange={e => { p.capMultiplier = Math.round(Number(e.target.value)) / 100; O.wizTouch(); }} aria-describedby="w-capm-err w-cap-example" />
      <span className="hint" id="w-cap-example">{O.capExample(d)}</span><span className="hint err" id="w-capm-err" role="alert">{errs.capMultiplier || ""}</span></div>
    <div className="card small" style={{ display: "flex", flexDirection: "column", gap: 6 }}><b>กติกาที่ระบบกำหนด (แก้ไม่ได้)</b>
      <span>• หน่วงขายต่อ 6 ชม. หลังได้ตั๋ว — กันคนกดซื้อแล้วพลิกขายทันที</span><span>• ปิดการโอน 1 ชม. ก่อนงานเริ่ม — ให้หน้างานตรวจเจ้าของตั๋วได้แน่นอน</span>
      <span>• ซื้อได้ไม่เกิน 4 ใบต่อคน — ลดการกวาดตั๋ว</span><span>• ร้านได้รับเงิน 24 ชม. หลังงานจบ — เผื่อยกเลิกหรือมีข้อพิพาท</span></div>
    <div className="card small"><b>นโยบายที่ผู้ซื้อเห็นก่อนจ่าย</b><br /><span className="muted">ยกเลิกงาน: คืนเงินอัตโนมัติเต็มจำนวน · ไม่มาร่วมงาน: ไม่คืนเงิน</span></div>
  </>);
}
function WizStep4({ d, errs }: { d: any; errs: Record<string, string> }) {
  const keys = Object.keys(errs), t = O.zoneTotals(d), unverified = S.org.shop.verification !== "verified";
  return (<>
    <dl className="kv card" style={{ margin: 0 }}><dt>ชื่องาน</dt><dd>{d.name || "—"}</dd><dt>วันเวลา</dt><dd>{d.startAt ? O.whenText(d.startAt) : "—"}</dd>
      <dt>สถานที่</dt><dd>{d.venue || "—"}</dd><dt>โปสเตอร์</dt><dd>{d.image ? "รูปที่อัปโหลด" : "พื้นหลังสี"}</dd><dt>โซน</dt><dd>{d.zones.length} โซน · {t.cap} ที่</dd>
      <dt>ขายต่อ</dt><dd>{d.params.resaleEnabled ? "เปิด · ไม่เกิน " + d.params.capMultiplier.toFixed(2) + " เท่า" : "ปิด"}</dd></dl>
    <Summary d={d} />
    {keys.length > 0 && <div className="card" role="alert"><b>ต้องแก้ {keys.length} เรื่องก่อนเผยแพร่</b><ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{keys.map(k => (
      <li key={k}>{errs[k]} <button className="linkbtn" onClick={() => O.wizJump(k)}>ไปแก้</button></li>))}</ul></div>}
    {unverified && <div className="card small" role="status"><b>เผยแพร่ได้หลังยืนยันร้าน</b><br /><span className="muted">บันทึกเป็นร่างไว้ก่อนได้ ระบบจะแจ้งเมื่อยืนยันเสร็จ</span></div>}
    <button className="btn" onClick={O.wizPublish} disabled={unverified || busy()}>{busy() ? "กำลังบันทึก…" : O.wizOrig() ? "บันทึกการแก้ไข" : "เผยแพร่งาน"}</button>
  </>);
}
function WizPreview({ d }: { d: any }) {
  const ev = { bg: d.bg, image: d.image, tag: d.category, short: O.shortOf(d) };
  return (<div style={{ display: "flex", flexDirection: "column", gap: 10 }}><span className="eyebrow">ผู้ซื้อจะเห็นแบบนี้</span><Poster e={ev} cls="lg" />
    <div><b style={{ fontSize: 17 }}>{d.name || "ชื่องาน"}</b><div className="small muted">{O.whenText(d.startAt)}</div><div className="small muted">{d.venue || "ยังไม่ระบุสถานที่"}</div></div>
    {d.zones.filter((z: any) => z.kind !== "comp").map((z: any) => <div key={z.id} className="row between small"><span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: z.color, marginRight: 6 }} />{z.name || "โซน"}</span><b className="num">{z.price ? B(z.price) : "—"}</b></div>)}
  </div>);
}
function WizDone() {
  const d = S.org.draft, base = typeof location !== "undefined" && location.origin && location.origin !== "null" ? location.origin : "https://jongloei.example";
  const link = base + "/event/?id=" + d.id;
  return (<div className="narrow"><div className="hero-ok"><div className="big"><svg><use href="#i-check" /></svg></div><h1 style={{ fontSize: 21 }}>{S.org.wizEdited ? "บันทึกการแก้ไขแล้ว" : "เผยแพร่งานแล้ว"}</h1>
    <p className="small muted" style={{ margin: 0 }}>{d.name} ขึ้นหน้าแรกของผู้ซื้อแล้ว</p></div>
    <div className="wallet-addr"><span className="mono">{link}</span><button className="iconbtn" onClick={() => O.copyText(link, "คัดลอกลิงก์แล้ว")} aria-label="คัดลอกลิงก์งาน"><svg><use href="#i-copy" /></svg></button></div>
    {!live() && <span className="pill warn" style={{ alignSelf: "center" }}>ลิงก์ใช้ได้ในเบราว์เซอร์นี้เท่านั้น (เดโม)</span>}
    <button className="btn" onClick={O.wizBuyerView}>ดูหน้างานแบบผู้ซื้อ</button>
    <button className="btn plain" onClick={() => { const id = d.id; S.org.wizStep = 1; S.org.draft = null; O.orgOpenEvent(id); }}>จัดการงานนี้</button>
    <button className="btn plain" onClick={O.wizToDash}>กลับภาพรวม</button></div>);
}

/* ---------- one event ---------- */
export function OrgEvent() {
  const e = orgEv(S.org.oev);
  if (!e) return null;
  const all = [["overview", "ภาพรวม"], ["buyers", "ผู้ซื้อ"], ["resale", "ขายต่อ"], ["extras", "โปรโมชัน"], ["settings", "ตั้งค่า"]];
  const tabs = live() ? all.filter(([k]) => ["overview", "buyers", "settings"].includes(k)) : all;
  const t = tabs.some(([k]) => k === S.org.etab) ? S.org.etab : "overview";
  const open = ["on_sale", "paused", "sold_out"].includes(e.status);
  return (<div className="wrap org">
    <button className="crumb m-hide" onClick={() => go("orgEvents")}><Icon id="i-back" />งานของฉัน</button>
    <div className="ehead"><div className="row1"><Thumb e={thumbOf(e)} />
      <div className="nm"><div className="row" style={{ flexWrap: "wrap", gap: 10 }}><h1>{e.name}</h1><StatusPill s={e.status} /></div>
        <span className="small muted num">{O.whenText(e.startAt)}</span><span className="small muted">{e.venue || ""}</span></div></div>
      <div className="acts">
        {e.status === "on_sale" && !live() && <button className="btn ghost" onClick={O.pause}>พักการขาย</button>}
        {e.status === "paused" && <button className="btn" onClick={O.resume}>เปิดขายต่อ</button>}
        {e.status === "draft" && <button className="btn" onClick={() => O.editEvent(e.id)}>แก้ไขและเผยแพร่</button>}
        {open && <button className="btn ghost" onClick={() => O.editEvent(e.id)}>แก้ไขทั้งงาน</button>}
        {open && <button className="btn" onClick={() => O.gate(e.id)}>ไปหน้างาน</button>}
        {["ended", "cancelled"].includes(e.status) && <button className="btn ghost" onClick={() => O.evDuplicate(e.id)}>ทำซ้ำเป็นงานใหม่</button>}
      </div></div>
    {e.status === "paused" && <div className="alert warn" role="status"><Icon id="i-info" /><div><b>พักการขายอยู่</b> ผู้ซื้อเห็น &quot;ปิดรับชั่วคราว&quot; ตั๋วที่ขายไปแล้วยังใช้เข้างานได้</div></div>}
    {e.status === "cancelled" && <div className="alert danger" role="status"><Icon id="i-alert" /><div><b>งานนี้ถูกยกเลิกแล้ว</b> {live() ? "ทีมงานกำลังคืนเงินผู้ซื้อ" : "คืนเงินผู้ซื้อแล้ว"} แก้ไขไม่ได้</div></div>}
    <div className="utabs" role="tablist" aria-label="ส่วนของงาน">{tabs.map(([k, v]) => <button key={k} role="tab" aria-selected={t === k} onClick={() => { S.org.etab = k; emit(); }}>{v}</button>)}</div>
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
    <PBar pct={pct} label={`${z.name} ขายแล้ว ${Math.round(pct)}%`} />
    {!ro && <>
      {z.kind !== "comp" && <Fld id={`ez${i}-price`} label="ราคา (บาท)" hint={priceLocked ? (live() ? "มีผู้ซื้อแล้ว เปลี่ยนราคาไม่ได้" : OL.canEditZone(z, { price: z.price + 1 }).reason) : ""}>
        <input id={`ez${i}-price`} inputMode="decimal" value={price} disabled={priceLocked} onChange={x => setPrice(x.target.value)} {...errA(`ez${i}-price`, "", priceLocked)} /></Fld>}
      <Fld id={`ez${i}-cap`} label="จำนวนที่ขาย" err={err}><input id={`ez${i}-cap`} inputMode="numeric" value={cap} onChange={x => setCap(x.target.value)} {...errA(`ez${i}-cap`, err)} /></Fld>
      <button className="btn plain" disabled={busy()} onClick={async () => setErr(await O.zoneSave(i, z.kind === "comp" || priceLocked ? null : price, cap))}>บันทึกโซนนี้</button></>}
  </div>);
}
function EvOverview({ e }: { e: any }) {
  const s = evSum(e), ro = ["ended", "cancelled"].includes(e.status);
  return (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div className="org-stats"><div className="card org-stat"><span className="small muted">ขายแล้ว</span><b className="num">{s.sold}/{s.capacity}</b></div>
      <div className="card org-stat"><span className="small muted">รายรับสุทธิ</span><b className="num">{B(s.net)}</b></div></div>
    <h2 style={{ fontSize: 17 }}>โซนตั๋ว</h2>
    {e.zones.map((z: any, i: number) => <ZoneRow key={z.id + ":" + z.price + ":" + z.capacity} e={e} z={z} i={i} ro={ro} />)}
  </div>);
}
function EvBuyers({ e }: { e: any }) {
  const o = S.org, rows = O.buyerRows(e), em = (x: string) => (o.showEmails ? x : O.maskEmail(x));
  const set = (k: string) => (x: any) => { o[k] = x.target.value; emit(); };
  return (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div className="field"><label htmlFor="bq">ค้นหา (ชื่อ / อีเมล / เลขตั๋ว)</label><input id="bq" type="search" value={o.bq || ""} onChange={set("bq")} autoComplete="off" /></div>
    <div className="row"><div className="field" style={{ flex: 1 }}><label htmlFor="bzone">โซน</label><select id="bzone" value={o.bzone || "all"} onChange={set("bzone")}><option value="all">ทั้งหมด</option>{e.zones.map((z: any) => <option key={z.id} value={z.id}>{z.name}</option>)}</select></div>
      <div className="field" style={{ flex: 1 }}><label htmlFor="bstatus">สถานะ</label><select id="bstatus" value={o.bstatus || "all"} onChange={set("bstatus")}><option value="all">ทั้งหมด</option>{Object.entries(O.TICKET_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div></div>
    <div className="row" style={{ flexWrap: "wrap" }}><button className="btn plain" style={{ width: "auto", padding: "9px 14px", fontSize: 14 }} onClick={O.csv}>ส่งออก CSV</button>
      {o.role === "owner" && <button className="btn plain" style={{ width: "auto", padding: "9px 14px", fontSize: 14 }} aria-pressed={!!o.showEmails} onClick={() => { o.showEmails = !o.showEmails; emit(); }}>{o.showEmails ? "ซ่อนอีเมล" : "แสดงอีเมลเต็ม"}</button>}
      <span className="small muted" style={{ alignSelf: "center" }}>{rows.length} รายการ · อีเมลถูกปิดบังบางส่วนตามค่าเริ่มต้น</span></div>
    <div style={{ overflowX: "auto" }}><table className="org-table"><thead><tr><th scope="col">ชื่อ</th><th scope="col">อีเมล</th><th scope="col">โซน</th><th scope="col">สถานะ</th><th scope="col">เลขตั๋ว</th></tr></thead>
      <tbody>{rows.map((r: any) => <tr key={r.t.ticketId}><th scope="row">{r.p.name}</th><td style={{ textAlign: "left" }}>{em(r.p.email)}</td><td style={{ textAlign: "left" }}>{r.z.name}</td><td style={{ textAlign: "left" }}>{O.TICKET_STATUS[r.t.status] || r.t.status}</td><td className="mono" style={{ textAlign: "left" }}>{r.t.ticketId}</td></tr>)}</tbody></table>
      {!rows.length && <div className="empty">ไม่พบผู้ซื้อที่ตรงกับตัวกรอง</div>}</div>
  </div>);
}
function LiveBuyers({ e }: { e: any }) {
  const rows = O.liveOrders(e);
  if (!rows) return <div className="empty">กำลังโหลดคำสั่งซื้อ…</div>;
  if (rows.error) return <div className="empty">{rows.error} <button className="linkbtn" onClick={O.liveOrdersReload}>ลองใหม่</button></div>;
  return (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div className="row between" style={{ flexWrap: "wrap" }}><span className="small muted">คำสั่งซื้อ {rows.length} รายการ · อีเมลถูกปิดบังบางส่วน</span>
      <span className="row"><button className="btn plain" style={{ width: "auto", padding: "9px 14px", fontSize: 14 }} onClick={O.csv}>ส่งออก CSV</button>
        <button className="btn plain" style={{ width: "auto", padding: "9px 14px", fontSize: 14 }} onClick={O.liveOrdersReload}>โหลดใหม่</button></span></div>
    {rows.length ? <div style={{ overflowX: "auto" }}><table className="org-table"><thead><tr><th scope="col">ผู้ซื้อ</th><th scope="col">อีเมล</th><th scope="col">โซน</th><th scope="col">ใบ</th><th scope="col">ยอด</th><th scope="col">สถานะ</th><th scope="col">ตั๋วที่ออก</th></tr></thead>
      <tbody>{rows.map((r: any, i: number) => <tr key={i}><th scope="row">{r.buyer || "—"}</th><td style={{ textAlign: "left" }}>{r.email}</td><td style={{ textAlign: "left" }}>{r.zone}</td><td className="num">{r.quantity}</td>
        <td className="num">{B(r.amountSatang)}</td><td style={{ textAlign: "left" }}>{O.ORDER_STATUS[r.status] || r.status}</td><td className="num">{r.minted}</td></tr>)}</tbody></table></div>
      : <div className="empty">ยังไม่มีคำสั่งซื้อ</div>}
  </div>);
}
function EvResale({ e }: { e: any }) {
  const tk = evTickets(e.id).filter((t: any) => t.hops.length > 1 || t.status === "listed"), has = tk.length > 0, p = e.params;
  const comm = tk.reduce((a: number, t: any) => a + OL.settleTicket(t, (e.zones.find((z: any) => z.id === t.zoneId) || { price: 0 }).price).commission, 0);
  const [capm, setCapm] = useState(Math.round(p.capMultiplier * 100));
  return (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div className="card small"><b>ร้านได้ราคาหน้าบัตรตามเดิม</b><br /><span className="muted">คอมมิชชัน 6% ของราคาขายต่อหักจากผู้ขายและเป็นของแพลตฟอร์ม ผู้จัดไม่เสียเงินเพิ่มและไม่ได้ส่วนแบ่ง</span></div>
    {has ? <><div className="row between"><b>ตั๋วที่ขายต่อ / ลงขาย {tk.length} ใบ</b><span className="small muted num">คอมมิชชันแพลตฟอร์ม {B(comm)}</span></div>
      <div style={{ overflowX: "auto" }}><table className="org-table"><thead><tr><th scope="col">ตั๋ว</th><th scope="col">เส้นทางการจ่าย (เที่ยวที่ 0 = ซื้อครั้งแรก)</th><th scope="col">สถานะ</th></tr></thead>
        <tbody>{tk.map((t: any) => <tr key={t.ticketId}><th scope="row" className="mono">{t.ticketId}</th><td style={{ textAlign: "left" }}>{t.hops.map((h: any) => orgPerson(h.payerId).name + " " + B(h.paid)).join(" → ")}</td><td style={{ textAlign: "left" }}>{O.TICKET_STATUS[t.status]}</td></tr>)}</tbody></table></div></>
      : <div className="empty">ยังไม่มีการขายต่อ</div>}
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}><b>เพดานราคาขายต่อ: {p.capMultiplier.toFixed(2)} เท่า</b>
      {has ? <span className="small muted">มีรายการขายต่อแล้ว เปลี่ยนเพดานไม่ได้ เพื่อไม่ให้กระทบผู้ซื้อที่ลงขายไปแล้ว</span>
        : <><label htmlFor="rs-capm" className="small">ปรับเพดาน (ได้ก่อนมีรายการขายต่อ): <b className="num">{(capm / 100).toFixed(2)} เท่า</b></label>
          <input id="rs-capm" type="range" min={100} max={125} step={5} value={capm} onChange={x => setCapm(Number(x.target.value))} />
          <button className="btn plain" onClick={() => O.rsSave(capm)}>บันทึกเพดาน</button></>}</div>
  </div>);
}
function EvExtras({ e }: { e: any }) {
  const x = S.org.xtab || "comp";
  return (<div className="org-extras" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div className="chips" role="tablist">{[["comp", "บัตรเชิญ"], ["promo", "โค้ดส่วนลด"], ["ann", "ประกาศ"]].map(([k, v]) => (
      <button key={k} role="tab" aria-selected={x === k} className={"chip " + (x === k ? "on" : "")} onClick={() => { S.org.xtab = k; emit(); }}>{v}</button>))}</div>
    {x === "comp" && <XComp e={e} />}{x === "promo" && <XPromo e={e} />}{x === "ann" && <XAnn e={e} />}
  </div>);
}
function XComp({ e }: { e: any }) {
  const cz = e.zones.filter((z: any) => z.kind === "comp");
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [zone, setZone] = useState(cz[0] ? cz[0].id : ""), [err, setErr] = useState<any>({});
  if (!cz.length) return (<><div className="card small"><b>งานนี้ยังไม่มีโซนบัตรเชิญ</b><br /><span className="muted">เพิ่มโซนประเภท &quot;บัตรเชิญ (ฟรี)&quot; ในหน้าแก้ไขงาน แล้วกลับมาออกบัตรได้</span></div>
    <button className="btn plain" onClick={() => O.editEvent(e.id)}>แก้ไขงาน</button></>);
  const tk = evTickets(e.id).filter((t: any) => cz.some((z: any) => z.id === t.zoneId));
  return (<>
    <div className="card small"><b>บัตรเชิญไม่ผ่านการจ่ายเงิน</b><br /><span className="muted">ไม่มีเงินเข้า-ออก ไม่คิดค่าบริการ และขายต่อไม่ได้ ผู้รับจะได้ตั๋วในอีเมลที่ระบุ</span></div>
    <Fld id="cp-name" label="ชื่อผู้รับ" err={err.name}><input id="cp-name" value={name} onChange={x => setName(x.target.value)} {...errA("cp-name", err.name)} /></Fld>
    <Fld id="cp-email" label="อีเมลผู้รับ" err={err.email}><input id="cp-email" type="email" autoComplete="off" value={email} onChange={x => setEmail(x.target.value)} {...errA("cp-email", err.email)} /></Fld>
    <Fld id="cp-zone" label="โซนบัตรเชิญ" err={err.zone}><select id="cp-zone" value={zone} onChange={x => setZone(x.target.value)}>{cz.map((z: any) => <option key={z.id} value={z.id}>{z.name} (ออกแล้ว {z.sold}/{z.capacity})</option>)}</select></Fld>
    <button className="btn" onClick={() => { const r = O.compIssue(name, email, zone); setErr(r); if (!Object.keys(r).length) { setName(""); setEmail(""); } }}>ออกบัตรเชิญ</button>
    <h2 style={{ fontSize: 16 }}>รายชื่อผู้ได้รับบัตรเชิญ ({tk.length})</h2>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{tk.length ? tk.map((t: any) => { const p = orgPerson(t.holderId); return (
      <div key={t.ticketId} className="card row between"><div style={{ minWidth: 0 }}><b>{p.name}</b><div className="small muted">{O.maskEmail(p.email || "")} · ขายต่อไม่ได้</div></div><span className={"pill " + (t.status === "used" ? "grey" : "ok")}>{t.status === "used" ? "ใช้แล้ว" : "ส่งแล้ว"}</span></div>); })
      : <div className="empty">ยังไม่ได้ออกบัตรเชิญ</div>}</div>
  </>);
}
function XPromo({ e }: { e: any }) {
  const paid = e.zones.filter((z: any) => z.kind !== "comp"), pr = S.org.promos.filter((p: any) => !p.eventId || p.eventId === e.id);
  const [f, setF] = useState<any>({ code: "", kind: "percent", value: "", zone: "all", start: Date.now(), end: e.startAt || null, max: "50" }), [err, setErr] = useState<any>({});
  const [tc, setTc] = useState(""), [tz, setTz] = useState(paid[0] ? paid[0].id : ""), [tr, setTr] = useState("");
  const up = (k: string) => (x: any) => setF({ ...f, [k]: x && x.target ? x.target.value : x });
  return (<>
    <Fld id="pm-code" label="โค้ด" err={err.code} hint="ตัวอักษรอังกฤษหรือตัวเลข 3-20 ตัว เช่น EARLY10"><input id="pm-code" autoCapitalize="characters" autoComplete="off" value={f.code} onChange={x => setF({ ...f, code: x.target.value.toUpperCase() })} {...errA("pm-code", err.code, true)} /></Fld>
    <div className="row"><div style={{ flex: 1 }}><Fld id="pm-kind" label="ลดแบบ"><select id="pm-kind" value={f.kind} onChange={up("kind")}><option value="percent">เปอร์เซ็นต์ (%)</option><option value="amount">จำนวนเงิน (บาท)</option></select></Fld></div>
      <div style={{ flex: 1 }}><Fld id="pm-value" label="ลดเท่าไร" err={err.value}><input id="pm-value" inputMode="decimal" value={f.value} onChange={up("value")} {...errA("pm-value", err.value)} /></Fld></div></div>
    <Fld id="pm-zone" label="ใช้กับโซน"><select id="pm-zone" value={f.zone} onChange={up("zone")}><option value="all">ทุกโซน</option>{paid.map((z: any) => <option key={z.id} value={z.id}>{z.name}</option>)}</select></Fld>
    <div className="field"><span className="eyebrow">เริ่มใช้ได้</span><DateTime id="pm-start" label="เริ่มใช้ได้" value={f.start} invalid={!!err.start} describedBy="pm-start-err" defaultTime="10:00" onChange={up("start")} /><span className="hint err" id="pm-start-err" role="alert">{err.start || ""}</span></div>
    <div className="field"><span className="eyebrow">หมดอายุ</span><DateTime id="pm-end" label="หมดอายุ" value={f.end} min={f.start} invalid={!!err.end} describedBy="pm-end-err" defaultTime="23:00" onChange={up("end")} /><span className="hint err" id="pm-end-err" role="alert">{err.end || ""}</span></div>
    <Fld id="pm-max" label="ใช้ได้กี่ครั้ง" err={err.max}><input id="pm-max" inputMode="numeric" value={f.max} onChange={up("max")} {...errA("pm-max", err.max)} /></Fld>
    <button className="btn" onClick={() => { const r = O.promoCreate(f); setErr(r); if (!Object.keys(r).length) setF({ ...f, code: "", value: "" }); }}>สร้างโค้ด</button>
    <h2 style={{ fontSize: 16 }}>โค้ดทั้งหมด ({pr.length})</h2>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{pr.length ? pr.map((p: any) => (
      <div key={p.code} className="card" style={{ display: "flex", flexDirection: "column", gap: 4 }}><div className="row between"><b className="mono">{p.code}</b><span className={"pill " + (p.disabled ? "grey" : "ok")}>{p.disabled ? "ปิดอยู่" : "ใช้งานได้"}</span></div>
        <div className="small muted">ลด {p.percentOff ? p.percentOff + "%" : B(p.amountOff)} · {p.zoneId ? (e.zones.find((z: any) => z.id === p.zoneId) || { name: "—" }).name : "ทุกโซน"} · {OL.thaiDate(p.startsAt)}–{OL.thaiDate(p.endsAt)} · ใช้แล้ว {p.used || 0}/{p.maxUses}</div>
        <button className="btn plain" style={{ padding: 8, fontSize: 14, minHeight: 44 }} onClick={() => O.promoToggle(p.code)}>{p.disabled ? "เปิดใช้งาน" : "ปิดโค้ด"}</button></div>))
      : <div className="empty">ยังไม่มีโค้ดส่วนลด</div>}</div>
    {paid.length > 0 && <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}><b>ลองกรอกโค้ด</b>
      <Fld id="pt-code" label="โค้ด"><input id="pt-code" value={tc} onChange={x => setTc(x.target.value)} /></Fld>
      <Fld id="pt-zone" label="โซน"><select id="pt-zone" value={tz} onChange={x => setTz(x.target.value)}>{paid.map((z: any) => <option key={z.id} value={z.id}>{z.name} · {B(z.price)}</option>)}</select></Fld>
      <button className="btn plain" onClick={() => setTr(O.promoTest(tc, tz))}>ดูราคาหลังลด</button><span className="hint" role="status">{tr}</span></div>}
  </>);
}
function XAnn({ e }: { e: any }) {
  const hist = S.org.announcements.filter((a: any) => a.eventId === e.id).slice().reverse();
  const zn = (id: string) => (id === "all" ? "ทุกโซน" : (e.zones.find((z: any) => z.id === id) || { name: id }).name);
  const [zone, setZone] = useState("all"), [text, setText] = useState(""), [err, setErr] = useState("");
  return (<>
    <Fld id="an-zone" label="ส่งถึง"><select id="an-zone" value={zone} onChange={x => setZone(x.target.value)}><option value="all">ผู้ถือตั๋วทุกคน</option>{e.zones.filter((z: any) => z.kind !== "comp").map((z: any) => <option key={z.id} value={z.id}>เฉพาะโซน {z.name}</option>)}</select></Fld>
    <div className="chips" role="group" aria-label="เทมเพลต">{[["time", "เปลี่ยนเวลา"], ["place", "เปลี่ยนสถานที่"], ["weather", "สภาพอากาศ"]].map(([k, l]) => <button key={k} className="chip" onClick={() => setText(O.AN_TEMPLATES[k])}>{l}</button>)}</div>
    <Fld id="an-text" label="ข้อความ" err={err} hint="ผู้ซื้อเห็นข้อความนี้ในหน้าตั๋ว"><textarea id="an-text" rows={4} value={text} onChange={x => setText(x.target.value)} {...errA("an-text", err, true)} /></Fld>
    <button className="btn" onClick={() => { const r = O.annSend(zone, text); setErr(r); if (!r) setText(""); }}>ส่งประกาศ</button>
    <h2 style={{ fontSize: 16 }}>ประวัติการส่ง ({hist.length})</h2>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{hist.length ? hist.map((a: any) => <div key={a.id} className="card small"><div className="row between"><b>{zn(a.zone)}</b><span className="muted num">ถึง {a.recipients} คน · {OL.thaiTime(a.at)} น.</span></div><div>{a.text}</div></div>)
      : <div className="empty">ยังไม่เคยส่งประกาศ</div>}</div>
  </>);
}
function EvSettings({ e }: { e: any }) {
  const cancellable = ["on_sale", "paused", "sold_out"].includes(e.status), ro = ["ended", "cancelled"].includes(e.status);
  const [f, setF] = useState({ desc: e.description || "", venue: e.venue || "", start: e.startAt as number | null, msg: "" }), [err, setErr] = useState<any>({});
  return (<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    {ro ? <div className="card small muted">งานนี้{e.status === "ended" ? "จบแล้ว" : "ถูกยกเลิกแล้ว" + (e.cancelReason ? " (" + e.cancelReason + ")" : "")} แก้ไขไม่ได้</div> : <>
      <Fld id="st-desc" label="รายละเอียดงาน"><textarea id="st-desc" rows={4} value={f.desc} onChange={x => setF({ ...f, desc: x.target.value })} /></Fld>
      <Fld id="st-venue" label="สถานที่" err={err.venue}><input id="st-venue" value={f.venue} onChange={x => setF({ ...f, venue: x.target.value })} {...errA("st-venue", err.venue)} /></Fld>
      <div className="field"><span className="eyebrow">วันเวลาเริ่มงาน</span><DateTime id="st-start" label="วันเวลาเริ่มงาน" value={f.start} invalid={!!err.start} describedBy="st-start-err st-start-h" onChange={v => setF({ ...f, start: v })} />
        <span className="hint" id="st-start-h">เวลาจบและประตูเปิดเลื่อนตามให้อัตโนมัติ</span><span className="hint err" id="st-start-err" role="alert">{err.start || ""}</span></div>
      <PosterPicker e={e} id="st-poster" onFile={O.stSetPoster} onSwatch={O.stSetSwatch} />
      <Fld id="st-msg" label="ข้อความถึงผู้ซื้อ (จำเป็นถ้าเปลี่ยนสถานที่หรือวันเวลาหลังขายแล้ว)" err={err.msg} hint={live() ? "ระบบจริงยังไม่ส่งข้อความนี้ถึงผู้ซื้อ" : "ผู้ซื้อทุกคนจะเห็นข้อความนี้ในหน้าตั๋ว"}>
        <textarea id="st-msg" rows={3} value={f.msg} onChange={x => setF({ ...f, msg: x.target.value })} {...errA("st-msg", err.msg, true)} /></Fld>
      <button className="btn" disabled={busy()} onClick={async () => { const r = await O.stSave(f); setErr(r); if (!Object.keys(r).length) setF({ ...f, msg: "" }); }}>บันทึกการตั้งค่า</button></>}
    {cancellable && <div className="card org-danger" style={{ display: "flex", flexDirection: "column", gap: 8 }}><b>ยกเลิกงาน</b>
      <span className="small muted">{live() ? "หยุดขายทันทีและคืนที่นั่งที่ Hold อยู่ ทีมงาน JONGLOEI คืนเงินผู้ซื้อที่จ่ายแล้ว ร้านจะไม่ได้รับเงินจากงานนี้ ย้อนกลับไม่ได้" : "ผู้ซื้อทุกคนได้รับเงินคืนอัตโนมัติเท่าที่จ่าย ร้านจะไม่ได้รับเงินจากงานนี้ ย้อนกลับไม่ได้"}</span>
      <button className="btn org-danger-btn" onClick={O.cancelStart}>ยกเลิกงานนี้</button></div>}
  </div>);
}

/* ---------- door: pick an event ---------- */
export function OrgGatePick() {
  const evs = O.myEvents().filter((e: any) => ["on_sale", "sold_out", "paused"].includes(e.status)).sort((a: any, b: any) => (a.startAt || 0) - (b.startAt || 0));
  const counts = live() ? S.org.gateCounts || {} : null, today = new Date().toDateString();
  useEffect(() => { if (live() && Date.now() - (S.org.gateCountsAt || 0) > 15000) O.liveGateCounts(); }, []);
  return (<div className="wrap org"><OrgHead title="หน้างาน" />
    <p className="muted" style={{ margin: 0 }}>เลือกงานที่จะเช็กอินผู้เข้าร่วม เรียงจากงานที่ใกล้ที่สุด</p>
    {evs.length ? <div className="lgrid2">{evs.map((e: any) => { const g = counts ? counts[e.id] : O.gateStats(e); return (
      <button key={e.id} className="gpick" onClick={() => O.gate(e.id)}><Thumb e={thumbOf(e)} />
        <span className="oev-info"><span className="row" style={{ gap: 8, flexWrap: "wrap" }}><b>{e.name}</b>{e.startAt && new Date(e.startAt).toDateString() === today && <span className="pill">วันนี้</span>}</span>
          <span className="small muted num">{e.startAt ? O.whenText(e.startAt) : ""}</span>{g && <span className="num" style={{ fontSize: 14, fontWeight: 600 }}>เข้างานแล้ว {g.used} / {g.total}</span>}</span>
        <Icon id="i-next" className="ic" /></button>); })}</div>
      : <div className="empty"><b>ไม่มีงานที่เปิดขายอยู่</b><br />งานที่เปิดขายหรือขายหมดแล้วจะขึ้นที่นี่ในวันงาน</div>}
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
  const tabs = isLive ? [["scan", "สแกน QR"], ["log", "ประวัติ"]] : [["scan", "สแกน QR"], ["search", "ค้นหาชื่อ"], ["log", "ประวัติ"]];
  return (<div className="wrap narrow-w">
    <button className="crumb m-hide" onClick={() => go("orgGatePick")}><Icon id="i-back" />เลือกงาน</button>
    <div className="gcount"><span className="small muted">{e.name}</span>
      <div className="num" aria-live="polite">{g ? `เข้างานแล้ว ${g.used} / ${g.total}` : "กำลังโหลด…"}</div>
      <PBar pct={pct} label={`เข้างานแล้ว ${Math.round(pct)}%`} /></div>
    <div className={"seg" + (tabs.length === 3 ? " three" : "")} role="tablist">{tabs.map(([k, v]) => (
      <button key={k} role="tab" aria-selected={t === k} className={t === k ? "on" : ""} onClick={() => { if (k !== "scan") O.camStop(); S.org.gtab = k; emit(); }}>{v}</button>))}</div>
    {t === "scan" && (isLive ? <LiveScan /> : <>
      <div className="cam" role="img" aria-label="กล้องสแกน (จำลอง)"><CamFrame /><span className="line" /><span className="hint2">หันกล้องไปที่ QR ของผู้ซื้อ · จำลอง ไม่เปิดกล้องจริง</span></div>
      <button className="btn" onClick={O.simOpen} style={{ minHeight: 64, fontSize: 18, borderRadius: 12 }}>จำลองการสแกน</button>
      <div className="small muted">QR ของผู้ถือตั๋วเปลี่ยนทุก 60 วินาที ภาพแคปหน้าจอใช้ไม่ได้</div></>)}
    {t === "search" && <GateSearch e={e} />}
    {t === "log" && <GateLog e={e} />}
  </div>);
}
function LiveScan() {
  const [code, setCode] = useState(""), on = O.camOn();
  return (<>
    <div className="cam"><div id="gate-reader" style={{ position: "absolute", inset: 0 }} />{!on && <CamFrame />}
      <span className="hint2">{on ? "เล็ง QR ในตั๋วของผู้เข้าร่วมให้อยู่ในกรอบ" : "กดเปิดกล้องเพื่อเริ่มสแกน"}</span></div>
    <button className="btn" onClick={() => (on ? O.camStop() : O.camStart("gate-reader"))} style={{ minHeight: 64, fontSize: 18, borderRadius: 12 }}>{on ? "ปิดกล้อง" : "เปิดกล้อง"}</button>
    <form className="field" autoComplete="off" onSubmit={x => { x.preventDefault(); const v = code; setCode(""); O.gateCheck(v, true); }}>
      <label htmlFor="gate-code">ไม่มีกล้อง หรือใช้เครื่องสแกนแบบเสียบ: วางรหัสใน QR</label>
      <div className="row"><input id="gate-code" placeholder="JL1.…" value={code} onChange={x => setCode(x.target.value)} style={{ flex: 1 }} /><button className="btn" type="submit" style={{ width: "auto", padding: "10px 18px" }} disabled={!code.trim()}>ตรวจ</button></div></form>
    <div className="small muted">QR ของผู้ถือตั๋วเปลี่ยนทุก 60 วินาที ภาพแคปหน้าจอใช้ไม่ได้</div>
  </>);
}
function GateSearch({ e }: { e: any }) {
  const q = (S.org.gq || "").trim().toLowerCase(), q4 = q.replace(/\D/g, "");
  const rows = q ? evTickets(e.id).map((t: any) => ({ t, p: orgPerson(t.holderId) })).filter((r: any) => (r.p.name + " " + r.p.email + " " + r.t.ticketId).toLowerCase().includes(q) || (q4.length === 4 && String(r.p.phone).endsWith(q4))).slice(0, 20) : [];
  return (<>
    <div className="field"><label htmlFor="gq">ค้นหาผู้เข้าร่วม</label><input id="gq" type="search" autoComplete="off" value={S.org.gq || ""} onChange={x => { S.org.gq = x.target.value; emit(); }} placeholder="ชื่อ · อีเมล · เลขตั๋ว · เบอร์ 4 ตัวท้าย" /></div>
    <div aria-live="polite">{!q ? <div className="empty">พิมพ์ชื่อ อีเมล เลขตั๋ว หรือเบอร์โทร 4 ตัวท้าย</div> : !rows.length ? <div className="empty">ไม่พบตั๋วที่ตรงกับคำค้น</div>
      : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{rows.map(({ t, p }: any) => (
        <div key={t.ticketId} className="card row between"><div style={{ minWidth: 0 }}><b>{p.name}</b><div className="small muted">{O.maskEmail(p.email || "")} · {(e.zones.find((z: any) => z.id === t.zoneId) || {}).name || ""}</div><div className="mono small">{t.ticketId}</div></div>
          {t.status === "used" ? <span className="pill grey">เช็กอินแล้ว {OL.thaiTime(t.usedAt)} น.</span>
            : ["valid", "listed"].includes(t.status) ? <button className="btn" style={{ width: "auto", padding: "10px 16px", fontSize: 15 }} onClick={() => O.manualIn(t.ticketId)}>เช็กอิน</button>
            : <span className="pill">{O.TICKET_STATUS[t.status] || t.status}</span>}</div>))}</div>}</div>
  </>);
}
function GateLog({ e }: { e: any }) {
  if (live()) {
    const g = S.org.liveGate && S.org.liveGate.id === e.id ? S.org.liveGate : null;
    if (!g) return <div className="empty">กำลังโหลด…</div>;
    return g.scans.length ? (<div style={{ overflowX: "auto" }}><table className="org-table"><thead><tr><th scope="col">เวลา</th><th scope="col">ตั๋ว</th><th scope="col">ผล</th><th scope="col">เหตุผล</th><th scope="col">ผู้สแกน</th></tr></thead>
      <tbody>{g.scans.map((l: any, i: number) => <tr key={i}><th scope="row">{OL.thaiTime(l.at)}</th><td style={{ textAlign: "left" }} className="num">{l.tokenId != null ? "#" + l.tokenId : "—"}{l.zone ? " · " + l.zone : ""}</td>
        <td style={{ textAlign: "left" }}>{l.valid ? "ผ่าน" : "ไม่ผ่าน"}</td><td style={{ textAlign: "left" }}>{l.valid ? "—" : O.LIVE_REASON[l.reason] || l.reason || ""}</td><td style={{ textAlign: "left" }}>{l.staff || ""}</td></tr>)}</tbody></table></div>)
      : <div className="empty">ยังไม่มีการสแกนในงานนี้</div>;
  }
  const rows = S.org.checkinLog.filter((l: any) => l.eventId === e.id).slice(0, 20);
  return rows.length ? (<div style={{ overflowX: "auto" }}><table className="org-table"><thead><tr><th scope="col">เวลา</th><th scope="col">ผล</th><th scope="col">เหตุผล</th><th scope="col">วิธี</th><th scope="col">ผู้ทำ</th></tr></thead>
    <tbody>{rows.map((l: any, i: number) => <tr key={i}><th scope="row">{OL.thaiTime(l.at)}</th><td style={{ textAlign: "left" }}>{l.valid ? "ผ่าน" : "ไม่ผ่าน"}</td><td style={{ textAlign: "left" }}>{l.valid ? "—" : OL.reasonText(l.reason)}</td>
      <td style={{ textAlign: "left" }}>{l.method === "manual" ? "เช็กอินมือ" : "สแกน"}</td><td style={{ textAlign: "left" }}>{l.by}</td></tr>)}</tbody></table></div>)
    : <div className="empty">ยังไม่มีการสแกนในรอบนี้</div>;
}

/* ---------- finance ---------- */
export function OrgFinance() {
  const o = S.org, now = Date.now(), sh = o.shop;
  const rows = O.myEvents().filter((e: any) => e.status !== "draft").map((e: any) => O.finRow(e, now)).sort((a: any, b: any) => (b.e.startAt || 0) - (a.e.startAt || 0));
  if (o.printEv) { const r = rows.find((x: any) => x.e.id === o.printEv); if (r) return <FinPrint r={r} />; }
  const sum = (f: (r: any) => boolean) => rows.filter(f).reduce((a: number, r: any) => a + r.net, 0);
  const mine = myEventIds(), refunded = o.ledger.filter((l: any) => l.type === "REFUND_OUT" && mine.has(l.eventId)).reduce((a: number, l: any) => a + l.amount, 0);
  const stat = (label: string, v: string, sub: string) => <div className="stat"><span>{label}</span><b className="num">{v}</b><small>{sub}</small></div>;
  const csvAll = () => O.downloadCsv("การเงิน-" + sh.id + ".csv", [["งาน", "วันจัดงาน", "สถานะ", "ยอดขาย (บาท)", "ค่าบริการ (บาท)", "รายรับสุทธิ (บาท)", "คืนผู้ซื้อ (บาท)", "วันรับเงิน"],
    ...rows.map((r: any) => [r.e.name, r.e.startAt ? OL.thaiDate(r.e.startAt) : "", r.label, r.gross / 100, r.fee / 100, r.net / 100, r.refunded / 100, r.payAt ? OL.thaiDate(r.payAt) : ""])]);
  return (<div className="wrap org"><OrgHead title="การเงิน" action={<button className="btn ghost" onClick={csvAll}>ส่งออก CSV</button>} />
    <div className="stats">{stat("รอจ่ายรวม", B(sum(r => !r.paid && r.kind !== "cancelled")), "งานที่ยังไม่จบหรืออยู่ในช่วงตรวจสอบ")}{stat("จ่ายแล้ว", B(sum(r => r.paid)), "โอนเข้าบัญชีพร้อมเพย์แล้ว")}
      {stat("ค่าบริการรวม", B(rows.reduce((a: number, r: any) => a + r.fee, 0)), "5฿ + 3% ต่อใบ")}{stat("คืนผู้ซื้อ", B(refunded), "จากงานที่ยกเลิก")}</div>
    <div className="pcard" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 16 }}><span className="acct-ic" aria-hidden="true"><svg><use href="#i-wallet" /></svg></span>
      <div style={{ flex: 1, minWidth: 160 }}><b>บัญชีรับเงิน (พร้อมเพย์)</b><div className="small muted mono">•••• •• {String(sh.payoutPromptPay || "").slice(-4)}</div></div>
      {sh.verification === "verified" ? <span className="pill ok">ยืนยันแล้ว</span> : <span className="pill warn">รอยืนยัน</span>}
      <p className="small muted" style={{ margin: 0, flexBasis: "100%" }}>เงินเข้าบัญชีหลังงานจบ 24 ชั่วโมง เผื่อกรณียกเลิกหรือมีข้อพิพาท ถ้างานถูกยกเลิก ระบบคืนเงินผู้ซื้อแทนการโอนให้ร้าน (ข้อมูลจำลอง)</p></div>
    <h2 className="h2">รายงานต่องาน</h2>
    <div className="fgrid">{rows.map((r: any) => { const open = !!(o.finOpen && o.finOpen[r.e.id]); return (
      <div key={r.e.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="row between" style={{ alignItems: "flex-start" }}><div style={{ minWidth: 0 }}><b>{r.e.name}</b><div className="small muted">{r.e.startAt ? OL.thaiDate(r.e.startAt) : ""}</div></div><span className={"pill " + (r.paid ? "ok" : r.kind === "cancelled" ? "danger" : "warn")}>{r.label}</span></div>
        <dl className="kv num" style={{ margin: 0 }}><dt>ยอดขาย</dt><dd>{B(r.gross)}</dd><dt>ค่าบริการ</dt><dd>{B(r.fee)}</dd>
          <dt style={{ color: "var(--ink)", fontWeight: 600 }}>{r.kind === "cancelled" ? "คืนผู้ซื้อ" : "รายรับสุทธิ"}</dt><dd style={{ fontWeight: 700 }}>{r.kind === "cancelled" ? B(r.refunded) : B(r.net)}</dd>
          <dt>วันรับเงิน</dt><dd>{r.payAt ? OL.thaiDate(r.payAt) : "—"}</dd></dl>
        <div className="row"><button className="btn plain" style={{ padding: 9, fontSize: 14, minHeight: 44 }} aria-expanded={open} onClick={() => { o.finOpen = { ...(o.finOpen || {}), [r.e.id]: !open }; emit(); }}>รายการต่อใบ</button>
          <button className="btn plain" style={{ padding: 9, fontSize: 14, minHeight: 44 }} onClick={() => { o.printEv = r.e.id; emit(); }}>พิมพ์สรุป</button></div>
        {open && <FinDetail r={r} />}
      </div>); })}</div>
  </div>);
}
function FinDetail({ r }: { r: any }) {
  const e = r.e; if (r.kind === "cancelled") return <div className="small muted">งานนี้ยกเลิกแล้ว ผู้ซื้อทุกคนได้รับเงินคืนตามที่จ่าย</div>;
  const multi = r.tickets.filter((t: any) => t.hops.length > 1), single = r.tickets.filter((t: any) => t.hops.length === 1 && t.hops[0].paid > 0);
  const price = (t: any) => (e.zones.find((z: any) => z.id === t.zoneId) || { price: 0 }).price;
  const singleNet = single.reduce((a: number, t: any) => a + OL.settleTicket(t, price(t)).shopNet, 0);
  return (<div className="small" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <div>ตั๋วขายครั้งเดียว {single.length} ใบ · ร้านได้ {B(singleNet)}</div>
    {multi.length > 0 && <div style={{ overflowX: "auto" }}><table className="org-table"><thead><tr><th scope="col">ตั๋วที่ขายต่อ</th><th scope="col">ร้านได้</th><th scope="col">ค่าบริการ</th><th scope="col">ผู้ขายแต่ละเที่ยวได้</th><th scope="col">คอมมิชชัน 6%</th></tr></thead>
      <tbody>{multi.map((t: any) => { const s = OL.settleTicket(t, price(t)); return <tr key={t.ticketId}><th scope="row" className="mono">{t.ticketId}</th><td>{B(s.shopNet)}</td><td>{B(s.shopFee)}</td>
        <td style={{ textAlign: "left" }}>{s.sellerPayouts.map((p: any, i: number) => <div key={i}>{orgPerson(p.payerId).name} {B(p.amount)}</div>)}</td><td>{B(s.commission)}</td></tr>; })}</tbody></table></div>}
  </div>);
}
function FinPrint({ r }: { r: any }) {
  const sh = S.org.shop, e = r.e;
  return (<div className="org-printdoc">
    <div className="row between no-print"><button className="btn plain" style={{ width: "auto", padding: "9px 14px", fontSize: 14 }} onClick={() => { S.org.printEv = null; emit(); }}>กลับ</button>
      <button className="btn" style={{ width: "auto", padding: "9px 18px", fontSize: 14 }} onClick={() => window.print()}>พิมพ์ / บันทึกเป็น PDF</button></div>
    <h1 style={{ fontSize: 22 }}>เอกสารสรุปรายการ</h1>
    <p className="small muted" style={{ margin: 0 }}>เอกสารสรุปจากระบบ JONGLOEI เพื่อใช้ประกอบการทำบัญชี <b>ไม่ใช่ใบกำกับภาษี</b> · ข้อมูลตัวอย่าง</p>
    <dl className="kv card" style={{ margin: 0 }}><dt>ผู้จัด</dt><dd>{sh.name}</dd><dt>งาน</dt><dd>{e.name}</dd><dt>วันจัดงาน</dt><dd>{e.startAt ? O.whenText(e.startAt) : "—"}</dd>
      <dt>สถานะงาน</dt><dd><StatusPill s={e.status} /></dd><dt>ออกเอกสาร</dt><dd>{OL.thaiDate(Date.now())}</dd></dl>
    <dl className="kv card num" style={{ margin: 0 }}>{r.kind === "cancelled"
      ? <><dt>เหตุผลที่ยกเลิก</dt><dd>{e.cancelReason || "—"}</dd><dt>คืนเงินผู้ซื้อ</dt><dd>{B(r.refunded)}</dd><dt>ยอดที่ร้านได้รับ</dt><dd>—</dd></>
      : <><dt>จำนวนตั๋วที่ขาย</dt><dd>{r.tickets.filter((t: any) => t.hops[0] && t.hops[0].paid > 0).length} ใบ</dd><dt>ยอดขายรวม</dt><dd>{B(r.gross)}</dd><dt>ค่าบริการ (5฿ + 3% ต่อใบ)</dt><dd>{B(r.fee)}</dd>
        <dt style={{ color: "var(--ink)", fontWeight: 600 }}>รายรับสุทธิ</dt><dd style={{ fontWeight: 700 }}>{B(r.net)}</dd><dt>วันรับเงิน</dt><dd>{r.payAt ? OL.thaiDate(r.payAt) : "—"} ({r.label})</dd></>}</dl>
  </div>);
}
export { posterStyle, imgCls, toast };
