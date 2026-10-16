// Thai / English switch. Thai text in the code is the key: tr("ไทย") returns the English text from
// lib/en.ts when the language is English, and the Thai text itself when there is no entry (so strings
// coming from the API pass through untouched). {name} placeholders are filled from vars.
import { useSyncExternalStore } from "react";
import { EN, EN_RE } from "./en";

export type Lang = "th" | "en";
const KEY = "jongloei-lang";

let lang: Lang = "th", version = 0;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

function applyToDocument() {
  if (typeof document !== "undefined") document.documentElement.lang = lang;
}
function notify() { version++; listeners.forEach(l => l()); }

export const getLang = () => lang;
export const locale = () => (lang === "en" ? "en-GB" : "th-TH");

// read the saved choice once on boot (the first render is always Thai so it matches the static HTML)
export function initLang() {
  const before = lang;
  try { const v = localStorage.getItem(KEY); if (v === "en" || v === "th") lang = v; } catch (_) { /* private mode: stay on Thai */ }
  applyToDocument();
  if (lang !== before) notify();
}
export function setLang(next: Lang) {
  if (next === lang) return;
  lang = next;
  try { localStorage.setItem(KEY, next); } catch (_) {}
  applyToDocument();
  notify();
}
export const toggleLang = () => setLang(lang === "th" ? "en" : "th");
export function useLang() { useSyncExternalStore(subscribe, () => version, () => 0); return lang; }

function lookup(th: string): string {
  if (lang !== "en") return th;
  const hit = EN[th];
  if (hit !== undefined) return hit;
  // JSX text keeps its edge spaces; the dictionary key is trimmed
  const core = th.trim();
  if (core !== th && EN[core] !== undefined) return th.slice(0, th.indexOf(core)) + EN[core] + th.slice(th.indexOf(core) + core.length);
  return convert(th);
}

// strings the dictionary cannot list one by one: Thai dates ("ส. 21 พ.ย. 2569"), and API / logic messages with numbers in them
const TH_MO = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const EN_MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Thai weekday, short ("ส.") or full ("เสาร์"), matched by its first letters; order matters (พฤ before พ, อา / อัง before อ)
const WD_PREFIX: [string, string][] = [["อา", "Sun"], ["อัง", "Tue"], ["อ", "Tue"], ["จ", "Mon"], ["พฤ", "Thu"], ["พ", "Wed"], ["ศ", "Fri"], ["ส", "Sat"]];
const esc = (w: string) => w.replaceAll(".", "[.]");
const DATE_RE = new RegExp("^([ก-ฮะ-์.]+) ([0-9]{1,2}) (" + TH_MO.map(esc).join("|") + ") ([0-9]{4})$");
function convert(th: string): string {
  const s = th.trim();
  const d = DATE_RE.exec(s);
  if (d) {
    const wd = WD_PREFIX.find(([p]) => d[1].startsWith(p));
    if (wd) return wd[1] + " " + d[2] + " " + EN_MO[TH_MO.indexOf(d[3])] + " " + (+d[4] - 543);
  }
  for (const [re, to] of EN_RE) if (re.test(s)) return s.replace(re, to);
  return th;
}

export function tr(th: string, vars?: Record<string, string | number>): string {
  if (typeof th !== "string") return th; // empty fields come through as undefined / null
  const s = lookup(th);
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? (typeof vars[k] === "string" ? lookup(vars[k] as string) : String(vars[k])) : m)) : s;
}

// Wrap a module-level table of labels: every Thai string is translated when it is read, so the table
// can stay a constant while the screen follows the language. Not for values that the code compares.
export function tmap<T extends object>(o: T): T {
  return new Proxy(o, {
    get(target, p, recv) {
      const v = Reflect.get(target, p, recv);
      if (typeof v === "string") return tr(v);
      if (v && typeof v === "object") return tmap(v as object);
      return v;
    },
  }) as T;
}

// Bangkok date / time for epoch milliseconds, in the language that is on screen
const BKK = "Asia/Bangkok";
export const dateOf = (ms: number) => new Intl.DateTimeFormat(locale(), { timeZone: BKK, weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(ms);
export const timeOf = (ms: number) => new Intl.DateTimeFormat(locale(), { timeZone: BKK, hour: "2-digit", minute: "2-digit", hour12: false }).format(ms);
