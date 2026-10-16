// Screen names from the mock-up mapped to routes. Ids travel in the query string (?id=) so the
// static export has one file per route. go() / back() work from any action, not only components.
import { S } from "./state";

export const PATH: Record<string, string> = {
  home: "/", event: "/event/", checkout: "/checkout/", pay: "/pay/", minting: "/minting/", success: "/success/",
  paymentSuccess: "/payment/", tickets: "/tickets/", ticket: "/ticket/", market: "/market/", profile: "/profile/",
  orgDash: "/org/", orgWelcome: "/org/welcome/", orgOnboard: "/org/onboarding/", orgEvents: "/org/events/", orgWizard: "/org/wizard/",
  orgEvent: "/org/event/", orgGatePick: "/org/gate/", orgGate: "/org/gate/scan/", orgFinance: "/org/finance/", orgTeam: "/org/team/",
};
export const SCREEN_OF: Record<string, string> = Object.fromEntries(Object.entries(PATH).map(([k, v]) => [v, k]));

type Router = { push: (u: string) => void; replace: (u: string) => void; back: () => void };
const nav: { router: Router | null; depth: number } = { router: null, depth: 0 };
export const bindRouter = (r: Router) => { nav.router = r; };

// screens that carry an id in the URL
function urlFor(screen: string, id?: string) {
  const p = PATH[screen] || "/";
  const q = id ?? (screen === "event" ? S.ev : screen === "ticket" && S.sel ? String(S.sel.key || S.sel.tid)
    : (screen === "orgEvent" || screen === "orgGate") && S.org ? S.org.oev : undefined);
  return q != null && ["event", "ticket", "orgEvent", "orgGate"].includes(screen) ? `${p}?id=${encodeURIComponent(q)}` : p;
}
export function go(screen: string, opts: { replace?: boolean; id?: string } = {}) {
  const u = urlFor(screen, opts.id);
  if (!nav.router) { if (typeof window !== "undefined") window.location.href = u; return; }
  if (opts.replace) nav.router.replace(u); else { nav.depth++; nav.router.push(u); }
}
// back inside the app; a deep link with nothing to go back to goes to the parent screen
export function back(fallback = "home") {
  if (nav.depth > 0 && nav.router) { nav.depth--; nav.router.back(); return; }
  go(fallback, { replace: true });
}
export const currentScreen = () => (typeof window === "undefined" ? "home" : SCREEN_OF[window.location.pathname.replace(/\/?$/, "/")] || "home");
