/**
 * GET /api/panel/stats — role-scoped dashboard numbers.
 */
const store = require('../../lib/store');
const auth = require('../../lib/auth');
const { setCors, nowIso } = require('../../lib/util');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const g = await auth.requireAuth(req);
  if (g.error) return res.status(g.error[0]).json({ error: g.error[1] });
  const me = g.account;

  const keys = store.scopeKeys(me);
  const accounts = store.scopeAccounts(me);
  const db = store.state();

  const stats = {
    keys_total: keys.length,
    keys_active: keys.filter((k) => k.status === 'active' && !store.keyExpired(k)).length,
    keys_banned: keys.filter((k) => k.status === 'banned').length,
    keys_expired: keys.filter((k) => k.status !== 'banned' && store.keyExpired(k)).length,
    games_total: db.games.length,
    games_active: db.games.filter((x) => x.status === 'active').length,
    activity_total: store.scopeActivity(me).length,
    now: nowIso(),
  };

  if (me.role === 'owner') {
    stats.accounts_admins = accounts.filter((a) => a.role === 'admin').length;
    stats.accounts_resellers = accounts.filter((a) => a.role === 'reseller').length;
  } else if (me.role === 'admin') {
    stats.accounts_resellers = accounts.length;
  }

  // Per-game key counts (scoped)
  stats.per_game = {};
  for (const k of keys) {
    stats.per_game[k.game] = (stats.per_game[k.game] || 0) + 1;
  }

  return res.status(200).json({ stats, credits: me.role === 'owner' ? 'unlimited' : me.credits || 0 });
};
