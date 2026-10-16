// End-to-end check of the entry QR and door check-in against a local Worker, a fresh local D1,
// and a mock of thirdweb + the Fuji RPC (started by this script on port 8790; the mock signs
// with real secp256k1 keys, so the Worker's signature check runs for real).
//   DIR=$(mktemp -d)
//   npx wrangler d1 migrations apply jongloei-db --local --persist-to $DIR
//   npx wrangler dev --local --persist-to $DIR --port 8788 \
//     --var THIRDWEB_SECRET_KEY:test --var THIRDWEB_API_URL:http://127.0.0.1:8790 \
//     --var FUJI_RPC_URL:http://127.0.0.1:8790/rpc --var MARK_USED_POLL_MS:100 &
//   node tests/worker/checkin-api.e2e.mjs $DIR
import { execSync } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { createServer } from 'node:http';
import { keccak256, toHex, fromHex, recoverAddress, entryPassDigest } from '../../src/evm.js';

const DIR = process.argv[2], B = 'http://localhost:8788';
if (!DIR) throw new Error('usage: node tests/worker/checkin-api.e2e.mjs <persist dir>');
const sql = q => JSON.parse(execSync(`npx wrangler d1 execute jongloei-db --local --persist-to ${DIR} --json --command ${JSON.stringify(q)}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString())[0].results;
let fails = 0; const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : ' ' + JSON.stringify(x))); if (!c) fails++; };

/* ---------- mock thirdweb + RPC ---------- */
const keys = new Map(); // address -> private key
function newWallet() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const xy = new Uint8Array([...Buffer.from(jwk.x, 'base64url'), ...Buffer.from(jwk.y, 'base64url')]);
  const address = toHex(keccak256(xy).slice(12));
  keys.set(address, privateKey);
  return address;
}
const contract = '0xef36fcbdED316dEd4367636a6c85d73bFD5e2735';
const chain = { owner: {}, used: {}, eventOf: {} }; // by token id
const writes = []; let signFails = false;
const server = createServer(async (req, res) => {
  let body = ''; for await (const c of req) body += c;
  const send = (s, j) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(j)); };
  if (req.url === '/v1/wallets/sign-typed-data') {
    const b = JSON.parse(body);
    const key = keys.get(b.from);
    if (!key || signFails) return send(400, { error: 'unknown wallet' });
    const digest = entryPassDigest(b.message.tokenId, b.message.ts, b.chainId, b.domain.verifyingContract);
    const rs = signDigest(key, digest);
    for (const v of [27, 28]) {
      const sig = toHex(new Uint8Array([...rs, v]));
      if (recoverAddress(digest, sig) === b.from) return send(200, { result: { signature: sig } });
    }
    return send(500, { error: 'sign failed' });
  }
  if (req.url === '/v1/contracts/write') {
    const b = JSON.parse(body); writes.push(b);
    const tokenId = b.calls[0].params[0];
    chain.used[tokenId] = true;
    return send(200, { result: { transactionIds: ['tx-' + writes.length] } });
  }
  if (req.url.startsWith('/v1/transactions/')) return send(200, { result: { status: 'CONFIRMED', transactionHash: '0x' + 'ab'.repeat(32) } });
  if (req.url === '/rpc') {
    if (chain.down) return send(503, {});
    const calls = JSON.parse(body);
    return send(200, calls.map(c => {
      const data = c.params[0].data, tokenId = String(BigInt('0x' + data.slice(10)));
      const word = v => '0x' + BigInt(v).toString(16).padStart(64, '0');
      if (data.startsWith('0x6352211e')) {
        return chain.owner[tokenId] ? { id: c.id, result: word(chain.owner[tokenId]) } : { id: c.id, error: { code: 3, message: 'execution reverted' } };
      }
      if (data.startsWith('0x020fe6e5')) return { id: c.id, result: word(chain.used[tokenId] ? 1 : 0) };
      return { id: c.id, result: word(chain.eventOf[tokenId] || 0) };
    }));
  }
  send(404, {});
});
// node:crypto cannot sign a prehashed digest with ECDSA, so the mock does it with BigInt
// (RFC 6979 is not needed for a test: k comes from the CSPRNG).
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const Pp = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const Gp = [0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n, 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n];
const md = (a, m) => ((a % m) + m) % m;
const inv = (a, m) => { let [x, y, u, v] = [0n, 1n, m, md(a, m)]; while (v) { const q = u / v; [x, y] = [y, x - q * y]; [u, v] = [v, u - q * v]; } return md(x, m); };
const padd = (p, q) => { if (!p) return q; if (!q) return p; if (p[0] === q[0] && p[1] !== q[1]) return null;
  const l = p[0] === q[0] ? md(3n * p[0] * p[0] * inv(2n * p[1], Pp), Pp) : md((q[1] - p[1]) * inv(q[0] - p[0], Pp), Pp);
  const x = md(l * l - p[0] - q[0], Pp); return [x, md(l * (p[0] - x) - p[1], Pp)]; };
const pmul = (k, p) => { let r = null; for (; k; k >>= 1n, p = padd(p, p)) if (k & 1n) r = padd(r, p); return r; };
function signDigest(key, digest) {
  const d = BigInt('0x' + Buffer.from(key.export({ format: 'jwk' }).d, 'base64url').toString('hex'));
  const e = BigInt(toHex(digest));
  for (;;) {
    const k = md(BigInt(toHex(crypto.getRandomValues(new Uint8Array(32)))), N); if (!k) continue;
    const r = md(pmul(k, Gp)[0], N); if (!r) continue;
    const s = md(inv(k, N) * (e + r * d), N); if (!s) continue;
    return fromHex(r.toString(16).padStart(64, '0') + s.toString(16).padStart(64, '0'));
  }
}
await new Promise(r => server.listen(8790, '127.0.0.1', r));

/* ---------- seed ---------- */
const buyerWallet = newWallet(), resoldTo = newWallet();
const users = [['u-owner', 'owner@shop.example', 'host'], ['u-gate', 'gate@example.com', 'guest'], ['u-buyer', 'buyer@example.com', 'guest'],
  ['u-other', 'other@example.com', 'guest'], ['u-admin', 'admin@example.com', 'admin'], ['u-new', 'new@example.com', 'guest']];
const seed = [];
for (const [id, email, role] of users) {
  const hash = createHash('sha256').update('tok-' + id).digest('hex');
  seed.push(`INSERT INTO users (id, display_name, email, role) VALUES ('${id}', '${id}', '${email}', '${role}')`,
    `INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ('s-${id}', '${id}', '${hash}', 9999999999999)`);
}
const now = Date.now();
seed.push(`INSERT INTO host_profiles (user_id, shop_name, verification_status) VALUES ('u-owner', 'Rooftop 88', 'verified')`,
  `INSERT INTO host_members (host_id, email, role) VALUES ('u-owner', 'gate@example.com', 'gate')`,
  `INSERT INTO events (id, host_id, name, short_name, category, event_date, event_time, venue, poster_background, status, chain_event_id, starts_at, ends_at)
   VALUES ('ev-aaaaaaaaaaaa', 'u-owner', 'Friday Rooftop', 'FRI', 'party', 'x', 'y', 'Rooftop 88', 'red', 'on_sale', 5, ${now}, ${now + 4 * 3600000}),
          ('ev-bbbbbbbbbbbb', 'u-owner', 'Other Night', 'OTH', 'party', 'x', 'y', 'Rooftop 88', 'red', 'on_sale', 6, ${now}, ${now + 4 * 3600000})`,
  `INSERT INTO payment_orders (id, user_id, event_id, zone, quantity, unit_amount, amount, status, expires_at) VALUES
   ('o1', 'u-buyer', 'ev-aaaaaaaaaaaa', 'GA', 4, 100, 400, 'fulfilled', 0), ('o2', 'u-buyer', 'ev-bbbbbbbbbbbb', 'GA', 1, 100, 100, 'fulfilled', 0)`);
const T = (id, order, ev, token, status = 'active', wallet = buyerWallet) =>
  `INSERT INTO tickets (id, order_id, user_id, event_id, zone, face_price, owner_wallet, token_id, status) VALUES ('${id}', '${order}', 'u-buyer', '${ev}', 'GA', 100, '${wallet}', ${token}, '${status}')`;
const tid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
seed.push(T(tid(1), 'o1', 'ev-aaaaaaaaaaaa', 101), T(tid(2), 'o1', 'ev-aaaaaaaaaaaa', 102), T(tid(3), 'o1', 'ev-aaaaaaaaaaaa', 103, 'listed'),
  T(tid(4), 'o1', 'ev-aaaaaaaaaaaa', 104), T(tid(5), 'o2', 'ev-bbbbbbbbbbbb', 105));
sql(seed.join("; ").replace(/\s+/g, " "));
for (const t of [101, 102, 103, 104]) { chain.owner[t] = buyerWallet; chain.eventOf[t] = 5; }
chain.owner[105] = buyerWallet; chain.eventOf[105] = 6;

const call = async (who, method, path, body) => {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(B + path, { method, headers: { cookie: 'jl_session=tok-' + who, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
      return { s: r.status, ...(await r.json()) };
    } catch (e) { if (i > 2) throw e; await new Promise(r => setTimeout(r, 500)); }
  }
};
const qr = async n => (await call('u-buyer', 'GET', `/api/tickets/${tid(n)}/qr`));
const scan = (who, code, ev = 'ev-aaaaaaaaaaaa') => call(who, 'POST', `/api/checkin/events/${ev}/scan`, { code });

/* ---------- buyer side: the code ---------- */
let r = await qr(1);
ok(r.s === 200 && /^JL1\.101\.\d+\./.test(r.code) && r.expiresAt - r.ts * 1000 === 60000, 'owner gets a signed code', r);
const code1 = r.code;
r = await call('u-other', 'GET', `/api/tickets/${tid(1)}/qr`); ok(r.s === 404, "someone else's ticket -> 404", r);
r = await qr(3); ok(r.s === 409 && r.error === 'ticket_listed', 'listed ticket has no code', r);
signFails = true; r = await qr(2); ok(r.s === 502 && r.error === 'signing_failed', 'thirdweb error -> 502', r); signFails = false;

/* ---------- door side ---------- */
r = await call('u-other', 'GET', '/api/checkin/events'); ok(r.s === 200 && r.events.length === 0, 'stranger sees no events', r);
r = await call('u-gate', 'GET', '/api/checkin/events'); ok(r.s === 200 && r.events.length === 2 && r.events[0].total === 4, 'gate sees the shop events', r);
r = await scan('u-other', code1); ok(r.s === 404, 'stranger cannot scan', r);
r = await scan('u-buyer', code1); ok(r.s === 404, 'buyer cannot scan', r);

r = await scan('u-gate', 'hello'); ok(r.s === 200 && !r.valid && r.reason === 'malformed', 'garbage -> malformed', r);
r = await scan('u-gate', code1, 'ev-bbbbbbbbbbbb'); ok(!r.valid && r.reason === 'wrong_event' && r.ticket === null, 'other event -> wrong_event, ticket not named', r);
const [, , ts, sig] = code1.split('.');
r = await scan('u-gate', `JL1.102.${ts}.${sig}`); ok(!r.valid && r.reason === 'bad_signature', 'signature moved to another token -> bad_signature', r);
r = await scan('u-gate', `JL1.101.${Number(ts) - 61}.${sig}`); ok(!r.valid && r.reason === 'expired', 'old ts -> expired', r);
r = await scan('u-gate', `JL1.101.${Number(ts) + 100}.${sig}`); ok(!r.valid && r.reason === 'future', 'future ts -> future', r);
chain.down = true; r = await scan('u-gate', code1); ok(!r.valid && r.reason === 'chain_unavailable', 'RPC down -> chain_unavailable, not let in', r); chain.down = false;
chain.owner[101] = resoldTo; r = await scan('u-gate', code1); ok(!r.valid && r.reason === 'chain_mismatch', 'chain owner differs -> chain_mismatch', r); chain.owner[101] = buyerWallet;

r = await scan('u-gate', code1);
ok(r.valid && r.reason === null && r.ticket.tokenId === 101 && r.ticket.holder === 'u-buyer', 'valid scan', r);
const both = await Promise.all([scan('u-gate', code1), scan('u-owner', code1)]);
ok(both.every(x => !x.valid && x.reason === 'already_used' && x.ticket.usedAt), 'same QR again (two doors) -> already_used with time', both);
r = await qr(1); ok(r.s === 409 && r.error === 'ticket_used', 'used ticket has no new code', r);

// two doors scan one fresh code at the same moment: exactly one gets in
const code2 = (await qr(2)).code;
const race = await Promise.all([scan('u-gate', code2), scan('u-owner', code2), scan('u-admin', code2)]);
ok(race.filter(x => x.valid).length === 1 && race.filter(x => x.reason === 'already_used').length === 2, 'race: one valid, two already_used', race);

// markUsed was sent once per used ticket and confirmed
await new Promise(res => setTimeout(res, 1500));
const rows = sql(`SELECT token_id, status, used_by, mark_used_tx_id, mark_used_tx_hash, mark_used_attempts FROM tickets WHERE token_id IN (101, 102) ORDER BY token_id`);
ok(rows.every(t => t.status === 'used' && t.mark_used_tx_hash && t.mark_used_attempts === 1), 'D1: used, markUsed confirmed once', rows);
ok(rows[0].used_by === 'u-gate', 'used_by is the scanner', rows[0]);
ok(writes.length === 2 && writes.every(w => w.calls[0].method === 'function markUsed(uint256 tokenId)'), 'two markUsed writes', writes);

// ticket used on chain but active in D1 (e.g. scanned before a restore) -> already_used
const code4 = (await qr(4)).code; chain.used[104] = true;
r = await scan('u-gate', code4); ok(!r.valid && r.reason === 'already_used', 'used on chain -> already_used', r); chain.used[104] = false;

// admin can scan any event; the scan log and counts
r = await call('u-admin', 'GET', '/api/checkin/events'); ok(r.s === 200 && r.events.some(e => e.id === 'neon'), 'admin sees platform events', r);
r = await call('u-gate', 'GET', '/api/checkin/events/ev-aaaaaaaaaaaa');
ok(r.s === 200 && r.used === 2 && r.total === 4 && r.scans.length === 13 && r.scans.filter(s => s.valid).length === 2, 'counts and scan log', { used: r.used, total: r.total, n: r.scans?.length });

// cancelled event: no code, no entry
sql(`UPDATE events SET cancelled_at = ${Date.now()}, status = 'closed' WHERE id = 'ev-aaaaaaaaaaaa'`);
r = await qr(4); ok(r.s === 409 && r.error === 'event_cancelled', 'cancelled event -> no code', r);
r = await scan('u-admin', code4); ok(!r.valid && r.reason === 'event_cancelled', 'cancelled event -> refused at the door', r);

server.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
