'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { setImmediate: realSetImmediate } = require('timers');
const shareStore = require('../../src/services/shareStore');
const streamStore = require('../../src/services/streamStore');
const sessions = require('../../src/services/sessionStore');

async function flush() {
  // let pending microtasks/awaits inside the interval callback settle —
  // setImmediate itself isn't part of the faked timer APIs below.
  await new Promise((r) => realSetImmediate(r));
  await new Promise((r) => realSetImmediate(r));
}

async function withCleanupJob(t, go2rtcImpl, fn) {
  t.mock.module('../../src/services/go2rtcApi.js', { exports: { default: go2rtcImpl } });
  delete require.cache[require.resolve('../../src/jobs/cleanup')];
  const startCleanupJob = require('../../src/jobs/cleanup');

  t.mock.timers.enable({ apis: ['setInterval'] });
  startCleanupJob();
  try {
    await fn();
  } finally {
    t.mock.timers.reset();
  }
}

test('drops expired share links but keeps valid ones', async (t) => {
  shareStore.set('expired', { channel: 1, startTime: 'a', endTime: 'b', filePath: null, expiresAt: Date.now() - 1000, ttl: 1 });
  shareStore.set('valid',   { channel: 1, startTime: 'a', endTime: 'b', filePath: null, expiresAt: Date.now() + 60_000, ttl: 1 });

  await withCleanupJob(t, {}, async () => {
    t.mock.timers.tick(15_000);
    await flush();
  });

  assert.equal(shareStore.get('expired'), undefined);
  assert.ok(shareStore.get('valid'));
  shareStore.delete('valid');
});

test('runs sessionStore.cleanup() so expired sessions do not linger', async (t) => {
  const expiredId = sessions.create('full', 10);
  await new Promise((r) => setTimeout(r, 20));

  await withCleanupJob(t, {}, async () => {
    t.mock.timers.tick(15_000);
    await flush();
  });

  // Already removed by cleanup(); get() would also lazily remove it, so
  // this only proves something ran, not which path removed it. Combined
  // with the sessionStore unit test's direct cleanup() call, this covers
  // the wiring from jobs/cleanup.js.
  assert.equal(sessions.get(expiredId), null);
});

test('drops ended streams from memory once older than the 2h retention window', async (t) => {
  streamStore.set('old-ended', {
    rtspUrl: 'x', startedAt: Date.now() - 3 * 60 * 60 * 1000, endedAt: Date.now() - 3 * 60 * 60 * 1000, logDesc: 'x',
  });
  streamStore.set('recently-ended', {
    rtspUrl: 'x', startedAt: Date.now() - 1000, endedAt: Date.now() - 1000, logDesc: 'x',
  });

  await withCleanupJob(t, {}, async () => {
    t.mock.timers.tick(15_000);
    await flush();
  });

  assert.equal(streamStore.get('old-ended'), undefined);
  assert.ok(streamStore.get('recently-ended'));
  streamStore.delete('recently-ended');
});

test('kills active streams whose heartbeat is stale, via go2rtc.deleteStream', async (t) => {
  streamStore.set('stale', {
    rtspUrl: 'x', startedAt: Date.now() - 120_000, endedAt: null, logDesc: 'x', lastHeartbeat: Date.now() - 120_000,
  });
  streamStore.set('fresh', {
    rtspUrl: 'x', startedAt: Date.now(), endedAt: null, logDesc: 'x', lastHeartbeat: Date.now(),
  });

  const deletedTokens = [];
  await withCleanupJob(t, { deleteStream: async (token) => { deletedTokens.push(token); } }, async () => {
    t.mock.timers.tick(15_000);
    await flush();
  });

  assert.deepEqual(deletedTokens, ['stale']);
  assert.ok(streamStore.get('stale').endedAt);
  assert.equal(streamStore.get('fresh').endedAt, null);
  streamStore.delete('stale');
  streamStore.delete('fresh');
});

test('falls back to startedAt when a stream never received a heartbeat', async (t) => {
  streamStore.set('never-pinged', {
    rtspUrl: 'x', startedAt: Date.now() - 120_000, endedAt: null, logDesc: 'x',
  });

  const deletedTokens = [];
  await withCleanupJob(t, { deleteStream: async (token) => { deletedTokens.push(token); } }, async () => {
    t.mock.timers.tick(15_000);
    await flush();
  });

  assert.deepEqual(deletedTokens, ['never-pinged']);
  streamStore.delete('never-pinged');
});
