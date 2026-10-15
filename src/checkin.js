// Door check-in (context A6): a QR signed by the ticket owner's wallet, scanned by the shop's
// staff, then the ticket is marked used in D1 at once and on the contract right after.
//
//   GET  /api/tickets/:id/qr             ticket owner: { code, ts, expiresAt } — a fresh EntryPass
//                                        signed through the owner's thirdweb server wallet
//   GET  /api/checkin/events             staff: events the caller may scan, with check-in counts
//   GET  /api/checkin/events/:id         staff: counts and the last scans of one event
//   POST /api/checkin/events/:id/scan    staff: { code } -> { valid, reason, ticket }
//   cron                                 advanceMarkUsed: send/settle markUsed for used tickets
//
// Staff = owner, manager or gate of the shop that owns the event (host_members, 0006), and
// admins for any event (the four platform events have no shop).
//
// The code is "JL1.<tokenId>.<ts>.<signature>", where signature (base64url, 65 bytes) is the
// owner's EIP-712 signature of EntryPass { tokenId, ts } (src/evm.js). It is valid for 60 s
// and may be up to 15 s in the future (context section 10, clock drift between phones).
// A scan checks, in order: format, age, the ticket, that the signer is the ticket's owner
// wallet, the event, the ticket status, then ownerOf / used / eventOf on chain (every scan).
// Only then the ticket moves active -> used, in one guarded UPDATE.

import { entryPassTypedData, entryPassDigest, recoverAddress, toHex, callData } from './evm.js';
import { hostAccess, maskEmail } from './organizer.js';

export const QR_TTL = 60;          // seconds a code is valid
export const QR_FUTURE_SKEW = 15;  // seconds a code may be ahead of the server clock
const CHAIN_ID = 43113;
const CODE_RE = /^JL1\.([1-9][0-9]{0,15})\.([1-9][0-9]{0,11})\.([A-Za-z0-9_-]{86,88})$/;
const MAX_MARK_USED_ATTEMPTS = 3;

// Reasons a scan is refused; the scan page shows these in Thai.
export const REASONS = [
  'malformed', 'expired', 'future', 'unknown_ticket', 'bad_signature', 'wrong_event', 'event_cancelled',
  'event_ended', 'already_used', 'listed', 'not_issued', 'chain_mismatch', 'chain_unavailable',
];

/* ---------- pure parts (tests/worker/checkin.test.mjs) ---------- */

export function encodeEntryCode(tokenId, ts, signature) {
  return `JL1.${tokenId}.${ts}.${b64url(fromHexBytes(signature))}`;
}

export function parseEntryCode(code) {
  const m = CODE_RE.exec(String(code || '').trim());
  if (!m) return null;
  const sig = b64urlBytes(m[3]);
  if (!sig || sig.length !== 65) return null;
  return { tokenId: Number(m[1]), ts: Number(m[2]), signature: toHex(sig) };
}

// Decides a scan from what D1 holds. Returns a reason, or null when it may pass (the chain
// check and the guarded UPDATE still follow).
//   entry: parsed code; ticket/event: D1 rows (or null); signer: recovered address
export function judgeEntry({ entry, nowSec, ticket, event, scanEventId, signer }) {
  if (!entry) return 'malformed';
  const age = nowSec - entry.ts;
  if (age > QR_TTL) return 'expired';
  if (age < -QR_FUTURE_SKEW) return 'future';
  if (!ticket) return 'unknown_ticket';
  if (!signer || signer !== String(ticket.owner_wallet).toLowerCase()) return 'bad_signature';
  if (ticket.event_id !== scanEventId) return 'wrong_event';
  if (!event || event.cancelled_at) return 'event_cancelled';
  if (event.ends_at && nowSec * 1000 > event.ends_at) return 'event_ended';
  if (ticket.status === 'used') return 'already_used';
  if (ticket.status === 'listed') return 'listed';
  if (ticket.status !== 'active' || ticket.token_id == null) return 'not_issued';
  return null;
}

// Results of eth_call ownerOf / used / eventOf compared with D1.
export function judgeChain({ owner, used, eventOf }, ticket, event) {
  if (used) return 'already_used';
  if (!owner || owner !== String(ticket.owner_wallet).toLowerCase()) return 'chain_mismatch';
  if (event.chain_event_id != null && eventOf !== Number(event.chain_event_id)) return 'wrong_event';
  return null;
}

/* ---------- routes ---------- */

// deps: { currentUser, json } from src/worker.js
export async function handleCheckin(request, env, ctx, url, deps) {
  const { json } = deps;
  const user = await deps.currentUser(request, env);
  if (!user) return json({ error: 'authentication_required' }, 401);
  const path = url.pathname, method = request.method;

  const qr = path.match(/^\/api\/tickets\/([0-9a-f-]{36})\/qr$/);
  if (qr && method === 'GET') return issueCode(env, user, qr[1], json);

  if (path === '/api/checkin/events' && method === 'GET') {
    return json({ events: await scannableEvents(env.DB, user) }, 200, { 'cache-control': 'no-store' });
  }
  const m = path.match(/^\/api\/checkin\/events\/([A-Za-z0-9-]{1,40})(\/scan)?$/);
  if (m) {
    const event = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(m[1]).first();
    if (!event || !(await canScan(env.DB, user, event))) return json({ error: 'event_not_found' }, 404);
    if (!m[2] && method === 'GET') return json(await eventCheckins(env.DB, event), 200, { 'cache-control': 'no-store' });
    if (m[2] && method === 'POST') {
      if (!String(request.headers.get('content-type') || '').startsWith('application/json')) return json({ error: 'json_required' }, 415);
      const body = await request.json().catch(() => null);
      return json(await scan(env, ctx, user, event, body?.code));
    }
  }
  return json({ error: 'not_found' }, 404);
}

async function canScan(db, user, event) {
  if (user.role === 'admin') return true;
  if (!event.host_id) return false;
  const access = await hostAccess(db, user);
  return Boolean(access && access.hostId === event.host_id);
}

async function issueCode(env, user, ticketId, json) {
  const t = await env.DB.prepare(
    `SELECT t.id, t.token_id, t.status, t.owner_wallet, e.cancelled_at FROM tickets t
     JOIN events e ON e.id = t.event_id WHERE t.id = ? AND t.user_id = ?`,
  ).bind(ticketId, user.id).first();
  if (!t) return json({ error: 'ticket_not_found' }, 404);
  if (t.cancelled_at) return json({ error: 'event_cancelled' }, 409);
  if (t.status !== 'active' || t.token_id == null) return json({ error: 'ticket_' + t.status }, 409);
  if (!env.THIRDWEB_SECRET_KEY) return json({ error: 'thirdweb_not_configured' }, 503);
  const ts = Math.floor(Date.now() / 1000);
  let signature;
  try {
    const res = await thirdweb(env, '/v1/wallets/sign-typed-data', {
      from: t.owner_wallet, chainId: CHAIN_ID, ...entryPassTypedData(t.token_id, ts, CHAIN_ID, contract(env)),
    });
    signature = res?.result?.signature;
  } catch (err) {
    console.error('entry pass signing failed', t.id, err && err.stack || err);
    return json({ error: 'signing_failed' }, 502);
  }
  // Only a plain 65-byte ECDSA signature can be checked at the door (a smart-account
  // signature would need ERC-1271 on chain), so anything else is refused here, not there.
  const signer = signature && recoverAddress(entryPassDigest(t.token_id, ts, CHAIN_ID, contract(env)), signature);
  if (signer !== String(t.owner_wallet).toLowerCase()) {
    console.error('entry pass signature does not recover to the owner', t.id, signer, String(signature).slice(0, 20));
    return json({ error: 'signing_failed' }, 502);
  }
  return json({ code: encodeEntryCode(t.token_id, ts, signature), ts, expiresAt: (ts + QR_TTL) * 1000 }, 200, { 'cache-control': 'no-store' });
}

async function scan(env, ctx, user, event, code) {
  const db = env.DB;
  const nowSec = Math.floor(Date.now() / 1000);
  const entry = parseEntryCode(code);
  const ticket = entry ? await db.prepare(
    `SELECT t.*, u.display_name, u.email FROM tickets t JOIN users u ON u.id = t.user_id WHERE t.token_id = ?`,
  ).bind(entry.tokenId).first() : null;
  const signer = entry && ticket ? recoverAddress(entryPassDigest(entry.tokenId, entry.ts, CHAIN_ID, contract(env)), entry.signature) : null;
  let reason = judgeEntry({ entry, nowSec, ticket, event, scanEventId: event.id, signer });
  if (!reason) {
    try {
      reason = judgeChain(await readChain(env, ticket.token_id), ticket, event);
    } catch (err) {
      console.error('chain check failed', ticket.token_id, err && err.stack || err);
      reason = 'chain_unavailable';
    }
  }
  if (!reason) {
    const now = Date.now();
    const claim = await db.prepare(
      `UPDATE tickets SET status = 'used', used_at = ?, used_by = ? WHERE id = ? AND status = 'active'`,
    ).bind(now, user.id, ticket.id).run();
    if (claim.meta.changes) {
      ticket.status = 'used'; ticket.used_at = now;
      ctx.waitUntil(markUsed(env, ticket.id).catch(err => console.error('markUsed failed', ticket.id, err && err.stack || err)));
    } else {
      reason = 'already_used'; // another door got it first
    }
  }
  if (reason === 'already_used' && ticket && !ticket.used_at) {
    ticket.used_at = (await db.prepare('SELECT used_at FROM tickets WHERE id = ?').bind(ticket.id).first())?.used_at;
  }
  // Only tickets of this event are named back to the scanner.
  const own = ticket && ticket.event_id === event.id && reason !== 'bad_signature';
  await db.prepare(
    `INSERT INTO ticket_scans (event_id, ticket_id, token_id, scanned_by, valid, reason) VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(event.id, ticket?.id || null, entry?.tokenId ?? null, user.id, reason ? 0 : 1, reason).run();
  return {
    valid: !reason, reason,
    ticket: own ? { tokenId: ticket.token_id, zone: ticket.zone, holder: ticket.display_name || maskEmail(ticket.email), usedAt: ticket.used_at || null } : null,
  };
}

async function scannableEvents(db, user) {
  const access = await hostAccess(db, user);
  const admin = user.role === 'admin';
  if (!access && !admin) return [];
  const rows = await db.prepare(
    `SELECT e.id, e.name, e.event_date, e.event_time, e.venue, e.status, e.starts_at, e.ends_at, e.host_id,
            (SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.id AND t.status IN ('active', 'listed', 'used')) AS total,
            (SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.id AND t.status = 'used') AS used
     FROM events e
     WHERE e.status IN ('on_sale', 'sold_out') AND e.cancelled_at IS NULL
       AND (e.host_id = ? OR (? AND e.host_id IS NULL))
     ORDER BY COALESCE(e.starts_at, 0), e.id LIMIT 100`,
  ).bind(access?.hostId || '', admin ? 1 : 0).all();
  return (rows.results || []).map(e => ({
    id: e.id, name: e.name, date: e.event_date, time: e.event_time, venue: e.venue,
    startsAt: e.starts_at, endsAt: e.ends_at, total: e.total, used: e.used,
  }));
}

async function eventCheckins(db, event) {
  const counts = await db.prepare(
    `SELECT COUNT(*) AS total, COALESCE(SUM(status = 'used'), 0) AS used FROM tickets
     WHERE event_id = ? AND status IN ('active', 'listed', 'used')`,
  ).bind(event.id).first();
  const scans = await db.prepare(
    `SELECT s.created_at, s.valid, s.reason, s.token_id, t.zone, u.display_name AS staff
     FROM ticket_scans s JOIN users u ON u.id = s.scanned_by LEFT JOIN tickets t ON t.id = s.ticket_id
     WHERE s.event_id = ? ORDER BY s.id DESC LIMIT 30`,
  ).bind(event.id).all();
  return {
    event: { id: event.id, name: event.name, date: event.event_date, time: event.event_time, venue: event.venue },
    total: counts.total, used: counts.used,
    scans: (scans.results || []).map(s => ({ at: s.created_at, valid: Boolean(s.valid), reason: s.reason, tokenId: s.token_id, zone: s.zone, staff: s.staff })),
  };
}

/* ---------- chain: read on every scan, markUsed after a pass ---------- */

const contract = env => env.TICKET_CONTRACT || '0xef36fcbdED316dEd4367636a6c85d73bFD5e2735';
const RELAYER = '0x8f79c4dE47287b129E2B7279Ae34c779D1eFA952'; // same smart account as mintOrder
const FUJI_RPC = 'https://api.avax-test.network/ext/bc/C/rpc';

export async function readChain(env, tokenId) {
  const calls = ['ownerOf', 'used', 'eventOf'].map((fn, id) => ({
    jsonrpc: '2.0', id, method: 'eth_call', params: [{ to: contract(env), data: callData(fn, tokenId) }, 'latest'],
  }));
  const res = await fetch(env.FUJI_RPC_URL || FUJI_RPC, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(calls),
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`fuji rpc ${res.status}`);
  const out = await res.json();
  const byId = Object.fromEntries((Array.isArray(out) ? out : []).map(r => [r.id, r]));
  // ownerOf reverts for a token that does not exist: that is a mismatch, not an outage
  const reverted = r => r?.error && /revert/i.test(String(r.error.message || '')) || r?.error?.code === 3;
  if (reverted(byId[0])) return { owner: null, used: false, eventOf: null };
  if (![0, 1, 2].every(i => typeof byId[i]?.result === 'string')) throw new Error('fuji rpc gave no result');
  return {
    owner: '0x' + byId[0].result.slice(-40).toLowerCase(),
    used: BigInt(byId[1].result) !== 0n,
    eventOf: Number(BigInt(byId[2].result)),
  };
}

// Sends markUsed for one used ticket, once: the 'sending' claim keeps two workers apart.
// D1 already refuses the ticket at the door; the chain write is the public record.
export async function markUsed(env, ticketId) {
  if (!env.THIRDWEB_SECRET_KEY) return; // the cron sends it once the secret is set
  const claim = await env.DB.prepare(
    `UPDATE tickets SET mark_used_tx_id = 'sending', mark_used_attempts = mark_used_attempts + 1
     WHERE id = ? AND status = 'used' AND token_id IS NOT NULL AND mark_used_tx_id IS NULL
       AND mark_used_tx_hash IS NULL AND mark_used_attempts < ?`,
  ).bind(ticketId, MAX_MARK_USED_ATTEMPTS).run();
  if (!claim.meta.changes) return;
  const t = await env.DB.prepare('SELECT token_id FROM tickets WHERE id = ?').bind(ticketId).first();
  let txId;
  try {
    const res = await thirdweb(env, '/v1/contracts/write', {
      chainId: CHAIN_ID, from: RELAYER,
      calls: [{ contractAddress: contract(env), method: 'function markUsed(uint256 tokenId)', params: [String(t.token_id)] }],
    });
    txId = res?.result?.transactionIds?.[0];
    if (!txId) throw new Error('thirdweb returned no transaction id');
  } catch (err) {
    // A timeout may still have queued the write. That is safe here: a second markUsed only
    // reverts with TicketAlreadyUsed, and settleMarkUsed treats "already used" as done.
    await env.DB.prepare(`UPDATE tickets SET mark_used_tx_id = NULL, mark_used_error = ? WHERE id = ? AND mark_used_tx_id = 'sending'`)
      .bind(String(err && err.message || err).slice(0, 500), ticketId).run();
    return;
  }
  await env.DB.prepare('UPDATE tickets SET mark_used_tx_id = ?, mark_used_error = NULL WHERE id = ?').bind(txId, ticketId).run();
  await settleMarkUsed(env, ticketId, 8);
}

export async function settleMarkUsed(env, ticketId, polls = 1) {
  const t = await env.DB.prepare(
    `SELECT token_id, mark_used_tx_id FROM tickets WHERE id = ? AND status = 'used' AND mark_used_tx_hash IS NULL`,
  ).bind(ticketId).first();
  if (!t?.mark_used_tx_id || t.mark_used_tx_id === 'sending') return;
  let tx = { status: 'QUEUED' };
  for (let i = 0; i < polls; i++) {
    if (i) await new Promise(r => setTimeout(r, env.MARK_USED_POLL_MS ? Number(env.MARK_USED_POLL_MS) : 2000));
    const res = await thirdweb(env, `/v1/transactions/${encodeURIComponent(t.mark_used_tx_id)}`).catch(() => null);
    const r = res?.result || {};
    tx = { status: r.status || tx.status, hash: r.transactionHash || null, error: r.errorMessage || null };
    if (tx.status === 'CONFIRMED' || tx.status === 'FAILED') break;
  }
  if (tx.status === 'CONFIRMED' && tx.hash) {
    await env.DB.prepare('UPDATE tickets SET mark_used_tx_hash = ? WHERE id = ?').bind(tx.hash, ticketId).run();
  } else if (tx.status === 'FAILED') {
    const chain = await readChain(env, t.token_id).catch(() => null);
    await env.DB.prepare(
      `UPDATE tickets SET mark_used_tx_id = NULL, mark_used_error = ?, mark_used_tx_hash = ? WHERE id = ? AND mark_used_tx_id = ?`,
    ).bind(String(tx.error || 'markUsed failed').slice(0, 500), chain?.used ? 'already-used-on-chain' : null, ticketId, t.mark_used_tx_id).run();
  }
}

// Cron: finish markUsed for tickets used at the door whose chain write is missing or queued.
export async function advanceMarkUsed(env) {
  const rows = await env.DB.prepare(
    `SELECT id, mark_used_tx_id FROM tickets
     WHERE status = 'used' AND mark_used_tx_hash IS NULL AND token_id IS NOT NULL
       AND (mark_used_tx_id IS NOT NULL OR mark_used_attempts < ?)
     ORDER BY used_at LIMIT 10`,
  ).bind(MAX_MARK_USED_ATTEMPTS).all();
  for (const t of rows.results || []) {
    try {
      if (t.mark_used_tx_id == null) await markUsed(env, t.id);
      else if (t.mark_used_tx_id !== 'sending') await settleMarkUsed(env, t.id);
    } catch (err) { console.error('markUsed sweep failed', t.id, err && err.stack || err); }
  }
}

/* ---------- helpers ---------- */

async function thirdweb(env, path, body) {
  const res = await fetch((env.THIRDWEB_API_URL || 'https://api.thirdweb.com') + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-secret-key': env.THIRDWEB_SECRET_KEY, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`thirdweb ${path.split('/').slice(0, 3).join('/')} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

function fromHexBytes(hex) {
  const s = String(hex).replace(/^0x/, '');
  return Uint8Array.from(s.match(/../g) || [], h => parseInt(h, 16));
}
function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlBytes(text) {
  try {
    const s = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4));
    return Uint8Array.from(s, c => c.charCodeAt(0));
  } catch (_) { return null; }
}
