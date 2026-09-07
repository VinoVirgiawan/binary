/**
 * POST /api/panel/login — panel login with ONE DEVICE LOGIN enforcement.
 * Body: { username, password, device }
 */
const store = require('../../lib/store');
const auth = require('../../lib/auth');
const { readBody, setCors, getIp, hashPassword } = require('../../lib/util');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  await store.ensureLoaded();
  const body = await readBody(req);
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  const device = String(body.device || '').trim() || 'unknown-device';
  const ip = getIp(req);

  const acc = store.findAccount(username);
  if (!acc || acc.password !== hashPassword(password)) {
    store.logActivity(username || '?', 'login_failed', 'Wrong username/password', ip);
    return res.status(401).json({ error: 'Wrong username or password' });
  }

  if (acc.status !== 'active') {
    store.logActivity(username, 'login_failed', 'Blocked: account banned', ip);
    return res.status(403).json({ error: 'Account banned' });
  }

  if (store.accountExpired(acc)) {
    store.logActivity(username, 'login_failed', `Blocked: account expired (${acc.expires_at})`, ip);
    return res.status(403).json({ error: `Account expired on ${acc.expires_at}` });
  }

  // ── ONE DEVICE LOGIN ──
  if (acc.device && acc.device !== device) {
    store.logActivity(username, 'login_failed', `Blocked: already bound to device ${acc.device}`, ip);
    return res.status(403).json({
      error: 'Account already logged in on another device. Ask admin/owner to reset your device.',
    });
  }

  if (!acc.device) {
    acc.device = device;
    store.save();
  }

  const token = await auth.createSession(acc, device, ip);
  store.logActivity(username, 'login', 'Panel login', ip);

  return res.status(200).json({ token, account: store.safeAccount(acc) });
};
