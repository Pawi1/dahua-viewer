'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const shareStore = require('../../src/services/shareStore');

test('shareStore behaves like a Map for set/get/delete', () => {
  const link = { channel: 1, startTime: 'a', endTime: 'b', filePath: null, expiresAt: Date.now() + 60_000, ttl: 1 };
  shareStore.set('tok1', link);
  assert.deepEqual(shareStore.get('tok1'), link);
  shareStore.delete('tok1');
  assert.equal(shareStore.get('tok1'), undefined);
});

test('getValid returns the link when it exists and has not expired', () => {
  const link = { channel: 2, startTime: 'a', endTime: 'b', filePath: null, expiresAt: Date.now() + 60_000, ttl: 1 };
  shareStore.set('tok2', link);
  assert.deepEqual(shareStore.getValid('tok2'), link);
  shareStore.delete('tok2');
});

test('getValid returns null for a missing token', () => {
  assert.equal(shareStore.getValid('does-not-exist'), null);
});

test('getValid returns null for a falsy token without touching the store', () => {
  assert.equal(shareStore.getValid(undefined), null);
  assert.equal(shareStore.getValid(''), null);
});

test('getValid returns null once the link has expired', () => {
  const link = { channel: 1, startTime: 'a', endTime: 'b', filePath: null, expiresAt: Date.now() - 1000, ttl: 1 };
  shareStore.set('tok3', link);
  assert.equal(shareStore.getValid('tok3'), null);
  shareStore.delete('tok3');
});
