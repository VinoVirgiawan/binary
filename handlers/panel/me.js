/**
 * GET /api/panel/me — current account + permitted games.
 */
const store = require('../../lib/store');
const auth = require('../../lib/auth');
const { setCors } = require('../../lib/util');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const g = await auth.requireAuth(req);
  if (g.error) return res.status(g.error[0]).json({ error: g.error[1] });

  return res.status(200).json({
    account: store.safeAccount(g.account),
    games: store.gamesFor(g.account),
  });
};
