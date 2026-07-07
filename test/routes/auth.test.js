'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const authRouter = require('../../src/routes/auth');
const cfg = require('../../src/config');
const shareStore = require('../../src/services/shareStore');
const { startTestServer } = require('../../test-support/http');

function sessionCookieFrom(res) {
  const setCookie = res.headers.get('set-cookie') || '';
  const match = setCookie.match(/session_id=([^;]+)/);
  return match ? `session_id=${match[1]}` : '';
}

async function withApp(fn) {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api/auth', authRouter);
  const server = await startTestServer(app);
  try {
    await fn(server.baseUrl);
  } finally {
    await server.close();
  }
}

test('GET /check with no cookie reports unauthenticated', async () => {
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/auth/check`);
    assert.deepEqual(await r.json(), { authenticated: false });
  });
});

test('POST /login with correct credentials creates a full session cookie', async () => {
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: cfg.nvrUser, password: cfg.nvrPass }),
    });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { success: true });
    const cookie = sessionCookieFrom(r);
    assert.ok(cookie);

    const check = await fetch(`${baseUrl}/api/auth/check`, { headers: { cookie } });
    assert.deepEqual(await check.json(), { authenticated: true, type: 'full' });
  });
});

test('POST /login with wrong credentials returns 401 and no cookie', async () => {
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'nope', password: 'nope' }),
    });
    assert.equal(r.status, 401);
    assert.equal(r.headers.get('set-cookie'), null);
  });
});

test('POST /logout clears the session so /check reports unauthenticated again', async () => {
  await withApp(async (baseUrl) => {
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: cfg.nvrUser, password: cfg.nvrPass }),
    });
    const cookie = sessionCookieFrom(login);

    await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { cookie } });
    const check = await fetch(`${baseUrl}/api/auth/check`, { headers: { cookie } });
    assert.deepEqual(await check.json(), { authenticated: false });
  });
});

test('POST /share with a valid token creates a scoped share session', async () => {
  const expiresAt = Date.now() + 60_000;
  shareStore.set('valid-token', {
    channel: 5, startTime: '2026-01-01 10:00:00', endTime: '2026-01-01 11:00:00', filePath: null, expiresAt, ttl: 1,
  });
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/auth/share?token=valid-token`, { method: 'POST' });
    assert.equal(r.status, 200);
    assert.ok(sessionCookieFrom(r));
  });
  shareStore.delete('valid-token');
});

test('POST /share with an expired token returns 410', async () => {
  shareStore.set('expired-token', {
    channel: 1, startTime: 'a', endTime: 'b', filePath: null, expiresAt: Date.now() - 1000, ttl: 1,
  });
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/auth/share?token=expired-token`, { method: 'POST' });
    assert.equal(r.status, 410);
  });
  shareStore.delete('expired-token');
});

test('POST /share with a missing token returns 410', async () => {
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/auth/share`, { method: 'POST' });
    assert.equal(r.status, 410);
  });
});
