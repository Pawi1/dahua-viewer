'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { Readable } = require('stream');
const { startTestServer } = require('../../test-support/http');

function makeFakeDahuaApi(handle) {
  return async (opts) => handle(opts);
}

async function withDownloadApp(t, handle, fn) {
  t.mock.module('../../src/services/dahuaApi.js', { exports: { default: makeFakeDahuaApi(handle) } });
  delete require.cache[require.resolve('../../src/routes/download')];
  const downloadRouter = require('../../src/routes/download');

  const app = express();
  app.use('/api/download', downloadRouter);
  const server = await startTestServer(app);
  try {
    await fn(server.baseUrl);
  } finally {
    await server.close();
  }
}

function fakeStreamResponse(content, headers = {}) {
  const stream = Readable.from([Buffer.from(content)]);
  return { headers, data: stream };
}

test('GET with a valid filePath streams the file and sets headers', async (t) => {
  let capturedOpts;
  await withDownloadApp(t, (opts) => {
    capturedOpts = opts;
    return fakeStreamResponse('hello world', { 'content-length': '11' });
  }, async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/download?filePath=${encodeURIComponent('/mnt/dvr/sda0/clip.dav')}`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'application/octet-stream');
    assert.match(r.headers.get('content-disposition'), /filename="clip\.dav"/);
    assert.equal(r.headers.get('content-length'), '11');
    assert.equal(await r.text(), 'hello world');
    assert.match(capturedOpts.url, /RPC_Loadfile\/mnt\/dvr\/sda0\/clip\.dav/);
  });
});

test('GET with an unsafe filePath returns 400', async (t) => {
  await withDownloadApp(t, () => fakeStreamResponse('x'), async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/download?filePath=${encodeURIComponent('/etc/passwd')}`);
    assert.equal(r.status, 400);
  });
});

test('GET with channel/startTime/endTime builds a loadfile.cgi URL and a Polish filename', async (t) => {
  let capturedOpts;
  await withDownloadApp(t, (opts) => {
    capturedOpts = opts;
    return fakeStreamResponse('data');
  }, async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/download?channel=2&startTime=${encodeURIComponent('2026-01-01 10:00:00')}&endTime=${encodeURIComponent('2026-01-01 11:00:00')}`);
    assert.equal(r.status, 200);
    assert.match(capturedOpts.url, /action=startLoad&channel=2/);
    assert.match(capturedOpts.url, /startTime=2026-01-01%2010:00:00/);
    assert.match(r.headers.get('content-disposition'), /nagranie_ch2_2026-01-01-10-00-00\.dav/);
  });
});

test('GET with sample=N truncates endTime to startTime+N seconds and suffixes the filename', async (t) => {
  let capturedOpts;
  await withDownloadApp(t, (opts) => {
    capturedOpts = opts;
    return fakeStreamResponse('data');
  }, async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/download?channel=1&startTime=${encodeURIComponent('2026-01-01 10:00:00')}&sample=90`);
    assert.equal(r.status, 200);
    // 10:00:00 + 90s = 10:01:30
    assert.match(capturedOpts.url, /endTime=2026-01-01%2010:01:30/);
    assert.match(r.headers.get('content-disposition'), /_sample90s\.dav/);
  });
});

test('GET requires channel and startTime when no filePath is given', async (t) => {
  await withDownloadApp(t, () => fakeStreamResponse('x'), async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/download`);
    assert.equal(r.status, 400);
  });
});

test('GET with channel/startTime but no endTime and no sample returns 400', async (t) => {
  await withDownloadApp(t, () => fakeStreamResponse('x'), async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/download?channel=1&startTime=${encodeURIComponent('2026-01-01 10:00:00')}`);
    assert.equal(r.status, 400);
  });
});

test('returns 500 when the NVR call throws before headers are sent', async (t) => {
  await withDownloadApp(t, () => { throw new Error('nvr unreachable'); }, async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/download?filePath=${encodeURIComponent('/mnt/dvr/sda0/a.dav')}`);
    assert.equal(r.status, 500);
    const body = await r.json();
    assert.match(body.error, /nvr unreachable/);
  });
});
