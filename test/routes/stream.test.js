'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const streamStore = require('../../src/services/streamStore');
const { startTestServer } = require('../../test-support/http');

function makeFakeGo2rtc({ onCreate, onDelete, onOffer } = {}) {
  return {
    async createStream(name, src) {
      if (onCreate) return onCreate(name, src);
    },
    async deleteStream(name) {
      if (onDelete) return onDelete(name);
    },
    async webrtcOffer(name, sdp) {
      if (onOffer) return onOffer(name, sdp);
      return 'sdp-answer';
    },
  };
}

async function withStreamApp(t, go2rtcImpl, fn) {
  t.mock.module('../../src/services/go2rtcApi.js', { exports: { default: go2rtcImpl } });
  delete require.cache[require.resolve('../../src/routes/stream')];
  const streamRouter = require('../../src/routes/stream');

  const app = express();
  app.use(express.json());
  app.use('/api/stream', streamRouter);
  const server = await startTestServer(app);
  try {
    await fn(server.baseUrl);
  } finally {
    await server.close();
  }
}

test('POST /start with channel/startTime/endTime builds an RTSP src and registers the stream', async (t) => {
  let capturedSrc = '';
  await withStreamApp(t, makeFakeGo2rtc({ onCreate: (_name, src) => { capturedSrc = src; } }), async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/stream/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 3, startTime: '2026-01-01 10:00:00', endTime: '2026-01-01 11:00:00' }),
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.success, true);
    assert.ok(body.token);

    assert.match(capturedSrc, /^ffmpeg:rtsp:\/\//);
    assert.match(capturedSrc, /channel=3/);
    assert.match(capturedSrc, /starttime=2026_01_01_10_00_00/);
    assert.match(capturedSrc, /#video=h264_480p#hardware$/);

    const job = streamStore.get(body.token);
    assert.ok(job);
    assert.equal(job.endedAt, null);
    streamStore.delete(body.token);
  });
});

test('POST /start honors the resolution param', async (t) => {
  let capturedSrc = '';
  await withStreamApp(t, makeFakeGo2rtc({ onCreate: (_n, src) => { capturedSrc = src; } }), async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/stream/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 1, startTime: 'a', endTime: 'b', resolution: '1080p' }),
    });
    const body = await r.json();
    assert.match(capturedSrc, /#video=h264_1080p#hardware$/);
    streamStore.delete(body.token);
  });
});

test('POST /start with a valid filePath uses RPC_Loadfile', async (t) => {
  let capturedSrc = '';
  await withStreamApp(t, makeFakeGo2rtc({ onCreate: (_n, src) => { capturedSrc = src; } }), async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/stream/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filePath: '/mnt/dvr/sda0/1.dav' }),
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.match(capturedSrc, /RPC_Loadfile\/mnt\/dvr\/sda0\/1\.dav/);
    streamStore.delete(body.token);
  });
});

test('POST /start rejects an unsafe filePath with 400', async (t) => {
  await withStreamApp(t, makeFakeGo2rtc(), async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/stream/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filePath: '/etc/passwd' }),
    });
    assert.equal(r.status, 400);
  });
});

test('POST /start with neither channel/time nor filePath returns 400', async (t) => {
  await withStreamApp(t, makeFakeGo2rtc(), async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/stream/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(r.status, 400);
  });
});

test('POST /start returns 500 when go2rtc.createStream throws', async (t) => {
  await withStreamApp(t, makeFakeGo2rtc({ onCreate: () => { throw new Error('go2rtc down'); } }), async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/stream/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 1, startTime: 'a', endTime: 'b' }),
    });
    assert.equal(r.status, 500);
  });
});

test('POST /offer returns 404 for an unknown token', async (t) => {
  await withStreamApp(t, makeFakeGo2rtc(), async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/stream/offer?token=nope`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'sdp-offer-body',
    });
    assert.equal(r.status, 404);
  });
});

test('POST /offer forwards the SDP offer and returns the answer for a known token', async (t) => {
  streamStore.set('tok-offer', { rtspUrl: 'x', startedAt: Date.now(), endedAt: null, logDesc: 'x' });
  let received;
  await withStreamApp(t, makeFakeGo2rtc({ onOffer: (name, sdp) => { received = { name, sdp }; return 'answer-sdp'; } }), async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/stream/offer?token=tok-offer`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'v=0...',
    });
    assert.equal(r.status, 200);
    assert.equal(await r.text(), 'answer-sdp');
    assert.equal(received.name, 'tok-offer');
    assert.equal(received.sdp, 'v=0...');
  });
  streamStore.delete('tok-offer');
});

test('POST /offer returns 500 when go2rtc.webrtcOffer throws', async (t) => {
  streamStore.set('tok-offer-fail', { rtspUrl: 'x', startedAt: Date.now(), endedAt: null, logDesc: 'x' });
  await withStreamApp(t, makeFakeGo2rtc({ onOffer: () => { throw new Error('boom'); } }), async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/stream/offer?token=tok-offer-fail`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'x',
    });
    assert.equal(r.status, 500);
  });
  streamStore.delete('tok-offer-fail');
});

test('POST /heartbeat updates lastHeartbeat for an active stream and reports ok:false otherwise', async (t) => {
  streamStore.set('tok-hb', { rtspUrl: 'x', startedAt: Date.now(), endedAt: null, logDesc: 'x' });
  await withStreamApp(t, makeFakeGo2rtc(), async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/stream/heartbeat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'tok-hb' }),
    });
    assert.deepEqual(await r.json(), { ok: true });
    assert.ok(streamStore.get('tok-hb').lastHeartbeat);

    const r2 = await fetch(`${baseUrl}/api/stream/heartbeat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'unknown' }),
    });
    assert.deepEqual(await r2.json(), { ok: false });
  });
  streamStore.delete('tok-hb');
});

test('POST /stop deletes the go2rtc stream and marks the job ended', async (t) => {
  streamStore.set('tok-stop', { rtspUrl: 'x', startedAt: Date.now(), endedAt: null, logDesc: 'x' });
  let deletedName = null;
  await withStreamApp(t, makeFakeGo2rtc({ onDelete: (name) => { deletedName = name; } }), async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/stream/stop`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'tok-stop' }),
    });
    assert.deepEqual(await r.json(), { success: true });
    assert.equal(deletedName, 'tok-stop');
    assert.ok(streamStore.get('tok-stop').endedAt);
  });
  streamStore.delete('tok-stop');
});

test('POST /stop on an unknown token is a no-op success (e.g. sendBeacon after GC already cleaned it up)', async (t) => {
  await withStreamApp(t, makeFakeGo2rtc(), async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/stream/stop`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'never-existed' }),
    });
    assert.deepEqual(await r.json(), { success: true });
  });
});
