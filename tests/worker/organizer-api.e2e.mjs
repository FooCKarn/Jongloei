// End-to-end check of the organizer API against a local Worker and a fresh local D1.
//   DIR=$(mktemp -d)
//   npx wrangler d1 migrations apply jongloei-db --local --persist-to $DIR
//   npx wrangler dev --local --persist-to $DIR --port 8788 &
//   node tests/worker/organizer-api.e2e.mjs $DIR
// It signs in by writing users and sessions straight into the local database.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const DIR = process.argv[2], B = 'http://localhost:8788';
if (!DIR) throw new Error('usage: node tests/worker/organizer-api.e2e.mjs <persist dir>');
const sql = q => JSON.parse(execSync(`npx wrangler d1 execute jongloei-db --local --persist-to ${DIR} --json --command ${JSON.stringify(q)}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString())[0].results;
for (const [id, role] of [['u-owner', 'guest'], ['u-mgr', 'guest'], ['u-gate', 'guest'], ['u-admin', 'admin'], ['u-buyer', 'guest'], ['u-other', 'guest']]) {
  const email = { 'u-owner': 'owner@shop.example', 'u-mgr': 'mgr@example.com', 'u-gate': 'gate@example.com' }[id] || id.slice(2) + '@example.com';
  const hash = createHash('sha256').update('tok-' + id).digest('hex');
  sql(`INSERT INTO users (id, display_name, email, role) VALUES ('${id}', '${id}', '${email}', '${role}'); INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ('s-${id}', '${id}', '${hash}', 9999999999999)`);
}
const call = async (who, method, path, body, retry = 2) => {
  const r = await fetch(B + path, { method, headers: { cookie: 'jl_session=tok-' + who, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined }).catch(e => { if (!retry) throw e; return null; });
  if (!r) { await new Promise(res => setTimeout(res, 500)); return call(who, method, path, body, retry - 1); }
  const j = await r.json(); return { s: r.status, ...j };
};
let fails = 0; const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : ' ' + JSON.stringify(x))); if (!c) fails++; };
const day = 86400000, now = Date.now();
const ev = { name: 'Friday Rooftop', venue: 'Rooftop 88', category: 'ปาร์ตี้', startsAt: now + 7 * day, endsAt: now + 7 * day + 4 * 3600000,
  zones: [{ name: 'Standing', price: 500, capacity: 10 }, { name: 'VIP', price: 1200, capacity: 5, color: '#A00018' }] };

let r = await call('u-owner', 'GET', '/api/org/events'); ok(r.s === 403 && r.error === 'no_shop', 'no shop yet -> 403', r);
r = await call('nobody', 'GET', '/api/org/me'); ok(r.s === 401, 'no session -> 401', r);
r = await fetch(B + '/api/org/shop', { method: 'POST', headers: { cookie: 'jl_session=tok-u-owner' }, body: 'name=x' }); ok(r.status === 415, 'form post (CSRF) -> 415', r.status);
r = await call('u-owner', 'POST', '/api/org/shop', { name: '<b>x</b>' }); ok(r.s === 400 && r.fields.name === 'unsafe_characters', 'shop name with markup refused', r);
r = await call('u-owner', 'POST', '/api/org/shop', { name: 'Rooftop 88', type: 'bar', phone: '0812345678' }); ok(r.s === 201 && r.role === 'owner' && r.shop.verification === 'pending', 'shop created', r);
ok(sql("SELECT role FROM users WHERE id='u-owner'")[0].role === 'host', 'owner role -> host');
r = await call('u-owner', 'POST', '/api/org/shop', { name: 'Again' }); ok(r.s === 409, 'second shop refused', r);

r = await call('u-owner', 'POST', '/api/org/events', { ...ev, name: 'Bad"name' }); ok(r.s === 400 && r.fields.name, 'event name with quote refused', r);
r = await call('u-owner', 'POST', '/api/org/events', { ...ev, startsAt: now - 1000 }); ok(r.s === 400 && r.fields.startsAt === 'in_past', 'past start refused', r);
r = await call('u-owner', 'POST', '/api/org/events', { ...ev, zones: [{ name: 'A', price: 5, capacity: 1 }, { name: 'a', price: 100, capacity: 0 }] }); ok(r.s === 400 && r.fields['zones.0.price'] && r.fields['zones.1.name'] === 'duplicate' && r.fields['zones.1.capacity'], 'zone rules', r);
r = await call('u-owner', 'POST', '/api/org/events', { ...ev, zones: [{ name: 'A', price: 100, capacity: 1, color: 'red;background:url(x)' }] }); ok(r.s === 400 && r.fields['zones.0.color'], 'css in color refused', r);
r = await call('u-owner', 'POST', '/api/org/events', ev); ok(r.s === 201 && /^ev-[0-9a-f]{12}$/.test(r.event.id) && r.event.status === 'draft' && r.event.chainEventId == null, 'draft created', r);
const id = r.event.id; const [zs, zv] = r.event.zones;
ok(zs.remaining === 10 && zs.capacity === 10 && r.event.date.includes('25'), 'remaining = capacity, thai date ' + r.event.date, r.event);

r = await call('u-owner', 'POST', `/api/org/events/${id}/publish`, {}); ok(r.s === 403 && r.error === 'shop_not_verified', 'unverified cannot publish', r);
r = await call('u-owner', 'POST', '/api/admin/hosts/verify', { userId: 'u-owner', status: 'verified' }); ok(r.s === 403, 'non-admin cannot verify', r);
r = await call('u-admin', 'POST', '/api/admin/hosts/verify', { userId: 'u-owner', status: 'verified' }); ok(r.s === 409 && r.error === 'no_document', 'no document -> cannot verify', r);
r = await call('u-owner', 'PUT', '/api/org/shop/document', { name: 'id.pdf', mime: 'application/pdf', data: Buffer.from('%PDF-1.4 demo').toString('base64') }); ok(r.s === 200 && r.shop.document.name === 'id.pdf', 'document uploaded', r);
r = await fetch(B + '/api/admin/hosts/u-owner/document', { headers: { cookie: 'jl_session=tok-u-admin' } }); ok(r.status === 200 && (await r.text()) === '%PDF-1.4 demo', 'admin reads the document back', r.status);
r = await call('u-admin', 'GET', '/api/admin/hosts'); ok(r.s === 200 && r.hosts.some(h => h.id === 'u-owner' && h.document.size === 13), 'shop in the review queue', r);
r = await call('u-admin', 'POST', '/api/admin/hosts/verify', { userId: 'u-owner', status: 'verified' }); ok(r.s === 200, 'admin verifies', r);

// team
r = await call('u-owner', 'POST', '/api/org/team', { email: 'MGR@example.com', role: 'manager' }); ok(r.s === 201, 'manager added', r);
r = await call('u-owner', 'POST', '/api/org/team', { email: 'gate@example.com', role: 'gate' }); ok(r.s === 201 && r.team.length === 3, 'gate added', r);
r = await call('u-owner', 'POST', '/api/org/team', { email: 'owner@shop.example', role: 'gate' }); ok(r.s === 409, 'owner cannot be own member', r);
r = await call('u-mgr', 'GET', '/api/org/team'); ok(r.s === 403, 'manager cannot see team', r);
r = await call('u-gate', 'GET', '/api/org/events'); ok(r.s === 200 && r.events.length === 1, 'gate can list events', r);
r = await call('u-gate', 'PATCH', `/api/org/events/${id}`, { name: 'Hacked' }); ok(r.s === 403, 'gate cannot edit', r);
r = await call('u-other', 'GET', `/api/org/events/${id}`); ok(r.s === 403, 'stranger cannot read', r);
r = await call('u-other', 'POST', '/api/org/shop', { name: 'Other Shop' }); ok(r.s === 201, 'other shop');
r = await call('u-other', 'GET', `/api/org/events/${id}`); ok(r.s === 404, "other shop cannot see this shop's event", r);
r = await call('u-other', 'PATCH', `/api/org/events/${id}`, { name: 'Hacked' }); ok(r.s === 404, "other shop cannot edit", r);

// draft edit replaces zones
r = await call('u-mgr', 'PATCH', `/api/org/events/${id}`, { zones: [{ name: 'Standing', price: 600, capacity: 12 }, { name: 'VIP', price: 1200, capacity: 5 }] });
ok(r.s === 200 && r.event.zones[0].price === 600 && r.event.zones[0].remaining === 12 && r.event.short === 'FRIDAY\nROOFTOP', 'manager edits draft', r);

r = await call('u-mgr', 'POST', `/api/org/events/${id}/publish`, {}); ok(r.s === 200 && r.event.status === 'on_sale' && r.event.chainEventId === 5, 'published, chain id 5', r);
r = await call('u-mgr', 'POST', `/api/org/events/${id}/publish`, {}); ok(r.s === 409, 'publish twice refused', r);
let list = await (await fetch(B + '/api/events').catch(() => new Promise(res => setTimeout(res, 500)).then(() => fetch(B + '/api/events')))).json(); let pub = list.find(e => e.id === id);
ok(pub && pub.zones[0].left === 12 && pub.sold === 0, 'visible in /api/events', pub);

// simulate orders in the Standing zone: 3 sold (paid, remaining reduced) + 2 held
const Z = r.event?.zones?.[0] || (await call('u-owner', 'GET', `/api/org/events/${id}`)).event.zones[0];
sql(`INSERT INTO payment_orders (id,user_id,event_id,zone,quantity,unit_amount,amount,status,expires_at) VALUES ('o1','u-buyer','${id}','Standing',3,61800,185400,'fulfilled',0),('o2','u-buyer','${id}','Standing',2,61800,123600,'pending',${now + 600000})`);
sql(`UPDATE event_zones SET remaining = remaining - 3 WHERE id='${Z.id}'`);
r = await call('u-owner', 'GET', `/api/org/events/${id}`); let z0 = r.event.zones[0];
ok(z0.sold === 3 && z0.held === 2 && z0.available === 7 && z0.locked.name && z0.locked.price, 'zone counts and locks', z0);
list = await (await fetch(B + '/api/events').catch(() => new Promise(res => setTimeout(res, 500)).then(() => fetch(B + '/api/events')))).json(); pub = list.find(e => e.id === id);
ok(pub.zones[0].left === 7 && pub.sold === 29, 'buyer list: left 7, sold% 29', pub);

const zonesNow = r.event.zones.map(z => ({ id: z.id, name: z.name, price: z.price, capacity: z.capacity, color: z.color }));
r = await call('u-owner', 'PATCH', `/api/org/events/${id}`, { zones: [{ ...zonesNow[0], price: 700 }, zonesNow[1]] }); ok(r.s === 409 && r.fields['zones.0.price'] === 'locked_by_orders', 'price locked', r);
r = await call('u-owner', 'PATCH', `/api/org/events/${id}`, { zones: [{ ...zonesNow[0], name: 'GA' }, zonesNow[1]] }); ok(r.s === 409 && r.fields['zones.0.name'] === 'locked_by_orders', 'rename locked', r);
r = await call('u-owner', 'PATCH', `/api/org/events/${id}`, { zones: [{ ...zonesNow[0], capacity: 4 }, zonesNow[1]] }); ok(r.s === 409 && r.fields['zones.0.capacity'] === 'below_taken:5', 'cannot shrink below sold+held', r);
r = await call('u-owner', 'PATCH', `/api/org/events/${id}`, { zones: [{ ...zonesNow[0], capacity: 5 }, { ...zonesNow[1], price: 1500, name: 'VIP Front' }, { name: 'Late', price: 300, capacity: 20 }] });
z0 = r.event?.zones?.[0];
ok(r.s === 200 && z0.capacity === 5 && z0.remaining === 2 && z0.available === 0 && r.event.zones[1].price === 1500 && r.event.zones[2].remaining === 20, 'shrink to 5, unlocked zone edited, zone added', r);
r = await call('u-owner', 'PATCH', `/api/org/events/${id}`, { zones: [{ ...zonesNow[0], capacity: 5, id: 'nope' }] }); ok(r.s === 409 && r.fields['zones.0.id'] === 'unknown_zone', 'unknown zone id', r);
r = await call('u-owner', 'PATCH', `/api/org/events/neon`, { name: 'x' }); ok(r.s === 404, 'seeded platform event not reachable', r);
r = await call('u-mgr', 'GET', `/api/org/events/${id}/orders`); ok(r.s === 200 && r.orders.length === 2 && r.orders[0].email === 'bu***@example.com', 'orders with masked email', r);

r = await call('u-mgr', 'POST', `/api/org/events/${id}/cancel`, { reason: 'ฝนตก', confirmName: 'Friday Rooftop' }); ok(r.s === 403, 'manager cannot cancel', r);
r = await call('u-owner', 'POST', `/api/org/events/${id}/cancel`, { reason: 'ฝนตก', confirmName: 'wrong' }); ok(r.s === 400, 'cancel needs the event name', r);
r = await call('u-owner', 'POST', `/api/org/events/${id}/cancel`, { reason: 'ฝนตก', confirmName: 'Friday Rooftop' });
ok(r.s === 200 && r.event.status === 'cancelled' && r.heldReleased === 1 && r.toRefund.orders === 1 && r.toRefund.amountSatang === 185400, 'cancelled, hold released, refund listed', r);
await new Promise(res => setTimeout(res, 500));
ok(sql("SELECT status FROM payment_orders WHERE id='o2'")[0].status === 'expired', 'pending order expired');
list = await (await fetch(B + '/api/events').catch(() => new Promise(res => setTimeout(res, 500)).then(() => fetch(B + '/api/events')))).json(); ok(!list.some(e => e.id === id), 'cancelled event gone from buyer list');
r = await call('u-owner', 'PATCH', `/api/org/events/${id}`, { name: 'Back' }); ok(r.s === 409 && r.error === 'event_closed', 'cancelled event cannot be edited', r);

// second publish gets 6
r = await call('u-owner', 'POST', '/api/org/events', { ...ev, name: 'Second Night' }); const id2 = r.event.id;
r = await call('u-owner', 'POST', `/api/org/events/${id2}/publish`, {}); ok(r.event.chainEventId === 6, 'next chain id 6', r);
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
