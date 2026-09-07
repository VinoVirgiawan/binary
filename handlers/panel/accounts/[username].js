/**
 * /api/panel/accounts/[username] — edit / delete an account.
 *
 * PATCH  body (all optional): { password, credits, expires_days, clear_expiry,
 *                               expires_at, games, status, device_reset }
 * DELETE → remove account (owner: anyone non-owner; admin: own resellers)
 */
const store = require('../../../lib/store');
const auth = require('../../../lib/auth');
const { readBody, setCors, getIp, hashPassword, toInt, addDays } = require('../../../lib/util');

function canManage(me, target) {
  if (!target) return false;
  if (me.role === 'owner') return true; // owner manages everyone
  if (me.role === 'admin') {
    return target.role === 'reseller' && target.created_by === me.username;
  }
  return false;
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const g = await auth.requireAuth(req);
  if (g.error) return res.status(g.error[0]).json({ error: g.error[1] });
  const me = g.account;
  const db = store.state();

  const target = store.findAccount(req.query.username);
  if (!target || !canManage(me, target)) {
    return res.status(404).json({ error: 'Account not found (or not manageable by you)' });
  }
  if (req.method === 'PATCH') {
    if (target.username === 'owner' && me.username !== 'owner') {
      return res.status(403).json({ error: 'Cannot edit the owner account' });
    }
    if (target.username === 'owner' && target.role === 'owner') {
      // owner editing owner self: only allow password/device
    }

    const body = await readBody(req);
    const changes = [];

    if (body.password) {
      if (String(body.password).length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters' });
      }
      target.password = hashPassword(body.password);
      changes.push('password');
    }

    if (body.credits !== undefined) {
      if (target.role === 'owner') {
        return res.status(400).json({ error: 'Owner credits are unlimited' });
      }
      target.credits = Math.max(0, toInt(body.credits, target.credits || 0));
      changes.push(`credits=${target.credits}`);
    }

    if (body.clear_expiry) {
      target.expires_at = null;
      changes.push('expiry=never');
    } else if (body.expires_days !== undefined && body.expires_days !== null && body.expires_days !== '') {
      target.expires_at = addDays(toInt(body.expires_days, 30));
      changes.push(`expiry=+${body.expires_days}d`);
    } else if (body.expires_at !== undefined) {
      if (body.expires_at === null || body.expires_at === '') {
        target.expires_at = null;
        changes.push('expiry=never');
      } else {
        const t = Date.parse(body.expires_at);
        if (!Number.isFinite(t)) return res.status(400).json({ error: 'Invalid expires_at' });
        target.expires_at = new Date(t).toISOString();
        changes.push(`expiry=${target.expires_at}`);
      }
    }

    if (Array.isArray(body.games)) {
      let games = body.games.map((x) => String(x).toLowerCase());
      if (games.includes('*')) {
        games = ['*'];
      } else {
        if (games.length === 0) return res.status(400).json({ error: 'Pick at least one game (or *)' });
        for (const gid of games) {
          if (!store.findGame(gid)) return res.status(400).json({ error: `Unknown game: ${gid}` });
        }
      }
      target.games = games;
      changes.push(`games=[${games.join(',')}]`);
    }

    if (body.status !== undefined) {
      if (!['active', 'banned'].includes(body.status)) {
        return res.status(400).json({ error: 'status must be active or banned' });
      }
      if (target.username === 'owner') {
        return res.status(400).json({ error: 'Cannot ban the owner account' });
      }
      target.status = body.status;
      changes.push(`status=${body.status}`);
      if (body.status === 'banned') auth.destroyAccountSessions(target.username);
    }

    if (body.device_reset) {
      target.device = null;
      auth.destroyAccountSessions(target.username);
      changes.push('device_reset');
    }

    if (changes.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    store.save();
    store.logActivity(me.username, 'account_update', `Edited "${target.username}": ${changes.join(', ')}`, getIp(req));
    return res.status(200).json({ account: store.safeAccount(target) });
  }

  if (req.method === 'DELETE') {
    if (target.role === 'owner') {
      return res.status(400).json({ error: 'Cannot delete the owner account' });
    }
    if (target.username === me.username) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }
    db.accounts = db.accounts.filter((a) => a.username !== target.username);
    auth.destroyAccountSessions(target.username);
    store.save();
    store.logActivity(me.username, 'account_delete', `Deleted account "${target.username}"`, getIp(req));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'PATCH or DELETE only' });
};
      
