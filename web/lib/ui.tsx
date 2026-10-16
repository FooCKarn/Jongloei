"use client";
// Toast and bottom sheet (dialog on desk), shared by every screen. A sheet is a render function,
// so it always shows the current state; Esc and the scrim close it, and focus returns to the opener.
import { ReactNode, useEffect, useRef, useSyncExternalStore } from "react";

type Toast = { id: number; msg: string; bad: boolean } | null;
const ui: { toast: Toast; sheet: null | (() => ReactNode); opener: HTMLElement | null } = { toast: null, sheet: null, opener: null };
let v = 0;
const ls = new Set<() => void>();
const bump = () => { v++; ls.forEach(l => l()); };
const sub = (l: () => void) => { ls.add(l); return () => { ls.delete(l); }; };
const useUi = () => useSyncExternalStore(sub, () => v, () => 0);

// error toasts (red, alert icon) are spotted from the wording unless kind says otherwise
export function toast(msg: string, kind?: "ok" | "err") {
  const bad = kind === "err" || (kind === undefined && /ไม่สำเร็จ|ไม่ได้|ผิดพลาด/.test(String(msg)));
  const id = Date.now() + Math.random();
  ui.toast = { id, msg, bad }; bump();
  setTimeout(() => { if (ui.toast && ui.toast.id === id) { ui.toast = null; bump(); } }, 2600);
}
// a demo action that is not wired to an API yet: it still works locally and says so
export const mockToast = (msg: string) => toast(msg + " (ข้อมูลจำลองระบบ)", "ok");

export function sheet(render: () => ReactNode) {
  if (!ui.sheet && typeof document !== "undefined") ui.opener = document.activeElement as HTMLElement;
  ui.sheet = render; bump();
}
export function closeSheet() {
  if (!ui.sheet) return;
  ui.sheet = null; bump();
  const o = ui.opener; ui.opener = null;
  if (o && o.isConnected) setTimeout(() => o.focus(), 0);
}
export const sheetOpen = () => !!ui.sheet;
export const rerenderSheet = bump;

const FOCUSABLE = 'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])';

export function SheetHost() {
  useUi();
  const box = useRef<HTMLDivElement>(null);
  const open = !!ui.sheet;
  useEffect(() => {
    if (!open || !box.current) return;
    const first = box.current.querySelector<HTMLElement>(FOCUSABLE);
    (first || box.current).focus();
  }, [open]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!ui.sheet) return;
      if (e.key === "Escape") { closeSheet(); return; }
      if (e.key !== "Tab" || !box.current) return;
      const f = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (!box.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  if (!ui.sheet) return null;
  return (
    <div className="sheet-wrap" id="sheet" onClick={e => { if (e.target === e.currentTarget) closeSheet(); }}>
      <div className="sheet" role="dialog" aria-modal="true" tabIndex={-1} ref={box}>
        <div className="grab" />
        {ui.sheet()}
      </div>
    </div>
  );
}

export function ToastHost() {
  useUi();
  const t = ui.toast;
  if (!t) return null;
  return (
    <div key={t.id} className={"toast" + (t.bad ? " err" : "")} role={t.bad ? "alert" : "status"}>
      <svg width="18" height="18" style={{ flex: "none" }}><use href={t.bad ? "#i-alert" : "#i-check"} /></svg>{t.msg}
    </div>
  );
}
