// Resale operatorTransfer and door markUsed when thirdweb loses track of a write: the chain
// (ownerOf / used) decides, nothing waits forever, and a landed write is never sent again.
// Run: node --test tests/worker/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../src/worker.js';
import { makeD1 } from './d1-shim.mjs';

const MIN = 60000;
const WALLET = { seller: '0x' + '1'.repeat(40), buyer: '0x' + '2'.repeat(40) };
const word = v => '0x' + BigInt(v).toString(16).padStart(64, '0');

function setup() {
  const DB = makeD1();
  const env = { DB, THIRDWEB_SECRET_KEY: 'tw_x' };
  for (const id of Object.keys(WALLET)) {
    DB.raw.prepare('INSERT INTO users (id, display_name, email) VALUES (?, ?, ?)').run(id, id, id + '@example.com');
    DB.raw.prepare(`INSERT INTO wallets (id, user_id, address, kind, is_primary) VALUES (?, ?, ?, 'inapp', 1)`).run('w-' + id, id, WALLET[id]);
  }
  DB.raw.prepare(`INSERT INTO payment_orders (id, user_id, stripe_session_id, event_id, zone, quantity, unit_amount, amount, status, expires_at)
    VALUES ('po1', 'seller', 'cs_1', 'neon', 'Standing A', 1, 257500, 257500, 'fulfilled', 0)`).run();
  return { DB, env };
}

// A sold listing whose operatorTransfer was queued `age` ago.
function resaleOrder(DB, age) {
  DB.raw.prepare(`INSERT INTO tickets (id, order_id, user_id, event_id, zone, face_price, owner_wallet, token_id, status, minted_at)
    VALUES ('t1', 'po1', 'seller', 'neon', 'Standing A', 2500, ?, 7, 'listed', 0)`).run(WALLET.seller);
  DB.raw.prepare(`INSERT INTO resale_listings (id, ticket_id, seller_id, event_id, price, face_price, status)
    VALUES ('l1', 't1', 'seller', 'neon', 2600, 2500, 'sold')`).run();
  DB.raw.prepare(`INSERT INTO resale_orders (id, listing_id, ticket_id, buyer_id, seller_id, event_id, buyer_wallet, stripe_session_id,
      amount, status, expires_at, transfer_tx_id, transfer_attempts, paid_at, updated_at)
    VALUES ('ro1', 'l1', 't1', 'buyer', 'seller', 'neon', ?, 'cs_r1', 260000, 'paid', 0, 'tw-tx-1', 1, ?, ?)`)
    .run(WALLET.buyer, Date.now() - age, Date.now() - age);
}

// A ticket scanned `age` ago whose markUsed was queued.
function usedTicket(DB, age) {
  DB.raw.prepare(`INSERT INTO tickets (id, order_id, user_id, event_id, zone, face_price, owner_wallet, token_id, status, minted_at,
      used_at, mark_used_tx_id, mark_used_attempts)
    VALUES ('t2', 'po1', 'seller', 'neon', 'Standing A', 2500, ?, 8, 'used', 0, ?, 'tw-mu-1', 1)`).run(WALLET.seller, Date.now() - age);
}

// thirdweb answers `status` for every queued write; the chain has `owner` and `used`.
function mockNetwork({ status, owner = WALLET.seller, used = false }) {
  const sent = { writes: 0, chainReads: 0 };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const reply = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    if (url.host === 'api.thirdweb.com' && url.pathname === '/v1/contracts/write') {
      sent.writes++;
      return reply({ result: { transactionIds: ['tw-tx-' + (sent.writes + 1)] } });
    }
    if (url.host === 'api.thirdweb.com' && url.pathname.startsWith('/v1/transactions/')) {
      return reply({ result: { status, errorMessage: status === 'FAILED' ? 'RECEIPT_QUERY_FAILED' : null } });
    }
    if (url.host === 'api.avax-test.network') {
      const body = JSON.parse(init.body);
      if (Array.isArray(body)) { // readChain: ownerOf, used, eventOf
        sent.chainReads++;
        return reply(body.map(c => ({ jsonrpc: '2.0', id: c.id, result: [word(owner), word(used ? 1 : 0), word(1)][c.id] })));
      }
    }
    throw new Error('unexpected fetch ' + url);
  };
  return sent;
}

async function cron(env) {
  const pending = [];
  await worker.scheduled({}, env, { waitUntil: p => pending.push(p) });
  await Promise.all(pending);
}

const order = DB => DB.raw.prepare('SELECT status, transfer_tx_id, transfer_tx_hash, review_reason FROM resale_orders WHERE id = ?').get('ro1');
const ticket = (DB, id) => DB.raw.prepare('SELECT * FROM tickets WHERE id = ?').get(id);

test('resale: thirdweb stuck but the ticket is with the buyer on chain: fulfilled, not sent again', async () => {
  const { DB, env } = setup();
  resaleOrder(DB, 5 * MIN);
  const sent = mockNetwork({ status: 'SUBMITTED', owner: WALLET.buyer });
  await cron(env);
  assert.equal(order(DB).status, 'fulfilled');
  assert.equal(ticket(DB, 't1').owner_wallet, WALLET.buyer);
  assert.equal(ticket(DB, 't1').status, 'active');
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM resale_payouts').get().n, 1);
  assert.equal(sent.writes, 0);
});

test('resale: FAILED but landed on chain: fulfilled, not sent again', async () => {
  const { DB, env } = setup();
  resaleOrder(DB, 0);
  const sent = mockNetwork({ status: 'FAILED', owner: WALLET.buyer });
  await cron(env);
  assert.equal(order(DB).status, 'fulfilled');
  assert.equal(sent.writes, 0);
});

test('resale: FAILED and still with the seller: freed for another attempt as before', async () => {
  const { DB, env } = setup();
  resaleOrder(DB, 0);
  mockNetwork({ status: 'FAILED' });
  await cron(env);
  assert.equal(order(DB).status, 'paid');
  assert.equal(order(DB).transfer_tx_id, null);
});

test('resale: thirdweb still pending right after sending, but already on chain: fulfilled at once', async () => {
  const { DB, env } = setup();
  resaleOrder(DB, 0);
  const sent = mockNetwork({ status: 'SUBMITTED', owner: WALLET.buyer });
  await cron(env);
  assert.equal(order(DB).status, 'fulfilled');
  assert.equal(ticket(DB, 't1').owner_wallet, WALLET.buyer);
  assert.equal(sent.writes, 0);
});

test('resale: pending, not on chain: waits, then review after 30 min', async () => {
  let { DB, env } = setup();
  resaleOrder(DB, 1 * MIN);
  let sent = mockNetwork({ status: 'SUBMITTED' });
  await cron(env);
  assert.equal(order(DB).status, 'paid');
  assert.equal(order(DB).transfer_tx_id, 'tw-tx-1');
  assert.equal(sent.writes, 0);

  ({ DB, env } = setup());
  resaleOrder(DB, 31 * MIN);
  sent = mockNetwork({ status: 'SUBMITTED' });
  await cron(env);
  assert.equal(order(DB).status, 'needs_review');
  assert.match(order(DB).review_reason, /not with the buyer on chain/);
  assert.equal(sent.writes, 0);
});

test('markUsed: thirdweb stuck but used on chain: done', async () => {
  const { DB, env } = setup();
  usedTicket(DB, 2 * MIN);
  const sent = mockNetwork({ status: 'SUBMITTED', used: true });
  await cron(env);
  assert.equal(ticket(DB, 't2').mark_used_tx_hash, 'already-used-on-chain');
  assert.equal(sent.writes, 0);
});

test('markUsed: stuck and not used on chain long after the scan: retried, and the attempt limit ends it', async () => {
  const { DB, env } = setup();
  usedTicket(DB, 2 * MIN);
  let sent = mockNetwork({ status: 'SUBMITTED' });
  await cron(env);
  assert.equal(ticket(DB, 't2').mark_used_tx_id, 'tw-mu-1'); // recent scan: keeps waiting

  DB.raw.prepare('UPDATE tickets SET used_at = ? WHERE id = ?').run(Date.now() - 31 * MIN, 't2');
  sent = mockNetwork({ status: 'SUBMITTED' });
  for (let i = 0; i < 6; i++) await cron(env);
  const t = ticket(DB, 't2');
  assert.equal(t.mark_used_attempts, 3);
  assert.equal(t.mark_used_tx_id, null);
  assert.equal(sent.writes, 2);
  sent = mockNetwork({ status: 'SUBMITTED' });
  await cron(env);
  assert.equal(sent.writes + sent.chainReads, 0); // nothing left to loop on
});
