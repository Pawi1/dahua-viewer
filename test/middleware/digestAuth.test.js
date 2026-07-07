'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const addDigestAuth = require('../../src/middleware/digestAuth');

// Builds a fake axios-like instance: callable (for the retry) and exposing
// interceptors.response.use() the same way axios.create() does.
function makeFakeAxiosInstance() {
  const calls = [];
  const inst = async (cfg) => {
    calls.push(cfg);
    return { data: 'retried', config: cfg };
  };
  inst.interceptors = {
    response: {
      use(_onFulfilled, onRejected) {
        inst._rejected = onRejected;
      },
    },
  };
  inst.calls = calls;
  return inst;
}

test('non-401 errors are passed through unchanged', async () => {
  const inst = makeFakeAxiosInstance();
  addDigestAuth(inst, 'admin', 'admin');
  const error = { config: {}, response: { status: 500, headers: {} } };
  await assert.rejects(() => inst._rejected(error), (e) => e === error);
});

test('a 401 without a Digest WWW-Authenticate header is passed through unchanged', async () => {
  const inst = makeFakeAxiosInstance();
  addDigestAuth(inst, 'admin', 'admin');
  const error = { config: {}, response: { status: 401, headers: { 'www-authenticate': 'Basic realm="x"' } } };
  await assert.rejects(() => inst._rejected(error), (e) => e === error);
});

test('a 401 is not retried twice (_digestRetry guard)', async () => {
  const inst = makeFakeAxiosInstance();
  addDigestAuth(inst, 'admin', 'admin');
  const error = {
    config: { _digestRetry: true },
    response: { status: 401, headers: { 'www-authenticate': 'Digest realm="x", nonce="y"' } },
  };
  await assert.rejects(() => inst._rejected(error), (e) => e === error);
});

test('a valid Digest challenge (with qop) retries with a correctly computed Authorization header', async () => {
  const inst = makeFakeAxiosInstance();
  addDigestAuth(inst, 'admin', 'secret');

  const wwwAuth = 'Digest realm="NVR", nonce="abc123", qop="auth", opaque="op123"';
  const error = {
    config: { url: '/cgi-bin/magicBox.cgi?action=getSystemInfo', method: 'get', headers: {} },
    response: { status: 401, headers: { 'www-authenticate': wwwAuth } },
  };

  const result = await inst._rejected(error);
  assert.equal(result.data, 'retried');
  assert.equal(inst.calls.length, 1);

  const sentCfg = inst.calls[0];
  assert.equal(sentCfg._digestRetry, true);
  const auth = sentCfg.headers.Authorization;
  assert.match(auth, /^Digest username="admin", realm="NVR", nonce="abc123", uri="\/cgi-bin\/magicBox\.cgi\?action=getSystemInfo", algorithm=MD5, qop=auth, nc=00000001, cnonce="[0-9a-f]{8}", response="[0-9a-f]{32}", opaque="op123"$/);

  // Recompute the expected response hash independently and check it matches
  const ha1 = crypto.createHash('md5').update('admin:NVR:secret').digest('hex');
  const ha2 = crypto.createHash('md5').update('GET:/cgi-bin/magicBox.cgi?action=getSystemInfo').digest('hex');
  const cnonce = auth.match(/cnonce="([0-9a-f]+)"/)[1];
  const expectedResponse = crypto.createHash('md5').update(`${ha1}:abc123:00000001:${cnonce}:auth:${ha2}`).digest('hex');
  assert.match(auth, new RegExp(`response="${expectedResponse}"`));
});

test('a Digest challenge without qop uses the simpler RFC2069-style response hash and omits qop/nc/cnonce', async () => {
  const inst = makeFakeAxiosInstance();
  addDigestAuth(inst, 'admin', 'secret');

  const wwwAuth = 'Digest realm="NVR", nonce="xyz789"';
  const error = {
    config: { url: '/cgi-bin/x.cgi', method: 'get', headers: {} },
    response: { status: 401, headers: { 'www-authenticate': wwwAuth } },
  };

  await inst._rejected(error);
  const auth = inst.calls[0].headers.Authorization;
  assert.doesNotMatch(auth, /qop=|cnonce=|nc=/);
  assert.doesNotMatch(auth, /opaque=/);

  const ha1 = crypto.createHash('md5').update('admin:NVR:secret').digest('hex');
  const ha2 = crypto.createHash('md5').update('GET:/cgi-bin/x.cgi').digest('hex');
  const expectedResponse = crypto.createHash('md5').update(`${ha1}:xyz789:${ha2}`).digest('hex');
  assert.match(auth, new RegExp(`response="${expectedResponse}"`));
});

test('builds the request URI from baseURL + url when url is relative', async () => {
  const inst = makeFakeAxiosInstance();
  addDigestAuth(inst, 'admin', 'secret');

  const error = {
    config: { url: '/cgi-bin/x.cgi', baseURL: 'http://192.168.1.108:80', method: 'get', headers: {} },
    response: { status: 401, headers: { 'www-authenticate': 'Digest realm="NVR", nonce="n"' } },
  };

  await inst._rejected(error);
  const auth = inst.calls[0].headers.Authorization;
  assert.match(auth, /uri="\/cgi-bin\/x\.cgi"/);
});

test('resumes a paused response stream before retrying, when present', async () => {
  const inst = makeFakeAxiosInstance();
  addDigestAuth(inst, 'admin', 'secret');

  let resumed = false;
  const error = {
    config: { url: '/x', method: 'get', headers: {} },
    response: {
      status: 401,
      headers: { 'www-authenticate': 'Digest realm="NVR", nonce="n"' },
      data: { resume: () => { resumed = true; } },
    },
  };

  await inst._rejected(error);
  assert.equal(resumed, true);
});
