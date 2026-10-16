// Settling a primary mint when thirdweb loses track of it (src/worker.js settleMint): the mint
// is looked up token by token on the contract (ownerOf / eventOf) instead of waiting on thirdweb
// forever, and is never sent twice. Run: node --test tests/worker/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../src/worker.js';
import { makeD1 } from './d1-shim.mjs';
import { keccak256, toHex, SELECTORS } from '../../src/evm.js';

const MIN = 60000;
const CONTRACT = '0xef36fcbdED316dEd4367636a6c85d73bFD5e2735';
const WALLET = '0xd43fbbdc9dc08867c768e9f36c94f38d8b01660a';
const pad = v => '0x' + BigInt(v).toString(16).padStart(64, '0');

// A paid order for 'standup' (chain event 4) whose mint was queued `age` ago.
function setup({ age, quantity = 1 }) {
  const DB = makeD1();
  const env = { DB, THIRDWEB_SECRET_KEY: 'tw_x' };
  DB.raw.prepare('INSERT INTO users (id, display_name, email) VALUES (?, ?, ?)').run('u1', 'u1', 'u1@example.com');
  DB.raw.prepare(`INSERT INTO wallets (id, user_id, address, kind, is_primary) VALUES ('w1', 'u1', ?, 'inapp', 1)`).run(WALLET);
  const sentAt = Date.now() - age;
  DB.raw.prepare(`INSERT INTO payment_orders (id, user_id, stripe_session_id, event_id, zone, quantity, unit_amount, amount,
      status, expires_at, paid_at, mint_tx_id, mint_attempts, updated_at)
    SELECT 'po1', 'u1', 'cs_1', 'standup', zone_name, ?, price * 100, price * 100 * ?, 'paid', 0, ?, 'tw-tx-1', 1, ?
    FROM event_zones WHERE event_id = 'standup' LIMIT 1`).run(quantity, quantity, sentAt, sentAt);
  for (let i = 0; i < quantity; i++) {
    DB.raw.prepare(`INSERT INTO tickets (id, order_id, user_id, event_id, zone, face_price, owner_wallet, status)
      SELECT ?, 'po1', 'u1', 'standup', zone, unit_amount / 100, ?, 'minting' FROM payment_orders WHERE id = 'po1'`).run('t' + i, WALLET);
  }
  return { DB, env };
}

// thirdweb answers `status` for the queued write; the contract holds the `minted`
// [tokenId, eventId, to?] tokens, and nextTokenId is one past the highest of them.
function mockNetwork({ status, minted = [], thirdwebDown = false, rpcError = null }) {
  const sent = { writes: 0, bodies: [], chainReads: 0 };
  const byId = new Map(minted.map(([tokenId, eventId, to = WALLET]) => [tokenId, { eventId, to }]));
  const next = Math.max(0, ...byId.keys()) + 1;
  const call = ({ method, params, id }) => {
    assert.equal(method, 'eth_call');
    assert.equal(params[0].to, CONTRACT);
    const data = params[0].data;
    if (rpcError) return { jsonrpc: '2.0', id, error: { code: -32000, message: rpcError } };
    if (data === SELECTORS.nextTokenId) return { jsonrpc: '2.0', id, result: pad(next) };
    const token = byId.get(Number(BigInt('0x' + data.slice(10))));
    if (!token) return { jsonrpc: '2.0', id, error: { code: 3, message: 'execution reverted' } };
    if (data.startsWith(SELECTORS.ownerOf)) return { jsonrpc: '2.0', id, result: pad(token.to) };
    if (data.startsWith(SELECTORS.eventOf)) return { jsonrpc: '2.0', id, result: pad(token.eventId) };
    throw new Error('unexpected eth_call ' + data);
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const reply = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    if (url.host === 'api.thirdweb.com' && url.pathname === '/v1/contracts/write') {
      sent.writes++; sent.bodies.push(JSON.parse(init.body));
      return reply({ result: { transactionIds: ['tw-tx-2'] } });
    }
    if (url.host === 'api.thirdweb.com' && url.pathname.startsWith('/v1/transactions/')) {
      if (thirdwebDown) throw new DOMException('The operation timed out.', 'TimeoutError');
      return reply({ result: { status, errorMessage: status === 'FAILED' ? 'RECEIPT_QUERY_FAILED' : null } });
    }
    if (url.host === 'api.avax-test.network') {
      sent.chainReads++;
      const body = JSON.parse(init.body);
      return reply(Array.isArray(body) ? body.map(call) : call(body));
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

const order = DB => DB.raw.prepare('SELECT status, mint_tx_hash, review_reason FROM payment_orders WHERE id = ?').get('po1');
const tickets = DB => DB.raw.prepare('SELECT status, token_id, mint_tx_hash FROM tickets WHERE order_id = ? ORDER BY id').all('po1');

test('thirdweb stuck on a mint that landed: the ticket is read from the chain', async () => {
  const { DB, env } = setup({ age: 5 * MIN });
  const sent = mockNetwork({ status: 'SUBMITTED', minted: [[9, 4], [5, 3]] });
  await cron(env);
  assert.equal(order(DB).status, 'fulfilled');
  assert.deepEqual(tickets(DB).map(t => ({ ...t })), [{ status: 'active', token_id: 9, mint_tx_hash: null }]);
  assert.equal(sent.writes, 0);
});

test('a just-queued mint waits for thirdweb without reading the chain', async () => {
  const { DB, env } = setup({ age: 20000 });
  const sent = mockNetwork({ status: 'SUBMITTED', minted: [[9, 4]] });
  await cron(env);
  assert.equal(order(DB).status, 'paid');
  assert.equal(sent.chainReads, 0);
});

test('still pending and not on chain: waits, then goes to review after 30 min, never re-sent', async () => {
  let { DB, env } = setup({ age: 10 * MIN });
  let sent = mockNetwork({ status: 'SUBMITTED' });
  await cron(env);
  assert.equal(order(DB).status, 'paid');
  assert.equal(sent.writes, 0);

  ({ DB, env } = setup({ age: 31 * MIN }));
  sent = mockNetwork({ status: 'SUBMITTED' });
  await cron(env);
  assert.equal(order(DB).status, 'needs_review');
  assert.match(order(DB).review_reason, /not found on chain/);
  assert.equal(tickets(DB)[0].status, 'minting');
  assert.equal(sent.writes, 0);
});

test('thirdweb says FAILED but the mint is on chain: fulfilled, not minted again', async () => {
  const { DB, env } = setup({ age: 0 });
  const sent = mockNetwork({ status: 'FAILED', minted: [[9, 4]] });
  await cron(env);
  assert.equal(order(DB).status, 'fulfilled');
  assert.equal(sent.writes, 0);
});

test('FAILED and not on chain: freed for another attempt as before', async () => {
  const { DB, env } = setup({ age: 0 });
  const sent = mockNetwork({ status: 'FAILED', minted: [[9, 3]] }); // another event's ticket does not count
  await cron(env);
  const row = DB.raw.prepare('SELECT status, mint_tx_id, mint_error FROM payment_orders WHERE id = ?').get('po1');
  assert.equal(row.status, 'paid');
  assert.equal(row.mint_tx_id, null);
  assert.equal(row.mint_error, 'RECEIPT_QUERY_FAILED');
  assert.equal(sent.writes, 0);
});

test('a token another ticket already holds is not taken twice', async () => {
  const { DB, env } = setup({ age: 5 * MIN, quantity: 2 });
  DB.raw.prepare(`INSERT INTO payment_orders (id, user_id, stripe_session_id, event_id, zone, quantity, unit_amount, amount, status, expires_at)
    VALUES ('po0', 'u1', 'cs_0', 'standup', 'x', 1, 1, 1, 'fulfilled', 0)`).run();
  DB.raw.prepare(`INSERT INTO tickets (id, order_id, user_id, event_id, zone, face_price, owner_wallet, token_id, status)
    VALUES ('old', 'po0', 'u1', 'standup', 'x', 1, ?, 8, 'active')`).run(WALLET);
  mockNetwork({ status: 'SUBMITTED', minted: [[8, 4], [9, 4]] });
  await cron(env);
  assert.equal(order(DB).status, 'paid'); // only one unclaimed token for two tickets

  mockNetwork({ status: 'SUBMITTED', minted: [[8, 4], [9, 4], [11, 4]] });
  await cron(env);
  assert.equal(order(DB).status, 'fulfilled');
  assert.deepEqual(tickets(DB).map(t => t.token_id), [9, 11]);
});

test('thirdweb status lookup timing out still lets the chain check fulfil the order', async () => {
  const { DB, env } = setup({ age: 5 * MIN });
  mockNetwork({ status: 'SUBMITTED', thirdwebDown: true, minted: [[9, 4]] });
  await cron(env);
  assert.equal(order(DB).status, 'fulfilled');
});

test('an RPC error on the chain check is kept on the order and nothing else changes', async () => {
  const { DB, env } = setup({ age: 5 * MIN });
  const sent = mockNetwork({ status: 'SUBMITTED', rpcError: 'rate limited' });
  await cron(env);
  const row = DB.raw.prepare('SELECT status, mint_tx_id, mint_error FROM payment_orders WHERE id = ?').get('po1');
  assert.equal(row.status, 'paid');
  assert.equal(row.mint_tx_id, 'tw-tx-1');
  assert.match(row.mint_error, /chain check: .*rate limited/);
  assert.equal(sent.writes, 0);
});

test('with the mint guard set, each ticket is minted once by its order key', async () => {
  const GUARD = '0x' + '9'.repeat(40);
  for (const guard of [GUARD, undefined]) {
    const { DB, env } = setup({ age: 0, quantity: 2 });
    if (guard) env.MINT_GUARD_ADDRESS = guard;
    DB.raw.prepare(`UPDATE payment_orders SET mint_tx_id = NULL, mint_attempts = 0 WHERE id = 'po1'`).run();
    const sent = mockNetwork({ status: 'SUBMITTED' });
    await cron(env);
    const calls = sent.bodies[0].calls;
    if (guard) {
      assert.deepEqual(calls.map(c => c.contractAddress), [GUARD, GUARD]);
      assert.match(calls[0].method, /mintOnce\(address to, uint256 eventId, bytes32 ticketKey\)/);
      assert.deepEqual(calls.map(c => c.params), [0, 1].map(i => [WALLET, '4', toHex(keccak256('po1:' + i))]));
    } else {
      assert.deepEqual(calls.map(c => c.contractAddress), [CONTRACT, CONTRACT]);
      assert.deepEqual(calls[0].params, [WALLET, '4']);
    }
  }
});

test('ticket rows deleted from a paid order are put back and settled from the chain', async () => {
  const { DB, env } = setup({ age: 5 * MIN, quantity: 2 });
  DB.raw.prepare(`DELETE FROM tickets WHERE order_id = 'po1'`).run();
  // #10 went to someone else, #13 is another event's: only #11 and #12 are this order's.
  mockNetwork({ status: 'SUBMITTED', minted: [[10, 4, '0x' + '4'.repeat(40)], [11, 4], [12, 4], [13, 3]] });
  await cron(env);
  assert.equal(order(DB).status, 'fulfilled');
  assert.deepEqual(tickets(DB).map(t => t.token_id).sort(), [11, 12]);
});

test('tokens below the highest token of earlier orders are not read again', async () => {
  const { DB, env } = setup({ age: 5 * MIN });
  DB.raw.prepare(`INSERT INTO payment_orders (id, user_id, stripe_session_id, event_id, zone, quantity, unit_amount, amount, status, expires_at, paid_at)
    VALUES ('po0', 'u1', 'cs_0', 'standup', 'x', 1, 1, 1, 'fulfilled', 0, 1)`).run();
  DB.raw.prepare(`INSERT INTO tickets (id, order_id, user_id, event_id, zone, face_price, owner_wallet, token_id, status)
    VALUES ('old', 'po0', 'u1', 'standup', 'x', 1, ?, 8, 'active')`).run(WALLET);
  // #7 is an older stray mint to the same wallet; it sits below #8, so it is not this order's.
  mockNetwork({ status: 'SUBMITTED', minted: [[7, 4], [8, 4], [9, 4]] });
  await cron(env);
  assert.deepEqual(tickets(DB).map(t => t.token_id), [9]);
});
