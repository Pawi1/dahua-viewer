'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const csrfGuard = require('../../src/middleware/csrf');
const { startTestServer } = require('../../test-support/http');

async function withApp(fn) {
  const app = express();
  app.use(cookieParser());
  app.use(csrfGuard);
  app.all('/x', (_req, res) => res.json({ ok: true }));
  const server = await startTestServer(app);
  try {
    await fn(server.baseUrl);
  } finally {
    await server.close();
  }
}

function csrfCookieFrom(res) {
  const setCookie = res.headers.get('set-cookie') || '';
  const match = setCookie.match(/csrfToken=([^;]+)/);
  return match ? match[1] : null;
}

async function getCsrfToken(baseUrl) {
  const r = await fetch(`${baseUrl}/x`);
  const token = csrfCookieFrom(r);
  assert.ok(token, 'expected a csrfToken cookie to be issued on GET');
  return token;
}

test('a GET request issues a csrfToken cookie when none is present yet', async () => {
  await withApp(async (baseUrl) => {
    const token = await getCsrfToken(baseUrl);
    assert.match(token, /^[0-9a-f]{40}$/);
  });
});

test('a request that already has a csrfToken cookie does not get a new one', async () => {
  await withApp(async (baseUrl) => {
    const token = await getCsrfToken(baseUrl);
    const r2 = await fetch(`${baseUrl}/x`, { headers: { cookie: `csrfToken=${token}` } });
    assert.equal(r2.headers.get('set-cookie'), null);
  });
});

test('safe methods (GET) are never blocked, even cross-site', async () => {
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/x`, { headers: { 'sec-fetch-site': 'cross-site' } });
    assert.equal(r.status, 200);
  });
});

test('POST with Sec-Fetch-Site: cross-site is rejected before the token is even checked', async () => {
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/x`, { method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } });
    assert.equal(r.status, 403);
  });
});

test('POST with a mismatched Origin header is rejected', async () => {
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/x`, { method: 'POST', headers: { origin: 'http://evil.example' } });
    assert.equal(r.status, 403);
  });
});

test('POST with a same-origin Origin/Sec-Fetch-Site but no CSRF token is rejected', async () => {
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/x`, {
      method: 'POST',
      headers: { 'sec-fetch-site': 'same-origin' },
    });
    assert.equal(r.status, 403);
    const body = await r.json();
    assert.match(body.error, /CSRF/);
  });
});

test('POST with a csrfToken cookie but a missing X-CSRF-Token header is rejected', async () => {
  await withApp(async (baseUrl) => {
    const token = await getCsrfToken(baseUrl);
    const r = await fetch(`${baseUrl}/x`, {
      method: 'POST',
      headers: { cookie: `csrfToken=${token}`, 'sec-fetch-site': 'same-origin' },
    });
    assert.equal(r.status, 403);
  });
});

test('POST with a header token that does not match the cookie is rejected', async () => {
  await withApp(async (baseUrl) => {
    const token = await getCsrfToken(baseUrl);
    const r = await fetch(`${baseUrl}/x`, {
      method: 'POST',
      headers: { cookie: `csrfToken=${token}`, 'x-csrf-token': 'not-the-real-token', 'sec-fetch-site': 'same-origin' },
    });
    assert.equal(r.status, 403);
  });
});

test('POST with a matching cookie + header CSRF token is allowed', async () => {
  await withApp(async (baseUrl) => {
    const token = await getCsrfToken(baseUrl);
    const r = await fetch(`${baseUrl}/x`, {
      method: 'POST',
      headers: { cookie: `csrfToken=${token}`, 'x-csrf-token': token, 'sec-fetch-site': 'same-origin' },
    });
    assert.equal(r.status, 200);
  });
});

test('POST with neither Origin nor Sec-Fetch-Site but a matching token is allowed (non-browser client with the token)', async () => {
  await withApp(async (baseUrl) => {
    const token = await getCsrfToken(baseUrl);
    const r = await fetch(`${baseUrl}/x`, {
      method: 'POST',
      headers: { cookie: `csrfToken=${token}`, 'x-csrf-token': token },
    });
    assert.equal(r.status, 200);
  });
});
