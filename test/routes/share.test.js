'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { apiRouter, pageRouter } = require('../../src/routes/share');
const shareStore = require('../../src/services/shareStore');
const { startTestServer } = require('../../test-support/http');

async function withApp(fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/share', apiRouter);
  app.use('/share', pageRouter);
  const server = await startTestServer(app);
  try {
    await fn(server.baseUrl);
  } finally {
    await server.close();
  }
}

test('POST /api/share creates a link and clamps ttlHours to 720', async () => {
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/share`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channel: 2, startTime: '2026-01-01 10:00:00', endTime: '2026-01-01 11:00:00', ttlHours: 99999,
      }),
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.success, true);
    assert.equal(body.ttlHours, 720);
    assert.ok(body.token);
    assert.ok(body.url.endsWith(`/share/${body.token}`));

    const stored = shareStore.get(body.token);
    assert.equal(stored.channel, 2);
    shareStore.delete(body.token);
  });
});

test('POST /api/share defaults ttlHours to cfg.shareTtlH when omitted', async () => {
  const cfg = require('../../src/config');
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/share`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 1, startTime: 'a', endTime: 'b' }),
    });
    const body = await r.json();
    assert.equal(body.ttlHours, Math.min(cfg.shareTtlH, 720));
    shareStore.delete(body.token);
  });
});

test('POST /api/share requires channel/startTime/endTime', async () => {
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/share`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 1 }),
    });
    assert.equal(r.status, 400);
  });
});

test('GET /api/share/:token returns link details for a valid token', async () => {
  const expiresAt = Date.now() + 60_000;
  shareStore.set('tok-abc', { channel: 4, startTime: 'a', endTime: 'b', filePath: null, expiresAt, ttl: 1 });
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/share/tok-abc`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.channel, 4);
  });
  shareStore.delete('tok-abc');
});

test('GET /api/share/:token returns 410 for an unknown token', async () => {
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/share/does-not-exist`);
    assert.equal(r.status, 410);
  });
});

test('GET /share/:token redirects to the player with query params and sets a session cookie', async () => {
  const expiresAt = Date.now() + 60_000;
  shareStore.set('page-tok', {
    channel: 6, startTime: '2026-01-01 10:00:00', endTime: '2026-01-01 11:00:00', filePath: '/mnt/dvr/a.dav', expiresAt, ttl: 1,
  });
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/share/page-tok`, { redirect: 'manual' });
    assert.equal(r.status, 302);
    const location = r.headers.get('location');
    assert.match(location, /^\/\?/);
    const params = new URLSearchParams(location.slice(2));
    assert.equal(params.get('mode'), 'share');
    assert.equal(params.get('ch'), '6');
    assert.equal(params.get('fp'), '/mnt/dvr/a.dav');
    assert.ok(r.headers.get('set-cookie'));
  });
  shareStore.delete('page-tok');
});

test('GET /share/:token for an expired link returns 410 with the expired page HTML', async () => {
  shareStore.set('expired-page', { channel: 1, startTime: 'a', endTime: 'b', filePath: null, expiresAt: Date.now() - 1, ttl: 1 });
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/share/expired-page`, { redirect: 'manual' });
    assert.equal(r.status, 410);
    const html = await r.text();
    assert.match(html, /410/);
  });
  shareStore.delete('expired-page');
});
