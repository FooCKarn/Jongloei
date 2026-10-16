// Resale (src/resale.js): the pure rules, then the whole flow through the Worker on an in-memory
// D1 (tests/worker/d1-shim.mjs) with Stripe, thirdweb and the Fuji RPC mocked.
// Run: node --test tests/worker/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { resaleCap, commissionSatang, listingProblem, checkoutProblem, transferLogFound } from '../../src/resale.js';
import worker from '../../src/worker.js';
import { makeD1 } from './d1-shim.mjs';

const H = 3600000;
const TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const CONTRACT = '0xef36fcbdED316dEd4367636a6c85d73bFD5e2735';

/* ---------- rules ---------- */

test('cap is 1.25 x face, commission is 6 % half up in satang', () => {
  assert.equal(resaleCap(2500, 12500), 3125);
  assert.equal(resaleCap(999, 12500), 1248);
  assert.equal(resaleCap(1000, 10000), 1000);
  assert.equal(commissionSatang(110000, 600), 6600); // context 5.6: 1,100 -> 66
  assert.equal(commissionSatang(120000, 600), 7200);
  assert.equal(commissionSatang(25, 600), 2);        // 1.5 satang rounds up
  assert.equal(commissionSatang(24, 600), 1);        // 1.44 rounds down
});

test('listing window: 6 h after receiving, closed 1 h before the start', () => {
  const now = Date.UTC(2026, 9, 15);
  const ev = { status: 'on_sale', starts_at: now + 10 * H, resale_cap_bps: 12500, resale_delay_s: 21600, transfer_cutoff_s: 3600 };
  const t = { status: 'active', token_id: 1, face_price: 1000, acquired_at: now - 6 * H };
  assert.equal(listingProblem(t, ev, 1250, now), null);
  assert.equal(listingProblem(t, ev, 1251, now).error, 'invalid_price');
  assert.equal(listingProblem(t, ev, 0, now).error, 'invalid_price');
  assert.equal(listingProblem(t, ev, 10.5, now).error, 'invalid_price');
  assert.equal(listingProblem({ ...t, acquired_at: now - 5 * H }, ev, 1000, now).error, 'holding_period');
  assert.equal(listingProblem({ ...t, acquired_at: null, minted_at: now - 7 * H }, ev, 1000, now), null);
  assert.equal(listingProblem(t, { ...ev, starts_at: now + H }, 1000, now).error, 'transfer_closed');
  assert.equal(listingProblem(t, { ...ev, starts_at: null }, 1000, now).error, 'event_time_unknown');
  assert.equal(listingProblem(t, { ...ev, cancelled_at: now }, 1000, now).error, 'event_not_open');
  for (const status of ['listed', 'used', 'minting', 'mint_failed']) {
    assert.equal(listingProblem({ ...t, status }, ev, 1000, now).error, 'ticket_not_listable', status);
  }
  // A ticket received less than 7 h before the start can never be listed (context 5.6).
  const late = { ...ev, starts_at: now + 6.5 * H };
  assert.equal(listingProblem({ ...t, acquired_at: now }, late, 1000, now + 5.5 * H).error, 'transfer_closed');
});

test('checkout: not your own listing, and the whole hold ends before the cutoff', () => {
  const now = Date.UTC(2026, 9, 15), hold = 10 * 60000;
  const ev = { status: 'on_sale', starts_at: now + H + hold, transfer_cutoff_s: 3600 };
  const l = { status: 'active', seller_id: 's' };
  assert.equal(checkoutProblem(l, ev, 'b', now, hold), null);
  assert.equal(checkoutProblem(l, ev, 'b', now + 1, hold).error, 'transfer_closed');
  assert.equal(checkoutProblem(l, ev, 's', now, hold).error, 'own_listing');
  assert.equal(checkoutProblem({ ...l, status: 'sold' }, ev, 'b', now, hold).error, 'listing_unavailable');
});

test('transfer log must name the contract, seller, buyer and token', () => {
  const pad = a => '0x' + a.replace(/^0x/, '').toLowerCase().padStart(64, '0');
  const log = { address: CONTRACT.toLowerCase(), topics: [TOPIC, pad('0xaa'), pad('0xbb'), '0x' + (7).toString(16).padStart(64, '0')] };
  assert.equal(transferLogFound([log], CONTRACT, TOPIC, '0xaa', '0xbb', 7), true);
  assert.equal(transferLogFound([log], CONTRACT, TOPIC, '0xaa', '0xbb', 8), false);
  assert.equal(transferLogFound([log], CONTRACT, TOPIC, '0xaa', '0xcc', 7), false);
  assert.equal(transferLogFound([{ ...log, address: '0x1' }], CONTRACT, TOPIC, '0xaa', '0xbb', 7), false);
});

/* ---------- flow through the Worker ---------- */

const WALLET = { seller: '0x' + '1'.repeat(40), buyer: '0x' + '2'.repeat(40), other: '0x' + '3'.repeat(40) };

function setup() {
  const DB = makeD1();
  const env = { DB, STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x', THIRDWEB_SECRET_KEY: 'tw_x' };
  const now = Date.now();
  for (const id of Object.keys(WALLET)) {
    DB.raw.prepare('INSERT INTO users (id, display_name, email) VALUES (?, ?, ?)').run(id, id, id + '@example.com');
    DB.raw.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
      .run('s-' + id, id, createHash('sha256').update('tok-' + id).digest('hex'), now + 86400000);
    DB.raw.prepare(`INSERT INTO wallets (id, user_id, address, kind, is_primary) VALUES (?, ?, ?, 'inapp', 1)`).run('w-' + id, id, WALLET[id]);
  }
  DB.raw.prepare('UPDATE events SET starts_at = ?, ends_at = ? WHERE id = ?').run(now + 3 * 86400000, now + 3 * 86400000 + 4 * H, 'neon');
  const ticket = (id, tokenId, acquiredAt, user = 'seller') => {
    DB.raw.prepare(`INSERT INTO payment_orders (id, user_id, stripe_session_id, event_id, zone, quantity, unit_amount, amount, status, expires_at)
      VALUES (?, ?, ?, 'neon', 'Standing A', 1, 257500, 257500, 'fulfilled', 0)`).run('po-' + id, user, 'cs_primary_' + id);
    DB.raw.prepare(`INSERT INTO tickets (id, order_id, user_id, event_id, zone, face_price, owner_wallet, token_id, status, minted_at)
      VALUES (?, ?, ?, 'neon', 'Standing A', 2500, ?, ?, 'active', ?)`).run(id, 'po-' + id, user, WALLET[user], tokenId, acquiredAt);
  };
  return { DB, env, ticket, now };
}

// Stripe, thirdweb and the RPC, recorded so the tests can look at what was sent.
function mockNetwork() {
  const sent = { sessions: [], writes: [], expired: [] };
  const sessions = new Map();
  let n = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (url.host === 'api.stripe.com') {
      const m = url.pathname.match(/^\/v1\/checkout\/sessions(?:\/([^/]+))?(\/expire)?$/);
      if (!m[1] && init.method === 'POST') {
        const p = new URLSearchParams(String(init.body));
        const id = 'cs_test_' + ++n;
        const s = { id, status: 'open', payment_status: 'unpaid', currency: 'thb', payment_intent: 'pi_' + n,
          amount_total: Number(p.get('line_items[0][price_data][unit_amount]')) * Number(p.get('line_items[0][quantity]')),
          client_reference_id: p.get('client_reference_id'), metadata: { order_id: p.get('metadata[order_id]'), kind: p.get('metadata[kind]'), listing_id: p.get('metadata[listing_id]') } };
        sessions.set(id, s); sent.sessions.push(p);
        return reply({ id, url: 'https://checkout.stripe.test/' + id });
      }
      if (m[2]) { sent.expired.push(m[1]); sessions.get(m[1]).status = 'expired'; return reply({}); }
      return reply(sessions.get(decodeURIComponent(m[1])));
    }
    if (url.host === 'api.thirdweb.com' && url.pathname === '/v1/contracts/write') {
      const body = JSON.parse(init.body); sent.writes.push(body);
      return reply({ result: { transactionIds: ['tx-' + sent.writes.length] } });
    }
    if (url.host === 'api.thirdweb.com' && url.pathname.startsWith('/v1/transactions/')) {
      return reply({ result: { status: 'CONFIRMED', transactionHash: '0xhash' + url.pathname.split('-').pop() } });
    }
    if (url.host === 'api.avax-test.network') {
      const call = sent.writes.at(-1).calls[0];
      const pad = a => '0x' + a.replace(/^0x/, '').toLowerCase().padStart(64, '0');
      const [tokenId, to] = call.params;
      const from = sent.from || WALLET.seller;
      return reply({ result: { logs: [{ address: CONTRACT.toLowerCase(), topics: [TOPIC, pad(from), pad(to), '0x' + BigInt(tokenId).toString(16).padStart(64, '0')] }] } });
    }
    throw new Error('unexpected fetch ' + url);
  };
  return { sent, sessions };
}

function harness(env) {
  const call = async (who, method, path, body) => {
    const pending = [];
    const ctx = { waitUntil: p => pending.push(p) };
    const res = await worker.fetch(new Request('https://jongloei.test' + path, {
      method, headers: { cookie: 'jl_session=tok-' + who, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }), env, ctx);
    await Promise.all(pending);
    return { s: res.status, ...(await res.json()) };
  };
  let evn = 0;
  const webhook = async (session, type = 'checkout.session.completed') => {
    const payload = JSON.stringify({ id: 'evt_' + ++evn, type, data: { object: session } });
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(`${t}.${payload}`).digest('hex');
    const pending = [];
    const res = await worker.fetch(new Request('https://jongloei.test/api/stripe/webhook', {
      method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${sig}` }, body: payload,
    }), env, { waitUntil: p => pending.push(p) });
    await Promise.all(pending);
    return { s: res.status, ...(await res.json()), replay: () => worker.fetch(new Request('https://jongloei.test/api/stripe/webhook', {
      method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${sig}` }, body: payload }), env, { waitUntil() {} }).then(r => r.json()) };
  };
  const cron = async () => {
    const pending = [];
    await worker.scheduled({}, env, { waitUntil: p => pending.push(p) });
    await Promise.all(pending);
  };
  return { call, webhook, cron };
}

test('list, hold, pay, 5 checks, operatorTransfer, payout held for the seller', async () => {
  const { DB, env, ticket, now } = setup();
  const { sent, sessions } = mockNetwork();
  const { call, webhook } = harness(env);
  ticket('t1', 7, now - 7 * H);
  ticket('t-new', 8, now - 1 * H);

  let r = await call('seller', 'POST', '/api/resale/listings', { ticketId: 't1', price: 3126 });
  assert.equal(r.s, 400); assert.equal(r.error, 'invalid_price'); assert.equal(r.cap, 3125);
  r = await call('seller', 'POST', '/api/resale/listings', { ticketId: 't-new', price: 2500 });
  assert.equal(r.error, 'holding_period'); assert.equal(r.listableAt, now - H + 6 * H);
  r = await call('buyer', 'POST', '/api/resale/listings', { ticketId: 't1', price: 2500 });
  assert.equal(r.s, 404, 'someone else\'s ticket');
  r = await call('seller', 'POST', '/api/resale/listings', { ticketId: 't1', price: 3125 });
  assert.equal(r.s, 201, JSON.stringify(r));
  const listingId = r.listing.id;
  r = await call('seller', 'POST', '/api/resale/listings', { ticketId: 't1', price: 3000 });
  assert.equal(r.s, 409, 'one live listing per ticket');
  assert.equal(DB.raw.prepare('SELECT status FROM tickets WHERE id = ?').get('t1').status, 'listed');

  r = await call('buyer', 'GET', '/api/resale/listings?eventId=neon');
  assert.equal(r.listings.length, 1); assert.equal(r.listings[0].price, 3125); assert.equal(r.listings[0].mine, false);
  assert.equal(r.listings[0].seller, '0x1111…1111');
  r = await call('seller', 'GET', '/api/resale/listings?mine=1');
  assert.equal(r.listings[0].mine, true);

  r = await call('seller', 'POST', '/api/resale/checkout', { listingId });
  assert.equal(r.error, 'own_listing');
  r = await call('buyer', 'POST', '/api/resale/checkout', { listingId });
  assert.equal(r.s, 200, JSON.stringify(r));
  const sessionId = r.url.split('/').pop();
  const params = sent.sessions.at(-1);
  assert.equal(params.get('line_items[0][price_data][unit_amount]'), '312500', 'buyer pays the listing price, no service fee');
  assert.equal(params.get('metadata[kind]'), 'resale');
  r = await call('other', 'POST', '/api/resale/checkout', { listingId });
  assert.equal(r.error, 'listing_held', 'one hold per listing');
  r = await call('seller', 'DELETE', `/api/resale/listings/${listingId}`);
  assert.equal(r.error, 'listing_on_hold', 'seller cannot pull it while the buyer pays');
  // A resale hold never touches first-sale seats.
  const zone = DB.raw.prepare(`SELECT remaining FROM event_zones WHERE id = 'neon-standing-a'`).get().remaining;
  r = await call('buyer', 'GET', '/api/events');
  assert.equal(Object.values(r).find(e => e?.id === 'neon').zones[0].left, zone);

  const s = sessions.get(sessionId);
  Object.assign(s, { status: 'complete', payment_status: 'paid' });
  r = await webhook(s);
  assert.equal(r.s, 200);
  assert.equal(sent.writes.length, 1);
  assert.deepEqual(sent.writes[0].calls[0], { contractAddress: CONTRACT, method: 'function operatorTransfer(uint256 tokenId, address to)', params: ['7', WALLET.buyer] });
  const t = DB.raw.prepare('SELECT * FROM tickets WHERE id = ?').get('t1');
  assert.equal(t.user_id, 'buyer'); assert.equal(t.owner_wallet, WALLET.buyer); assert.equal(t.status, 'active');
  assert.equal(t.transfers, 1); assert.ok(t.acquired_at >= now, 'holding period restarts for the buyer');
  assert.equal(DB.raw.prepare('SELECT status FROM resale_listings WHERE id = ?').get(listingId).status, 'completed');
  const p = DB.raw.prepare('SELECT * FROM resale_payouts').get();
  assert.deepEqual([p.seller_id, p.gross, p.commission, p.net, p.status], ['seller', 312500, 18750, 293750, 'held']);
  assert.equal(p.release_after, now + 3 * 86400000 + 4 * H + 24 * H);
  assert.equal((await r.replay()).duplicate, true);
  assert.equal(sent.writes.length, 1, 'a replayed webhook transfers nothing');

  r = await call('buyer', 'GET', '/api/checkout-status?session_id=' + sessionId);
  assert.equal(r.status, 'fulfilled'); assert.equal(r.tickets[0].id, 't1');
  r = await call('buyer', 'GET', '/api/tickets');
  assert.equal(r.tickets.find(x => x.id === 't1').status, 'active');
  r = await call('seller', 'GET', '/api/tickets');
  assert.equal(r.tickets.some(x => x.id === 't1'), false, 'the old holder no longer has it');
  r = await call('seller', 'GET', '/api/resale/payouts');
  assert.equal(r.payouts[0].netSatang, 293750); assert.equal(r.payouts[0].status, 'held');
  r = await call('buyer', 'POST', '/api/resale/listings', { ticketId: 't1', price: 3000 });
  assert.equal(r.error, 'holding_period', 'the buyer waits 6 h before reselling');

  // Unlimited resales: after 6 h the buyer sells it on, still capped at 1.25 x the first face price.
  DB.raw.prepare('UPDATE tickets SET acquired_at = ? WHERE id = ?').run(now - 6 * H, 't1');
  r = await call('buyer', 'POST', '/api/resale/listings', { ticketId: 't1', price: 3126 });
  assert.equal(r.error, 'invalid_price');
  r = await call('buyer', 'POST', '/api/resale/listings', { ticketId: 't1', price: 3000 });
  assert.equal(r.s, 201);
  r = await call('other', 'POST', '/api/resale/checkout', { listingId: r.listing.id });
  sent.from = WALLET.buyer;
  Object.assign(sessions.get(r.url.split('/').pop()), { status: 'complete', payment_status: 'paid' });
  await webhook(sessions.get(r.url.split('/').pop()));
  const t2 = DB.raw.prepare('SELECT user_id, transfers FROM tickets WHERE id = ?').get('t1');
  assert.deepEqual([t2.user_id, t2.transfers], ['other', 2]);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM resale_payouts').get().n, 2);
});

test('hold expires, seller cancels, cutoff closes listings, bad payments go to review', async () => {
  const { DB, env, ticket, now } = setup();
  const { sent, sessions } = mockNetwork();
  const { call, webhook, cron } = harness(env);
  ticket('t1', 7, now - 7 * H);
  ticket('t2', 9, now - 7 * H);

  let r = await call('seller', 'POST', '/api/resale/listings', { ticketId: 't1', price: 2000 });
  const l1 = r.listing.id;
  r = await call('buyer', 'POST', '/api/resale/checkout', { listingId: l1 });
  const sid = r.url.split('/').pop();
  // 10 minutes later: the cron expires the Stripe session and the listing is buyable again.
  DB.raw.prepare('UPDATE resale_orders SET expires_at = ?').run(now - 1);
  await cron();
  assert.deepEqual(sent.expired, [sid]);
  assert.equal(DB.raw.prepare('SELECT status FROM resale_orders').get().status, 'expired');
  r = await call('buyer', 'GET', '/api/resale/listings');
  assert.equal(r.listings[0].held, false);
  // Paying the expired session anyway: not transferred, a person refunds it.
  Object.assign(sessions.get(sid), { status: 'complete', payment_status: 'paid' });
  await webhook(sessions.get(sid));
  assert.equal(DB.raw.prepare('SELECT status FROM resale_orders').get().status, 'needs_review');
  assert.equal(sent.writes.length, 0);

  // Amount does not match: review, no transfer.
  r = await call('buyer', 'POST', '/api/resale/checkout', { listingId: l1 });
  const s2 = sessions.get(r.url.split('/').pop());
  Object.assign(s2, { status: 'complete', payment_status: 'paid', amount_total: 100 });
  await webhook(s2);
  assert.match(DB.raw.prepare('SELECT review_reason FROM resale_orders WHERE stripe_session_id = ?').get(s2.id).review_reason, /amount/);
  assert.equal(sent.writes.length, 0);
  assert.equal(DB.raw.prepare('SELECT status FROM tickets WHERE id = ?').get('t1').status, 'listed');

  // Seller takes it down (no hold now): the ticket is usable again.
  r = await call('seller', 'DELETE', `/api/resale/listings/${l1}`);
  assert.equal(r.s, 200);
  assert.equal(DB.raw.prepare('SELECT status FROM tickets WHERE id = ?').get('t1').status, 'active');
  r = await call('seller', 'DELETE', `/api/resale/listings/${l1}`);
  assert.equal(r.error, 'listing_closed');

  // Transfer cutoff: listing t2, then the event moves to 30 minutes from now.
  r = await call('seller', 'POST', '/api/resale/listings', { ticketId: 't2', price: 2000 });
  DB.raw.prepare('UPDATE events SET starts_at = ? WHERE id = ?').run(now + 30 * 60000, 'neon');
  r = await call('buyer', 'GET', '/api/resale/listings');
  assert.equal(r.listings.length, 0, 'closed listings leave the market');
  r = await call('buyer', 'POST', '/api/resale/checkout', { listingId: DB.raw.prepare(`SELECT id FROM resale_listings WHERE ticket_id = 't2'`).get().id });
  assert.equal(r.error, 'transfer_closed');
  await cron();
  assert.equal(DB.raw.prepare(`SELECT status FROM resale_listings WHERE ticket_id = 't2'`).get().status, 'expired');
  assert.equal(DB.raw.prepare('SELECT status FROM tickets WHERE id = ?').get('t2').status, 'active');
  r = await call('seller', 'POST', '/api/resale/listings', { ticketId: 't1', price: 2000 });
  assert.equal(r.error, 'transfer_closed');
});

test('a held ticket cannot be listed twice even in a race, and limits apply to the buyer', async () => {
  const { DB, env, ticket, now } = setup();
  mockNetwork();
  const { call } = harness(env);
  ticket('t1', 7, now - 7 * H);
  const [a, b] = await Promise.all([
    call('seller', 'POST', '/api/resale/listings', { ticketId: 't1', price: 2000 }),
    call('seller', 'POST', '/api/resale/listings', { ticketId: 't1', price: 2100 }),
  ]);
  assert.deepEqual([a.s, b.s].sort(), [201, 409]);
  assert.equal(DB.raw.prepare(`SELECT COUNT(*) AS n FROM resale_listings WHERE status = 'active'`).get().n, 1);
  // The buyer already holds 4 tickets of this event.
  for (let i = 0; i < 4; i++) ticket('b' + i, 100 + i, now, 'buyer');
  const r = await call('buyer', 'POST', '/api/resale/checkout', { listingId: (a.s === 201 ? a : b).listing.id });
  assert.equal(r.error, 'ticket_limit');
});
