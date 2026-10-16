"use client";
// Small pieces shared by the screens, ported from the mock-up's view helpers.
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { S, OL, fmt, short, CONTRACT, evById, DAY, HOUR } from "@/lib/state";
import { back } from "@/lib/nav";
import { EV_STATUS, ROLE_LABEL } from "@/lib/org";

export const Icon = ({ id, className, size }: { id: string; className?: string; size?: number }) => (
  <svg aria-hidden="true" className={className} width={size} height={size}><use href={"#" + id} /></svg>);

// poster background: an uploaded picture when there is one, else the gradient
export const posterStyle = (e: any): any => (e && e.image ? { "--pbg": e.bg, "--pimg": `url("${e.image}")` } : { "--pbg": e && e.bg });
export const imgCls = (e: any) => (e && e.image ? " has-img" : "");
const lines = (s: string) => String(s || "").split("\n").flatMap((l, i) => (i ? [<br key={i} />, l] : [l]));

export function Thumb({ e }: { e: any }) {
  return <span className={"thumb" + imgCls(e)} style={posterStyle(e)} aria-hidden="true"><b translate="no">{lines(e.short)}</b></span>;
}
export function Poster({ e, cls = "" }: { e: any; cls?: string }) {
  return (<div className={`poster ${cls}${imgCls(e)}`} style={posterStyle(e)}><span className="ptag">{e.tag}</span><div className="pbig">{lines(e.short)}</div></div>);
}
export function Pst({ e, cls = "pst", children }: { e: any; cls?: string; children?: any }) {
  return (<div className={cls + imgCls(e)} style={posterStyle(e)}>{children}<span className="big" aria-hidden="true" translate="no">{lines(e.short)}</span></div>);
}
// zone chip: solid zone colour, white type icon + name
export function ZChip({ e, name }: { e: any; name: string }) {
  const i = e ? e.zones.findIndex((z: any) => z.z === name) : -1, z = (e && e.zones[i]) || {};
  const kind = z.kind || (/seat|zone|vip|front|row|ที่นั่ง|บัตร/i.test(name) ? "seated" : "standing");
  const c = z.c || `var(--zone-${(Math.max(0, i) % 5) + 1})`;
  return <span className="zchip" style={{ "--zc": c } as any}><svg aria-hidden="true"><use href={"#z-" + (["table", "comp", "seated"].includes(kind) ? kind : "standing")} /></svg>{name}</span>;
}
export function TkPill({ t }: { t: any }) {
  return t.minting ? <span className="pill warn">กำลังออกบัตรเข้าชม</span> : t.failed ? <span className="pill grey">รอเจ้าหน้าที่ตรวจสอบ</span>
    : t.status === "refunded" ? <span className="pill grey">ดำเนินการคืนเงินเรียบร้อย</span> : t.status === "listed" ? <span className="pill info">ลงขาย {fmt(t.listPrice)}</span>
    : t.status === "used" ? <span className="pill grey">บันทึกเข้างานเรียบร้อย</span> : <span className="pill ok">พร้อมใช้</span>;
}
export function TitleRow({ title, fallback = "home" }: { title: string; fallback?: string }) {
  return <div className="titlerow"><button className="back" onClick={() => back(fallback)} aria-label="ย้อนกลับ"><svg><use href="#i-back" /></svg></button><h1>{title}</h1></div>;
}
export function Crumb({ label, fallback }: { label: string; fallback: string }) {
  return <button className="crumb m-hide" onClick={() => back(fallback)}><Icon id="i-back" />{label}</button>;
}
export const OkCircle = () => (<span className="okc" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path className="draw" d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>);
export const StatusPill = ({ s }: { s: string }) => { const [t, c] = EV_STATUS[s] || [s, ""]; return <span className={"pill " + c}>{t}</span>; };

// progress bar: % centred in the fill, or just right of it when the fill is too short to hold it
export function PBar({ pct, label, color, fg }: { pct: number; label?: string; color?: string; fg?: string }) {
  const p = Math.max(0, Math.min(100, Math.round(pct))), inside = p >= 15;
  return (<div className="pbar-t" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-valuetext={label || p + "%"}>
    <i style={{ width: p + "%", background: color }} />
    <b aria-hidden="true" style={inside ? { left: 0, right: 100 - p + "%", color: fg || "var(--on-red)" } : { left: `calc(${p}% + 8px)`, color: "var(--ink)" }}>{p}%</b>
  </div>);
}

export function NftCard({ t, full }: { t: any; full?: boolean }) {
  const e = evById(t.ev) || { name: "—", short: "", tag: "", bg: "", date: "", time: "", venue: "" };
  return (<div className="tcard"><Pst e={e}><div className="tags" style={{ display: "flex", gap: 6 }}><span className="tag">{e.tag}</span></div></Pst>
    <div className="stub"><h3>{e.name}</h3>
      <dl className="kv2 num"><dt>วันที่จัดงาน</dt><dd>{e.date} · {e.time} น.</dd><dt>สถานที่จัดงาน</dt><dd>{e.venue}</dd><dt>โซนที่นั่ง</dt><dd>{t.zone}</dd><dt>ราคาหน้าบัตร</dt><dd>{fmt(t.price)}</dd><dt>หมายเลขบัตรเข้าชม</dt><dd className="mono">#{t.tid}</dd></dl>
      {full && <details className="chain"><summary>ตรวจสอบหลักฐานบนบล็อกเชน <span className="pill ok">ยืนยันความถูกต้องแล้ว</span><Icon id="i-down" className="ic" /></summary>
        <dl className="kv2"><dt>เจ้าของกรรมสิทธิ์</dt><dd className="mono">{short(S.user.wallet)} (คุณ)</dd><dt>สัญญาอัจฉริยะ</dt><dd className="mono">{short(CONTRACT)}</dd>
          <dt>ประวัติธุรกรรม</dt><dd className="mono">{t.explorer ? <a href={t.explorer} target="_blank" rel="noopener">{t.tx}</a> : t.tx}</dd>
          <dt>เครือข่ายบล็อกเชน</dt><dd>Avalanche Fuji (เครือข่ายทดสอบ)</dd><dt>ผ่านการขายต่อหรือโอนสิทธิ์แล้ว</dt><dd className="num">{t.transfers} ครั้ง</dd></dl></details>}
    </div></div>);
}

// line stepper: numbered circles on a line; onPick makes steps clickable (event wizard)
export function LineSteps({ labels, cur, onPick }: { labels: string[]; cur: number; onPick?: (n: number) => void }) {
  return (<ol className="lstep" style={{ "--fill": (cur - 1) / (labels.length - 1) } as any} aria-label={`ขั้นที่ ${cur} จาก ${labels.length}`}>
    {labels.map((l, i) => {
      const st = i < cur - 1 ? "done" : i === cur - 1 ? "cur" : "";
      const inner = <><span className="d num">{st === "done" ? "✓" : i + 1}</span>{l}</>;
      return <li key={l} className={st} aria-current={st === "cur" ? "step" : undefined}>{onPick ? <button type="button" onClick={() => onPick(i + 1)}>{inner}</button> : inner}</li>;
    })}</ol>);
}
// page head: title + shop row (mobile) + primary action
export function OrgHead({ title, action }: { title: string; action?: any }) {
  const sh = S.org.shop, ok = sh.verification === "verified";
  return (<div className="ohead"><h1>{title}</h1><div className="oshop"><b>{sh.name}</b><span className={"pill " + (ok ? "ok" : "warn")}>{ok ? "ผ่านการยืนยันร้านค้า" : "รอการตรวจสอบตัวตน"}</span>
    {S.org.role !== "owner" && <span className="pill grey">{ROLE_LABEL[S.org.role]}</span>}</div>{action || null}</div>);
}

/* ---------- QR codes ---------- */
// demo entry QR: a new code every 60 s (screenshots stop working); a real ticket asks the Worker for a signed code
export function EntryQR({ t, onGone }: { t: any; onGone?: () => void }) {
  const [code, setCode] = useState(""), [left, setLeft] = useState(60), [err, setErr] = useState("");
  const exp = useRef(0), busy = useRef(false), failed = useRef(0);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      if (busy.current || failed.current >= 3) return; busy.current = true;
      try {
        const res = await fetch("/api/tickets/" + encodeURIComponent(t.key) + "/qr", { credentials: "same-origin" });
        const d = await res.json().catch(() => ({}));
        if (!alive) return;
        if (res.status === 409) { onGone && onGone(); return; }   // scanned at the door, or no longer usable
        if (!res.ok) throw new Error(d.error || "qr_failed");
        setCode(d.code); exp.current = Date.now() + (d.expiresAt - d.ts * 1000); failed.current = 0;
      } catch (e) { console.error("Entry QR failed", e); if (++failed.current >= 3) setErr("สร้าง QR Code ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"); }
      finally { busy.current = false; }
    };
    const tick = () => {
      if (t.real) { setLeft(Math.max(0, Math.ceil((exp.current - Date.now()) / 1000))); if (exp.current - Date.now() < 10000) refresh(); return; }
      const s = 60 - Math.floor((Date.now() / 1000) % 60); setLeft(s); setCode("JL-DEMO." + t.tid + "." + Math.floor(Date.now() / 60000));
    };
    tick(); const iv = setInterval(tick, 1000);
    return () => { alive = false; clearInterval(iv); };
  }, [t.key, t.tid, t.real]);
  return (<>
    {code ? <QRCodeSVG value={code} size={220} level="M" marginSize={2} role="img" aria-label="QR Code สำหรับเข้างาน" style={{ width: 220, height: 220, maxWidth: "100%" }} />
      : <div className="qrstate">{err || "กำลังสร้าง QR Code…"}</div>}
    {!err && <div className="ring"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" fill="none" stroke="#ECE4E5" strokeWidth="4" />
      <circle cx="18" cy="18" r="15" fill="none" stroke="#A00018" strokeWidth="4" strokeDasharray="94.25" strokeDashoffset={(94.25 * (1 - left / 60)).toFixed(2)} strokeLinecap="round" /></svg>
      QR ใหม่ใน <b className="num">{left}</b> วินาที</div>}
  </>);
}

/* ---------- date + time picker (O5 step 1) ----------
   Values are epoch ms; the calendar and clock show Bangkok time (UTC+7), like the rest of the app. */
const TH_D = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."], TH_M = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const TH_MF = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const BKK = 7 * HOUR, pad2 = (n: number) => String(n).padStart(2, "0");
const parts = (ms: number) => { const d = new Date(ms + BKK); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() }; };
const dayKey = (y: number, m: number, d: number) => Date.UTC(y, m, d);           // midnight UTC of that Bangkok date: only for comparing days
const fromParts = (y: number, m: number, d: number, h: number, mi: number) => Date.UTC(y, m, d, h, mi) - BKK;
export const dateText = (ms: number) => { const p = parts(ms), w = new Date(Date.UTC(p.y, p.m, p.d)).getUTCDay(); return `${TH_D[w]} ${p.d} ${TH_M[p.m]} ${p.y + 543}`; };
export const timeText = (ms: number) => { const p = parts(ms); return pad2(p.h) + ":" + pad2(p.mi) + " น."; };

let openPicker: null | (() => void) = null;     // one popover at a time
export function DateTime({ id, value, onChange, min, invalid, describedBy, quick, defaultTime = "19:00", disabled, label }:
  { id: string; value: number | null; onChange: (v: number | null) => void; min?: number | null; invalid?: boolean; describedBy?: string; quick?: string[]; defaultTime?: string; disabled?: boolean; label: string }) {
  const [open, setOpen] = useState<"" | "date" | "time">("");
  const [view, setView] = useState<{ y: number; m: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(""); if (openPicker && openPicker !== close) openPicker(); openPicker = close;
    const out = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(""); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(""); } };
    document.addEventListener("mousedown", out); box.current?.addEventListener("keydown", key);
    const b = box.current;
    return () => { document.removeEventListener("mousedown", out); b?.removeEventListener("keydown", key); if (openPicker === close) openPicker = null; };
  }, [open]);
  const now = Date.now(), tp = parts(now), todayK = dayKey(tp.y, tp.m, tp.d);
  const cur = value != null ? parts(value) : null;
  const [dh, dm] = defaultTime.split(":").map(Number);
  const v = view || (cur ? { y: cur.y, m: cur.m } : { y: tp.y, m: tp.m });
  const minK = min != null ? (p => dayKey(p.y, p.m, p.d))(parts(min)) : null;
  const first = new Date(Date.UTC(v.y, v.m, 1)).getUTCDay();
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(Date.UTC(v.y, v.m, 1 - first + i)); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() }; });
  const selK = cur ? dayKey(cur.y, cur.m, cur.d) : null;
  const pickDay = (x: { y: number; m: number; d: number }) => { onChange(fromParts(x.y, x.m, x.d, cur ? cur.h : dh, cur ? cur.mi : dm)); setView(null); setOpen("time"); };
  const setTime = (h: number, mi: number) => { const b = cur || tp; onChange(fromParts(b.y, b.m, b.d, h, mi)); };
  const shift = (n: number) => { const d = new Date(Date.UTC(v.y, v.m + n, 1)); setView({ y: d.getUTCFullYear(), m: d.getUTCMonth() }); };
  const ch = cur ? cur.h : dh, cmin = cur ? cur.mi : dm;
  return (
    <div className="dt-row" ref={box} role="group" aria-label={label}>
      <div className="dt-cell">
        <button type="button" id={id} className="dt-pick num" aria-haspopup="dialog" aria-expanded={open === "date"} aria-invalid={invalid || undefined} aria-describedby={describedBy} disabled={disabled}
          aria-label={`${label} วันที่ ${value != null ? dateText(value) : "ยังไม่เลือก"}`} onClick={() => { setView(null); setOpen(open === "date" ? "" : "date"); }}>
          <Icon id="i-cal" /><span className={"v" + (value == null ? " ph" : "")}>{value != null ? dateText(value) : "เลือกวันที่"}</span><Icon id="i-down" />
        </button>
        {open === "date" && <div className="dt-pop l" role="dialog" aria-label={"เลือกวันที่ " + label}>
          <div className="dt-head"><button type="button" className="dt-nav" aria-label="เดือนก่อนหน้า" onClick={() => shift(-1)}><Icon id="i-back" /></button>
            <b aria-live="polite">{TH_MF[v.m]} {v.y + 543}</b><button type="button" className="dt-nav" aria-label="เดือนถัดไป" onClick={() => shift(1)}><Icon id="i-next" /></button></div>
          <div className="dt-cal wk" aria-hidden="true">{["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map(x => <span key={x}>{x}</span>)}</div>
          <div className="dt-cal">{days.map(x => {
            const k = dayKey(x.y, x.m, x.d), on = k === selK, dis = k < todayK || (minK != null && k < minK);
            const span = minK != null && selK != null && !on && k >= minK && k < selK;
            return <button key={k} type="button" className={`dt-day num${x.m !== v.m ? " out" : ""}${k === todayK ? " today" : ""}${span ? " span" : ""}`} aria-pressed={on} disabled={dis}
              aria-label={dateText(fromParts(x.y, x.m, x.d, 12, 0))} onClick={() => pickDay(x)}>{x.d}</button>;
          })}</div>
          <div className="dt-foot"><span className="hint" style={{ margin: 0 }}>วันนี้ {dateText(now)}</span>
            <span>{value != null && <button type="button" className="dt-clear" onClick={() => { onChange(null); setOpen(""); }}>ล้างข้อมูล</button>}
              <button type="button" className="dt-chip" onClick={() => setOpen("")}>ยืนยัน</button></span></div>
        </div>}
      </div>
      <div className="dt-cell">
        <button type="button" className="dt-pick num" aria-haspopup="dialog" aria-expanded={open === "time"} aria-invalid={invalid || undefined} disabled={disabled}
          aria-label={`${label} เวลา ${value != null ? timeText(value) : "ยังไม่เลือก"}`} onClick={() => setOpen(open === "time" ? "" : "time")}>
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
          <span className={"v" + (value == null ? " ph" : "")}>{value != null ? timeText(value) : "เวลา"}</span><Icon id="i-down" />
        </button>
        {open === "time" && <div className="dt-pop r" role="dialog" aria-label={"เลือกเวลา " + label}>
          <div className="dt-head"><span className="dt-lb">ชั่วโมง</span><b className="num" style={{ fontSize: 22 }}>{pad2(ch)}:{pad2(cmin)} น.</b></div>
          <div className="dt-grid" role="radiogroup" aria-label="ชั่วโมง">{Array.from({ length: 24 }, (_, h) => (
            <button key={h} type="button" role="radio" className="dt-tm num" aria-checked={h === ch} onClick={() => setTime(h, cmin)}>{pad2(h)}</button>))}</div>
          <span className="dt-lb">นาที</span>
          <div className="dt-grid m" role="radiogroup" aria-label="นาที">{[0, 15, 30, 45].map(mi => (
            <button key={mi} type="button" role="radio" className="dt-tm num" aria-checked={mi === cmin} onClick={() => { setTime(ch, mi); setOpen(""); }}>:{pad2(mi)}</button>))}</div>
          <div className="dt-foot"><span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{(quick || ["18:00", "19:30", "21:00"]).map(q => {
            const [h, mi] = q.split(":").map(Number);
            return <button key={q} type="button" className="dt-chip num" onClick={() => { setTime(h, mi); setOpen(""); }}>{q}</button>; })}</span>
            <button type="button" className="dt-chip on" onClick={() => setOpen("")}>ยืนยัน</button></div>
        </div>}
      </div>
    </div>);
}
export { DAY };
