// JongLoei Worker: real "Sign in with Google" for the mock-up.
//
// Routes (everything else is served from ./mockup as static assets):
//   GET  /api/me                 -> { googleEnabled, user }
//   POST /api/checkout-session   -> create a Stripe Checkout Session
//   POST /api/stripe/webhook     -> verify and record Stripe payment events
//   GET  /auth/google/start      -> redirect to Google's account chooser
//   GET  /auth/google/callback   -> verify ID token, upsert user in D1, make sure the user
//                                   has a ticket wallet, set session cookie
//   POST /auth/logout            -> revoke the session
//   POST /api/dev/test-mint      -> admin only: mint one test ticket to the caller's wallet
//
// Secrets (set in Cloudflare, never committed): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
// THIRDWEB_SECRET_KEY, STRIPE_SECRET_KEY (prefer an rk_ restricted key), and
// STRIPE_WEBHOOK_SECRET. Without the Google ones /api/me reports googleEnabled=false and
// the mock-up keeps its demo login. Without THIRDWEB_SECRET_KEY login works but no wallet
// is made.

const SESSION_COOKIE = 'jl_session';
const STATE_COOKIE = 'jl_oauth';
const SESSION_DAYS = 30;
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const WALLET_CHAIN_ID = 43113; // Avalanche Fuji testnet, matches wallets.chain_id default
const THIRDWEB_API = 'https://api.thirdweb.com';
// JongloeiTicket on Avalanche Fuji (contracts/deployments/fuji.json). The relayer is a thirdweb
// server wallet holding MINTER_ROLE and OPERATOR_ROLE; it signs and pays for every ticket write.
const TICKET_CONTRACT = '0xef36fcbdED316dEd4367636a6c85d73bFD5e2735';
const RELAYER_ADDRESS = '0xDb5C1E726f8777694DF438c96dcCB57055f6B260';
const FUJI_EXPLORER = 'https://testnet.snowtrace.io';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/me' && request.method === 'GET') return me(request, env);
      if (url.pathname === '/api/health' && request.method === 'GET') {
        return json({ ok: true, service: 'jongloei-worker' }, 200, { 'cache-control': 'no-store' });
      }
      if (url.pathname === '/api/checkout-session' && request.method === 'POST') return createCheckoutSession(request, env);
      if (url.pathname === '/api/checkout-status' && request.method === 'GET') return checkoutStatus(request, env);
      if (url.pathname === '/api/stripe/webhook' && request.method === 'POST') return stripeWebhook(request, env);
      if (url.pathname === '/auth/google/start' && request.method === 'GET') return start(request, env);
      if (url.pathname === '/auth/google/callback' && request.method === 'GET') return callback(request, env);
      if (url.pathname === '/auth/logout' && request.method === 'POST') return logout(request, env);
      if (url.pathname === '/api/dev/test-mint' && request.method === 'POST') return testMint(request, env);
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

const TICKET_CATALOG = {
  neon: { name: 'BKK Neon Nights 2026', venue: 'อิมแพ็ค อารีนา เมืองทองธานี', zones: { 'Standing A': 2500, 'Seat B': 3800, 'VIP Front': 5500 } },
  jazz: { name: 'Siam River Jazz Festival', venue: 'ลานริมน้ำ เจริญกรุง', zones: { 'บัตรวันเดียว': 1800, 'บัตร 2 วัน': 3200 } },
  fan: { name: 'Starlight Fan Meeting in Bangkok', venue: 'ธันเดอร์โดม เมืองทองธานี', zones: { 'Zone C': 2900, 'Zone B': 4200, 'Hi-Touch A': 6900 } },
  standup: { name: 'Late Night Stand-up Special', venue: 'สามย่านมิตรทาวน์ ฮอลล์', zones: { Regular: 1500, 'Front Row': 2600 } },
};

async function createCheckoutSession(request, env) {
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'stripe_unconfigured' }, 503);
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'authentication_required' }, 401);
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'invalid_json' }, 400); }
  const event = TICKET_CATALOG[body?.eventId];
  const zone = event?.zones?.[body?.zone];
  const quantity = Number(body?.quantity);
  if (!event || !zone || !Number.isInteger(quantity) || quantity < 1 || quantity > 4) {
    return json({ error: 'invalid_ticket' }, 400);
  }

  const origin = new URL(request.url).origin;
  const orderId = crypto.randomUUID();
  const params = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price_data][currency]': 'thb',
    'line_items[0][price_data][product_data][name]': `${event.name} · ${body.zone}`,
    'line_items[0][price_data][product_data][description]': event.venue,
    'line_items[0][price_data][unit_amount]': String(Math.round(zone * 1.03)),
    'line_items[0][quantity]': String(quantity),
    'success_url': `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    'cancel_url': `${origin}/?checkout=cancelled`,
    'client_reference_id': orderId,
    'metadata[order_id]': orderId,
    'metadata[event_id]': body.eventId,
    'metadata[zone]': body.zone,
    'metadata[quantity]': String(quantity),
    'integration_identifier': `jongloei_checkout_${randomToken(6).toLowerCase()}`,
  });
  if (user.email) params.set('customer_email', user.email);
  const response = await stripeRequest(env.STRIPE_SECRET_KEY, '/v1/checkout/sessions', params);
  if (!response.ok) {
    console.error('stripe checkout session failed', response.status, await response.text());
    return json({ error: 'stripe_request_failed' }, 502);
  }
  const session = await response.json();
  if (env.DB) {
    try {
      await env.DB.prepare(
        `INSERT INTO payment_orders (id, user_id, stripe_session_id, event_id, zone, quantity, amount, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      ).bind(orderId, user.id, session.id, body.eventId, body.zone, quantity, Math.round(zone * quantity * 1.03)).run();
    } catch (err) {
      console.error('payment order insert failed', err && err.stack || err);
      return json({ error: 'payment_storage_unavailable' }, 503);
    }
  }
  return json({ url: session.url }, 200, { 'cache-control': 'no-store' });
}

async function checkoutStatus(request, env) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'authentication_required' }, 401);
  const sessionId = new URL(request.url).searchParams.get('session_id');
  if (!sessionId || !sessionId.startsWith('cs_')) return json({ error: 'invalid_session_id' }, 400);
  const order = await env.DB.prepare(
    `SELECT stripe_session_id, event_id, zone, quantity, status
     FROM payment_orders WHERE stripe_session_id = ? AND user_id = ?`,
  ).bind(sessionId, user.id).first();
  if (!order) return json({ error: 'order_not_found' }, 404);
  return json({
    status: order.status,
    eventId: order.event_id,
    zone: order.zone,
    quantity: order.quantity,
  }, 200, { 'cache-control': 'no-store' });
}

async function stripeWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: 'stripe_webhook_unconfigured' }, 503);
  const signature = request.headers.get('stripe-signature');
  const payload = await request.text();
  if (!signature || !(await verifyStripeSignature(payload, signature, env.STRIPE_WEBHOOK_SECRET))) {
    return json({ error: 'invalid_signature' }, 400);
  }
  const event = JSON.parse(payload);
  const session = event.type.startsWith('checkout.session.') ? event.data?.object : null;
  if (session?.id && env.DB) {
    if ((event.type === 'checkout.session.completed' && session.payment_status !== 'unpaid')
      || event.type === 'checkout.session.async_payment_succeeded') {
      await env.DB.prepare(
        `UPDATE payment_orders SET status = 'paid', stripe_payment_intent = ?, paid_at = ?
         WHERE stripe_session_id = ? AND status != 'paid'`,
      ).bind(session.payment_intent || null, Date.now(), session.id).run();
    } else if (event.type === 'checkout.session.async_payment_failed') {
      await env.DB.prepare(`UPDATE payment_orders SET status = 'failed' WHERE stripe_session_id = ? AND status = 'pending'`)
        .bind(session.id).run();
    }
  }
  return json({ received: true });
}

async function stripeRequest(secret, path, body) {
  return fetch(`https://api.stripe.com${path}`, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + secret, 'content-type': 'application/x-www-form-urlencoded', 'stripe-version': '2026-09-30.endive' },
    body,
  });
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
  const transactionId = await writeTicketContract(env.THIRDWEB_SECRET_KEY,
    'function mint(address to, uint256 eventId) returns (uint256)', [user.wallet, String(eventId)]);
  const tx = await waitForTransaction(env.THIRDWEB_SECRET_KEY, transactionId);
  await logEvent(env.DB, user.id, 'test_mint', { transactionId, status: tx.status, hash: tx.hash, eventId }, request.headers.get('cf-connecting-ip')).run();
  return json({
    transactionId, status: tx.status, transactionHash: tx.hash, error: tx.error,
    to: user.wallet, eventId,
    explorer: tx.hash ? `${FUJI_EXPLORER}/tx/${tx.hash}` : null,
    wallet: `${FUJI_EXPLORER}/address/${user.wallet}`,
  }, tx.status === 'FAILED' ? 502 : 200);
}

// Queues one write from the relayer; thirdweb signs, pays gas and returns a transaction id.
async function writeTicketContract(secretKey, method, params) {
  const res = await fetch(`${THIRDWEB_API}/v1/contracts/write`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-secret-key': secretKey },
    body: JSON.stringify({
      chainId: WALLET_CHAIN_ID,
      from: RELAYER_ADDRESS,
      calls: [{ contractAddress: TICKET_CONTRACT, method, params }],
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`thirdweb write ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const id = (await res.json())?.result?.transactionIds?.[0];
  if (!id) throw new Error('thirdweb returned no transaction id');
  return id;
}

// Polls the queued transaction for up to ~20 s; returns whatever state it reached.
async function waitForTransaction(secretKey, transactionId) {
  let last = { status: 'QUEUED', hash: null, error: null };
  for (let i = 0; i < 10; i++) {
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
