// Organizer API (B6): a shop creates, edits, publishes and cancels its own events.
//
// Every route checks the signed-in user's shop role here on the server; the mock-up's
// organizer screens are not trusted for anything.
//   GET    /api/org/me                     -> { user, shop, role }
//   POST   /api/org/shop                   -> open a shop (the caller becomes its owner)
//   PATCH  /api/org/shop                   owner: edit shop details
//   GET    /api/org/team                   owner: team list
//   POST   /api/org/team                   owner: add { email, role: manager | gate }
//   DELETE /api/org/team?email=            owner: remove a member
//   GET    /api/org/events                 any role: the shop's events with zone counts
//   POST   /api/org/events                 owner, manager: create a draft
//   GET    /api/org/events/:id             any role
//   PATCH  /api/org/events/:id             owner, manager: edit (rules below)
//   POST   /api/org/events/:id/publish     owner, manager: verified shops only; gives chain_event_id
//   POST   /api/org/events/:id/cancel      owner: stop sales, release seat holds
//   GET    /api/org/events/:id/orders      owner, manager: orders with masked e-mails
//   PUT    /api/org/shop/document          owner: { name, mime, data (base64) } ID card / company certificate
//   GET    /api/admin/hosts?status=        admin: review queue (pending by default, or verified | rejected | all)
//   GET    /api/admin/hosts/:id/document   admin: the uploaded file
//   POST   /api/admin/hosts/verify         admin: { userId, status: verified | rejected, note }; verifying needs a document
//
// Compatibility with the paid flow (0004/0005, src/worker.js):
//   * Event ids start with "ev-". The mock-up treats "org-" ids as its own local demo events.
//   * Zone prices are whole baht, as checkout computes unit_amount from event_zones.price.
//   * payment_orders and tickets point at a zone by its name, and mintOrder reads the face
//     price from event_zones. So a zone with any order keeps its name, a zone with live orders
//     keeps its price, and zones are never deleted once the event has been on sale.
//   * remaining still means "not sold yet". A capacity change moves remaining by the same
//     amount and may not push it below the seats held by pending orders.

export const POSTERS = [
  'linear-gradient(140deg,#A00018,#4A0010 70%,#1E0508)', 'linear-gradient(160deg,#C2412D,#7E0013 60%,#2B0A0E)',
  'linear-gradient(150deg,#D6455A,#A00018 45%,#3D0710)', 'linear-gradient(130deg,#8A1020,#2A0A0D)',
  'linear-gradient(150deg,#2B4C7E,#1B2A4A 60%,#0D1424)', 'linear-gradient(140deg,#B86B12,#7A3D08 60%,#2A1404)',
];
export const ZONE_COLORS = ['#E8485A', '#A00018', '#4A0010', '#B86B12', '#2B4C7E', '#1D7A48'];
export const LIMITS = { zones: 10, minPrice: 20, maxPrice: 100000, maxCapacity: 100000 };
const ACTIVE_ORDER = `('pending', 'paid', 'fulfilled', 'needs_review')`;
const HELD = `(SELECT COALESCE(SUM(o.quantity), 0) FROM payment_orders o
  WHERE o.event_id = event_zones.event_id AND o.zone = event_zones.zone_name AND o.status = 'pending')`;
const ROLES = { view: ['owner', 'manager', 'gate'], edit: ['owner', 'manager'], owner: ['owner'] };

/* ---------- validation (pure, tested in tests/worker) ---------- */

// Buyer screens put these strings into HTML, so markup and quote characters are refused here.
const UNSAFE_LINE = /[<>"'`\u0000-\u001f\u007f]/;
const UNSAFE_TEXT = /[<>"'`\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function text(v, { min = 0, max, multiline = false }) {
  if (v == null) v = '';
  if (typeof v !== 'string') return { error: 'invalid' };
  const s = v.trim();
  if (s.length < min) return { error: min ? 'required' : 'invalid' };
  if (s.length > max) return { error: 'too_long' };
  if ((multiline ? UNSAFE_TEXT : UNSAFE_LINE).test(s)) return { error: 'unsafe_characters' };
  return { value: s };
}

const isInt = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;

export function validateZones(zones) {
  const errors = {};
  if (!Array.isArray(zones) || !zones.length) return { errors: { zones: 'required' }, value: [] };
  if (zones.length > LIMITS.zones) return { errors: { zones: 'too_many' }, value: [] };
  const seen = new Set();
  const value = zones.map((z, i) => {
    const name = text(z?.name, { min: 1, max: 40 });
    if (name.error) errors[`zones.${i}.name`] = name.error;
    else if (seen.has(name.value.toLowerCase())) errors[`zones.${i}.name`] = 'duplicate';
    else seen.add(name.value.toLowerCase());
    if (!isInt(z?.price, LIMITS.minPrice, LIMITS.maxPrice)) errors[`zones.${i}.price`] = 'invalid';
    if (!isInt(z?.capacity, 1, LIMITS.maxCapacity)) errors[`zones.${i}.capacity`] = 'invalid';
    const color = z?.color == null ? ZONE_COLORS[i % ZONE_COLORS.length] : z.color;
    if (!ZONE_COLORS.includes(color)) errors[`zones.${i}.color`] = 'invalid';
    if (z?.id != null && typeof z.id !== 'string') errors[`zones.${i}.id`] = 'invalid';
    return { id: z?.id ?? null, name: name.value, price: z?.price, capacity: z?.capacity, color };
  });
  return { errors, value };
}

// input: { name, venue, category, description, short, poster, startsAt, endsAt, zones }
export function validateEvent(input, now) {
  const errors = {};
  const field = (key, opts) => {
    const r = text(input?.[key], opts);
    if (r.error) errors[key] = r.error;
    return r.value;
  };
  const value = {
    name: field('name', { min: 3, max: 80 }),
    venue: field('venue', { min: 1, max: 120 }),
    category: field('category', { min: 1, max: 30 }),
    description: field('description', { max: 1000, multiline: true }),
    short: field('short', { max: 24, multiline: true }),
    startsAt: input?.startsAt,
    endsAt: input?.endsAt,
  };
  if (value.short && (value.short.includes('\r') || value.short.split('\n').length > 2)) errors.short = 'invalid';
  if (!value.short && value.name) value.short = shortName(value.name);
  const poster = input?.poster ?? 0;
  if (!isInt(poster, 0, POSTERS.length - 1)) errors.poster = 'invalid';
  value.poster = poster;
  if (!Number.isSafeInteger(value.startsAt)) errors.startsAt = 'required';
  else if (value.startsAt <= now) errors.startsAt = 'in_past';
  if (!Number.isSafeInteger(value.endsAt)) errors.endsAt = 'required';
  else if (Number.isSafeInteger(value.startsAt) && value.endsAt <= value.startsAt) errors.endsAt = 'before_start';
  const zones = validateZones(input?.zones);
  Object.assign(errors, zones.errors);
  value.zones = zones.value;
  return { ok: !Object.keys(errors).length, errors, value };
}

export function shortName(name) {
  return String(name).trim().split(/\s+/).slice(0, 2).join('\n').toUpperCase().slice(0, 24);
}

// Same Thai text as the seeded events ("ส. 21 พ.ย. 2569", "19:00").
const TZ = 'Asia/Bangkok';
export const thaiDate = ms => new Intl.DateTimeFormat('th-TH', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(ms);
export const thaiTime = ms => new Intl.DateTimeFormat('th-TH', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(ms);

export function maskEmail(email) {
  const [user, domain] = String(email || '').split('@');
  if (!domain) return '';
  return (user.length <= 2 ? user[0] + '*' : user.slice(0, 2) + '*'.repeat(Math.min(6, user.length - 2))) + '@' + domain;
}

/* ---------- routes ---------- */

// deps: { currentUser, json, expireOrder, logEvent } from src/worker.js
export async function handleOrganizer(request, env, ctx, url, deps) {
  const { json } = deps;
  const user = await deps.currentUser(request, env);
  if (!user) return json({ error: 'authentication_required' }, 401);
  const method = request.method;
  if (method !== 'GET' && !String(request.headers.get('content-type') || '').startsWith('application/json')) {
    return json({ error: 'json_required' }, 415);
  }
  const body = method === 'GET' || method === 'DELETE' ? null : await request.json().catch(() => undefined);
  if (body === undefined || (body !== null && (typeof body !== 'object' || Array.isArray(body)))) return json({ error: 'invalid_json' }, 400);
  const path = url.pathname;
  const db = env.DB;

  if (path === '/api/admin/hosts/verify' && method === 'POST') return verifyHost(db, user, body, deps);
  if (path === '/api/admin/hosts' && method === 'GET') return listHosts(db, user, url.searchParams.get('status'), deps);
  const doc = path.match(/^\/api\/admin\/hosts\/([^/]+)\/document$/);
  if (doc && method === 'GET') return hostDocument(db, user, decodeURIComponent(doc[1]), deps);

  const access = await hostAccess(db, user);
  if (path === '/api/org/me' && method === 'GET') {
    return json({ user: { id: user.id, name: user.name, email: user.email }, shop: access && shopJson(access.shop), role: access?.role || null, admin: user.role === 'admin' });
  }
  if (path === '/api/org/shop' && method === 'POST') return createShop(db, user, access, body, deps, request);
  if (!access) return json({ error: 'no_shop' }, 403);
  const allow = need => ROLES[need].includes(access.role);
  const forbidden = () => json({ error: 'forbidden' }, 403);

  if (path === '/api/org/shop' && method === 'PATCH') return allow('owner') ? updateShop(db, access, body, deps) : forbidden();
  if (path === '/api/org/shop/document' && method === 'PUT') return allow('owner') ? uploadDocument(db, user, access, body, deps) : forbidden();
  if (path === '/api/org/team') {
    if (!allow('owner')) return forbidden();
    if (method === 'GET') return json({ team: await teamRows(db, access) });
    if (method === 'POST') return addMember(db, user, access, body, deps);
    if (method === 'DELETE') return removeMember(db, access, url.searchParams.get('email'), deps);
  }
  if (path === '/api/org/events') {
    if (method === 'GET') return json({ events: await listEvents(db, access.hostId) });
    if (method === 'POST') return allow('edit') ? createEvent(db, access, body, deps) : forbidden();
  }
  const m = path.match(/^\/api\/org\/events\/(ev-[0-9a-f]{12})(\/publish|\/cancel|\/orders)?$/);
  if (m) {
    const [, id, action] = m;
    const event = await db.prepare('SELECT * FROM events WHERE id = ? AND host_id = ?').bind(id, access.hostId).first();
    if (!event) return json({ error: 'event_not_found' }, 404);
    if (!action && method === 'GET') return json({ event: await eventJson(db, event) });
    if (!action && method === 'PATCH') return allow('edit') ? updateEvent(db, event, body, deps) : forbidden();
    if (action === '/publish' && method === 'POST') return allow('edit') ? publishEvent(db, access, event, deps) : forbidden();
    if (action === '/cancel' && method === 'POST') return allow('owner') ? cancelEvent(env, ctx, event, body, deps) : forbidden();
    if (action === '/orders' && method === 'GET') return allow('edit') ? json({ orders: await orderRows(db, id) }) : forbidden();
  }
  return json({ error: 'not_found' }, 404);
}

// The caller's shop and role: owner of a host_profiles row, or a member listed by e-mail.
export async function hostAccess(db, user) {
  const own = await db.prepare(`${SHOP_SELECT} WHERE h.user_id = ?`).bind(user.id).first();
  if (own) return { hostId: own.user_id, role: 'owner', shop: own };
  if (!user.email) return null;
  const member = await db.prepare(
    `SELECT m.role AS member_role, ${SHOP_COLS} FROM host_members m JOIN host_profiles h ON h.user_id = m.host_id
     LEFT JOIN host_documents d ON d.host_id = h.user_id WHERE m.email = ?`,
  ).bind(user.email).first();
  return member ? { hostId: member.user_id, role: member.member_role, shop: member } : null;
}

// host_profiles plus the metadata (never the bytes) of its verification document
const SHOP_COLS = `h.*, d.file_name AS doc_name, d.mime AS doc_mime, d.size AS doc_size, d.uploaded_at AS doc_uploaded_at`;
const SHOP_SELECT = `SELECT ${SHOP_COLS} FROM host_profiles h LEFT JOIN host_documents d ON d.host_id = h.user_id`;

const shopJson = s => ({
  id: s.user_id, name: s.shop_name, type: s.shop_type, contactLine: s.contact_line_id, phone: s.contact_phone,
  verification: s.verification_status, verificationNote: s.verification_note,
  document: s.doc_name ? { name: s.doc_name, mime: s.doc_mime, size: s.doc_size, uploadedAt: s.doc_uploaded_at } : null,
});

function shopInput(body, partial) {
  const errors = {}, value = {};
  for (const [key, max, min] of [['name', 60, 2], ['type', 30, 0], ['contactLine', 40, 0], ['phone', 20, 0]]) {
    if (partial && body?.[key] === undefined) continue;
    const r = text(body?.[key], { min: partial ? Math.min(min, 1) : min, max });
    if (r.error) errors[key] = r.error; else value[key] = r.value || null;
  }
  if (value.phone && !/^\+?[0-9 -]{6,20}$/.test(value.phone)) errors.phone = 'invalid';
  return { errors, value };
}

async function createShop(db, user, access, body, deps, request) {
  if (access) return deps.json({ error: 'already_in_shop', role: access.role }, 409);
  const { errors, value } = shopInput(body, false);
  if (Object.keys(errors).length) return deps.json({ error: 'invalid_input', fields: errors }, 400);
  await db.batch([
    db.prepare(`INSERT INTO host_profiles (user_id, shop_name, shop_type, contact_line_id, contact_phone) VALUES (?, ?, ?, ?, ?)`)
      .bind(user.id, value.name, value.type, value.contactLine, value.phone),
    db.prepare(`UPDATE users SET role = 'host' WHERE id = ? AND role = 'guest'`).bind(user.id),
    deps.logEvent(db, user.id, 'host_created', { shop: value.name }, request.headers.get('cf-connecting-ip')),
  ]);
  const shop = await db.prepare(`${SHOP_SELECT} WHERE h.user_id = ?`).bind(user.id).first();
  return deps.json({ shop: shopJson(shop), role: 'owner' }, 201);
}

async function updateShop(db, access, body, deps) {
  const { errors, value } = shopInput(body, true);
  if (Object.keys(errors).length) return deps.json({ error: 'invalid_input', fields: errors }, 400);
  const cols = { name: 'shop_name', type: 'shop_type', contactLine: 'contact_line_id', phone: 'contact_phone' };
  const keys = Object.keys(value);
  if (keys.length) {
    await db.prepare(`UPDATE host_profiles SET ${keys.map(k => cols[k] + ' = ?').join(', ')} WHERE user_id = ?`)
      .bind(...keys.map(k => value[k]), access.hostId).run();
  }
  const shop = await db.prepare(`${SHOP_SELECT} WHERE h.user_id = ?`).bind(access.hostId).first();
  return deps.json({ shop: shopJson(shop) });
}

async function verifyHost(db, user, body, deps) {
  if (user.role !== 'admin') return deps.json({ error: 'forbidden' }, 403);
  if (!['verified', 'rejected'].includes(body?.status) || typeof body?.userId !== 'string') return deps.json({ error: 'invalid_input' }, 400);
  const note = text(body.note, { max: 300 });
  if (note.error) return deps.json({ error: 'invalid_input', fields: { note: note.error } }, 400);
  if (body.status === 'verified') {
    const docRow = await db.prepare('SELECT 1 FROM host_documents WHERE host_id = ?').bind(body.userId).first();
    if (!docRow) return deps.json({ error: 'no_document' }, 409);
  }
  const now = Date.now();
  const res = await db.prepare(
    `UPDATE host_profiles SET verification_status = ?, verification_note = ?, verified_by = ?, verified_at = ? WHERE user_id = ?`,
  ).bind(body.status, note.value || null, user.id, body.status === 'verified' ? now : null, body.userId).run();
  if (!res.meta.changes) return deps.json({ error: 'shop_not_found' }, 404);
  await deps.logEvent(db, body.userId, 'host_' + body.status, { by: user.id }, null).run();
  return deps.json({ ok: true });
}

/* ---------- verification documents ---------- */

export const DOC_MAX_BYTES = 1024 * 1024;
// first bytes of each accepted type; the declared type must match the file itself
const DOC_MAGIC = {
  'image/jpeg': b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': b => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x),
  'image/webp': b => String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP',
  'application/pdf': b => String.fromCharCode(...b.slice(0, 5)) === '%PDF-',
};

// { name, mime, data } -> { value: { name, mime, bytes } } or { errors }
export function validateDocument(body) {
  const errors = {};
  const name = typeof body?.name === 'string' ? body.name.replace(/[<>"'`\\/\u0000-\u001f\u007f]/g, '_').trim().slice(-100) : '';
  if (!name) errors.name = 'required';
  if (!DOC_MAGIC[body?.mime]) errors.mime = 'invalid';
  let bytes = null;
  if (typeof body?.data !== 'string' || !body.data) errors.data = 'required';
  else if (body.data.length > Math.ceil(DOC_MAX_BYTES / 3) * 4 + 4) errors.data = 'too_large';
  else {
    try { bytes = Uint8Array.from(atob(body.data), c => c.charCodeAt(0)); } catch { errors.data = 'invalid'; }
    if (bytes && bytes.length > DOC_MAX_BYTES) errors.data = 'too_large';
    else if (bytes && !errors.mime && !DOC_MAGIC[body.mime](bytes)) errors.data = 'type_mismatch';
  }
  return Object.keys(errors).length ? { errors } : { value: { name, mime: body.mime, bytes } };
}

async function uploadDocument(db, user, access, body, deps) {
  if (access.shop.verification_status === 'verified') return deps.json({ error: 'already_verified' }, 409);
  const { errors, value } = validateDocument(body);
  if (errors) return deps.json({ error: 'invalid_input', fields: errors }, 400);
  const now = Date.now();
  await db.batch([
    db.prepare(
      `INSERT INTO host_documents (host_id, file_name, mime, size, data, uploaded_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (host_id) DO UPDATE SET file_name = excluded.file_name, mime = excluded.mime, size = excluded.size,
         data = excluded.data, uploaded_at = excluded.uploaded_at`,
    ).bind(access.hostId, value.name, value.mime, value.bytes.length, value.bytes, now),
    // a rejected shop that sends a new document goes back into the queue
    db.prepare(`UPDATE host_profiles SET verification_status = 'pending', verification_note = NULL, updated_at = ?
                WHERE user_id = ? AND verification_status = 'rejected'`).bind(now, access.hostId),
    deps.logEvent(db, access.hostId, 'host_document_uploaded', { by: user.id, size: value.bytes.length }, null),
  ]);
  const shop = await db.prepare(`${SHOP_SELECT} WHERE h.user_id = ?`).bind(access.hostId).first();
  return deps.json({ shop: shopJson(shop) });
}

async function listHosts(db, user, status, deps) {
  if (user.role !== 'admin') return deps.json({ error: 'forbidden' }, 403);
  status = status || 'pending';
  if (!['pending', 'verified', 'rejected', 'all'].includes(status)) return deps.json({ error: 'invalid_input' }, 400);
  const rows = (await db.prepare(
    `${SHOP_SELECT.replace('FROM host_profiles h', ', u.email AS owner_email, u.display_name AS owner_name FROM host_profiles h JOIN users u ON u.id = h.user_id')}
     ${status === 'all' ? '' : 'WHERE h.verification_status = ?'} ORDER BY h.created_at LIMIT 200`,
  ).bind(...(status === 'all' ? [] : [status])).all()).results || [];
  return deps.json({
    hosts: rows.map(r => ({ ...shopJson(r), ownerEmail: r.owner_email, ownerName: r.owner_name, createdAt: r.created_at, verifiedAt: r.verified_at })),
  });
}

async function hostDocument(db, user, hostId, deps) {
  if (user.role !== 'admin') return deps.json({ error: 'forbidden' }, 403);
  const row = await db.prepare('SELECT file_name, mime, data FROM host_documents WHERE host_id = ?').bind(hostId).first();
  if (!row) return deps.json({ error: 'document_not_found' }, 404);
  return new Response(new Uint8Array(row.data), {
    headers: {
      'content-type': row.mime, 'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store',
      'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
    },
  });
}

async function teamRows(db, access) {
  const rows = await db.prepare('SELECT email, role, created_at FROM host_members WHERE host_id = ? ORDER BY created_at').bind(access.hostId).all();
  const owner = await db.prepare('SELECT email FROM users WHERE id = ?').bind(access.hostId).first();
  return [{ email: owner?.email || null, role: 'owner' }, ...(rows.results || []).map(r => ({ email: r.email, role: r.role, addedAt: r.created_at }))];
}

async function addMember(db, user, access, body, deps) {
  const email = String(body?.email || '').trim().toLowerCase();
  if (!/^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]+$/.test(email) || email.length > 120) return deps.json({ error: 'invalid_input', fields: { email: 'invalid' } }, 400);
  if (!['manager', 'gate'].includes(body?.role)) return deps.json({ error: 'invalid_input', fields: { role: 'invalid' } }, 400);
  // Someone who owns a shop, or is already on another team, cannot join this one.
  const busy = await db.prepare(
    `SELECT 1 FROM host_profiles h JOIN users u ON u.id = h.user_id WHERE u.email = ?
     UNION ALL SELECT 1 FROM host_members WHERE email = ? AND host_id != ?`,
  ).bind(email, email, access.hostId).first();
  if (busy) return deps.json({ error: 'already_in_shop' }, 409);
  await db.prepare(
    `INSERT INTO host_members (host_id, email, role, invited_by) VALUES (?, ?, ?, ?)
     ON CONFLICT (host_id, email) DO UPDATE SET role = excluded.role`,
  ).bind(access.hostId, email, body.role, user.id).run();
  return deps.json({ team: await teamRows(db, access) }, 201);
}

async function removeMember(db, access, email, deps) {
  const res = await db.prepare('DELETE FROM host_members WHERE host_id = ? AND email = ?').bind(access.hostId, String(email || '')).run();
  if (!res.meta.changes) return deps.json({ error: 'member_not_found' }, 404);
  return deps.json({ team: await teamRows(db, access) });
}

/* ---------- events ---------- */

async function zoneRows(db, eventId) {
  const rows = await db.prepare(
    `SELECT z.*, ${HELD.replaceAll('event_zones.', 'z.')} AS held,
            (SELECT COUNT(*) FROM payment_orders o WHERE o.event_id = z.event_id AND o.zone = z.zone_name) AS orders,
            (SELECT COUNT(*) FROM payment_orders o WHERE o.event_id = z.event_id AND o.zone = z.zone_name
               AND o.status IN ${ACTIVE_ORDER}) AS live_orders
     FROM event_zones z WHERE z.event_id = ? ORDER BY z.sort_order, z.id`,
  ).bind(eventId).all();
  return rows.results || [];
}

const zoneJson = z => ({
  id: z.id, name: z.zone_name, price: z.price, color: z.color, capacity: z.capacity,
  remaining: z.remaining, held: z.held, sold: z.capacity == null ? null : z.capacity - z.remaining,
  available: z.remaining - z.held,
  // what the editor may still change (same rules as the SQL guards in updateEvent)
  locked: { name: z.orders > 0, price: z.live_orders > 0 },
});

async function eventJson(db, e, zones) {
  zones = zones || await zoneRows(db, e.id);
  return {
    id: e.id, name: e.name, short: e.short_name, category: e.category, venue: e.venue, description: e.description,
    poster: Math.max(0, POSTERS.indexOf(e.poster_background)), startsAt: e.starts_at, endsAt: e.ends_at,
    date: e.event_date, time: e.event_time,
    status: e.cancelled_at ? 'cancelled' : e.status, chainEventId: e.chain_event_id,
    publishedAt: e.published_at, cancelledAt: e.cancelled_at, cancelReason: e.cancel_reason,
    zones: zones.map(zoneJson),
  };
}

async function listEvents(db, hostId) {
  const events = (await db.prepare('SELECT * FROM events WHERE host_id = ? ORDER BY created_at DESC LIMIT 200').bind(hostId).all()).results || [];
  return Promise.all(events.map(e => eventJson(db, e)));
}

const newEventId = () => 'ev-' + [...crypto.getRandomValues(new Uint8Array(6))].map(b => b.toString(16).padStart(2, '0')).join('');

function insertZones(db, eventId, zones, startOrder = 1) {
  return zones.map((z, i) => db.prepare(
    `INSERT INTO event_zones (id, event_id, zone_name, price, remaining, capacity, color, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), eventId, z.name, z.price, z.capacity, z.capacity, z.color, startOrder + i));
}

async function createEvent(db, access, body, deps) {
  const v = validateEvent(body, Date.now());
  if (!v.ok) return deps.json({ error: 'invalid_input', fields: v.errors }, 400);
  const e = v.value, id = newEventId();
  await db.batch([
    db.prepare(
      `INSERT INTO events (id, host_id, name, short_name, category, description, venue, poster_background,
                           event_date, event_time, starts_at, ends_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
    ).bind(id, access.hostId, e.name, e.short, e.category, e.description || null, e.venue, POSTERS[e.poster],
      thaiDate(e.startsAt), thaiTime(e.startsAt), e.startsAt, e.endsAt),
    ...insertZones(db, id, e.zones),
  ]);
  const event = await db.prepare('SELECT * FROM events WHERE id = ?').bind(id).first();
  return deps.json({ event: await eventJson(db, event) }, 201);
}

// Draft with no orders: every field and the zone list can change (zones are replaced).
// After publishing: event details can change; zones are matched by id and checked against
// their orders; zones without an id are added; zones left out are kept as they are.
async function updateEvent(db, event, body, deps) {
  if (event.cancelled_at || event.status === 'closed') return deps.json({ error: 'event_closed' }, 409);
  const zones = await zoneRows(db, event.id);
  const merged = {
    name: event.name, venue: event.venue, category: event.category, description: event.description,
    short: event.short_name, poster: Math.max(0, POSTERS.indexOf(event.poster_background)),
    startsAt: event.starts_at, endsAt: event.ends_at,
    zones: zones.map(z => ({ id: z.id, name: z.zone_name, price: z.price, capacity: z.capacity, color: z.color })),
    ...body,
  };
  if (body?.name !== undefined && body?.short === undefined) merged.short = null; // re-derive from the new name
  const v = validateEvent(merged, Date.now());
  if (!v.ok) return deps.json({ error: 'invalid_input', fields: v.errors }, 400);
  const e = v.value;
  const editable = event.status === 'draft' && !zones.some(z => z.orders > 0);
  const stmts = [db.prepare(
    `UPDATE events SET name = ?, short_name = ?, category = ?, description = ?, venue = ?, poster_background = ?,
            event_date = ?, event_time = ?, starts_at = ?, ends_at = ?, updated_at = ?
     WHERE id = ? AND cancelled_at IS NULL AND status != 'closed'`,
  ).bind(e.name, e.short, e.category, e.description || null, e.venue, POSTERS[e.poster],
    thaiDate(e.startsAt), thaiTime(e.startsAt), e.startsAt, e.endsAt, Date.now(), event.id)];

  if (editable) {
    stmts.push(db.prepare('DELETE FROM event_zones WHERE event_id = ?').bind(event.id), ...insertZones(db, event.id, e.zones));
  } else {
    const byId = new Map(zones.map(z => [z.id, z]));
    const fields = {};
    const added = [];
    e.zones.forEach((z, i) => {
      const old = z.id && byId.get(z.id);
      if (!z.id) { added.push(z); return; }
      if (!old) { fields[`zones.${i}.id`] = 'unknown_zone'; return; }
      if (old.capacity == null) { fields[`zones.${i}.id`] = 'not_editable'; return; }
      if (z.name !== old.zone_name && old.orders > 0) fields[`zones.${i}.name`] = 'locked_by_orders';
      if (z.price !== old.price && old.live_orders > 0) fields[`zones.${i}.price`] = 'locked_by_orders';
      const taken = old.capacity - old.remaining + old.held;
      if (z.capacity < taken) fields[`zones.${i}.capacity`] = 'below_taken:' + taken;
      // The guard repeats the checks inside the statement, so an order placed after the checks
      // above makes the batch fail (remaining = -1 breaks its CHECK) and nothing is written.
      stmts.push(db.prepare(
        `UPDATE event_zones SET zone_name = ?, price = ?, color = ?, capacity = ?,
           remaining = CASE WHEN remaining + (? - capacity) >= ${HELD}
             AND (zone_name = ? OR NOT EXISTS (SELECT 1 FROM payment_orders o WHERE o.event_id = event_zones.event_id AND o.zone = event_zones.zone_name))
             AND (price = ? OR NOT EXISTS (SELECT 1 FROM payment_orders o WHERE o.event_id = event_zones.event_id
                    AND o.zone = event_zones.zone_name AND o.status IN ${ACTIVE_ORDER}))
             THEN remaining + (? - capacity) ELSE -1 END
         WHERE id = ? AND event_id = ?`,
      ).bind(z.name, z.price, z.color, z.capacity, z.capacity, z.name, z.price, z.capacity, z.id, event.id));
    });
    const names = new Set(e.zones.map(z => z.name.toLowerCase()));
    for (const z of zones) {
      if (!e.zones.some(x => x.id === z.id) && names.has(z.zone_name.toLowerCase())) fields.zones = 'duplicate_name';
    }
    if (zones.length + added.length > LIMITS.zones) fields.zones = 'too_many';
    if (Object.keys(fields).length) return deps.json({ error: 'invalid_input', fields }, 409);
    stmts.push(...insertZones(db, event.id, added, zones.length + 1));
  }
  try {
    await db.batch(stmts);
  } catch (err) {
    if (/CHECK constraint failed|UNIQUE constraint failed/.test(String(err?.message || err))) {
      return deps.json({ error: 'changed_meanwhile' }, 409); // an order came in while saving; reload and retry
    }
    throw err;
  }
  const fresh = await db.prepare('SELECT * FROM events WHERE id = ?').bind(event.id).first();
  return deps.json({ event: await eventJson(db, fresh) });
}

// Draft -> on_sale. The new event gets the next chain_event_id (the contract's mint takes any
// uint256 eventId, so nothing has to be registered on chain first).
async function publishEvent(db, access, event, deps) {
  if (access.shop.verification_status !== 'verified') return deps.json({ error: 'shop_not_verified' }, 403);
  if (event.status !== 'draft' || event.cancelled_at) return deps.json({ error: 'not_a_draft' }, 409);
  const zones = await zoneRows(db, event.id);
  const v = validateEvent({
    name: event.name, venue: event.venue, category: event.category, description: event.description, short: event.short_name,
    poster: Math.max(0, POSTERS.indexOf(event.poster_background)), startsAt: event.starts_at, endsAt: event.ends_at,
    zones: zones.map(z => ({ name: z.zone_name, price: z.price, capacity: z.capacity, color: z.color })),
  }, Date.now());
  if (!v.ok) return deps.json({ error: 'invalid_input', fields: v.errors }, 400);
  for (let attempt = 0; ; attempt++) {
    try {
      const now = Date.now();
      const res = await db.prepare(
        `UPDATE events SET status = 'on_sale', published_at = ?, updated_at = ?,
                chain_event_id = COALESCE(chain_event_id, (SELECT COALESCE(MAX(chain_event_id), 0) + 1 FROM events))
         WHERE id = ? AND host_id = ? AND status = 'draft' AND cancelled_at IS NULL`,
      ).bind(now, now, event.id, access.hostId).run();
      if (!res.meta.changes) return deps.json({ error: 'not_a_draft' }, 409);
      break;
    } catch (err) {
      // two shops published at the same moment and took the same id; the unique index refused one
      if (attempt < 3 && /UNIQUE constraint failed/.test(String(err?.message || err))) continue;
      throw err;
    }
  }
  const fresh = await db.prepare('SELECT * FROM events WHERE id = ?').bind(event.id).first();
  return deps.json({ event: await eventJson(db, fresh) });
}

// Stops sales at once and gives back every seat hold (the Stripe sessions are expired too, so
// nobody can still pay). Orders already paid are listed for refund; refunds are not automatic yet.
async function cancelEvent(env, ctx, event, body, deps) {
  const db = env.DB;
  if (event.cancelled_at) return deps.json({ error: 'already_cancelled' }, 409);
  const reason = text(body?.reason, { min: 1, max: 300 });
  if (reason.error) return deps.json({ error: 'invalid_input', fields: { reason: reason.error } }, 400);
  if (body?.confirmName !== event.name) return deps.json({ error: 'invalid_input', fields: { confirmName: 'mismatch' } }, 400);
  const now = Date.now();
  await db.prepare(
    `UPDATE events SET status = 'closed', cancelled_at = ?, cancel_reason = ?, updated_at = ? WHERE id = ? AND cancelled_at IS NULL`,
  ).bind(now, reason.value, now, event.id).run();
  const pending = (await db.prepare(
    `SELECT id, stripe_session_id FROM payment_orders WHERE event_id = ? AND status = 'pending'`,
  ).bind(event.id).all()).results || [];
  ctx.waitUntil(Promise.all(pending.map(o => deps.expireOrder(env, o, ctx)
    .catch(err => console.error('cancel: expire failed', o.id, err && err.stack || err)))));
  const paid = await db.prepare(
    `SELECT COUNT(*) AS orders, COALESCE(SUM(amount), 0) AS amount FROM payment_orders
     WHERE event_id = ? AND status IN ('paid', 'fulfilled', 'needs_review')`,
  ).bind(event.id).first();
  const fresh = await db.prepare('SELECT * FROM events WHERE id = ?').bind(event.id).first();
  return deps.json({ event: await eventJson(db, fresh), heldReleased: pending.length, toRefund: { orders: paid.orders, amountSatang: paid.amount } });
}

async function orderRows(db, eventId) {
  const rows = await db.prepare(
    `SELECT o.id, o.zone, o.quantity, o.amount, o.status, o.created_at, o.paid_at, u.display_name, u.email,
            (SELECT COUNT(*) FROM tickets t WHERE t.order_id = o.id AND t.status = 'active') AS minted
     FROM payment_orders o JOIN users u ON u.id = o.user_id
     WHERE o.event_id = ? ORDER BY o.created_at DESC LIMIT 500`,
  ).bind(eventId).all();
  return (rows.results || []).map(o => ({
    id: o.id, zone: o.zone, quantity: o.quantity, amountSatang: o.amount, status: o.status,
    createdAt: o.created_at, paidAt: o.paid_at, buyer: o.display_name, email: maskEmail(o.email), minted: o.minted,
  }));
}
