/**
 * /api/panel/games — list & create games.
 *
 * GET  → all games (with key counts)
 * POST → create game (owner only). Body: { id, name }
 */
const store = require('../../lib/store');
const auth = require('../../lib/auth');
const { readBody, setCors, getIp, nowIso } = require('../../lib/util');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const g = await auth.requireAuth(req);
  if (g.error) return res.status(g.error[0]).json({ error: g.error[1] });
  const me = g.account;
  const db = store.state();

  if (req.method === 'GET') {
    const games = db.games.map((game) => ({
      ...game,
      keys_count: db.keys.filter((k) => k.game === game.id).length,
    }));
    return res.status(200).json({ games });
  }

  if (req.method === 'POST') {
    if (me.role !== 'owner') return res.status(403).json({ error: 'Owner only' });

    const body = await readBody(req);
    const id = String(body.id || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 16);
    const name = String(body.name || '').trim().slice(0, 40) || id.toUpperCase();

    if (id.length < 2) return res.status(400).json({ error: 'Game id must be 2-16 chars (a-z, 0-9, _)' });
    if (store.findGame(id)) return res.status(409).json({ error: 'Game id already exists' });

    const game = { id, name, status: 'active', created_at: nowIso() };
    db.games.push(game);
    store.save();

    store.logActivity(me.username, 'game_create', `Created game ${id} (${name})`, getIp(req));
    return res.status(201).json({ game });
  }

  return res.status(405).json({ error: 'GET or POST only' });
};
