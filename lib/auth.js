/**
 * DRIPNEXT panel auth — HMAC-signed session tokens.
 *
 * Token format: base64url({u,d,t}) + "." + HMAC-SHA256(payload, PANEL_SECRET)
 *  - Signed → cannot be forged, survives cold starts & redeploys.
 *  - Each token also has a server-side session record in the shared store,
 *    so logout / account-ban revoke access immediately.
 *  - Token carries the device id; if the account's bound device changes,
 *    old tokens stop working (one-device login).
 */
const crypto = require('crypto');
const store = require('./store');
const { nowIso } = require('./util');

const SECRET = process.env.PANEL_SECRET || 'kitsune-default-secret-change-me';
const SESSION_TTL = 7 * 24 * 3600 * 1000; // 7 days

function sign(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}

async function createSession(account, device, ip) {
  const db = store.state();
  const payload = Buffer
    .from(JSON.stringify({ u: account.username, d: device || '', t: Date.now() }))
    .toString('base64url');
  const token = `${payload}.${sign(payload)}`;

  db.sessions.push({
    token,
    username: account.username,
    device: device || '-',
    ip: ip || '-',
    created_at: nowIso(),
    last_seen: nowIso(),
  });
  if (db.sessions.length > 2000) db.sessions = db.sessions.slice(-2000);
  store.save();
  return token;
}

function destroySession(token) {
  const db = store.state();
  const i = db.sessions.findIndex((s) => s.token === token);
  if (i !== -1) {
    db.sessions.splice(i, 1);
    store.save();
  }
}

function destroyAccountSessions(username) {
  const db = store.state();
  const before = db.sessions.length;
  db.sessions = db.sessions.filter((s) => s.username !== username);
  if (db.sessions.length !== before) store.save();
}

/** Resolve the session + account from the Authorization header. */
async function getSession(req) {
  await store.ensureLoaded();
  const db = store.state();

  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ')
    ? h.slice(7).trim()
    : ((req.query && req.query.token) || '');
  if (!token || !token.includes('.')) return null;

  // 1) Signature check — reject forged tokens
  const [payload, sig] = token.split('.');
  let data;
  try {
    const expect = Buffer.from(sign(payload));
    const got = Buffer.from(sig);
    if (expect.length !== got.length || !crypto.timingSafeEqual(expect, got)) return null;
    data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    return null;
  }
  if (!data || !data.u || Date.now() - data.t > SESSION_TTL) return null;

  // 2) Session record must exist (logout / ban revocation)
  const s = db.sessions.find((x) => x.token === token);
  if (!s) return null;
  s.last_seen = nowIso();

  // 3) Account must exist, be active, and match the bound device
  const account = store.findAccount(data.u);
  if (!account || account.status !== 'active') return null;
  if (account.device && data.d && account.device !== data.d) return null;

  return { session: s, account };
}

/**
 * Guard for panel endpoints.
 * Usage: const g = await requireAuth(req, ['owner','admin']); if (g.error) return res.status(g.error[0]).json({ error: g.error[1] });
 */
async function requireAuth(req, roles = null) {
  const got = await getSession(req);
  if (!got) return { error: [401, 'Unauthorized'] };
  if (roles && !roles.includes(got.account.role)) {
    return { error: [403, `Forbidden — requires role: ${roles.join(' / ')}`] };
  }
  return got;
}

module.exports = {
  createSession,
  destroySession,
  destroyAccountSessions,
  getSession,
  requireAuth,
};
