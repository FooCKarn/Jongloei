// Shop verification: the owner uploads a document, an admin reviews it and verifies or rejects.
// Runs through the Worker on the in-memory D1 (d1-shim.mjs, Node 22). Run: node --test tests/worker/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import worker from '../../src/worker.js';
import { validateDocument, DOC_MAX_BYTES } from '../../src/organizer.js';
import { makeD1 } from './d1-shim.mjs';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const PDF = Buffer.from('%PDF-1.4\n%demo\n');
const b64 = buf => Buffer.from(buf).toString('base64');

test('documents: type must match the bytes, size is capped, names are cleaned', () => {
  assert.ok(validateDocument({ name: 'id.png', mime: 'image/png', data: b64(PNG) }).value);
  assert.ok(validateDocument({ name: 'cert.pdf', mime: 'application/pdf', data: b64(PDF) }).value);
  assert.equal(validateDocument({ name: 'x.png', mime: 'image/png', data: b64(PDF) }).errors.data, 'type_mismatch');
  assert.equal(validateDocument({ name: 'x.html', mime: 'text/html', data: b64('<b>') }).errors.mime, 'invalid');
  assert.equal(validateDocument({ name: 'x.pdf', mime: 'application/pdf', data: '***' }).errors.data, 'invalid');
  const big = Buffer.concat([PDF, Buffer.alloc(DOC_MAX_BYTES)]);
  assert.equal(validateDocument({ name: 'x.pdf', mime: 'application/pdf', data: b64(big) }).errors.data, 'too_large');
  assert.equal(validateDocument({ name: '<img>"a.pdf', mime: 'application/pdf', data: b64(PDF) }).value.name, '_img__a.pdf');
});

function setup() {
  const DB = makeD1();
  const env = { DB };
  for (const [id, role] of [['owner', 'guest'], ['admin', 'admin'], ['mgr', 'guest']]) {
    DB.raw.prepare('INSERT INTO users (id, display_name, email, role) VALUES (?, ?, ?, ?)').run(id, id, id + '@example.com', role);
    DB.raw.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
      .run('s-' + id, id, createHash('sha256').update('tok-' + id).digest('hex'), Date.now() + 86400000);
  }
  const raw = (who, method, path, body) => worker.fetch(new Request('https://jongloei.test' + path, {
    method, headers: { cookie: 'jl_session=tok-' + who, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }), env, { waitUntil() {} });
  const call = async (who, method, path, body) => { const r = await raw(who, method, path, body); return { s: r.status, ...(await r.json()) }; };
  return { DB, call, raw };
}

test('owner uploads, admin sees the queue, opens the file and verifies', async () => {
  const { call, raw } = setup();
  let r = await call('owner', 'POST', '/api/org/shop', { name: 'Rooftop 88', phone: '0812345678' });
  assert.equal(r.s, 201); assert.equal(r.shop.document, null);
  r = await call('owner', 'GET', '/api/org/me'); assert.equal(r.admin, false);
  assert.equal((await call('admin', 'GET', '/api/org/me')).admin, true);

  r = await call('admin', 'POST', '/api/admin/hosts/verify', { userId: 'owner', status: 'verified' });
  assert.equal(r.s, 409); assert.equal(r.error, 'no_document');

  await call('owner', 'POST', '/api/org/team', { email: 'mgr@example.com', role: 'manager' });
  r = await call('mgr', 'PUT', '/api/org/shop/document', { name: 'id.png', mime: 'image/png', data: b64(PNG) });
  assert.equal(r.s, 403, 'only the owner uploads');
  r = await call('owner', 'PUT', '/api/org/shop/document', { name: 'id.png', mime: 'image/png', data: b64(PNG) });
  assert.equal(r.s, 200);
  assert.deepEqual({ ...r.shop.document, uploadedAt: 0 }, { name: 'id.png', mime: 'image/png', size: PNG.length, uploadedAt: 0 });

  assert.equal((await call('owner', 'GET', '/api/admin/hosts')).s, 403);
  r = await call('admin', 'GET', '/api/admin/hosts');
  assert.equal(r.hosts.length, 1);
  assert.equal(r.hosts[0].ownerEmail, 'owner@example.com');
  assert.equal(r.hosts[0].document.name, 'id.png');

  assert.equal((await raw('owner', 'GET', '/api/admin/hosts/owner/document')).status, 403);
  const file = await raw('admin', 'GET', '/api/admin/hosts/owner/document');
  assert.equal(file.headers.get('content-type'), 'image/png');
  assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), PNG);

  r = await call('admin', 'POST', '/api/admin/hosts/verify', { userId: 'owner', status: 'verified' });
  assert.equal(r.s, 200);
  assert.equal((await call('admin', 'GET', '/api/admin/hosts')).hosts.length, 0, 'queue is empty');
  assert.equal((await call('admin', 'GET', '/api/admin/hosts?status=verified')).hosts.length, 1);
  r = await call('owner', 'PUT', '/api/org/shop/document', { name: 'id.png', mime: 'image/png', data: b64(PNG) });
  assert.equal(r.s, 409, 'a verified shop keeps its document');
});

test('a rejected shop goes back into the queue with a new document', async () => {
  const { call } = setup();
  await call('owner', 'POST', '/api/org/shop', { name: 'Rooftop 88' });
  await call('owner', 'PUT', '/api/org/shop/document', { name: 'blurry.pdf', mime: 'application/pdf', data: b64(PDF) });
  let r = await call('admin', 'POST', '/api/admin/hosts/verify', { userId: 'owner', status: 'rejected', note: 'รูปไม่ชัด' });
  assert.equal(r.s, 200);
  r = await call('owner', 'GET', '/api/org/me');
  assert.equal(r.shop.verification, 'rejected'); assert.equal(r.shop.verificationNote, 'รูปไม่ชัด');
  r = await call('owner', 'PUT', '/api/org/shop/document', { name: 'clear.pdf', mime: 'application/pdf', data: b64(PDF) });
  assert.equal(r.shop.verification, 'pending'); assert.equal(r.shop.verificationNote, null); assert.equal(r.shop.document.name, 'clear.pdf');
  assert.equal((await call('admin', 'GET', '/api/admin/hosts')).hosts[0].document.name, 'clear.pdf');
});
