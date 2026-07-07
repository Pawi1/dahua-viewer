'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { genToken } = require('../../src/utils/tokens');

test('genToken returns a hex string of the requested byte length', () => {
  const t = genToken(16);
  assert.match(t, /^[0-9a-f]+$/);
  assert.equal(t.length, 32);
});

test('genToken defaults to 24 bytes', () => {
  const t = genToken();
  assert.equal(t.length, 48);
});

test('genToken returns different values on each call', () => {
  const a = genToken(16);
  const b = genToken(16);
  assert.notEqual(a, b);
});
