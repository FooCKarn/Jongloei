// JongLoei Worker: real "Sign in with Google" for the mock-up.
//
// Routes (everything else is served from ./mockup as static assets):
//   GET  /api/me                 -> { googleEnabled, user }
//   POST /api/checkout-session   -> create a Stripe Checkout Session
//   GET  /api/checkout-status    -> order status and its tickets after returning from Stripe
//   POST /api/checkout-cancel    -> give held seats back when the guest cancels at Stripe
//   GET  /api/tickets            -> the signed-in user's tickets
//   POST /api/stripe/webhook     -> 5 payment checks (context 6.1), then mint the tickets
//   cron (every minute)          -> release expired seat holds, finish paid orders
//   GET  /auth/google/start      -> redirect to Google's account chooser
//   GET  /auth/google/callback   -> verify ID token, upsert user in D1, make sure the user
//                                   has a ticket wallet, set session cookie
//   POST /auth/logout            -> revoke the session
//   POST /api/dev/test-mint      -> admin only: mint one test ticket to the caller's wallet
//   /api/org/*, /api/admin/hosts -> organizer API, see src/organizer.js
//   /api/tickets/:id/qr, /api/checkin/* -> entry QR and door check-in, see src/checkin.js
//   /api/resale/*                -> resale market and its checkout, see src/resale.js
//
// Secrets (set in Cloudflare, never committed): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
// THIRDWEB_SECRET_KEY, STRIPE_SECRET_KEY (prefer an rk_ restricted key), and
// STRIPE_WEBHOOK_SECRET. Without the Google ones /api/me reports googleEnabled=false and
// the mock-up keeps its demo login. Without THIRDWEB_SECRET_KEY login works but no wallet
// is made.

import { handleOrganizer } from './organizer.js';
import { handleCheckin, advanceMarkUsed } from './checkin.js';
import { keccak256, toHex, callData, SELECTORS } from './evm.js';
import {
  handleResale, confirmResalePayment, releaseResaleBySession, resaleCheckoutStatus, cancelResaleCheckout, resaleSweep,
} from './resale.js';

const SESSION_COOKIE = 'jl_session';
const STATE_COOKIE = 'jl_oauth';
const SESSION_DAYS = 30;
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const WALLET_CHAIN_ID = 43113; // Avalanche Fuji testnet, matches wallets.chain_id default
const THIRDWEB_API = 'https://api.thirdweb.com';
// JongloeiTicket on Avalanche Fuji (contracts/deployments/fuji.json). Ticket writes are sent from
// the ERC-4337 smart account of the thirdweb server wallet jongloei-relayer (signer 0xDb5C...B260):
// Fuji has no EIP-7702, so sending from the signer address fails with "Chain does not support
// EIP-7702". The smart account holds MINTER_ROLE and OPERATOR_ROLE; thirdweb sponsors its gas.
const TICKET_CONTRACT = '0xef36fcbdED316dEd4367636a6c85d73bFD5e2735';
const RELAYER_ADDRESS = '0x8f79c4dE47287b129E2B7279Ae34c779D1eFA952';
const FUJI_EXPLORER = 'https://testnet.snowtrace.io';
const FUJI_RPC = 'https://api.avax-test.network/ext/bc/C/rpc';
const ERC721_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const STRIPE_VERSION = '2026-09-30.endive';
const HOLD_MS = 10 * 60000; // seat hold while the guest pays (context: 10 minutes)
const SERVICE_FEE = 0.03;
const MAX_TICKETS_PER_EVENT = 4;
const MAX_MINT_ATTEMPTS = 3;
// thirdweb can keep a mint "pending" after it landed (its bundler failing receipt lookups with
// RECEIPT_QUERY_FAILED retries forever), so after a few minutes the mint is looked up on chain,
// and after 30 minutes with nothing found the order goes to review instead of waiting forever.
const MINT_CHAIN_CHECK_AFTER_MS = 3 * 60000;
const MINT_REVIEW_AFTER_MS = 30 * 60000;
const MINT_SCAN_MAX = 60; // token ids read per chain check; ids below the last settled order are skipped
// Seats a buyer can still take in zone z: not sold (remaining, reduced on verified payment by
// 0004) and not held by a pending order (the 10-minute hold).
const AVAILABLE_SEATS = `(z.remaining - (SELECT COALESCE(SUM(o.quantity), 0) FROM payment_orders o
  WHERE o.event_id = z.event_id AND o.zone = z.zone_name AND o.status = 'pending'))`;

export default {
  scheduled,
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/me' && request.method === 'GET') return me(request, env);
      if (url.pathname === '/api/health' && request.method === 'GET') {
        return json({ ok: true, service: 'jongloei-worker' }, 200, { 'cache-control': 'no-store' });
      }
      if (url.pathname === '/api/events' && request.method === 'GET') return events(request, env);
      if (url.pathname === '/api/checkout-session' && request.method === 'POST') return createCheckoutSession(request, env, ctx);
      if (url.pathname === '/api/checkout-status' && request.method === 'GET') return checkoutStatus(request, env, ctx);
      if (url.pathname === '/api/checkout-cancel' && request.method === 'POST') return cancelCheckout(request, env, ctx);
      if (url.pathname === '/api/tickets' && request.method === 'GET') return myTickets(request, env, ctx);
      if (url.pathname === '/api/stripe/webhook' && request.method === 'POST') return stripeWebhook(request, env, ctx);
      if (url.pathname === '/auth/google/start' && request.method === 'GET') return start(request, env);
      if (url.pathname === '/auth/google/callback' && request.method === 'GET') return callback(request, env);
      if (url.pathname === '/auth/logout' && request.method === 'POST') return logout(request, env);
      if (url.pathname === '/api/dev/test-mint' && request.method === 'POST') return testMint(request, env);
      if (url.pathname.startsWith('/api/org/') || url.pathname.startsWith('/api/admin/hosts')) {
        return handleOrganizer(request, env, ctx, url, { currentUser, json, expireOrder, logEvent });
      }
      if (url.pathname.startsWith('/api/tickets/') || url.pathname.startsWith('/api/checkin/')) {
        return handleCheckin(request, env, ctx, url, { currentUser, json });
      }
      if (url.pathname.startsWith('/api/resale/')) return handleResale(request, env, ctx, url, resaleDeps);
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
        return json({ error: 'not_found' }, 404);
      }
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error('worker error', err && err.stack || err);
      if (url.pathname.startsWith('/auth/google/')) return redirect('/?login=error');
      return json({ error: 'server_error' }, 500);
    }
  },
};

const googleEnabled = env => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.DB);

/* ---------- routes ---------- */

async function me(request, env) {
  const user = googleEnabled(env) ? await currentUser(request, env) : null;
  return json({ googleEnabled: googleEnabled(env), user }, 200, { 'cache-control': 'no-store' });
}

async function events(request, env) {
  try {
    const list = capacity => env.DB.prepare(
      `SELECT e.id, e.name, e.short_name AS short, e.category AS tag, e.event_date AS date,
              e.event_time AS time, e.venue, e.poster_background AS bg, e.sold_percent AS sold,
              z.zone_name AS zone, z.price, z.color, ${capacity} AS capacity, ${AVAILABLE_SEATS} AS remaining
       FROM events e JOIN event_zones z ON z.event_id = e.id
       WHERE e.status = 'on_sale' ORDER BY e.event_date, e.id, z.sort_order`,
    ).all();
    // Until 0006_organizer.sql is applied the column does not exist; keep the list working.
    const rows = await list('z.capacity').catch(err => {
      if (/no such column/.test(String(err?.message || err))) return list('NULL');
      throw err;
    });
    const byId = new Map();
    for (const row of rows.results || []) {
      let event = byId.get(row.id);
      if (!event) {
        event = { id: row.id, name: row.name, short: row.short, tag: row.tag, date: row.date,
          time: row.time, venue: row.venue, bg: row.bg, sold: row.sold, zones: [], cap: 0, taken: 0 };
        byId.set(row.id, event);
      }
      event.zones.push({ z: row.zone, p: row.price, left: row.remaining, c: row.color });
      // organizer events (0006) know their capacity, so their sold % is computed, not stored
      if (row.capacity == null) event.cap = null;
      else if (event.cap != null) { event.cap += row.capacity; event.taken += row.capacity - row.remaining; }
    }
    const result = [...byId.values()].map(({ cap, taken, ...event }) =>
      cap ? { ...event, sold: Math.min(100, Math.floor(taken * 100 / cap)) } : event);
    return json(result, 200, { 'cache-control': 'no-store' });
  } catch (err) {
    console.error('event list failed', err && err.stack || err);
    return json({ error: 'event_storage_unavailable' }, 503);
  }
}

/* ---------- paid flow: hold -> Stripe (PromptPay) -> 5 checks -> mint (context 6.1) ---------- */

async function createCheckoutSession(request, env, ctx) {
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'stripe_unconfigured' }, 503);
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'authentication_required' }, 401);
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'invalid_json' }, 400); }
  const quantity = Number(body?.quantity);
  let zone;
  try {
    zone = body?.eventId && typeof body?.zone === 'string' ? await env.DB.prepare(
      `SELECT e.id AS event_id, e.name, e.venue, z.zone_name, z.price
       FROM events e JOIN event_zones z ON z.event_id = e.id
       WHERE e.id = ? AND z.zone_name = ? AND e.status = 'on_sale'`,
    ).bind(body.eventId, body.zone).first() : null;
  } catch (err) {
    console.error('event lookup failed', err && err.stack || err);
    return json({ error: 'event_storage_unavailable' }, 503);
  }
  if (!zone || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_EVENT) {
    return json({ error: 'invalid_ticket' }, 400);
  }
  const held = await env.DB.prepare(
    `SELECT COALESCE(SUM(quantity), 0) AS n FROM payment_orders
     WHERE user_id = ? AND event_id = ? AND status IN ('pending', 'paid', 'fulfilled', 'needs_review')`,
  ).bind(user.id, zone.event_id).first();
  if (held.n + quantity > MAX_TICKETS_PER_EVENT) return json({ error: 'ticket_limit' }, 409);

  // Seat hold: the order is created only if the zone still has enough seats that are neither
  // sold (remaining) nor held by another pending order. One statement, so two buyers cannot
  // both take the last seat. remaining itself drops only when the payment is verified (0004).
  const unitAmount = Math.round(zone.price * (1 + SERVICE_FEE) * 100); // satang, fee included
  const orderId = crypto.randomUUID();
  const now = Date.now();
  const insert = await env.DB.prepare(
    `INSERT INTO payment_orders (id, user_id, event_id, zone, quantity, unit_amount, amount, status, expires_at)
     SELECT ?, ?, z.event_id, z.zone_name, ?, ?, ?, 'pending', ?
     FROM event_zones z WHERE z.event_id = ? AND z.zone_name = ? AND ${AVAILABLE_SEATS} >= ?`,
  ).bind(orderId, user.id, quantity, unitAmount, unitAmount * quantity, now + HOLD_MS,
    zone.event_id, zone.zone_name, quantity).run();
  if (!insert.meta.changes) return json({ error: 'sold_out' }, 409);

  const origin = new URL(request.url).origin;
  const params = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price_data][currency]': 'thb',
    'line_items[0][price_data][product_data][name]': `${zone.name} · ${zone.zone_name}`,
    'line_items[0][price_data][product_data][description]': zone.venue,
    'line_items[0][price_data][unit_amount]': String(unitAmount),
    'line_items[0][quantity]': String(quantity),
    // Stripe accepts 30 minutes at the earliest. Our own 10-minute hold is enforced by
    // expireHolds(), which expires this session when the hold runs out.
    expires_at: String(Math.floor(now / 1000) + 1800),
    success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?checkout=cancelled&order=${orderId}`,
    client_reference_id: orderId,
    'metadata[order_id]': orderId,
    'metadata[event_id]': zone.event_id,
    'metadata[zone]': zone.zone_name,
    'metadata[quantity]': String(quantity),
    'payment_intent_data[metadata][order_id]': orderId,
  });
  if (user.email) params.set('customer_email', user.email);
  let session = null;
  try {
    const response = await stripeRequest(env.STRIPE_SECRET_KEY, '/v1/checkout/sessions', params, orderId);
    if (response.ok) session = await response.json();
    else console.error('stripe checkout session failed', response.status, await response.text());
  } catch (err) {
    console.error('stripe checkout session failed', err && err.stack || err);
  }
  if (!session?.id) {
    await releaseOrder(env.DB, orderId, 'expired');
    return json({ error: 'stripe_request_failed' }, 502);
  }
  await env.DB.prepare('UPDATE payment_orders SET stripe_session_id = ?, updated_at = ? WHERE id = ?')
    .bind(session.id, Date.now(), orderId).run();
  ctx.waitUntil(expireHolds(env, ctx).catch(err => console.error('hold sweep failed', err && err.stack || err)));
  return json({ url: session.url, orderId, expiresAt: now + HOLD_MS }, 200, { 'cache-control': 'no-store' });
}

async function checkoutStatus(request, env, ctx) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'authentication_required' }, 401);
  const sessionId = new URL(request.url).searchParams.get('session_id');
  if (!sessionId || !sessionId.startsWith('cs_')) return json({ error: 'invalid_session_id' }, 400);
  const order = await env.DB.prepare(
    `SELECT id, event_id, zone, quantity, status, expires_at, mint_tx_id
     FROM payment_orders WHERE stripe_session_id = ? AND user_id = ?`,
  ).bind(sessionId, user.id).first();
  if (!order) {
    const resale = await resaleCheckoutStatus(env, ctx, user, sessionId, resaleDeps);
    return resale ? json(resale, 200, { 'cache-control': 'no-store' }) : json({ error: 'order_not_found' }, 404);
  }
  // Keep the flow moving even when the cron trigger is not set up.
  if (order.status === 'paid') ctx.waitUntil(advanceOrder(env, order).catch(err => console.error('advance failed', err)));
  return json({
    status: order.status,
    orderId: order.id,
    eventId: order.event_id,
    zone: order.zone,
    quantity: order.quantity,
    expiresAt: order.expires_at,
    tickets: await ticketRows(env.DB, user.id, order.id),
  }, 200, { 'cache-control': 'no-store' });
}

// Back from Stripe without paying: give the seats back now instead of waiting for the hold.
async function cancelCheckout(request, env, ctx) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'authentication_required' }, 401);
  const body = await request.json().catch(() => ({}));
  const order = await env.DB.prepare(
    `SELECT id, stripe_session_id FROM payment_orders WHERE id = ? AND user_id = ? AND status = 'pending'`,
  ).bind(String(body?.orderId || ''), user.id).first();
  if (!order) return json({ ok: true, released: await cancelResaleCheckout(env, ctx, user, String(body?.orderId || ''), resaleDeps) });
  return json({ ok: true, released: await expireOrder(env, order, ctx) });
}

async function myTickets(request, env, ctx) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'authentication_required' }, 401);
  const tickets = await ticketRows(env.DB, user.id);
  if (tickets.some(t => t.status === 'minting')) {
    ctx.waitUntil(advancePaidOrders(env, user.id).catch(err => console.error('advance failed', err)));
  }
  return json({ tickets }, 200, { 'cache-control': 'no-store' });
}

async function ticketRows(db, userId, orderId = null) {
  const rows = await db.prepare(
    `SELECT id, order_id, event_id, zone, face_price, owner_wallet, token_id, status, transfers,
            mint_tx_hash, created_at, minted_at
     FROM tickets WHERE user_id = ? AND (? IS NULL OR order_id = ?) ORDER BY created_at DESC, id`,
  ).bind(userId, orderId, orderId).all();
  return (rows.results || []).map(t => ({
    id: t.id, orderId: t.order_id, eventId: t.event_id, zone: t.zone, price: t.face_price,
    wallet: t.owner_wallet, tokenId: t.token_id, status: t.status, transfers: t.transfers,
    txHash: t.mint_tx_hash, explorer: t.mint_tx_hash ? `${FUJI_EXPLORER}/tx/${t.mint_tx_hash}` : null,
    createdAt: t.created_at, mintedAt: t.minted_at,
  }));
}

async function stripeWebhook(request, env, ctx) {
  if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: 'stripe_webhook_unconfigured' }, 503);
  const signature = request.headers.get('stripe-signature');
  const payload = await request.text();
  // Check 1: the webhook really comes from Stripe.
  if (!signature || !(await verifyStripeSignature(payload, signature, env.STRIPE_WEBHOOK_SECRET))) {
    return json({ error: 'invalid_signature' }, 400);
  }
  const event = JSON.parse(payload);
  const session = String(event.type || '').startsWith('checkout.session.') ? event.data?.object : null;
  if (!session?.id) return json({ received: true });

  // Check 5 (first layer): each Stripe event is handled once. On an error the claim is undone
  // so Stripe's retry gets a second chance.
  const claim = await env.DB.prepare(
    `INSERT INTO webhook_events (id, provider, type) VALUES (?, 'stripe', ?) ON CONFLICT DO NOTHING`,
  ).bind(event.id, event.type).run();
  if (!claim.meta.changes) return json({ received: true, duplicate: true });
  // Resale orders live in their own table (src/resale.js); the metadata only picks the table,
  // every check still runs on the session fetched again from Stripe.
  const resale = session.metadata?.kind === 'resale';
  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      if (resale) await confirmResalePayment(env, ctx, session.id, resaleDeps);
      else await confirmPayment(env, ctx, session.id);
    } else if (event.type === 'checkout.session.async_payment_failed') {
      await (resale ? releaseResaleBySession : releaseOrderBySession)(env.DB, session.id, 'failed');
    } else if (event.type === 'checkout.session.expired') {
      await (resale ? releaseResaleBySession : releaseOrderBySession)(env.DB, session.id, 'expired');
    }
  } catch (err) {
    console.error('stripe webhook failed', event.id, err && err.stack || err);
    await env.DB.prepare('DELETE FROM webhook_events WHERE id = ?').bind(event.id).run();
    return json({ error: 'processing_failed' }, 500);
  }
  return json({ received: true });
}

// Runs checks 2 to 5 and, when all pass, hands the order to the minter. Never trusts the
// webhook body: the session is fetched again from Stripe.
async function confirmPayment(env, ctx, sessionId) {
  const session = await stripeGetSession(env.STRIPE_SECRET_KEY, sessionId); // check 2
  const order = await env.DB.prepare('SELECT * FROM payment_orders WHERE stripe_session_id = ?').bind(sessionId).first();
  if (!order) {
    console.error('payment for unknown session', sessionId);
    return 'unknown_order';
  }
  if (session.payment_status !== 'paid') return 'not_paid'; // async methods report later
  if (['paid', 'fulfilled', 'needs_review'].includes(order.status)) return 'already_handled';

  const problems = [];
  // Check 3: amount and currency match the order.
  if (session.currency !== order.currency || session.amount_total !== order.amount) {
    problems.push(`amount ${session.amount_total} ${session.currency} != ${order.amount} ${order.currency}`);
  }
  // Check 4: reference matches and the order is still held.
  if (session.client_reference_id !== order.id || session.metadata?.order_id !== order.id) {
    problems.push('reference mismatch');
  }
  if (order.status !== 'pending') problems.push(`paid after the hold ended (${order.status})`);
  // An organizer cancelled the event (0006) while this guest was at Stripe: refund, do not mint.
  // (Before 0006 is applied the column is missing and nothing can be cancelled, so that reads as null.)
  const event = await env.DB.prepare('SELECT cancelled_at FROM events WHERE id = ?').bind(order.event_id).first()
    .catch(err => { if (/no such column/.test(String(err?.message || err))) return null; throw err; });
  if (event?.cancelled_at) problems.push('event cancelled before the payment arrived');
  if (problems.length) {
    await env.DB.prepare(
      `UPDATE payment_orders SET status = 'needs_review', review_reason = ?, stripe_payment_intent = ?,
              paid_at = ?, updated_at = ?
       WHERE id = ? AND status IN ('pending', 'expired', 'failed')`,
    ).bind(problems.join('; '), session.payment_intent || null, Date.now(), Date.now(), order.id).run();
    console.error('payment needs review', order.id, problems);
    return 'needs_review';
  }
  // Check 5: only one caller can move the order from pending to paid (and take the seats from
  // remaining, 0004), so it is minted once.
  const result = await confirmPaymentAndDecrementInventory(env.DB, session);
  if (result === 'already_paid') return 'already_handled';
  if (result !== 'paid') {
    await env.DB.prepare(
      `UPDATE payment_orders SET status = 'needs_review', review_reason = ?, stripe_payment_intent = ?,
              paid_at = ?, updated_at = ?
       WHERE id = ? AND status = 'pending'`,
    ).bind('paid but the zone has no seats left', session.payment_intent || null, Date.now(), Date.now(), order.id).run();
    console.error('ticket inventory unavailable', session.id);
    return 'needs_review';
  }
  ctx.waitUntil(mintOrder(env, order.id).catch(err => console.error('mint failed', order.id, err && err.stack || err)));
  return 'paid';
}

async function stripeGetSession(secret, sessionId) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
        headers: { authorization: 'Bearer ' + secret, 'stripe-version': STRIPE_VERSION },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return await res.json();
      lastError = new Error(`stripe session ${res.status}: ${(await res.text()).slice(0, 300)}`);
      if (res.status < 500 && res.status !== 429) break;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

// Verified payment: pending -> paid and remaining -= quantity in one batch (Pitichod, 0004).
// The token ties the inventory update to the one caller that changed the order, so a repeated
// webhook never decrements twice.
async function confirmPaymentAndDecrementInventory(db, session) {
  const paidAt = Date.now();
  const inventoryToken = crypto.randomUUID();
  const result = await db.batch([
    db.prepare(
      `UPDATE payment_orders
       SET status = 'paid', stripe_payment_intent = ?, paid_at = ?, updated_at = ?, inventory_update_token = ?
       WHERE stripe_session_id = ? AND status = 'pending'
         AND EXISTS (
           SELECT 1 FROM event_zones z
           WHERE z.event_id = payment_orders.event_id
             AND z.zone_name = payment_orders.zone
             AND z.remaining >= payment_orders.quantity
         )`,
    ).bind(session.payment_intent || null, paidAt, paidAt, inventoryToken, session.id),
    db.prepare(
      `UPDATE event_zones
       SET remaining = remaining - (
         SELECT quantity FROM payment_orders
         WHERE stripe_session_id = ? AND inventory_update_token = ?
       )
       WHERE event_id = (
         SELECT event_id FROM payment_orders
         WHERE stripe_session_id = ? AND inventory_update_token = ?
       )
       AND zone_name = (
         SELECT zone FROM payment_orders
         WHERE stripe_session_id = ? AND inventory_update_token = ?
       )
       AND remaining >= (
         SELECT quantity FROM payment_orders
         WHERE stripe_session_id = ? AND inventory_update_token = ?
       )`,
    ).bind(session.id, inventoryToken, session.id, inventoryToken,
      session.id, inventoryToken, session.id, inventoryToken),
    db.prepare(
      `UPDATE payment_orders SET inventory_update_token = NULL
       WHERE stripe_session_id = ? AND inventory_update_token = ?`,
    ).bind(session.id, inventoryToken),
  ]);
  if (!result[0]?.meta?.changes) {
    const existing = await db.prepare(
      'SELECT status FROM payment_orders WHERE stripe_session_id = ?',
    ).bind(session.id).first();
    return existing?.status === 'paid' || existing?.status === 'fulfilled' ? 'already_paid' : 'inventory_unavailable';
  }
  return 'paid';
}

/* ---------- seat hold ---------- */

// Closes a pending order, once. Its held seats free up by themselves: a hold is only a pending
// order, and remaining was never reduced for it.
async function releaseOrder(db, orderId, status) {
  const close = await db.prepare(`UPDATE payment_orders SET status = ?, updated_at = ? WHERE id = ? AND status = 'pending'`)
    .bind(status, Date.now(), orderId).run();
  return Boolean(close.meta.changes);
}

async function releaseOrderBySession(db, sessionId, status) {
  const order = await db.prepare('SELECT id FROM payment_orders WHERE stripe_session_id = ?').bind(sessionId).first();
  return order ? releaseOrder(db, order.id, status) : false;
}

// Expires the Stripe session first, so the customer can no longer pay, then frees the hold.
// If Stripe says the session already completed, the payment is confirmed instead.
async function expireOrder(env, order, ctx) {
  if (!order.stripe_session_id) return releaseOrder(env.DB, order.id, 'expired');
  const res = await stripeRequest(env.STRIPE_SECRET_KEY,
    `/v1/checkout/sessions/${encodeURIComponent(order.stripe_session_id)}/expire`, new URLSearchParams());
  if (res.ok) return releaseOrder(env.DB, order.id, 'expired');
  const session = await stripeGetSession(env.STRIPE_SECRET_KEY, order.stripe_session_id);
  if (session.status === 'expired') return releaseOrder(env.DB, order.id, 'expired');
  if (session.status === 'complete') {
    await confirmPayment(env, ctx, order.stripe_session_id);
  }
  return false;
}

async function expireHolds(env, ctx) {
  if (!env.STRIPE_SECRET_KEY) return;
  // Orders still being created (no session id yet) get a minute of grace.
  const rows = await env.DB.prepare(
    `SELECT id, stripe_session_id FROM payment_orders
     WHERE status = 'pending' AND expires_at < ? AND (stripe_session_id IS NOT NULL OR expires_at < ?)
     ORDER BY expires_at LIMIT 25`,
  ).bind(Date.now(), Date.now() - 60000).all();
  for (const order of rows.results || []) {
    try { await expireOrder(env, order, ctx); } catch (err) { console.error('expire failed', order.id, err && err.stack || err); }
  }
}

/* ---------- mint after a verified payment ---------- */

// Sends one batched write that mints every ticket of the order to the buyer's wallet.
// The 'sending' claim makes sure two workers never send the same order.
async function mintOrder(env, orderId) {
  if (!env.THIRDWEB_SECRET_KEY) return; // retried by the cron once the secret is set
  const claim = await env.DB.prepare(
    `UPDATE payment_orders SET mint_tx_id = 'sending', mint_attempts = mint_attempts + 1, updated_at = ?
     WHERE id = ? AND status = 'paid' AND mint_tx_id IS NULL AND mint_attempts < ?`,
  ).bind(Date.now(), orderId, MAX_MINT_ATTEMPTS).run();
  if (!claim.meta.changes) {
    await env.DB.prepare(
      `UPDATE payment_orders SET status = 'needs_review', review_reason = 'mint could not be sent: ' || COALESCE(mint_error, '?'),
              updated_at = ?
       WHERE id = ? AND status = 'paid' AND mint_tx_id IS NULL AND mint_attempts >= ?`,
    ).bind(Date.now(), orderId, MAX_MINT_ATTEMPTS).run();
    return;
  }
  const order = await env.DB.prepare(
    `SELECT o.*, e.chain_event_id, z.price AS face_price FROM payment_orders o
     JOIN events e ON e.id = o.event_id
     JOIN event_zones z ON z.event_id = o.event_id AND z.zone_name = o.zone
     WHERE o.id = ?`,
  ).bind(orderId).first();
  const unclaim = error => env.DB.prepare(
    `UPDATE payment_orders SET mint_tx_id = NULL, mint_error = ?, updated_at = ? WHERE id = ? AND mint_tx_id = 'sending'`,
  ).bind(String(error).slice(0, 500), Date.now(), orderId).run();

  const wallet = await ensureWallet(env, order.user_id, null);
  if (!wallet || order.chain_event_id == null) {
    await unclaim(!wallet ? 'no_wallet' : 'event_has_no_chain_id');
    return;
  }
  const existing = await env.DB.prepare('SELECT COUNT(*) AS n FROM tickets WHERE order_id = ?').bind(orderId).first();
  const inserts = [];
  for (let i = existing.n; i < order.quantity; i++) {
    inserts.push(env.DB.prepare(
      `INSERT INTO tickets (id, order_id, user_id, event_id, zone, face_price, owner_wallet, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'minting')`,
    ).bind(crypto.randomUUID(), orderId, order.user_id, order.event_id, order.zone, order.face_price, wallet));
  }
  if (inserts.length) await env.DB.batch(inserts);

  let transactionIds;
  try {
    const calls = Array.from({ length: order.quantity }, (_, i) => mintCall(env, wallet, order.chain_event_id, `${orderId}:${i}`));
    transactionIds = await writeTicketContract(env.THIRDWEB_SECRET_KEY, calls);
  } catch (err) {
    // A timeout may still have queued the write; retrying could mint twice, so a person checks.
    if (err && err.name === 'TimeoutError') {
      await markNeedsReview(env.DB, orderId, 'mint request timed out; check the relayer before retrying');
    } else {
      await unclaim(err && err.message || err);
    }
    return;
  }
  await env.DB.prepare('UPDATE payment_orders SET mint_tx_id = ?, mint_error = NULL, updated_at = ? WHERE id = ?')
    .bind(transactionIds.join(','), Date.now(), orderId).run();
  await settleMint(env, orderId, 10);
}

// Checks the queued mint. Confirmed: reads the token ids from the receipt and fulfils the order.
// Not confirmed after a few minutes, or failed: looks for the mint on chain first, since thirdweb
// can lose track of a write that landed and minting again would give the buyer two tickets.
// Failed and not on chain: frees the order for another attempt, or sends it to review after the
// last one. Still pending and not on chain after 30 minutes: review, never a second send.
async function settleMint(env, orderId, polls = 1) {
  const order = await env.DB.prepare(
    `SELECT o.id, o.user_id, o.event_id, o.zone, o.mint_tx_id, o.mint_attempts, o.quantity, o.paid_at, o.updated_at,
            e.chain_event_id
     FROM payment_orders o JOIN events e ON e.id = o.event_id WHERE o.id = ? AND o.status = 'paid'`,
  ).bind(orderId).first();
  if (!order?.mint_tx_id || order.mint_tx_id === 'sending') return;
  const results = [];
  for (const id of order.mint_tx_id.split(',')) {
    // A thirdweb outage (timeouts included) must not stop the chain check below.
    results.push(await waitForTransaction(env.THIRDWEB_SECRET_KEY, id, polls)
      .catch(err => ({ status: 'UNKNOWN', hash: null, error: String(err && err.message || err) })));
  }
  const failed = results.find(r => r.status === 'FAILED');
  const confirmed = !failed && results.every(r => r.status === 'CONFIRMED' && r.hash);
  // updated_at is when mint_tx_id was recorded; nothing else touches a paid order until it settles.
  const age = Date.now() - order.updated_at;
  if (!confirmed && !failed && age < MINT_CHAIN_CHECK_AFTER_MS) return; // still on its way

  await restoreTicketRows(env, order);
  const tickets = (await env.DB.prepare(
    `SELECT id, owner_wallet FROM tickets WHERE order_id = ? AND status = 'minting' ORDER BY id`,
  ).bind(orderId).all()).results || [];
  let tokens = [];
  if (confirmed) {
    for (const r of results) {
      for (const tokenId of await mintedTokenIds(env, r.hash, tickets[0]?.owner_wallet)) tokens.push({ tokenId, hash: r.hash });
    }
    if (tokens.length < tickets.length) {
      console.error('mint receipt has fewer tokens than tickets', orderId, tokens.length, tickets.length);
      return; // retried on the next pass; RPC may lag behind thirdweb
    }
  } else {
    if (!tickets.length) return;
    try {
      tokens = await unclaimedMintsOnChain(env, tickets[0].owner_wallet, order.chain_event_id, order.paid_at);
    } catch (err) {
      // Kept on the order so a stuck mint shows why in D1; retried on the next pass.
      await env.DB.prepare('UPDATE payment_orders SET mint_error = ? WHERE id = ? AND status = \'paid\'')
        .bind(('chain check: ' + (err && err.message || err)).slice(0, 500), orderId).run();
      return;
    }
    if (tokens.length >= tickets.length) {
      console.error('mint found on chain while thirdweb says', results.map(r => r.status).join(','), orderId);
    } else if (failed) {
      const last = order.mint_attempts >= MAX_MINT_ATTEMPTS;
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE payment_orders SET mint_tx_id = NULL, mint_error = ?, status = ?, review_reason = ?, updated_at = ?
           WHERE id = ? AND mint_tx_id = ?`,
        ).bind(String(failed.error || 'mint failed').slice(0, 500), last ? 'needs_review' : 'paid',
          last ? 'mint failed ' + MAX_MINT_ATTEMPTS + ' times' : null, Date.now(), orderId, order.mint_tx_id),
        ...(last ? [env.DB.prepare(`UPDATE tickets SET status = 'mint_failed' WHERE order_id = ? AND status = 'minting'`).bind(orderId)] : []),
      ]);
      return;
    } else {
      if (age >= MINT_REVIEW_AFTER_MS) {
        await markNeedsReview(env.DB, orderId,
          `mint not confirmed by thirdweb after 30 min (${results.map(r => r.status).join(',')}) and not found on chain; check the relayer before retrying`);
      }
      return;
    }
  }

  const now = Date.now();
  await env.DB.batch([
    ...tickets.map((t, i) => env.DB.prepare(
      `UPDATE tickets SET status = 'active', token_id = ?, mint_tx_hash = ?, minted_at = ? WHERE id = ?`,
    ).bind(tokens[i].tokenId, tokens[i].hash, now, t.id)),
    env.DB.prepare(
      `UPDATE payment_orders SET status = 'fulfilled', mint_tx_hash = ?, fulfilled_at = ?, updated_at = ? WHERE id = ?`,
    ).bind(tokens[0]?.hash || results[0].hash, now, now, orderId),
  ]);
}

// A paid order whose ticket rows are gone (deleted by hand, or never inserted) would wait
// forever, so the missing 'minting' rows are put back the way mintOrder makes them.
async function restoreTicketRows(env, order) {
  const existing = await env.DB.prepare('SELECT COUNT(*) AS n FROM tickets WHERE order_id = ?').bind(order.id).first();
  if (existing.n >= order.quantity) return;
  const row = await env.DB.prepare(
    `SELECT w.address, z.price AS face_price FROM wallets w
     JOIN event_zones z ON z.event_id = ? AND z.zone_name = ?
     WHERE w.user_id = ? AND w.kind = 'inapp' AND w.removed_at IS NULL LIMIT 1`,
  ).bind(order.event_id, order.zone, order.user_id).first();
  if (!row) return;
  console.error('restoring missing ticket rows', order.id, existing.n, order.quantity);
  await env.DB.batch(Array.from({ length: order.quantity - existing.n }, () => env.DB.prepare(
    `INSERT INTO tickets (id, order_id, user_id, event_id, zone, face_price, owner_wallet, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'minting')`,
  ).bind(crypto.randomUUID(), order.id, order.user_id, order.event_id, order.zone, row.face_price, row.address)));
}

// Tickets of this event owned by `wallet` that no ticket row holds yet, oldest first. Read
// token by token (ownerOf / eventOf) from just above the highest token of orders paid before
// this one up to nextTokenId, since the public Fuji RPC caps eth_getLogs at 100 blocks.
async function unclaimedMintsOnChain(env, wallet, chainEventId, paidAt) {
  if (!wallet || chainEventId == null) return [];
  const next = Number(BigInt(await fujiRpc(env, 'eth_call', [{ to: TICKET_CONTRACT, data: SELECTORS.nextTokenId }, 'latest'])));
  const floor = (await env.DB.prepare(
    `SELECT MAX(t.token_id) AS m FROM tickets t JOIN payment_orders o ON o.id = t.order_id WHERE o.paid_at < ?`,
  ).bind(paidAt || 0).first())?.m || 0;
  const taken = new Set(((await env.DB.prepare('SELECT token_id FROM tickets WHERE token_id > ?')
    .bind(floor).all()).results || []).map(r => r.token_id));
  const ids = [];
  for (let id = floor + 1; id < next && ids.length < MINT_SCAN_MAX; id++) if (!taken.has(id)) ids.push(id);
  const found = [];
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    const out = await fujiRpcBatch(env, chunk.flatMap(id => ['ownerOf', 'eventOf'].map(fn =>
      ['eth_call', [{ to: TICKET_CONTRACT, data: callData(fn, id) }, 'latest']])));
    chunk.forEach((id, k) => {
      const [owner, eventOf] = [out[2 * k], out[2 * k + 1]];
      if (owner?.result && eventOf?.result
          && '0x' + String(owner.result).slice(-40).toLowerCase() === String(wallet).toLowerCase()
          && BigInt(eventOf.result) === BigInt(chainEventId)) found.push({ tokenId: id, hash: null });
    });
  }
  return found;
}

// Several JSON-RPC calls in one request; answers come back in call order (an entry may hold an error).
async function fujiRpcBatch(env, calls) {
  const res = await fetch(env.FUJI_RPC_URL || FUJI_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(calls.map(([method, params], id) => ({ jsonrpc: '2.0', id, method, params }))),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`fuji rpc ${res.status}`);
  const body = await res.json();
  if (!Array.isArray(body)) throw new Error('fuji rpc batch: ' + (body?.error?.message || 'bad reply'));
  const byId = Object.fromEntries(body.map(r => [r.id, r]));
  return calls.map((_, id) => byId[id]);
}

async function fujiRpc(env, method, params) {
  const res = await fetch(env.FUJI_RPC_URL || FUJI_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`fuji rpc ${res.status}`);
  const body = await res.json();
  if (body?.error) throw new Error(`fuji rpc ${method}: ${body.error.message || body.error.code}`);
  return body?.result;
}

// Token ids minted to `wallet` by the ticket contract in this transaction (ERC-721 Transfer from 0x0).
async function mintedTokenIds(env, txHash, wallet) {
  return parseMintedTokenIds(await receiptLogs(env, txHash), TICKET_CONTRACT, wallet);
}

async function receiptLogs(env, txHash) {
  const res = await fetch(env.FUJI_RPC_URL || FUJI_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`fuji rpc ${res.status}`);
  return (await res.json())?.result?.logs || [];
}

function parseMintedTokenIds(logs, contract, wallet) {
  const pad = addr => '0x' + String(addr).toLowerCase().replace(/^0x/, '').padStart(64, '0');
  return logs
    .filter(l => String(l.address).toLowerCase() === contract.toLowerCase()
      && l.topics?.length === 4
      && String(l.topics[0]).toLowerCase() === ERC721_TRANSFER_TOPIC
      && BigInt(l.topics[1]) === 0n
      && String(l.topics[2]).toLowerCase() === pad(wallet))
    .map(l => Number(BigInt(l.topics[3])));
}

async function markNeedsReview(db, orderId, reason) {
  await db.prepare(`UPDATE payment_orders SET status = 'needs_review', review_reason = ?, updated_at = ? WHERE id = ?`)
    .bind(reason, Date.now(), orderId).run();
}

// Moves one paid order forward: mint it if nothing was sent, settle it if a write is queued,
// or send it to review if a send was claimed but never recorded.
async function advanceOrder(env, order) {
  if (order.mint_tx_id == null) return mintOrder(env, order.id);
  if (order.mint_tx_id !== 'sending') return settleMint(env, order.id);
  const row = await env.DB.prepare('SELECT updated_at FROM payment_orders WHERE id = ?').bind(order.id).first();
  if (row && Date.now() - row.updated_at > 5 * 60000) {
    await markNeedsReview(env.DB, order.id, 'mint send was interrupted; check the relayer before retrying');
  }
}

async function advancePaidOrders(env, userId = null) {
  const rows = await env.DB.prepare(
    `SELECT id, mint_tx_id FROM payment_orders
     WHERE status = 'paid' AND (? IS NULL OR user_id = ?) AND mint_attempts <= ?
     ORDER BY paid_at LIMIT 10`,
  ).bind(userId, userId, MAX_MINT_ATTEMPTS).all();
  for (const order of rows.results || []) {
    try { await advanceOrder(env, order); } catch (err) { console.error('advance failed', order.id, err && err.stack || err); }
  }
}

// Cron trigger (wrangler.jsonc): releases expired holds, finishes paid orders, and sends
// markUsed for tickets scanned at the door.
async function scheduled(_controller, env, ctx) {
  ctx.waitUntil(Promise.all([
    expireHolds(env, ctx).catch(err => console.error('hold sweep failed', err && err.stack || err)),
    advancePaidOrders(env).catch(err => console.error('mint sweep failed', err && err.stack || err)),
    advanceMarkUsed(env).catch(err => console.error('markUsed sweep failed', err && err.stack || err)),
    resaleSweep(env, ctx, resaleDeps).catch(err => console.error('resale sweep failed', err && err.stack || err)),
  ]));
}

async function stripeRequest(secret, path, body, idempotencyKey) {
  const headers = { authorization: 'Bearer ' + secret, 'content-type': 'application/x-www-form-urlencoded', 'stripe-version': STRIPE_VERSION };
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  return fetch(`https://api.stripe.com${path}`, { method: 'POST', headers, body, signal: AbortSignal.timeout(10000) });
}

async function verifyStripeSignature(payload, header, secret) {
  const fields = Object.fromEntries(header.split(',').map(part => part.split('=')));
  const timestamp = Number(fields.t);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300 || !fields.v1) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`)));
  const expected = [...digest].map(b => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(expected, fields.v1);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function start(request, env) {
  if (!googleEnabled(env)) return redirect('/?login=unconfigured');
  const url = new URL(request.url);
  const state = randomToken(24);
  const nonce = randomToken(24);
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${url.origin}/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account', // always show the account chooser
    state,
    nonce,
  }).toString();
  return redirect(auth.toString(), {
    'set-cookie': cookie(STATE_COOKIE, `${state}.${nonce}`, { maxAge: 600, path: '/auth/google' }),
  });
}

async function callback(request, env) {
  if (!googleEnabled(env)) return redirect('/?login=unconfigured');
  const url = new URL(request.url);
  const clearState = cookie(STATE_COOKIE, '', { maxAge: 0, path: '/auth/google' });
  if (url.searchParams.get('error')) return redirect('/?login=cancelled', { 'set-cookie': clearState });

  const [state, nonce] = (readCookie(request, STATE_COOKIE) || '').split('.');
  const code = url.searchParams.get('code');
  if (!state || !nonce || !code || url.searchParams.get('state') !== state) {
    return redirect('/?login=error', { 'set-cookie': clearState });
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${url.origin}/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) {
    console.error('google token exchange failed', tokenRes.status, await tokenRes.text());
    return redirect('/?login=error', { 'set-cookie': clearState });
  }
  const { id_token: idToken } = await tokenRes.json();
  const claims = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID, nonce);
  if (!claims) return redirect('/?login=error', { 'set-cookie': clearState });

  const meta = {
    userAgent: request.headers.get('user-agent'),
    ip: request.headers.get('cf-connecting-ip'),
  };
  const { userId, identityId, isNew } = await upsertGoogleUser(env.DB, claims, meta.ip);
  // Every login (not only sign-up) checks for a wallet, so a failed attempt heals next time.
  await ensureWallet(env, userId, meta.ip);
  const token = await createSession(env.DB, userId, identityId, meta);

  const headers = new Headers({ location: `/?login=${isNew ? 'new' : 'ok'}` });
  headers.append('set-cookie', clearState);
  headers.append('set-cookie', cookie(SESSION_COOKIE, token, { maxAge: SESSION_DAYS * 86400 }));
  return new Response(null, { status: 302, headers });
}

async function logout(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token && env.DB) {
    await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
      .bind(Date.now(), await sha256Hex(token)).run();
  }
  return json({ ok: true }, 200, { 'set-cookie': cookie(SESSION_COOKIE, '', { maxAge: 0 }) });
}

/* ---------- Google ID token ---------- */

let jwksCache = { keys: null, until: 0 };

async function googleKeys() {
  if (jwksCache.keys && Date.now() < jwksCache.until) return jwksCache.keys;
  const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!res.ok) throw new Error(`google certs ${res.status}`);
  const maxAge = Number((res.headers.get('cache-control') || '').match(/max-age=(\d+)/)?.[1] || 3600);
  jwksCache = { keys: (await res.json()).keys, until: Date.now() + maxAge * 1000 };
  return jwksCache.keys;
}

async function verifyGoogleIdToken(idToken, clientId, nonce) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) return null;
  const header = JSON.parse(b64urlDecodeText(parts[0]));
  const claims = JSON.parse(b64urlDecodeText(parts[1]));
  if (header.alg !== 'RS256') return null;

  const jwk = (await googleKeys()).find(k => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecode(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) return null;

  const now = Math.floor(Date.now() / 1000);
  if (!GOOGLE_ISSUERS.includes(claims.iss)) return null;
  if (claims.aud !== clientId) return null;
  if (!(claims.exp > now - 60)) return null;
  if (claims.nonce !== nonce) return null;
  if (!claims.sub) return null;
  return claims;
}

/* ---------- D1 ---------- */

async function upsertGoogleUser(db, claims, ip) {
  const now = Date.now();
  const email = claims.email && claims.email_verified ? String(claims.email).toLowerCase() : null;
  const name = claims.name || (email ? email.split('@')[0] : null);
  const picture = claims.picture || null;

  const identity = await db.prepare(
    `SELECT i.id, i.user_id FROM auth_identities i JOIN users u ON u.id = i.user_id
     WHERE i.provider = 'google' AND i.provider_subject = ? AND u.deleted_at IS NULL`,
  ).bind(claims.sub).first();

  if (identity) {
    await db.batch([
      db.prepare('UPDATE auth_identities SET last_used_at = ? WHERE id = ?').bind(now, identity.id),
      db.prepare(`UPDATE users SET last_login_at = ?, display_name = COALESCE(display_name, ?),
                  avatar_url = COALESCE(?, avatar_url) WHERE id = ?`).bind(now, name, picture, identity.user_id),
      logEvent(db, identity.user_id, 'login', { provider: 'google' }, ip),
    ]);
    return { userId: identity.user_id, identityId: identity.id, isNew: false };
  }

  // Same verified email already on an account (e.g. signed up by email OTP): link Google to it.
  const existing = email
    ? await db.prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL').bind(email).first()
    : null;
  const userId = existing ? existing.id : crypto.randomUUID();
  const identityId = crypto.randomUUID();
  const stmts = [];
  if (!existing) {
    stmts.push(db.prepare(
      'INSERT INTO users (id, display_name, email, avatar_url, last_login_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(userId, name, email, picture, now));
    stmts.push(logEvent(db, userId, 'signup', { provider: 'google' }, ip));
  } else {
    stmts.push(db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(now, userId));
    stmts.push(logEvent(db, userId, 'identity_linked', { provider: 'google' }, ip));
  }
  stmts.push(db.prepare(
    `INSERT INTO auth_identities (id, user_id, provider, provider_subject, last_used_at)
     VALUES (?, ?, 'google', ?, ?)`,
  ).bind(identityId, userId, claims.sub, now));
  stmts.push(logEvent(db, userId, 'login', { provider: 'google' }, ip));
  await db.batch(stmts);
  return { userId, identityId, isNew: !existing };
}

function logEvent(db, userId, type, metadata, ip) {
  return db.prepare(
    'INSERT INTO account_events (user_id, actor_id, event_type, metadata, ip_address) VALUES (?, ?, ?, ?, ?)',
  ).bind(userId, userId, type, JSON.stringify(metadata), ip || null);
}

/* ---------- ticket wallet (thirdweb server wallet) ---------- */

// Gives the user a platform-created wallet if they have none yet. Never throws: a thirdweb
// outage must not block login, and the next login retries.
async function ensureWallet(env, userId, ip) {
  if (!env.THIRDWEB_SECRET_KEY) return null;
  try {
    const existing = await env.DB.prepare(
      `SELECT address FROM wallets WHERE user_id = ? AND kind = 'inapp' AND removed_at IS NULL LIMIT 1`,
    ).bind(userId).first();
    if (existing) return existing.address;

    const address = await createThirdwebWallet(env.THIRDWEB_SECRET_KEY, walletIdentifier(userId));
    // thirdweb returns the same wallet for the same identifier, and UNIQUE (address, chain_id)
    // plus the one-primary index make the insert a no-op on a retry or a parallel login.
    const res = await env.DB.prepare(
      `INSERT INTO wallets (id, user_id, address, kind, chain_id, is_primary, label)
       SELECT ?, ?, ?, 'inapp', ?,
              NOT EXISTS (SELECT 1 FROM wallets WHERE user_id = ? AND is_primary = 1 AND removed_at IS NULL),
              'กระเป๋าตั๋ว'
       WHERE true -- needed by SQLite's parser for INSERT ... SELECT ... ON CONFLICT
       ON CONFLICT DO NOTHING`,
    ).bind(crypto.randomUUID(), userId, address, WALLET_CHAIN_ID, userId).run();
    if (res.meta && res.meta.changes) {
      await logEvent(env.DB, userId, 'wallet_created', { provider: 'thirdweb', address, chainId: WALLET_CHAIN_ID }, ip).run();
    }
    return address;
  } catch (err) {
    console.error('wallet creation failed', userId, err && err.stack || err);
    return null;
  }
}

// Stable per user and never reused, so thirdweb always maps one account to one wallet.
const walletIdentifier = userId => `jongloei-user-${userId}`;

async function createThirdwebWallet(secretKey, identifier) {
  const res = await fetch(`${THIRDWEB_API}/v1/wallets/server`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-secret-key': secretKey },
    body: JSON.stringify({ identifier }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`thirdweb ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  const address = String(body?.result?.address || '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) throw new Error('thirdweb returned no wallet address');
  return address;
}

/* ---------- ticket contract (via the thirdweb relayer) ---------- */

// Proves the mint path end to end before the paid flow exists: an admin mints one ticket into
// their own wallet. The real mint will run only after a payment is verified (context 6.1).
async function testMint(request, env) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'not_signed_in' }, 401);
  if (user.role !== 'admin') return json({ error: 'forbidden' }, 403);
  if (!env.THIRDWEB_SECRET_KEY) return json({ error: 'thirdweb_not_configured' }, 503);
  if (!user.wallet) return json({ error: 'no_wallet' }, 409);

  const body = await request.json().catch(() => ({}));
  const eventId = Number.isSafeInteger(body.eventId) && body.eventId >= 0 ? body.eventId : 0;
  const [transactionId] = await writeTicketContract(env.THIRDWEB_SECRET_KEY, [
    mintCall(env, user.wallet, eventId, `test-mint:${crypto.randomUUID()}`),
  ]);
  const tx = await waitForTransaction(env.THIRDWEB_SECRET_KEY, transactionId);
  await logEvent(env.DB, user.id, 'test_mint', { transactionId, status: tx.status, hash: tx.hash, eventId }, request.headers.get('cf-connecting-ip')).run();
  return json({
    transactionId, status: tx.status, transactionHash: tx.hash, error: tx.error,
    to: user.wallet, eventId,
    explorer: tx.hash ? `${FUJI_EXPLORER}/tx/${tx.hash}` : null,
    wallet: `${FUJI_EXPLORER}/address/${user.wallet}`,
  }, tx.status === 'FAILED' ? 502 : 200);
}

// One ticket mint. With MINT_GUARD_ADDRESS set (contracts/src/JongloeiMintGuard.sol) it goes
// through the guard, which mints each ticket key at most once, so a re-sent write reverts on
// chain instead of issuing a second ticket. Keys are "<order id>:<index>", the same on every
// attempt. Without it, the relayer mints on the ticket contract directly (before the rollout).
function mintCall(env, to, eventId, ticketKey) {
  if (!env.MINT_GUARD_ADDRESS) {
    return {
      contractAddress: TICKET_CONTRACT,
      method: 'function mint(address to, uint256 eventId) returns (uint256)',
      params: [to, String(eventId)],
    };
  }
  return {
    contractAddress: env.MINT_GUARD_ADDRESS,
    method: 'function mintOnce(address to, uint256 eventId, bytes32 ticketKey) returns (uint256)',
    params: [to, String(eventId), toHex(keccak256(ticketKey))],
  };
}

// Queues contract calls from the relayer as one batch; thirdweb signs, pays gas and returns
// the transaction ids.
async function writeTicketContract(secretKey, calls) {
  const res = await fetch(`${THIRDWEB_API}/v1/contracts/write`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-secret-key': secretKey },
    body: JSON.stringify({
      chainId: WALLET_CHAIN_ID,
      from: RELAYER_ADDRESS,
      calls,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`thirdweb write ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const ids = (await res.json())?.result?.transactionIds;
  if (!ids?.length) throw new Error('thirdweb returned no transaction id');
  return ids;
}

// Polls the queued transaction (2 s apart, ~20 s by default); returns whatever state it reached.
async function waitForTransaction(secretKey, transactionId, polls = 10) {
  let last = { status: 'QUEUED', hash: null, error: null };
  for (let i = 0; i < polls; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const res = await fetch(`${THIRDWEB_API}/v1/transactions/${encodeURIComponent(transactionId)}`, {
      headers: { 'x-secret-key': secretKey },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) continue;
    const tx = (await res.json())?.result || {};
    last = { status: tx.status || last.status, hash: tx.transactionHash || null, error: tx.errorMessage || null };
    if (last.status === 'CONFIRMED' || last.status === 'FAILED') break;
  }
  return last;
}

async function createSession(db, userId, identityId, { userAgent, ip }) {
  const token = randomToken(32);
  const now = Date.now();
  await db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, identity_id, user_agent, ip_address, last_seen_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), userId, await sha256Hex(token), identityId,
    userAgent ? userAgent.slice(0, 300) : null, ip || null, now, now + SESSION_DAYS * 86400000).run();
  return token;
}

async function currentUser(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.display_name, u.email, u.avatar_url, u.role, s.id AS session_id,
            (SELECT w.address FROM wallets w WHERE w.user_id = u.id AND w.is_primary = 1
               AND w.removed_at IS NULL) AS wallet
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
       AND u.status = 'active' AND u.deleted_at IS NULL`,
  ).bind(await sha256Hex(token), Date.now()).first();
  if (!row) return null;
  await env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').bind(Date.now(), row.session_id).run();
  return {
    id: row.id, name: row.display_name, email: row.email, avatarUrl: row.avatar_url, role: row.role,
    wallet: row.wallet || null,
  };
}

// What src/resale.js uses from this file (function declarations are hoisted).
const resaleDeps = {
  currentUser, json, ensureWallet, stripeRequest, stripeGetSession, writeTicketContract, waitForTransaction,
  receiptLogs, HOLD_MS, TICKET_CONTRACT, ERC721_TRANSFER_TOPIC,
};

/* ---------- helpers ---------- */

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
}

function redirect(location, headers = {}) {
  return new Response(null, { status: 302, headers: { location, ...headers } });
}

function cookie(name, value, { maxAge, path = '/' }) {
  return `${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

function randomToken(bytes) {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function b64urlEncode(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(text) {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}

function b64urlDecodeText(text) {
  return new TextDecoder().decode(b64urlDecode(text));
}
