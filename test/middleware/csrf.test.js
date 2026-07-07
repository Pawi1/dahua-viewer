'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const csrfGuard = require('../../src/middleware/csrf');
const { startTestServer } = require('../../test-support/http');

async function withApp(fn) {
  const app = express();
  app.use(csrfGuard);
  app.all('/x', (_req, res) => res.json({ ok: true }));
  const server = await startTestServer(app);
  try {
    await fn(server.baseUrl);
  } finally {
    await server.close();
  }
}

test('safe methods (GET) are never blocked', async () => {
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/x`, { headers: { 'sec-fetch-site': 'cross-site' } });
    assert.equal(r.status, 200);
  });
});

test('POST with Sec-Fetch-Site: cross-site is rejected', async () => {
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/x`, { method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } });
    assert.equal(r.status, 403);
  });
});

test('POST with Sec-Fetch-Site: same-origin is allowed', async () => {
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/x`, { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' } });
    assert.equal(r.status, 200);
  });
});

test('POST with Sec-Fetch-Site: none is allowed (e.g. address-bar navigation)', async () => {
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/x`, { method: 'POST', headers: { 'sec-fetch-site': 'none' } });
    assert.equal(r.status, 200);
  });
});

test('POST with a mismatched Origin header is rejected', async () => {
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/x`, { method: 'POST', headers: { origin: 'http://evil.example' } });
    assert.equal(r.status, 403);
  });
});

test('POST with a matching Origin header is allowed', async () => {
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/x`, { method: 'POST', headers: { origin: baseUrl } });
    assert.equal(r.status, 200);
  });
});

test('POST with neither header present is allowed (non-browser client)', async () => {
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/x`, { method: 'POST' });
    assert.equal(r.status, 200);
  });
});
