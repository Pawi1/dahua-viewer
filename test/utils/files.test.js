'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sanitizeNvrPath, fileSize, sleep, waitForFileBytes } = require('../../src/utils/files');

test('sanitizeNvrPath accepts a realistic Dahua recording path', () => {
  const p = '/mnt/dvr/sda0/2010/8/11/dav/15:40:50.jpg';
  assert.equal(sanitizeNvrPath(p), p);
});

test('sanitizeNvrPath rejects absolute paths outside /mnt/', () => {
  assert.equal(sanitizeNvrPath('/etc/passwd'), null);
});

test('sanitizeNvrPath rejects any path containing ..', () => {
  assert.equal(sanitizeNvrPath('/mnt/dvr/../../etc/passwd'), null);
  assert.equal(sanitizeNvrPath('/mnt/../etc/passwd'), null);
});

test('sanitizeNvrPath rejects characters outside the allow-list', () => {
  assert.equal(sanitizeNvrPath('/mnt/dvr/sda0/1.dav?x=y'), null);
  assert.equal(sanitizeNvrPath('/mnt/dvr/sda0/1.dav; rm -rf /'), null);
});

test('sanitizeNvrPath rejects non-string / empty input', () => {
  assert.equal(sanitizeNvrPath(''), null);
  assert.equal(sanitizeNvrPath(null), null);
  assert.equal(sanitizeNvrPath(undefined), null);
  assert.equal(sanitizeNvrPath(42), null);
});

test('fileSize returns 0 for a nonexistent file', () => {
  assert.equal(fileSize('/nonexistent/path/for/sure'), 0);
});

test('fileSize returns the real size of an existing file', () => {
  const tmp = path.join(os.tmpdir(), `dahua-viewer-test-${Date.now()}.bin`);
  fs.writeFileSync(tmp, Buffer.alloc(1234));
  try {
    assert.equal(fileSize(tmp), 1234);
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('sleep resolves after roughly the given delay', async () => {
  const start = Date.now();
  await sleep(30);
  assert.ok(Date.now() - start >= 25);
});

test('waitForFileBytes resolves true once the file reaches the target size', async () => {
  const tmp = path.join(os.tmpdir(), `dahua-viewer-test-${Date.now()}-2.bin`);
  fs.writeFileSync(tmp, Buffer.alloc(10));
  try {
    const result = await waitForFileBytes(tmp, 5, 1000);
    assert.equal(result, true);
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('waitForFileBytes resolves false on timeout when the file never reaches the target size', async () => {
  const tmp = path.join(os.tmpdir(), `dahua-viewer-test-${Date.now()}-3.bin`);
  fs.writeFileSync(tmp, Buffer.alloc(1));
  try {
    const result = await waitForFileBytes(tmp, 1000, 200);
    assert.equal(result, false);
  } finally {
    fs.unlinkSync(tmp);
  }
});
