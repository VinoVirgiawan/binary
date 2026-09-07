/**
 * POST /api/panel/logout — destroy the current session.
 */
const store = require('../../lib/store');
const auth = require('../../lib/auth');
const { setCors } = require('../../lib/util');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const g = await auth.requireAuth(req);
  if (g.error) return res.status(g.error[0]).json({ error: g.error[1] });

  auth.destroySession(g.session.token);
  return res.status(200).json({ ok: true });
};
