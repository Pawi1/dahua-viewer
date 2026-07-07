'use strict';
const crypto = require('crypto');

// sessionId → { type: 'full'|'share', expiresAt, scope }
const store = new Map();

function create(type, ttlMs, scope = null) {
  const id = crypto.randomBytes(32).toString('hex');
  store.set(id, { type, expiresAt: Date.now() + ttlMs, scope });
  return id;
}

function get(id) {
  if (!id) return null;
  const s = store.get(id);
  if (!s) return null;
  if (Date.now() > s.expiresAt) { store.delete(id); return null; }
  return s;
}

function del(id) { store.delete(id); }

function cleanup() {
  const now = Date.now();
  for (const [id, s] of store) if (now > s.expiresAt) store.delete(id);
}

module.exports = { create, get, del, cleanup };
