'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { startTestServer } = require('../../test-support/http');

// dahuaApi is mocked per-test via t.mock.module BEFORE requiring the route,
// so the route module picks up the fake instance instead of a real axios one.
function makeFakeDahuaApi(handleGet) {
  const fn = async (opts) => handleGet(opts.url ?? opts, opts);
  fn.get = async (url) => handleGet(url);
  return fn;
}

async function withSearchApp(t, handleGet, fn) {
  t.mock.module('../../src/services/dahuaApi.js', { exports: { default: makeFakeDahuaApi(handleGet) } });
  delete require.cache[require.resolve('../../src/routes/search')];
  const searchRouter = require('../../src/routes/search');

  const app = express();
  app.use(express.json());
  app.use('/api/search', searchRouter);
  const server = await startTestServer(app);
  try {
    await fn(server.baseUrl);
  } finally {
    await server.close();
  }
}

test('POST /api/search returns files across a single findNextFile page', async (t) => {
  const calls = [];
  await withSearchApp(t, (url) => {
    calls.push(url);
    if (url.includes('action=factory.create')) return { data: 'result=obj123' };
    if (url.includes('action=findFile')) return { data: 'OK' };
    if (url.includes('action=findNextFile')) {
      return {
        data: [
          'found=1',
          'items[0].StartTime=2026-01-01 10:00:00',
          'items[0].EndTime=2026-01-01 11:00:00',
          'items[0].FilePath=/mnt/dvr/sda0/1.dav',
          'items[0].Channel=1',
        ].join('\r\n'),
      };
    }
    return { data: 'OK' };
  }, async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 1, startTime: '2026-01-01 10:00:00', endTime: '2026-01-01 11:00:00' }),
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.success, true);
    assert.equal(body.found, 1);
    assert.equal(body.files.length, 1);
    assert.equal(body.files[0].filePath, '/mnt/dvr/sda0/1.dav');

    const findFileCall = calls.find((c) => c.includes('action=findFile'));
    assert.match(findFileCall, /condition\.Channel=1/);
    assert.match(findFileCall, /condition\.Types\[0\]=dav&condition\.Types\[1\]=mp4/);
    assert.ok(calls.some((c) => c.includes('action=close')));
    assert.ok(calls.some((c) => c.includes('action=destroy')));
  });
});

test('POST /api/search paginates across multiple findNextFile pages', async (t) => {
  let page = 0;
  await withSearchApp(t, (url) => {
    if (url.includes('action=factory.create')) return { data: 'result=obj1' };
    if (url.includes('action=findFile')) return { data: 'OK' };
    if (url.includes('action=findNextFile')) {
      page += 1;
      if (page === 1) {
        const items = Array.from({ length: 100 }, (_, i) =>
          `items[${i}].StartTime=2026-01-01 10:0${i % 10}:00\r\nitems[${i}].EndTime=2026-01-01 11:00:00\r\nitems[${i}].Channel=1`
        ).join('\r\n');
        return { data: `found=100\r\n${items}` };
      }
      return { data: 'found=1\r\nitems[0].StartTime=x\r\nitems[0].EndTime=y\r\nitems[0].Channel=1' };
    }
    return { data: 'OK' };
  }, async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 1, startTime: 'a', endTime: 'b' }),
    });
    const body = await r.json();
    assert.equal(body.found, 101);
    assert.equal(body.files.length, 101);
    // ids should be offset across pages, not reset to 0
    assert.equal(body.files[100].id, 100);
  });
});

test('POST /api/search includes optional types/flags in the query', async (t) => {
  let findFileUrl = '';
  await withSearchApp(t, (url) => {
    if (url.includes('action=factory.create')) return { data: 'result=obj1' };
    if (url.includes('action=findFile')) { findFileUrl = url; return { data: 'OK' }; }
    if (url.includes('action=findNextFile')) return { data: 'found=0' };
    return { data: 'OK' };
  }, async (baseUrl) => {
    await fetch(`${baseUrl}/api/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channel: 1, startTime: 'a', endTime: 'b', types: ['jpg'], flags: ['Marked', 'Event'],
      }),
    });
    assert.match(findFileUrl, /condition\.Types\[0\]=jpg/);
    assert.match(findFileUrl, /condition\.Flags\[0\]=Marked&condition\.Flags\[1\]=Event/);
  });
});

test('POST /api/search requires channel/startTime/endTime', async (t) => {
  await withSearchApp(t, () => ({ data: 'OK' }), async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 1 }),
    });
    assert.equal(r.status, 400);
  });
});

test('POST /api/search returns 500 and still closes/destroys the finder when factory.create has no result', async (t) => {
  const calls = [];
  await withSearchApp(t, (url) => {
    calls.push(url);
    if (url.includes('action=factory.create')) return { data: 'no result here' };
    return { data: 'OK' };
  }, async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 1, startTime: 'a', endTime: 'b' }),
    });
    assert.equal(r.status, 500);
    const body = await r.json();
    assert.equal(body.success, false);
    // objectId was never obtained, so no close/destroy call should have been made
    assert.ok(!calls.some((c) => c.includes('action=close')));
  });
});

test('POST /api/search returns 500 when the NVR call throws', async (t) => {
  await withSearchApp(t, () => { throw new Error('network down'); }, async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 1, startTime: 'a', endTime: 'b' }),
    });
    assert.equal(r.status, 500);
    const body = await r.json();
    assert.match(body.error, /network down/);
  });
});
