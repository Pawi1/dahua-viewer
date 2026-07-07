'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const go2rtc = require('../../src/services/go2rtcApi');

// go2rtcApi.js hardcodes BASE = 'http://127.0.0.1:1984', so rather than
// mocking the axios package (unreliable here — axios's dual CJS/ESM
// "exports" map doesn't play well with experimental module mocking), stand
// up one real local server on that exact port for the whole file and let
// the real HTTP calls hit it. go2rtc itself isn't installed in this
// environment, so the port is free. A single long-lived server (instead of
// one per test) avoids keep-alive socket reuse races against a closed port.
let currentHandler = () => {};
let server;

test.before(async () => {
  server = http.createServer((req, res) => {
    res.setHeader('Connection', 'close');
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => currentHandler(req, res, body));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(1984, '127.0.0.1', resolve);
  });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('createStream PUTs name/src as query params to go2rtc', async () => {
  let captured;
  currentHandler = (req, res) => {
    captured = { method: req.method, url: req.url };
    res.statusCode = 200;
    res.end();
  };
  await go2rtc.createStream('tok123', 'ffmpeg:rtsp://x#video=h264_480p#hardware');
  assert.equal(captured.method, 'PUT');
  assert.equal(captured.url, '/api/streams?name=tok123&src=ffmpeg%3Artsp%3A%2F%2Fx%23video%3Dh264_480p%23hardware');
});

test('createStream wraps a failed PUT into a descriptive Error', async () => {
  currentHandler = (_req, res) => {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'nope' }));
  };
  await assert.rejects(
    () => go2rtc.createStream('tok', 'src'),
    (err) => {
      assert.match(err.message, /go2rtc PUT \/api\/streams → 500/);
      assert.match(err.message, /nope/);
      return true;
    }
  );
});

test('deleteStream DELETEs by name and swallows errors', async () => {
  let captured;
  currentHandler = (req, res) => {
    captured = { method: req.method, url: req.url };
    res.statusCode = 500;
    res.end('boom');
  };
  // Should not throw even though the server returned an error.
  await go2rtc.deleteStream('tok123');
  assert.equal(captured.method, 'DELETE');
  assert.equal(captured.url, '/api/streams?name=tok123');
});

test('webrtcOffer POSTs the SDP offer and returns the raw answer text', async () => {
  let captured;
  currentHandler = (req, res, body) => {
    captured = { method: req.method, url: req.url, contentType: req.headers['content-type'], body };
    res.statusCode = 200;
    res.end('v=0...answer');
  };
  const answer = await go2rtc.webrtcOffer('tok123', 'v=0...offer');
  assert.equal(answer, 'v=0...answer');
  assert.equal(captured.method, 'POST');
  assert.equal(captured.url, '/api/webrtc?src=tok123');
  assert.equal(captured.contentType, 'text/plain');
  assert.equal(captured.body, 'v=0...offer');
});

test('webrtcOffer propagates a failed POST', async () => {
  currentHandler = (_req, res) => {
    res.statusCode = 500;
    res.end('go2rtc unreachable');
  };
  await assert.rejects(() => go2rtc.webrtcOffer('tok', 'offer'));
});
