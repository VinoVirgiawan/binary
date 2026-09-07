/**
 * GET /api/panel/activity — role-scoped activity feed.
 *   owner: everything | admin: own + their resellers' | reseller: own only
 * Query: ?limit=100 (max 500)
 */
const store = require('../../lib/store');
const auth = require('../../lib/auth');
const { setCors, toInt } = require('../../lib/util');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const g = await auth.requireAuth(req);
  if (g.error) return res.status(g.error[0]).json({ error: g.error[1] });
  const me = g.account;

  const limit = Math.min(500, Math.max(1, toInt(req.query.limit, 100)));
  const list = store.scopeActivity(me).slice(0, limit);

  return res.status(200).json({ activity: list });
};
