// JongLoei Worker: real "Sign in with Google" for the mock-up.
//
// Routes (everything else is served from ./mockup as static assets):
//   GET  /api/me                 -> { googleEnabled, user }
//   GET  /auth/google/start      -> redirect to Google's account chooser
//   GET  /auth/google/callback   -> verify ID token, upsert user in D1, set session cookie
//   POST /auth/logout            -> revoke the session
//
// Secrets (set in Cloudflare, never committed): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.
// Without them /api/me reports googleEnabled=false and the mock-up keeps its demo login.
// PUBLIC_ORIGIN (a plain var in wrangler.jsonc) pins the redirect URI to one address,
// so preview URLs and other hostnames sign in through the same registered callback.

const SESSION_COOKIE = 'jl_session';
const STATE_COOKIE = 'jl_oauth';
const SESSION_DAYS = 30;
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/me' && request.method === 'GET') return me(request, env);
      if (url.pathname === '/auth/google/start' && request.method === 'GET') return start(request, env);
      if (url.pathname === '/auth/google/callback' && request.method === 'GET') return callback(request, env);
      if (url.pathname === '/auth/logout' && request.method === 'POST') return logout(request, env);
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

async function start(request, env) {
  if (!googleEnabled(env)) return redirect('/?login=unconfigured');
  const url = new URL(request.url);
  const origin = publicOrigin(env, url);
  // Start on the registered address so the state cookie and the callback share a host.
  if (origin !== url.origin) return redirect(`${origin}/auth/google/start`);
  const state = randomToken(24);
  const nonce = randomToken(24);
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${origin}/auth/google/callback`,
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
      redirect_uri: `${publicOrigin(env, url)}/auth/google/callback`,
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
    `SELECT u.id, u.display_name, u.email, u.avatar_url, u.role, s.id AS session_id
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
       AND u.status = 'active' AND u.deleted_at IS NULL`,
  ).bind(await sha256Hex(token), Date.now()).first();
  if (!row) return null;
  await env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').bind(Date.now(), row.session_id).run();
  return { id: row.id, name: row.display_name, email: row.email, avatarUrl: row.avatar_url, role: row.role };
}

/* ---------- helpers ---------- */

function publicOrigin(env, url) {
  // `wrangler dev` keeps its own localhost origin so local testing still works.
  if (!env.PUBLIC_ORIGIN || url.hostname === 'localhost' || url.hostname === '127.0.0.1') return url.origin;
  return new URL(env.PUBLIC_ORIGIN).origin;
}

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
