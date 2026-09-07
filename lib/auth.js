/**
 * DRIPNEXT panel sessions — bearer token sessions stored in the main state.
 */
const store = require('./store');
const { randomToken, nowIso } = require('./util');

const SESSION_TTL = 7 * 24 * 3600 * 1000; // 7 days

async function createSession(account, device, ip) {
  const db = store.state();
  const token = randomToken(48);
  db.sessions.push({
    token,
    username: account.username,
    device: device || '-',
    ip: ip || '-',
    created_at: nowIso(),
    last_seen: nowIso(),
  });
  if (db.sessions.length > 500) db.sessions = db.sessions.slice(-500);
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
  if (!token) return null;

  const s = db.sessions.find((x) => x.token === token);
  if (!s) return null;
  if (Date.now() - Date.parse(s.created_at) > SESSION_TTL) {
    destroySession(token);
    return null;
  }

  const account = store.findAccount(s.username);
  if (!account || account.status !== 'active') return null;

  s.last_seen = nowIso();
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
