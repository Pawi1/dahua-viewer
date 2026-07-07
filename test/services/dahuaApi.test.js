'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const dApi = require('../../src/services/dahuaApi');
const cfg = require('../../src/config');

test('dahuaApi is an axios instance pointed at the configured NVR host/port', () => {
  assert.equal(dApi.defaults.baseURL, `http://${cfg.nvrHost}:${cfg.nvrPort}`);
  assert.equal(dApi.defaults.timeout, 15000);
});

test('dahuaApi has the Digest Auth response interceptor attached', () => {
  // addDigestAuth() registers a rejected-handler on interceptors.response;
  // its own retry logic is covered directly in middleware/digestAuth.test.js.
  assert.ok(dApi.interceptors.response.handlers.length >= 1);
});
