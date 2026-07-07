'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cfg = require('../../src/config');
const { startTestServer } = require('../../test-support/http');

function makeFakeDahuaApi(handleGet) {
  return { get: async (url) => handleGet(url) };
}

async function withNvrApp(t, handleGet, fn) {
  t.mock.module('../../src/services/dahuaApi.js', { exports: { default: makeFakeDahuaApi(handleGet) } });
  delete require.cache[require.resolve('../../src/routes/nvr')];
  const nvrRouter = require('../../src/routes/nvr');

  const app = express();
  app.use('/api/nvr', nvrRouter);
  const server = await startTestServer(app);
  try {
    await fn(server.baseUrl);
  } finally {
    await server.close();
  }
}

test('GET /info parses the key=value system info response', async (t) => {
  await withNvrApp(t, () => ({ data: 'deviceType=NVR5216\r\nupdateSerial=X123' }), async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/nvr/info`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.success, true);
    assert.equal(body.info.deviceType, 'NVR5216');
    assert.equal(body.info.updateSerial, 'X123');
  });
});

test('GET /info returns 500 when the NVR call fails', async (t) => {
  await withNvrApp(t, () => { throw new Error('unreachable'); }, async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/nvr/info`);
    assert.equal(r.status, 500);
  });
});

test('GET /time returns the parsed current time', async (t) => {
  await withNvrApp(t, () => ({ data: 'result=2026-05-29 14:23:11' }), async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/nvr/time`);
    const body = await r.json();
    assert.equal(body.success, true);
    assert.equal(body.time, '2026-05-29 14:23:11');
  });
});

test('GET /time returns 500 when the NVR call fails', async (t) => {
  await withNvrApp(t, () => { throw new Error('down'); }, async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/nvr/time`);
    assert.equal(r.status, 500);
  });
});

test('GET /channels returns the count parsed from the NVR response', async (t) => {
  await withNvrApp(t, () => ({ data: 'count=8\r\nother=x' }), async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/nvr/channels`);
    const body = await r.json();
    assert.deepEqual(body, { success: true, count: 8 });
  });
});

test('GET /channels falls back to cfg.channels when the NVR call throws', async (t) => {
  await withNvrApp(t, () => { throw new Error('down'); }, async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/nvr/channels`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.deepEqual(body, { success: true, count: cfg.channels });
  });
});

test('GET /channels falls back to cfg.channels when the response has no count', async (t) => {
  await withNvrApp(t, () => ({ data: 'nothing=here' }), async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/nvr/channels`);
    const body = await r.json();
    assert.deepEqual(body, { success: true, count: cfg.channels });
  });
});
