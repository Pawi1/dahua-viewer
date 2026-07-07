'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const streamStore = require('../../src/services/streamStore');

test('streamStore is a plain Map used to track active streams', () => {
  assert.ok(streamStore instanceof Map);
  const job = { rtspUrl: 'rtsp://x', startedAt: Date.now(), endedAt: null, logDesc: 'ch1' };
  streamStore.set('tok', job);
  assert.deepEqual(streamStore.get('tok'), job);
  streamStore.delete('tok');
  assert.equal(streamStore.get('tok'), undefined);
});
