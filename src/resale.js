// Resale on the platform (context 5.6 and A7), backed by db/migrations/0008_resale.sql.
//
// Routes:
//   GET    /api/resale/listings[?eventId=&mine=1]  market (anyone) or the caller's own listings
//   POST   /api/resale/listings                     { ticketId, price } list an own ticket
//   DELETE /api/resale/listings/:id                 seller takes the listing down
//   POST   /api/resale/checkout                     { listingId } 10-minute hold + Stripe session
//   GET    /api/resale/payouts                      the caller's seller payouts (held / paid out)
// Hooks used by src/worker.js:
//   confirmResalePayment / releaseResaleBySession   Stripe webhook for orders with metadata.kind=resale
//   resaleCheckoutStatus / cancelResaleCheckout     return from Stripe
//   resaleSweep                                     cron: expire holds and listings, finish transfers
//
// Rules (enforced here, not on chain; context 10.2): price <= face x resale_cap_bps, listable only
// resale_delay_s after the holder received the ticket, nothing transfers in the last
// transfer_cutoff_s before the start, unlimited resales, one live listing per ticket. Holders can
// never transfer themselves: after the buyer's payment passes the same 5 checks as a first sale,
// the relayer calls operatorTransfer(tokenId, buyerWallet).
//
// Money: the buyer pays the listing price through Stripe into the platform account. The seller's
// share (price minus 6 % commission) is written to resale_payouts as 'held' until the event is
// over plus 24 h. Nothing here sends money out: there is no seller payout channel yet, so a person
// pays held rows by hand and marks them paid_out. Refunds (event cancelled, needs_review) are by
// hand in Stripe, like first sales.

import { readChain } from './checkin.js';

const ONE_TICKET_LIMIT = 4; // same per-account, per-event limit as first sales
const MAX_TRANSFER_ATTEMPTS = 3;
const DISPUTE_WINDOW_MS = 24 * 3600000;
// Same as the first-sale mint: thirdweb can keep a write pending after it landed, so after a few
// minutes the ticket's owner is read on chain, and after 30 minutes the order goes to review.
const TRANSFER_CHAIN_CHECK_AFTER_MS = 3 * 60000;
const TRANSFER_REVIEW_AFTER_MS = 30 * 60000;
const LISTING_STATUSES_LIVE = `('active', 'sold')`;

/* ---------- rules (pure, tested in tests/worker/resale.test.mjs) ---------- */

export const resaleCap = (facePrice, capBps) => Math.floor(facePrice * capBps / 10000);

// 6 % of the resale price in satang, rounded half up (context 10.2).
export const commissionSatang = (grossSatang, bps) => Math.floor((grossSatang * bps + 5000) / 10000);

export function resaleWindow(ticket, event) {
  const acquiredAt = ticket.acquired_at ?? ticket.minted_at;
  return {
    listableAt: acquiredAt == null ? null : acquiredAt + event.resale_delay_s * 1000,
    closesAt: event.starts_at == null ? null : event.starts_at - event.transfer_cutoff_s * 1000,
  };
}

// Why this ticket cannot be listed at this price now, or null if it can.
export function listingProblem(ticket, event, price, now) {
  if (!ticket) return { error: 'ticket_not_found', status: 404 };
  if (ticket.status !== 'active' || ticket.token_id == null) return { error: 'ticket_not_listable', status: 409 };
  if (!event || event.cancelled_at || event.status === 'closed') return { error: 'event_not_open', status: 409 };
  const { listableAt, closesAt } = resaleWindow(ticket, event);
  if (closesAt == null) return { error: 'event_time_unknown', status: 409 };
  if (now >= closesAt) return { error: 'transfer_closed', status: 409, closesAt };
  if (listableAt == null || now < listableAt) return { error: 'holding_period', status: 409, listableAt };
  const cap = resaleCap(ticket.face_price, event.resale_cap_bps);
  if (!Number.isInteger(price) || price < 1 || price > cap) return { error: 'invalid_price', status: 400, cap };
  return null;
}

// Why a buyer cannot start paying for this listing now, or null. The whole hold must end before
// the cutoff, so a payment that passes the checks is always made before transfers close.
export function checkoutProblem(listing, event, buyerId, now, holdMs) {
  if (!listing || listing.status !== 'active') return { error: 'listing_unavailable', status: 409 };
  if (listing.seller_id === buyerId) return { error: 'own_listing', status: 409 };
  if (!event || event.cancelled_at || event.status === 'closed') return { error: 'event_not_open', status: 409 };
  const closesAt = event.starts_at == null ? null : event.starts_at - event.transfer_cutoff_s * 1000;
  if (closesAt == null || now + holdMs > closesAt) return { error: 'transfer_closed', status: 409 };
  return null;
}

// True if the receipt logs show the ticket contract moving tokenId from -> to.
export function transferLogFound(logs, contract, transferTopic, from, to, tokenId) {
  const pad = addr => '0x' + String(addr).toLowerCase().replace(/^0x/, '').padStart(64, '0');
  return (logs || []).some(l => String(l.address).toLowerCase() === contract.toLowerCase()
    && l.topics?.length === 4
    && String(l.topics[0]).toLowerCase() === transferTopic
    && String(l.topics[1]).toLowerCase() === pad(from)
    && String(l.topics[2]).toLowerCase() === pad(to)
    && BigInt(l.topics[3]) === BigInt(tokenId));
}

const shortAddress = a => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '';

/* ---------- routes ---------- */

export async function handleResale(request, env, ctx, url, deps) {
  const { json } = deps;
  const path = url.pathname;
  if (path === '/api/resale/listings' && request.method === 'GET') return listListings(request, env, url, deps);
  if (path === '/api/resale/listings' && request.method === 'POST') return createListing(request, env, deps);
  const m = path.match(/^\/api\/resale\/listings\/([\w-]{1,64})$/);
  if (m && request.method === 'DELETE') return cancelListing(request, env, m[1], deps);
  if (path === '/api/resale/checkout' && request.method === 'POST') return startCheckout(request, env, ctx, deps);
  if (path === '/api/resale/payouts' && request.method === 'GET') return myPayouts(request, env, deps);
  return json({ error: 'not_found' }, 404);
}

async function readBody(request) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) return { unsupported: true };
  try { return { body: await request.json() }; } catch (_) { return { body: null }; }
}

async function listListings(request, env, url, deps) {
  const user = await deps.currentUser(request, env);
  const mine = url.searchParams.get('mine') === '1';
  if (mine && !user) return deps.json({ error: 'authentication_required' }, 401);
  const eventId = url.searchParams.get('eventId');
  const now = Date.now();
  const rows = await env.DB.prepare(
    `SELECT l.id, l.ticket_id, l.event_id, l.price, l.face_price, l.status, l.seller_id, l.created_at,
            t.zone, t.token_id, t.transfers, t.owner_wallet,
            e.starts_at, e.transfer_cutoff_s, e.resale_cap_bps,
            EXISTS (SELECT 1 FROM resale_orders o WHERE o.listing_id = l.id AND o.status = 'pending') AS held,
            (SELECT o.status FROM resale_orders o WHERE o.listing_id = l.id ORDER BY o.created_at DESC LIMIT 1) AS order_status,
            (SELECT o.review_reason FROM resale_orders o WHERE o.listing_id = l.id ORDER BY o.created_at DESC LIMIT 1) AS order_review_reason
     FROM resale_listings l JOIN tickets t ON t.id = l.ticket_id JOIN events e ON e.id = l.event_id
     WHERE ${mine ? `l.seller_id = ? AND l.status IN ${LISTING_STATUSES_LIVE}`
                  : `l.status = 'active' AND e.cancelled_at IS NULL AND e.status != 'closed'
                     AND e.starts_at - e.transfer_cutoff_s * 1000 > ?`}
       AND (? IS NULL OR l.event_id = ?)
     ORDER BY l.created_at DESC LIMIT 200`,
  ).bind(mine ? user.id : now, eventId, eventId).all();
  const listings = (rows.results || []).map(l => ({
    id: l.id, ticketId: l.ticket_id, eventId: l.event_id, zone: l.zone, tokenId: l.token_id,
    price: l.price, facePrice: l.face_price, cap: resaleCap(l.face_price, l.resale_cap_bps),
    transfers: l.transfers, seller: shortAddress(l.owner_wallet), status: l.status,
    orderStatus: l.order_status || null, orderReviewReason: l.order_review_reason || null,
    held: Boolean(l.held), mine: Boolean(user && l.seller_id === user.id),
    closesAt: l.starts_at == null ? null : l.starts_at - l.transfer_cutoff_s * 1000, createdAt: l.created_at,
  }));
  return deps.json({ listings }, 200, { 'cache-control': 'no-store' });
}

async function createListing(request, env, deps) {
  const user = await deps.currentUser(request, env);
  if (!user) return deps.json({ error: 'authentication_required' }, 401);
  const { body, unsupported } = await readBody(request);
  if (unsupported) return deps.json({ error: 'json_required' }, 415);
  const ticketId = String(body?.ticketId || '');
  const price = Number(body?.price);
  const ticket = ticketId ? await env.DB.prepare(
    'SELECT * FROM tickets WHERE id = ? AND user_id = ?',
  ).bind(ticketId, user.id).first() : null;
  const event = ticket ? await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(ticket.event_id).first() : null;
  const now = Date.now();
  const problem = listingProblem(ticket, event, price, now);
  if (problem) {
    const { status, ...rest } = problem;
    return deps.json(rest, status);
  }
  // The listing is inserted and the ticket locked in one batch, and both statements repeat the
  // ownership and status checks, so a check-in or a second listing that lands meanwhile wins
  // and nothing is written. The unique index allows one live listing per ticket.
  const listingId = 'rl-' + crypto.randomUUID();
  try {
    const [insert] = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO resale_listings (id, ticket_id, seller_id, event_id, price, face_price)
         SELECT ?, t.id, t.user_id, t.event_id, ?, t.face_price FROM tickets t
         WHERE t.id = ? AND t.user_id = ? AND t.status = 'active' AND t.token_id IS NOT NULL`,
      ).bind(listingId, price, ticket.id, user.id),
      env.DB.prepare(
        `UPDATE tickets SET status = 'listed'
         WHERE id = ? AND status = 'active'
           AND EXISTS (SELECT 1 FROM resale_listings WHERE id = ? AND status = 'active')`,
      ).bind(ticket.id, listingId),
    ]);
    if (!insert.meta.changes) return deps.json({ error: 'ticket_not_listable' }, 409);
  } catch (err) {
    if (/UNIQUE/i.test(String(err?.message || err))) return deps.json({ error: 'already_listed' }, 409);
    throw err;
  }
  return deps.json({ listing: { id: listingId, ticketId: ticket.id, price, cap: resaleCap(ticket.face_price, event.resale_cap_bps) } }, 201);
}

async function cancelListing(request, env, listingId, deps) {
  const user = await deps.currentUser(request, env);
  if (!user) return deps.json({ error: 'authentication_required' }, 401);
  const now = Date.now();
  // Only while nobody is paying for it: a pending order is the buyer's 10-minute hold.
  const [close] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE resale_listings SET status = 'cancelled', closed_at = ?, updated_at = ?
       WHERE id = ? AND seller_id = ? AND status = 'active'
         AND NOT EXISTS (SELECT 1 FROM resale_orders o WHERE o.listing_id = resale_listings.id
                         AND o.status IN ('pending', 'paid', 'fulfilled'))`,
    ).bind(now, now, listingId, user.id),
    unlockTicketStmt(env.DB, listingId),
  ]);
  if (!close.meta.changes) {
    const row = await env.DB.prepare('SELECT status, seller_id FROM resale_listings WHERE id = ?').bind(listingId).first();
    if (!row || row.seller_id !== user.id) return deps.json({ error: 'listing_not_found' }, 404);
    return deps.json({ error: row.status === 'active' ? 'listing_on_hold' : 'listing_closed' }, 409);
  }
  return deps.json({ ok: true });
}

// Gives the ticket of this listing back to its holder, unless another live listing still owns it.
function unlockTicketStmt(db, listingId) {
  return db.prepare(
    `UPDATE tickets SET status = 'active'
     WHERE id = (SELECT ticket_id FROM resale_listings WHERE id = ?) AND status = 'listed'
       AND NOT EXISTS (SELECT 1 FROM resale_listings l WHERE l.ticket_id = tickets.id AND l.status IN ${LISTING_STATUSES_LIVE})`,
  ).bind(listingId);
}

async function startCheckout(request, env, ctx, deps) {
  if (!env.STRIPE_SECRET_KEY) return deps.json({ error: 'stripe_unconfigured' }, 503);
  const user = await deps.currentUser(request, env);
  if (!user) return deps.json({ error: 'authentication_required' }, 401);
  const { body, unsupported } = await readBody(request);
  if (unsupported) return deps.json({ error: 'json_required' }, 415);
  const listing = await env.DB.prepare('SELECT * FROM resale_listings WHERE id = ?').bind(String(body?.listingId || '')).first();
  const event = listing ? await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(listing.event_id).first() : null;
  const now = Date.now();
  const problem = checkoutProblem(listing, event, user.id, now, deps.HOLD_MS);
  if (problem) return deps.json({ error: problem.error }, problem.status);

  const owned = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM tickets WHERE user_id = ?1 AND event_id = ?2 AND status IN ('minting', 'active', 'listed'))
          + (SELECT COUNT(*) FROM resale_orders WHERE buyer_id = ?1 AND event_id = ?2 AND status IN ('pending', 'paid')) AS n`,
  ).bind(user.id, listing.event_id).first();
  if (owned.n + 1 > ONE_TICKET_LIMIT) return deps.json({ error: 'ticket_limit' }, 409);
  const wallet = user.wallet || await deps.ensureWallet(env, user.id, null);
  if (!wallet) return deps.json({ error: 'no_wallet' }, 409);

  // The hold: one pending order per listing (unique index), created only while the listing is
  // still active and its ticket still listed under the seller.
  const orderId = crypto.randomUUID();
  const amount = listing.price * 100;
  try {
    const insert = await env.DB.prepare(
      `INSERT INTO resale_orders (id, listing_id, ticket_id, buyer_id, seller_id, event_id, buyer_wallet, amount, status, expires_at)
       SELECT ?, l.id, l.ticket_id, ?, l.seller_id, l.event_id, ?, ?, 'pending', ?
       FROM resale_listings l JOIN tickets t ON t.id = l.ticket_id
       WHERE l.id = ? AND l.status = 'active' AND t.status = 'listed' AND t.user_id = l.seller_id`,
    ).bind(orderId, user.id, wallet, amount, now + deps.HOLD_MS, listing.id).run();
    if (!insert.meta.changes) return deps.json({ error: 'listing_unavailable' }, 409);
  } catch (err) {
    if (/UNIQUE/i.test(String(err?.message || err))) return deps.json({ error: 'listing_held' }, 409);
    throw err;
  }

  const ticket = await env.DB.prepare('SELECT zone, token_id FROM tickets WHERE id = ?').bind(listing.ticket_id).first();
  const origin = new URL(request.url).origin;
  const params = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price_data][currency]': 'thb',
    'line_items[0][price_data][product_data][name]': `${event.name} · ${ticket.zone} · ตั๋วรีเซล #${ticket.token_id}`,
    'line_items[0][price_data][product_data][description]': event.venue,
    'line_items[0][price_data][unit_amount]': String(amount),
    'line_items[0][quantity]': '1',
    expires_at: String(Math.floor(now / 1000) + 1800), // Stripe's minimum; our hold is 10 minutes
    success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?checkout=cancelled&order=${orderId}`,
    client_reference_id: orderId,
    'metadata[kind]': 'resale',
    'metadata[order_id]': orderId,
    'metadata[listing_id]': listing.id,
    'metadata[event_id]': listing.event_id,
    'payment_intent_data[metadata][order_id]': orderId,
    'payment_intent_data[metadata][kind]': 'resale',
  });
  if (user.email) params.set('customer_email', user.email);
  let session = null;
  try {
    const response = await deps.stripeRequest(env.STRIPE_SECRET_KEY, '/v1/checkout/sessions', params, orderId);
    if (response.ok) session = await response.json();
    else console.error('stripe resale session failed', response.status, await response.text());
  } catch (err) {
    console.error('stripe resale session failed', err && err.stack || err);
  }
  if (!session?.id) {
    await releaseOrder(env.DB, orderId, 'expired');
    return deps.json({ error: 'stripe_request_failed' }, 502);
  }
  await env.DB.prepare('UPDATE resale_orders SET stripe_session_id = ?, updated_at = ? WHERE id = ?')
    .bind(session.id, Date.now(), orderId).run();
  return deps.json({ url: session.url, orderId, expiresAt: now + deps.HOLD_MS }, 200, { 'cache-control': 'no-store' });
}

async function myPayouts(request, env, deps) {
  const user = await deps.currentUser(request, env);
  if (!user) return deps.json({ error: 'authentication_required' }, 401);
  const rows = await env.DB.prepare(
    `SELECT p.*, t.token_id, t.zone FROM resale_payouts p JOIN tickets t ON t.id = p.ticket_id
     WHERE p.seller_id = ? ORDER BY p.created_at DESC LIMIT 200`,
  ).bind(user.id).all();
  return deps.json({
    payouts: (rows.results || []).map(p => ({
      id: p.id, eventId: p.event_id, zone: p.zone, tokenId: p.token_id, grossSatang: p.gross,
      commissionSatang: p.commission, netSatang: p.net, status: p.status, releaseAfter: p.release_after,
      createdAt: p.created_at, settledAt: p.settled_at,
    })),
  }, 200, { 'cache-control': 'no-store' });
}

/* ---------- return from Stripe ---------- */

export async function resaleCheckoutStatus(env, ctx, user, sessionId, deps) {
  const order = await env.DB.prepare(
    `SELECT o.*, t.zone, t.token_id, t.user_id AS holder_id FROM resale_orders o JOIN tickets t ON t.id = o.ticket_id
     WHERE o.stripe_session_id = ? AND o.buyer_id = ?`,
  ).bind(sessionId, user.id).first();
  if (!order) return null;
  if (order.status === 'paid') ctx.waitUntil(advanceTransfer(env, order.id, deps).catch(err => console.error('transfer failed', err)));
  return {
    status: order.status, orderId: order.id, kind: 'resale', eventId: order.event_id, zone: order.zone,
    quantity: 1, expiresAt: order.expires_at,
    // The ticket shows up in /api/tickets once it is the buyer's.
    tickets: order.status === 'fulfilled' && order.holder_id === user.id ? [{ id: order.ticket_id, tokenId: order.token_id }] : [],
  };
}

export async function cancelResaleCheckout(env, ctx, user, orderId, deps) {
  const order = await env.DB.prepare(
    `SELECT id, stripe_session_id FROM resale_orders WHERE id = ? AND buyer_id = ? AND status = 'pending'`,
  ).bind(orderId, user.id).first();
  return order ? expireOrder(env, ctx, order, deps) : false;
}

/* ---------- Stripe webhook: checks 2 to 5, then transfer ---------- */

// Mirrors confirmPayment in src/worker.js for a resale order. Check 1 (signature) and the
// first layer of check 5 (each Stripe event once) already ran in the webhook.
export async function confirmResalePayment(env, ctx, sessionId, deps) {
  const session = await deps.stripeGetSession(env.STRIPE_SECRET_KEY, sessionId); // check 2
  const order = await env.DB.prepare('SELECT * FROM resale_orders WHERE stripe_session_id = ?').bind(sessionId).first();
  if (!order) {
    console.error('resale payment for unknown session', sessionId);
    return 'unknown_order';
  }
  if (session.payment_status !== 'paid') return 'not_paid';
  if (['paid', 'fulfilled', 'needs_review'].includes(order.status)) return 'already_handled';

  const now = Date.now();
  const problems = [];
  // Check 3: amount and currency.
  if (session.currency !== order.currency || session.amount_total !== order.amount) {
    problems.push(`amount ${session.amount_total} ${session.currency} != ${order.amount} ${order.currency}`);
  }
  // Check 4: reference, the hold, and the resale rules still hold.
  if (session.client_reference_id !== order.id || session.metadata?.order_id !== order.id) problems.push('reference mismatch');
  if (order.status !== 'pending') problems.push(`paid after the hold ended (${order.status})`);
  const event = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(order.event_id).first();
  if (!event || event.cancelled_at) problems.push('event cancelled before the payment arrived');
  else if (event.starts_at == null || now > event.starts_at - event.transfer_cutoff_s * 1000) problems.push('paid after the transfer cutoff');
  const ticket = await env.DB.prepare('SELECT user_id, status, owner_wallet, token_id FROM tickets WHERE id = ?').bind(order.ticket_id).first();
  if (!ticket || ticket.user_id !== order.seller_id || ticket.status !== 'listed' || ticket.token_id == null) {
    problems.push(`ticket no longer listed by the seller (${ticket?.status})`);
  }
  if (problems.length) {
    await markReview(env.DB, order.id, problems.join('; '), session.payment_intent, `('pending', 'expired', 'failed')`);
    console.error('resale payment needs review', order.id, problems);
    return 'needs_review';
  }
  // Check 5: only one caller moves the order to paid and the listing to sold, in one batch.
  const [paid] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE resale_orders SET status = 'paid', stripe_payment_intent = ?, paid_at = ?, updated_at = ?
       WHERE id = ? AND status = 'pending'
         AND EXISTS (SELECT 1 FROM resale_listings l WHERE l.id = resale_orders.listing_id AND l.status = 'active')`,
    ).bind(session.payment_intent || null, now, now, order.id),
    env.DB.prepare(
      `UPDATE resale_listings SET status = 'sold', closed_at = ?, updated_at = ?
       WHERE id = ? AND status = 'active'
         AND EXISTS (SELECT 1 FROM resale_orders o WHERE o.id = ? AND o.status = 'paid')`,
    ).bind(now, now, order.listing_id, order.id),
  ]);
  if (!paid.meta.changes) {
    const fresh = await env.DB.prepare('SELECT status FROM resale_orders WHERE id = ?').bind(order.id).first();
    if (['paid', 'fulfilled'].includes(fresh?.status)) return 'already_handled';
    await markReview(env.DB, order.id, 'listing was no longer active when the payment arrived', session.payment_intent, `('pending')`);
    return 'needs_review';
  }
  ctx.waitUntil(advanceTransfer(env, order.id, deps).catch(err => console.error('transfer failed', order.id, err && err.stack || err)));
  return 'paid';
}

export async function releaseResaleBySession(db, sessionId, status) {
  const order = await db.prepare('SELECT id FROM resale_orders WHERE stripe_session_id = ?').bind(sessionId).first();
  return order ? releaseOrder(db, order.id, status) : false;
}

async function markReview(db, orderId, reason, paymentIntent, fromStatuses) {
  const now = Date.now();
  await db.prepare(
    `UPDATE resale_orders SET status = 'needs_review', review_reason = ?, stripe_payment_intent = COALESCE(?, stripe_payment_intent),
            paid_at = COALESCE(paid_at, ?), updated_at = ?
     WHERE id = ? AND status IN ${fromStatuses}`,
  ).bind(String(reason).slice(0, 500), paymentIntent || null, now, now, orderId).run();
}

// Ends a hold once. The listing is free again by itself: a hold is only a pending order.
async function releaseOrder(db, orderId, status) {
  const close = await db.prepare(`UPDATE resale_orders SET status = ?, updated_at = ? WHERE id = ? AND status = 'pending'`)
    .bind(status, Date.now(), orderId).run();
  return Boolean(close.meta.changes);
}

async function expireOrder(env, ctx, order, deps) {
  if (!order.stripe_session_id) return releaseOrder(env.DB, order.id, 'expired');
  const res = await deps.stripeRequest(env.STRIPE_SECRET_KEY,
    `/v1/checkout/sessions/${encodeURIComponent(order.stripe_session_id)}/expire`, new URLSearchParams());
  if (res.ok) return releaseOrder(env.DB, order.id, 'expired');
  const session = await deps.stripeGetSession(env.STRIPE_SECRET_KEY, order.stripe_session_id);
  if (session.status === 'expired') return releaseOrder(env.DB, order.id, 'expired');
  if (session.status === 'complete') await confirmResalePayment(env, ctx, order.stripe_session_id, deps);
  return false;
}

/* ---------- operatorTransfer through the relayer ---------- */

// Mirrors mintOrder/settleMint: a 'sending' claim so one worker sends, up to 3 attempts, and a
// send that may or may not have reached thirdweb goes to review instead of being repeated.
async function sendTransfer(env, orderId, deps) {
  if (!env.THIRDWEB_SECRET_KEY) return;
  const now = Date.now();
  const claim = await env.DB.prepare(
    `UPDATE resale_orders SET transfer_tx_id = 'sending', transfer_attempts = transfer_attempts + 1, updated_at = ?
     WHERE id = ? AND status = 'paid' AND transfer_tx_id IS NULL AND transfer_attempts < ?`,
  ).bind(now, orderId, MAX_TRANSFER_ATTEMPTS).run();
  if (!claim.meta.changes) {
    await env.DB.prepare(
      `UPDATE resale_orders SET status = 'needs_review', review_reason = 'transfer could not be sent: ' || COALESCE(transfer_error, '?'), updated_at = ?
       WHERE id = ? AND status = 'paid' AND transfer_tx_id IS NULL AND transfer_attempts >= ?`,
    ).bind(now, orderId, MAX_TRANSFER_ATTEMPTS).run();
    return;
  }
  const order = await env.DB.prepare(
    `SELECT o.buyer_wallet, t.token_id FROM resale_orders o JOIN tickets t ON t.id = o.ticket_id WHERE o.id = ?`,
  ).bind(orderId).first();
  let ids;
  try {
    ids = await deps.writeTicketContract(env.THIRDWEB_SECRET_KEY, [{
      contractAddress: deps.TICKET_CONTRACT,
      method: 'function operatorTransfer(uint256 tokenId, address to)',
      params: [String(order.token_id), order.buyer_wallet],
    }]);
  } catch (err) {
    if (err && err.name === 'TimeoutError') {
      await env.DB.prepare(`UPDATE resale_orders SET status = 'needs_review', review_reason = ?, updated_at = ? WHERE id = ?`)
        .bind('transfer request timed out; check the relayer before retrying', Date.now(), orderId).run();
    } else {
      await env.DB.prepare(
        `UPDATE resale_orders SET transfer_tx_id = NULL, transfer_error = ?, updated_at = ? WHERE id = ? AND transfer_tx_id = 'sending'`,
      ).bind(String(err && err.message || err).slice(0, 500), Date.now(), orderId).run();
    }
    return;
  }
  await env.DB.prepare('UPDATE resale_orders SET transfer_tx_id = ?, transfer_error = NULL, updated_at = ? WHERE id = ?')
    .bind(ids[0], Date.now(), orderId).run();
  await settleTransfer(env, orderId, deps, 10);
}

// Confirmed on chain: the ticket becomes the buyer's (new acquired_at, so the 6-hour hold starts
// again), the listing completes, and the seller's share is written to resale_payouts as held.
async function settleTransfer(env, orderId, deps, polls = 1) {
  const order = await env.DB.prepare(
    `SELECT o.*, t.token_id, t.owner_wallet AS seller_wallet, e.starts_at, e.ends_at, e.resale_commission_bps
     FROM resale_orders o JOIN tickets t ON t.id = o.ticket_id JOIN events e ON e.id = o.event_id
     WHERE o.id = ? AND o.status = 'paid'`,
  ).bind(orderId).first();
  if (!order?.transfer_tx_id || order.transfer_tx_id === 'sending') return;
  const tx = await deps.waitForTransaction(env.THIRDWEB_SECRET_KEY, order.transfer_tx_id, polls)
    .catch(err => ({ status: 'UNKNOWN', hash: null, error: String(err && err.message || err) }));
  const confirmed = tx.status === 'CONFIRMED' && tx.hash;
  // updated_at is when transfer_tx_id was recorded; nothing else touches a paid order until it settles.
  const age = Date.now() - order.updated_at;
  if (confirmed) {
    const logs = await deps.receiptLogs(env, tx.hash);
    if (!transferLogFound(logs, deps.TICKET_CONTRACT, deps.ERC721_TRANSFER_TOPIC, order.seller_wallet, order.buyer_wallet, order.token_id)) {
      console.error('transfer receipt has no matching Transfer log', orderId, tx.hash);
      return; // RPC may lag behind thirdweb; the next pass checks again
    }
  } else {
    if (tx.status !== 'FAILED' && age < TRANSFER_CHAIN_CHECK_AFTER_MS) return; // still on its way
    // Failed or stuck at thirdweb: the chain decides. Sending again after a transfer that did land
    // would leave the order unable to settle, so only a ticket still with the seller is retried.
    let owner;
    try {
      owner = (await readChain(env, order.token_id)).owner;
    } catch (err) {
      await env.DB.prepare(`UPDATE resale_orders SET transfer_error = ? WHERE id = ? AND status = 'paid'`)
        .bind(('chain check: ' + (err && err.message || err)).slice(0, 500), orderId).run();
      return;
    }
    if (owner !== String(order.buyer_wallet).toLowerCase()) {
      if (tx.status === 'FAILED') {
        const last = order.transfer_attempts >= MAX_TRANSFER_ATTEMPTS;
        await env.DB.prepare(
          `UPDATE resale_orders SET transfer_tx_id = NULL, transfer_error = ?, status = ?, review_reason = ?, updated_at = ?
           WHERE id = ? AND transfer_tx_id = ?`,
        ).bind(String(tx.error || 'transfer failed').slice(0, 500), last ? 'needs_review' : 'paid',
          last ? `operatorTransfer failed ${MAX_TRANSFER_ATTEMPTS} times` : null, Date.now(), orderId, order.transfer_tx_id).run();
      } else if (age >= TRANSFER_REVIEW_AFTER_MS) {
        await env.DB.prepare(`UPDATE resale_orders SET status = 'needs_review', review_reason = ?, updated_at = ? WHERE id = ? AND status = 'paid'`)
          .bind(`transfer not confirmed by thirdweb after 30 min (${tx.status}) and the ticket is not with the buyer on chain; check the relayer before retrying`,
            Date.now(), orderId).run();
      }
      return;
    }
    console.error('transfer found on chain while thirdweb says', tx.status, orderId);
  }
  const now = Date.now();
  const commission = commissionSatang(order.amount, order.resale_commission_bps);
  const endsAt = order.ends_at ?? order.starts_at;
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE tickets SET user_id = ?, owner_wallet = ?, status = 'active', transfers = transfers + 1, acquired_at = ?
       WHERE id = ? AND user_id = ? AND status = 'listed'`,
    ).bind(order.buyer_id, order.buyer_wallet, now, order.ticket_id, order.seller_id),
    env.DB.prepare(`UPDATE resale_listings SET status = 'completed', updated_at = ? WHERE id = ? AND status = 'sold'`)
      .bind(now, order.listing_id),
    env.DB.prepare(
      `UPDATE resale_orders SET status = 'fulfilled', transfer_tx_hash = ?, fulfilled_at = ?, updated_at = ? WHERE id = ? AND status = 'paid'`,
    ).bind(tx.hash || 'confirmed-on-chain', now, now, orderId),
    env.DB.prepare(
      `INSERT INTO resale_payouts (id, order_id, listing_id, ticket_id, seller_id, event_id, gross, commission, net, release_after)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (order_id) DO NOTHING`,
    ).bind(crypto.randomUUID(), orderId, order.listing_id, order.ticket_id, order.seller_id, order.event_id,
      order.amount, commission, order.amount - commission, endsAt == null ? null : endsAt + DISPUTE_WINDOW_MS),
  ]);
}

async function advanceTransfer(env, orderId, deps) {
  const order = await env.DB.prepare('SELECT transfer_tx_id, updated_at FROM resale_orders WHERE id = ? AND status = ?')
    .bind(orderId, 'paid').first();
  if (!order) return;
  if (order.transfer_tx_id == null) return sendTransfer(env, orderId, deps);
  if (order.transfer_tx_id !== 'sending') return settleTransfer(env, orderId, deps);
  if (Date.now() - order.updated_at > 5 * 60000) {
    await env.DB.prepare(`UPDATE resale_orders SET status = 'needs_review', review_reason = ?, updated_at = ? WHERE id = ? AND transfer_tx_id = 'sending'`)
      .bind('transfer send was interrupted; check the relayer before retrying', Date.now(), orderId).run();
  }
}

/* ---------- cron ---------- */

export async function resaleSweep(env, ctx, deps) {
  const now = Date.now();
  // 1. Holds older than 10 minutes: expire the Stripe session, free the listing.
  if (env.STRIPE_SECRET_KEY) {
    const holds = await env.DB.prepare(
      `SELECT id, stripe_session_id FROM resale_orders
       WHERE status = 'pending' AND expires_at < ? AND (stripe_session_id IS NOT NULL OR expires_at < ?)
       ORDER BY expires_at LIMIT 25`,
    ).bind(now, now - 60000).all();
    for (const o of holds.results || []) {
      try { await expireOrder(env, ctx, o, deps); } catch (err) { console.error('resale expire failed', o.id, err && err.stack || err); }
    }
  }
  // 2. Unsold listings at the transfer cutoff, or of a cancelled event, close and unlock the ticket.
  const stale = await env.DB.prepare(
    `SELECT l.id FROM resale_listings l JOIN events e ON e.id = l.event_id
     WHERE l.status = 'active' AND (e.cancelled_at IS NOT NULL OR e.starts_at - e.transfer_cutoff_s * 1000 <= ?)
     LIMIT 50`,
  ).bind(now).all();
  for (const l of stale.results || []) {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE resale_listings SET status = 'expired', closed_at = ?, updated_at = ?
         WHERE id = ? AND status = 'active'
           AND NOT EXISTS (SELECT 1 FROM resale_orders o WHERE o.listing_id = resale_listings.id AND o.status IN ('pending', 'paid', 'fulfilled'))`,
      ).bind(now, now, l.id),
      unlockTicketStmt(env.DB, l.id),
    ]);
  }
  // 3. Paid orders: send or settle operatorTransfer.
  const paid = await env.DB.prepare(
    `SELECT id FROM resale_orders WHERE status = 'paid' ORDER BY paid_at LIMIT 10`,
  ).all();
  for (const o of paid.results || []) {
    try { await advanceTransfer(env, o.id, deps); } catch (err) { console.error('resale transfer failed', o.id, err && err.stack || err); }
  }
}
