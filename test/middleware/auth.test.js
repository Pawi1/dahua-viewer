'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const authMiddleware = require('../../src/middleware/auth');
const sessions = require('../../src/services/sessionStore');
const { startTestServer } = require('../../test-support/http');

async function withApp(fn) {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use(authMiddleware);
  app.all(['/api/search', '/api/stream/start', '/api/download', '/api/nvr/info', '/api/auth/check', '/api/config'],
    (_req, res) => res.json({ ok: true }));
  const server = await startTestServer(app);
  try {
    await fn(server.baseUrl);
  } finally {
    await server.close();
  }
}

test('public paths bypass auth even without a session', async () => {
  await withApp(async (baseUrl) => {
    const a = await fetch(`${baseUrl}/api/auth/check`);
    assert.equal(a.status, 200);
    const b = await fetch(`${baseUrl}/api/config`);
    assert.equal(b.status, 200);
  });
});

test('missing session cookie -> 401', async () => {
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/nvr/info`);
    assert.equal(r.status, 401);
  });
});

test('unknown/expired session cookie -> 401', async () => {
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/nvr/info`, { headers: { cookie: 'session_id=nope' } });
    assert.equal(r.status, 401);
  });
});

test('full session passes through to any route', async () => {
  const id = sessions.create('full', 60_000);
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/search`, { headers: { cookie: `session_id=${id}` } });
    assert.equal(r.status, 200);
  });
  sessions.del(id);
});

test('share session is forbidden on /api/search', async () => {
  const id = sessions.create('share', 60_000, { channel: 1, startTime: 'a', endTime: 'b', filePath: null });
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/search`, { headers: { cookie: `session_id=${id}` } });
    assert.equal(r.status, 403);
  });
  sessions.del(id);
});

test('share session is allowed on /api/nvr/* (not scope-checked)', async () => {
  const id = sessions.create('share', 60_000, { channel: 1, startTime: 'a', endTime: 'b', filePath: null });
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/nvr/info`, { headers: { cookie: `session_id=${id}` } });
    assert.equal(r.status, 200);
  });
  sessions.del(id);
});

test('share session on /api/stream/start with matching channel/time -> allowed', async () => {
  const id = sessions.create('share', 60_000, {
    channel: 3, startTime: '2026-01-01 10:00:00', endTime: '2026-01-01 11:00:00', filePath: null,
  });
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/stream/start`, {
      method: 'POST',
      headers: { cookie: `session_id=${id}`, 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 3, startTime: '2026-01-01 10:05:00', endTime: '2026-01-01 10:10:00' }),
    });
    assert.equal(r.status, 200);
  });
  sessions.del(id);
});

test('share session on /api/stream/start with a different channel -> forbidden', async () => {
  const id = sessions.create('share', 60_000, {
    channel: 3, startTime: '2026-01-01 10:00:00', endTime: '2026-01-01 11:00:00', filePath: null,
  });
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/stream/start`, {
      method: 'POST',
      headers: { cookie: `session_id=${id}`, 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 7, startTime: '2026-01-01 10:05:00', endTime: '2026-01-01 10:10:00' }),
    });
    assert.equal(r.status, 403);
  });
  sessions.del(id);
});

test('share session on /api/stream/start with a time range outside the shared window -> forbidden', async () => {
  const id = sessions.create('share', 60_000, {
    channel: 3, startTime: '2026-01-01 10:00:00', endTime: '2026-01-01 11:00:00', filePath: null,
  });
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/stream/start`, {
      method: 'POST',
      headers: { cookie: `session_id=${id}`, 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 3, startTime: '2026-01-01 09:00:00', endTime: '2026-01-01 10:10:00' }),
    });
    assert.equal(r.status, 403);
  });
  sessions.del(id);
});

test('share session scoped to a filePath only allows that exact filePath', async () => {
  const id = sessions.create('share', 60_000, {
    channel: 3, startTime: null, endTime: null, filePath: '/mnt/dvr/sda0/a.dav',
  });
  await withApp(async (baseUrl) => {
    const ok = await fetch(`${baseUrl}/api/download`, {
      headers: { cookie: `session_id=${id}` },
    });
    // no filePath query param at all -> undefined !== scope.filePath -> forbidden
    assert.equal(ok.status, 403);

    const good = await fetch(`${baseUrl}/api/download?filePath=${encodeURIComponent('/mnt/dvr/sda0/a.dav')}`, {
      headers: { cookie: `session_id=${id}` },
    });
    assert.equal(good.status, 200);

    const bad = await fetch(`${baseUrl}/api/download?filePath=${encodeURIComponent('/mnt/dvr/sda0/b.dav')}`, {
      headers: { cookie: `session_id=${id}` },
    });
    assert.equal(bad.status, 403);
  });
  sessions.del(id);
});
