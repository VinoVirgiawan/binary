/**
 * DRIPNEXT shared helpers — Node stdlib only, zero npm dependencies.
 */
const crypto = require('crypto');

/* ── HTTP helpers ─────────────────────────────────────────── */

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function readBody(req) {
  // Pre-parsed body (tests / middleware) short-circuit
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      if (!data) return resolve({});
      try { return resolve(JSON.parse(data)); } catch { /* not json */ }
      try { return resolve(Object.fromEntries(new URLSearchParams(data))); } catch { /* not form */ }
      resolve({});
    });
    req.on('error', () => resolve({}));
  });
}

function getIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'unknown';
}

function toInt(v, fallback = 0) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

/* ── Crypto helpers ───────────────────────────────────────── */

function sha256(str) {
  return crypto.createHash('sha256').update(String(str)).digest('hex');
}

function hashPassword(pw) {
  return sha256('dripnext:' + String(pw));
}

function randomToken(len = 48) {
  return crypto.randomBytes(64).toString('hex').slice(0, len);
}

// Unambiguous alphabet (no 0/O/1/I)
const ALNUM = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomCode(len = 8) {
  let s = '';
  for (let i = 0; i < len; i++) s += ALNUM[crypto.randomInt(ALNUM.length)];
  return s;
}

/* ── Time helpers ─────────────────────────────────────────── */

function nowIso() {
  return new Date().toISOString();
}

function addDays(days) {
  return new Date(Date.now() + Number(days || 0) * 86400000).toISOString();
}

module.exports = {
  setCors,
  readBody,
  getIp,
  toInt,
  sha256,
  hashPassword,
  randomToken,
  randomCode,
  nowIso,
  addDays,
};
